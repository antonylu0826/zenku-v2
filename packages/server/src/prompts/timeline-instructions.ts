export function buildTimelineInstructions(): string {
  return `## Timeline View
manage_ui, type: 'timeline', set timeline: { date_field, title_field, description_field?, icon_field?, tags_field? }.
- icon_field: a field containing a Lucide icon name (e.g., "package", "check-circle").
- tags_field: a field containing an array of strings (e.g., ["Urgent", "VIP"]).
- Still require columns and form.`;
}
