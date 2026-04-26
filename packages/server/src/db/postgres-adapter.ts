import postgres from 'postgres';
import type { DbAdapter, ColumnSpec, ColumnInfo, QueryResult, ExecResult, FieldType } from './adapter';

const TYPE_MAP: Record<FieldType, string> = {
  TEXT: 'TEXT',
  INTEGER: 'INTEGER',
  REAL: 'REAL',
  BLOB: 'BYTEA',
  BOOLEAN: 'BOOLEAN',
  DATE: 'DATE',
  DATETIME: 'TIMESTAMP',
};

function buildDefault(d: string): string {
  switch (d) {
    case 'now': return "NOW()::TEXT";
    case 'true': return 'TRUE';
    case 'false': return 'FALSE';
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

/** Convert ? positional placeholders to $1, $2, ... */
function toPositional(sql: string): string {
  let i = 0;
  return sql.replace(/\?/g, () => `$${++i}`);
}

export class PostgresAdapter implements DbAdapter {
  readonly type = 'postgres';
  private sql: postgres.Sql | null = null;
  private readonly connectionString: string;
  private initialized = false;

  constructor(connectionString: string) {
    this.connectionString = connectionString;
  }

  private async ensureConnected(): Promise<void> {
    if (this.sql === null) {
      this.sql = postgres(this.connectionString, {
        max: 1, // Required to support manual BEGIN/COMMIT/ROLLBACK commands via unsafe()
      });
      // Test the connection
      try {
        await this.sql`SELECT 1`;
      } catch (err) {
        this.sql = null;
        throw err;
      }
    }
  }
  async ensureDatabaseExists(): Promise<void> {
    if (this.initialized) return;

    try {
      // Parse connection string using URL API
      const url = new URL(this.connectionString);
      const dbName = url.pathname.slice(1) || 'zenku'; // Remove leading /

      // Create a temporary connection to 'postgres' database
      const tempUrl = new URL(this.connectionString);
      tempUrl.pathname = '/postgres';
      const tempSql = postgres(tempUrl.toString());

      try {
        // Check if database exists
        const result = await tempSql`SELECT 1 FROM pg_database WHERE datname = ${dbName}`;
        if (result.length === 0) {
          // Create database
          await tempSql.unsafe(`CREATE DATABASE "${dbName}"`);
          console.log(`Created PostgreSQL database: ${dbName}`);
        }
        this.initialized = true;
      } finally {
        await tempSql.end();
      }
    } catch (err) {
      console.error('Failed to ensure PostgreSQL database exists:', err);
      throw err;
    }
  }

  async query<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<QueryResult<T>> {
    await this.ensureConnected();
    const pgSql = toPositional(sql);
    const rows = await this.sql!.unsafe(pgSql, (params ?? []) as postgres.ParameterOrJSON<never>[]) as unknown as T[];
    return { rows };
  }

  async execute(sql: string, params?: unknown[]): Promise<ExecResult> {
    await this.ensureConnected();
    const pgSql = toPositional(sql);
    const p = (params ?? []) as postgres.ParameterOrJSON<never>[];
    const upperSql = sql.trim().toUpperCase();
    if (['BEGIN', 'COMMIT', 'ROLLBACK'].includes(upperSql)) {
      if (upperSql === 'BEGIN') await this.sql!.unsafe('BEGIN');
      else if (upperSql === 'COMMIT') await this.sql!.unsafe('COMMIT');
      else if (upperSql === 'ROLLBACK') await this.sql!.unsafe('ROLLBACK');
      return { rowsAffected: 0 };
    }

    const result = await this.sql!.unsafe(pgSql, p);
    
    // For PostgreSQL, the lastInsertId is typically retrieved via RETURNING clause in the SQL itself.
    // If the query returned a row with an 'id', we capture it.
    const lastInsertId = (result[0] as any)?.id;
    
    return { 
      rowsAffected: Number(result.count),
      lastInsertId: lastInsertId !== undefined ? lastInsertId : undefined
    };
  }

  async createTable(tableName: string, columns: ColumnSpec[]): Promise<void> {
    await this.ensureConnected();
    const colDefs = [
      'id SERIAL PRIMARY KEY',
      ...columns.map(buildColDef),
      'created_at TEXT DEFAULT NOW()::TEXT',
      'updated_at TEXT DEFAULT NOW()::TEXT',
    ];
    await this.sql!.unsafe(`CREATE TABLE "${tableName}" (\n  ${colDefs.join(',\n  ')}\n)`);
  }

  async addColumn(tableName: string, column: ColumnSpec): Promise<void> {
    await this.ensureConnected();
    const def = buildColDef(column);
    await this.sql!.unsafe(`ALTER TABLE "${tableName}" ADD COLUMN ${def}`);
  }

  async dropColumn(tableName: string, columnName: string): Promise<void> {
    await this.ensureConnected();
    await this.sql!.unsafe(`ALTER TABLE "${tableName}" DROP COLUMN "${columnName}"`);
  }

  async dropTable(tableName: string): Promise<void> {
    await this.ensureConnected();
    await this.sql!.unsafe(`DROP TABLE IF EXISTS "${tableName}"`);
  }

  async tableExists(tableName: string): Promise<boolean> {
    await this.ensureConnected();
    const rows = await this.sql!.unsafe(
      `SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name=$1`,
      [tableName]
    );
    return rows.length > 0;
  }

  async listTables(): Promise<string[]> {
    await this.ensureConnected();
    const rows = await this.sql!.unsafe(`
      SELECT table_name AS name FROM information_schema.tables
      WHERE table_schema = 'public'
        AND table_type = 'BASE TABLE'
        AND table_name NOT LIKE '_zenku_%'
      ORDER BY table_name
    `) as { name: string }[];
    return rows.map(r => r.name);
  }

  async getColumns(tableName: string): Promise<ColumnInfo[]> {
    await this.ensureConnected();
    const rows = await this.sql!.unsafe(`
      SELECT
        c.column_name AS name,
        c.data_type   AS type,
        c.is_nullable,
        c.column_default AS default_value,
        CASE WHEN pk.column_name IS NOT NULL THEN true ELSE false END AS is_pk
      FROM information_schema.columns c
      LEFT JOIN (
        SELECT kcu.column_name
        FROM information_schema.table_constraints tc
        JOIN information_schema.key_column_usage kcu
          ON tc.constraint_name = kcu.constraint_name
         AND tc.table_schema    = kcu.table_schema
        WHERE tc.constraint_type = 'PRIMARY KEY'
          AND tc.table_name      = $1
          AND tc.table_schema    = 'public'
      ) pk ON c.column_name = pk.column_name
      WHERE c.table_schema = 'public' AND c.table_name = $1
      ORDER BY c.ordinal_position
    `, [tableName]) as {
      name: string;
      type: string;
      is_nullable: string;
      default_value: string | null;
      is_pk: boolean;
    }[];

    return rows.map(r => ({
      name: r.name,
      type: r.type,
      notNull: r.is_nullable === 'NO',
      defaultValue: r.default_value,
      isPrimaryKey: r.is_pk,
    }));
  }

  async upsertCounter(tableName: string, fieldName: string, period: string): Promise<number> {
    await this.ensureConnected();
    const sql = toPositional(`
      INSERT INTO _zenku_counters (table_name, field_name, period, current_value)
      VALUES (?, ?, ?, 1)
      ON CONFLICT(table_name, field_name, period)
      DO UPDATE SET current_value = _zenku_counters.current_value + 1
      RETURNING current_value
    `);
    const result = await this.sql!.unsafe(sql, [tableName, fieldName, period] as postgres.ParameterOrJSON<never>[]);
    return (result[0] as unknown as { current_value: number })?.current_value ?? 1;
  }

  async initSystemTables(): Promise<void> {
    await this.ensureDatabaseExists();
    await this.ensureConnected();
    await this.sql!.unsafe(`
      CREATE TABLE IF NOT EXISTS _zenku_users (
        id            TEXT PRIMARY KEY,
        email         TEXT UNIQUE NOT NULL,
        name          TEXT NOT NULL,
        password_hash TEXT NOT NULL,
        role          TEXT NOT NULL DEFAULT 'user',
        language      TEXT NOT NULL DEFAULT 'en',
        disabled      INTEGER NOT NULL DEFAULT 0,
        created_at    TEXT DEFAULT NOW()::TEXT,
        last_login_at TEXT
      );

      CREATE TABLE IF NOT EXISTS _zenku_sessions (
        id         TEXT PRIMARY KEY,
        user_id    TEXT NOT NULL REFERENCES _zenku_users(id),
        token      TEXT UNIQUE NOT NULL,
        expires_at TEXT NOT NULL,
        created_at TEXT DEFAULT NOW()::TEXT
      );

      CREATE TABLE IF NOT EXISTS _zenku_views (
        id         TEXT PRIMARY KEY,
        name       TEXT NOT NULL,
        table_name TEXT NOT NULL,
        definition TEXT NOT NULL,
        created_at TEXT DEFAULT NOW()::TEXT,
        updated_at TEXT DEFAULT NOW()::TEXT
      );

      CREATE TABLE IF NOT EXISTS _zenku_changes (
        id           SERIAL PRIMARY KEY,
        timestamp    TEXT DEFAULT NOW()::TEXT,
        agent        TEXT NOT NULL,
        action       TEXT NOT NULL,
        detail       TEXT,
        user_request TEXT
      );

      CREATE TABLE IF NOT EXISTS _zenku_rules (
        id           TEXT PRIMARY KEY,
        name         TEXT NOT NULL,
        description  TEXT,
        table_name   TEXT NOT NULL,
        trigger_type TEXT NOT NULL,
        condition    TEXT,
        actions      TEXT NOT NULL,
        priority     INTEGER DEFAULT 0,
        enabled      INTEGER DEFAULT 1,
        created_at   TEXT DEFAULT NOW()::TEXT,
        updated_at   TEXT DEFAULT NOW()::TEXT
      );

      CREATE TABLE IF NOT EXISTS _zenku_journal (
        id                 SERIAL PRIMARY KEY,
        timestamp          TEXT DEFAULT NOW()::TEXT,
        session_id         TEXT NOT NULL,
        agent              TEXT NOT NULL,
        type               TEXT NOT NULL,
        description        TEXT NOT NULL,
        diff               TEXT NOT NULL,
        reason             TEXT,
        user_request       TEXT,
        reversible         INTEGER DEFAULT 1,
        reverse_operations TEXT,
        reversed           INTEGER DEFAULT 0,
        reversed_by        INTEGER
      );

      CREATE TABLE IF NOT EXISTS _zenku_counters (
        table_name    TEXT NOT NULL,
        field_name    TEXT NOT NULL,
        period        TEXT NOT NULL,
        current_value INTEGER NOT NULL DEFAULT 0,
        PRIMARY KEY (table_name, field_name, period)
      );

      CREATE INDEX IF NOT EXISTS idx_journal_session   ON _zenku_journal(session_id);
      CREATE INDEX IF NOT EXISTS idx_journal_timestamp ON _zenku_journal(timestamp);

      CREATE TABLE IF NOT EXISTS _zenku_chat_sessions (
        id                   TEXT PRIMARY KEY,
        user_id              TEXT NOT NULL REFERENCES _zenku_users(id),
        title                TEXT,
        provider             TEXT NOT NULL,
        model                TEXT NOT NULL,
        created_at           TEXT DEFAULT NOW()::TEXT,
        updated_at           TEXT DEFAULT NOW()::TEXT,
        total_input_tokens   INTEGER DEFAULT 0,
        total_output_tokens  INTEGER DEFAULT 0,
        total_thinking_tokens INTEGER DEFAULT 0,
        total_cost_usd       REAL DEFAULT 0,
        message_count        INTEGER DEFAULT 0
      );

      CREATE TABLE IF NOT EXISTS _zenku_chat_messages (
        id               TEXT PRIMARY KEY,
        session_id       TEXT NOT NULL REFERENCES _zenku_chat_sessions(id),
        user_id          TEXT NOT NULL,
        role             TEXT NOT NULL,
        content          TEXT NOT NULL,
        provider         TEXT,
        model            TEXT,
        input_tokens     INTEGER DEFAULT 0,
        output_tokens    INTEGER DEFAULT 0,
        thinking_tokens  INTEGER DEFAULT 0,
        thinking_content TEXT,
        latency_ms       INTEGER DEFAULT 0,
        created_at       TEXT DEFAULT NOW()::TEXT
      );

      CREATE TABLE IF NOT EXISTS _zenku_tool_events (
        id          TEXT PRIMARY KEY,
        message_id  TEXT NOT NULL REFERENCES _zenku_chat_messages(id),
        session_id  TEXT NOT NULL,
        agent       TEXT NOT NULL,
        tool_name   TEXT NOT NULL,
        tool_input  TEXT,
        tool_output TEXT,
        success     INTEGER,
        started_at  TEXT,
        finished_at TEXT,
        latency_ms  INTEGER DEFAULT 0
      );

      CREATE INDEX IF NOT EXISTS idx_chat_sessions_user    ON _zenku_chat_sessions(user_id);
      CREATE INDEX IF NOT EXISTS idx_chat_messages_session ON _zenku_chat_messages(session_id);
      CREATE INDEX IF NOT EXISTS idx_tool_events_session   ON _zenku_tool_events(session_id);
      CREATE INDEX IF NOT EXISTS idx_tool_events_message   ON _zenku_tool_events(message_id);

      CREATE TABLE IF NOT EXISTS _zenku_api_keys (
        id           TEXT PRIMARY KEY,
        name         TEXT NOT NULL,
        key_prefix   TEXT NOT NULL,
        key_hash     TEXT NOT NULL UNIQUE,
        scopes       TEXT NOT NULL DEFAULT '[]',
        created_by   TEXT NOT NULL,
        created_at   TEXT DEFAULT NOW()::TEXT,
        expires_at   TEXT,
        last_used_at TEXT,
        revoked      INTEGER NOT NULL DEFAULT 0
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
        created_at  TEXT DEFAULT NOW()::TEXT
      );

      CREATE INDEX IF NOT EXISTS idx_files_record ON _zenku_files(table_name, record_id, field_name);

      CREATE TABLE IF NOT EXISTS _zenku_webhook_logs (
        id           SERIAL PRIMARY KEY,
        triggered_at TEXT    NOT NULL DEFAULT NOW()::TEXT,
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

      CREATE INDEX IF NOT EXISTS idx_webhook_logs_rule_id      ON _zenku_webhook_logs(rule_id);
      CREATE INDEX IF NOT EXISTS idx_webhook_logs_triggered_at ON _zenku_webhook_logs(triggered_at);

      CREATE TABLE IF NOT EXISTS _zenku_oidc_providers (
        id            TEXT PRIMARY KEY,
        name          TEXT NOT NULL,
        issuer        TEXT NOT NULL,
        client_id     TEXT NOT NULL,
        client_secret TEXT NOT NULL,
        enabled       INTEGER NOT NULL DEFAULT 1,
        created_at    TEXT DEFAULT NOW()::TEXT
      );

      CREATE TABLE IF NOT EXISTS _zenku_user_identities (
        id            TEXT PRIMARY KEY,
        user_id       TEXT NOT NULL REFERENCES _zenku_users(id),
        provider_id   TEXT NOT NULL REFERENCES _zenku_oidc_providers(id),
        external_id   TEXT NOT NULL,
        refresh_token TEXT,
        created_at    TEXT DEFAULT NOW()::TEXT,
        UNIQUE(provider_id, external_id)
      );

      CREATE TABLE IF NOT EXISTS _zenku_settings (
        key        TEXT PRIMARY KEY,
        value      TEXT NOT NULL,
        updated_at TEXT DEFAULT NOW()::TEXT
      );

      CREATE TABLE IF NOT EXISTS _zenku_oidc_role_mappings (
        id          TEXT PRIMARY KEY,
        provider_id TEXT NOT NULL REFERENCES _zenku_oidc_providers(id) ON DELETE CASCADE,
        claim_path  TEXT NOT NULL,
        claim_value TEXT NOT NULL,
        zenku_role  TEXT NOT NULL,
        created_at  TEXT DEFAULT NOW()::TEXT
      );

      CREATE TABLE IF NOT EXISTS _zenku_translations (
        key        TEXT NOT NULL,
        locale     TEXT NOT NULL,
        content    TEXT NOT NULL,
        updated_at TEXT DEFAULT NOW()::TEXT,
        PRIMARY KEY (key, locale)
      );
    `);

    // Migrations — PostgreSQL supports ADD COLUMN IF NOT EXISTS (v9.6+)
    await this.sql!.unsafe(`ALTER TABLE _zenku_users ADD COLUMN IF NOT EXISTS disabled INTEGER NOT NULL DEFAULT 0`);
    await this.sql!.unsafe(`ALTER TABLE _zenku_users ADD COLUMN IF NOT EXISTS language TEXT NOT NULL DEFAULT 'en'`);
    await this.sql!.unsafe(`ALTER TABLE _zenku_chat_sessions ADD COLUMN IF NOT EXISTS archived INTEGER NOT NULL DEFAULT 0`);
    await this.sql!.unsafe(`ALTER TABLE _zenku_user_identities ADD COLUMN IF NOT EXISTS refresh_token TEXT`);
  }

  async close(): Promise<void> {
    if (this.sql !== null) {
      await this.sql.end();
      this.sql = null;
    }
  }
}
