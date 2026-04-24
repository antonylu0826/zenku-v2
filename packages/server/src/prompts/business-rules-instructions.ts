export function buildBusinessRulesInstructions(): string {
  return `## Business Rules (e.g., "90% discount for VIPs")
1. manage_rules → create_rule.
2. trigger_type: before_insert (modification/validation), after_insert (side effects).
3. condition.field: supports FK dot path, e.g., "order_id.customer_id.tier".
4. actions:
   - set_field: modify field values of source record.
   - validate: reject operation with message.
   - create_record: INSERT into another table.
   - update_record: UPDATE record in another table via where condition and record_data.
   - update_related_records: batch update multiple records via intermediate table (e.g., order → items → inventory).
     - via_table: intermediate detail table.
     - via_foreign_key: FK in detail table pointing to source.
     - target_table: table to update.
     - where: mapping between target table fields and source/detail fields.
     - record_data: update expressions; target current value is prefixed with __old_.
   - webhook: call external URL.`;
}
