import { getPrimaryViewForTable } from '../db';
import type { AutoNumberConfig } from '@zenku/shared';
import { getDb } from '../db';

function getPeriodKey(cfg: AutoNumberConfig): string {
  const reset = cfg.reset ?? 'never';
  if (reset === 'never') return '';

  const now = new Date();
  const yyyy = now.getFullYear().toString();
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const dd = String(now.getDate()).padStart(2, '0');

  if (reset === 'yearly')  return yyyy;
  if (reset === 'monthly') return `${yyyy}-${mm}`;
  return `${yyyy}-${mm}-${dd}`;
}

function getDateSegment(cfg: AutoNumberConfig): string {
  if (!cfg.date_format) return '';

  const now = new Date();
  const yyyy = now.getFullYear().toString();
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const dd = String(now.getDate()).padStart(2, '0');

  if (cfg.date_format === 'YYYY')     return yyyy;
  if (cfg.date_format === 'YYYYMM')   return `${yyyy}${mm}`;
  return `${yyyy}${mm}${dd}`;
}

// Atomic upsert-and-increment in one round-trip.
// PostgreSQL equivalent: INSERT … ON CONFLICT DO UPDATE SET current_value = … RETURNING current_value
function incrementCounter(tableName: string, fieldName: string, period: string): number {
  const db = getDb();
  const row = db.prepare(`
    INSERT INTO _zenku_counters (table_name, field_name, period, current_value)
    VALUES (?, ?, ?, 1)
    ON CONFLICT(table_name, field_name, period)
    DO UPDATE SET current_value = current_value + 1
    RETURNING current_value
  `).get(tableName, fieldName, period) as { current_value: number };
  return row.current_value;
}

function formatValue(seq: number, cfg: AutoNumberConfig): string {
  const padding = cfg.padding ?? 4;
  return `${cfg.prefix ?? ''}${getDateSegment(cfg)}${String(seq).padStart(padding, '0')}`;
}

interface AutoNumberField {
  key: string;
  cfg: AutoNumberConfig;
}

function getAutoNumberFields(tableName: string): AutoNumberField[] {
  const viewRow = getPrimaryViewForTable(tableName);
  if (!viewRow) return [];

  try {
    const viewDef = JSON.parse(viewRow.definition) as { form?: { fields?: { key: string; type: string; auto_number?: AutoNumberConfig }[] } };
    return (viewDef.form?.fields ?? [])
      .filter(f => f.type === 'auto_number' && f.auto_number)
      .map(f => ({ key: f.key, cfg: f.auto_number! }));
  } catch {
    return [];
  }
}

/**
 * Inject auto-generated sequential numbers into `data` for any `auto_number`
 * fields defined in this table's view. Always overwrites — callers must not
 * pass a value for these fields.
 */
export function applyAutoNumbers(
  tableName: string,
  data: Record<string, unknown>,
): Record<string, unknown> {
  const fields = getAutoNumberFields(tableName);
  if (fields.length === 0) return data;

  const result = { ...data };
  for (const { key, cfg } of fields) {
    result[key] = formatValue(incrementCounter(tableName, key, getPeriodKey(cfg)), cfg);
  }
  return result;
}
