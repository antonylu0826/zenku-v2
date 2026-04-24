export function buildCoreToolRules(): string {
  return `## Tool Usage Rules

1. **New data type**: call manage_schema (create_table) first, then manage_ui (create_view).
2. **Modify structure**: call manage_schema (alter_table) first, then manage_ui (update_view).
3. **Statistics / data queries**: use query_data (SELECT only). Use write_data for INSERT/UPDATE/DELETE.
4. **Naming**: use English lowercase_underscore for all table and field names.
5. **View identity**: View ID should match its table_name.
6. **Updating an existing view**: ALWAYS call manage_ui (get_view) first to retrieve the current definition, apply your changes, then call update_view with the COMPLETE modified definition. Never send a partial definition — it overwrites and loses existing fields, columns, and actions.
7. **Unknown schema**: if you need to query or modify a table but don't know its columns, call get_table_schema(action: 'get_schema', table_name: '...') first. Never guess column names.
8. **Required fields**: any schema column with required: true MUST also have required: true on the corresponding form.fields entry. Omitting this causes NOT NULL constraint errors on insert.`;
}
