import { Router } from 'express';
import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import { getDb, dbNow } from '../db';
import { getUserTables } from '../db/schema';
import { createApiKey, listApiKeys, revokeApiKey, deleteApiKey } from '../db/auth';
import { listOidcProviders, createOidcProvider, updateOidcProvider, deleteOidcProvider, listRoleMappings, createRoleMapping, deleteRoleMapping } from '../db/oidc';
import { getSetting, setSetting } from '../db/settings';
import { getAllTranslations, upsertTranslation, deleteTranslation } from '../db/translations';
import { reloadI18n } from '../i18n';
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

// ── User Management ───────────────────────────────────────────────────────────
router.get('/admin/users', requireAdmin, async (_req, res) => {
  const { rows } = await getDb().query(
    'SELECT id, email, name, role, disabled, created_at, last_login_at FROM _zenku_users ORDER BY created_at'
  );
  res.json(rows);
});

router.put('/admin/users/:id/role', requireAdmin, async (req, res) => {
  const { role } = req.body as { role?: string };
  if (!['admin', 'builder', 'user'].includes(role ?? '')) {
    res.status(400).json({ error: 'ERROR_INVALID_ROLE' }); return;
  }
  await getDb().execute('UPDATE _zenku_users SET role = ? WHERE id = ?', [role!, String(req.params.id)]);
  res.json({ success: true });
});

router.post('/admin/users', requireAdmin, async (req, res) => {
  const { email, name, password, role = 'user' } = req.body as {
    email?: string; name?: string; password?: string; role?: string;
  };
  if (!email || !name || !password) { res.status(400).json({ error: 'ERROR_MISSING_FIELDS' }); return; }
  if (password.length < 6) { res.status(400).json({ error: 'ERROR_PASSWORD_TOO_SHORT', params: { min: 6 } }); return; }
  if (!['admin', 'builder', 'user'].includes(role)) { res.status(400).json({ error: 'ERROR_INVALID_ROLE' }); return; }
  const db = getDb();
  const { rows } = await db.query('SELECT id FROM _zenku_users WHERE email = ?', [email]);
  if (rows.length > 0) { res.status(409).json({ error: 'ERROR_EMAIL_TAKEN' }); return; }
  const id = crypto.randomUUID();
  const hash = await bcrypt.hash(password, 12);
  await db.execute('INSERT INTO _zenku_users (id, email, name, password_hash, role) VALUES (?, ?, ?, ?, ?)', [id, email, name, hash, role]);
  res.json({ success: true, id });
});

router.patch('/admin/users/:id/disable', requireAdmin, async (req, res) => {
  const id = String(req.params.id);
  if (id === req.user!.id) { res.status(400).json({ error: 'ERROR_CANNOT_DISABLE_SELF' }); return; }
  const db = getDb();
  await db.execute('UPDATE _zenku_users SET disabled = 1 WHERE id = ?', [id]);
  await db.execute('DELETE FROM _zenku_sessions WHERE user_id = ?', [id]);
  res.json({ success: true });
});

router.patch('/admin/users/:id/enable', requireAdmin, async (req, res) => {
  await getDb().execute('UPDATE _zenku_users SET disabled = 0 WHERE id = ?', [String(req.params.id)]);
  res.json({ success: true });
});

router.delete('/admin/users/:id', requireAdmin, async (req, res) => {
  const id = String(req.params.id);
  if (id === req.user!.id) { res.status(400).json({ error: 'ERROR_CANNOT_DELETE_SELF' }); return; }
  const db = getDb();
  await db.execute('DELETE FROM _zenku_sessions WHERE user_id = ?', [id]);
  await db.execute('DELETE FROM _zenku_users WHERE id = ?', [id]);
  res.json({ success: true });
});

router.post('/admin/users/:id/reset-password', requireAdmin, async (req, res) => {
  const { new_password } = req.body as { new_password?: string };
  if (!new_password || new_password.length < 6) {
    res.status(400).json({ error: 'ERROR_PASSWORD_TOO_SHORT', params: { min: 6 } }); return;
  }
  const hash = await bcrypt.hash(new_password, 12);
  const db = getDb();
  await db.execute('UPDATE _zenku_users SET password_hash = ? WHERE id = ?', [hash, String(req.params.id)]);
  await db.execute('DELETE FROM _zenku_sessions WHERE user_id = ?', [String(req.params.id)]);
  res.json({ success: true });
});

// ── Session & History Management ──────────────────────────────────────────────
router.get('/admin/sessions', requireAdmin, async (req, res) => {
  const db = getDb();
  const page = Math.max(1, Number(req.query.page ?? 1));
  const limit = Math.min(100, Math.max(1, Number(req.query.limit ?? 20)));
  const offset = (page - 1) * limit;
  const userId = req.query.user_id ? String(req.query.user_id) : null;
  const provider = req.query.provider ? String(req.query.provider) : null;
  const archivedParam = req.query.archived !== undefined ? String(req.query.archived) : null;

  const conditions: string[] = [];
  const params: unknown[] = [];
  if (userId) { conditions.push('s.user_id = ?'); params.push(userId); }
  if (provider) { conditions.push('s.provider = ?'); params.push(provider); }
  if (archivedParam !== null) {
    conditions.push('s.archived = ?');
    params.push(archivedParam === '1' ? 1 : 0);
  }
  const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

  const { rows: sessions } = await db.query(`
    SELECT s.*, u.name as user_name, u.email as user_email
    FROM _zenku_chat_sessions s
    LEFT JOIN _zenku_users u ON s.user_id = u.id
    ${where} ORDER BY s.updated_at DESC LIMIT ? OFFSET ?
  `, [...params, limit, offset]);

  const { rows: totalRows } = await db.query<{ count: number }>(
    `SELECT COUNT(*) as count FROM _zenku_chat_sessions s ${where}`, params
  );
  res.json({ sessions, total: totalRows[0]?.count ?? 0, page, limit });
});

router.get('/admin/sessions/:id', requireAdmin, async (req, res) => {
  const db = getDb();
  const sessionId = p(req.params.id);
  const { rows: sessionRows } = await db.query(`
    SELECT s.*, u.name as user_name FROM _zenku_chat_sessions s
    LEFT JOIN _zenku_users u ON s.user_id = u.id WHERE s.id = ?
  `, [sessionId]);
  if (!sessionRows[0]) { res.status(404).json({ error: 'ERROR_SESSION_NOT_FOUND' }); return; }

  const { rows: messages } = await db.query<{ id: string }>(
    'SELECT * FROM _zenku_chat_messages WHERE session_id = ? ORDER BY created_at', [sessionId]
  );
  const { rows: toolEvents } = await db.query<{ message_id: string; tool_input: string; tool_output: string }>(
    'SELECT * FROM _zenku_tool_events WHERE session_id = ? ORDER BY started_at', [sessionId]
  );

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
  res.json({ session: sessionRows[0], messages: timeline });
});

router.patch('/admin/sessions/:id/archive', requireAdmin, async (req, res) => {
  const db = getDb();
  const sessionId = p(req.params.id);
  const { rows } = await db.query('SELECT id FROM _zenku_chat_sessions WHERE id = ?', [sessionId]);
  if (!rows[0]) { res.status(404).json({ error: 'ERROR_SESSION_NOT_FOUND' }); return; }
  await db.execute('UPDATE _zenku_chat_sessions SET archived = 1 WHERE id = ?', [sessionId]);
  res.json({ success: true });
});

router.patch('/admin/sessions/:id/unarchive', requireAdmin, async (req, res) => {
  const db = getDb();
  const sessionId = p(req.params.id);
  const { rows } = await db.query('SELECT id FROM _zenku_chat_sessions WHERE id = ?', [sessionId]);
  if (!rows[0]) { res.status(404).json({ error: 'ERROR_SESSION_NOT_FOUND' }); return; }
  await db.execute('UPDATE _zenku_chat_sessions SET archived = 0 WHERE id = ?', [sessionId]);
  res.json({ success: true });
});

router.delete('/admin/sessions/:id', requireAdmin, async (req, res) => {
  const db = getDb();
  const sessionId = p(req.params.id);
  const { rows } = await db.query('SELECT id FROM _zenku_chat_sessions WHERE id = ?', [sessionId]);
  if (!rows[0]) { res.status(404).json({ error: 'ERROR_SESSION_NOT_FOUND' }); return; }
  await db.execute('DELETE FROM _zenku_tool_events WHERE session_id = ?', [sessionId]);
  await db.execute('DELETE FROM _zenku_chat_messages WHERE session_id = ?', [sessionId]);
  await db.execute('DELETE FROM _zenku_chat_sessions WHERE id = ?', [sessionId]);
  res.json({ success: true });
});

router.get('/admin/usage', requireAdmin, async (req, res) => {
  const db = getDb();
  const from = req.query.from ? String(req.query.from) : null;
  const to = req.query.to ? String(req.query.to) : null;
  const dateFilter = from && to ? `WHERE created_at BETWEEN '${from}' AND '${to}'`
    : from ? `WHERE created_at >= '${from}'` : '';

  const { rows: [totals] } = await db.query(`
    SELECT COUNT(*) as total_sessions, SUM(message_count) as total_messages,
      SUM(total_input_tokens) as total_input_tokens, SUM(total_output_tokens) as total_output_tokens,
      SUM(total_cost_usd) as total_cost_usd FROM _zenku_chat_sessions ${dateFilter}
  `);
  const { rows: byProvider } = await db.query(`
    SELECT provider, COUNT(*) as sessions, SUM(message_count) as messages,
      SUM(total_input_tokens + total_output_tokens) as tokens, SUM(total_cost_usd) as cost_usd
    FROM _zenku_chat_sessions ${dateFilter} GROUP BY provider
  `);
  const { rows: byUser } = await db.query(`
    SELECT u.name as user_name, s.user_id, COUNT(*) as sessions,
      SUM(s.message_count) as messages, SUM(s.total_input_tokens + s.total_output_tokens) as tokens,
      SUM(s.total_cost_usd) as cost_usd
    FROM _zenku_chat_sessions s LEFT JOIN _zenku_users u ON s.user_id = u.id
    ${dateFilter} GROUP BY s.user_id ORDER BY cost_usd DESC
  `);
  const { rows: byAgent } = await db.query(`
    SELECT agent, COUNT(*) as calls, AVG(latency_ms) as avg_latency_ms,
      SUM(CASE WHEN success = 0 THEN 1 ELSE 0 END) as error_count
    FROM _zenku_tool_events GROUP BY agent ORDER BY calls DESC
  `);
  // strftime is SQLite-only; falls back to empty on other DBs
  let daily: unknown[] = [];
  try {
    const r = await db.query(`
      SELECT strftime('%Y-%m-%d', created_at) as date,
        SUM(total_input_tokens) as input_tokens, SUM(total_output_tokens) as output_tokens,
        SUM(total_cost_usd) as cost_usd, COUNT(*) as sessions
      FROM _zenku_chat_sessions GROUP BY date ORDER BY date DESC LIMIT 30
    `);
    daily = r.rows;
  } catch { /* non-SQLite */ }
  res.json({ totals, byProvider, byUser, byAgent, daily });
});

// ── Appearance rules ──────────────────────────────────────────────────────────
router.get('/admin/appearance', requireAdmin, async (_req, res) => {
  const { rows: views } = await getDb().query<{
    id: string; name: string; table_name: string; definition: string;
  }>('SELECT id, name, table_name, definition FROM _zenku_views');
  const rules: any[] = [];
  for (const v of views) {
    const def = JSON.parse(v.definition);
    for (const col of (def.columns ?? [])) {
      if (!Array.isArray(col.appearance) || col.appearance.length === 0) continue;
      col.appearance.forEach((rule: any, idx: number) => {
        rules.push({ view_id: v.id, view_name: v.name, table_name: v.table_name, scope: 'column', field_key: col.key, field_label: col.label ?? col.key, rule_index: idx, rule });
      });
    }
    for (const field of (def.form?.fields ?? [])) {
      if (!Array.isArray(field.appearance) || field.appearance.length === 0) continue;
      field.appearance.forEach((rule: any, idx: number) => {
        rules.push({ view_id: v.id, view_name: v.name, table_name: v.table_name, scope: 'form', field_key: field.key, field_label: field.label ?? field.key, rule_index: idx, rule });
      });
    }
  }
  res.json(rules);
});

router.patch('/admin/appearance/toggle', requireAdmin, async (req, res) => {
  const db = getDb();
  const { view_id, field_key, rule_index, scope } = req.body as {
    view_id: string; field_key: string; rule_index: number; scope: 'column' | 'form';
  };
  if (!view_id || !field_key || rule_index === undefined) {
    res.status(400).json({ error: 'ERROR_MISSING_FIELDS' }); return;
  }
  const { rows } = await db.query<{ definition: string }>('SELECT definition FROM _zenku_views WHERE id = ?', [view_id]);
  if (!rows[0]) { res.status(404).json({ error: 'ERROR_VIEW_NOT_FOUND' }); return; }
  const def = JSON.parse(rows[0].definition);
  const fields: any[] = scope === 'form' ? (def.form?.fields ?? []) : (def.columns ?? []);
  const field = fields.find((f: any) => f.key === field_key);
  const rule = field?.appearance?.[rule_index];
  if (!rule) { res.status(404).json({ error: 'ERROR_RULE_NOT_FOUND' }); return; }
  rule.enabled = !rule.enabled;
  await db.execute(
    `UPDATE _zenku_views SET definition = ?, updated_at = ? WHERE id = ?`,
    [JSON.stringify(def), dbNow(), view_id]
  );
  res.json({ success: true, enabled: rule.enabled });
});

router.delete('/admin/appearance/rule', requireAdmin, async (req, res) => {
  const db = getDb();
  const { view_id, field_key, rule_index, scope } = req.body as {
    view_id: string; field_key: string; rule_index: number; scope: 'column' | 'form';
  };
  if (!view_id || !field_key || rule_index === undefined) {
    res.status(400).json({ error: 'ERROR_MISSING_FIELDS' }); return;
  }
  const { rows } = await db.query<{ definition: string }>('SELECT definition FROM _zenku_views WHERE id = ?', [view_id]);
  if (!rows[0]) { res.status(404).json({ error: 'ERROR_VIEW_NOT_FOUND' }); return; }
  const def = JSON.parse(rows[0].definition);
  const fields: any[] = scope === 'form' ? (def.form?.fields ?? []) : (def.columns ?? []);
  const field = fields.find((f: any) => f.key === field_key);
  if (!field || !Array.isArray(field.appearance) || !field.appearance[rule_index]) {
    res.status(404).json({ error: 'ERROR_RULE_NOT_FOUND' }); return;
  }
  field.appearance.splice(rule_index, 1);
  if (field.appearance.length === 0) delete field.appearance;
  await db.execute(
    `UPDATE _zenku_views SET definition = ?, updated_at = ? WHERE id = ?`,
    [JSON.stringify(def), dbNow(), view_id]
  );
  res.json({ success: true });
});

// ── Business rules ────────────────────────────────────────────────────────────
router.get('/admin/rules', requireAdmin, async (_req, res) => {
  const { rows } = await getDb().query<Record<string, unknown>>(
    `SELECT id, name, description, table_name, trigger_type, condition, actions, priority, enabled, created_at, updated_at
     FROM _zenku_rules ORDER BY priority DESC, created_at ASC`
  );
  const rules = rows.map(r => ({
    ...r,
    condition: r.condition ? JSON.parse(r.condition as string) : null,
    actions: r.actions ? JSON.parse(r.actions as string) : [],
    enabled: Boolean(r.enabled),
  }));
  res.json(rules);
});

router.patch('/admin/rules/:id/toggle', requireAdmin, async (req, res) => {
  const db = getDb();
  const id = String(req.params.id);
  const { rows } = await db.query<{ enabled: number }>('SELECT enabled FROM _zenku_rules WHERE id = ?', [id]);
  if (!rows[0]) { res.status(404).json({ error: 'ERROR_RULE_NOT_FOUND' }); return; }
  const next = rows[0].enabled ? 0 : 1;
  await db.execute(`UPDATE _zenku_rules SET enabled = ?, updated_at = ? WHERE id = ?`, [next, dbNow(), id]);
  res.json({ success: true, enabled: Boolean(next) });
});

router.delete('/admin/rules/:id', requireAdmin, async (req, res) => {
  const db = getDb();
  const id = String(req.params.id);
  const { rows } = await db.query('SELECT id FROM _zenku_rules WHERE id = ?', [id]);
  if (!rows[0]) { res.status(404).json({ error: 'ERROR_RULE_NOT_FOUND' }); return; }
  await db.execute('DELETE FROM _zenku_rules WHERE id = ?', [id]);
  res.json({ success: true });
});

// ── Webhook Logs ──────────────────────────────────────────────────────────────
router.get('/admin/webhook-logs', requireAdmin, async (req, res) => {
  const db = getDb();
  const rule_id = req.query.rule_id ? String(req.query.rule_id) : null;
  const status = req.query.status ? String(req.query.status) : null;
  const page = Math.max(1, Number.parseInt(String(req.query.page ?? '1'), 10) || 1);
  const limit = Math.min(100, Math.max(1, Number.parseInt(String(req.query.limit ?? '20'), 10) || 20));
  const offset = (page - 1) * limit;

  const whereParts: string[] = [];
  const params: unknown[] = [];
  if (rule_id) { whereParts.push('rule_id = ?'); params.push(rule_id); }
  if (status) { whereParts.push('status = ?'); params.push(status); }
  const where = whereParts.length > 0 ? `WHERE ${whereParts.join(' AND ')}` : '';

  const { rows } = await db.query(
    `SELECT * FROM _zenku_webhook_logs ${where} ORDER BY id DESC LIMIT ? OFFSET ?`,
    [...params, limit, offset]
  );
  const { rows: totalRows } = await db.query<{ count: number }>(
    `SELECT COUNT(*) AS count FROM _zenku_webhook_logs ${where}`, params
  );
  res.json({ rows, total: totalRows[0]?.count ?? 0, page, limit });
});

// ── System Reset ──────────────────────────────────────────────────────────────
router.post('/reset', requireAdmin, async (_req, res) => {
  try {
    const db = getDb();
    // Drop all tables and re-init
    try { await db.execute('PRAGMA foreign_keys = OFF'); } catch { /* non-SQLite */ }

    const userTables = await db.listTables();
    const systemTables = ['_zenku_users','_zenku_sessions','_zenku_views','_zenku_changes','_zenku_rules','_zenku_journal','_zenku_chat_sessions','_zenku_chat_messages','_zenku_tool_events','_zenku_api_keys','_zenku_files','_zenku_counters','_zenku_webhook_logs'];
    const allTables = [...userTables, ...systemTables];

    for (const name of allTables) {
      await db.execute(`DROP TABLE IF EXISTS "${name}"`).catch(() => {});
    }
    try { await db.execute('PRAGMA foreign_keys = ON'); } catch { /* non-SQLite */ }
    await db.initSystemTables();
    res.json({ success: true, message: 'SUCCESS_SYSTEM_RESET' });
  } catch (err) {
    res.status(500).json({ error: 'ERROR_INTERNAL_SERVER', params: { detail: String(err) } });
  }
});

// ── API Key Management ────────────────────────────────────────────────────────
router.get('/admin/api-keys', requireAdmin, async (_req, res) => {
  res.json(await listApiKeys());
});

router.get('/admin/api-keys/scopes', requireAdmin, async (_req, res) => {
  const tables = await getUserTables();
  const actions = ['read', 'write'];
  const scopes: { value: string; label: string; group: string }[] = [
    { value: 'read:*', label: 'Read all tables', group: 'Global' },
    { value: 'write:*', label: 'Write all tables', group: 'Global' },
    { value: 'webhook:callback', label: 'Webhook callback', group: 'Global' },
    { value: 'mcp:read', label: 'MCP — query & read schema', group: 'MCP' },
    { value: 'mcp:write', label: 'MCP — read + write data', group: 'MCP' },
    { value: 'mcp:admin', label: 'MCP — full access (schema, UI, rules)', group: 'MCP' },
  ];
  for (const table of tables) {
    for (const action of actions) {
      scopes.push({ value: `${action}:${table}`, label: `${action === 'read' ? 'Read' : 'Write'} ${table}`, group: table });
    }
  }
  res.json(scopes);
});

router.post('/admin/api-keys', requireAdmin, async (req, res) => {
  const { name, scopes, expires_at } = req.body as {
    name?: string; scopes?: string[]; expires_at?: string;
  };
  if (!name?.trim()) { res.status(400).json({ error: 'ERROR_MISSING_FIELDS' }); return; }
  if (!Array.isArray(scopes) || scopes.length === 0) {
    res.status(400).json({ error: 'ERROR_API_KEY_NO_SCOPES' }); return;
  }
  const userId = req.user!.id;
  const { rawKey, record } = await createApiKey(name.trim(), scopes, userId, expires_at);
  res.status(201).json({ raw_key: rawKey, record });
});

router.patch('/admin/api-keys/:id/revoke', requireAdmin, async (req, res) => {
  const ok = await revokeApiKey(p(req.params.id));
  if (!ok) { res.status(404).json({ error: 'ERROR_DATA_NOT_FOUND' }); return; }
  res.json({ success: true });
});

router.delete('/admin/api-keys/:id', requireAdmin, async (req, res) => {
  const ok = await deleteApiKey(p(req.params.id));
  if (!ok) { res.status(404).json({ error: 'ERROR_DATA_NOT_FOUND' }); return; }
  res.json({ success: true });
});

router.get('/admin/api-keys/logs', requireAdmin, async (_req, res) => {
  const { rows } = await getDb().query(
    `SELECT id, timestamp, description, diff, user_request
     FROM _zenku_journal WHERE agent = 'ext_api' ORDER BY id DESC LIMIT 100`
  );
  res.json(rows);
});

// ── System Settings ───────────────────────────────────────────────────────────

router.get('/admin/settings', requireAdmin, async (_req, res) => {
  const auth_mode = await getSetting('auth_mode', 'local');
  res.json({ auth_mode });
});

router.put('/admin/settings', requireAdmin, async (req, res) => {
  const { auth_mode } = req.body as { auth_mode?: string };
  if (auth_mode !== undefined) {
    if (!['local', 'sso_only'].includes(auth_mode)) {
      res.status(400).json({ error: 'ERROR_MISSING_FIELDS' });
      return;
    }
    await setSetting('auth_mode', auth_mode);
  }
  res.json({ success: true });
});

// ── OIDC Provider Management ──────────────────────────────────────────────────

router.get('/admin/oidc-providers', requireAdmin, async (_req, res) => {
  const providers = await listOidcProviders();
  // Hide client_secret from response
  res.json(providers.map(p => ({ ...p, client_secret: '***' })));
});

router.post('/admin/oidc-providers', requireAdmin, async (req, res) => {
  const { name, issuer, client_id, client_secret } = req.body as Record<string, string>;
  if (!name?.trim() || !issuer?.trim() || !client_id?.trim() || !client_secret?.trim()) {
    res.status(400).json({ error: 'ERROR_MISSING_FIELDS' });
    return;
  }
  try {
    const provider = await createOidcProvider(name.trim(), issuer.trim(), client_id.trim(), client_secret.trim());
    res.json({ ...provider, client_secret: '***' });
  } catch {
    res.status(500).json({ error: 'ERROR_INTERNAL_SERVER' });
  }
});

router.put('/admin/oidc-providers/:id', requireAdmin, async (req, res) => {
  const { name, issuer, client_id, client_secret, enabled } = req.body as Record<string, unknown>;
  const patch: Record<string, unknown> = {};
  if (typeof name === 'string') patch.name = name.trim();
  if (typeof issuer === 'string') patch.issuer = issuer.trim();
  if (typeof client_id === 'string') patch.client_id = client_id.trim();
  if (typeof client_secret === 'string' && client_secret !== '***') patch.client_secret = client_secret.trim();
  if (typeof enabled === 'number') patch.enabled = enabled;
  const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const ok = await updateOidcProvider(id, patch as Parameters<typeof updateOidcProvider>[1]);
  if (!ok) { res.status(404).json({ error: 'ERROR_NOT_FOUND' }); return; }
  res.json({ success: true });
});

router.delete('/admin/oidc-providers/:id', requireAdmin, async (req, res) => {
  const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const ok = await deleteOidcProvider(id);
  if (!ok) { res.status(404).json({ error: 'ERROR_NOT_FOUND' }); return; }
  res.json({ success: true });
});

// ── Role Mappings ─────────────────────────────────────────────────────────────

router.get('/admin/oidc-providers/:id/role-mappings', requireAdmin, async (req, res) => {
  const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  res.json(await listRoleMappings(id));
});

router.post('/admin/oidc-providers/:id/role-mappings', requireAdmin, async (req, res) => {
  const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const { claim_path, claim_value, zenku_role } = req.body as Record<string, string>;
  if (!claim_path?.trim() || !claim_value?.trim() || !['admin', 'builder', 'user'].includes(zenku_role)) {
    res.status(400).json({ error: 'ERROR_MISSING_FIELDS' });
    return;
  }
  const mapping = await createRoleMapping(id, claim_path.trim(), claim_value.trim(), zenku_role);
  res.json(mapping);
});

router.delete('/admin/oidc-role-mappings/:id', requireAdmin, async (req, res) => {
  const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const ok = await deleteRoleMapping(id);
  if (!ok) { res.status(404).json({ error: 'ERROR_NOT_FOUND' }); return; }
  res.json({ success: true });
});

// ── Translation Management ────────────────────────────────────────────────────

router.get('/admin/translations', requireAdmin, async (_req, res) => {
  const rows = await getAllTranslations();
  res.json(rows);
});

/** Scan all view definitions and return every unique $key found */
router.get('/admin/translations/scan', requireAdmin, async (_req, res) => {
  const { rows } = await getDb().query<{ definition: string }>(
    'SELECT definition FROM _zenku_views'
  );
  const keys = new Set<string>();

  function walk(val: unknown) {
    if (typeof val === 'string') {
      if (val.startsWith('$')) keys.add(val);
      return;
    }
    if (Array.isArray(val)) { val.forEach(walk); return; }
    if (val !== null && typeof val === 'object') {
      Object.values(val as Record<string, unknown>).forEach(walk);
    }
  }

  for (const row of rows) {
    try { walk(JSON.parse(row.definition)); } catch { /* skip malformed */ }
  }

  res.json([...keys].sort());
});

router.put('/admin/translations', requireAdmin, async (req, res) => {
  const { key, locale, content } = req.body as { key?: string; locale?: string; content?: string };
  if (!key || !locale || content === undefined) {
    res.status(400).json({ error: 'ERROR_MISSING_FIELDS' }); return;
  }
  if (!key.startsWith('$')) {
    res.status(400).json({ error: 'Translation key must start with $' }); return;
  }
  await upsertTranslation(key, locale, content);
  await reloadI18n();
  res.json({ success: true });
});

router.delete('/admin/translations', requireAdmin, async (req, res) => {
  const { key, locale } = req.body as { key?: string; locale?: string };
  if (!key || !locale) {
    res.status(400).json({ error: 'ERROR_MISSING_FIELDS' }); return;
  }
  await deleteTranslation(key, locale);
  await reloadI18n();
  res.json({ success: true });
});

export default router;
