import { Router } from 'express';
import { getDb, getTableSchema, getUserTables, writeJournal } from '../db';
import { requireApiKey } from '../middleware/api-key-auth';
import { executeBefore, executeAfter } from '../engine/rule-engine';
import { recalculateComputedFields } from '../engine/formula-handler';
import { p, isSafeFieldName, getRelationColumns } from '../utils';

const router = Router();

// ──────────────────────────────────────────────
// GET /openapi.json — dynamic OpenAPI 3.0 spec
// ──────────────────────────────────────────────

function sqliteTypeToOpenApi(sqlType: string): { type: string; format?: string } {
  const t = sqlType.toUpperCase();
  if (t.includes('INT')) return { type: 'integer' };
  if (t.includes('REAL') || t.includes('FLOAT') || t.includes('DOUBLE') || t.includes('NUMERIC')) return { type: 'number' };
  if (t.includes('BOOL')) return { type: 'boolean' };
  return { type: 'string' };
}

router.get('/openapi.json', (_req, res) => {
  const tables = getUserTables();

  const paths: Record<string, unknown> = {
    '/api/ext/webhook/callback': {
      post: {
        summary: 'Webhook callback write-back',
        tags: ['webhook'],
        security: [{ bearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['table', 'record_id', 'updates'],
                properties: {
                  table: { type: 'string', description: 'Target table name' },
                  record_id: { type: 'string', description: 'Record ID to update' },
                  updates: { type: 'object', additionalProperties: true },
                },
              },
            },
          },
        },
        responses: { '200': { description: 'OK' } },
      },
    },
  };

  const schemas: Record<string, unknown> = {};
  const readOnlyFields = ['id', 'created_at', 'updated_at'];

  for (const table of tables) {
    const columns = getTableSchema(table);
    const properties: Record<string, unknown> = {};

    for (const col of columns) {
      const oaType = sqliteTypeToOpenApi(col.type);
      properties[col.name] = {
        ...oaType,
        ...(readOnlyFields.includes(col.name) ? { readOnly: true } : {}),
      };
    }

    schemas[table] = { type: 'object', properties };

    const writeableProps: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(properties)) {
      if (!readOnlyFields.includes(k)) writeableProps[k] = v;
    }
    const writeSchema = { type: 'object', properties: writeableProps };

    const collectionPath = `/api/ext/data/${table}`;
    const itemPath = `/api/ext/data/${table}/{id}`;

    paths[collectionPath] = {
      get: {
        summary: `List ${table}`,
        tags: [table],
        security: [{ bearerAuth: [] }],
        parameters: [
          { name: 'page', in: 'query', schema: { type: 'integer', default: 1 } },
          { name: 'limit', in: 'query', schema: { type: 'integer', default: 20, maximum: 100 } },
          { name: 'sort', in: 'query', schema: { type: 'string' } },
          { name: 'order', in: 'query', schema: { type: 'string', enum: ['asc', 'desc'] } },
          { name: 'search', in: 'query', schema: { type: 'string' } },
        ],
        responses: {
          '200': {
            description: 'Paginated list',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    rows: { type: 'array', items: { $ref: `#/components/schemas/${table}` } },
                    total: { type: 'integer' },
                    page: { type: 'integer' },
                    limit: { type: 'integer' },
                  },
                },
              },
            },
          },
        },
      },
      post: {
        summary: `Create ${table}`,
        tags: [table],
        security: [{ bearerAuth: [] }],
        requestBody: {
          required: true,
          content: { 'application/json': { schema: writeSchema } },
        },
        responses: {
          '201': {
            description: 'Created record',
            content: { 'application/json': { schema: { $ref: `#/components/schemas/${table}` } } },
          },
        },
      },
    };

    paths[itemPath] = {
      get: {
        summary: `Get ${table} by ID`,
        tags: [table],
        security: [{ bearerAuth: [] }],
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        responses: {
          '200': { content: { 'application/json': { schema: { $ref: `#/components/schemas/${table}` } } } },
          '404': { description: 'Not found' },
        },
      },
      patch: {
        summary: `Partial update ${table}`,
        tags: [table],
        security: [{ bearerAuth: [] }],
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        requestBody: {
          required: true,
          content: { 'application/json': { schema: writeSchema } },
        },
        responses: {
          '200': { content: { 'application/json': { schema: { $ref: `#/components/schemas/${table}` } } } },
          '404': { description: 'Not found' },
        },
      },
    };
  }

  const spec = {
    openapi: '3.0.0',
    info: {
      title: 'Zenku External API',
      version: '1.0.0',
      description: 'External API for integrating n8n, Zapier, and other automation tools with Zenku.',
    },
    components: {
      securitySchemes: {
        bearerAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'zk_live_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx',
        },
      },
      schemas,
    },
    paths,
  };

  res.json(spec);
});

// ──────────────────────────────────────────────
// GET /:table — list records
// ──────────────────────────────────────────────
router.get('/data/:table', requireApiKey('read:*'), (req, res) => {
  const table = p(req.params.table);

  // Check specific table scope too
  const scopes = req.apiKeyScopes ?? [];
  const canRead = scopes.some(s => s === 'read:*' || s === `read:${table}`);
  if (!canRead) {
    res.status(403).json({ error: 'ERROR_API_KEY_INVALID_OR_INSUFFICIENT_SCOPE' });
    return;
  }

  if (!isSafeFieldName(table)) { res.status(400).json({ error: 'ERROR_INVALID_TABLE' }); return; }
  if (table.startsWith('_zenku_')) { res.status(403).json({ error: 'ERROR_FORBIDDEN_SYSTEM_TABLE' }); return; }

  try {
    const db = getDb();
    const schema = getTableSchema(table);
    if (schema.length === 0) {
      res.status(404).json({ error: 'ERROR_TABLE_NOT_FOUND', params: { table } });
      return;
    }

    const fieldNames = new Set(schema.map(c => c.name));
    const textFields = schema.filter(c => c.type.toUpperCase().includes('TEXT')).map(c => c.name);

    const page = Math.max(1, Number.parseInt(String(req.query.page ?? '1'), 10) || 1);
    const limit = Math.min(100, Math.max(1, Number.parseInt(String(req.query.limit ?? '20'), 10) || 20));
    const offset = (page - 1) * limit;
    const sort = String(req.query.sort ?? '');
    const order = String(req.query.order ?? '').toLowerCase() === 'asc' ? 'ASC' : 'DESC';
    const sortBy = fieldNames.has(sort) ? sort : 'id';

    const whereParts: string[] = [];
    const whereParams: unknown[] = [];

    const filterObj = req.query.filter;
    if (filterObj && typeof filterObj === 'object' && !Array.isArray(filterObj)) {
      for (const [field, value] of Object.entries(filterObj as Record<string, unknown>)) {
        if (isSafeFieldName(field) && fieldNames.has(field)) {
          whereParts.push(`"${table}"."${field}" = ?`);
          whereParams.push(value);
        }
      }
    }

    const search = String(req.query.search ?? '').trim();
    if (search && textFields.length > 0) {
      const esc = search.replaceAll('\\', '\\\\').replaceAll('%', '\\%').replaceAll('_', '\\_');
      whereParts.push(`(${textFields.map(f => `"${table}"."${f}" LIKE ? ESCAPE '\\'`).join(' OR ')})`);
      whereParams.push(...textFields.map(() => `%${esc}%`));
    }

    const whereClause = whereParts.length > 0 ? `WHERE ${whereParts.join(' AND ')}` : '';
    const relationCols = getRelationColumns(table);
    const joinClause = relationCols.map(rc =>
      `LEFT JOIN "${rc.relation.table}" ON "${table}"."${rc.key}" = "${rc.relation.table}"."id"`
    ).join(' ');
    const selectClause = relationCols.length > 0
      ? `"${table}".*, ${relationCols.map(rc => `"${rc.relation.table}"."${rc.relation.display_field}" AS "${rc.key}__display"`).join(', ')}`
      : `"${table}".*`;

    const queryParams = [...whereParams, limit, offset] as any[];
    const rows = db.prepare(
      `SELECT ${selectClause} FROM "${table}" ${joinClause} ${whereClause} ORDER BY "${table}"."${sortBy}" ${order} LIMIT ? OFFSET ?`
    ).all(...queryParams);
    const countParams = [...whereParams] as any[];
    const total = (db.prepare(`SELECT COUNT(*) AS count FROM "${table}" ${joinClause} ${whereClause}`).get(...countParams) as { count: number }).count;

    res.json({ rows, total, page, limit });
  } catch (err) {
    res.status(500).json({ error: 'ERROR_INTERNAL_SERVER', params: { detail: String(err) } });
  }
});

// ──────────────────────────────────────────────
// GET /:table/:id — single record
// ──────────────────────────────────────────────
router.get('/data/:table/:id', requireApiKey('read:*'), (req, res) => {
  const table = p(req.params.table);
  const id = p(req.params.id);

  const scopes = req.apiKeyScopes ?? [];
  if (!scopes.some(s => s === 'read:*' || s === `read:${table}`)) {
    res.status(403).json({ error: 'ERROR_API_KEY_INVALID_OR_INSUFFICIENT_SCOPE' }); return;
  }
  if (!isSafeFieldName(table)) { res.status(400).json({ error: 'ERROR_INVALID_TABLE' }); return; }
  if (table.startsWith('_zenku_')) { res.status(403).json({ error: 'ERROR_FORBIDDEN_SYSTEM_TABLE' }); return; }

  try {
    const db = getDb();
    const relationCols = getRelationColumns(table);
    const joinClause = relationCols.map(rc =>
      `LEFT JOIN "${rc.relation.table}" ON "${table}"."${rc.key}" = "${rc.relation.table}"."id"`
    ).join(' ');
    const selectClause = relationCols.length > 0
      ? `"${table}".*, ${relationCols.map(rc => `"${rc.relation.table}"."${rc.relation.display_field}" AS "${rc.key}__display"`).join(', ')}`
      : `"${table}".*`;

    const row = db.prepare(`SELECT ${selectClause} FROM "${table}" ${joinClause} WHERE "${table}".id = ?`).get(id);
    if (!row) { res.status(404).json({ error: 'ERROR_DATA_NOT_FOUND' }); return; }
    res.json(row);
  } catch (err) {
    res.status(500).json({ error: 'ERROR_INTERNAL_SERVER', params: { detail: String(err) } });
  }
});

// ──────────────────────────────────────────────
// POST /:table — create record
// ──────────────────────────────────────────────
router.post('/data/:table', requireApiKey('write:*'), async (req, res) => {
  const table = p(req.params.table);

  const scopes = req.apiKeyScopes ?? [];
  if (!scopes.some(s => s === 'write:*' || s === `write:${table}`)) {
    res.status(403).json({ error: 'ERROR_API_KEY_INVALID_OR_INSUFFICIENT_SCOPE' }); return;
  }
  if (!isSafeFieldName(table)) { res.status(400).json({ error: 'ERROR_INVALID_TABLE' }); return; }
  if (table.startsWith('_zenku_')) { res.status(403).json({ error: 'ERROR_FORBIDDEN_SYSTEM_TABLE' }); return; }

  try {
    const db = getDb();
    const body = { ...req.body } as Record<string, unknown>;
    delete body.id; delete body.created_at; delete body.updated_at;

    const beforeResult = await executeBefore(table, 'insert', body);
    if (!beforeResult.allowed) {
      res.status(400).json({ error: 'ERROR_RULE_VALIDATION', params: { details: beforeResult.errors.join('; ') } });
      return;
    }
    const finalData = recalculateComputedFields(table, beforeResult.data);
    const keys = Object.keys(finalData);
    const result = db.prepare(
      `INSERT INTO "${table}" (${keys.map(k => `"${k}"`).join(', ')}) VALUES (${keys.map(() => '?').join(', ')})`
    ).run(...(Object.values(finalData) as any[]));
    const created = db.prepare(`SELECT * FROM "${table}" WHERE id = ?`).get(result.lastInsertRowid);
    res.status(201).json(created);
    executeAfter(table, 'insert', created as Record<string, unknown>).catch(err =>
      console.error('[ExtAPI] after_insert error:', err)
    );
  } catch (err) {
    res.status(500).json({ error: 'ERROR_INTERNAL_SERVER', params: { detail: String(err) } });
  }
});

// ──────────────────────────────────────────────
// PATCH /:table/:id — partial update
// ──────────────────────────────────────────────
router.patch('/data/:table/:id', requireApiKey('write:*'), async (req, res) => {
  const table = p(req.params.table);
  const id = p(req.params.id);

  const scopes = req.apiKeyScopes ?? [];
  if (!scopes.some(s => s === 'write:*' || s === `write:${table}`)) {
    res.status(403).json({ error: 'ERROR_API_KEY_INVALID_OR_INSUFFICIENT_SCOPE' }); return;
  }
  if (!isSafeFieldName(table)) { res.status(400).json({ error: 'ERROR_INVALID_TABLE' }); return; }
  if (table.startsWith('_zenku_')) { res.status(403).json({ error: 'ERROR_FORBIDDEN_SYSTEM_TABLE' }); return; }

  try {
    const db = getDb();
    const oldData = db.prepare(`SELECT * FROM "${table}" WHERE id = ?`).get(id) as Record<string, unknown> | undefined;
    if (!oldData) { res.status(404).json({ error: 'ERROR_DATA_NOT_FOUND' }); return; }

    // Merge: only update provided fields, keep the rest
    const body = { ...req.body } as Record<string, unknown>;
    delete body.id; delete body.created_at;
    body.updated_at = new Date().toISOString();

    const merged = { ...oldData, ...body };
    delete merged.id; delete merged.created_at;

    const beforeResult = await executeBefore(table, 'update', merged, oldData);
    if (!beforeResult.allowed) {
      res.status(400).json({ error: 'ERROR_RULE_VALIDATION', params: { details: beforeResult.errors.join('; ') } });
      return;
    }
    const finalData = recalculateComputedFields(table, beforeResult.data);
    const keys = Object.keys(finalData);
    db.prepare(
      `UPDATE "${table}" SET ${keys.map(k => `"${k}" = ?`).join(', ')} WHERE id = ?`
    ).run(...(Object.values(finalData) as any[]), id);

    const updated = db.prepare(`SELECT * FROM "${table}" WHERE id = ?`).get(id) as Record<string, unknown>;
    res.json(updated);

    writeJournal({
      agent: 'ext_api', type: 'data_change',
      description: `API Key [${req.apiKeyId}] PATCH ${table} #${id}`,
      diff: { before: oldData, after: updated },
      user_request: 'api_key_patch',
      reversible: true,
    });

    executeAfter(table, 'update', updated, oldData).catch(err =>
      console.error('[ExtAPI] after_update error:', err)
    );
  } catch (err) {
    res.status(500).json({ error: 'ERROR_INTERNAL_SERVER', params: { detail: String(err) } });
  }
});

// ──────────────────────────────────────────────
// POST /webhook/callback — n8n → Zenku write-back
// (replaces the old /api/webhook/callback)
// ──────────────────────────────────────────────
router.post('/webhook/callback', requireApiKey('webhook:callback'), async (req, res) => {
  const { table, record_id, updates } = req.body as {
    table?: string;
    record_id?: unknown;
    updates?: Record<string, unknown>;
  };

  if (!table || !record_id || !updates || typeof updates !== 'object') {
    res.status(400).json({ error: 'ERROR_MISSING_FIELDS' });
    return;
  }
  if (!isSafeFieldName(table) || table.startsWith('_zenku_')) {
    res.status(403).json({ error: 'ERROR_FORBIDDEN_SYSTEM_TABLE' });
    return;
  }

  try {
    const db = getDb();
    const keys = Object.keys(updates);
    if (keys.length === 0) { res.json({ success: true }); return; }

    // Validate all field names
    for (const k of keys) {
      if (!isSafeFieldName(k)) {
        res.status(400).json({ error: 'ERROR_INVALID_FIELD', params: { field: k } });
        return;
      }
    }

    const rid = record_id as string | number;
    const oldData = db.prepare(`SELECT * FROM "${table}" WHERE id = ?`).get(rid) as Record<string, unknown> | undefined;
    db.prepare(
      `UPDATE "${table}" SET ${keys.map(k => `"${k}" = ?`).join(', ')} WHERE id = ?`
    ).run(...(Object.values(updates) as (string | number | null)[]), rid);

    writeJournal({
      agent: 'ext_api', type: 'data_change',
      description: `API Key [${req.apiKeyId}] callback ${table} #${String(rid)}`,
      diff: { before: oldData ?? null, after: updates },
      user_request: 'webhook_callback',
      reversible: true,
    });

    const updated = db.prepare(`SELECT * FROM "${table}" WHERE id = ?`).get(rid);
    executeAfter(table, 'update', updated as Record<string, unknown>, oldData).catch(err =>
      console.error('[ExtAPI] webhook after_update error:', err)
    );

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'ERROR_INTERNAL_SERVER', params: { detail: String(err) } });
  }
});

export default router;
