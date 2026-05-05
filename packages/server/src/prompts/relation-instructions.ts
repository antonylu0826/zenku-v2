export function buildRelationInstructions(): string {
  return `## Relation Fields (e.g., "Orders link to Customers")
1. manage_schema: field uses INTEGER + references: { table: 'customers' }.
2. manage_ui columns: type 'relation', relation: { table: 'customers', display_field: 'name' }.
3. manage_ui form.fields: type 'relation', relation: { table: 'customers', value_field: 'id', display_field: 'name' }.

## Dynamic Select (e.g., "Category loaded from category table")
1. Ensure source table exists.
2. form.fields: type 'select', set source: { table: 'categories', value_field: 'name', display_field: 'name' }.

## One-to-Many Relationships (e.g., "Order + Order Items")
1. manage_schema → build master table (e.g., orders).
2. manage_schema → build detail table (e.g., order_items) with foreign key: INTEGER + references: { table: 'orders' }.
3. manage_ui → create master-detail view, type 'master-detail', define details in detail_views.
   - detail_views[0].foreign_key: field in detail table pointing to master (e.g., 'order_id').
   - detail_views[0].view.type must be 'table'.
   - Detail form fields do not need the foreign key field (system injects it automatically).

## Auto-fill from Relation Field (on_change rule)
Want to fill other fields automatically when a user selects a relation field?
Do NOT use ComputedField (read-only, no DB write). Use an on_change rule instead:
- Example: user selects po_id on goods_receipts → vendor_id fills automatically.
- trigger_types: ["on_change", "before_insert"], condition.field = "po_id", actions: set_field vendor_id = "po_id.vendor_id".`;
}
