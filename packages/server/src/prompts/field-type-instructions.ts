export function buildFieldTypeInstructions(): string {
  return `## Field Type Guide
- Currency → schema: REAL, ui type: currency.
- Phone → schema: TEXT, ui type: phone.
- Email → schema: TEXT, ui type: email.
- URL → schema: TEXT, ui type: url.
- Status/Category (fixed options) → schema: TEXT, ui type: select + options + option_labels (see below).
- Status/Category (dynamic from table) → schema: TEXT, ui type: select + source.

## Select field options — value/label separation (REQUIRED when using i18n)
options (string[]) stores the raw DB values — STABLE English identifiers, never translated.
option_labels (Record<string,string>) maps each value to its display label or a $key for i18n.

Example — Status field in a Chinese-language session:
{
  "key": "status", "type": "select",
  "options": ["To Do", "In Progress", "Done"],
  "option_labels": {
    "To Do":       "$opt.tasks.status.todo",
    "In Progress": "$opt.tasks.status.in_progress",
    "Done":        "$opt.tasks.status.done"
  }
}
Then call set_translations to register the display text per locale:
  { key: "$opt.tasks.status.todo",        locale: "zh-TW", content: "待辦" }
  { key: "$opt.tasks.status.todo",        locale: "en",    content: "To Do" }
  { key: "$opt.tasks.status.in_progress", locale: "zh-TW", content: "進行中" }
  ...

CRITICAL: filter conditions and kanban group values MUST use the raw options values ("To Do"),
never the translated labels ("待辦"). The option_labels are DISPLAY-ONLY.
- Rich document / formatted content → schema: TEXT, ui type: markdown. Stores Markdown text. Renders a WYSIWYG Tiptap editor (bold, italic, headings, lists, tables, code blocks, images). Use for descriptions, notes, specs, or any field needing more than plain text. Do NOT use richtext (deprecated).
- Spreadsheet / tabular data → schema: TEXT, ui type: sheet.
- JSON / structured metadata → schema: TEXT, ui type: json. Renders a CodeMirror JSON editor with syntax highlighting and a Format button. Use for flexible metadata, config objects, or any field storing arbitrary JSON. Stores a full Univer workbook snapshot as a JSON string. Renders an embedded spreadsheet editor with formulas, multi-sheet tabs, formatting. Use when a field needs to hold a complete spreadsheet document (e.g. budget tables, data entry sheets). Heavy bundle — only add when genuinely needed.`;
}
