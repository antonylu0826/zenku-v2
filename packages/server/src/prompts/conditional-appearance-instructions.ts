export function buildConditionalAppearanceInstructions(): string {
  return `## Conditional Appearance (Dynamic UI rendering)
Use appearance[] on form fields to change how a field looks or behaves based on other field values. Evaluated client-side in real time — no extra server calls.

Common patterns:
1. Show a field only when another field has a specific value:
   appearance: [{ when: { field: "customer_type", operator: "neq", value: "company" }, apply: { visibility: "hidden" } }]
2. Make fields read-only after a status is set:
   appearance: [{ when: { field: "status", operator: "eq", value: "completed" }, apply: { enabled: false } }]
3. Highlight value by threshold:
   appearance: [{ when: { field: "amount", operator: "gt", value: 10000 }, apply: { text_color: "#dc2626", font_weight: "bold" } }]
4. Conditionally required:
   appearance: [{ when: { field: "payment_method", operator: "eq", value: "credit_card" }, apply: { required: true } }]
5. Master record lookup (Master-Detail only):
   Use "$master." prefix to read values from the parent master record.
   appearance: [{ when: { field: "$master.status", operator: "neq", value: "draft" }, apply: { enabled: false } }]
6. Multiple rules: later rules override earlier when both match.

Constraints:
- appearance[] only works in form.fields (not columns).
- The "field" in "when" must be a key that exists in the same form, or use "$master.field_key" for master-detail.
- For permanent hiding, use hidden_in_form: true instead of appearance[].
- To remove a conditional appearance rule, call update_view and omit the appearance property from that field.`;
}
