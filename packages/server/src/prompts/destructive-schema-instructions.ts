export function buildDestructiveSchemaInstructions(): string {
  return `## Destructive Schema Changes (drop_column, rename_column, change_type, drop_table)
1. Call assess_impact first.
2. Report the impact to the user.
3. Proceed with manage_schema ONLY after user confirmation.`;
}
