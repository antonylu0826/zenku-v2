import { DatabaseSync } from 'node:sqlite';
import path from 'path';
import type { DbAdapter, ColumnSpec, ColumnInfo, QueryResult, ExecResult, FieldType } from './adapter';

const DB_PATH = path.join(process.cwd(), 'zenku.db');

const TYPE_MAP: Record<FieldType, string> = {
  TEXT: 'TEXT',
  INTEGER: 'INTEGER',
  REAL: 'REAL',
  BLOB: 'BLOB',
  BOOLEAN: 'INTEGER',
  DATE: 'TEXT',
  DATETIME: 'TEXT',
};

function buildDefault(d: string): string {
  switch (d) {
    case 'now': return "(datetime('now'))";
    case 'true': return '1';
    case 'false': return '0';
    default: return `'${d}'`;
  }
}

function buildColDef(col: ColumnSpec): string {
  const sqlType = TYPE_MAP[col.type];
  let def = `"${col.name}" ${sqlType}`;

  const hasDefault = col.default !== undefined;
  if (col.required && hasDefault) {
    def += ` NOT NULL DEFAULT ${buildDefault(col.default!)}`;
  } else if (col.required) {
    def += ' NOT NULL';
  } else if (hasDefault) {
    def += ` DEFAULT ${buildDefault(col.default!)}`;
  }

  if (col.references) {
    const refCol = col.references.column ?? 'id';
    def += ` REFERENCES "${col.references.table}"("${refCol}")`;
  }

  return def;
}

function normalizeParams(params: unknown[]): unknown[] {
  return params.map(p => (typeof p === 'boolean' ? (p ? 1 : 0) : p));
}

export class SqliteAdapter implements DbAdapter {
  readonly type = 'sqlite';
  private readonly db: DatabaseSync;

  constructor(dbPath = DB_PATH) {
    this.db = new DatabaseSync(dbPath);
    this.db.exec('PRAGMA journal_mode = WAL');
    this.db.exec('PRAGMA foreign_keys = ON');
  }

  async query<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<QueryResult<T>> {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const rows = this.db.prepare(sql).all(...(normalizeParams(params ?? []) as any[])) as unknown as T[];
    return { rows };
  }

  async execute(sql: string, params?: unknown[]): Promise<ExecResult> {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = this.db.prepare(sql).run(...(normalizeParams(params ?? []) as any[]));
    const lastId = Number(result.lastInsertRowid);
    return {
      rowsAffected: Number(result.changes),
      lastInsertId: lastId !== 0 ? lastId : undefined,
    };
  }

  async createTable(tableName: string, columns: ColumnSpec[]): Promise<void> {
    const colDefs = [
      'id INTEGER PRIMARY KEY AUTOINCREMENT',
      ...columns.map(buildColDef),
      "created_at TEXT DEFAULT (datetime('now'))",
      "updated_at TEXT DEFAULT (datetime('now'))",
    ];
    this.db.exec(`CREATE TABLE "${tableName}" (\n  ${colDefs.join(',\n  ')}\n)`);
  }

  async addColumn(tableName: string, column: ColumnSpec): Promise<void> {
    const def = buildColDef(column);
    this.db.exec(`ALTER TABLE "${tableName}" ADD COLUMN ${def}`);
  }

  async dropColumn(tableName: string, columnName: string): Promise<void> {
    this.db.exec(`ALTER TABLE "${tableName}" DROP COLUMN "${columnName}"`);
  }

  async dropTable(tableName: string): Promise<void> {
    this.db.exec(`DROP TABLE IF EXISTS "${tableName}"`);
  }

  async tableExists(tableName: string): Promise<boolean> {
    const row = this.db.prepare(
      `SELECT name FROM sqlite_master WHERE type='table' AND name=?`
    ).get(tableName);
    return row !== undefined;
  }

  async listTables(): Promise<string[]> {
    const rows = this.db.prepare(`
      SELECT name FROM sqlite_master
      WHERE type = 'table'
      AND name NOT LIKE '_zenku_%'
      AND name NOT LIKE 'sqlite_%'
      ORDER BY name
    `).all() as { name: string }[];
    return rows.map(r => r.name);
  }

  async getColumns(tableName: string): Promise<ColumnInfo[]> {
    const rows = this.db.prepare(`PRAGMA table_info("${tableName}")`).all() as {
      name: string;
      type: string;
      notnull: number;
      dflt_value: string | null;
      pk: number;
    }[];
    return rows.map(r => ({
      name: r.name,
      type: r.type,
      notNull: r.notnull === 1,
      defaultValue: r.dflt_value,
      isPrimaryKey: r.pk === 1,
    }));
  }

  async upsertCounter(tableName: string, fieldName: string, period: string): Promise<number> {
    const rows = this.db.prepare(`
      INSERT INTO _zenku_counters (table_name, field_name, period, current_value)
      VALUES (?, ?, ?, 1)
      ON CONFLICT(table_name, field_name, period)
      DO UPDATE SET current_value = current_value + 1
      RETURNING current_value
    `).all(...([tableName, fieldName, period] as any[])) as { current_value: number }[];
    return rows[0]?.current_value ?? 1;
  }

  async initSystemTables(): Promise<void> {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS _zenku_users (
        id TEXT PRIMARY KEY,
        email TEXT UNIQUE NOT NULL,
        name TEXT NOT NULL,
        password_hash TEXT NOT NULL,
        role TEXT NOT NULL DEFAULT 'user',
        language TEXT NOT NULL DEFAULT 'en',
        disabled INTEGER NOT NULL DEFAULT 0,
        created_at TEXT DEFAULT (datetime('now')),
        last_login_at TEXT
      );

      CREATE TABLE IF NOT EXISTS _zenku_sessions (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL REFERENCES _zenku_users(id),
        token TEXT UNIQUE NOT NULL,
        expires_at TEXT NOT NULL,
        created_at TEXT DEFAULT (datetime('now'))
      );

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

      CREATE TABLE IF NOT EXISTS _zenku_journal (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        timestamp TEXT DEFAULT (datetime('now')),
        session_id TEXT NOT NULL,
        agent TEXT NOT NULL,
        type TEXT NOT NULL,
        description TEXT NOT NULL,
        diff TEXT NOT NULL,
        reason TEXT,
        user_request TEXT,
        reversible INTEGER DEFAULT 1,
        reverse_operations TEXT,
        reversed INTEGER DEFAULT 0,
        reversed_by INTEGER
      );

      CREATE INDEX IF NOT EXISTS idx_journal_session ON _zenku_journal(session_id);
      CREATE INDEX IF NOT EXISTS idx_journal_timestamp ON _zenku_journal(timestamp);

      CREATE TABLE IF NOT EXISTS _zenku_chat_sessions (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL REFERENCES _zenku_users(id),
        title TEXT,
        provider TEXT NOT NULL,
        model TEXT NOT NULL,
        created_at TEXT DEFAULT (datetime('now')),
        updated_at TEXT DEFAULT (datetime('now')),
        total_input_tokens INTEGER DEFAULT 0,
        total_output_tokens INTEGER DEFAULT 0,
        total_thinking_tokens INTEGER DEFAULT 0,
        total_cost_usd REAL DEFAULT 0,
        message_count INTEGER DEFAULT 0
      );

      CREATE TABLE IF NOT EXISTS _zenku_chat_messages (
        id TEXT PRIMARY KEY,
        session_id TEXT NOT NULL REFERENCES _zenku_chat_sessions(id),
        user_id TEXT NOT NULL,
        role TEXT NOT NULL,
        content TEXT NOT NULL,
        provider TEXT,
        model TEXT,
        input_tokens INTEGER DEFAULT 0,
        output_tokens INTEGER DEFAULT 0,
        thinking_tokens INTEGER DEFAULT 0,
        thinking_content TEXT,
        latency_ms INTEGER DEFAULT 0,
        created_at TEXT DEFAULT (datetime('now'))
      );

      CREATE TABLE IF NOT EXISTS _zenku_tool_events (
        id TEXT PRIMARY KEY,
        message_id TEXT NOT NULL REFERENCES _zenku_chat_messages(id),
        session_id TEXT NOT NULL,
        agent TEXT NOT NULL,
        tool_name TEXT NOT NULL,
        tool_input TEXT,
        tool_output TEXT,
        success INTEGER,
        started_at TEXT,
        finished_at TEXT,
        latency_ms INTEGER DEFAULT 0
      );

      CREATE INDEX IF NOT EXISTS idx_chat_sessions_user ON _zenku_chat_sessions(user_id);
      CREATE INDEX IF NOT EXISTS idx_chat_messages_session ON _zenku_chat_messages(session_id);
      CREATE INDEX IF NOT EXISTS idx_tool_events_session ON _zenku_tool_events(session_id);
      CREATE INDEX IF NOT EXISTS idx_tool_events_message ON _zenku_tool_events(message_id);

      CREATE TABLE IF NOT EXISTS _zenku_api_keys (
        id          TEXT PRIMARY KEY,
        name        TEXT NOT NULL,
        key_prefix  TEXT NOT NULL,
        key_hash    TEXT NOT NULL UNIQUE,
        scopes      TEXT NOT NULL DEFAULT '[]',
        created_by  TEXT NOT NULL,
        created_at  TEXT DEFAULT (datetime('now')),
        expires_at  TEXT,
        last_used_at TEXT,
        revoked     INTEGER NOT NULL DEFAULT 0
      );

      CREATE TABLE IF NOT EXISTS _zenku_files (
        id          TEXT PRIMARY KEY,
        filename    TEXT NOT NULL,
        mime_type   TEXT NOT NULL,
        size        INTEGER NOT NULL,
        path        TEXT NOT NULL,
        table_name  TEXT,
        record_id   TEXT,
        field_name  TEXT,
        uploaded_by TEXT,
        created_at  TEXT DEFAULT (datetime('now'))
      );

      CREATE INDEX IF NOT EXISTS idx_files_record ON _zenku_files(table_name, record_id, field_name);

      CREATE TABLE IF NOT EXISTS _zenku_counters (
        id            INTEGER PRIMARY KEY AUTOINCREMENT,
        table_name    TEXT    NOT NULL,
        field_name    TEXT    NOT NULL,
        period        TEXT    NOT NULL DEFAULT '',
        current_value INTEGER NOT NULL DEFAULT 0,
        UNIQUE(table_name, field_name, period)
      );

      CREATE TABLE IF NOT EXISTS _zenku_webhook_logs (
        id           INTEGER PRIMARY KEY AUTOINCREMENT,
        triggered_at TEXT    NOT NULL DEFAULT (datetime('now')),
        rule_id      TEXT,
        rule_name    TEXT    NOT NULL,
        table_name   TEXT    NOT NULL,
        record_id    TEXT,
        trigger_type TEXT    NOT NULL,
        url          TEXT    NOT NULL,
        method       TEXT    NOT NULL DEFAULT 'POST',
        http_status  INTEGER,
        duration_ms  INTEGER,
        status       TEXT    NOT NULL,
        error        TEXT
      );

      CREATE INDEX IF NOT EXISTS idx_webhook_logs_rule_id ON _zenku_webhook_logs(rule_id);
      CREATE INDEX IF NOT EXISTS idx_webhook_logs_triggered_at ON _zenku_webhook_logs(triggered_at);

      CREATE TABLE IF NOT EXISTS _zenku_oidc_providers (
        id            TEXT PRIMARY KEY,
        name          TEXT NOT NULL,
        issuer        TEXT NOT NULL,
        client_id     TEXT NOT NULL,
        client_secret TEXT NOT NULL,
        enabled       INTEGER NOT NULL DEFAULT 1,
        created_at    TEXT DEFAULT (datetime('now'))
      );

      CREATE TABLE IF NOT EXISTS _zenku_user_identities (
        id            TEXT PRIMARY KEY,
        user_id       TEXT NOT NULL REFERENCES _zenku_users(id),
        provider_id   TEXT NOT NULL REFERENCES _zenku_oidc_providers(id),
        external_id   TEXT NOT NULL,
        refresh_token TEXT,
        created_at    TEXT DEFAULT (datetime('now')),
        UNIQUE(provider_id, external_id)
      );

      CREATE TABLE IF NOT EXISTS _zenku_settings (
        key        TEXT PRIMARY KEY,
        value      TEXT NOT NULL,
        updated_at TEXT DEFAULT (datetime('now'))
      );

      CREATE TABLE IF NOT EXISTS _zenku_oidc_role_mappings (
        id          TEXT PRIMARY KEY,
        provider_id TEXT NOT NULL REFERENCES _zenku_oidc_providers(id) ON DELETE CASCADE,
        claim_path  TEXT NOT NULL,
        claim_value TEXT NOT NULL,
        zenku_role  TEXT NOT NULL,
        created_at  TEXT DEFAULT (datetime('now'))
      );

      CREATE TABLE IF NOT EXISTS _zenku_translations (
        key        TEXT NOT NULL,
        locale     TEXT NOT NULL,
        content    TEXT NOT NULL,
        updated_at TEXT DEFAULT (datetime('now')),
        PRIMARY KEY (key, locale)
      );
    `);

    // Migrations for existing databases
    try { this.db.exec(`ALTER TABLE _zenku_users ADD COLUMN disabled INTEGER NOT NULL DEFAULT 0`); } catch { /* exists */ }
    try { this.db.exec(`ALTER TABLE _zenku_users ADD COLUMN language TEXT NOT NULL DEFAULT 'en'`); } catch { /* exists */ }
    try { this.db.exec(`ALTER TABLE _zenku_chat_sessions ADD COLUMN archived INTEGER NOT NULL DEFAULT 0`); } catch { /* exists */ }
    try { this.db.exec(`ALTER TABLE _zenku_user_identities ADD COLUMN refresh_token TEXT`); } catch { /* exists */ }
  }

  async close(): Promise<void> {
    this.db.close();
  }
}
