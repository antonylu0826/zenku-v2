/**
 * Conditional Appearance — Client-side condition evaluation
 * Evaluated in real time on the client without a server round-trip
 */

import type { AppearanceCondition, AppearanceEffect, AppearanceRule } from './types/appearance';

/** Optional context for cross-scope references (e.g. master record in master-detail views) */
export interface AppearanceContext {
  /** Master record values — available when evaluating detail form appearance rules */
  master?: Record<string, unknown>;
}

/**
 * Evaluate a single AppearanceCondition
 * @param condition Condition (may be a compound AND/OR or a single leaf node)
 * @param record    Current form values or row data
 * @param context   Optional cross-scope context (e.g. { master: masterRecord })
 */
/**
 * Resolve dynamic value tokens in appearance conditions.
 * Supported tokens: 'TODAY' → current date as 'YYYY-MM-DD'
 */
function resolveValue(raw: unknown): unknown {
  if (raw === 'TODAY') return new Date().toISOString().slice(0, 10); // e.g. '2025-04-17'
  return raw;
}

/** Return true if the value looks like an ISO date string (YYYY-MM-DD) */
function isDateString(v: unknown): v is string {
  return typeof v === 'string' && /^\d{4}-\d{2}-\d{2}/.test(v);
}

export function evaluateAppearanceCondition(
  condition: AppearanceCondition,
  record: Record<string, unknown>,
  context?: AppearanceContext,
): boolean {
  // Compound condition
  if ('logic' in condition) {
    const results = condition.conditions.map(c => evaluateAppearanceCondition(c, record, context));
    return condition.logic === 'and' ? results.every(Boolean) : results.some(Boolean);
  }

  // Leaf node
  const { field, operator } = condition;

  // Resolve $master. prefix — look up value from context.master
  let fieldVal: unknown;
  if (field.startsWith('$master.') && context?.master) {
    fieldVal = context.master[field.slice(8)];
  } else {
    fieldVal = record[field];
  }
  const value = resolveValue(condition.value);

  // Use string comparison for date fields; numeric otherwise
  const dateMode = isDateString(fieldVal) || isDateString(value);

  const compare = (): number => {
    if (dateMode) {
      const a = String(fieldVal ?? '');
      const b = String(value ?? '');
      return a < b ? -1 : a > b ? 1 : 0;
    }
    return Number(fieldVal) - Number(value);
  };

  switch (operator) {
    case 'eq':       return String(fieldVal ?? '') === String(value ?? '');
    case 'neq':      return String(fieldVal ?? '') !== String(value ?? '');
    case 'gt':       return compare() > 0;
    case 'lt':       return compare() < 0;
    case 'gte':      return compare() >= 0;
    case 'lte':      return compare() <= 0;
    case 'contains': return String(fieldVal ?? '').toLowerCase().includes(String(value ?? '').toLowerCase());
    default:         return false;
  }
}

/**
 * Evaluate a set of AppearanceRules against the given data and merge the final effect.
 * Later rules in the array override earlier ones (last rule wins).
 */
export function resolveAppearance(
  rules: AppearanceRule[],
  record: Record<string, unknown>,
  context?: AppearanceContext,
): AppearanceEffect {
  let effect: AppearanceEffect = {};
  for (const rule of rules) {
    if (rule.enabled === false) continue;  // Skip disabled rules
    if (evaluateAppearanceCondition(rule.when, record, context)) {
      effect = { ...effect, ...rule.apply };
    }
  }
  return effect;
}
