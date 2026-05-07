export function buildBusinessRulesInstructions(): string {
  return `## Business Rules (Automation, Validation, Triggers)
1. manage_rules → create_rule / update_rule.
2. trigger_types (array or single string):
   - on_change: form field value changes (frontend, NOT yet saved). Use for FK lookup auto-fill (e.g., select PO → fill vendor_id live).
   - before_insert / before_update: modify or validate before DB write.
   - after_insert / after_update: side effects (webhooks, create_record). Cannot intercept save.
   - before_delete / after_delete: deletion hooks.
   - manual: triggered by ViewAction button.
   - Combine: ["on_change", "before_insert"] = live UX + safety net.
3. condition.field: supports FK dot path, e.g., "order_id.customer_id.tier".
4. condition.operator for on_change: usually "changed" — fires whenever the field value changes.
5. condition.value for field-vs-field comparison:
   - Plain literal: "pending", 100, true → compared as-is.
   - Cross-table FK path: "order_id.customer_id.tier" → fetches field value from related table.
   - Same-table field reference: "@fieldname" → compares two fields in the SAME table (e.g., "@available_stock" to check if quantity > available_stock). MUST use @prefix.
6. actions:
   - set_field: modify field values. value supports FK path (e.g., "po_id.vendor_id" pulls vendor from linked PO).
   - validate: reject with message.
   - create_record / update_record / update_related_records: write to other tables (NOT allowed in on_change).
   - webhook: external HTTP call (NOT allowed in on_change).
7. on_change example — auto-fill vendor when PO is selected:
   trigger_types: ["on_change", "before_insert"],
   condition: { field: "po_id", operator: "changed" },
   actions: [{ type: "set_field", field: "vendor_id", value: "po_id.vendor_id" }]
8. before_insert example — validate stock availability (field-vs-field comparison):
   trigger_types: ["before_insert"],
   condition: { field: "quantity", operator: "gt", value: "@available_stock" },
   actions: [{ type: "validate", message: "Quantity exceeds available stock." }]
9. Choosing trigger:
   - Live UX (user sees value appear)? → on_change
   - DB integrity even if frontend bypassed? → before_insert / before_update
   - Both? → ["on_change", "before_insert"]`;
}
