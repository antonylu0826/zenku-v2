export function buildFieldTypeInstructions(): string {
  return `## Field Type Guide
- Currency → schema: REAL, ui type: currency.
- Phone → schema: TEXT, ui type: phone.
- Email → schema: TEXT, ui type: email.
- URL → schema: TEXT, ui type: url.
- Status/Category (fixed options) → schema: TEXT, ui type: select + options.
- Status/Category (dynamic from table) → schema: TEXT, ui type: select + source.`;
}
