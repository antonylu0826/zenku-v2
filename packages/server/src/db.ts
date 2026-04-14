import { DatabaseSync } from 'node:sqlite';
import path from 'path';

const DB_PATH = path.join(process.cwd(), 'zenku.db');

let _db: DatabaseSync | null = null;

export function getDb(): DatabaseSync {
  if (!_db) {
    _db = new DatabaseSync(DB_PATH);
    _db.exec('PRAGMA journal_mode = WAL');
    _db.exec('PRAGMA foreign_keys = ON');
    initSystemTables(_db);
  }
  return _db;
}

function initSystemTables(db: DatabaseSync): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS _zenku_views (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      table_name TEXT NOT NULL,
      definition TEXT NOT NULL,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS _zenku_changes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      timestamp TEXT DEFAULT (datetime('now')),
      agent TEXT NOT NULL,
      action TEXT NOT NULL,
      detail TEXT,
      user_request TEXT
    );

    CREATE TABLE IF NOT EXISTS _zenku_rules (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT,
      table_name TEXT NOT NULL,
      trigger_type TEXT NOT NULL,
      condition TEXT,
      actions TEXT NOT NULL,
      priority INTEGER DEFAULT 0,
      enabled INTEGER DEFAULT 1,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );
  `);
}

export function getUserTables(): string[] {
  const db = getDb();
  const rows = db.prepare(`
    SELECT name FROM sqlite_master
    WHERE type = 'table'
    AND name NOT LIKE '_zenku_%'
    AND name NOT LIKE 'sqlite_%'
    ORDER BY name
  `).all() as { name: string }[];
  return rows.map(r => r.name);
}

export function getTableSchema(tableName: string): { name: string; type: string; notnull: number; dflt_value: string | null; pk: number }[] {
  const db = getDb();
  return db.prepare(`PRAGMA table_info("${tableName}")`).all() as { name: string; type: string; notnull: number; dflt_value: string | null; pk: number }[];
}

export function getAllSchemas(): Record<string, { name: string; type: string; notnull: number; dflt_value: string | null; pk: number }[]> {
  const tables = getUserTables();
  const result: Record<string, { name: string; type: string; notnull: number; dflt_value: string | null; pk: number }[]> = {};
  for (const table of tables) {
    result[table] = getTableSchema(table);
  }
  return result;
}

export function getAllViews() {
  const db = getDb();
  return db.prepare('SELECT * FROM _zenku_views ORDER BY created_at').all() as {
    id: string;
    name: string;
    table_name: string;
    definition: string;
    created_at: string;
    updated_at: string;
  }[];
}

// ===== Rules =====

export interface RuleRow {
  id: string;
  name: string;
  description: string | null;
  table_name: string;
  trigger_type: string;
  condition: string | null;
  actions: string;
  priority: number;
  enabled: number;
  created_at: string;
  updated_at: string;
}

export function getRulesForTable(tableName: string, triggerType?: string): RuleRow[] {
  const db = getDb();
  if (triggerType) {
    return db.prepare(
      'SELECT * FROM _zenku_rules WHERE table_name = ? AND trigger_type = ? AND enabled = 1 ORDER BY priority ASC'
    ).all(tableName, triggerType) as unknown as RuleRow[];
  }
  return db.prepare(
    'SELECT * FROM _zenku_rules WHERE table_name = ? AND enabled = 1 ORDER BY priority ASC'
  ).all(tableName) as unknown as RuleRow[];
}

export function getAllRules(): RuleRow[] {
  const db = getDb();
  return db.prepare('SELECT * FROM _zenku_rules ORDER BY table_name, priority ASC').all() as unknown as RuleRow[];
}

export function logChange(agent: string, action: string, detail: unknown, userRequest: string): void {
  const db = getDb();
  db.prepare(`
    INSERT INTO _zenku_changes (agent, action, detail, user_request)
    VALUES (?, ?, ?, ?)
  `).run(agent, action, JSON.stringify(detail), userRequest);
}
