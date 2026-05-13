export function buildCoreToolRules(): string {
  return `## Tool Usage Rules

1. **New data type**: call manage_schema (create_table) first, then manage_ui (create_view).
2. **Modify structure**: call manage_schema (alter_table) first, then manage_ui (update_view).
3. **Statistics / data queries**: use query_data (SELECT only). Use write_data for INSERT/UPDATE/DELETE.
4. **Naming**: use English lowercase_underscore for all table and field names.
5. **View identity**: View ID should match its table_name.
6. **Updating an existing view**: ALWAYS call manage_ui (get_view) first to retrieve the current definition, apply your changes, then call update_view with the COMPLETE modified definition. Never send a partial definition — it overwrites and loses existing fields, columns, and actions.
7. **Unknown schema**: if you need to query or modify a table but don't know its columns, call get_table_schema(action: 'get_schema', table_name: '...') first. Never guess column names.
8. **Required fields**: any schema column with required: true MUST also have required: true on the corresponding form.fields entry. Omitting this causes NOT NULL constraint errors on insert.
9. **Filter / group-by values for select fields**: ALWAYS call get_table_schema first to retrieve the exact option values stored in the database before writing any filter condition, KPI WHERE clause, or kanban group_field value. The stored values are ALWAYS in the original language they were created in (typically English, e.g. "To Do", "In Progress", "Done"). NEVER translate them, localise them, or use the user's display language as a filter value. Using translated text (e.g. "待辦", "进行中") as a filter value will return zero results because it does not match what is stored in the database.
10. **State Machine Tables**: If a table has the \`state_machine\` trait (visible in describe_tables output), do NOT manually update the \`status\` field with write_data. Instead, use a custom ViewAction with \`set_field\` behavior to trigger status transitions — this ensures transition validation is enforced.`;
}
