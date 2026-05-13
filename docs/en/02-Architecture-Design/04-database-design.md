# Database Design

> Zenku adopts a "Hybrid Database Model": system metadata tables manage application structure and AI state, while business data tables are dynamically generated based on user requirements.

---

## 1. System Metadata Tables (`_zenku_*`)
These tables are managed automatically by the system and store the "soul" of the application.

| Table Name | Responsibility |
| :--- | :--- |
| `_zenku_views` | Stores frontend view definitions (JSON). |
| `_zenku_rules` | Stores business logic trigger conditions and actions. |
| `_zenku_table_traits` | Stores table trait configurations (e.g., state machine JSON), loaded into memory cache at startup. |
| `_zenku_journal` | Change logs, supporting the Undo mechanism. |
| `_zenku_chat_*` | Stores conversation history, token consumption, and latency observations. |
| `_zenku_users` | User accounts and basic settings. |
| `_zenku_files` | Metadata for file attachments. |
| `_zenku_translations` | Multilingual translation dictionary. |
| `_zenku_permissions` | Table-level RBAC permission rules (role × table_name × CRUD). |
| `_zenku_roles` | Custom role definitions (name, description). |
| `_zenku_role_members` | Many-to-many mapping of users to custom roles. |

---

## 2. Business Data Tables
Business tables are dynamically created by the AI (Schema Agent) based on user conversations.

### Lifecycle
1.  **Creation**: After the user describes a need, the AI sends a `create_table` command.
2.  **Evolution**: Via `alter_table` to add columns or modify existing structures.
3.  **Default Columns**: For every business table created, the system automatically appends `id` (PK), `created_at`, and `updated_at` columns.

---

## 3. Field Type Mapping

Zenku abstracts a unified set of field types and automatically maps them to the physical types of the underlying database:

| Zenku Type | SQLite Type | Postgres Type | Description |
| :--- | :--- | :--- | :--- |
| `TEXT` | `TEXT` | `text` | Strings, long text, JSON content. |
| `INTEGER` | `INTEGER` | `integer` | Integers, foreign key IDs, counts. |
| `REAL` | `REAL` | `double precision` | Floats, amounts, percentages. |
| `BOOLEAN` | `INTEGER` (0/1) | `boolean` | Boolean toggles. |
| `DATE` | `TEXT` (ISO) | `date` | Dates. |
| `DATETIME` | `TEXT` (ISO) | `timestamp` | Date and time. |

---

## 4. Database Adapters

The system implements multi-database support through the `DbAdapter` interface. Switching databases only requires adjusting the `DB_TYPE` environment variable:

*   **SQLite Adapter** (`node:sqlite`): The default choice, suitable for standalone deployment and rapid development.
*   **Postgres Adapter** (`postgres`): Suitable for production environments with better concurrency handling.
*   **MSSQL Adapter** (`mssql`): Supports enterprise-level Windows environment integration.

---

## 5. Initialization and Migration Strategy

*   **Lazy Initialization**: System tables are automatically checked and created (`CREATE TABLE IF NOT EXISTS`) during the first database connection after the server starts, eliminating the need for manual migration scripts.
*   **Dynamic Migration**: Changes to business tables (e.g., adding columns) are performed at runtime by AI agents, and are recorded in `_zenku_journal` to ensure change traceability.
