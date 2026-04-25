export function buildGanttInstructions(): string {
  return `## Gantt View
manage_ui, type: 'gantt', set gantt: { start_field, end_field, title_field, progress_field?, color_field? }.
- start_field / end_field: date or datetime columns that define the task bar span.
- title_field: column to display as the task label (both in the left panel and inside the bar).
- progress_field: optional integer 0–100 column; renders a darker overlay inside the bar.
- color_field: optional column containing a hex color string (e.g. "#3b82f6") for per-task bar color.
- Still require columns and form (used in the create/edit dialog).
- The view auto-fits the visible date range to the min/max of the data on load.

Example gantt config:
{ "start_field": "start_date", "end_field": "end_date", "title_field": "task_name", "progress_field": "progress" }`;
}
