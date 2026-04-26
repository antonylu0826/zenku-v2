export function buildI18nInstructions(userLanguage: string): string {
  const isNonEnglish = userLanguage !== 'en';

  return `## Internationalisation (i18n) Rules

### Translation Keys ($key format)
Field labels, column labels, view names, and select option labels support translation keys.
A translation key starts with \`$\`, e.g. \`$field.task.title\`.
When a value starts with \`$\`, the backend resolves it to the user's locale at runtime.

**When to use $key:**
- When creating fields/views intended to be viewed in multiple languages.
- When the user's language is not English (current language: ${userLanguage}).

**Key naming convention:**
- Field labels: \`$field.<table>.<field_name>\`  (e.g. \`$field.tasks.title\`)
- View names:   \`$view.<view_id>\`             (e.g. \`$view.task_management\`)
- Select options: \`$opt.<table>.<field>.<value>\` (e.g. \`$opt.tasks.status.todo\`)

**IMPORTANT for select fields:**
- The stored option VALUE (what goes in the database) MUST remain a stable English identifier, e.g. \`"To Do"\`, \`"In Progress"\`, \`"Done"\`.
- The displayed label CAN be a $key that resolves to the user's language.
- Filter conditions must always use the stored VALUE, NEVER the translated label.
- Example: filter \`{ field: "status", operator: "eq", value: "To Do" }\` is correct.
           filter \`{ field: "status", operator: "eq", value: "待辦" }\` is WRONG.

### Workflow when creating fields/views in non-English sessions
${isNonEnglish ? `The current user language is **${userLanguage}** (not English).
When you create schema or views:
1. Use $key format for field labels and view names.
2. For select fields: set options to stable English values AND set option_labels to $key mappings.
3. After calling manage_schema / manage_ui, call the set_translations tool to register translations for both \`${userLanguage}\` and \`en\` locales.

Full example — creating a "tasks" table with a status select field:

manage_schema: { key: "status", type: "TEXT" }

manage_ui form field:
{
  "key": "status", "type": "select",
  "label": "$field.tasks.status",
  "options": ["To Do", "In Progress", "Done"],
  "option_labels": {
    "To Do":       "$opt.tasks.status.todo",
    "In Progress": "$opt.tasks.status.in_progress",
    "Done":        "$opt.tasks.status.done"
  }
}

set_translations([
  { key: "$field.tasks.title",              locale: "${userLanguage}", content: "標題" },
  { key: "$field.tasks.title",              locale: "en",    content: "Title" },
  { key: "$field.tasks.status",             locale: "${userLanguage}", content: "狀態" },
  { key: "$field.tasks.status",             locale: "en",    content: "Status" },
  { key: "$opt.tasks.status.todo",          locale: "${userLanguage}", content: "待辦" },
  { key: "$opt.tasks.status.todo",          locale: "en",    content: "To Do" },
  { key: "$opt.tasks.status.in_progress",   locale: "${userLanguage}", content: "進行中" },
  { key: "$opt.tasks.status.in_progress",   locale: "en",    content: "In Progress" },
  { key: "$opt.tasks.status.done",          locale: "${userLanguage}", content: "已完成" },
  { key: "$opt.tasks.status.done",          locale: "en",    content: "Done" },
  { key: "$view.task_management",           locale: "${userLanguage}", content: "任務管理" },
  { key: "$view.task_management",           locale: "en",    content: "Task Management" }
])

REMINDER: Filter conditions always use the raw option values ("To Do"), never the $key or translated label.` : `The current user language is English.
You may use plain text labels (no $key needed) for new content.
Use $key format only if the user explicitly asks for multi-language support.`}`;
}
