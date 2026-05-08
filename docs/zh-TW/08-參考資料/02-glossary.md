# 術語表（中英對照）

本術語表定義 Zenku 系統文件與程式碼中使用的核心詞彙。
所有文件與 prompt 應優先使用本表推薦用語，避免混用導致語意不清。

---

## Schema（資料結構）

- **中文推薦用語**：資料表結構 / Schema
- **英文原文**：Schema
- **定義**：指資料表（Table）及其欄位（Column）的結構定義，包含欄位名稱、資料型別、是否必填、預設值、外鍵關聯等。
- **不建議混用**：不要將 Schema 與 View 混用。Schema 是後端資料結構；View 是前端介面定義。
- **相關檔案**：`packages/server/src/db/schema.ts`、`packages/server/src/db/adapter.ts`

---

## Table（資料表）

- **中文推薦用語**：資料表
- **英文原文**：Table
- **定義**：使用者建立的業務資料表，以 SQL 表格儲存，不含 `_zenku_` 開頭的系統表。
- **不建議混用**：不要用「表格」或「table」混稱系統表與業務表。系統表以 `_zenku_` 前綴區分。
- **相關檔案**：`packages/server/src/tools/db-tools.ts`

---

## Column / Field（欄位）

- **中文推薦用語**：欄位
- **英文原文**：Column（DB 層）、Field（UI / Schema 定義層）
- **定義**：資料表的一個屬性項目。在 DB 層稱 Column；在 View 定義與 form 設計層面稱 Field（對應前端控制項）。
- **不建議混用**：不要在 form.fields 中用 "column"；不要在 SQL DDL 層用 "field"。
- **相關型別**：`ColumnSpec`（`adapter.ts`）、`FieldDef`（`@zenku/shared`）

---

## View（介面視圖）

- **中文推薦用語**：視圖 / 介面視圖
- **英文原文**：View
- **定義**：Zenku 的 UI 定義單元。一個 View 對應一個資料表，包含列表欄位（columns）、表單欄位（form.fields）、動作按鈕（actions）及顯示設定。與 SQL VIEW 無關。
- **不建議混用**：不要用 "interface"、"UI" 單獨稱呼 View。不要與 SQL View 混淆。
- **可用 type 值**：`table`, `master-detail`, `dashboard`, `kanban`, `calendar`, `gallery`, `form-only`, `timeline`, `tree`, `gantt`, `embed`
- **相關檔案**：`packages/server/src/db/views.ts`、`_zenku_views` 系統表

---

## Rule（商業規則）

- **中文推薦用語**：規則 / 商業規則
- **英文原文**：Rule / Business Rule
- **定義**：定義在特定觸發事件（trigger）下執行的自動化邏輯，包含條件（condition）與動作（actions）。可用於驗證、欄位設定、跨表更新、Webhook 等。
- **不建議混用**：不要用 "logic"、"automation"、"trigger" 單獨稱呼規則整體。`trigger` 是規則的子屬性。
- **相關檔案**：`packages/server/src/engine/rule-engine.ts`、`packages/server/src/db/rules.ts`

---

## Tool（工具）

- **中文推薦用語**：工具
- **英文原文**：Tool
- **定義**：AI 可呼叫的操作接口，以 JSON Schema 定義輸入格式，由 `dispatchTool()` 路由至對應 handler。工具是 agent 執行能力的最小單位。
- **不建議混用**：不要用 "function"、"action"、"command" 稱呼 Tool。
- **相關檔案**：`packages/server/src/tools/registry.ts`、`packages/server/src/tools/types.ts`

---

## Agent（代理）

- **中文推薦用語**：代理 / Agent
- **英文原文**：Agent
- **定義**：負責執行一組特定工具的角色。Zenku 的 Agent 並非獨立程序，而是 Orchestrator 呼叫的工具執行子集（Schema Agent、UI Agent、Query Agent、Logic Agent、Test Agent）。
- **不建議混用**：不要用 "bot"、"assistant"、"AI" 單獨稱呼 Agent。
- **相關檔案**：`packages/server/src/agents/`

---

## Orchestrator（調度器）

- **中文推薦用語**：調度器 / Orchestrator
- **英文原文**：Orchestrator
- **定義**：接收使用者請求、維護對話歷程、決定工具呼叫順序、將結果回傳給使用者的核心元件。Chat 介面的入口點。
- **相關檔案**：`packages/server/src/orchestrator.ts`

---

## MCP（Model Context Protocol）

- **中文推薦用語**：MCP
- **英文原文**：Model Context Protocol
- **定義**：外部 AI Agent 連接 Zenku 的標準協議入口，以 API Key scope（`mcp:read`、`mcp:write`、`mcp:admin`）控制可用工具清單。
- **相關檔案**：`packages/server/src/routes/mcp.ts`、`packages/server/src/security/tool-policy.ts`

---

## External API（外部 REST API）

- **中文推薦用語**：外部 API
- **英文原文**：External API / Ext API
- **定義**：供外部系統（n8n、第三方工具）讀寫 Zenku 業務資料的 REST API，掛載於 `/api/ext/`，以 API Key 認證並受 scope 控制。
- **不建議混用**：不要與 Browser API（`/api/data/`）混淆。兩者都存取業務資料但入口、認證、pipeline 不同。
- **相關檔案**：`packages/server/src/routes/ext.ts`

---

## Journal（設計日誌）

- **中文推薦用語**：設計日誌 / Journal
- **英文原文**：Journal / Design Journal
- **定義**：記錄所有 AI 工具執行、資料異動、Schema 變更的操作歷程，儲存於 `_zenku_journal` 系統表。可逆操作（`reversible = 1`）附有 reverse SQL，可透過 Undo 回滾。
- **相關檔案**：`packages/server/src/db/journal.ts`、`packages/server/src/tools/journal-tools.ts`

---

## Undo（撤銷）

- **中文推薦用語**：撤銷 / Undo
- **英文原文**：Undo
- **定義**：執行 Journal 中可逆操作的反向 SQL，將系統還原至操作前的狀態。僅 `reversible = 1` 且有 `reverse_operations` 的 Journal 條目可 Undo。
- **相關檔案**：`packages/server/src/tools/journal-tools.ts`（`undoLast`, `undoById`, `undoSince`）

---

## Bundle（前端打包）

- **中文推薦用語**：Bundle / 前端包
- **英文原文**：Bundle
- **定義**：Vite 建置輸出的前端 JavaScript 資源檔案。Zenku 目前有 `SheetField`（~10MB）、`index`（~3.2MB）、`mermaid.core`（~590KB）等重型 chunk，超過 Vite 500kB 建議上限。
- **相關限制**：見 [已知問題 KI-005](../07-開發歷程/02-known-issues.md)

---

*最後更新：2026-05-08 (Batch 6)*
