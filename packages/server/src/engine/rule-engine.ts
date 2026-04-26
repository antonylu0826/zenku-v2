import { getDb, dbNow } from '../db';
import { getRulesForTable } from '../db/rules';
import { writeWebhookLog } from '../db/webhook';
import { evaluateFormula } from '@zenku/shared';
import { t as i18nT } from '../i18n';

// ===== Types =====

export interface RuleCondition {
  field: string;
  operator: 'eq' | 'neq' | 'gt' | 'lt' | 'gte' | 'lte' | 'contains' | 'changed' | 'was_eq' | 'was_neq';
  value?: unknown;
}

export interface RuleAction {
  type: 'set_field' | 'validate' | 'create_record' | 'update_record' | 'update_related_records' | 'webhook' | 'notify';
  field?: string;
  value?: string;
  message?: string;
  target_table?: string;
  record_data?: Record<string, string>;
  where?: Record<string, string>;
  via_table?: string;
  via_foreign_key?: string;
  url?: string;
  method?: string;
  text?: string;
}

export interface BeforeResult {
  allowed: boolean;
  data: Record<string, unknown>;
  errors: string[];
}

type TriggerAction = 'insert' | 'update' | 'delete';

// ===== FK path resolution =====

async function resolveFieldPath(
  table: string,
  field: string,
  data: Record<string, unknown>,
): Promise<unknown> {
  if (field in data) return data[field];
  if (!field.includes('.')) return undefined;

  const db = getDb();
  const parts = field.split('.');
  let currentTable = table;
  let currentData: Record<string, unknown> = data;

  for (let i = 0; i < parts.length - 1; i++) {
    const fkCol = parts[i];
    const fkValue = currentData[fkCol];
    if (fkValue === null || fkValue === undefined) return undefined;

    if (db.type !== 'sqlite') return undefined; // non-SQLite: manual FK path not supported
    let fkList: { from: string; table: string; to: string }[] = [];
    try {
      const res = await db.query<{ from: string; table: string; to: string }>(
        `PRAGMA foreign_key_list("${currentTable}")`
      );
      fkList = res.rows;
    } catch { return undefined; } 
    const fk = fkList.find(f => f.from === fkCol);
    if (!fk) return undefined;

    const { rows } = await db.query<Record<string, unknown>>(
      `SELECT * FROM "${fk.table}" WHERE "${fk.to}" = ?`,
      [fkValue as string | number]
    );
    if (!rows[0]) return undefined;

    currentTable = fk.table;
    currentData = rows[0];
  }

  return currentData[parts[parts.length - 1]];
}

// ===== Condition evaluation =====

async function evaluateCondition(
  condition: RuleCondition | null | undefined,
  table: string,
  data: Record<string, unknown>,
  oldData?: Record<string, unknown>,
): Promise<boolean> {
  if (!condition) return true;

  const fieldVal = await resolveFieldPath(table, condition.field, data);
  const expected = condition.value;

  switch (condition.operator) {
    case 'eq':       return String(fieldVal ?? '') === String(expected ?? '');
    case 'neq':      return String(fieldVal ?? '') !== String(expected ?? '');
    case 'gt':       return Number(fieldVal) > Number(expected);
    case 'lt':       return Number(fieldVal) < Number(expected);
    case 'gte':      return Number(fieldVal) >= Number(expected);
    case 'lte':      return Number(fieldVal) <= Number(expected);
    case 'contains': return String(fieldVal ?? '').includes(String(expected ?? ''));
    case 'changed':
      if (!oldData) return true;
      return (await resolveFieldPath(table, condition.field, oldData)) !== fieldVal;
    case 'was_eq':
      if (!oldData) return false;
      return String((await resolveFieldPath(table, condition.field, oldData)) ?? '') === String(expected ?? '');
    case 'was_neq':
      if (!oldData) return true;
      return String((await resolveFieldPath(table, condition.field, oldData)) ?? '') !== String(expected ?? '');
    default:
      return false;
  }
}

// ===== Expression evaluation =====

function evaluateExpression(expr: string, data: Record<string, unknown>): unknown {
  if (/[+\-*/()]/.test(expr)) {
    try {
      const depValues: Record<string, number> = {};
      const tokens = expr.match(/[a-zA-Z_][a-zA-Z0-9_]*/g) ?? [];
      for (const token of tokens) {
        if (token in data) {
          depValues[token] = Number(data[token]) || 0;
        } else if (token.startsWith('__old_')) {
          depValues[token] = 0;
        }
      }
      return evaluateFormula(expr, depValues);
    } catch {
      return expr;
    }
  }
  if (/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(expr) && expr in data) return data[expr];
  const num = Number(expr);
  if (!Number.isNaN(num) && expr.trim() !== '') return num;
  return expr;
}

// ===== Rule execution =====

export async function executeBefore(
  table: string,
  action: TriggerAction,
  data: Record<string, unknown>,
  oldData?: Record<string, unknown>,
  locale = 'en',
): Promise<BeforeResult> {
  const triggerType = `before_${action}`;
  const rules = await getRulesForTable(table, triggerType);

  const errors: string[] = [];
  let currentData = { ...data };

  for (const rule of rules) {
    const condition = rule.condition ? JSON.parse(rule.condition) as RuleCondition : null;
    if (!(await evaluateCondition(condition, table, currentData, oldData))) continue;

    const actions = JSON.parse(rule.actions) as RuleAction[];
    for (const act of actions) {
      switch (act.type) {
        case 'validate': {
          const raw = act.message ?? `ERROR_RULE_VALIDATION_FAILED:${rule.name}`;
          errors.push(raw.startsWith('$') ? i18nT(raw, locale) : raw);
          break;
        }
        case 'set_field':
          if (act.field && act.value !== undefined) {
            currentData[act.field] = evaluateExpression(act.value, currentData);
          }
          break;
      }
    }
  }

  return { allowed: errors.length === 0, data: currentData, errors };
}

// ===== Manual trigger =====

export interface ManualResult {
  success: boolean;
  errors: string[];
}

export async function executeManual(
  ruleId: string,
  data: Record<string, unknown>,
  table: string,
): Promise<ManualResult> {
  const db = getDb();
  const { rows } = await db.query<{
    id: string; name: string; table_name: string; trigger_type: string;
    condition: string | null; actions: string; enabled: number;
  }>(
    'SELECT * FROM _zenku_rules WHERE id = ? AND trigger_type = ? AND enabled = 1',
    [ruleId, 'manual']
  );
  const rule = rows[0];
  if (!rule) return { success: false, errors: ['ERROR_RULE_NOT_FOUND_OR_DISABLED'] };

  const condition = rule.condition ? JSON.parse(rule.condition) as RuleCondition : null;
  if (!(await evaluateCondition(condition, table, data))) {
    return { success: false, errors: ['ERROR_RULE_CONDITION_MISMATCH'] };
  }

  const actions = JSON.parse(rule.actions) as RuleAction[];
  const errors: string[] = [];

  for (const act of actions) {
    try {
      switch (act.type) {
        case 'validate': {
          const rawMsg = act.message ?? `ERROR_RULE_VALIDATION_FAILED:${rule.name}`;
          errors.push(rawMsg.startsWith('$') ? i18nT(rawMsg, 'en') : rawMsg);
          break;
        }

        case 'set_field':
          if (act.field && act.value !== undefined && data.id !== undefined) {
            const newVal = evaluateExpression(act.value, data);
            await db.execute(
              `UPDATE "${table}" SET "${act.field}" = ?, updated_at = ? WHERE id = ?`,
              [newVal as string | number | null, dbNow(), data.id as string | number]
            );
            data[act.field] = newVal;
          }
          break;

        case 'create_record':
          if (act.target_table && act.record_data) {
            const record: Record<string, unknown> = {};
            for (const [key, expr] of Object.entries(act.record_data)) {
              record[key] = evaluateExpression(expr, data);
            }
            const keys = Object.keys(record);
            await db.execute(
              `INSERT INTO "${act.target_table}" (${keys.map(k => `"${k}"`).join(', ')}) VALUES (${keys.map(() => '?').join(', ')})`,
              Object.values(record)
            );
          }
          break;

        case 'update_record': {
          if (!act.target_table || !act.record_data || !act.where) break;
          const whereEntries = Object.entries(act.where);
          const whereClause = whereEntries.map(([col]) => `"${col}" = ?`).join(' AND ');
          const whereValues = whereEntries.map(([, expr]) => evaluateExpression(expr, data));
          const { rows: targetRows } = await db.query<Record<string, unknown>>(
            `SELECT * FROM "${act.target_table}" WHERE ${whereClause} LIMIT 1`,
            whereValues
          );
          const targetRecord = targetRows[0];
          const context: Record<string, unknown> = { ...data };
          if (targetRecord) {
            for (const [k, v] of Object.entries(targetRecord)) context[`__old_${k}`] = v;
          }
          const updates: Record<string, unknown> = {};
          for (const [key, expr] of Object.entries(act.record_data)) {
            updates[key] = evaluateExpression(expr, context);
          }
          if (targetRecord) {
            const setClause = Object.keys(updates).map(k => `"${k}" = ?`).join(', ');
            await db.execute(
              `UPDATE "${act.target_table}" SET ${setClause} WHERE ${whereClause}`,
              [...Object.values(updates), ...whereValues]
            );
          }
          break;
        }

        case 'webhook':
          if (act.url) {
            const method = act.method ?? 'POST';
            const start = Date.now();
            try {
              const response = await fetch(act.url, {
                method,
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ table, data, rule: rule.name }),
              });
              await writeWebhookLog({
                rule_id: rule.id, rule_name: rule.name, table_name: table,
                record_id: data.id !== undefined ? String(data.id) : undefined,
                trigger_type: 'manual', url: act.url, method,
                http_status: response.status, duration_ms: Date.now() - start,
                status: response.ok ? 'success' : 'failed',
              });
            } catch (err) {
              await writeWebhookLog({
                rule_id: rule.id, rule_name: rule.name, table_name: table,
                record_id: data.id !== undefined ? String(data.id) : undefined,
                trigger_type: 'manual', url: act.url, method,
                duration_ms: Date.now() - start, status: 'failed', error: String(err),
              });
              throw err;
            }
          }
          break;

        case 'notify':
          console.log(`[RuleEngine/manual] Notify — rule "${rule.name}": ${act.text ?? ''}`);
          break;
      }
    } catch (err) {
      errors.push(`ERROR_ACTION_EXECUTION_FAILED:${String(err)}`);
    }
  }

  return { success: errors.length === 0, errors };
}

export async function executeAfter(
  table: string,
  action: TriggerAction,
  data: Record<string, unknown>,
  oldData?: Record<string, unknown>,
): Promise<void> {
  const triggerType = `after_${action}`;
  const rules = await getRulesForTable(table, triggerType);

  for (const rule of rules) {
    const condition = rule.condition ? JSON.parse(rule.condition) as RuleCondition : null;
    if (!(await evaluateCondition(condition, table, data, oldData))) continue;

    const db = getDb();
    const actions = JSON.parse(rule.actions) as RuleAction[];

    for (const act of actions) {
      switch (act.type) {
        case 'set_field':
          if (act.field && act.value !== undefined && data.id !== undefined) {
            const newVal = evaluateExpression(act.value, data);
            await db.execute(
              `UPDATE "${table}" SET "${act.field}" = ? WHERE id = ?`,
              [newVal as string | number | null, data.id as string | number]
            );
          }
          break;

        case 'create_record':
          if (act.target_table && act.record_data) {
            const record: Record<string, unknown> = {};
            for (const [key, expr] of Object.entries(act.record_data)) {
              record[key] = evaluateExpression(expr, data);
            }
            const keys = Object.keys(record);
            await db.execute(
              `INSERT INTO "${act.target_table}" (${keys.map(k => `"${k}"`).join(', ')}) VALUES (${keys.map(() => '?').join(', ')})`,
              Object.values(record)
            );
          }
          break;

        case 'update_record': {
          if (!act.target_table || !act.record_data || !act.where) {
            console.warn(`[RuleEngine] update_record rule "${rule.name}" missing required fields`);
            break;
          }
          const whereEntries = Object.entries(act.where);
          const whereClause = whereEntries.map(([col]) => `"${col}" = ?`).join(' AND ');
          const whereValues = whereEntries.map(([, expr]) => evaluateExpression(expr, data));
          const { rows: targetRows } = await db.query<Record<string, unknown>>(
            `SELECT * FROM "${act.target_table}" WHERE ${whereClause} LIMIT 1`,
            whereValues
          );
          const targetRecord = targetRows[0];
          const context: Record<string, unknown> = { ...data };
          if (targetRecord) {
            for (const [k, v] of Object.entries(targetRecord)) context[`__old_${k}`] = v;
          }
          const updates: Record<string, unknown> = {};
          for (const [key, expr] of Object.entries(act.record_data)) {
            updates[key] = evaluateExpression(expr, context);
          }
          if (targetRecord) {
            const setClause = Object.keys(updates).map(k => `"${k}" = ?`).join(', ');
            await db.execute(
              `UPDATE "${act.target_table}" SET ${setClause} WHERE ${whereClause}`,
              [...Object.values(updates), ...whereValues]
            );
          } else {
            const insertRecord: Record<string, unknown> = { ...updates };
            for (const [col, expr] of whereEntries) insertRecord[col] = evaluateExpression(expr, data);
            const cols = Object.keys(insertRecord).map(k => `"${k}"`).join(', ');
            const placeholders = Object.keys(insertRecord).map(() => '?').join(', ');
            await db.execute(
              `INSERT INTO "${act.target_table}" (${cols}) VALUES (${placeholders})`,
              Object.values(insertRecord)
            );
          }
          break;
        }

        case 'update_related_records': {
          if (!act.via_table || !act.via_foreign_key || !act.target_table || !act.record_data || !act.where) {
            console.warn(`[RuleEngine] update_related_records rule "${rule.name}" missing required fields`);
            break;
          }
          if (data.id === undefined) {
            console.warn(`[RuleEngine] update_related_records rule "${rule.name}": source record has no id`);
            break;
          }
          const { rows: viaRecords } = await db.query<Record<string, unknown>>(
            `SELECT * FROM "${act.via_table}" WHERE "${act.via_foreign_key}" = ?`,
            [data.id as string | number]
          );
          for (const viaRecord of viaRecords) {
            const whereEntries = Object.entries(act.where);
            const whereClause = whereEntries.map(([col]) => `"${col}" = ?`).join(' AND ');
            const whereValues = whereEntries.map(([, expr]) => evaluateExpression(expr, viaRecord));
            const { rows: targetRows } = await db.query<Record<string, unknown>>(
              `SELECT * FROM "${act.target_table}" WHERE ${whereClause} LIMIT 1`,
              whereValues
            );
            const targetRecord = targetRows[0];
            const context: Record<string, unknown> = { ...viaRecord };
            if (targetRecord) {
              for (const [k, v] of Object.entries(targetRecord)) context[`__old_${k}`] = v;
            }
            const updates: Record<string, unknown> = {};
            for (const [key, expr] of Object.entries(act.record_data)) {
              updates[key] = evaluateExpression(expr, context);
            }
            if (targetRecord) {
              const setClause = Object.keys(updates).map(k => `"${k}" = ?`).join(', ');
              await db.execute(
                `UPDATE "${act.target_table}" SET ${setClause} WHERE ${whereClause}`,
                [...Object.values(updates), ...whereValues]
              );
            } else {
              const insertRecord: Record<string, unknown> = { ...updates };
              for (const [col, expr] of Object.entries(act.where)) {
                insertRecord[col] = evaluateExpression(expr, viaRecord);
              }
              const cols = Object.keys(insertRecord).map(k => `"${k}"`).join(', ');
              const placeholders = Object.keys(insertRecord).map(() => '?').join(', ');
              await db.execute(
                `INSERT INTO "${act.target_table}" (${cols}) VALUES (${placeholders})`,
                Object.values(insertRecord)
              );
            }
          }
          break;
        }

        case 'webhook':
          if (act.url) {
            const method = act.method ?? 'POST';
            const start = Date.now();
            try {
              const response = await fetch(act.url, {
                method,
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ table, action, data, rule: rule.name }),
              });
              await writeWebhookLog({
                rule_id: rule.id, rule_name: rule.name, table_name: table,
                record_id: data.id !== undefined ? String(data.id) : undefined,
                trigger_type: triggerType, url: act.url, method,
                http_status: response.status, duration_ms: Date.now() - start,
                status: response.ok ? 'success' : 'failed',
              });
            } catch (err) {
              console.error(`[RuleEngine] Webhook failed for rule "${rule.name}":`, err);
              await writeWebhookLog({
                rule_id: rule.id, rule_name: rule.name, table_name: table,
                record_id: data.id !== undefined ? String(data.id) : undefined,
                trigger_type: triggerType, url: act.url, method,
                duration_ms: Date.now() - start, status: 'failed', error: String(err),
              });
            }
          }
          break;

        case 'notify':
          console.log(`[RuleEngine] Notify — rule "${rule.name}": ${act.text ?? ''}`);
          break;
      }
    }
  }
}
