import { getDb } from '../db';
import type { ColumnSpec, FieldType } from '../db/adapter';
import { getTableSchema, getAllSchemas } from '../db/schema';
import { logChange } from '../db/changes';
import { writeJournal } from '../db/journal';
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

export async function createTable(
  tableName: string,
  columns: ColumnInput[],
  userRequest: string
): Promise<AgentResult> {
  if (!isSafeTableName(tableName)) {
    return { success: false, message: `Invalid table name: ${tableName}` };
  }

  if (!Array.isArray(columns) || columns.length === 0) {
    return { success: false, message: 'columns must be a non-empty array' };
  }

  const db = getDb();

  if (await db.tableExists(tableName)) {
    return { success: false, message: `Table ${tableName} already exists` };
  }

  const RESERVED = new Set(['id', 'created_at', 'updated_at']);
  columns = columns.filter(col => !RESERVED.has(col.name.toLowerCase()));

  const columnSpecs: ColumnSpec[] = columns.map(col => {
    const type = col.type.toUpperCase() as FieldType;
    if (!ALLOWED_TYPES.has(type)) throw new Error(`Unsupported type: ${col.type}`);
    if (col.references && !isSafeTableName(col.references.table)) {
      throw new Error(`Invalid foreign key table name: ${col.references.table}`);
    }
    return {
      name: col.name,
      type,
      required: col.required,
      references: col.references ? { table: col.references.table, column: col.references.column } : undefined,
    };
  });

  await db.createTable(tableName, columnSpecs);
  await logChange('schema-agent', 'create_table', { tableName, columns }, userRequest);
  await writeJournal({
    agent: 'schema',
    type: 'schema_change',
    description: `Created table ${tableName} with fields: ${columns.map(c => c.name).join(', ')}`,
    diff: { before: null, after: { table: tableName, columns } },
    user_request: userRequest,
    reversible: true,
    reverse_operations: [{ type: 'drop_table', table: tableName }],
  });

  return {
    success: true,
    message: `Created table ${tableName} with fields: ${columns.map(c => c.name).join(', ')}`,
    data: await getTableSchema(tableName),
  };
}

interface AlterInput {
  operation: 'add_column';
  column: ColumnInput;
}

export async function alterTable(
  tableName: string,
  changes: AlterInput[],
  userRequest: string
): Promise<AgentResult> {
  if (!isSafeTableName(tableName)) {
    return { success: false, message: `Invalid table name: ${tableName}` };
  }

  const db = getDb();
  const results: string[] = [];

  for (const change of changes) {
    if (change.operation === 'add_column') {
      const col = change.column;
      const type = col.type.toUpperCase() as FieldType;
      if (!ALLOWED_TYPES.has(type)) {
        return { success: false, message: `Unsupported type: ${col.type}` };
      }
      if (!isSafeFieldName(col.name)) {
        return { success: false, message: `Invalid field name: ${col.name}` };
      }
      if (col.references && !isSafeTableName(col.references.table)) {
        return { success: false, message: `Invalid foreign key table name: ${col.references.table}` };
      }

      await db.addColumn(tableName, {
        name: col.name,
        type,
        required: col.required,
        default: col.default_value,
        references: col.references
          ? { table: col.references.table, column: col.references.column }
          : undefined,
      });
      results.push(`Added field ${col.name}`);

      await writeJournal({
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

  await logChange('schema-agent', 'alter_table', { tableName, changes }, userRequest);

  return {
    success: true,
    message: `Updated table ${tableName}: ${results.join(', ')}`,
    data: await getTableSchema(tableName),
  };
}

export async function describeTables(): Promise<AgentResult> {
  return {
    success: true,
    message: 'Current database structure',
    data: await getAllSchemas(),
  };
}

export async function queryData(sql: string): Promise<AgentResult> {
  const trimmed = sql.trim().toUpperCase();
  if (!trimmed.startsWith('SELECT')) {
    return { success: false, message: 'Only SELECT queries are allowed' };
  }
  const { rows } = await getDb().query(sql);
  return {
    success: true,
    message: `Query completed, ${rows.length} records found`,
    data: rows,
  };
}

// ===== Write data =====

type WriteOperation = 'insert' | 'update' | 'delete';
type ScalarValue = string | number | boolean | null;

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
  if (!(await db.tableExists(table))) {
    return { success: false, message: `Table ${table} does not exist` };
  }

  const allKeys = [...Object.keys(data), ...Object.keys(where ?? {})];
  for (const k of allKeys) {
    if (!isSafeFieldName(k)) {
      return { success: false, message: `Invalid field name: ${k}` };
    }
  }

  if (operation === 'insert') {
    const keys = Object.keys(data);
    if (keys.length === 0) return { success: false, message: 'Data cannot be empty for insert' };

    const before = await executeBefore(table, 'insert', data as Record<string, unknown>);
    if (!before.allowed) {
      return { success: false, message: before.errors.join('; ') };
    }
    const finalData = await applyAutoNumbers(table, before.data);

    const finalKeys = Object.keys(finalData);
    const cols = finalKeys.map(k => `"${k}"`).join(', ');
    const placeholders = finalKeys.map(() => '?').join(', ');
    const values = finalKeys.map(k => {
      const v = finalData[k];
      return typeof v === 'boolean' ? (v ? 1 : 0) : v;
    });

    const result = await db.execute(
      `INSERT INTO "${table}" (${cols}) VALUES (${placeholders})`,
      values
    );
    const insertedId = result.lastInsertId;

    await writeJournal({
      agent: 'user',
      type: 'data_write',
      description: `AI inserted 1 record into ${table} (id: ${insertedId})`,
      diff: { before: null, after: { table, data: finalData } },
      user_request: userRequest,
      reversible: true,
      reverse_operations: [{ type: 'sql', sql: `DELETE FROM "${table}" WHERE id = ${insertedId}` }],
    });

    await executeAfter(table, 'insert', { ...finalData, id: insertedId });

    return {
      success: true,
      message: `Inserted 1 record into ${table}, id = ${insertedId}`,
      data: { id: insertedId },
    };
  }

  if (operation === 'update') {
    const whereKeys = Object.keys(where ?? {});
    if (whereKeys.length === 0) {
      return { success: false, message: 'Update requires a "where" condition to prevent full table modification' };
    }
    const dataKeys = Object.keys(data);
    if (dataKeys.length === 0) return { success: false, message: 'Update fields cannot be empty' };

    const wheres = whereKeys.map(k => `"${k}" = ?`).join(' AND ');
    const whereValues = whereKeys.map(k => (where as Record<string, ScalarValue>)[k]);
    const { rows: oldRows } = await db.query<Record<string, unknown>>(
      `SELECT * FROM "${table}" WHERE ${wheres} LIMIT 1`,
      whereValues
    );
    const oldRecord = oldRows[0];

    const before = await executeBefore(table, 'update', data as Record<string, unknown>, oldRecord);
    if (!before.allowed) {
      return { success: false, message: before.errors.join('; ') };
    }
    const finalData = before.data;
    const finalKeys = Object.keys(finalData);
    const sets = finalKeys.map(k => `"${k}" = ?`).join(', ');
    const values = [...finalKeys.map(k => finalData[k]), ...whereValues];

    const result = await db.execute(
      `UPDATE "${table}" SET ${sets} WHERE ${wheres}`,
      values
    );

    await writeJournal({
      agent: 'user',
      type: 'data_write',
      description: `AI updated ${result.rowsAffected} records in ${table}`,
      diff: { before: oldRecord ?? null, after: { ...where, ...finalData } },
      user_request: userRequest,
      reversible: false,
    });

    if (oldRecord) {
      await executeAfter(table, 'update', { ...oldRecord, ...finalData }, oldRecord);
    }

    return {
      success: true,
      message: `Updated ${result.rowsAffected} records`,
      data: { changes: result.rowsAffected },
    };
  }

  if (operation === 'delete') {
    const whereKeys = Object.keys(where ?? {});
    if (whereKeys.length === 0) {
      return { success: false, message: 'delete requires where condition, cannot delete full table' };
    }

    const wheres = whereKeys.map(k => `"${k}" = ?`).join(' AND ');
    const whereValues = whereKeys.map(k => (where as Record<string, ScalarValue>)[k]);
    const { rows: oldRows } = await db.query<Record<string, unknown>>(
      `SELECT * FROM "${table}" WHERE ${wheres} LIMIT 1`,
      whereValues
    );
    const oldRecord = oldRows[0];

    const before = await executeBefore(table, 'delete', oldRecord ?? (where as Record<string, unknown>));
    if (!before.allowed) {
      return { success: false, message: before.errors.join('; ') };
    }

    const result = await db.execute(
      `DELETE FROM "${table}" WHERE ${wheres}`,
      whereValues
    );

    await writeJournal({
      agent: 'user',
      type: 'data_write',
      description: `AI deleted ${result.rowsAffected} records from ${table}`,
      diff: { before: oldRecord ?? null, after: null },
      user_request: userRequest,
      reversible: false,
    });

    if (oldRecord) {
      await executeAfter(table, 'delete', oldRecord);
    }

    return {
      success: true,
      message: `Deleted ${result.rowsAffected} records`,
      data: { changes: result.rowsAffected },
    };
  }

  return { success: false, message: `Unsupported operation type: ${String(operation)}` };
}
