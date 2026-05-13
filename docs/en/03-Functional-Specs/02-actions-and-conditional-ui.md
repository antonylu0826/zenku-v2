# View Actions and Conditional UI

> View actions turn static data displays into interactive business processes, while conditional UI provides real-time guidance to users based on data states.

---

## 1. View Actions

Zenku supports mounting action buttons across various views (e.g., Tables, Kanbans, Forms).

### A. Built-in Actions
Basic CRUD operations:
*   `create`: Add new data (pops up a form or navigates to a creation page).
*   `edit`: Edit the selected record.
*   `delete`: Delete the record.
*   `export`: Export the currently filtered data to CSV.

### B. Custom Actions
Advanced actions defined by AI agents or administrators, featuring the following attributes:
*   **Context (`context`)**: Determines if the button appears in the "List Row (`list`)", "Record Page (`record`) ", or both.
*   **Variant (`variant`)**: Supports different button styles (e.g., `destructive` red buttons, `warning` orange buttons).

### C. Action Behaviors
The specific logic triggered upon clicking a button:
*   `set_field`: Directly modifies a field value of the record (e.g., a "Confirm Receipt" button).
*   `trigger_rule`: Triggers a specified "Manual Business Rule."
*   `webhook`: Calls an external API, passing the current record data.
*   `navigate`: Jumps to another view, automatically applying filter conditions.
*   `create_related`: Creates a record in a related table (e.g., generating an "Invoice" from an "Order" with one click).

---

## 2. Conditional Appearance Rules

Appearance rules allow the frontend to change UI styles in real-time based on current field values, **without server interaction**.

### Supported Effects (`apply`)
*   **Field Styling**: `text_color`, `bg_color`, `font_weight`.
*   **Component Control**: `hidden` (Hide field), `disabled` (Disable field).

### Evaluation Logic
*   **Trigger Conditions (`when`)**: Supports comparisons like `eq`, `neq`, `gt`, `lt`, etc.
*   **Composite Logic**: Supports `AND` / `OR` multi-condition combinations.
*   **Dynamic Variables**: Supports keywords like `TODAY` (e.g., if "Due Date" is less than `TODAY`, display the "Status" field in red).

---

## 3. Button Visibility and Availability

Custom actions can be finely controlled via `AppearanceCondition`:
*   **Visibility Condition (`visible_when`)**: The button only appears when conditions are met (e.g., the "Pay" button only shows for "Unpaid" orders).
*   **Enablement Condition (`enabled_when`)**: The button appears but is grayed out and unclickable (e.g., the "Ship" button is disabled when stock is insufficient).

---

## 4. Interaction Confirmation (Confirm Dialog)

To prevent accidental triggers of important operations (like deletion or batch updates), actions can be configured with confirmation dialogs:
*   `title`: Title (e.g., "Are you sure you want to close this case?").
*   `description`: Warning text (e.g., "This action is irreversible; please confirm data accuracy").

---

## 5. State Machine Trait

The State Machine is one of Zenku's "Table Traits" — it grants any business data table a built-in approval workflow capability.

### Core Concept

The state machine configuration is stored as JSON in the `_zenku_table_traits` table and loaded into a memory cache (`TraitCache`) at server startup. A typical configuration looks like:

```json
{
  "status_field": "status",
  "initial_state": "draft",
  "states": {
    "draft":     { "label": "Draft",     "is_editable": true },
    "submitted": { "label": "Submitted", "is_editable": false },
    "approved":  { "label": "Approved",  "is_final": true },
    "rejected":  { "label": "Rejected",  "is_final": true }
  },
  "transitions": {
    "draft":     ["submitted"],
    "submitted": ["approved", "rejected"]
  },
  "allow_delete_in": ["draft"]
}
```

### Key Attributes

| Attribute | Description |
| :--- | :--- |
| `status_field` | The field name representing the state (typically `status`). |
| `initial_state` | The default starting state when a new record is created. |
| `states[key].is_editable` | When `false`, the frontend form automatically enters read-only mode. |
| `states[key].is_final` | When `true`, indicates a terminal state — automatically read-only with no further transitions allowed. |
| `transitions` | Valid state transition paths; the backend Guard rejects any illegal transition. |
| `allow_delete_in` | Only records in the listed states may be deleted. |

### Frontend UI Behavior

*   **Status Stepper**: When `FormView` detects a `state_machine` Trait, it automatically renders a visual step indicator at the top of the form, showing the current workflow stage.
*   **Automatic Read-only**: When a record's state has `is_editable === false` or `is_final === true`, both `FormView` fields and `TableView`'s "Edit" button are automatically disabled.
*   **Dynamic Action Buttons**: Custom actions (e.g., "Approve", "Reject") use `visible_when` conditions to ensure they only appear in the correct state.

### Backend Guard Mechanism

The server automatically injects a Guard into the `before_update` hook:
1.  **Read from Cache**: Retrieves the state machine config for the table from `TraitCache`.
2.  **Detect State Change**: Compares the `old_status` (before update) with `new_status` (after update).
3.  **Enforce Terminal States**: If `old_status` is `is_final: true`, throws an error and rejects any write.
4.  **Validate Transition**: Checks if `new_status` is listed in `transitions[old_status]`; if not, rejects the write.
