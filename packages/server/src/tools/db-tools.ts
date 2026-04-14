import { getDb, getTableSchema, getAllSchemas, logChange } from '../db';
import type { AgentResult } from '../types';

const ALLOWED_TYPES = new Set(['TEXT', 'INTEGER', 'REAL', 'BLOB', 'BOOLEAN', 'DATE', 'DATETIME']);
const FORBIDDEN_TABLE_PREFIXES = ['_zenku_', 'sqlite_'];

function isSafeTableName(name: string): boolean {
  if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(name)) return false;
  if (FORBIDDEN_TABLE_PREFIXES.some(p => name.toLowerCase().startsWith(p))) return false;
  return true;
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
    return { success: false, message: `無效的表名：${tableName}` };
  }

  const db = getDb();

  const existing = db.prepare(
    `SELECT name FROM sqlite_master WHERE type='table' AND name=?`
  ).get(tableName);
  if (existing) {
    return { success: false, message: `表 ${tableName} 已存在` };
  }

  const colDefs = columns.map(col => {
    const type = col.type.toUpperCase();
    if (!ALLOWED_TYPES.has(type)) {
      throw new Error(`不支援的型別：${col.type}`);
    }
    let def = `"${col.name}" ${type}`;
    if (col.required) def += ' NOT NULL';
    if (col.references) {
      const refTable = col.references.table;
      const refCol = col.references.column ?? 'id';
      if (!isSafeTableName(refTable)) throw new Error(`無效的關聯表名：${refTable}`);
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

  return {
    success: true,
    message: `已建立表 ${tableName}，包含欄位：${columns.map(c => c.name).join(', ')}`,
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
    return { success: false, message: `無效的表名：${tableName}` };
  }

  const db = getDb();
  const results: string[] = [];

  for (const change of changes) {
    if (change.operation === 'add_column') {
      const col = change.column;
      const type = col.type.toUpperCase();
      if (!ALLOWED_TYPES.has(type)) {
        return { success: false, message: `不支援的型別：${col.type}` };
      }

      let colDef = `"${col.name}" ${type}`;
      if (col.references) {
        const refTable = col.references.table;
        const refCol = col.references.column ?? 'id';
        if (!isSafeTableName(refTable)) {
          return { success: false, message: `無效的關聯表名：${refTable}` };
        }
        colDef += ` REFERENCES "${refTable}"("${refCol}")`;
      }

      db.exec(`ALTER TABLE "${tableName}" ADD COLUMN ${colDef}`);
      results.push(`新增欄位 ${col.name}`);
    }
  }

  logChange('schema-agent', 'alter_table', { tableName, changes }, userRequest);

  return {
    success: true,
    message: `已修改表 ${tableName}：${results.join(', ')}`,
    data: getTableSchema(tableName),
  };
}

export function describeTables(): AgentResult {
  const schemas = getAllSchemas();
  return {
    success: true,
    message: '目前資料庫結構',
    data: schemas,
  };
}

export function queryData(sql: string): AgentResult {
  const trimmed = sql.trim().toUpperCase();
  if (!trimmed.startsWith('SELECT')) {
    return { success: false, message: '只允許 SELECT 查詢' };
  }

  const db = getDb();
  const rows = db.prepare(sql).all();
  return {
    success: true,
    message: `查詢完成，共 ${rows.length} 筆`,
    data: rows,
  };
}
