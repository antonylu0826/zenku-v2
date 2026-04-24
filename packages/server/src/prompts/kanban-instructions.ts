export function buildKanbanInstructions(): string {
  return `## Kanban View
manage_ui, type: 'kanban', set kanban: { group_field, title_field }.
- group_field should be a select type field with fixed options (e.g., status).
- Still require columns and form (used as list mode fallback).`;
}
