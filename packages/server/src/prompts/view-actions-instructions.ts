export function buildViewActionsInstructions(): string {
  return `## Custom ViewActions
To add a custom action to an existing view, always follow this sequence:
1. manage_ui({ action: 'get_view', view_id: '...' }) — get current full definition.
2. Add the new action object into definition.actions[].
3. manage_ui({ action: 'update_view', view: { ...full modified definition } }).

Behavior types:
1. set_field — { type: 'set_field', field: 'status', value: 'approved' }
2. trigger_rule — { type: 'trigger_rule', rule_id: '<rule_id>' }
3. webhook — { type: 'webhook', url: 'https://...', method: 'POST', payload: '{"id":"{{id}}"}' }
4. navigate — { type: 'navigate', view_id: 'orders', filter_field: 'customer_id', filter_value_from: 'id' }
5. create_related — { type: 'create_related', table: 'shipments', field_mapping: { order_id: 'id', status: 'pending' } }

context: 'record' (default) | 'list' | 'both'
Use visible_when and confirm: { title, description } for status transitions.`;
}
