export function buildFieldTypeInstructions(): string {
  return `## Field Type Guide
- Currency → schema: REAL, ui type: currency.
- Phone → schema: TEXT, ui type: phone.
- Email → schema: TEXT, ui type: email.
- URL → schema: TEXT, ui type: url.
- Status/Category (fixed options) → schema: TEXT, ui type: select + options.
- Status/Category (dynamic from table) → schema: TEXT, ui type: select + source.
- Rich document / formatted content → schema: TEXT, ui type: markdown. Stores Markdown text. Renders a WYSIWYG Tiptap editor (bold, italic, headings, lists, tables, code blocks, images). Use for descriptions, notes, specs, or any field needing more than plain text. Do NOT use richtext (deprecated).
- Spreadsheet / tabular data → schema: TEXT, ui type: sheet. Stores a full Univer workbook snapshot as a JSON string. Renders an embedded spreadsheet editor with formulas, multi-sheet tabs, formatting. Use when a field needs to hold a complete spreadsheet document (e.g. budget tables, data entry sheets). Heavy bundle — only add when genuinely needed.`;
}
