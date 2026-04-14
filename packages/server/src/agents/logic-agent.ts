import { getDb, getAllRules, logChange } from '../db';
import type { AgentResult } from '../types';

interface RuleDef {
  id?: string;
  name: string;
  description?: string;
  table_name: string;
  trigger_type: string;
  condition?: {
    // field can use FK dot-notation to traverse relationships, e.g. "order_id.customer_id.tier"
    // This follows the FK chain: order_id → orders → customer_id → customers → tier
    field: string;
    operator: string;
    value?: unknown;
  };
  actions: {
    type: string;
    field?: string;
    value?: string;
    message?: string;
    target_table?: string;
    record_data?: Record<string, string>;
    url?: string;
    method?: string;
    text?: string;
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

export function runLogicAgent(input: LogicInput, userRequest: string): AgentResult {
  switch (input.action) {
    case 'create_rule':
      return createRule(input.rule!, userRequest);
    case 'update_rule':
      return updateRule(input.rule_id!, input.rule!, userRequest);
    case 'delete_rule':
      return deleteRule(input.rule_id!, userRequest);
    case 'list_rules':
      return listRules(input.table_name);
    default:
      return { success: false, message: '未知的規則操作' };
  }
}

function createRule(rule: RuleDef, userRequest: string): AgentResult {
  const db = getDb();
  const id = rule.id ?? `rule_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

  db.prepare(`
    INSERT INTO _zenku_rules (id, name, description, table_name, trigger_type, condition, actions, priority, enabled)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id,
    rule.name,
    rule.description ?? null,
    rule.table_name,
    rule.trigger_type,
    rule.condition ? JSON.stringify(rule.condition) : null,
    JSON.stringify(rule.actions),
    rule.priority ?? 0,
    rule.enabled !== false ? 1 : 0,
  );

  logChange('logic-agent', 'create_rule', { id, rule }, userRequest);

  return {
    success: true,
    message: `已建立規則「${rule.name}」（${rule.trigger_type} on ${rule.table_name}）`,
    data: { id },
  };
}

function updateRule(ruleId: string, rule: RuleDef, userRequest: string): AgentResult {
  const db = getDb();

  const existing = db.prepare('SELECT id FROM _zenku_rules WHERE id = ?').get(ruleId);
  if (!existing) {
    return { success: false, message: `找不到規則：${ruleId}` };
  }

  db.prepare(`
    UPDATE _zenku_rules
    SET name = ?, description = ?, table_name = ?, trigger_type = ?,
        condition = ?, actions = ?, priority = ?, enabled = ?,
        updated_at = datetime('now')
    WHERE id = ?
  `).run(
    rule.name,
    rule.description ?? null,
    rule.table_name,
    rule.trigger_type,
    rule.condition ? JSON.stringify(rule.condition) : null,
    JSON.stringify(rule.actions),
    rule.priority ?? 0,
    rule.enabled !== false ? 1 : 0,
    ruleId,
  );

  logChange('logic-agent', 'update_rule', { ruleId, rule }, userRequest);

  return {
    success: true,
    message: `已更新規則「${rule.name}」`,
  };
}

function deleteRule(ruleId: string, userRequest: string): AgentResult {
  const db = getDb();
  const result = db.prepare('DELETE FROM _zenku_rules WHERE id = ?').run(ruleId);

  if (result.changes === 0) {
    return { success: false, message: `找不到規則：${ruleId}` };
  }

  logChange('logic-agent', 'delete_rule', { ruleId }, userRequest);
  return { success: true, message: `已刪除規則 ${ruleId}` };
}

function listRules(tableName?: string): AgentResult {
  if (tableName) {
    const db = getDb();
    const rules = db.prepare(
      'SELECT * FROM _zenku_rules WHERE table_name = ? ORDER BY priority ASC'
    ).all(tableName);
    return {
      success: true,
      message: `表 ${tableName} 共有 ${rules.length} 條規則`,
      data: rules,
    };
  }

  const rules = getAllRules();
  return {
    success: true,
    message: `共有 ${rules.length} 條規則`,
    data: rules,
  };
}
