import { Router } from 'express';
import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import { getDb, createApiKey, listApiKeys, revokeApiKey, deleteApiKey, getUserTables } from '../db';
import { requireAdmin, requireAuth } from '../middleware/auth';
import { getAvailableProviders, fetchOllamaModels } from '../ai';
import { p } from '../utils';

const router = Router();

// AI providers
router.get('/ai/providers', requireAuth, async (_req, res) => {
  res.json(await getAvailableProviders());
});

router.get('/ai/ollama/models', requireAuth, async (_req, res) => {
  const models = await fetchOllamaModels();
  res.json({ models });
});

// ──────────────────────────────────────────────
// User Management
// ──────────────────────────────────────────────
router.get('/admin/users', requireAdmin, (_req, res) => {
  const db = getDb();
  const users = db.prepare(
    'SELECT id, email, name, role, disabled, created_at, last_login_at FROM _zenku_users ORDER BY created_at'
  ).all();
  res.json(users);
});

router.put('/admin/users/:id/role', requireAdmin, (req, res) => {
  const { role } = req.body as { role?: string };
  if (!['admin', 'builder', 'user'].includes(role ?? '')) {
    res.status(400).json({ error: 'ERROR_INVALID_ROLE' });
    return;
  }
  getDb().prepare('UPDATE _zenku_users SET role = ? WHERE id = ?').run(role!, String(req.params.id));
  res.json({ success: true });
});

router.post('/admin/users', requireAdmin, async (req, res) => {
  const { email, name, password, role = 'user' } = req.body as {
    email?: string; name?: string; password?: string; role?: string;
  };
  if (!email || !name || !password) {
    res.status(400).json({ error: 'ERROR_MISSING_FIELDS' });
    return;
  }
  if (password.length < 6) {
    res.status(400).json({ error: 'ERROR_PASSWORD_TOO_SHORT', params: { min: 6 } });
    return;
  }
  if (!['admin', 'builder', 'user'].includes(role)) {
    res.status(400).json({ error: 'ERROR_INVALID_ROLE' });
    return;
  }
  const db = getDb();
  if (db.prepare('SELECT id FROM _zenku_users WHERE email = ?').get(email)) {
    res.status(409).json({ error: 'ERROR_EMAIL_TAKEN' });
    return;
  }
  const id = crypto.randomUUID();
  const hash = await bcrypt.hash(password, 12);
  db.prepare('INSERT INTO _zenku_users (id, email, name, password_hash, role) VALUES (?, ?, ?, ?, ?)')
    .run(id, email, name, hash, role);
  res.json({ success: true, id });
});

router.patch('/admin/users/:id/disable', requireAdmin, (req, res) => {
  const id = String(req.params.id);
  if (id === req.user!.id) {
    res.status(400).json({ error: 'ERROR_CANNOT_DISABLE_SELF' });
    return;
  }
  getDb().prepare('UPDATE _zenku_users SET disabled = 1 WHERE id = ?').run(id);
  getDb().prepare('DELETE FROM _zenku_sessions WHERE user_id = ?').run(id);
  res.json({ success: true });
});

router.patch('/admin/users/:id/enable', requireAdmin, (req, res) => {
  getDb().prepare('UPDATE _zenku_users SET disabled = 0 WHERE id = ?').run(String(req.params.id));
  res.json({ success: true });
});

router.delete('/admin/users/:id', requireAdmin, (req, res) => {
  const id = String(req.params.id);
  if (id === req.user!.id) {
    res.status(400).json({ error: 'ERROR_CANNOT_DELETE_SELF' });
    return;
  }
  const db = getDb();
  db.prepare('DELETE FROM _zenku_sessions WHERE user_id = ?').run(id);
  db.prepare('DELETE FROM _zenku_users WHERE id = ?').run(id);
  res.json({ success: true });
});

router.post('/admin/users/:id/reset-password', requireAdmin, async (req, res) => {
  const { new_password } = req.body as { new_password?: string };
  if (!new_password || new_password.length < 6) {
    res.status(400).json({ error: 'ERROR_PASSWORD_TOO_SHORT', params: { min: 6 } });
    return;
  }
  const hash = await bcrypt.hash(new_password, 12);
  getDb().prepare('UPDATE _zenku_users SET password_hash = ? WHERE id = ?')
    .run(hash, String(req.params.id));
  getDb().prepare('DELETE FROM _zenku_sessions WHERE user_id = ?').run(String(req.params.id));
  res.json({ success: true });
});

// ──────────────────────────────────────────────
// Session & History Management
// ──────────────────────────────────────────────
router.get('/admin/sessions', requireAdmin, (req, res) => {
  const db = getDb();
  const page = Math.max(1, Number(req.query.page ?? 1));
  const limit = Math.min(100, Math.max(1, Number(req.query.limit ?? 20)));
  const offset = (page - 1) * limit;
  const userId = req.query.user_id ? String(req.query.user_id) : null;
  const provider = req.query.provider ? String(req.query.provider) : null;
  const archivedParam = req.query.archived !== undefined ? String(req.query.archived) : null;

  const conditions: string[] = [];
  const params: (string | number | null)[] = [];
  if (userId) { conditions.push('s.user_id = ?'); params.push(userId); }
  if (provider) { conditions.push('s.provider = ?'); params.push(provider); }
  if (archivedParam !== null) {
    conditions.push('s.archived = ?');
    params.push(archivedParam === '1' ? 1 : 0);
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

  const sessions = db.prepare(`
    SELECT s.*, u.name as user_name, u.email as user_email
    FROM _zenku_chat_sessions s
    LEFT JOIN _zenku_users u ON s.user_id = u.id
    ${where}
    ORDER BY s.updated_at DESC
    LIMIT ? OFFSET ?
  `).all(...params, limit, offset);

  const total = (db.prepare(`SELECT COUNT(*) as count FROM _zenku_chat_sessions s ${where}`).get(...params) as { count: number }).count;

  res.json({ sessions, total, page, limit });
});

router.get('/admin/sessions/:id', requireAdmin, (req, res) => {
  const db = getDb();
  const sessionId = p(req.params.id);

  const session = db.prepare(`
    SELECT s.*, u.name as user_name
    FROM _zenku_chat_sessions s
    LEFT JOIN _zenku_users u ON s.user_id = u.id
    WHERE s.id = ?
  `).get(sessionId);
  if (!session) { res.status(404).json({ error: 'ERROR_SESSION_NOT_FOUND' }); return; }

  const messages = db.prepare('SELECT * FROM _zenku_chat_messages WHERE session_id = ? ORDER BY created_at').all(sessionId) as { id: string }[];
  const toolEvents = db.prepare('SELECT * FROM _zenku_tool_events WHERE session_id = ? ORDER BY started_at').all(sessionId) as { message_id: string; tool_input: string; tool_output: string }[];

  const toolsByMsg: Record<string, unknown[]> = {};
  for (const te of toolEvents) {
    const mid = te.message_id;
    if (!toolsByMsg[mid]) toolsByMsg[mid] = [];
    toolsByMsg[mid].push({
      ...te,
      tool_input: JSON.parse(te.tool_input || '{}'),
      tool_output: JSON.parse(te.tool_output || '{}'),
    });
  }

  const timeline = messages.map(m => ({ ...m, tool_events: toolsByMsg[m.id] ?? [] }));
  res.json({ session, messages: timeline });
});

router.patch('/admin/sessions/:id/archive', requireAdmin, (req, res) => {
  const db = getDb();
  const sessionId = p(req.params.id);
  const session = db.prepare('SELECT id FROM _zenku_chat_sessions WHERE id = ?').get(sessionId);
  if (!session) { res.status(404).json({ error: 'ERROR_SESSION_NOT_FOUND' }); return; }
  db.prepare('UPDATE _zenku_chat_sessions SET archived = 1 WHERE id = ?').run(sessionId);
  res.json({ success: true });
});

router.patch('/admin/sessions/:id/unarchive', requireAdmin, (req, res) => {
  const db = getDb();
  const sessionId = p(req.params.id);
  const session = db.prepare('SELECT id FROM _zenku_chat_sessions WHERE id = ?').get(sessionId);
  if (!session) { res.status(404).json({ error: 'ERROR_SESSION_NOT_FOUND' }); return; }
  db.prepare('UPDATE _zenku_chat_sessions SET archived = 0 WHERE id = ?').run(sessionId);
  res.json({ success: true });
});

router.delete('/admin/sessions/:id', requireAdmin, (req, res) => {
  const db = getDb();
  const sessionId = p(req.params.id);
  const session = db.prepare('SELECT id FROM _zenku_chat_sessions WHERE id = ?').get(sessionId);
  if (!session) { res.status(404).json({ error: 'ERROR_SESSION_NOT_FOUND' }); return; }
  // Delete in dependency order
  db.prepare(`
    DELETE FROM _zenku_tool_events WHERE session_id = ?
  `).run(sessionId);
  db.prepare('DELETE FROM _zenku_chat_messages WHERE session_id = ?').run(sessionId);
  db.prepare('DELETE FROM _zenku_chat_sessions WHERE id = ?').run(sessionId);
  res.json({ success: true });
});

router.get('/admin/usage', requireAdmin, (req, res) => {
  const db = getDb();
  const from = req.query.from ? String(req.query.from) : null;
  const to = req.query.to ? String(req.query.to) : null;

  const dateFilter = from && to
    ? `WHERE created_at BETWEEN '${from}' AND '${to}'`
    : from
    ? `WHERE created_at >= '${from}'`
    : '';

  const totals = db.prepare(`
    SELECT
      COUNT(*) as total_sessions,
      SUM(message_count) as total_messages,
      SUM(total_input_tokens) as total_input_tokens,
      SUM(total_output_tokens) as total_output_tokens,
      SUM(total_cost_usd) as total_cost_usd
    FROM _zenku_chat_sessions ${dateFilter}
  `).get() as Record<string, number>;

  const byProvider = db.prepare(`
    SELECT provider,
      COUNT(*) as sessions,
      SUM(message_count) as messages,
      SUM(total_input_tokens + total_output_tokens) as tokens,
      SUM(total_cost_usd) as cost_usd
    FROM _zenku_chat_sessions ${dateFilter}
    GROUP BY provider
  `).all() as { provider: string; sessions: number; messages: number; tokens: number; cost_usd: number }[];

  const byUser = db.prepare(`
    SELECT u.name as user_name, s.user_id,
      COUNT(*) as sessions,
      SUM(s.message_count) as messages,
      SUM(s.total_input_tokens + s.total_output_tokens) as tokens,
      SUM(s.total_cost_usd) as cost_usd
    FROM _zenku_chat_sessions s
    LEFT JOIN _zenku_users u ON s.user_id = u.id
    ${dateFilter}
    GROUP BY s.user_id
    ORDER BY cost_usd DESC
  `).all();

  const byAgent = db.prepare(`
    SELECT agent,
      COUNT(*) as calls,
      AVG(latency_ms) as avg_latency_ms,
      SUM(CASE WHEN success = 0 THEN 1 ELSE 0 END) as error_count
    FROM _zenku_tool_events
    GROUP BY agent
    ORDER BY calls DESC
  `).all();

  const daily = db.prepare(`
    SELECT
      strftime('%Y-%m-%d', created_at) as date,
      SUM(total_input_tokens) as input_tokens,
      SUM(total_output_tokens) as output_tokens,
      SUM(total_cost_usd) as cost_usd,
      COUNT(*) as sessions
    FROM _zenku_chat_sessions
    GROUP BY date
    ORDER BY date DESC
    LIMIT 30
  `).all();

  res.json({ totals, byProvider, byUser, byAgent, daily });
});

// ──────────────────────────────────────────────
// Appearance rules management
// ──────────────────────────────────────────────
router.get('/admin/appearance', requireAdmin, (_req, res) => {
  const db = getDb();
  const views = db.prepare('SELECT id, name, table_name, definition FROM _zenku_views').all() as any[];
  const rules: any[] = [];

  for (const v of views) {
    const def = JSON.parse(v.definition);

    // Read from table columns
    for (const col of (def.columns ?? [])) {
      if (!Array.isArray(col.appearance) || col.appearance.length === 0) continue;
      col.appearance.forEach((rule: any, idx: number) => {
        rules.push({
          view_id: v.id,
          view_name: v.name,
          table_name: v.table_name,
          scope: 'column',
          field_key: col.key,
          field_label: col.label ?? col.key,
          rule_index: idx,
          rule,
        });
      });
    }

    // Read from form fields
    for (const field of (def.form?.fields ?? [])) {
      if (!Array.isArray(field.appearance) || field.appearance.length === 0) continue;
      field.appearance.forEach((rule: any, idx: number) => {
        rules.push({
          view_id: v.id,
          view_name: v.name,
          table_name: v.table_name,
          scope: 'form',
          field_key: field.key,
          field_label: field.label ?? field.key,
          rule_index: idx,
          rule,
        });
      });
    }
  }
  res.json(rules);
});

router.patch('/admin/appearance/toggle', requireAdmin, (req, res) => {
  const db = getDb();
  const { view_id, field_key, rule_index, scope } = req.body as {
    view_id: string; field_key: string; rule_index: number; scope: 'column' | 'form';
  };
  if (!view_id || !field_key || rule_index === undefined) {
    res.status(400).json({ error: 'ERROR_MISSING_FIELDS' }); return;
  }

  const row = db.prepare('SELECT definition FROM _zenku_views WHERE id = ?').get(view_id) as { definition: string } | undefined;
  if (!row) { res.status(404).json({ error: 'ERROR_VIEW_NOT_FOUND' }); return; }

  const def = JSON.parse(row.definition);
  const fields: any[] = scope === 'form' ? (def.form?.fields ?? []) : (def.columns ?? []);
  const field = fields.find((f: any) => f.key === field_key);
  const rule = field?.appearance?.[rule_index];
  if (!rule) { res.status(404).json({ error: 'ERROR_RULE_NOT_FOUND' }); return; }

  rule.enabled = !rule.enabled;
  db.prepare(`UPDATE _zenku_views SET definition = ?, updated_at = datetime('now') WHERE id = ?`)
    .run(JSON.stringify(def), view_id);

  res.json({ success: true, enabled: rule.enabled });
});

router.delete('/admin/appearance/rule', requireAdmin, (req, res) => {
  const db = getDb();
  const { view_id, field_key, rule_index, scope } = req.body as {
    view_id: string; field_key: string; rule_index: number; scope: 'column' | 'form';
  };
  if (!view_id || !field_key || rule_index === undefined) {
    res.status(400).json({ error: 'ERROR_MISSING_FIELDS' }); return;
  }

  const row = db.prepare('SELECT definition FROM _zenku_views WHERE id = ?').get(view_id) as { definition: string } | undefined;
  if (!row) { res.status(404).json({ error: 'ERROR_VIEW_NOT_FOUND' }); return; }

  const def = JSON.parse(row.definition);
  const fields: any[] = scope === 'form' ? (def.form?.fields ?? []) : (def.columns ?? []);
  const field = fields.find((f: any) => f.key === field_key);
  if (!field || !Array.isArray(field.appearance) || !field.appearance[rule_index]) {
    res.status(404).json({ error: 'ERROR_RULE_NOT_FOUND' }); return;
  }

  field.appearance.splice(rule_index, 1);
  if (field.appearance.length === 0) delete field.appearance;

  db.prepare(`UPDATE _zenku_views SET definition = ?, updated_at = datetime('now') WHERE id = ?`)
    .run(JSON.stringify(def), view_id);

  res.json({ success: true });
});

// ──────────────────────────────────────────────
// Business rules management
// ──────────────────────────────────────────────
router.get('/admin/rules', requireAdmin, (_req, res) => {
  const db = getDb();
  const rows = db.prepare(
    `SELECT id, name, description, table_name, trigger_type, condition, actions, priority, enabled, created_at, updated_at
     FROM _zenku_rules ORDER BY priority DESC, created_at ASC`
  ).all() as Array<Record<string, unknown>>;

  const rules = rows.map(r => ({
    ...r,
    condition: r.condition ? JSON.parse(r.condition as string) : null,
    actions: r.actions ? JSON.parse(r.actions as string) : [],
    enabled: Boolean(r.enabled),
  }));
  res.json(rules);
});

router.patch('/admin/rules/:id/toggle', requireAdmin, (req, res) => {
  const db = getDb();
  const id = String(req.params.id);
  const rule = db.prepare('SELECT enabled FROM _zenku_rules WHERE id = ?').get(id) as { enabled: number } | undefined;
  if (!rule) { res.status(404).json({ error: 'ERROR_RULE_NOT_FOUND' }); return; }
  const next = rule.enabled ? 0 : 1;
  db.prepare(`UPDATE _zenku_rules SET enabled = ?, updated_at = datetime('now') WHERE id = ?`).run(next, id);
  res.json({ success: true, enabled: Boolean(next) });
});

router.delete('/admin/rules/:id', requireAdmin, (req, res) => {
  const db = getDb();
  const id = String(req.params.id);
  const rule = db.prepare('SELECT id FROM _zenku_rules WHERE id = ?').get(id);
  if (!rule) { res.status(404).json({ error: 'ERROR_RULE_NOT_FOUND' }); return; }
  db.prepare('DELETE FROM _zenku_rules WHERE id = ?').run(id);
  res.json({ success: true });
});

// ──────────────────────────────────────────────
// System Reset
// ──────────────────────────────────────────────
router.post('/reset', requireAdmin, (_req, res) => {
  try {
    const db = getDb();
    db.exec('PRAGMA foreign_keys = OFF');
    const tables = db.prepare(`
      SELECT name FROM sqlite_master
      WHERE type='table' AND name NOT LIKE 'sqlite_%'
    `).all() as { name: string }[];

    for (const { name } of tables) {
      db.exec(`DROP TABLE IF EXISTS "${name}"`);
    }
    db.exec('PRAGMA foreign_keys = ON');
 
    db.exec(`
      CREATE TABLE IF NOT EXISTS _zenku_views (
        id TEXT PRIMARY KEY, name TEXT NOT NULL, table_name TEXT NOT NULL,
        definition TEXT NOT NULL, created_at TEXT DEFAULT (datetime('now')),
        updated_at TEXT DEFAULT (datetime('now'))
      );
      CREATE TABLE IF NOT EXISTS _zenku_changes (
        id INTEGER PRIMARY KEY AUTOINCREMENT, timestamp TEXT DEFAULT (datetime('now')),
        agent TEXT NOT NULL, action TEXT NOT NULL, detail TEXT, user_request TEXT
      );
    `);
 
    res.json({ success: true, message: 'SUCCESS_SYSTEM_RESET' });
  } catch (err) {
    res.status(500).json({ error: 'ERROR_INTERNAL_SERVER', params: { detail: String(err) } });
  }
});

// ──────────────────────────────────────────────
// API Key Management
// ──────────────────────────────────────────────

router.get('/admin/api-keys', requireAdmin, (_req, res) => {
  res.json(listApiKeys());
});

router.get('/admin/api-keys/scopes', requireAdmin, (_req, res) => {
  const tables = getUserTables();
  const actions = ['read', 'write'];
  const scopes: { value: string; label: string; group: string }[] = [
    { value: 'read:*', label: '讀取所有資料表', group: '全域' },
    { value: 'write:*', label: '寫入所有資料表', group: '全域' },
    { value: 'webhook:callback', label: 'Webhook 回呼', group: '全域' },
  ];
  for (const table of tables) {
    for (const action of actions) {
      scopes.push({
        value: `${action}:${table}`,
        label: `${action === 'read' ? '讀取' : '寫入'} ${table}`,
        group: table,
      });
    }
  }
  res.json(scopes);
});

router.post('/admin/api-keys', requireAdmin, (req, res) => {
  const { name, scopes, expires_at } = req.body as {
    name?: string;
    scopes?: string[];
    expires_at?: string;
  };
  if (!name?.trim()) {
    res.status(400).json({ error: 'ERROR_MISSING_FIELDS' });
    return;
  }
  if (!Array.isArray(scopes) || scopes.length === 0) {
    res.status(400).json({ error: 'ERROR_API_KEY_NO_SCOPES' });
    return;
  }
  const userId = (req as any).user?.id ?? 'system';
  const { rawKey, record } = createApiKey(name.trim(), scopes, userId, expires_at);
  res.status(201).json({ raw_key: rawKey, record });
});

router.patch('/admin/api-keys/:id/revoke', requireAdmin, (req, res) => {
  const id = p(req.params.id);
  const ok = revokeApiKey(id);
  if (!ok) { res.status(404).json({ error: 'ERROR_DATA_NOT_FOUND' }); return; }
  res.json({ success: true });
});

router.delete('/admin/api-keys/:id', requireAdmin, (req, res) => {
  const id = p(req.params.id);
  const ok = deleteApiKey(id);
  if (!ok) { res.status(404).json({ error: 'ERROR_DATA_NOT_FOUND' }); return; }
  res.json({ success: true });
});

export default router;
