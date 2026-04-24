/**
 * Shared dashboard widget authoring rules.
 * Imported by both the in-app orchestrator and the MCP server so the two
 * instruction sets stay in sync from a single source of truth.
 */
export function buildDashboardInstructions(): string {
  return `## Dashboard widgets

Widget types: stat_card, trend_card, bar_chart, area_chart, pie_chart, mini_table.
Dashboard views do NOT use columns / form / actions.

**Widget type guide:**
- stat_card: KPI number. Query returns ONE row with "value" (or "current_value"/"count"/"total"). Include "previous_value" or "delta" (percentage) to show a colored trend badge. Always add config.description (subtitle string).
- trend_card: Same as stat_card; query must return current_value + previous_value.
- area_chart: For any time-series, trend, or date-ordered data. Renders with gradient fill. config: x_key, y_key.
- bar_chart: For category comparisons where x-axis is NOT a date. config: x_key, y_key.
- pie_chart: For part-of-whole breakdowns (max 6 slices). Renders as a donut. config: label_key, value_key.
- mini_table: Ranked or recent records, up to 10 rows.

---

**STRICT RULE — widget titles:**
The title is a plain business label. The renderer already knows the widget type.
NEVER write the widget type in the title, with or without parentheses.

❌ WRONG: "Sales Trend (Line)"   "Product Share (Pie)"   "Trend (Area)"
✅ RIGHT:  "Sales Trend"         "Product Sales Share"   "Revenue Trend"

---

**STRICT RULE — dashboard row layout:**
The dashboard uses a 12-column grid. Every row must sum to exactly 12 columns.
Sizes: sm = 3 cols | md = 6 cols | lg = 9 cols | full = 12 cols.

Row 1 (KPI): stat_card or trend_card ONLY. size "sm" each. 3 or 4 cards. pie_chart MUST NOT appear in row 1.
Row 2 (Hero): area_chart or bar_chart at size "lg" (left, col 1) + pie_chart at size "sm" (right, col 10). Total = 12. These two widgets MUST share the same row number.
Row 3 (Detail): one or two widgets at size "md". Total = 12.

❌ WRONG row 2: pie_chart alone in its own row, or area_chart alone in its own row — they must be paired.
✅ RIGHT row 2: { type: "area_chart", size: "lg", position: { row: 2, col: 1 } } paired with { type: "pie_chart", size: "sm", position: { row: 2, col: 10 } }

---

**column_labels — ALWAYS required for non-stat widgets:**
Map every SQL column alias to a human-readable display name. Raw SQL names must never appear in the UI.
- area_chart / bar_chart: map x_key and y_key.
- pie_chart: map label_key and value_key.
- mini_table: map every SELECT alias.
Example: config: { x_key: "order_date", y_key: "revenue", column_labels: { "order_date": "Date", "revenue": "Revenue" } }

**delta query pattern (call get_table_schema first to confirm the actual date column name):**
SELECT SUM(amount) as current_value,
       (SELECT SUM(amount) FROM orders WHERE order_date < date('now','start of month')) as previous_value
FROM orders WHERE order_date >= date('now','start of month')

**Quality checklist — verify every item before submitting:**
□ Row 1: ≥3 stat/trend cards (size "sm"). Each has previous_value or delta AND config.description. No pie_chart in row 1.
□ Row 2: area_chart at size "lg" (col 1) AND pie_chart at size "sm" (col 10) share row: 2. Total = 12 cols.
□ Every chart/table widget has column_labels for all displayed columns.
□ No widget title contains the widget type, in parentheses or otherwise.
□ No raw SQL column names appear as display labels.`;
}
