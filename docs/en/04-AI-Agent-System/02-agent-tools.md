# AI Agent Toolkit

> This document details the tool definitions available to each specialized Agent. These tools are the sole pathways for the AI to manipulate the database and UI.

---

## 1. Schema Agent Tool: `manage_schema`

Responsible for the creation and modification of physical database structures.

*   **Actions (`action`)**: `create_table`, `alter_table`, `describe_tables`.
*   **Traits (`traits`)**: Supports `state_machine` (automatically injects `status` and `created_by` fields and enables workflow protection).
*   **Type Mapping Standards**:
    *   `TEXT`: Strings, long text.
    *   `INTEGER`: Integers, IDs, foreign keys.
    *   `REAL`: Floats, amounts.
    *   `BOOLEAN`: Boolean values.
    *   `DATE` / `DATETIME`: Dates and times.
*   **Design Principle**: After creating a table, the agent **must** immediately follow up by calling `manage_ui` to establish the corresponding interface.

---

## 2. UI Agent Tool: `manage_ui`

Responsible for the lifecycle management of View Definitions (JSON).

*   **Actions (`action`)**: `create_view`, `update_view`, `get_view`, `delete_view`.
*   **Core Parameters**:
    *   `type`: Specifies the view type (table, kanban, dashboard, etc.).
    *   `columns` / `form`: Defines list columns and form controls (including `appearance` rules).
    *   `actions`: Defines functional buttons (including built-in CRUD and custom actions).
*   **Design Principle**: When a user requests "statistics/kanban," the agent should directly create a view of the corresponding type, rather than just a basic table.

---

## 3. Logic Agent Tool: `manage_rules`

Responsible for configuring business automation rules.

*   **Parameter Structure**:
    *   `trigger_type`: `before_insert`, `after_update`, `manual`, etc.
    *   `condition`: Evaluation conditions (supports cross-table references).
    *   `actions`: List of actions (`set_field`, `validate`, `webhook`, `update_related_records`).

---

## 4. Query Agent Tool: `query_data`

Responsible for retrieving business data.

*   **Core Function**: Executes `SELECT` SQL statements.
*   **Security Boundary**: Enforced at the system level as "read-only"; any SQL for mutations is prohibited.
*   **Use Cases**: Answering user questions such as "What was the total revenue last month?" or "List all products with stock below 10."

---

## 5. Test Agent Tool: `assess_impact`

Responsible for evaluating the potential risks of structural changes.

*   **Design Principle**: Before executing any "destructive changes" (e.g., dropping columns, modifying types), the `Orchestrator` mandates the execution of this tool to ensure the AI is aware of potential ripple effects.

---

## 6. Other Supporting Tools

*   **`set_translations`**: Used for manual or automated updates to the `_zenku_translations` table.
*   **`undo_action`**: Executes rollback logic, reading design journals and performing reverse operations.
*   **`get_integration_guide`**: When a user asks how to interface with n8n or an external API, the AI calls this tool to retrieve the latest Webhook manual.
