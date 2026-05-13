# Known Issues and Technical Debt

This document tracks Zenku's currently known limitations, fixed bugs, and pending tasks. Each entry specifies its status, impact, and next steps.

---

## Status Key

| Status | Description |
| :--- | :--- |
| `fixed` | Resolved and merged into main. |
| `open` | Not yet resolved. |
| `deferred` | Consciously postponed; does not impact current core functionality. |
| `in-progress` | Currently being worked on. |

---

## KI-001: Inconsistency between External API and Browser Route Write Pipelines

- **Status**: `fixed` (Batch 2, 2026-05-08)
- **Impact**: `/api/ext/data/:table` POST lacked `applyAutoNumbers()` and full `executeAfter()` triggers. Data created via external API behaved differently than data created via the browser.
- **Fix**: Created `services/data-service.ts` to unify the `createRecord()` pipeline; both routes now call this service.
- **Owner area**: `packages/server/src/services/data-service.ts`, `routes/ext.ts`, `routes/data.ts`

---

## KI-002: Insufficient SQL Security Validation in `query_data`

- **Status**: `fixed` (Batch 3, 2026-05-08)
- **Impact**: Previously only used `startsWith('SELECT')`, failing to block multi-statement queries (`; DROP TABLE`), dangerous keywords, or system table access.
- **Fix**: Created `security/sql-guard.ts` with `guardSql()` to check for multi-statements, keyword blacklists, and `_zenku_` system table access.
- **Owner area**: `packages/server/src/security/sql-guard.ts`, `tools/db-tools.ts`

---

## KI-003: Scattered AI Tool Input Normalization

- **Status**: `fixed` (Batch 3, 2026-05-08)
- **Impact**: Each agent handled JSON string normalization independently; `dispatchTool()` accepted `any` without centralized validation.
- **Fix**: Created `tools/validation.ts` with `normalizeToolInput()` and `validateToolInput()`; unified calls within `dispatchTool()`.
- **Owner area**: `packages/server/src/tools/validation.ts`, `tools/registry.ts`

---

## KI-004: Incomplete FK Dot-path Support for Non-SQLite Databases

- **Status**: `fixed` (Batch 5, 2026-05-08)
- **Impact**: `resolveFieldPath()` in `rule-engine.ts` directly called SQLite PRAGMA. PostgreSQL/MSSQL returned `undefined`, breaking FK dot-path rules.
- **Fix**: Added `getForeignKeys()` to the `DbAdapter` interface, implemented in each adapter. The rule engine now uses the adapter method.
- **Owner area**: `packages/server/src/db/adapter.ts`, `sqlite-adapter.ts`, `postgres-adapter.ts`, `mssql-adapter.ts`, `engine/rule-engine.ts`

---

## KI-005: Frontend Bundle Size Exceeds Vite Recommended Limit

- **Status**: `open`
- **Impact**: `SheetField` (~10.5MB), `index` (~3.2MB), and `mermaid.core` (~589kB) exceed Vite's 500kB suggestion. General CRUD users download unnecessary heavy modules.
- **Next action**: Implement `dynamic import()` or `manualChunks` for Univer (SheetField), Mermaid, admin panels, and CodeMirror (handled in P3 Roadmap).
- **Owner area**: `packages/web/vite.config.ts`, `packages/web/src/`

---

## KI-006: Low Test Coverage

- **Status**: `in-progress`
- **Impact**: High-risk server-side areas (scope matching, rule engine, adapter SQL translation, undo, tool input normalization) still lack integration tests.
- **Next action**: Gradually add unit/integration tests in each Batch. Core paths for Batches 2–5 are completed.
- **Owner area**: `packages/server/src/**/*.test.ts`

---

## KI-007: Table Trait Configuration Cannot be Modified via AI Tools

- **Status**: `open`
- **Impact**: AI can enable the `state_machine` via `manage_schema`, but once written to `_zenku_table_traits`, there is no tool to modify the JSON config (e.g., adjusting state labels or transition paths).
- **Evidence**: `tools/db-tools.ts` only writes once during `createTable`; `writeData` prohibits system table modification.
- **Next action**: Add an `update_trait` action to `manage_schema` or create a standalone `manage_traits` tool.
- **Owner area**: `packages/server/src/tools/handlers/schema-tool.ts`, `db-tools.ts`

---

*Last Updated: 2026-05-13 (Batch 6)*
