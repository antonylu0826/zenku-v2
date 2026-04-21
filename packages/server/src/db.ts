import { DatabaseSync } from 'node:sqlite';
import { createHash, randomBytes } from 'node:crypto';
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

  `);

  // Migrations for existing databases
  try {
    db.exec(`ALTER TABLE _zenku_users ADD COLUMN disabled INTEGER NOT NULL DEFAULT 0`);
  } catch {
    // Column already exists — ignore
  }
  try {
    db.exec(`ALTER TABLE _zenku_users ADD COLUMN language TEXT NOT NULL DEFAULT 'en'`);
  } catch {
    // Column already exists — ignore
  }
  try {
    db.exec(`ALTER TABLE _zenku_chat_sessions ADD COLUMN archived INTEGER NOT NULL DEFAULT 0`);
  } catch {
    // Column already exists — ignore
  }
}

// ===== Session =====

let _sessionId: string | null = null;

export function getSessionId(): string {
  if (!_sessionId) _sessionId = crypto.randomUUID();
  return _sessionId;
}

// ===== Files =====

export interface FileRecord {
  id: string;
  filename: string;
  mime_type: string;
  size: number;
  path: string;
  table_name: string | null;
  record_id: string | null;
  field_name: string | null;
  uploaded_by: string | null;
  created_at: string;
}

export function insertFile(meta: Omit<FileRecord, 'created_at'>): FileRecord {
  const db = getDb();
  db.prepare(`
    INSERT INTO _zenku_files (id, filename, mime_type, size, path, table_name, record_id, field_name, uploaded_by)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(meta.id, meta.filename, meta.mime_type, meta.size, meta.path,
         meta.table_name ?? null, meta.record_id ?? null, meta.field_name ?? null, meta.uploaded_by ?? null);
  return getFile(meta.id)!;
}

export function getFile(id: string): FileRecord | null {
  return getDb().prepare('SELECT * FROM _zenku_files WHERE id = ?').get(id) as unknown as FileRecord | null;
}

export function listFilesByIds(ids: string[]): FileRecord[] {
  if (ids.length === 0) return [];
  const placeholders = ids.map(() => '?').join(',');
  return getDb().prepare(`SELECT * FROM _zenku_files WHERE id IN (${placeholders})`).all(...ids) as unknown as FileRecord[];
}

export function deleteFileRecord(id: string): void {
  getDb().prepare('DELETE FROM _zenku_files WHERE id = ?').run(id);
}

// ===== User tables =====

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

// ===== Journal =====

export interface ReverseOp {
  type: 'sql' | 'drop_column';
  sql?: string;
  table?: string;
  column?: string;
}

export interface JournalWriteInput {
  agent: string;
  type: string;
  description: string;
  diff: { before: unknown; after: unknown };
  reason?: string;
  user_request?: string;
  reversible?: boolean;
  reverse_operations?: ReverseOp[];
}

export function writeJournal(entry: JournalWriteInput): number {
  const db = getDb();
  const result = db.prepare(`
    INSERT INTO _zenku_journal
    (session_id, agent, type, description, diff, reason, user_request, reversible, reverse_operations)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    getSessionId(),
    entry.agent,
    entry.type,
    entry.description,
    JSON.stringify(entry.diff),
    entry.reason ?? '',
    entry.user_request ?? '',
    entry.reversible !== false ? 1 : 0,
    entry.reverse_operations ? JSON.stringify(entry.reverse_operations) : null,
  );
  return Number(result.lastInsertRowid);
}

export interface JournalRow {
  id: number;
  timestamp: string;
  session_id: string;
  agent: string;
  type: string;
  description: string;
  diff: string;
  reason: string | null;
  user_request: string | null;
  reversible: number;
  reverse_operations: string | null;
  reversed: number;
  reversed_by: number | null;
}

export function getRecentJournal(limit = 20): JournalRow[] {
  const db = getDb();
  return db.prepare(
    'SELECT * FROM _zenku_journal WHERE reversed = 0 ORDER BY id DESC LIMIT ?'
  ).all(limit) as unknown as JournalRow[];
}

// ===== Auth helpers =====

export interface UserRow {
  id: string;
  email: string;
  name: string;
  password_hash: string;
  role: 'admin' | 'builder' | 'user';
  language: string;
  created_at: string;
  last_login_at: string | null;
}

export function getUserCount(): number {
  const db = getDb();
  const row = db.prepare('SELECT COUNT(*) as count FROM _zenku_users').get() as { count: number };
  return row.count;
}

export function getUserLanguage(userId: string): string {
  const db = getDb();
  const row = db.prepare('SELECT language FROM _zenku_users WHERE id = ?').get(userId) as { language?: string } | undefined;
  return row?.language || 'en';
}

// ===== API Keys =====

export interface ApiKeyRecord {
  id: string;
  name: string;
  key_prefix: string;
  key_hash: string;
  scopes: string[];
  created_by: string;
  created_at: string;
  expires_at: string | null;
  last_used_at: string | null;
  revoked: number;
}

function hashKey(rawKey: string): string {
  return createHash('sha256').update(rawKey).digest('hex');
}

export function createApiKey(
  name: string,
  scopes: string[],
  createdBy: string,
  expiresAt?: string,
): { rawKey: string; record: Omit<ApiKeyRecord, 'key_hash'> } {
  const random = randomBytes(24).toString('base64url').slice(0, 32);
  const rawKey = `zk_live_${random}`;
  const keyPrefix = `zk_live_${random.slice(0, 4)}`;
  const keyHash = hashKey(rawKey);
  const id = crypto.randomUUID();
  const db = getDb();
  db.prepare(
    `INSERT INTO _zenku_api_keys (id, name, key_prefix, key_hash, scopes, created_by, expires_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  ).run(id, name, keyPrefix, keyHash, JSON.stringify(scopes), createdBy, expiresAt ?? null);
  return {
    rawKey,
    record: { id, name, key_prefix: keyPrefix, scopes, created_by: createdBy, created_at: new Date().toISOString(), expires_at: expiresAt ?? null, last_used_at: null, revoked: 0 },
  };
}

export function verifyApiKey(rawKey: string, requiredScope: string): ApiKeyRecord | null {
  if (!rawKey.startsWith('zk_live_')) return null;
  const keyHash = hashKey(rawKey);
  const db = getDb();
  const row = db.prepare(
    `SELECT * FROM _zenku_api_keys
     WHERE key_hash = ? AND revoked = 0
       AND (expires_at IS NULL OR expires_at > datetime('now'))`
  ).get(keyHash) as (Omit<ApiKeyRecord, 'scopes'> & { scopes: string }) | undefined;
  if (!row) return null;

  const scopes: string[] = JSON.parse(row.scopes);
  if (!hasScope(scopes, requiredScope)) return null;

  db.prepare(`UPDATE _zenku_api_keys SET last_used_at = datetime('now') WHERE id = ?`).run(row.id);
  return { ...row, scopes };
}

export function expandScopes(scopes: string[]): string[] {
  const expanded = new Set(scopes);
  if (expanded.has('mcp:admin')) {
    expanded.add('mcp:write');
    expanded.add('mcp:read');
  }
  if (expanded.has('mcp:write')) {
    expanded.add('mcp:read');
  }
  return [...expanded];
}

function hasScope(keyScopes: string[], required: string): boolean {
  const expanded = expandScopes(keyScopes);
  const [action, resource] = required.split(':');
  return expanded.some(s => {
    const [sa, sr] = s.split(':');
    return sa === action && (sr === '*' || sr === resource);
  });
}

export function listApiKeys(): Omit<ApiKeyRecord, 'key_hash'>[] {
  const db = getDb();
  const rows = db.prepare(
    'SELECT id, name, key_prefix, scopes, created_by, created_at, expires_at, last_used_at, revoked FROM _zenku_api_keys ORDER BY created_at DESC'
  ).all() as (Omit<ApiKeyRecord, 'scopes' | 'key_hash'> & { scopes: string })[];
  return rows.map(r => ({ ...r, scopes: JSON.parse(r.scopes) }));
}

export function revokeApiKey(id: string): boolean {
  const db = getDb();
  const result = db.prepare('UPDATE _zenku_api_keys SET revoked = 1 WHERE id = ?').run(id);
  return result.changes > 0;
}

export function deleteApiKey(id: string): boolean {
  const db = getDb();
  const result = db.prepare('DELETE FROM _zenku_api_keys WHERE id = ?').run(id);
  return result.changes > 0;
}

// ===== Legacy (kept for compatibility) =====

export function logChange(agent: string, action: string, detail: unknown, userRequest: string): void {
  const db = getDb();
  db.prepare(`
    INSERT INTO _zenku_changes (agent, action, detail, user_request)
    VALUES (?, ?, ?, ?)
  `).run(agent, action, JSON.stringify(detail), userRequest ?? '');
}
