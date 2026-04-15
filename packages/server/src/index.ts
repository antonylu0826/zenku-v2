import dotenv from 'dotenv';
import path from 'path';
import crypto from 'crypto';
import bcrypt from 'bcryptjs';
// CWD = packages/server（npm workspace 執行時），往上兩層到 monorepo root
const envResult = dotenv.config({ path: path.resolve(process.cwd(), '../../.env') });
console.log('[dotenv] path:', path.resolve(process.cwd(), '../../.env'));
console.log('[dotenv] loaded:', !envResult.error, '| ANTHROPIC_API_KEY set:', !!process.env.ANTHROPIC_API_KEY);

import express from 'express';
import cors from 'cors';
import { getDb, getAllViews, getTableSchema, writeJournal } from './db';
import { executeBefore, executeAfter } from './engine/rule-engine';

// 安全欄位名驗證
function isSafeFieldName(name: string): boolean {
  return /^[a-zA-Z_][a-zA-Z0-9_]*$/.test(name);
}

// Express 5's ParamsDictionary allows string | string[]; normalize to string
function p(v: string | string[]): string {
  return Array.isArray(v) ? v[0] ?? '' : v;
}

// 從 view definition 取出 relation columns（供 JOIN 使用）
interface RelationColumnDef {
  key: string;
  relation: { table: string; display_field: string };
}

function getRelationColumns(tableName: string): RelationColumnDef[] {
  const views = getAllViews();
  
  // 先查找直接對應的 view
  let view = views.find(v => v.table_name === tableName);
  
  // 如果找不到，查找該表是否在某個 master-detail view 的 detail_views 中
  if (!view) {
    for (const v of views) {
      try {
        const def = JSON.parse(v.definition) as { detail_views?: { table_name: string; view: { columns?: unknown[] } }[] };
        if (def.detail_views) {
          const detailView = def.detail_views.find(dv => dv.table_name === tableName);
          if (detailView) {
            view = { definition: JSON.stringify(detailView.view) } as any;
            break;
          }
        }
      } catch {
        continue;
      }
    }
  }
  
  if (!view) return [];
  try {
    const def = JSON.parse(view.definition) as { columns?: { key: string; type: string; relation?: { table: string; display_field: string } }[] };
    return (def.columns ?? [])
      .filter(c => c.type === 'relation' && c.relation?.table && c.relation?.display_field)
      .map(c => ({ key: c.key, relation: c.relation! }));
  } catch {
    return [];
  }
}
import { chat } from './orchestrator';
import { getAvailableProviders } from './ai';
import {
  requireAuth, requireAdmin,
  registerHandler, loginHandler, meHandler, logoutHandler, statusHandler,
} from './middleware/auth';

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());

// ──────────────────────────────────────────────
// Auth endpoints
// ──────────────────────────────────────────────
app.get('/api/auth/status', statusHandler);
app.post('/api/auth/register', (req, res) => { void registerHandler(req, res); });
app.post('/api/auth/login', (req, res) => { void loginHandler(req, res); });
app.get('/api/auth/me', requireAuth, meHandler);
app.post('/api/auth/logout', requireAuth, logoutHandler);

// ──────────────────────────────────────────────
// User self-service (any authenticated user)
// ──────────────────────────────────────────────
app.put('/api/users/me', requireAuth, (req, res) => {
  const { name } = req.body as { name?: string };
  if (!name || !name.trim()) {
    res.status(400).json({ error: '姓名不可為空' });
    return;
  }
  const db = getDb();
  db.prepare('UPDATE _zenku_users SET name = ? WHERE id = ?').run(name.trim(), req.user!.id);
  res.json({ success: true, name: name.trim() });
});

app.put('/api/users/me/password', requireAuth, async (req, res) => {
  const { old_password, new_password } = req.body as { old_password?: string; new_password?: string };
  if (!old_password || !new_password) {
    res.status(400).json({ error: '缺少必填欄位' });
    return;
  }
  if (new_password.length < 6) {
    res.status(400).json({ error: '新密碼至少 6 個字元' });
    return;
  }
  const db = getDb();
  const user = db.prepare('SELECT password_hash FROM _zenku_users WHERE id = ?').get(req.user!.id) as { password_hash: string } | undefined;
  if (!user) {
    res.status(404).json({ error: '使用者不存在' });
    return;
  }
  const valid = await bcrypt.compare(old_password, user.password_hash);
  if (!valid) {
    res.status(400).json({ error: '舊密碼不正確' });
    return;
  }
  const hash = await bcrypt.hash(new_password, 12);
  db.prepare('UPDATE _zenku_users SET password_hash = ? WHERE id = ?').run(hash, req.user!.id);
  // Invalidate all other sessions (keep current one)
  const currentToken = req.headers.authorization!.slice(7);
  db.prepare('DELETE FROM _zenku_sessions WHERE user_id = ? AND token != ?').run(req.user!.id, currentToken);
  res.json({ success: true });
});

// ──────────────────────────────────────────────
// AI providers
// ──────────────────────────────────────────────
app.get('/api/ai/providers', requireAuth, (_req, res) => {
  res.json(getAvailableProviders());
});

// ──────────────────────────────────────────────
// Admin endpoints
// ──────────────────────────────────────────────
app.get('/api/admin/users', requireAdmin, (_req, res) => {
  const db = getDb();
  const users = db.prepare(
    'SELECT id, email, name, role, disabled, created_at, last_login_at FROM _zenku_users ORDER BY created_at'
  ).all();
  res.json(users);
});

app.put('/api/admin/users/:id/role', requireAdmin, (req, res) => {
  const { role } = req.body as { role?: string };
  if (!['admin', 'builder', 'user'].includes(role ?? '')) {
    res.status(400).json({ error: '無效的角色' });
    return;
  }
  getDb().prepare('UPDATE _zenku_users SET role = ? WHERE id = ?').run(role!, String(req.params.id));
  res.json({ success: true });
});

app.post('/api/admin/users', requireAdmin, async (req, res) => {
  const { email, name, password, role = 'user' } = req.body as {
    email?: string; name?: string; password?: string; role?: string;
  };
  if (!email || !name || !password) {
    res.status(400).json({ error: '缺少必填欄位' });
    return;
  }
  if (password.length < 6) {
    res.status(400).json({ error: '密碼至少 6 個字元' });
    return;
  }
  if (!['admin', 'builder', 'user'].includes(role)) {
    res.status(400).json({ error: '無效的角色' });
    return;
  }
  const db = getDb();
  if (db.prepare('SELECT id FROM _zenku_users WHERE email = ?').get(email)) {
    res.status(409).json({ error: '此 Email 已被使用' });
    return;
  }
  const id = crypto.randomUUID();
  const hash = await bcrypt.hash(password, 12);
  db.prepare('INSERT INTO _zenku_users (id, email, name, password_hash, role) VALUES (?, ?, ?, ?, ?)')
    .run(id, email, name, hash, role);
  res.json({ success: true, id });
});

app.patch('/api/admin/users/:id/disable', requireAdmin, (req, res) => {
  const id = String(req.params.id);
  if (id === req.user!.id) {
    res.status(400).json({ error: '不可停用自己的帳號' });
    return;
  }
  getDb().prepare('UPDATE _zenku_users SET disabled = 1 WHERE id = ?').run(id);
  // Invalidate existing sessions
  getDb().prepare('DELETE FROM _zenku_sessions WHERE user_id = ?').run(id);
  res.json({ success: true });
});

app.patch('/api/admin/users/:id/enable', requireAdmin, (req, res) => {
  getDb().prepare('UPDATE _zenku_users SET disabled = 0 WHERE id = ?').run(String(req.params.id));
  res.json({ success: true });
});

app.delete('/api/admin/users/:id', requireAdmin, (req, res) => {
  const id = String(req.params.id);
  if (id === req.user!.id) {
    res.status(400).json({ error: '不可刪除自己的帳號' });
    return;
  }
  const db = getDb();
  db.prepare('DELETE FROM _zenku_sessions WHERE user_id = ?').run(id);
  db.prepare('DELETE FROM _zenku_users WHERE id = ?').run(id);
  res.json({ success: true });
});

app.post('/api/admin/users/:id/reset-password', requireAdmin, async (req, res) => {
  const { new_password } = req.body as { new_password?: string };
  if (!new_password || new_password.length < 6) {
    res.status(400).json({ error: '新密碼至少 6 個字元' });
    return;
  }
  const hash = await bcrypt.hash(new_password, 12);
  getDb().prepare('UPDATE _zenku_users SET password_hash = ? WHERE id = ?')
    .run(hash, String(req.params.id));
  // Invalidate existing sessions so user must re-login
  getDb().prepare('DELETE FROM _zenku_sessions WHERE user_id = ?').run(String(req.params.id));
  res.json({ success: true });
});

// ──────────────────────────────────────────────
// Chat endpoint (SSE)
// ──────────────────────────────────────────────
app.post('/api/chat', requireAuth, async (req, res) => {
  const { message, history = [], provider, model } = req.body as {
    message: string;
    history: { role: 'user' | 'assistant'; content: string }[];
    provider?: string;
    model?: string;
  };

  if (!message) {
    res.status(400).json({ error: '缺少 message' });
    return;
  }

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');

  try {
    const role = req.user!.role;
    const aiOptions = {
      provider: provider as 'claude' | 'openai' | 'gemini' | undefined,
      model,
      userId: req.user!.id,
    };
    for await (const chunk of chat(message, history, role, aiOptions)) {
      res.write(`data: ${chunk}\n`);
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    res.write(`data: ${JSON.stringify({ type: 'error', message: msg })}\n`);
  }

  res.end();
});

// ──────────────────────────────────────────────
// Views
// ──────────────────────────────────────────────
app.get('/api/views', requireAuth, (_req, res) => {
  const views = getAllViews();
  res.json(views.map(v => ({ ...v, definition: JSON.parse(v.definition) })));
});

// ──────────────────────────────────────────────
// Generic CRUD for user tables
// ──────────────────────────────────────────────
// ──────────────────────────────────────────────
// 關聯欄位選項端點
// ──────────────────────────────────────────────
app.get('/api/data/:table/options', requireAuth, (req, res) => {
  const table = p(req.params.table);
  if (table.startsWith('_zenku_')) {
    res.status(403).json({ error: '不允許存取系統表' });
    return;
  }

  const valueField = String(req.query.value_field ?? 'id');
  const displayField = String(req.query.display_field ?? 'name');
  const search = String(req.query.search ?? '').trim();
  const id = String(req.query.id ?? '').trim();

  if (!isSafeFieldName(valueField) || !isSafeFieldName(displayField)) {
    res.status(400).json({ error: '無效的欄位名' });
    return;
  }

  try {
    const db = getDb();

    if (id) {
      // 取得特定記錄的顯示值（RelationField 初始化用）
      const row = db.prepare(
        `SELECT "${valueField}" as value, "${displayField}" as label FROM "${table}" WHERE id = ? LIMIT 1`
      ).get(id);
      res.json(row ? [row] : []);
      return;
    }

    if (search) {
      const escaped = search.replaceAll('\\', '\\\\').replaceAll('%', '\\%').replaceAll('_', '\\_');
      const rows = db.prepare(
        `SELECT "${valueField}" as value, "${displayField}" as label FROM "${table}" WHERE "${displayField}" LIKE ? ESCAPE '\\' ORDER BY "${displayField}" LIMIT 50`
      ).all(`%${escaped}%`);
      res.json(rows);
      return;
    }

    const rows = db.prepare(
      `SELECT "${valueField}" as value, "${displayField}" as label FROM "${table}" ORDER BY "${displayField}" LIMIT 100`
    ).all();
    res.json(rows);
  } catch (err) {
    res.status(400).json({ error: String(err) });
  }
});

// GET single record by id (with relation JOIN)
app.get('/api/data/:table/:id', requireAuth, (req, res) => {
  const table = p(req.params.table), id = p(req.params.id);
  if (table.startsWith('_zenku_')) {
    res.status(403).json({ error: '不允許存取系統表' });
    return;
  }
  try {
    const db = getDb();
    const relationCols = getRelationColumns(table);
    const joinClauses = relationCols.map(rc =>
      `LEFT JOIN "${rc.relation.table}" ON "${table}"."${rc.key}" = "${rc.relation.table}"."id"`
    );
    const joinSelects = relationCols.map(rc =>
      `"${rc.relation.table}"."${rc.relation.display_field}" AS "${rc.key}__display"`
    );
    const selectClause = joinSelects.length > 0
      ? `"${table}".*, ${joinSelects.join(', ')}`
      : `"${table}".*`;
    const joinClause = joinClauses.join(' ');

    const row = db.prepare(
      `SELECT ${selectClause} FROM "${table}" ${joinClause} WHERE "${table}".id = ?`
    ).get(id);
    if (!row) {
      res.status(404).json({ error: '找不到資料' });
      return;
    }
    res.json(row);
  } catch (err) {
    res.status(400).json({ error: String(err) });
  }
});

app.get('/api/data/:table', requireAuth, (req, res) => {
  const table = p(req.params.table);
  if (table.startsWith('_zenku_')) {
    res.status(403).json({ error: '不允許存取系統表' });
    return;
  }

  try {
    const db = getDb();
    const schema = getTableSchema(table);
    if (schema.length === 0) {
      res.status(400).json({ error: `找不到資料表或欄位：${table}` });
      return;
    }

    const fieldNames = new Set(schema.map(column => column.name));
    const textFieldNames = schema
      .filter(column => column.type.toUpperCase().includes('TEXT'))
      .map(column => column.name);

    const page = Math.max(1, Number.parseInt(String(req.query.page ?? '1'), 10) || 1);
    const limit = Math.min(100, Math.max(1, Number.parseInt(String(req.query.limit ?? '20'), 10) || 20));
    const offset = (page - 1) * limit;

    const sort = String(req.query.sort ?? '');
    const order = String(req.query.order ?? '').toLowerCase() === 'asc' ? 'ASC' : 'DESC';
    const sortBy = fieldNames.has(sort) ? sort : fieldNames.has('id') ? 'id' : schema[0]?.name;

    // 解析 filter 參數（qs 將 filter[field]=value 解析為 req.query.filter = { field: value }）
    const filterClauses: string[] = [];
    const filterParams: unknown[] = [];
    const filterObj = req.query.filter;
    if (filterObj && typeof filterObj === 'object' && !Array.isArray(filterObj)) {
      for (const [field, value] of Object.entries(filterObj as Record<string, unknown>)) {
        if (isSafeFieldName(field) && fieldNames.has(field)) {
          filterClauses.push(`"${table}"."${field}" = ?`);
          filterParams.push(value);
        }
      }
    }

    const search = String(req.query.search ?? '').trim();
    const escapedSearch = search.replaceAll('\\', '\\\\').replaceAll('%', '\\%').replaceAll('_', '\\_');

    // Build WHERE combining filters + search
    const whereParts: string[] = [];
    const whereParams: unknown[] = [];

    if (filterClauses.length > 0) {
      whereParts.push(...filterClauses);
      whereParams.push(...filterParams);
    }
    if (search && textFieldNames.length > 0) {
      whereParts.push(`(${textFieldNames.map(name => `"${table}"."${name}" LIKE ? ESCAPE '\\'`).join(' OR ')})`);
      whereParams.push(...textFieldNames.map(() => `%${escapedSearch}%`));
    }

    const whereClause = whereParts.length > 0 ? `WHERE ${whereParts.join(' AND ')}` : '';

    // 關聯欄位 LEFT JOIN
    const relationCols = getRelationColumns(table);
    const joinClauses = relationCols.map(rc =>
      `LEFT JOIN "${rc.relation.table}" ON "${table}"."${rc.key}" = "${rc.relation.table}"."id"`
    );
    const joinSelects = relationCols.map(rc =>
      `"${rc.relation.table}"."${rc.relation.display_field}" AS "${rc.key}__display"`
    );

    const selectClause = joinSelects.length > 0
      ? `"${table}".*, ${joinSelects.join(', ')}`
      : `"${table}".*`;
    const joinClause = joinClauses.join(' ');

    type SQLVal = string | number | bigint | null;
    const rows = db
      .prepare(`SELECT ${selectClause} FROM "${table}" ${joinClause} ${whereClause} ORDER BY "${table}"."${sortBy}" ${order} LIMIT ? OFFSET ?`)
      .all(...(whereParams as SQLVal[]), limit, offset);

    const totalResult = db
      .prepare(`SELECT COUNT(*) AS count FROM "${table}" ${joinClause} ${whereClause}`)
      .get(...(whereParams as SQLVal[])) as { count: number };

    res.json({
      rows,
      total: totalResult.count,
      page,
      limit,
    });
  } catch (err) {
    res.status(400).json({ error: String(err) });
  }
});

app.post('/api/data/:table', requireAuth, async (req, res) => {
  const table = p(req.params.table);
  if (table.startsWith('_zenku_')) {
    res.status(403).json({ error: '不允許存取系統表' });
    return;
  }
  try {
    const db = getDb();
    const body = { ...req.body } as Record<string, unknown>;
    delete body.id;
    delete body.created_at;
    delete body.updated_at;

    // Before rules
    const beforeResult = executeBefore(table, 'insert', body);
    if (!beforeResult.allowed) {
      res.status(400).json({ error: beforeResult.errors.join('；') });
      return;
    }
    const finalData = beforeResult.data;

    const keys = Object.keys(finalData);
    const placeholders = keys.map(() => '?').join(', ');
    const values = Object.values(finalData);

    const result = db.prepare(
      `INSERT INTO "${table}" (${keys.map(k => `"${k}"`).join(', ')}) VALUES (${placeholders})`
    ).run(...(values as (string | number | bigint | null)[]));

    const created = db.prepare(`SELECT * FROM "${table}" WHERE id = ?`).get(result.lastInsertRowid) as Record<string, unknown>;
    res.json(created);

    // After rules (non-blocking)
    executeAfter(table, 'insert', created).catch(err =>
      console.error('[RuleEngine] after_insert error:', err)
    );
  } catch (err) {
    res.status(400).json({ error: String(err) });
  }
});

app.put('/api/data/:table/:id', requireAuth, async (req, res) => {
  const table = p(req.params.table), id = p(req.params.id);
  if (table.startsWith('_zenku_')) {
    res.status(403).json({ error: '不允許存取系統表' });
    return;
  }
  try {
    const db = getDb();

    // Fetch old data for "changed" condition
    const oldData = db.prepare(`SELECT * FROM "${table}" WHERE id = ?`).get(id) as Record<string, unknown> | undefined;

    const body = { ...req.body } as Record<string, unknown>;
    delete body.id;
    delete body.created_at;
    body.updated_at = new Date().toISOString();

    // Before rules
    const beforeResult = executeBefore(table, 'update', body, oldData);
    if (!beforeResult.allowed) {
      res.status(400).json({ error: beforeResult.errors.join('；') });
      return;
    }
    const finalData = beforeResult.data;

    const keys = Object.keys(finalData);
    const setClause = keys.map(k => `"${k}" = ?`).join(', ');
    const values = [...Object.values(finalData), id];

    db.prepare(`UPDATE "${table}" SET ${setClause} WHERE id = ?`).run(...(values as (string | number | bigint | null)[]));

    const updated = db.prepare(`SELECT * FROM "${table}" WHERE id = ?`).get(id) as Record<string, unknown>;
    res.json(updated);

    // After rules (non-blocking)
    executeAfter(table, 'update', updated, oldData).catch(err =>
      console.error('[RuleEngine] after_update error:', err)
    );
  } catch (err) {
    res.status(400).json({ error: String(err) });
  }
});

app.delete('/api/data/:table/:id', requireAuth, async (req, res) => {
  const table = p(req.params.table), id = p(req.params.id);
  if (table.startsWith('_zenku_')) {
    res.status(403).json({ error: '不允許存取系統表' });
    return;
  }
  try {
    const db = getDb();

    // Fetch record before delete (for rule conditions + after trigger)
    const deletedData = db.prepare(`SELECT * FROM "${table}" WHERE id = ?`).get(id) as Record<string, unknown> | undefined;

    // Before rules
    if (deletedData) {
      const beforeResult = executeBefore(table, 'delete', deletedData);
      if (!beforeResult.allowed) {
        res.status(400).json({ error: beforeResult.errors.join('；') });
        return;
      }
    }

    // 找出所有以 FK 指向此表的其他使用者表，先刪其明細
    const allTables = (db.prepare(
      `SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_zenku_%'`
    ).all() as { name: string }[]).map(r => r.name).filter(t => t !== table);

    db.exec('BEGIN');
    try {
      for (const childTable of allTables) {
        const fkList = db.prepare(`PRAGMA foreign_key_list("${childTable}")`).all() as {
          table: string; from: string;
        }[];
        for (const fk of fkList) {
          if (fk.table === table) {
            db.prepare(`DELETE FROM "${childTable}" WHERE "${fk.from}" = ?`).run(id);
          }
        }
      }
      db.prepare(`DELETE FROM "${table}" WHERE id = ?`).run(id);
      db.exec('COMMIT');
    } catch (innerErr) {
      db.exec('ROLLBACK');
      throw innerErr;
    }
    res.json({ success: true });

    // After rules (non-blocking)
    if (deletedData) {
      executeAfter(table, 'delete', deletedData).catch(err =>
        console.error('[RuleEngine] after_delete error:', err)
      );
    }
  } catch (err) {
    res.status(400).json({ error: String(err) });
  }
});

// ──────────────────────────────────────────────
// Reset（刪除所有使用者資料表和 views）
// ──────────────────────────────────────────────
app.post('/api/reset', (_req, res) => {
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

    // 重建系統表
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

    res.json({ success: true, message: '已重置所有資料' });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

// ──────────────────────────────────────────────
// Dashboard query endpoint (SELECT only)
// ──────────────────────────────────────────────
app.post('/api/query', requireAuth, (req, res) => {
  const { sql } = req.body as { sql?: string };
  if (!sql || typeof sql !== 'string') {
    res.status(400).json({ error: '缺少 sql 參數' });
    return;
  }
  const normalized = sql.trim().toUpperCase();
  if (!normalized.startsWith('SELECT')) {
    res.status(400).json({ error: '只允許 SELECT 查詢' });
    return;
  }
  try {
    const db = getDb();
    // Append LIMIT if not present, capped at 1000 rows
    const safeSQL = /\bLIMIT\b/i.test(sql) ? sql : `${sql} LIMIT 1000`;
    const rows = db.prepare(safeSQL).all();
    res.json(rows);
  } catch (err) {
    res.status(400).json({ error: String(err) });
  }
});

// ──────────────────────────────────────────────
// Admin — chat history
// ──────────────────────────────────────────────
app.get('/api/admin/sessions', requireAdmin, (req, res) => {
  const db = getDb();
  const page = Math.max(1, Number(req.query.page ?? 1));
  const limit = Math.min(100, Math.max(1, Number(req.query.limit ?? 20)));
  const offset = (page - 1) * limit;
  const userId = req.query.user_id ? String(req.query.user_id) : null;
  const provider = req.query.provider ? String(req.query.provider) : null;

  const conditions: string[] = [];
  const params: (string | number | null)[] = [];
  if (userId) { conditions.push('s.user_id = ?'); params.push(userId); }
  if (provider) { conditions.push('s.provider = ?'); params.push(provider); }

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

app.get('/api/admin/sessions/:id', requireAdmin, (req, res) => {
  const db = getDb();
  const sessionId = p(req.params.id);

  const session = db.prepare(`
    SELECT s.*, u.name as user_name
    FROM _zenku_chat_sessions s
    LEFT JOIN _zenku_users u ON s.user_id = u.id
    WHERE s.id = ?
  `).get(sessionId);

  if (!session) { res.status(404).json({ error: '找不到 session' }); return; }

  const messages = db.prepare(
    'SELECT * FROM _zenku_chat_messages WHERE session_id = ? ORDER BY created_at'
  ).all(sessionId) as { id: string }[];

  const toolEvents = db.prepare(
    'SELECT * FROM _zenku_tool_events WHERE session_id = ? ORDER BY started_at'
  ).all(sessionId) as { message_id: string; tool_input: string; tool_output: string }[];

  // Attach tool events to their parent messages
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

  const timeline = messages.map(m => ({
    ...m,
    tool_events: toolsByMsg[m.id] ?? [],
  }));

  res.json({ session, messages: timeline });
});

app.get('/api/admin/usage', requireAdmin, (req, res) => {
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
// Webhook callback
// ──────────────────────────────────────────────
function authenticateWebhook(req: import('express').Request, res: import('express').Response, next: import('express').NextFunction): void {
  const secret = process.env.WEBHOOK_SECRET;
  if (!secret) { next(); return; }  // if no secret configured, allow all

  const signature = req.headers['x-zenku-signature'];
  const expected = crypto
    .createHmac('sha256', secret)
    .update(JSON.stringify(req.body))
    .digest('hex');

  if (signature !== expected) {
    res.status(401).json({ error: 'Invalid signature' });
    return;
  }
  next();
}

app.post('/api/webhook/callback', authenticateWebhook, (req, res) => {
  const { table, record_id, updates } = req.body as {
    table?: string;
    record_id?: unknown;
    updates?: Record<string, unknown>;
  };

  if (!table || !record_id || !updates || typeof updates !== 'object') {
    res.status(400).json({ error: '缺少必要欄位：table, record_id, updates' });
    return;
  }
  if (String(table).startsWith('_zenku_')) {
    res.status(403).json({ error: '不允許修改系統表' });
    return;
  }

  try {
    const db = getDb();
    const keys = Object.keys(updates);
    if (keys.length === 0) { res.json({ success: true }); return; }

    const setClause = keys.map(k => `"${k}" = ?`).join(', ');
    db.prepare(`UPDATE "${table}" SET ${setClause} WHERE id = ?`)
      .run(...(Object.values(updates) as (string | number | null)[]), record_id as string | number);

    writeJournal({
      agent: 'logic',
      type: 'rule_change',
      description: `Webhook 回呼更新 ${table} #${String(record_id)}`,
      diff: { before: null, after: updates },
      user_request: 'webhook callback',
      reversible: false,
    });

    res.json({ success: true });
  } catch (err) {
    res.status(400).json({ error: String(err) });
  }
});

// ──────────────────────────────────────────────
// Production static file serving
// ──────────────────────────────────────────────
if (process.env.NODE_ENV === 'production') {
  const publicDir = path.join(__dirname, '../public');
  app.use(express.static(publicDir));
  app.get('*', (_req, res) => {
    res.sendFile(path.join(publicDir, 'index.html'));
  });
}

// ──────────────────────────────────────────────
// Health check
// ──────────────────────────────────────────────
app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.listen(PORT, () => {
  console.log(`Zenku server running on http://localhost:${PORT}`);
});
