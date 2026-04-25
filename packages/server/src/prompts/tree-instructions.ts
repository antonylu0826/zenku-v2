export function buildTreeInstructions(): string {
  return `## Tree View
manage_ui, type: 'tree', set tree: { parent_field, label_field, icon_field? }.
- The underlying table MUST have a self-referential nullable FK column (e.g., parent_id INTEGER REFERENCES <same_table>(id)).
- parent_field: the column that stores the parent row id (null = root node).
- label_field: the column displayed as the node label.
- icon_field: optional column containing a Lucide icon name shown next to the label.
- Still require columns and form (used in the create/edit dialog).
- hidden_in_form: true on the parent_field column is recommended so users don't manually set it (the UI injects it automatically when adding a child node).

Example tree config:
{ "parent_field": "parent_id", "label_field": "name" }`;
}
