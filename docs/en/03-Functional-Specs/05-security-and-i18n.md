# Security, i18n, and Constraints

> This document supplements the advanced specifications of the Zenku system regarding security control, multilingual support, and AI operational boundaries.

---

## 1. Permission and Security Model

Zenku supports a dual-track authentication mechanism, designed for both "humans" and "machines":

### A. User Sessions
*   **Authentication**: Session management based on Bearer Tokens.
*   **System Roles (hardcoded)**:
    *   `admin`: Highest system authority, can manage users, configure AI Providers, and system parameters. Bypasses all table RBAC checks.
    *   `builder`: Can use AI agents for application development, modifying schemas, and UI views. Bypasses all table RBAC checks.
    *   `user`: Deny-by-default — can only access tables explicitly granted by an admin.
*   **SSO Integration**: Supports OIDC protocols (e.g., Google, Azure AD), configurable to `sso_only` mode.

### B. Table-Level RBAC

The `user` role is **denied all data access by default**. Admins explicitly grant access per table via the Admin Panel.

**Permission rules** are stored in `_zenku_permissions` (`role`, `table_name`, `can_read/create/update/delete`). Resolution priority:
1. Exact rule (`role + table_name`)
2. Wildcard rule (`role + '*'`)
3. No match → denied, returns `HTTP 403 ERROR_FORBIDDEN_TABLE`

**Custom Roles** are additional groups assigned to `user` accounts without changing the system role field. A user can belong to multiple custom roles (many-to-many via `_zenku_role_members`). Role definitions are stored in `_zenku_roles`.

**Effective permission resolution** (OR union):
```
user effective permissions = user role permissions  OR  any assigned custom role permissions
```
Access is granted if any rule allows it.

### B. API Key Access
*   **Format**: Persistent keys prefixed with `zk_live_`.
*   **Scopes**: Fine-grained control (e.g., `data:read`, `data:write`, `schema:read`).
*   **Rate Limiting**: Defaults to 60 requests per minute to prevent external integrations from overloading the system.

---

## 2. Internationalization (i18n)

The system features an automated multilingual translation mechanism that integrates database storage with AI generation.

### Key Mechanism: `$key` Syntax
*   Use `$order_status` in view definitions (e.g., in a `label`).
*   The backend `resolveI18n` service automatically detects and retrieves content for the corresponding language from the `_zenku_translations` table.
*   **Fallback Mechanism**: If the specified language is missing, the system falls back to English (`en`); if English is also missing, it displays the key itself without the prefix.

### AI Automated Translation
When the AI creates a new field, it automatically sends commands to the `i18n-tool` to generate Traditional Chinese, English, and Japanese translations for that field simultaneously, ensuring a consistent UI experience.

---

## 3. System Constraints and AI Boundaries

To ensure system security and data integrity, AI agent operations are strictly "sandboxed":

*   **Query Agent Read-only Enforcement**: The database adapter used by the `Query Agent` is strictly limited to executing `SELECT` commands. Any SQL attempting to execute `DROP`, `DELETE`, or `UPDATE` will be intercepted by underlying defenses.
*   **Schema Change Tracking**: All DDL changes (e.g., dropping tables or columns) must be recorded via `journal-tools`. If no reverse operation is defined, the system warns the AI and prohibits the change.
*   **UI and Business Isolation**: The `UI Agent` is prohibited from directly accessing business data tables and can only read/write `_zenku_views` metadata, preventing the AI from leaking sensitive personal data while adjusting the UI.
*   **Attachment Size Limit**: File fields have a default limit of 10MB and only support common MIME types to prevent the upload of malicious scripts.
