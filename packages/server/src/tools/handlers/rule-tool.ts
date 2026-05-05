import { ZenkuTool } from '../types';
import { runLogicAgent } from '../../agents/logic-agent';

export const manageRulesTool: ZenkuTool = {
  definition: {
    name: 'manage_rules',
    description: `Create or modify business rules (automation flows, validation).

Rules execute automatically at specified trigger points:
- on_change: form field value changes (frontend live event, record NOT yet saved). Use for FK lookup auto-fill (e.g., select PO → fill vendor_id immediately).
- before_insert / before_update / before_delete: Can intercept, modify data, validate (before DB write)
- after_insert / after_update / after_delete: Can trigger side effects (webhooks, create records)
- manual: triggered by a custom ViewAction button (trigger_rule behavior)

Use trigger_types (array) to apply the same rule to multiple trigger points:
- Example: ["on_change", "before_insert"] → live UX fill + DB safety net

Action types:
- set_field: Set field value (value can be FK dot path like "po_id.vendor_id" or formula like "total * 0.9")
- validate: Validation rule (reject operation if condition met, return message)
- create_record: Insert new record in another table (NOT allowed in on_change)
- update_record: Update existing record in another table (NOT allowed in on_change)
- update_related_records: Batch update target table via intermediate detail table (NOT allowed in on_change)
- webhook: Call external URL (NOT allowed in on_change)
- notify: Record notification

Condition operators: eq, neq, gt, lt, gte, lte, contains, changed, was_eq, was_neq
- changed: fires whenever the field value changes (use with on_change)
- was_eq: Old value equals value before trigger (good for "status changed from X" in after_update rules)
- was_neq: Old value not equals value

Condition field supports FK paths (cross-table conditions):
- To check customer tier in order_items rule, use condition.field "order_id.customer_id.tier"

Choosing trigger:
- Need live UX (user sees value appear while filling form)? → on_change
- Need data integrity even if frontend bypassed? → before_insert / before_update
- Need both? → trigger_types: ["on_change", "before_insert"]

on_change example — auto-fill vendor when PO is selected:
{
  "trigger_types": ["on_change", "before_insert"],
  "condition": { "field": "po_id", "operator": "changed" },
  "actions": [{ "type": "set_field", "field": "vendor_id", "value": "po_id.vendor_id" }]
}`,
    input_schema: {
      type: 'object' as const,
      properties: {
        action: {
          type: 'string',
          enum: ['create_rule', 'update_rule', 'delete_rule', 'list_rules'],
        },
        rule_id: { type: 'string', description: 'Rule ID for update_rule/delete_rule' },
        table_name: { type: 'string', description: 'Filter specific table in list_rules' },
        rule: {
          type: 'object',
          description: 'Rule definition (required for create_rule/update_rule)',
          properties: {
            name: { type: 'string', description: 'Rule name' },
            description: { type: 'string' },
            table_name: { type: 'string', description: 'Table this rule applies to' },
            trigger_types: {
              description: 'Trigger types (array for multiple, or single string). Use on_change for live form fill, before_insert/before_update for DB safety. Example: ["on_change","before_insert"] or "after_update"',
              oneOf: [
                {
                  type: 'array',
                  items: {
                    type: 'string',
                    enum: ['on_change', 'before_insert', 'after_insert', 'before_update', 'after_update', 'before_delete', 'after_delete', 'manual'],
                  },
                },
                {
                  type: 'string',
                  enum: ['on_change', 'before_insert', 'after_insert', 'before_update', 'after_update', 'before_delete', 'after_delete', 'manual'],
                },
              ],
            },
            condition: {
              type: 'object',
              description: 'Trigger condition (not set = always trigger). Field supports FK dot path: e.g., "order_id.customer_id.tier". For on_change, set field to the watched field and operator to "changed".',
              properties: {
                field: {
                  type: 'string',
                  description: 'Field name. Can use FK dot path to cross tables, e.g., "order_id.customer_id.tier"',
                },
                operator: { type: 'string', enum: ['eq', 'neq', 'gt', 'lt', 'gte', 'lte', 'contains', 'changed', 'was_eq', 'was_neq'] },
                value: {},
              },
              required: ['field', 'operator'],
            },
            actions: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  type: { type: 'string', enum: ['set_field', 'validate', 'create_record', 'update_record', 'update_related_records', 'webhook', 'notify'] },
                  field: { type: 'string', description: 'Target field for set_field' },
                  value: { type: 'string', description: 'Value or FK dot path or formula for set_field. E.g. "po_id.vendor_id" to pull vendor from linked PO.' },
                  message: { type: 'string', description: 'Error message for validate' },
                  target_table: { type: 'string', description: 'Target table for create/update record actions' },
                  record_data: { type: 'object', description: 'Field mapping (field_name -> expression). In update_related_records, use detail field names directly, and prefix target table existing values with __old_, e.g., "__old_quantity + quantity"' },
                  where: { type: 'object', description: 'update_record / update_related_records: Condition to locate target records. Key is target table field, value is source expression. Example: { product_id: "product_id" }' },
                  via_table: { type: 'string', description: 'Intermediate detail table for update_related_records (e.g., purchase_order_items)' },
                  via_foreign_key: { type: 'string', description: 'FK field in detail table pointing to source table (e.g., purchase_order_id)' },
                  url: { type: 'string', description: 'webhook URL' },
                  method: { type: 'string', description: 'webhook HTTP method, default POST' },
                  text: { type: 'string', description: 'Notification text' },
                },
                required: ['type'],
              },
            },
            priority: { type: 'number', description: 'Priority (smaller number executes first), default 0' },
          },
          required: ['name', 'table_name', 'trigger_types', 'actions'],
        },
      },
      required: ['action'],
    },
  },
  execute: async (input: any, userMessage?: string) => {
    return runLogicAgent(input, userMessage!);
  },
};
