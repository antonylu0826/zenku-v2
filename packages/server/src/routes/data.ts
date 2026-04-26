import { Router } from 'express';
import { getDb } from '../db';
import { getTableSchema } from '../db/schema';
import { writeJournal } from '../db/journal';
import { requireAuth } from '../middleware/auth';
import { executeBefore, executeAfter } from '../engine/rule-engine';
import { recalculateComputedFields } from '../engine/formula-handler';
import { applyAutoNumbers } from '../engine/auto-number-engine';
import { p, isSafeFieldName, getRelationColumns, getMultiselectColumns } from '../utils';

const router = Router();

function parseMultiselect(row: Record<string, unknown>, msColumns: string[]): Record<string, unknown> {
  const result = { ...row };
  for (const key of msColumns) {
    const val = result[key];
    if (typeof val === 'string' && val.startsWith('[')) {
      try { result[key] = JSON.parse(val); } catch { /* leave as-is */ }
    }
  }
  return result;
}

function escapeLike(s: string): string {
  return s.replaceAll('\\', '\\\\').replaceAll('%', '\\%').replaceAll('_', '\\_');
}

function serializeMultiselect(data: Record<string, unknown>, msColumns: string[]): Record<string, unknown> {
  const result = { ...data };
  for (const key of msColumns) {
    if (Array.isArray(result[key])) result[key] = JSON.stringify(result[key]);
  }
  return result;
}

router.get('/:table/options', requireAuth, async (req, res) => {
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
      const { rows } = await db.query(
        `SELECT "${valueField}" as value, "${displayField}" as label FROM "${table}" WHERE "${valueField}" = ? LIMIT 1`,
        [id]
      );
      res.json(rows);
      return;
    }
    if (search) {
      const escaped = escapeLike(search);
      const { rows } = await db.query(
        `SELECT "${valueField}" as value, "${displayField}" as label FROM "${table}" WHERE "${displayField}" LIKE ? ESCAPE '\\' ORDER BY "${displayField}" LIMIT 50`,
        [`%${escaped}%`]
      );
      res.json(rows);
      return;
    }
    const { rows } = await db.query(
      `SELECT "${valueField}" as value, "${displayField}" as label FROM "${table}" ORDER BY "${displayField}" LIMIT 100`
    );
    res.json(rows);
  } catch (err) {
    res.status(400).json({ error: 'ERROR_INTERNAL_SERVER', params: { detail: String(err) } });
  }
});

router.get('/:table/:id', requireAuth, async (req, res) => {
  const table = p(req.params.table), id = p(req.params.id);
  if (!isSafeFieldName(table)) { res.status(400).json({ error: 'ERROR_INVALID_TABLE' }); return; }
  if (table.startsWith('_zenku_')) { res.status(403).json({ error: 'ERROR_FORBIDDEN_SYSTEM_TABLE' }); return; }
  try {
    const db = getDb();
    const relationCols = await getRelationColumns(table);
    const joinClauses = relationCols.map(rc =>
      `LEFT JOIN "${rc.relation.table}" ON "${table}"."${rc.key}" = "${rc.relation.table}"."${rc.relation.value_field}"`
    );
    const joinSelects = relationCols.map(rc =>
      `"${rc.relation.table}"."${rc.relation.display_field}" AS "${rc.key}__display"`
    );
    const selectClause = joinSelects.length > 0 ? `"${table}".*, ${joinSelects.join(', ')}` : `"${table}".*`;
    const joinClause = joinClauses.join(' ');

    const { rows } = await db.query(
      `SELECT ${selectClause} FROM "${table}" ${joinClause} WHERE "${table}".id = ?`,
      [id]
    );
    if (!rows[0]) { res.status(404).json({ error: 'ERROR_DATA_NOT_FOUND' }); return; }
    const msColumns = await getMultiselectColumns(table);
    res.json(msColumns.length ? parseMultiselect(rows[0] as Record<string, unknown>, msColumns) : rows[0]);
  } catch (err) {
    res.status(400).json({ error: 'ERROR_INTERNAL_SERVER', params: { detail: String(err) } });
  }
});

router.get('/:table', requireAuth, async (req, res) => {
  const table = p(req.params.table);
  if (!isSafeFieldName(table)) { res.status(400).json({ error: 'ERROR_INVALID_TABLE' }); return; }
  if (table.startsWith('_zenku_')) { res.status(403).json({ error: 'ERROR_FORBIDDEN_SYSTEM_TABLE' }); return; }

  try {
    const db = getDb();
    const schema = await getTableSchema(table);
    if (schema.length === 0) {
      res.status(400).json({ error: 'ERROR_TABLE_NOT_FOUND', params: { table } });
      return;
    }

    const fieldNames = new Set(schema.map(col => col.name));
    const textFieldNames = schema
      .filter(col => col.type.toUpperCase().includes('TEXT'))
      .map(col => col.name);

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
    const escapedSearch = escapeLike(search);

    const whereParts: string[] = [];
    const whereParams: unknown[] = [];

    if (filterClauses.length > 0) { whereParts.push(...filterClauses); whereParams.push(...filterParams); }
    if (search && textFieldNames.length > 0) {
      whereParts.push(`(${textFieldNames.map(name => `"${table}"."${name}" LIKE ? ESCAPE '\\'`).join(' OR ')})`);
      whereParams.push(...textFieldNames.map(() => `%${escapedSearch}%`));
    }

    const advfilterRaw = String(req.query.advfilter ?? '').trim();
    if (advfilterRaw) {
      try {
        const advFilters = JSON.parse(advfilterRaw) as { field: string; operator: string; value: unknown }[];
        for (const f of advFilters) {
          if (!isSafeFieldName(f.field) || !fieldNames.has(f.field)) continue;
          const col = `"${table}"."${f.field}"`;
          switch (f.operator) {
            case 'eq':           whereParts.push(`${col} = ?`);           whereParams.push(f.value); break;
            case 'neq':          whereParts.push(`${col} != ?`);          whereParams.push(f.value); break;
            case 'gt':           whereParts.push(`${col} > ?`);           whereParams.push(f.value); break;
            case 'gte':          whereParts.push(`${col} >= ?`);          whereParams.push(f.value); break;
            case 'lt':           whereParts.push(`${col} < ?`);           whereParams.push(f.value); break;
            case 'lte':          whereParts.push(`${col} <= ?`);          whereParams.push(f.value); break;
            case 'contains': {
              const esc = escapeLike(String(f.value));
              whereParts.push(`${col} LIKE ? ESCAPE '\\'`); whereParams.push(`%${esc}%`); break;
            }
            case 'not_contains': {
              const esc = escapeLike(String(f.value));
              whereParts.push(`${col} NOT LIKE ? ESCAPE '\\'`); whereParams.push(`%${esc}%`); break;
            }
            case 'is_empty':     whereParts.push(`(${col} IS NULL OR ${col} = '')`); break;
            case 'is_not_empty': whereParts.push(`(${col} IS NOT NULL AND ${col} != '')`); break;
          }
        }
      } catch { /* malformed JSON — ignore */ }
    }

    const whereClause = whereParts.length > 0 ? `WHERE ${whereParts.join(' AND ')}` : '';
    const relationCols = await getRelationColumns(table);
    const joinClauses = relationCols.map(rc =>
      `LEFT JOIN "${rc.relation.table}" ON "${table}"."${rc.key}" = "${rc.relation.table}"."${rc.relation.value_field}"`
    );
    const joinSelects = relationCols.map(rc =>
      `"${rc.relation.table}"."${rc.relation.display_field}" AS "${rc.key}__display"`
    );
    const selectClause = joinSelects.length > 0 ? `"${table}".*, ${joinSelects.join(', ')}` : `"${table}".*`;
    const joinClause = joinClauses.join(' ');

    const { rows } = await db.query(
      `SELECT ${selectClause} FROM "${table}" ${joinClause} ${whereClause} ORDER BY "${table}"."${sortBy}" ${order} LIMIT ? OFFSET ?`,
      [...whereParams, limit, offset]
    );
    const { rows: totalRows } = await db.query<{ count: number }>(
      `SELECT COUNT(*) AS count FROM "${table}" ${joinClause} ${whereClause}`,
      whereParams
    );

    const msColumns = await getMultiselectColumns(table);
    const parsedRows = msColumns.length
      ? (rows as Record<string, unknown>[]).map(row => parseMultiselect(row, msColumns))
      : rows;

    res.json({ rows: parsedRows, total: totalRows[0]?.count ?? 0, page, limit });
  } catch (err) {
    res.status(400).json({ error: 'ERROR_INTERNAL_SERVER', params: { detail: String(err) } });
  }
});

router.post('/:table', requireAuth, async (req, res) => {
  const table = p(req.params.table);
  if (!isSafeFieldName(table)) { res.status(400).json({ error: 'ERROR_INVALID_TABLE' }); return; }
  if (table.startsWith('_zenku_')) { res.status(403).json({ error: 'ERROR_FORBIDDEN_SYSTEM_TABLE' }); return; }
  try {
    const db = getDb();
    const rawBody = { ...req.body } as Record<string, unknown>;
    delete rawBody.id; delete rawBody.created_at; delete rawBody.updated_at;
    const body = serializeMultiselect(rawBody, await getMultiselectColumns(table));

    const beforeResult = await executeBefore(table, 'insert', body, undefined, req.user?.language);
    if (!beforeResult.allowed) {
      res.status(400).json({ error: 'ERROR_RULE_VALIDATION', params: { details: beforeResult.errors.join('; ') } });
      return;
    }
    const withAutoNumbers = await applyAutoNumbers(table, beforeResult.data);
    const finalData = await recalculateComputedFields(table, withAutoNumbers);

    const schema = await getTableSchema(table);
    const keys = Object.keys(finalData);
    const placeholders = keys.map(() => '?').join(', ');
    const values = keys.map(key => {
      const v = finalData[key];
      const col = schema.find(c => c.name === key);
      // PostgreSQL: numeric columns cannot be empty strings
      if (db.type === 'postgres' && v === '' && col && (col.type.toUpperCase().includes('INT') || col.type.toUpperCase().includes('REAL'))) {
        return null;
      }
      if (db.type === 'sqlite' && typeof v === 'boolean') return v ? 1 : 0;
      return v;
    });

    const insertSql = `INSERT INTO "${table}" (${keys.map(k => `"${k}"`).join(', ')}) VALUES (${placeholders})` 
      + (db.type === 'postgres' ? ' RETURNING id' : '');

    const result = await db.execute(insertSql, values);
    const { rows: created } = await db.query<Record<string, unknown>>(
      `SELECT * FROM "${table}" WHERE id = ?`,
      [result.lastInsertId]
    );
    res.json(created[0]);

    executeAfter(table, 'insert', created[0] ?? {}).catch(err =>
      console.error('[RuleEngine] after_insert error:', err)
    );
  } catch (err) {
    const msg = String(err);
    const notNullSqlite = msg.match(/NOT NULL constraint failed: \w+\.(\w+)/);
    const notNullPg = msg.match(/null value in column "([^"]+)"/);
    if (notNullSqlite || notNullPg) {
      const col = notNullSqlite ? notNullSqlite[1] : notNullPg ? notNullPg[1] : 'field';
      res.status(400).json({ error: 'ERROR_RULE_VALIDATION', params: { details: `"${col}" is required` } });
    } else {
      res.status(400).json({ error: 'ERROR_INTERNAL_SERVER', params: { detail: msg } });
    }
  }
});

router.put('/:table/:id', requireAuth, async (req, res) => {
  const table = p(req.params.table), id = p(req.params.id);
  if (!isSafeFieldName(table)) { res.status(400).json({ error: 'ERROR_INVALID_TABLE' }); return; }
  if (table.startsWith('_zenku_')) { res.status(403).json({ error: 'ERROR_FORBIDDEN_SYSTEM_TABLE' }); return; }
  try {
    const db = getDb();
    const { rows: oldRows } = await db.query<Record<string, unknown>>(
      `SELECT * FROM "${table}" WHERE id = ?`, [id]
    );
    const oldData = oldRows[0];

    const rawBody = { ...req.body } as Record<string, unknown>;
    delete rawBody.id; delete rawBody.created_at;
    rawBody.updated_at = new Date().toISOString();
    const body = serializeMultiselect(rawBody, await getMultiselectColumns(table));

    const beforeResult = await executeBefore(table, 'update', body, oldData, req.user?.language);
    if (!beforeResult.allowed) {
      res.status(400).json({ error: 'ERROR_RULE_VALIDATION', params: { details: beforeResult.errors.join('; ') } });
      return;
    }

    const finalData = await recalculateComputedFields(table, beforeResult.data);
    const schema = await getTableSchema(table);
    const keys = Object.keys(finalData);
    const setClause = keys.map(k => (db.type === 'mssql' ? `[${k}]` : `"${k}"`) + ' = ?').join(', ');
    const values = keys.map(key => {
      const v = finalData[key];
      const col = schema.find(c => c.name === key);
      if (db.type === 'postgres' && v === '' && col && (col.type.toUpperCase().includes('INT') || col.type.toUpperCase().includes('REAL'))) {
        return null;
      }
      if (db.type === 'sqlite' && typeof v === 'boolean') return v ? 1 : 0;
      return v;
    });
    values.push(id);

    const updateSql = db.type === 'mssql' ? `UPDATE [${table}] SET ${setClause} WHERE id = ?` : `UPDATE "${table}" SET ${setClause} WHERE id = ?`;
    await db.execute(updateSql, values);

    const { rows: updated } = await db.query<Record<string, unknown>>(
      `SELECT * FROM "${table}" WHERE id = ?`, [id]
    );
    res.json(updated[0]);

    executeAfter(table, 'update', updated[0] ?? {}, oldData).catch(err =>
      console.error('[RuleEngine] after_update error:', err)
    );
  } catch (err) {
    const msg = String(err);
    const notNullSqlite = msg.match(/NOT NULL constraint failed: \w+\.(\w+)/);
    const notNullPg = msg.match(/null value in column "([^"]+)"/);
    if (notNullSqlite || notNullPg) {
      const col = notNullSqlite ? notNullSqlite[1] : notNullPg ? notNullPg[1] : 'field';
      res.status(400).json({ error: 'ERROR_RULE_VALIDATION', params: { details: `"${col}" is required` } });
    } else {
      res.status(400).json({ error: 'ERROR_INTERNAL_SERVER', params: { detail: msg } });
    }
  }
});

router.delete('/:table/:id', requireAuth, async (req, res) => {
  const table = p(req.params.table), id = p(req.params.id);
  if (!isSafeFieldName(table)) { res.status(400).json({ error: 'ERROR_INVALID_TABLE' }); return; }
  if (table.startsWith('_zenku_')) { res.status(403).json({ error: 'ERROR_FORBIDDEN_SYSTEM_TABLE' }); return; }
  try {
    const db = getDb();
    const selectSql = db.type === 'mssql' ? `SELECT * FROM [${table}] WHERE id = ?` : `SELECT * FROM "${table}" WHERE id = ?`;
    const { rows: deletedRows } = await db.query<Record<string, unknown>>(selectSql, [id]);
    const deletedData = deletedRows[0];

    if (deletedData) {
      const beforeResult = await executeBefore(table, 'delete', deletedData, undefined, req.user?.language);
      if (!beforeResult.allowed) {
        res.status(400).json({ error: 'ERROR_RULE_VALIDATION', params: { details: beforeResult.errors.join('; ') } });
        return;
      }
    }

    // Cascade delete child records
    const useTransaction = db.type !== 'mssql';
    if (useTransaction) await db.execute('BEGIN');
    try {
      if (db.type === 'sqlite') {
        const allTables = await db.listTables();
        for (const childTable of allTables.filter(t => t !== table)) {
          const { rows: fkList } = await db.query<{ table: string; from: string }>(
            `PRAGMA foreign_key_list("${childTable}")`
          );
          for (const fk of fkList) {
            if (fk.table === table) {
              await db.execute(`DELETE FROM "${childTable}" WHERE "${fk.from}" = ?`, [id]);
            }
          }
        }
      } else if (db.type === 'postgres') {
        const { rows: fkList } = await db.query<{ table_name: string; column_name: string }>(`
          SELECT cl.relname AS table_name, att.attname AS column_name
          FROM pg_constraint con
          JOIN pg_class cl ON con.conrelid = cl.oid
          JOIN pg_class ref ON con.confrelid = ref.oid
          JOIN pg_attribute att ON att.attrelid = con.conrelid AND att.attnum = ANY(con.conkey)
          WHERE con.contype = 'f' AND ref.relname = $1
        `, [table]);

        for (const fk of fkList) {
          await db.execute(`DELETE FROM "${fk.table_name}" WHERE "${fk.column_name}" = ?`, [id]);
        }
      } else if (db.type === 'mssql') {
        const { rows: fkList } = await db.query<{ table_name: string; column_name: string }>(`
          SELECT OBJECT_NAME(f.parent_object_id) AS table_name,
                 COL_NAME(fc.parent_object_id, fc.parent_column_id) AS column_name
          FROM sys.foreign_keys AS f
          INNER JOIN sys.foreign_key_columns AS fc ON f.object_id = fc.constraint_object_id
          WHERE OBJECT_NAME(f.referenced_object_id) = ?
        `, [table]);

        for (const fk of fkList) {
          await db.execute(`DELETE FROM [${fk.table_name}] WHERE [${fk.column_name}] = ?`, [id]);
        }
      }

      const deleteSql = db.type === 'mssql' ? `DELETE FROM [${table}] WHERE id = ?` : `DELETE FROM "${table}" WHERE id = ?`;
      await db.execute(deleteSql, [id]);
      if (useTransaction) await db.execute('COMMIT');
    } catch (err) {
      if (useTransaction) await db.execute('ROLLBACK');
      throw err;
    }
    res.json({ success: true });

    if (deletedData) {
      executeAfter(table, 'delete', deletedData).catch(err =>
        console.error('[RuleEngine] after_delete error:', err)
      );
    }
  } catch (err) {
    console.error('[DataRoute] DELETE error:', err);
    res.status(400).json({ error: 'ERROR_INTERNAL_SERVER', params: { detail: String(err) } });
  }
});

export default router;
