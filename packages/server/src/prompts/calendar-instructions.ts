export function buildCalendarInstructions(): string {
  return `## Calendar View
manage_ui, type: 'calendar', set calendar: { date_field, title_field }.
- Still require columns and form.`;
}
