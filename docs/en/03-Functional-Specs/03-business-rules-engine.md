# Business Rules Engine and Automation

> Zenku enables "No-Code Automation" through its business rules engine. AI agents (Logic Agent) can configure trigger conditions and actions based on user requirements to implement complex business logic.

---

## 1. Trigger Types

The rules engine is hooked into different stages of the data lifecycle, categorized into four types:

> **Multiple triggers**: `trigger_types` accepts an array, e.g. `["on_change", "before_insert"]`, allowing a single rule to provide both live UX fill and a DB-write safety net.

### A. Form-time
Fires during form interaction — the record has not yet been saved to the database.
*   `on_change`: Fires when a specific field value changes in the frontend form.
    *   **Primary use**: FK lookup auto-fill (e.g., select a PO → instantly fill vendor, currency).
    *   **Restriction**: Only `set_field` and `validate` are permitted; writing to other tables is not allowed.
    *   **Example**: `trigger_types: ["on_change", "before_insert"]`, condition `po_id changed`, action `set vendor_id = po_id.vendor_id`.

### B. Before Hooks
Used for data validation or automatic correction before writing to the database.
*   `before_insert`: Before a new record is created.
*   `before_update`: Before a record is updated.
*   `before_delete`: Before a record is deleted (often used to block deletions).

### C. After Hooks
Used for cascading updates or external notifications.
*   `after_insert`: After a new record is created.
*   `after_update`: After a record is updated.
*   `after_delete`: After a record is deleted.

### D. Manual Triggers
*   `manual`: Triggered actively by the frontend via "Custom Action Buttons (ViewAction)."

---

## 2. Action Types

When conditions are met, the engine can execute a sequence of the following actions:

| Action | Description | Example |
| :--- | :--- | :--- |
| `validate` | Aborts the operation and throws an error message. | "Insufficient stock, cannot ship." |
| `set_field` | Automatically overwrites field values of the current record. | "Status" automatically set to "Completed." |
| `create_record` | Creates a new record in another table. | Automatically create a "Delivery Note" after an order is established. |
| `update_record` | Updates a single record in another table based on conditions. | Update the latest selling price in the "Products" table. |
| `update_related_records` | **Batch** update related data. | Automatically deduct "Stock Level" for all items associated with a delivery. |
| `webhook` | Sends an HTTP request to an external system. | Notify n8n or Slack. |
| `notify` | In-system notification or logging. | Record an audit trail entry. |

---

## 3. Condition Evaluation Logic

The engine supports a rich set of comparison operators and field-level comparisons:
*   **Comparisons**: `eq`, `neq`, `gt`, `lt`, `gte`, `lte`, `contains`.
*   **State Changes**: `changed` (whether the field value changed), `was_eq` (whether the value before change was a specific value).
*   **Cross-table Reference**: Supports syntax like `customer_id.tier` to directly fetch and evaluate fields from a related table (e.g., Customers).
*   **Same-table Field Comparison**: Use explicit `@fieldname` prefix to compare two fields in the same table. For example:
    *   Condition: `{ field: "quantity", operator: "gt", value: "@available_stock" }` checks if `quantity > available_stock`.
    *   Without the `@` prefix, the value is treated as a literal string or number.

---

## 4. Expressions and Calculations

In `set_field` or `create_record`, dynamic formulas are supported:
*   Support for basic arithmetic: `price * quantity * 0.9`.
*   Support for referencing old values: Use `__old_fieldname` to retrieve the original data before the update.
*   Support for system variables: Such as `TODAY` or `NOW`.

---

## 5. Webhook Integration

*   **Retries and Logs**: All Webhook execution results are recorded in the `_zenku_webhook_logs` table, including HTTP status codes and response times, for easy debugging.
*   **Payload Structure**: By default, it includes the name of the current table, the action performed, and the complete data payload.
