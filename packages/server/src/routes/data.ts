import { Router } from 'express';
import { getDb, getTableSchema, writeJournal } from '../db';
import { requireAuth } from '../middleware/auth';
import { executeBefore, executeAfter } from '../engine/rule-engine';
import { recalculateComputedFields } from '../engine/formula-handler';
import { p, isSafeFieldName, getRelationColumns } from '../utils';

const router = Router();

// ──────────────────────────────────────────────
// Generic CRUD for user tables
// ──────────────────────────────────────────────

/** 關聯欄位選項端點 */
router.get('/:table/options', requireAuth, (req, res) => {
  const table = p(req.params.table);
  if (table.startsWith('_zenku_')) {
    res.status(403).json({ error: 'ERROR_FORBIDDEN_SYSTEM_TABLE' });
    return;
  }

  const valueField = String(req.query.value_field ?? 'id');
  const displayField = String(req.query.display_field ?? 'name');
  const search = String(req.query.search ?? '').trim();
  const id = String(req.query.id ?? '').trim();

  if (!isSafeFieldName(valueField) || !isSafeFieldName(displayField)) {
    res.status(400).json({ error: 'ERROR_INVALID_FIELD' });
    return;
  }

  try {
    const db = getDb();

    if (id) {
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
    res.status(400).json({ error: 'ERROR_INTERNAL_SERVER', params: { detail: String(err) } });
  }
});

/** 取得單筆資料 */
router.get('/:table/:id', requireAuth, (req, res) => {
  const table = p(req.params.table), id = p(req.params.id);
  if (!isSafeFieldName(table)) {
    res.status(400).json({ error: 'ERROR_INVALID_TABLE' });
    return;
  }
  if (table.startsWith('_zenku_')) {
    res.status(403).json({ error: 'ERROR_FORBIDDEN_SYSTEM_TABLE' });
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
      res.status(404).json({ error: 'ERROR_DATA_NOT_FOUND' });
      return;
    }
    res.json(row);
  } catch (err) {
    res.status(400).json({ error: 'ERROR_INTERNAL_SERVER', params: { detail: String(err) } });
  }
});

/** 取得分頁/篩選列表 */
router.get('/:table', requireAuth, (req, res) => {
  const table = p(req.params.table);
  if (!isSafeFieldName(table)) {
    res.status(400).json({ error: 'ERROR_INVALID_TABLE' });
    return;
  }
  if (table.startsWith('_zenku_')) {
    res.status(403).json({ error: 'ERROR_FORBIDDEN_SYSTEM_TABLE' });
    return;
  }

  try {
    const db = getDb();
    const schema = getTableSchema(table);
    if (schema.length === 0) {
      res.status(400).json({ error: 'ERROR_TABLE_NOT_FOUND', params: { table } });
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

    const rows = db
      .prepare(`SELECT ${selectClause} FROM "${table}" ${joinClause} ${whereClause} ORDER BY "${table}"."${sortBy}" ${order} LIMIT ? OFFSET ?`)
      .all(...(whereParams as any[]), limit, offset);

    const totalResult = db
      .prepare(`SELECT COUNT(*) AS count FROM "${table}" ${joinClause} ${whereClause}`)
      .get(...(whereParams as any[])) as { count: number };

    res.json({
      rows,
      total: totalResult.count,
      page,
      limit,
    });
  } catch (err) {
    res.status(400).json({ error: 'ERROR_INTERNAL_SERVER', params: { detail: String(err) } });
  }
});

/** 新增資料 */
router.post('/:table', requireAuth, async (req, res) => {
  const table = p(req.params.table);
  if (!isSafeFieldName(table)) {
    res.status(400).json({ error: 'ERROR_INVALID_TABLE' });
    return;
  }
  if (table.startsWith('_zenku_')) {
    res.status(403).json({ error: 'ERROR_FORBIDDEN_SYSTEM_TABLE' });
    return;
  }
  try {
    const db = getDb();
    const body = { ...req.body } as Record<string, unknown>;
    delete body.id;
    delete body.created_at;
    delete body.updated_at;

    const beforeResult = await executeBefore(table, 'insert', body);
    if (!beforeResult.allowed) {
      res.status(400).json({ error: 'ERROR_RULE_VALIDATION', params: { details: beforeResult.errors.join('; ') } });
      return;
    }
    // 自動計算公式欄位
    const finalData = recalculateComputedFields(table, beforeResult.data);

    const keys = Object.keys(finalData);
    const placeholders = keys.map(() => '?').join(', ');
    const values = Object.values(finalData);

    const result = db.prepare(
      `INSERT INTO "${table}" (${keys.map(k => `"${k}"`).join(', ')}) VALUES (${placeholders})`
    ).run(...(values as any[]));

    const created = db.prepare(`SELECT * FROM "${table}" WHERE id = ?`).get(result.lastInsertRowid) as Record<string, unknown>;
    res.json(created);

    executeAfter(table, 'insert', created).catch(err =>
      console.error('[RuleEngine] after_insert error:', err)
    );
  } catch (err) {
    res.status(400).json({ error: 'ERROR_INTERNAL_SERVER', params: { detail: String(err) } });
  }
});

/** 更新資料 */
router.put('/:table/:id', requireAuth, async (req, res) => {
  const table = p(req.params.table), id = p(req.params.id);
  if (!isSafeFieldName(table)) {
    res.status(400).json({ error: 'ERROR_INVALID_TABLE' });
    return;
  }
  if (table.startsWith('_zenku_')) {
    res.status(403).json({ error: 'ERROR_FORBIDDEN_SYSTEM_TABLE' });
    return;
  }
  try {
    const db = getDb();
    const oldData = db.prepare(`SELECT * FROM "${table}" WHERE id = ?`).get(id) as Record<string, unknown> | undefined;

    const body = { ...req.body } as Record<string, unknown>;
    delete body.id;
    delete body.created_at;
    body.updated_at = new Date().toISOString();

    const beforeResult = await executeBefore(table, 'update', body, oldData);
    if (!beforeResult.allowed) {
      res.status(400).json({ error: 'ERROR_RULE_VALIDATION', params: { details: beforeResult.errors.join('; ') } });
      return;
    }
    // 自動計算公式欄位
    const finalData = recalculateComputedFields(table, beforeResult.data);

    const keys = Object.keys(finalData);
    const setClause = keys.map(k => `"${k}" = ?`).join(', ');
    const values = [...Object.values(finalData), id];

    db.prepare(`UPDATE "${table}" SET ${setClause} WHERE id = ?`).run(...(values as any[]));

    const updated = db.prepare(`SELECT * FROM "${table}" WHERE id = ?`).get(id) as Record<string, unknown>;
    res.json(updated);

    executeAfter(table, 'update', updated, oldData).catch(err =>
      console.error('[RuleEngine] after_update error:', err)
    );
  } catch (err) {
    res.status(400).json({ error: 'ERROR_INTERNAL_SERVER', params: { detail: String(err) } });
  }
});

/** 刪除資料 */
router.delete('/:table/:id', requireAuth, async (req, res) => {
  const table = p(req.params.table), id = p(req.params.id);
  if (!isSafeFieldName(table)) {
    res.status(400).json({ error: 'ERROR_INVALID_TABLE' });
    return;
  }
  if (table.startsWith('_zenku_')) {
    res.status(403).json({ error: 'ERROR_FORBIDDEN_SYSTEM_TABLE' });
    return;
  }
  try {
    const db = getDb();
    const deletedData = db.prepare(`SELECT * FROM "${table}" WHERE id = ?`).get(id) as Record<string, unknown> | undefined;

    if (deletedData) {
      const beforeResult = await executeBefore(table, 'delete', deletedData);
      if (!beforeResult.allowed) {
        res.status(400).json({ error: 'ERROR_RULE_VALIDATION', params: { details: beforeResult.errors.join('; ') } });
        return;
      }
    }

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

    if (deletedData) {
      executeAfter(table, 'delete', deletedData).catch(err =>
        console.error('[RuleEngine] after_delete error:', err)
      );
    }
  } catch (err) {
    res.status(400).json({ error: 'ERROR_INTERNAL_SERVER', params: { detail: String(err) } });
  }
});

export default router;
