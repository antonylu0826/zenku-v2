import { getDb, getRulesForTable } from '../db';
import { evaluateFormula } from '@zenku/shared';

// ===== Types =====

export interface RuleCondition {
  // Simple field or dot-notation FK path, e.g. "order_id.customer_id.tier"
  field: string;
  operator: 'eq' | 'neq' | 'gt' | 'lt' | 'gte' | 'lte' | 'contains' | 'changed';
  value?: unknown;
}

export interface RuleAction {
  type: 'set_field' | 'validate' | 'create_record' | 'webhook' | 'notify';
  // set_field
  field?: string;
  value?: string; // literal or formula expression
  // validate
  message?: string;
  // create_record
  target_table?: string;
  record_data?: Record<string, string>; // field → expression
  // webhook
  url?: string;
  method?: string;
  // notify
  text?: string;
}

export interface BeforeResult {
  allowed: boolean;
  data: Record<string, unknown>;
  errors: string[];
}

type TriggerAction = 'insert' | 'update' | 'delete';

// ===== FK path resolution =====

/**
 * Resolve a dot-notation FK path from the given data.
 * e.g. "order_id.customer_id.tier" → follows order_id FK to orders, then customer_id FK to customers, returns tier value.
 * If the field has no dots (or exists directly), returns the data value.
 */
function resolveFieldPath(
  table: string,
  field: string,
  data: Record<string, unknown>,
): unknown {
  // Fast path: field exists directly in data
  if (field in data) return data[field];

  // Dot-notation: "fk_col.next_fk_col.field"
  if (!field.includes('.')) return undefined;

  const db = getDb();
  const parts = field.split('.');
  let currentTable = table;
  let currentData: Record<string, unknown> = data;

  for (let i = 0; i < parts.length - 1; i++) {
    const fkCol = parts[i];
    const fkValue = currentData[fkCol];
    if (fkValue === null || fkValue === undefined) return undefined;

    // Look up FK info for this column on the current table
    const fkList = db.prepare(`PRAGMA foreign_key_list("${currentTable}")`).all() as unknown as {
      from: string; table: string; to: string;
    }[];
    const fk = fkList.find(f => f.from === fkCol);
    if (!fk) return undefined; // not a FK column

    // Fetch related row
    const row = db.prepare(`SELECT * FROM "${fk.table}" WHERE "${fk.to}" = ?`)
      .get(fkValue as string | number | bigint) as Record<string, unknown> | undefined;
    if (!row) return undefined;

    currentTable = fk.table;
    currentData = row;
  }

  return currentData[parts[parts.length - 1]];
}

// ===== Condition evaluation =====

function evaluateCondition(
  condition: RuleCondition | null | undefined,
  table: string,
  data: Record<string, unknown>,
  oldData?: Record<string, unknown>,
): boolean {
  if (!condition) return true; // no condition = always match

  const fieldVal = resolveFieldPath(table, condition.field, data);
  const expected = condition.value;

  switch (condition.operator) {
    case 'eq':
      return String(fieldVal ?? '') === String(expected ?? '');
    case 'neq':
      return String(fieldVal ?? '') !== String(expected ?? '');
    case 'gt':
      return Number(fieldVal) > Number(expected);
    case 'lt':
      return Number(fieldVal) < Number(expected);
    case 'gte':
      return Number(fieldVal) >= Number(expected);
    case 'lte':
      return Number(fieldVal) <= Number(expected);
    case 'contains':
      return String(fieldVal ?? '').includes(String(expected ?? ''));
    case 'changed':
      if (!oldData) return true; // insert → always "changed"
      return resolveFieldPath(table, condition.field, oldData) !== fieldVal;
    default:
      return false;
  }
}

// ===== Expression evaluation =====

function evaluateExpression(expr: string, data: Record<string, unknown>): unknown {
  // If it looks like a formula (contains operators or field names), evaluate as formula
  if (/[+\-*/()]/.test(expr)) {
    try {
      const depValues: Record<string, number> = {};
      // Extract all word tokens that could be field names
      const tokens = expr.match(/[a-zA-Z_][a-zA-Z0-9_]*/g) ?? [];
      for (const token of tokens) {
        if (token in data) {
          depValues[token] = Number(data[token]) || 0;
        }
      }
      return evaluateFormula(expr, depValues);
    } catch {
      return expr;
    }
  }

  // If it matches a field name, return that field's value
  if (/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(expr) && expr in data) {
    return data[expr];
  }

  // Try to parse as number
  const num = Number(expr);
  if (!Number.isNaN(num) && expr.trim() !== '') return num;

  // Return as string literal
  return expr;
}

// ===== Rule execution =====

export function executeBefore(
  table: string,
  action: TriggerAction,
  data: Record<string, unknown>,
  oldData?: Record<string, unknown>,
): BeforeResult {
  const triggerType = `before_${action}`;
  const rules = getRulesForTable(table, triggerType);

  const errors: string[] = [];
  let currentData = { ...data };

  for (const rule of rules) {
    const condition = rule.condition ? JSON.parse(rule.condition) as RuleCondition : null;
    const conditionMatch = evaluateCondition(condition, table, currentData, oldData);
    console.log(`[RuleEngine] ${triggerType} on ${table} — rule "${rule.name}" condition match: ${conditionMatch}`);
    if (!conditionMatch) continue;

    const actions = JSON.parse(rule.actions) as RuleAction[];

    for (const act of actions) {
      switch (act.type) {
        case 'validate':
          // validate action: check the condition — if we got here, condition matched,
          // so the validation fails (i.e., the rule says "reject if condition is met")
          errors.push(act.message ?? `規則「${rule.name}」驗證失敗`);
          break;

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

export async function executeAfter(
  table: string,
  action: TriggerAction,
  data: Record<string, unknown>,
): Promise<void> {
  const triggerType = `after_${action}`;
  const rules = getRulesForTable(table, triggerType);

  for (const rule of rules) {
    const condition = rule.condition ? JSON.parse(rule.condition) as RuleCondition : null;
    if (!evaluateCondition(condition, table, data)) continue;

    const actions = JSON.parse(rule.actions) as RuleAction[];

    for (const act of actions) {
      switch (act.type) {
        case 'set_field':
          // After trigger set_field: UPDATE the record
          if (act.field && act.value !== undefined && data.id !== undefined) {
            const newVal = evaluateExpression(act.value, data);
            const db = getDb();
            db.prepare(`UPDATE "${table}" SET "${act.field}" = ? WHERE id = ?`)
              .run(newVal as string | number | bigint | null, data.id as string | number | bigint);
          }
          break;

        case 'create_record':
          if (act.target_table && act.record_data) {
            const record: Record<string, unknown> = {};
            for (const [key, expr] of Object.entries(act.record_data)) {
              record[key] = evaluateExpression(expr, data);
            }
            const db = getDb();
            const keys = Object.keys(record);
            const placeholders = keys.map(() => '?').join(', ');
            db.prepare(
              `INSERT INTO "${act.target_table}" (${keys.map(k => `"${k}"`).join(', ')}) VALUES (${placeholders})`
            ).run(...(Object.values(record) as (string | number | bigint | null)[]));
          }
          break;

        case 'webhook':
          if (act.url) {
            try {
              await fetch(act.url, {
                method: act.method ?? 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ table, action, data, rule: rule.name }),
              });
            } catch (err) {
              console.error(`[RuleEngine] Webhook failed for rule "${rule.name}":`, err);
            }
          }
          break;

        case 'notify':
          console.log(`[RuleEngine] 通知 — 規則「${rule.name}」：${act.text ?? ''}`);
          break;
      }
    }
  }
}
