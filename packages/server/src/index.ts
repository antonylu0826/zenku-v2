import dotenv from 'dotenv';
import path from 'path';
// CWD = packages/server（npm workspace 執行時），往上兩層到 monorepo root
const envResult = dotenv.config({ path: path.resolve(process.cwd(), '../../.env') });
console.log('[dotenv] path:', path.resolve(process.cwd(), '../../.env'));
console.log('[dotenv] loaded:', !envResult.error, '| ANTHROPIC_API_KEY set:', !!process.env.ANTHROPIC_API_KEY);

import express from 'express';
import cors from 'cors';
import { getDb, getAllViews, getTableSchema } from './db';
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
  const view = views.find(v => v.table_name === tableName);
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
    'SELECT id, email, name, role, created_at, last_login_at FROM _zenku_users ORDER BY created_at'
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
    const aiOptions = provider || model
      ? { provider: provider as 'claude' | 'openai' | 'gemini' | undefined, model }
      : undefined;
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
    executeAfter(table, 'update', updated).catch(err =>
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
// Health check
// ──────────────────────────────────────────────
app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.listen(PORT, () => {
  console.log(`Zenku server running on http://localhost:${PORT}`);
});
