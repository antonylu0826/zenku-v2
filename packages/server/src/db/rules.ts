import { getDb } from './index';

export interface RuleRow {
  id: string;
  name: string;
  description: string | null;
  table_name: string;
  /** JSON array string, e.g. '["on_change","before_insert"]' */
  trigger_types: string;
  condition: string | null;
  actions: string;
  priority: number;
  enabled: number;
  created_at: string;
  updated_at: string;
}

/**
 * Parse trigger_types field into a string array.
 * Handles both new JSON array format and legacy single-string format.
 */
export function parseTriggerTypes(raw: string): string[] {
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) return parsed as string[];
  } catch { /* not JSON, fall through */ }
  // Legacy format: plain string like "before_insert"
  return raw ? [raw] : [];
}

export async function getRulesForTable(tableName: string, triggerType?: string): Promise<RuleRow[]> {
  const db = getDb();
  const { rows } = await db.query<RuleRow>(
    'SELECT * FROM _zenku_rules WHERE table_name = ? AND enabled = 1 ORDER BY priority ASC',
    [tableName]
  );
  if (!triggerType) return rows;
  return rows.filter(r => parseTriggerTypes(r.trigger_types).includes(triggerType));
}

export async function getAllRules(): Promise<RuleRow[]> {
  const { rows } = await getDb().query<RuleRow>(
    'SELECT * FROM _zenku_rules ORDER BY table_name, priority ASC'
  );
  return rows;
}
