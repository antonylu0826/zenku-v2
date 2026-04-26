import mssql from 'mssql';
import type { DbAdapter, ColumnSpec, ColumnInfo, QueryResult, ExecResult, FieldType } from './adapter';

const TYPE_MAP: Record<FieldType, string> = {
  TEXT: 'NVARCHAR(MAX)',
  INTEGER: 'INT',
  REAL: 'FLOAT',
  BLOB: 'VARBINARY(MAX)',
  BOOLEAN: 'BIT',
  DATE: 'DATE',
  DATETIME: 'DATETIME2',
};

function buildDefault(d: string): string {
  switch (d) {
    case 'now': return "CONVERT(NVARCHAR(MAX), GETDATE(), 126)";
    case 'true': return '1';
    case 'false': return '0';
    default: return `'${d}'`;
  }
}

function buildColDef(col: ColumnSpec): string {
  const sqlType = TYPE_MAP[col.type];
  let def = `[${col.name}] ${sqlType}`;

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
    def += ` REFERENCES [${col.references.table}]([${refCol}])`;
  }

  return def;
}

/** Convert ? positional placeholders to @p1, @p2, ... */
function toMssqlParams(sql: string): string {
  let i = 0;
  return sql.replace(/\?/g, () => `@p${++i}`);
}

/**
 * Translate LIMIT/OFFSET syntax to MSSQL-compatible OFFSET/FETCH or TOP:
 *
 *  LIMIT ? OFFSET ?          → OFFSET ? ROWS FETCH NEXT ? ROWS ONLY  (swap last 2 params)
 *  LIMIT N OFFSET M          → OFFSET M ROWS FETCH NEXT N ROWS ONLY
 *  LIMIT ?  (with ORDER BY)  → OFFSET 0 ROWS FETCH NEXT ? ROWS ONLY
 *  LIMIT N  (with ORDER BY)  → OFFSET 0 ROWS FETCH NEXT N ROWS ONLY
 *  LIMIT ?  (no ORDER BY)    → SELECT TOP (?) … (move ? to front of params)
 *  LIMIT 1  (no ORDER BY)    → SELECT TOP 1 …
 *  LIMIT N  (no ORDER BY)    → SELECT TOP N …
 */
function translateLimit(sql: string, params: unknown[]): { sql: string; params: unknown[] } {
  const p = [...params];
  let s = sql.trimEnd();

  // 1. LIMIT ? OFFSET ? — paginated list (needs ORDER BY, has it in all our list queries)
  if (/\bLIMIT\s+\?\s+OFFSET\s+\?$/i.test(s)) {
    const last = p.length - 1;
    [p[last - 1], p[last]] = [p[last], p[last - 1]]; // swap limit ↔ offset
    return {
      sql: s.replace(/\bLIMIT\s+\?\s+OFFSET\s+\?$/i, 'OFFSET ? ROWS FETCH NEXT ? ROWS ONLY'),
      params: p,
    };
  }

  // 2. LIMIT N OFFSET M (hardcoded)
  if (/\bLIMIT\s+\d+\s+OFFSET\s+\d+/i.test(s)) {
    return {
      sql: s.replace(/\bLIMIT\s+(\d+)\s+OFFSET\s+(\d+)/gi, 'OFFSET $2 ROWS FETCH NEXT $1 ROWS ONLY'),
      params: p,
    };
  }

  const hasOrderBy = /\bORDER\s+BY\b/i.test(s);

  // 3. LIMIT ? (single param, with ORDER BY)
  if (/\bLIMIT\s+\?$/i.test(s) && hasOrderBy) {
    return {
      sql: s.replace(/\bLIMIT\s+\?$/i, 'OFFSET 0 ROWS FETCH NEXT ? ROWS ONLY'),
      params: p,
    };
  }

  // 4. LIMIT ? (no ORDER BY) → SELECT TOP (?) — move limit param to front
  if (/\bLIMIT\s+\?$/i.test(s)) {
    const withoutLimit = s.replace(/\bLIMIT\s+\?$/i, '').trimEnd();
    const limitVal = p.pop()!;
    p.unshift(limitVal);
    return {
      sql: withoutLimit.replace(/^(\s*SELECT\s+)/i, '$1TOP (?) '),
      params: p,
    };
  }

  // 5. LIMIT N (hardcoded, with ORDER BY) → OFFSET 0 ROWS FETCH NEXT N
  if (/\bLIMIT\s+\d+\b/i.test(s) && hasOrderBy) {
    return {
      sql: s.replace(/\bLIMIT\s+(\d+)\b/gi, 'OFFSET 0 ROWS FETCH NEXT $1 ROWS ONLY'),
      params: p,
    };
  }

  // 6. LIMIT N (hardcoded, no ORDER BY) → TOP N (handles subqueries and simple queries)
  if (/\bLIMIT\s+(\d+)\b/i.test(s)) {
    // Replace each occurrence: move TOP N right after the nearest SELECT
    return {
      sql: s.replace(/\bSELECT\s+(.*?)\bLIMIT\s+(\d+)\b/gis, (_, cols, n) =>
        `SELECT TOP ${n} ${cols.trimEnd()}`
      ),
      params: p,
    };
  }

  return { sql: s, params: p };
}

/** Translate SQLite json_extract to MSSQL JSON_VALUE */
function translateJsonExtract(sql: string): string {
  return sql.replace(/\bjson_extract\s*\(/gi, 'JSON_VALUE(');
}

function detectType(value: unknown): mssql.ISqlTypeFactoryWithNoParams | mssql.ISqlTypeWithLength {
  if (value === null || value === undefined) return mssql.NVarChar(mssql.MAX);
  if (typeof value === 'boolean') return mssql.Bit;
  if (typeof value === 'bigint') return mssql.BigInt;
  if (typeof value === 'number') return Number.isInteger(value) ? mssql.Int : mssql.Float;
  return mssql.NVarChar(mssql.MAX);
}

/** Inject OUTPUT INSERTED.id before VALUES in an INSERT statement. */
function addOutputClause(sql: string): string {
  return sql.replace(
    /^(\s*INSERT\s+(?:INTO\s+)?\S+\s*(?:\([^)]*\))?\s*)(VALUES\s*\()/i,
    '$1OUTPUT INSERTED.id $2'
  );
}

export class MssqlAdapter implements DbAdapter {
  readonly type = 'mssql';
  private pool!: mssql.ConnectionPool;
  private readonly connectionString: string;
  private initialized = false;

  constructor(connectionString: string) {
    this.connectionString = connectionString;
  }

  async connect(): Promise<void> {
    if (!this.pool || !this.pool.connected) {
      const config: any = {
        options: {
          encrypt: false,
          trustServerCertificate: true,
          enableArithAbort: true
        },
        pool: { max: 1, min: 0 }
      };
      
      if (this.connectionString.startsWith('mssql://')) {
        const url = new URL(this.connectionString);
        config.user = decodeURIComponent(url.username);
        config.password = decodeURIComponent(url.password);
        config.server = url.hostname;
        config.port = url.port ? parseInt(url.port) : 1433;
        config.database = url.pathname.slice(1) || 'master';
      } else {
        this.connectionString.split(';').forEach(part => {
          const [k, v] = part.split('=');
          if (!k || !v) return;
          const key = k.trim().toLowerCase();
          const val = v.trim();
          if (key === 'user id' || key === 'user' || key === 'uid') config.user = val;
          if (key === 'password' || key === 'pwd') config.password = val;
          if (key === 'server' || key === 'data source' || key === 'address') config.server = val;
          if (key === 'database' || key === 'initial catalog') config.database = val;
          if (key === 'port') config.port = parseInt(val);
        });
      }

      // Default values
      if (!config.user) config.user = 'sa';
      if (!config.server) config.server = 'localhost';
      if (!config.port) config.port = 1433;

      // Auto-create database if needed
      if (!this.initialized && config.database && config.database.toLowerCase() !== 'master') {
        const masterConfig = { ...config, database: 'master' };
        const tempPool = new mssql.ConnectionPool(masterConfig);
        try {
          await tempPool.connect();
          const res = await tempPool.request().input('db', mssql.NVarChar, config.database).query('SELECT DB_ID(@db) as id');
          if (!res.recordset[0].id) {
            await tempPool.request().query(`CREATE DATABASE [${config.database}]`);
            console.log(`[MssqlAdapter] Created database: ${config.database}`);
          }
          this.initialized = true;
        } catch (err) {
          console.error('[MssqlAdapter] Failed to ensure DB exists:', err);
        } finally {
          await tempPool.close();
        }
      }

      this.pool = new mssql.ConnectionPool(config);
      await this.pool.connect();
    }
  }

  private async req(): Promise<mssql.Request> {
    await this.connect();
    return this.pool.request();
  }

  private buildRequest(request: mssql.Request, params: unknown[]): void {
    params.forEach((p, i) => {
      request.input(`p${i + 1}`, detectType(p), p ?? null);
    });
  }

  async query<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<QueryResult<T>> {
    const translated = translateLimit(translateJsonExtract(sql), params ?? []);
    const request = await this.req();
    this.buildRequest(request, translated.params);
    const result = await request.query<T>(toMssqlParams(translated.sql));
    return { rows: result.recordset as T[] };
  }

  async execute(sql: string, params?: unknown[]): Promise<ExecResult> {
    const translated = translateLimit(translateJsonExtract(sql), params ?? []);
    const mssqlSql = toMssqlParams(translated.sql);
    const translatedParams = translated.params;
    const isInsert = /^\s*INSERT\s+/i.test(sql);
    const hasOutput = /\bOUTPUT\b/i.test(sql);

    if (isInsert && !hasOutput) {
      try {
        const request = await this.req();
        this.buildRequest(request, translatedParams);
        const result = await request.query<{ id: number }>(addOutputClause(mssqlSql));
        const id = result.recordset[0]?.id;
        return {
          rowsAffected: result.rowsAffected[0] ?? 0,
          lastInsertId: typeof id === 'number' ? id : undefined,
        };
      } catch {
        // Table has no 'id' column — fall through
      }
    }

    const upperSql = sql.trim().toUpperCase();
    if (['BEGIN', 'COMMIT', 'ROLLBACK'].includes(upperSql)) {
      const request = await this.req();
      if (upperSql === 'BEGIN') {
        await request.query('IF @@TRANCOUNT = 0 BEGIN TRANSACTION; SELECT @@TRANCOUNT');
      } else if (upperSql === 'COMMIT') {
        await request.query('IF @@TRANCOUNT > 0 COMMIT TRANSACTION; SELECT @@TRANCOUNT');
      } else if (upperSql === 'ROLLBACK') {
        await request.query('IF @@TRANCOUNT > 0 ROLLBACK TRANSACTION; SELECT @@TRANCOUNT');
      }
      return { rowsAffected: 0 };
    }

    const request = await this.req();
    this.buildRequest(request, translatedParams);
    const result = await request.query(mssqlSql);
    return { rowsAffected: result.rowsAffected[0] ?? 0 };
  }

  async upsertCounter(tableName: string, fieldName: string, period: string): Promise<number> {
    // MSSQL: use MERGE to atomically insert or increment
    const r = await this.req();
    r.input('tbl', mssql.NVarChar(255), tableName);
    r.input('fld', mssql.NVarChar(255), fieldName);
    r.input('per', mssql.NVarChar(255), period);
    const result = await r.query<{ current_value: number }>(`
      MERGE _zenku_counters WITH (HOLDLOCK) AS target
      USING (VALUES (@tbl, @fld, @per, 1)) AS src (table_name, field_name, period, current_value)
        ON  target.table_name = src.table_name
        AND target.field_name = src.field_name
        AND target.period     = src.period
      WHEN MATCHED THEN
        UPDATE SET target.current_value = target.current_value + 1
      WHEN NOT MATCHED THEN
        INSERT (table_name, field_name, period, current_value)
        VALUES (@tbl, @fld, @per, 1)
      OUTPUT inserted.current_value;
    `);
    return result.recordset[0]?.current_value ?? 1;
  }

  async createTable(tableName: string, columns: ColumnSpec[]): Promise<void> {
    const colDefs = [
      'id INT IDENTITY(1,1) PRIMARY KEY',
      ...columns.map(buildColDef),
      'created_at NVARCHAR(MAX) DEFAULT CONVERT(NVARCHAR(MAX), GETDATE(), 126)',
      'updated_at NVARCHAR(MAX) DEFAULT CONVERT(NVARCHAR(MAX), GETDATE(), 126)',
    ];
    await (await this.req()).query(
      `CREATE TABLE [${tableName}] (\n  ${colDefs.join(',\n  ')}\n)`
    );
  }

  async addColumn(tableName: string, column: ColumnSpec): Promise<void> {
    const def = buildColDef(column);
    await (await this.req()).query(`ALTER TABLE [${tableName}] ADD ${def}`);
  }

  async dropColumn(tableName: string, columnName: string): Promise<void> {
    // Step 1: drop default constraint (if any)
    const r1 = await this.req();
    r1.input('tbl', mssql.NVarChar(255), tableName);
    r1.input('col', mssql.NVarChar(255), columnName);
    await r1.query(`
      DECLARE @con NVARCHAR(256) = (
        SELECT dc.name
        FROM sys.default_constraints dc
        JOIN sys.columns c
          ON dc.parent_object_id = c.object_id
         AND dc.parent_column_id = c.column_id
        WHERE c.object_id = OBJECT_ID(@tbl) AND c.name = @col
      );
      IF @con IS NOT NULL
        EXEC('ALTER TABLE [' + @tbl + '] DROP CONSTRAINT [' + @con + ']');
    `);

    // Step 2: drop FK constraints referencing this column
    const r2 = await this.req();
    r2.input('tbl', mssql.NVarChar(255), tableName);
    r2.input('col', mssql.NVarChar(255), columnName);
    const fks = await r2.query<{ fk_name: string }>(`
      SELECT fk.name AS fk_name
      FROM sys.foreign_key_columns fkc
      JOIN sys.foreign_keys fk ON fkc.constraint_object_id = fk.object_id
      WHERE fkc.parent_object_id = OBJECT_ID(@tbl)
        AND COL_NAME(fkc.parent_object_id, fkc.parent_column_id) = @col
    `);
    for (const { fk_name } of fks.recordset) {
      await (await this.req()).query(`ALTER TABLE [${tableName}] DROP CONSTRAINT [${fk_name}]`);
    }

    // Step 3: drop the column
    await (await this.req()).query(`ALTER TABLE [${tableName}] DROP COLUMN [${columnName}]`);
  }

  async dropTable(tableName: string): Promise<void> {
    await (await this.req()).query(
      `IF OBJECT_ID(N'${tableName}', N'U') IS NOT NULL DROP TABLE [${tableName}]`
    );
  }

  async tableExists(tableName: string): Promise<boolean> {
    const r = await this.req();
    r.input('tbl', mssql.NVarChar(255), tableName);
    const result = await r.query(
      `SELECT 1 AS found FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME = @tbl`
    );
    return result.recordset.length > 0;
  }

  async listTables(): Promise<string[]> {
    const result = await (await this.req()).query<{ name: string }>(`
      SELECT TABLE_NAME AS name
      FROM INFORMATION_SCHEMA.TABLES
      WHERE TABLE_TYPE = 'BASE TABLE'
        AND TABLE_NAME NOT LIKE '_zenku_%'
      ORDER BY TABLE_NAME
    `);
    return result.recordset.map(r => r.name);
  }

  async getColumns(tableName: string): Promise<ColumnInfo[]> {
    const r = await this.req();
    r.input('tbl', mssql.NVarChar(255), tableName);
    const result = await r.query<{
      name: string;
      type: string;
      is_nullable: string;
      default_value: string | null;
      is_pk: number;
    }>(`
      SELECT
        c.COLUMN_NAME    AS name,
        c.DATA_TYPE      AS type,
        c.IS_NULLABLE    AS is_nullable,
        c.COLUMN_DEFAULT AS default_value,
        CASE WHEN pk.COLUMN_NAME IS NOT NULL THEN 1 ELSE 0 END AS is_pk
      FROM INFORMATION_SCHEMA.COLUMNS c
      LEFT JOIN (
        SELECT ku.COLUMN_NAME
        FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS tc
        JOIN INFORMATION_SCHEMA.KEY_COLUMN_USAGE ku
          ON tc.CONSTRAINT_NAME = ku.CONSTRAINT_NAME
        WHERE tc.CONSTRAINT_TYPE = 'PRIMARY KEY'
          AND ku.TABLE_NAME = @tbl
      ) pk ON c.COLUMN_NAME = pk.COLUMN_NAME
      WHERE c.TABLE_NAME = @tbl
      ORDER BY c.ORDINAL_POSITION
    `);
    return result.recordset.map(r => ({
      name: r.name,
      type: r.type,
      notNull: r.is_nullable === 'NO',
      defaultValue: r.default_value,
      isPrimaryKey: r.is_pk === 1,
    }));
  }

  async initSystemTables(): Promise<void> {
    // Helper: CREATE TABLE only if it doesn't exist yet
    const createIfAbsent = async (tableName: string, body: string) => {
      await (await this.req()).query(`
        IF OBJECT_ID(N'${tableName}', N'U') IS NULL
        CREATE TABLE ${tableName} (${body})
      `);
    };

    // Helper: CREATE INDEX only if it doesn't exist yet
    const indexIfAbsent = async (name: string, sql: string) => {
      await (await this.req()).query(`
        IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = '${name}')
          ${sql}
      `);
    };

    // Helper: ADD COLUMN only if it doesn't exist yet
    const addColIfAbsent = async (table: string, col: string, def: string) => {
      const r = await this.req();
      r.input('t', mssql.NVarChar(255), table);
      r.input('c', mssql.NVarChar(255), col);
      const exists = await r.query(
        `SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME=@t AND COLUMN_NAME=@c`
      );
      if (exists.recordset.length === 0) {
        await (await this.req()).query(`ALTER TABLE ${table} ADD ${col} ${def}`);
      }
    };

    // NVARCHAR(255) is used for PK, FK, UNIQUE, and indexed columns.
    // NVARCHAR(MAX) is used for text content columns.

    await createIfAbsent('_zenku_users', `
      id            NVARCHAR(255) PRIMARY KEY,
      email         NVARCHAR(255) UNIQUE NOT NULL,
      name          NVARCHAR(MAX) NOT NULL,
      password_hash NVARCHAR(MAX) NOT NULL,
      role          NVARCHAR(MAX) NOT NULL DEFAULT 'user',
      language      NVARCHAR(MAX) NOT NULL DEFAULT 'en',
      disabled      INT NOT NULL DEFAULT 0,
      created_at    NVARCHAR(MAX) DEFAULT CONVERT(NVARCHAR(MAX), GETDATE(), 126),
      last_login_at NVARCHAR(MAX)
    `);

    await createIfAbsent('_zenku_sessions', `
      id         NVARCHAR(255) PRIMARY KEY,
      user_id    NVARCHAR(255) NOT NULL REFERENCES _zenku_users(id),
      token      NVARCHAR(255) UNIQUE NOT NULL,
      expires_at NVARCHAR(MAX) NOT NULL,
      created_at NVARCHAR(MAX) DEFAULT CONVERT(NVARCHAR(MAX), GETDATE(), 126)
    `);

    await createIfAbsent('_zenku_views', `
      id         NVARCHAR(255) PRIMARY KEY,
      name       NVARCHAR(MAX) NOT NULL,
      table_name NVARCHAR(255) NOT NULL,
      definition NVARCHAR(MAX) NOT NULL,
      created_at NVARCHAR(MAX) DEFAULT CONVERT(NVARCHAR(MAX), GETDATE(), 126),
      updated_at NVARCHAR(MAX) DEFAULT CONVERT(NVARCHAR(MAX), GETDATE(), 126)
    `);

    await createIfAbsent('_zenku_changes', `
      id           INT IDENTITY(1,1) PRIMARY KEY,
      timestamp    NVARCHAR(MAX) DEFAULT CONVERT(NVARCHAR(MAX), GETDATE(), 126),
      agent        NVARCHAR(MAX) NOT NULL,
      action       NVARCHAR(MAX) NOT NULL,
      detail       NVARCHAR(MAX),
      user_request NVARCHAR(MAX)
    `);

    await createIfAbsent('_zenku_rules', `
      id           NVARCHAR(255) PRIMARY KEY,
      name         NVARCHAR(MAX) NOT NULL,
      description  NVARCHAR(MAX),
      table_name   NVARCHAR(255) NOT NULL,
      trigger_type NVARCHAR(MAX) NOT NULL,
      condition    NVARCHAR(MAX),
      actions      NVARCHAR(MAX) NOT NULL,
      priority     INT DEFAULT 0,
      enabled      INT DEFAULT 1,
      created_at   NVARCHAR(MAX) DEFAULT CONVERT(NVARCHAR(MAX), GETDATE(), 126),
      updated_at   NVARCHAR(MAX) DEFAULT CONVERT(NVARCHAR(MAX), GETDATE(), 126)
    `);

    await createIfAbsent('_zenku_journal', `
      id                 INT IDENTITY(1,1) PRIMARY KEY,
      timestamp          NVARCHAR(40) DEFAULT CONVERT(NVARCHAR(40), GETDATE(), 126),
      session_id         NVARCHAR(255) NOT NULL,
      agent              NVARCHAR(MAX) NOT NULL,
      type               NVARCHAR(MAX) NOT NULL,
      description        NVARCHAR(MAX) NOT NULL,
      diff               NVARCHAR(MAX) NOT NULL,
      reason             NVARCHAR(MAX),
      user_request       NVARCHAR(MAX),
      reversible         INT DEFAULT 1,
      reverse_operations NVARCHAR(MAX),
      reversed           INT DEFAULT 0,
      reversed_by        INT
    `);

    await indexIfAbsent('idx_journal_session',
      `CREATE INDEX idx_journal_session ON _zenku_journal(session_id)`);
    // timestamp is NVARCHAR(40) so it can be indexed
    await indexIfAbsent('idx_journal_timestamp',
      `CREATE INDEX idx_journal_timestamp ON _zenku_journal(timestamp)`);

    await createIfAbsent('_zenku_chat_sessions', `
      id                    NVARCHAR(255) PRIMARY KEY,
      user_id               NVARCHAR(255) NOT NULL REFERENCES _zenku_users(id),
      title                 NVARCHAR(MAX),
      provider              NVARCHAR(MAX) NOT NULL,
      model                 NVARCHAR(MAX) NOT NULL,
      created_at            NVARCHAR(MAX) DEFAULT CONVERT(NVARCHAR(MAX), GETDATE(), 126),
      updated_at            NVARCHAR(MAX) DEFAULT CONVERT(NVARCHAR(MAX), GETDATE(), 126),
      total_input_tokens    INT DEFAULT 0,
      total_output_tokens   INT DEFAULT 0,
      total_thinking_tokens INT DEFAULT 0,
      total_cost_usd        FLOAT DEFAULT 0,
      message_count         INT DEFAULT 0
    `);

    await createIfAbsent('_zenku_chat_messages', `
      id               NVARCHAR(255) PRIMARY KEY,
      session_id       NVARCHAR(255) NOT NULL REFERENCES _zenku_chat_sessions(id),
      user_id          NVARCHAR(255) NOT NULL,
      role             NVARCHAR(MAX) NOT NULL,
      content          NVARCHAR(MAX) NOT NULL,
      provider         NVARCHAR(MAX),
      model            NVARCHAR(MAX),
      input_tokens     INT DEFAULT 0,
      output_tokens    INT DEFAULT 0,
      thinking_tokens  INT DEFAULT 0,
      thinking_content NVARCHAR(MAX),
      latency_ms       INT DEFAULT 0,
      created_at       NVARCHAR(MAX) DEFAULT CONVERT(NVARCHAR(MAX), GETDATE(), 126)
    `);

    await createIfAbsent('_zenku_tool_events', `
      id          NVARCHAR(255) PRIMARY KEY,
      message_id  NVARCHAR(255) NOT NULL REFERENCES _zenku_chat_messages(id),
      session_id  NVARCHAR(255) NOT NULL,
      agent       NVARCHAR(MAX) NOT NULL,
      tool_name   NVARCHAR(MAX) NOT NULL,
      tool_input  NVARCHAR(MAX),
      tool_output NVARCHAR(MAX),
      success     INT,
      started_at  NVARCHAR(MAX),
      finished_at NVARCHAR(MAX),
      latency_ms  INT DEFAULT 0
    `);

    await indexIfAbsent('idx_chat_sessions_user',
      `CREATE INDEX idx_chat_sessions_user ON _zenku_chat_sessions(user_id)`);
    await indexIfAbsent('idx_chat_messages_session',
      `CREATE INDEX idx_chat_messages_session ON _zenku_chat_messages(session_id)`);
    await indexIfAbsent('idx_tool_events_session',
      `CREATE INDEX idx_tool_events_session ON _zenku_tool_events(session_id)`);
    await indexIfAbsent('idx_tool_events_message',
      `CREATE INDEX idx_tool_events_message ON _zenku_tool_events(message_id)`);

    await createIfAbsent('_zenku_api_keys', `
      id           NVARCHAR(255) PRIMARY KEY,
      name         NVARCHAR(MAX) NOT NULL,
      key_prefix   NVARCHAR(255) NOT NULL,
      key_hash     NVARCHAR(255) NOT NULL UNIQUE,
      scopes       NVARCHAR(MAX) NOT NULL DEFAULT '[]',
      created_by   NVARCHAR(255) NOT NULL,
      created_at   NVARCHAR(MAX) DEFAULT CONVERT(NVARCHAR(MAX), GETDATE(), 126),
      expires_at   NVARCHAR(MAX),
      last_used_at NVARCHAR(MAX),
      revoked      INT NOT NULL DEFAULT 0
    `);

    await createIfAbsent('_zenku_files', `
      id          NVARCHAR(255) PRIMARY KEY,
      filename    NVARCHAR(MAX) NOT NULL,
      mime_type   NVARCHAR(MAX) NOT NULL,
      size        INT NOT NULL,
      path        NVARCHAR(MAX) NOT NULL,
      table_name  NVARCHAR(255),
      record_id   NVARCHAR(255),
      field_name  NVARCHAR(255),
      uploaded_by NVARCHAR(255),
      created_at  NVARCHAR(MAX) DEFAULT CONVERT(NVARCHAR(MAX), GETDATE(), 126)
    `);

    await indexIfAbsent('idx_files_record',
      `CREATE INDEX idx_files_record ON _zenku_files(table_name, record_id, field_name)`);

    await createIfAbsent('_zenku_counters', `
      id            INT IDENTITY(1,1) PRIMARY KEY,
      table_name    NVARCHAR(255) NOT NULL,
      field_name    NVARCHAR(255) NOT NULL,
      period        NVARCHAR(255) NOT NULL DEFAULT '',
      current_value INT NOT NULL DEFAULT 0,
      UNIQUE(table_name, field_name, period)
    `);

    await createIfAbsent('_zenku_webhook_logs', `
      id           INT IDENTITY(1,1) PRIMARY KEY,
      triggered_at NVARCHAR(40) NOT NULL DEFAULT CONVERT(NVARCHAR(40), GETDATE(), 126),
      rule_id      NVARCHAR(255),
      rule_name    NVARCHAR(MAX) NOT NULL,
      table_name   NVARCHAR(255) NOT NULL,
      record_id    NVARCHAR(255),
      trigger_type NVARCHAR(MAX) NOT NULL,
      url          NVARCHAR(MAX) NOT NULL,
      method       NVARCHAR(MAX) NOT NULL DEFAULT 'POST',
      http_status  INT,
      duration_ms  INT,
      status       NVARCHAR(MAX) NOT NULL,
      error        NVARCHAR(MAX)
    `);

    await indexIfAbsent('idx_webhook_logs_rule_id',
      `CREATE INDEX idx_webhook_logs_rule_id ON _zenku_webhook_logs(rule_id)`);
    await indexIfAbsent('idx_webhook_logs_triggered_at',
      `CREATE INDEX idx_webhook_logs_triggered_at ON _zenku_webhook_logs(triggered_at)`);

    await createIfAbsent('_zenku_oidc_providers', `
      id            NVARCHAR(255) PRIMARY KEY,
      name          NVARCHAR(MAX) NOT NULL,
      issuer        NVARCHAR(MAX) NOT NULL,
      client_id     NVARCHAR(MAX) NOT NULL,
      client_secret NVARCHAR(MAX) NOT NULL,
      enabled       INT NOT NULL DEFAULT 1,
      created_at    NVARCHAR(MAX) DEFAULT CONVERT(NVARCHAR(MAX), GETDATE(), 126)
    `);

    await createIfAbsent('_zenku_user_identities', `
      id            NVARCHAR(255) PRIMARY KEY,
      user_id       NVARCHAR(255) NOT NULL REFERENCES _zenku_users(id),
      provider_id   NVARCHAR(255) NOT NULL REFERENCES _zenku_oidc_providers(id),
      external_id   NVARCHAR(MAX) NOT NULL,
      refresh_token NVARCHAR(MAX),
      created_at    NVARCHAR(MAX) DEFAULT CONVERT(NVARCHAR(MAX), GETDATE(), 126)
    `);

    await createIfAbsent('_zenku_settings', `
      key        NVARCHAR(255) PRIMARY KEY,
      value      NVARCHAR(MAX) NOT NULL,
      updated_at NVARCHAR(MAX) DEFAULT CONVERT(NVARCHAR(MAX), GETDATE(), 126)
    `);

    await createIfAbsent('_zenku_oidc_role_mappings', `
      id          NVARCHAR(255) PRIMARY KEY,
      provider_id NVARCHAR(255) NOT NULL REFERENCES _zenku_oidc_providers(id),
      claim_path  NVARCHAR(MAX) NOT NULL,
      claim_value NVARCHAR(MAX) NOT NULL,
      zenku_role  NVARCHAR(MAX) NOT NULL,
      created_at  NVARCHAR(MAX) DEFAULT CONVERT(NVARCHAR(MAX), GETDATE(), 126)
    `);

    await createIfAbsent('_zenku_translations', `
      [key]      NVARCHAR(255) NOT NULL,
      locale     NVARCHAR(50)  NOT NULL,
      content    NVARCHAR(MAX) NOT NULL,
      updated_at NVARCHAR(MAX) DEFAULT CONVERT(NVARCHAR(MAX), GETDATE(), 126),
      PRIMARY KEY ([key], locale)
    `);

    await indexIfAbsent('idx_user_identities_unique',
      `CREATE UNIQUE INDEX idx_user_identities_unique ON _zenku_user_identities(provider_id, external_id)`);

    // Migrations
    await addColIfAbsent('_zenku_users', 'disabled', 'INT NOT NULL DEFAULT 0');
    await addColIfAbsent('_zenku_users', 'language', "NVARCHAR(MAX) NOT NULL DEFAULT 'en'");
    await addColIfAbsent('_zenku_chat_sessions', 'archived', 'INT NOT NULL DEFAULT 0');
    await addColIfAbsent('_zenku_user_identities', 'refresh_token', 'NVARCHAR(MAX)');
  }

  async close(): Promise<void> {
    await this.pool?.close();
  }
}
