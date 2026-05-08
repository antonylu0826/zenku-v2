import { getDb } from '../db';
import { getTableSchema } from '../db/schema';
import { getMultiselectColumns, isSafeFieldName } from '../utils';
import { executeBefore, executeAfter } from '../engine/rule-engine';
import { applyAutoNumbers } from '../engine/auto-number-engine';
import { recalculateComputedFields } from '../engine/formula-handler';
import { writeJournal } from '../db/journal';

export interface DataActor {
  type: 'browser' | 'ext_api' | 'ai_tool';
  userId?: string;
  apiKeyId?: string;
  requestLabel?: string;
}

export interface CreateRecordInput {
  table: string;
  data: Record<string, unknown>;
  actor: DataActor;
  locale?: string;
  userRequest?: string;
}

export interface UpdateRecordInput {
  table: string;
  id: string | number;
  data: Record<string, unknown>;
  actor: DataActor;
  locale?: string;
  userRequest?: string;
}

export interface DeleteRecordInput {
  table: string;
  id: string | number;
  actor: DataActor;
  locale?: string;
  userRequest?: string;
}

export interface DataWriteResult {
  success: boolean;
  record?: Record<string, unknown>;
  changes?: number;
  id?: string | number;
  error?: string;
  errorCode?: string;
}

const FORBIDDEN_TABLE_PREFIXES = ['_zenku_', 'sqlite_'];

function isSafeTableName(name: string): boolean {
  if (!isSafeFieldName(name)) return false;
  if (FORBIDDEN_TABLE_PREFIXES.some(p => name.toLowerCase().startsWith(p))) return false;
  return true;
}

function serializeMultiselect(
  data: Record<string, unknown>,
  msColumns: string[],
): Record<string, unknown> {
  const result = { ...data };
  for (const key of msColumns) {
    if (Array.isArray(result[key])) result[key] = JSON.stringify(result[key]);
  }
  return result;
}

function coerceValue(v: unknown, colType: string, dbType: string): unknown {
  if (
    dbType === 'postgres' &&
    v === '' &&
    (colType.toUpperCase().includes('INT') || colType.toUpperCase().includes('REAL'))
  ) {
    return null;
  }
  if (dbType === 'sqlite' && typeof v === 'boolean') return v ? 1 : 0;
  return v;
}

function buildReverseUpdateSql(table: string, oldRecord: Record<string, unknown>): string {
  const id = oldRecord.id;
  const fields = Object.keys(oldRecord).filter(k => k !== 'id' && isSafeFieldName(k));
  const setParts = fields.map(k => {
    const v = oldRecord[k];
    const escaped = v === null || v === undefined
      ? 'NULL'
      : `'${String(v).replace(/'/g, "''")}'`;
    return `"${k}" = ${escaped}`;
  });
  const idLiteral = typeof id === 'string' ? `'${id}'` : String(id);
  return `UPDATE "${table}" SET ${setParts.join(', ')} WHERE id = ${idLiteral}`;
}

function classifyError(msg: string): DataWriteResult {
  const notNullSqlite = msg.match(/NOT NULL constraint failed: \w+\.(\w+)/);
  const notNullPg = msg.match(/null value in column "([^"]+)"/);
  if (notNullSqlite || notNullPg) {
    const col = notNullSqlite?.[1] ?? notNullPg?.[1] ?? 'field';
    return { success: false, error: `"${col}" is required`, errorCode: 'ERROR_RULE_VALIDATION' };
  }
  if (msg.includes('FOREIGN KEY constraint failed')) {
    return {
      success: false,
      error: 'A related record does not exist. Please check all required reference fields.',
      errorCode: 'ERROR_RULE_VALIDATION',
    };
  }
  return { success: false, error: msg, errorCode: 'ERROR_INTERNAL_SERVER' };
}

export async function createRecord(input: CreateRecordInput): Promise<DataWriteResult> {
  const { table, data, actor, locale, userRequest } = input;

  if (!isSafeTableName(table)) {
    return { success: false, error: `Invalid or disallowed table name: ${table}`, errorCode: 'ERROR_INVALID_TABLE' };
  }

  const db = getDb();
  const schema = await getTableSchema(table);
  if (schema.length === 0) {
    return { success: false, error: `Table not found: ${table}`, errorCode: 'ERROR_TABLE_NOT_FOUND' };
  }

  const msColumns = await getMultiselectColumns(table);
  const rawData = { ...data };
  delete rawData.id;
  delete rawData.created_at;
  delete rawData.updated_at;
  const body = serializeMultiselect(rawData, msColumns);

  const beforeResult = await executeBefore(table, 'insert', body, undefined, locale);
  if (!beforeResult.allowed) {
    return { success: false, error: beforeResult.errors.join('; '), errorCode: 'ERROR_RULE_VALIDATION' };
  }

  const withAutoNumbers = await applyAutoNumbers(table, beforeResult.data);
  const finalData = await recalculateComputedFields(table, withAutoNumbers);

  const keys = Object.keys(finalData);
  const placeholders = keys.map(() => '?').join(', ');
  const values = keys.map(key => {
    const col = schema.find(c => c.name === key);
    return coerceValue(finalData[key], col?.type ?? '', db.type);
  });

  const insertSql =
    `INSERT INTO "${table}" (${keys.map(k => `"${k}"`).join(', ')}) VALUES (${placeholders})` +
    (db.type === 'postgres' ? ' RETURNING id' : '');

  try {
    const result = await db.execute(insertSql, values);
    const { rows: created } = await db.query<Record<string, unknown>>(
      `SELECT * FROM "${table}" WHERE id = ?`,
      [result.lastInsertId],
    );
    const record = created[0];

    if (actor.type !== 'browser' && record) {
      const id = record.id;
      const idLiteral = typeof id === 'string' ? `'${id}'` : String(id);
      await writeJournal({
        agent: actor.apiKeyId ? `ext_api[${actor.apiKeyId}]` : actor.type,
        type: 'data_change',
        description: `${actor.type} created record in ${table} (id: ${id})`,
        diff: { before: null, after: record },
        user_request: userRequest ?? '',
        reverse_operations: [{ type: 'sql', sql: `DELETE FROM "${table}" WHERE id = ${idLiteral}` }],
      });
    }

    executeAfter(table, 'insert', record ?? {}).catch(err =>
      console.error('[DataService] after_insert error:', err),
    );

    return { success: true, record, id: record?.id as string | number | undefined };
  } catch (err) {
    return classifyError(String(err));
  }
}

export async function updateRecord(input: UpdateRecordInput): Promise<DataWriteResult> {
  const { table, id, data, actor, locale, userRequest } = input;

  if (!isSafeTableName(table)) {
    return { success: false, error: `Invalid or disallowed table name: ${table}`, errorCode: 'ERROR_INVALID_TABLE' };
  }

  const db = getDb();
  const schema = await getTableSchema(table);
  if (schema.length === 0) {
    return { success: false, error: `Table not found: ${table}`, errorCode: 'ERROR_TABLE_NOT_FOUND' };
  }

  const { rows: oldRows } = await db.query<Record<string, unknown>>(
    `SELECT * FROM "${table}" WHERE id = ?`,
    [id],
  );
  const oldRecord = oldRows[0];
  if (!oldRecord) {
    return { success: false, error: 'Record not found', errorCode: 'ERROR_DATA_NOT_FOUND' };
  }

  const msColumns = await getMultiselectColumns(table);
  const rawBody = { ...data };
  delete rawBody.id;
  delete rawBody.created_at;
  rawBody.updated_at = new Date().toISOString();
  const body = serializeMultiselect(rawBody, msColumns);
  const merged = { ...oldRecord, ...body };
  delete merged.id;
  delete merged.created_at;

  const beforeResult = await executeBefore(table, 'update', merged, oldRecord, locale);
  if (!beforeResult.allowed) {
    return { success: false, error: beforeResult.errors.join('; '), errorCode: 'ERROR_RULE_VALIDATION' };
  }

  const finalData = await recalculateComputedFields(table, beforeResult.data);
  const keys = Object.keys(finalData);
  const setClause = keys
    .map(k => (db.type === 'mssql' ? `[${k}]` : `"${k}"`) + ' = ?')
    .join(', ');
  const values: unknown[] = keys.map(key => {
    const col = schema.find(c => c.name === key);
    return coerceValue(finalData[key], col?.type ?? '', db.type);
  });
  values.push(id);

  const updateSql =
    db.type === 'mssql'
      ? `UPDATE [${table}] SET ${setClause} WHERE id = ?`
      : `UPDATE "${table}" SET ${setClause} WHERE id = ?`;

  try {
    await db.execute(updateSql, values);
    const { rows: updated } = await db.query<Record<string, unknown>>(
      `SELECT * FROM "${table}" WHERE id = ?`,
      [id],
    );
    const record = updated[0];

    await writeJournal({
      agent: actor.apiKeyId ? `ext_api[${actor.apiKeyId}]` : actor.type,
      type: 'data_change',
      description: `${actor.type} updated record in ${table} (id: ${id})`,
      diff: { before: oldRecord, after: record },
      user_request: userRequest ?? '',
      reverse_operations: [{ type: 'sql', sql: buildReverseUpdateSql(table, oldRecord) }],
    });

    executeAfter(table, 'update', record ?? {}, oldRecord).catch(err =>
      console.error('[DataService] after_update error:', err),
    );

    return { success: true, record, id };
  } catch (err) {
    return classifyError(String(err));
  }
}

export async function deleteRecord(input: DeleteRecordInput): Promise<DataWriteResult> {
  const { table, id, actor, locale, userRequest } = input;

  if (!isSafeTableName(table)) {
    return { success: false, error: `Invalid or disallowed table name: ${table}`, errorCode: 'ERROR_INVALID_TABLE' };
  }

  const db = getDb();

  const { rows: oldRows } = await db.query<Record<string, unknown>>(
    `SELECT * FROM "${table}" WHERE id = ?`,
    [id],
  );
  const oldRecord = oldRows[0];
  if (!oldRecord) {
    return { success: false, error: 'Record not found', errorCode: 'ERROR_DATA_NOT_FOUND' };
  }

  const beforeResult = await executeBefore(table, 'delete', oldRecord, undefined, locale);
  if (!beforeResult.allowed) {
    return { success: false, error: beforeResult.errors.join('; '), errorCode: 'ERROR_RULE_VALIDATION' };
  }

  const deleteSql =
    db.type === 'mssql'
      ? `DELETE FROM [${table}] WHERE id = ?`
      : `DELETE FROM "${table}" WHERE id = ?`;

  try {
    const result = await db.execute(deleteSql, [id]);

    await writeJournal({
      agent: actor.apiKeyId ? `ext_api[${actor.apiKeyId}]` : actor.type,
      type: 'data_change',
      description: `${actor.type} deleted record from ${table} (id: ${id})`,
      diff: { before: oldRecord, after: null },
      user_request: userRequest ?? '',
      // No reverse_operations → journal.ts marks reversible = 0
    });

    executeAfter(table, 'delete', oldRecord).catch(err =>
      console.error('[DataService] after_delete error:', err),
    );

    return { success: true, changes: result.rowsAffected };
  } catch (err) {
    return { success: false, error: String(err), errorCode: 'ERROR_INTERNAL_SERVER' };
  }
}
