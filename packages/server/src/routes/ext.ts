import { Router } from 'express';
import { getDb } from '../db';
import { getTableSchema, getUserTables } from '../db/schema';
import { writeJournal } from '../db/journal';
import { requireApiKey, requireApiKeyAny } from '../middleware/api-key-auth';
import { executeAfter } from '../engine/rule-engine';
import { createRecord, updateRecord } from '../services/data-service';
import { p, isSafeFieldName, getRelationColumns } from '../utils';

const router = Router();

function sqliteTypeToOpenApi(sqlType: string): { type: string; format?: string } {
  const t = sqlType.toUpperCase();
  if (t.includes('INT')) return { type: 'integer' };
  if (t.includes('REAL') || t.includes('FLOAT') || t.includes('DOUBLE') || t.includes('NUMERIC')) return { type: 'number' };
  if (t.includes('BOOL') || t.includes('BIT')) return { type: 'boolean' };
  return { type: 'string' };
}

router.get('/openapi.json', async (_req, res) => {
  const tables = await getUserTables();

  const paths: Record<string, unknown> = {
    '/api/ext/webhook/callback': {
      post: {
        summary: 'Webhook callback write-back', tags: ['webhook'],
        security: [{ bearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object', required: ['table', 'record_id', 'updates'],
                properties: {
                  table: { type: 'string' }, record_id: { type: 'string' },
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
    const columns = await getTableSchema(table);
    const properties: Record<string, unknown> = {};
    for (const col of columns) {
      properties[col.name] = {
        ...sqliteTypeToOpenApi(col.type),
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
      get: { summary: `List ${table}`, tags: [table], security: [{ bearerAuth: [] }],
        parameters: [
          { name: 'page', in: 'query', schema: { type: 'integer', default: 1 } },
          { name: 'limit', in: 'query', schema: { type: 'integer', default: 20, maximum: 100 } },
          { name: 'sort', in: 'query', schema: { type: 'string' } },
          { name: 'order', in: 'query', schema: { type: 'string', enum: ['asc', 'desc'] } },
          { name: 'search', in: 'query', schema: { type: 'string' } },
        ],
        responses: { '200': { description: 'OK', content: { 'application/json': { schema: { type: 'object', properties: { rows: { type: 'array', items: { $ref: `#/components/schemas/${table}` } }, total: { type: 'integer' }, page: { type: 'integer' }, limit: { type: 'integer' } } } } } } },
      },
      post: { summary: `Create ${table}`, tags: [table], security: [{ bearerAuth: [] }],
        requestBody: { required: true, content: { 'application/json': { schema: writeSchema } } },
        responses: { '201': { description: 'Created', content: { 'application/json': { schema: { $ref: `#/components/schemas/${table}` } } } } },
      },
    };
    paths[itemPath] = {
      get: { summary: `Get ${table} by ID`, tags: [table], security: [{ bearerAuth: [] }],
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        responses: { '200': { content: { 'application/json': { schema: { $ref: `#/components/schemas/${table}` } } } }, '404': { description: 'Not found' } },
      },
      patch: { summary: `Partial update ${table}`, tags: [table], security: [{ bearerAuth: [] }],
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        requestBody: { required: true, content: { 'application/json': { schema: writeSchema } } },
        responses: { '200': { content: { 'application/json': { schema: { $ref: `#/components/schemas/${table}` } } } }, '404': { description: 'Not found' } },
      },
    };
  }

  res.json({
    openapi: '3.0.0',
    info: { title: 'Zenku External API', version: '1.0.0' },
    components: {
      securitySchemes: { bearerAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'zk_live_...' } },
      schemas,
    },
    paths,
  });
});

router.get('/data/:table', requireApiKeyAny(req => ['read:*', `read:${p(req.params.table)}`]), async (req, res) => {
  const table = p(req.params.table);
  const scopes = req.apiKeyScopes ?? [];
  if (!scopes.some(s => s === 'read:*' || s === `read:${table}`)) {
    res.status(403).json({ error: 'ERROR_API_KEY_INVALID_OR_INSUFFICIENT_SCOPE' }); return;
  }
  if (!isSafeFieldName(table)) { res.status(400).json({ error: 'ERROR_INVALID_TABLE' }); return; }
  if (table.startsWith('_zenku_')) { res.status(403).json({ error: 'ERROR_FORBIDDEN_SYSTEM_TABLE' }); return; }

  try {
    const db = getDb();
    const schema = await getTableSchema(table);
    if (schema.length === 0) {
      res.status(404).json({ error: 'ERROR_TABLE_NOT_FOUND', params: { table } }); return;
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
          whereParts.push(`"${table}"."${field}" = ?`); whereParams.push(value);
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
    const relationCols = await getRelationColumns(table);
    const joinClause = relationCols.map(rc =>
      `LEFT JOIN "${rc.relation.table}" ON "${table}"."${rc.key}" = "${rc.relation.table}"."id"`
    ).join(' ');
    const selectClause = relationCols.length > 0
      ? `"${table}".*, ${relationCols.map(rc => `"${rc.relation.table}"."${rc.relation.display_field}" AS "${rc.key}__display"`).join(', ')}`
      : `"${table}".*`;

    const { rows } = await db.query(
      `SELECT ${selectClause} FROM "${table}" ${joinClause} ${whereClause} ORDER BY "${table}"."${sortBy}" ${order} LIMIT ? OFFSET ?`,
      [...whereParams, limit, offset]
    );
    const { rows: countRows } = await db.query<{ count: number }>(
      `SELECT COUNT(*) AS count FROM "${table}" ${joinClause} ${whereClause}`,
      whereParams
    );
    res.json({ rows, total: countRows[0]?.count ?? 0, page, limit });
  } catch (err) {
    res.status(500).json({ error: 'ERROR_INTERNAL_SERVER', params: { detail: String(err) } });
  }
});

router.get('/data/:table/:id', requireApiKeyAny(req => ['read:*', `read:${p(req.params.table)}`]), async (req, res) => {
  const table = p(req.params.table), id = p(req.params.id);
  const scopes = req.apiKeyScopes ?? [];
  if (!scopes.some(s => s === 'read:*' || s === `read:${table}`)) {
    res.status(403).json({ error: 'ERROR_API_KEY_INVALID_OR_INSUFFICIENT_SCOPE' }); return;
  }
  if (!isSafeFieldName(table)) { res.status(400).json({ error: 'ERROR_INVALID_TABLE' }); return; }
  if (table.startsWith('_zenku_')) { res.status(403).json({ error: 'ERROR_FORBIDDEN_SYSTEM_TABLE' }); return; }

  try {
    const db = getDb();
    const relationCols = await getRelationColumns(table);
    const joinClause = relationCols.map(rc =>
      `LEFT JOIN "${rc.relation.table}" ON "${table}"."${rc.key}" = "${rc.relation.table}"."id"`
    ).join(' ');
    const selectClause = relationCols.length > 0
      ? `"${table}".*, ${relationCols.map(rc => `"${rc.relation.table}"."${rc.relation.display_field}" AS "${rc.key}__display"`).join(', ')}`
      : `"${table}".*`;
    const { rows } = await db.query(
      `SELECT ${selectClause} FROM "${table}" ${joinClause} WHERE "${table}".id = ?`, [id]
    );
    if (!rows[0]) { res.status(404).json({ error: 'ERROR_DATA_NOT_FOUND' }); return; }
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: 'ERROR_INTERNAL_SERVER', params: { detail: String(err) } });
  }
});

router.post('/data/:table', requireApiKeyAny(req => ['write:*', `write:${p(req.params.table)}`]), async (req, res) => {
  const table = p(req.params.table);
  const scopes = req.apiKeyScopes ?? [];
  if (!scopes.some(s => s === 'write:*' || s === `write:${table}`)) {
    res.status(403).json({ error: 'ERROR_API_KEY_INVALID_OR_INSUFFICIENT_SCOPE' }); return;
  }

  const result = await createRecord({
    table,
    data: req.body as Record<string, unknown>,
    actor: { type: 'ext_api', apiKeyId: req.apiKeyId },
    userRequest: `API Key [${req.apiKeyId}] POST ${table}`,
  });

  if (!result.success) {
    const status = result.errorCode === 'ERROR_RULE_VALIDATION' ? 400
      : result.errorCode === 'ERROR_DATA_NOT_FOUND' ? 404
      : result.errorCode === 'ERROR_INVALID_TABLE' ? 400
      : result.errorCode === 'ERROR_TABLE_NOT_FOUND' ? 404
      : 500;
    res.status(status).json({ error: result.errorCode, params: { details: result.error } });
    return;
  }
  res.status(201).json(result.record);
});

router.patch('/data/:table/:id', requireApiKeyAny(req => ['write:*', `write:${p(req.params.table)}`]), async (req, res) => {
  const table = p(req.params.table), id = p(req.params.id);
  const scopes = req.apiKeyScopes ?? [];
  if (!scopes.some(s => s === 'write:*' || s === `write:${table}`)) {
    res.status(403).json({ error: 'ERROR_API_KEY_INVALID_OR_INSUFFICIENT_SCOPE' }); return;
  }

  const result = await updateRecord({
    table,
    id,
    data: req.body as Record<string, unknown>,
    actor: { type: 'ext_api', apiKeyId: req.apiKeyId },
    userRequest: `API Key [${req.apiKeyId}] PATCH ${table} #${id}`,
  });

  if (!result.success) {
    const status = result.errorCode === 'ERROR_DATA_NOT_FOUND' ? 404
      : result.errorCode === 'ERROR_RULE_VALIDATION' ? 400
      : result.errorCode === 'ERROR_INVALID_TABLE' ? 400
      : result.errorCode === 'ERROR_TABLE_NOT_FOUND' ? 404
      : 500;
    res.status(status).json({ error: result.errorCode, params: { details: result.error } });
    return;
  }
  res.json(result.record);
});

router.post('/webhook/callback', requireApiKey('webhook:callback'), async (req, res) => {
  const { table, record_id, updates } = req.body as {
    table?: string; record_id?: unknown; updates?: Record<string, unknown>;
  };
  if (!table || !record_id || !updates || typeof updates !== 'object') {
    res.status(400).json({ error: 'ERROR_MISSING_FIELDS' }); return;
  }
  if (!isSafeFieldName(table) || table.startsWith('_zenku_')) {
    res.status(403).json({ error: 'ERROR_FORBIDDEN_SYSTEM_TABLE' }); return;
  }

  try {
    const db = getDb();
    const keys = Object.keys(updates);
    if (keys.length === 0) { res.json({ success: true }); return; }
    for (const k of keys) {
      if (!isSafeFieldName(k)) {
        res.status(400).json({ error: 'ERROR_INVALID_FIELD', params: { field: k } }); return;
      }
    }
    const rid = record_id as string | number;
    const { rows: oldRows } = await db.query<Record<string, unknown>>(
      `SELECT * FROM "${table}" WHERE id = ?`, [rid]
    );
    await db.execute(
      `UPDATE "${table}" SET ${keys.map(k => `"${k}" = ?`).join(', ')} WHERE id = ?`,
      [...Object.values(updates), rid]
    );

    await writeJournal({
      agent: 'ext_api', type: 'data_change',
      description: `API Key [${req.apiKeyId}] callback ${table} #${String(rid)}`,
      diff: { before: oldRows[0] ?? null, after: updates },
      user_request: 'webhook_callback', reversible: true,
    });

    const { rows: updated } = await db.query<Record<string, unknown>>(
      `SELECT * FROM "${table}" WHERE id = ?`, [rid]
    );
    executeAfter(table, 'update', updated[0] ?? {}, oldRows[0]).catch(err =>
      console.error('[ExtAPI] webhook after_update error:', err)
    );
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'ERROR_INTERNAL_SERVER', params: { detail: String(err) } });
  }
});

export default router;
