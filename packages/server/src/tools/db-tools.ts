import { getDb, getTableSchema, getAllSchemas, logChange, writeJournal } from '../db';
import { executeBefore, executeAfter } from '../engine/rule-engine';
import { applyAutoNumbers } from '../engine/auto-number-engine';
import type { AgentResult } from '../types';

const ALLOWED_TYPES = new Set(['TEXT', 'INTEGER', 'REAL', 'BLOB', 'BOOLEAN', 'DATE', 'DATETIME']);
const FORBIDDEN_TABLE_PREFIXES = ['_zenku_', 'sqlite_'];

function isSafeTableName(name: string): boolean {
  if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(name)) return false;
  if (FORBIDDEN_TABLE_PREFIXES.some(p => name.toLowerCase().startsWith(p))) return false;
  return true;
}

function isSafeFieldName(name: string): boolean {
  return /^[a-zA-Z_][a-zA-Z0-9_]*$/.test(name);
}

interface ReferenceDef {
  table: string;
  column?: string;
}

interface ColumnInput {
  name: string;
  type: string;
  required?: boolean;
  default_value?: string;
  options?: string[];
  references?: ReferenceDef;
}

export function createTable(
  tableName: string,
  columns: ColumnInput[],
  userRequest: string
): AgentResult {
  if (!isSafeTableName(tableName)) {
    return { success: false, message: `Invalid table name: ${tableName}` };
  }

  const db = getDb();

  const existing = db.prepare(
    `SELECT name FROM sqlite_master WHERE type='table' AND name=?`
  ).get(tableName);
  if (existing) {
    return { success: false, message: `Table ${tableName} already exists` };
  }

  const RESERVED = new Set(['id', 'created_at', 'updated_at']);
  columns = columns.filter(col => !RESERVED.has(col.name.toLowerCase()));

  const colDefs = columns.map(col => {
    const type = col.type.toUpperCase();
    if (!ALLOWED_TYPES.has(type)) {
        throw new Error(`Unsupported type: ${col.type}`);
    }
    let def = `"${col.name}" ${type}`;
    if (col.required) def += ' NOT NULL';
    if (col.references) {
      const refTable = col.references.table;
      const refCol = col.references.column ?? 'id';
      if (!isSafeTableName(refTable)) throw new Error(`Invalid foreign key table name: ${refTable}`);
      def += ` REFERENCES "${refTable}"("${refCol}")`;
    }
    return def;
  });

  const sql = `CREATE TABLE "${tableName}" (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    ${colDefs.join(',\n    ')},
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now'))
  )`;

  db.exec(sql);
  logChange('schema-agent', 'create_table', { tableName, columns }, userRequest);
  writeJournal({
    agent: 'schema',
    type: 'schema_change',
    description: `Created table ${tableName} with fields: ${columns.map(c => c.name).join(', ')}`,
    diff: { before: null, after: { table: tableName, columns } },
    user_request: userRequest,
    reversible: true,
    reverse_operations: [{ type: 'sql', sql: `DROP TABLE IF EXISTS "${tableName}"` }],
  });

  return {
    success: true,
      message: `Created table ${tableName} with fields: ${columns.map(c => c.name).join(', ')}`,
    data: getTableSchema(tableName),
  };
}

interface AlterInput {
  operation: 'add_column';
  column: ColumnInput;
}

export function alterTable(
  tableName: string,
  changes: AlterInput[],
  userRequest: string
): AgentResult {
  if (!isSafeTableName(tableName)) {
    return { success: false, message: `Invalid table name: ${tableName}` };
  }

  const db = getDb();
  const results: string[] = [];

  for (const change of changes) {
    if (change.operation === 'add_column') {
      const col = change.column;
      const type = col.type.toUpperCase();
      if (!ALLOWED_TYPES.has(type)) {
        return { success: false, message: `Unsupported type: ${col.type}` };
      }

      let colDef = `"${col.name}" ${type}`;
      if (col.references) {
        const refTable = col.references.table;
        const refCol = col.references.column ?? 'id';
        if (!isSafeTableName(refTable)) {
          return { success: false, message: `Invalid foreign key table name: ${refTable}` };
        }
        colDef += ` REFERENCES "${refTable}"("${refCol}")`;
      }

      db.exec(`ALTER TABLE "${tableName}" ADD COLUMN ${colDef}`);
      results.push(`Added field ${col.name}`);

      writeJournal({
        agent: 'schema',
        type: 'schema_change',
        description: `Added field ${col.name} (${col.type}) to table ${tableName}`,
        diff: { before: null, after: { table: tableName, column: col } },
        user_request: userRequest,
        reversible: true,
        reverse_operations: [{ type: 'drop_column', table: tableName, column: col.name }],
      });
    }
  }

  logChange('schema-agent', 'alter_table', { tableName, changes }, userRequest);

  return {
    success: true,
      message: `Updated table ${tableName}: ${results.join(', ')}`,
    data: getTableSchema(tableName),
  };
}

export function describeTables(): AgentResult {
  const schemas = getAllSchemas();
  return {
    success: true,
    message: 'Current database structure',
    data: schemas,
  };
}

export function queryData(sql: string): AgentResult {
  const trimmed = sql.trim().toUpperCase();
  if (!trimmed.startsWith('SELECT')) {
    return { success: false, message: 'Only SELECT queries are allowed' };
  }

  const db = getDb();
  const rows = db.prepare(sql).all();
  return {
    success: true,
      message: `Query completed, ${rows.length} records found`,
    data: rows,
  };
}

// ===== Write data =====

type WriteOperation = 'insert' | 'update' | 'delete';
type ScalarValue = string | number | boolean | null;

/** node:sqlite 不接受 boolean，轉成 0/1 */
function toSQLValue(v: ScalarValue): string | number | null | bigint {
  if (typeof v === 'boolean') return v ? 1 : 0;
  return v;
}

interface WriteDataInput {
  operation: WriteOperation;
  table: string;
  data?: Record<string, ScalarValue>;
  where?: Record<string, ScalarValue>;
}

export async function writeData(input: WriteDataInput, userRequest: string): Promise<AgentResult> {
  const { operation, table, data = {}, where } = input;

  if (!isSafeTableName(table)) {
    return { success: false, message: `Invalid or disallowed table name: ${table}` };
  }

  const db = getDb();
  const tableExists = db.prepare(
    `SELECT name FROM sqlite_master WHERE type='table' AND name=?`
  ).get(table);
  if (!tableExists) {
    return { success: false, message: `Table ${table} does not exist` };
  }

  // Validate all field names
  const allKeys = [...Object.keys(data), ...Object.keys(where ?? {})];
  for (const k of allKeys) {
    if (!isSafeFieldName(k)) {
      return { success: false, message: `Invalid field name: ${k}` };
    }
  }

  if (operation === 'insert') {
    const keys = Object.keys(data);
    if (keys.length === 0) return { success: false, message: 'Data cannot be empty for insert' };

    // Run before_insert rules, then inject auto-numbers
    const before = executeBefore(table, 'insert', data as Record<string, unknown>);
    if (!before.allowed) {
      return { success: false, message: before.errors.join('; ') };
    }
    const finalData = applyAutoNumbers(table, before.data);

    const finalKeys = Object.keys(finalData);
    const cols = finalKeys.map(k => `"${k}"`).join(', ');
    const placeholders = finalKeys.map(() => '?').join(', ');

    const result = db.prepare(
      `INSERT INTO "${table}" (${cols}) VALUES (${placeholders})`
    ).run(...finalKeys.map(k => toSQLValue(finalData[k] as ScalarValue)));

    const insertedId = result.lastInsertRowid;

    writeJournal({
      agent: 'user',
      type: 'data_write',
      description: `AI inserted 1 record into ${table} (id: ${insertedId})`,
      diff: { before: null, after: { table, data: finalData } },
      user_request: userRequest,
      reversible: true,
      reverse_operations: [{ type: 'sql', sql: `DELETE FROM "${table}" WHERE id = ${insertedId}` }],
    });

    await executeAfter(table, 'insert', { ...finalData, id: Number(insertedId) });

    return {
      success: true,
      message: `Inserted 1 record into ${table}, id = ${insertedId}`,
      data: { id: Number(insertedId) },
    };
  }

  if (operation === 'update') {
    const whereKeys = Object.keys(where ?? {});
    if (whereKeys.length === 0) {
      return { success: false, message: 'Update requires a "where" condition to prevent full table modification' };
    }
    const dataKeys = Object.keys(data);
    if (dataKeys.length === 0) return { success: false, message: 'Update fields cannot be empty' };

    // Fetch old record for before rules
    const wheres = whereKeys.map(k => `"${k}" = ?`).join(' AND ');
    const whereValues = whereKeys.map(k => (where as Record<string, ScalarValue>)[k]);
    const oldRecord = db.prepare(
      `SELECT * FROM "${table}" WHERE ${wheres} LIMIT 1`
    ).get(...whereValues.map(toSQLValue)) as Record<string, unknown> | undefined;

    const before = executeBefore(table, 'update', data as Record<string, unknown>, oldRecord);
    if (!before.allowed) {
      return { success: false, message: before.errors.join('; ') };
    }
    const finalData = before.data;

    const finalKeys = Object.keys(finalData);
    const sets = finalKeys.map(k => `"${k}" = ?`).join(', ');
    const values = [
      ...finalKeys.map(k => finalData[k]),
      ...whereValues,
    ];

    const result = db.prepare(
      `UPDATE "${table}" SET ${sets} WHERE ${wheres}`
    ).run(...values.map(v => toSQLValue(v as ScalarValue)));

    writeJournal({
      agent: 'user',
      type: 'data_write',
      description: `AI updated ${result.changes} records in ${table}`,
      diff: { before: oldRecord ?? null, after: { ...where, ...finalData } },
      user_request: userRequest,
      reversible: false,
    });

    if (oldRecord) {
      await executeAfter(table, 'update', { ...oldRecord, ...finalData }, oldRecord);
    }

    return {
      success: true,
      message: `Updated ${result.changes} records`,
      data: { changes: result.changes },
    };
  }

  if (operation === 'delete') {
    const whereKeys = Object.keys(where ?? {});
    if (whereKeys.length === 0) {
      return { success: false, message: 'delete requires where condition, cannot delete full table' };
    }

    const wheres = whereKeys.map(k => `"${k}" = ?`).join(' AND ');
    const whereValues = whereKeys.map(k => (where as Record<string, ScalarValue>)[k]);

    const oldRecord = db.prepare(
      `SELECT * FROM "${table}" WHERE ${wheres} LIMIT 1`
    ).get(...whereValues.map(toSQLValue)) as Record<string, unknown> | undefined;

    const before = executeBefore(table, 'delete', oldRecord ?? (where as Record<string, unknown>));
    if (!before.allowed) {
      return { success: false, message: before.errors.join('; ') };
    }

    const result = db.prepare(
      `DELETE FROM "${table}" WHERE ${wheres}`
    ).run(...whereValues.map(toSQLValue));

    writeJournal({
      agent: 'user',
      type: 'data_write',
      description: `AI deleted ${result.changes} records from ${table}`,
      diff: { before: oldRecord ?? null, after: null },
      user_request: userRequest,
      reversible: false,
    });

    if (oldRecord) {
      await executeAfter(table, 'delete', oldRecord);
    }

    return {
      success: true,
      message: `Deleted ${result.changes} records`,
      data: { changes: result.changes },
    };
  }

  return { success: false, message: `Unsupported operation type: ${String(operation)}` };
}
