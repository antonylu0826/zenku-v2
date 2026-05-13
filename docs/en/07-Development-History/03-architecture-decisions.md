# Architecture Decision Records (ADRs)

This document records the significant architectural decisions made during the development of Zenku, including the context, rationale, and identified trade-offs. Each ADR, once established, should not be deleted; even if a later decision changes it, the status should be updated and a subsequent ADR added.

---

## ADR-001: Multi-agent Orchestrator Architecture

- **Date**: Early 2026 (Phase 2)
- **Status**: Accepted

### Context

Zenku needs to handle diverse tasks concurrently, such as Schema modeling, UI design, data manipulation, business rules, and impact assessments for destructive changes.

### Decision

Adopted the Orchestrator pattern: A single entry point (`orchestrator.ts`) receives user requests and routes them to corresponding handlers via tool calls (tool use). Different Agents (Schema / UI / Query / Logic / Test) are simply subsets of tools coordinated by the Orchestrator.

### Consequences

- **Positive**: Unified entry point with clear semantics; adding new Agents only requires adding Tool handlers without changing the overall architecture; centralized management of observability (tool event logging).
- **Negative**: The Orchestrator must maintain context for all tools, resulting in high system prompt complexity; as tools increase, prompt token consumption grows.

### Alternatives Considered

- **Multiple Independent Agents with Separate Chats**: Fragmented user experience (requires switching chats), AI lacks cross-domain context. Not adopted.
- **Pure RAG + Tool Calls**: Cannot handle multi-step collaboration (e.g., creating schema first, then UI). Not adopted.

---

## ADR-002: Centralized Data Service

- **Date**: 2026-05-08 (Batch 2)
- **Status**: Accepted

### Context

Three entry points—`/api/data/:table` (Browser route), `/api/ext/data/:table` (External API), and the `write_data` tool—all need to execute the same data write pipeline: rule engine before/after, auto-number, computed fields, DB-specific INSERT, and journal logging. However, they were implemented separately, leading to inconsistencies such as the external API missing auto-numbers and inconsistent journal reversible semantics.

### Decision

Established `packages/server/src/services/data-service.ts`, providing `createRecord()`, `updateRecord()`, and `deleteRecord()` functions to encapsulate the full pipeline. All routes and tools now use this service. Browser routes do not write to the journal (maintaining existing behavior), while external APIs and AI tools write reversible or irreversible journals as appropriate.

### Consequences

- **Positive**: Consistent behavior across all three entry points; adding pipeline steps only requires modifying the service; correct journal reversible semantics.
- **Negative**: The service layer must handle multiple actors (browser / ext_api / ai_tool), adding slight complexity; `data.ts` DELETE (including cascade) is not yet integrated into the service and remains at the route level.

---

## ADR-003: Shared Instruction Builder for Chat / MCP

- **Date**: 2026-05-08 (Batch 4)
- **Status**: Accepted

### Context

The Chat Orchestrator (`orchestrator.ts`) and the MCP route (`routes/mcp.ts`) each maintained their own system prompt assembly logic and role/scope-to-tool mappings. These implementations were prone to drift: MCP initially lacked `buildGanttInstructions` and `buildTreeInstructions`, and the `/api/mcp/info` tool list was inconsistent with the actual implementation.

### Decision

Created `prompts/instruction-builder.ts` (`buildZenkuInstructions()`) as the unified prompt assembly entry point and `security/tool-policy.ts` (`USER_ROLE_TOOL_POLICY`, `MCP_SCOPE_TOOL_POLICY`) as the single source of truth for tool authorization. Both Chat and MCP now use these modules, and `/api/mcp/info` is dynamically generated from the policy.

### Consequences

- **Positive**: Prompt fragments only need to be modified in one place; single source of truth for the tool authorization matrix; `/api/mcp/info` is always accurate.
- **Negative**: The builder must account for subtle differences between Chat and MCP surfaces, requiring the maintenance of two sets of introductory text.

---

## ADR-004: Access Policy as the Sole Authorization Source

- **Date**: 2026-05-08 (Batch 1)
- **Status**: Accepted

### Context

Scope validation for the External REST API was scattered across `db/auth.ts` and `routes/ext.ts`. The `read:*` middleware would prematurely block table-specific keys like `read:orders`, effectively restricting external APIs to wildcard keys only.

### Decision

Created `security/access-policy.ts`, providing `hasScope()`, `hasAnyScope()`, and `expandScopes()` pure functions as the sole source for all scope determinations. The middleware was updated to use `requireApiKeyAny(req => ['read:*', \`read:${table}\`])`, allowing either scope to pass.

### Consequences

- **Positive**: Table-specific API Keys are now fully functional; scope logic is centrally tested; MCP scope inheritance (`mcp:admin` → `mcp:write` → `mcp:read`) is clearly defined.
- **Negative**: Middleware must delay table name resolution within the request lifecycle, slightly increasing complexity.

---

## ADR-005: Table Trait System and State Machine Implementation

- **Date**: 2026-05-13 (Batch 6)
- **Status**: Accepted

### Context

Zenku needs standardized lifecycle management (state transitions, read-only locking, deletion restrictions) for specific tables like Leave Requests or Purchase Orders. Manually configuring numerous Business Rules via the Logic Agent is inefficient, error-prone, and difficult to adapt automatically for the UI layer (Stepper).

### Decision

Introduced the "Table Trait" concept:
1.  **Declarative Configuration**: Trait definitions are stored in `_zenku_table_traits`, selectable during table creation via `manage_schema`.
2.  **Automatic Injection**: When the `state_machine` trait is selected, the system automatically injects `status` and `created_by` fields.
3.  **Engine-Level Protection**: The Rule Engine includes a built-in `State Machine Guard` that intercepts illegal state transitions during the `before_update` phase, eliminating the need for manual rules.
4.  **Automatic UI Adaptation**: `FormView` detects the trait and automatically displays a Stepper, toggling `disabled` modes based on the current state.

### Consequences

- **Positive**: Developers can enable complex workflows with a single command; guaranteed data security through backend enforcement; highly consistent and automated frontend UI.
- **Negative**: Currently, once a Trait configuration is written to the DB, there is no dedicated tool for AI to modify it later; auto-injected field names (like `status`) are currently hardcoded.

### Alternatives Considered

- **Pure Frontend Implementation**: Insufficient security (API can be bypassed). Not adopted.
- **Pure Rule Engine Implementation**: Overly complex configuration, difficult to automatically generate Stepper UI. Not adopted.

---

*Last Updated: 2026-05-13 (Batch 6)*
