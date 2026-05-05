import { getDb, dbNow } from '../db';
import { getAllRules } from '../db/rules';
import { logChange } from '../db/changes';
import { writeJournal } from '../db/journal';
import type { AgentResult } from '../types';

interface RuleDef {
  id?: string;
  name: string;
  description?: string;
  table_name: string;
  trigger_types: string | string[];
  condition?: { field: string; operator: string; value?: unknown };
  actions: {
    type: string; field?: string; value?: string; message?: string;
    target_table?: string; record_data?: Record<string, string>;
    url?: string; method?: string; text?: string;
  }[];
  priority?: number;
  enabled?: boolean;
}

interface LogicInput {
  action: 'create_rule' | 'update_rule' | 'delete_rule' | 'list_rules';
  rule?: RuleDef;
  rule_id?: string;
  table_name?: string;
}

export async function runLogicAgent(input: LogicInput, userRequest: string): Promise<AgentResult> {
  switch (input.action) {
    case 'create_rule':  return createRule(input.rule!, userRequest);
    case 'update_rule':  return updateRule(input.rule_id!, input.rule!, userRequest);
    case 'delete_rule':  return deleteRule(input.rule_id!, userRequest);
    case 'list_rules':   return listRules(input.table_name);
    default:             return { success: false, message: 'Unknown rule operation' };
  }
}

async function createRule(rule: RuleDef, userRequest: string): Promise<AgentResult> {
  const db = getDb();
  const id = rule.id ?? `rule_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const triggerTypesJson = Array.isArray(rule.trigger_types)
    ? JSON.stringify(rule.trigger_types)
    : JSON.stringify([rule.trigger_types]);
  await db.execute(`
    INSERT INTO _zenku_rules (id, name, description, table_name, trigger_types, condition, actions, priority, enabled)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `, [
    id, rule.name, rule.description ?? null, rule.table_name, triggerTypesJson,
    rule.condition ? JSON.stringify(rule.condition) : null,
    JSON.stringify(rule.actions), rule.priority ?? 0, rule.enabled !== false ? 1 : 0,
  ]);
  await logChange('logic-agent', 'create_rule', { id, rule }, userRequest);
  const triggerLabel = Array.isArray(rule.trigger_types) ? rule.trigger_types.join(',') : rule.trigger_types;
  await writeJournal({
    agent: 'logic', type: 'rule_change',
    description: `Created rule "${rule.name}" (${triggerLabel} on ${rule.table_name})`,
    diff: { before: null, after: { id, ...rule } },
    user_request: userRequest, reversible: true,
    reverse_operations: [{ type: 'sql', sql: `DELETE FROM _zenku_rules WHERE id = ${JSON.stringify(id)}` }],
  });
  return {
    success: true,
    message: `Created rule "${rule.name}" (${triggerLabel} on ${rule.table_name})`,
    data: { id },
  };
}

async function updateRule(ruleId: string, rule: RuleDef, userRequest: string): Promise<AgentResult> {
  const db = getDb();
  const { rows } = await db.query('SELECT id FROM _zenku_rules WHERE id = ?', [ruleId]);
  if (!rows[0]) return { success: false, message: `Rule not found: ${ruleId}` };
  const triggerTypesJson = Array.isArray(rule.trigger_types)
    ? JSON.stringify(rule.trigger_types)
    : JSON.stringify([rule.trigger_types]);
  await db.execute(`
    UPDATE _zenku_rules SET name=?, description=?, table_name=?, trigger_types=?,
      condition=?, actions=?, priority=?, enabled=?, updated_at=?
    WHERE id=?
  `, [
    rule.name, rule.description ?? null, rule.table_name, triggerTypesJson,
    rule.condition ? JSON.stringify(rule.condition) : null,
    JSON.stringify(rule.actions), rule.priority ?? 0, rule.enabled !== false ? 1 : 0, dbNow(), ruleId,
  ]);
  await logChange('logic-agent', 'update_rule', { ruleId, rule }, userRequest);
  return { success: true, message: `Updated rule "${rule.name}"` };
}

async function deleteRule(ruleId: string, userRequest: string): Promise<AgentResult> {
  const db = getDb();
  const { rows } = await db.query<Record<string, unknown>>(
    'SELECT * FROM _zenku_rules WHERE id = ?', [ruleId]
  );
  const existing = rows[0];
  if (!existing) return { success: false, message: `Rule not found: ${ruleId}` };

  const restoreSQL = `INSERT OR IGNORE INTO _zenku_rules (id, name, description, table_name, trigger_types, condition, actions, priority, enabled, created_at, updated_at) VALUES (${
    [existing.id, existing.name, existing.description, existing.table_name, existing.trigger_types,
     existing.condition, existing.actions, existing.priority, existing.enabled, existing.created_at, existing.updated_at]
      .map(v => v === null || v === undefined ? 'NULL' : JSON.stringify(v)).join(', ')
  })`;

  const result = await db.execute('DELETE FROM _zenku_rules WHERE id = ?', [ruleId]);
  if (result.rowsAffected === 0) return { success: false, message: `Rule not found: ${ruleId}` };

  await logChange('logic-agent', 'delete_rule', { ruleId }, userRequest);
  await writeJournal({
    agent: 'logic', type: 'rule_change',
    description: `Deleted rule "${String(existing.name)}"`,
    diff: { before: existing, after: null },
    user_request: userRequest, reversible: true,
    reverse_operations: [{ type: 'sql', sql: restoreSQL }],
  });
  return { success: true, message: `Deleted rule ${ruleId}` };
}

async function listRules(tableName?: string): Promise<AgentResult> {
  if (tableName) {
    const { rows } = await getDb().query(
      'SELECT * FROM _zenku_rules WHERE table_name = ? ORDER BY priority ASC', [tableName]
    );
    return { success: true, message: `Table ${tableName} has ${rows.length} rules`, data: rows };
  }
  const rules = await getAllRules();
  return { success: true, message: `Total ${rules.length} rules found`, data: rules };
}
