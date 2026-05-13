# Current Status

> This document records the core features and system boundaries realized in Zenku to date, serving as a reference benchmark for future development and maintenance.

---

## 1. Feature Milestones

Zenku has evolved from an initial conversation-based table creation PoC into a low-code development platform with full business-bearing capacity.

### A. UI/UX
*   **Responsive Layout**: Supports sidebar collapsing, draggable AI conversation panels, and preliminary adaptation for mobile devices.
*   **Advanced Views**: In addition to the basic Table, it fully supports **Master-Detail**, **Kanban**, **Dashboard**, and **Calendar**.
*   **Theme Support**: Integrated with shadcn/ui, providing dark/light mode switching.

### B. Data Modeling Capabilities
*   **Complex Types**: Supports 20+ field controls, including **Relation**, **Computed**, and **Auto-Number**.
*   **Table Traits**: Supports **State Machine**, automatically implementing document approval lifecycles, stepper UI, and operational locks.
*   **Conditional Rendering**: Supports real-time form hidden/read-only/color rules based on the `appearance` engine.
*   **Data Consistency**: Integrated with the `node:sqlite` core, supporting foreign key constraints and CASCADE deletion.

### C. AI Agent System
*   **Multi-Agent Collaboration**: Implemented an architecture where the Orchestrator unifies the dispatching of specialized agents for Schema, UI, Logic, and Query.
*   **Design Journal**: All AI-driven DDL changes are written to `_zenku_journal`, supporting multi-step rollbacks (Undo).
*   **Observability**: The backend fully tracks Token consumption, costs, and latency for every conversation round.

---

## 2. Capability Matrix

| Category | Realized Features | System Constraints |
| :--- | :--- | :--- |
| **Database** | SQLite, Cross-table relations, Computed fields, State Machine traits | Formal support for PostgreSQL partition optimization for large data is pending. |
| **AI Models** | Claude, GPT-4, Gemini, Ollama | Subject to the stability of provider APIs. |
| **Security** | RBAC role control, API Key (Scopes) | Row-level data isolation has not yet been implemented. |
| **Automation** | Webhook, Business rules engine, Callbacks | Rule complexity is limited by the expression engine (formula.ts). |

---

## 3. System Boundaries

*   **Data Capacity**: It is recommended to keep single-table data volume under 1 million records in a SQLite environment.
*   **Attachment Storage**: Files are stored on the local disk by default; adaptation for object storage like S3 is not yet supported.
*   **AI Rate Limiting**: Restricted by the underlying Rate Limiter configuration (default 60 RPM).
