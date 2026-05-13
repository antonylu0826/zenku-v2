# 架構決策紀錄（Architecture Decision Records）

本文件記錄 Zenku 開發過程中重要的架構決策，包含決策背景、選擇理由與已知取捨。
每個 ADR 一旦建立不應輕易刪除，即使後續決策改變，也應更新 Status 並新增後續 ADR。

---

## ADR-001：Multi-agent Orchestrator 架構

- **Date**：2026 年初（Phase 2）
- **Status**：Accepted

### Context

Zenku 需要讓 AI 同時處理 Schema 建模、UI 設計、資料操作、商業規則、破壞性變更評估等不同領域的任務。

### Decision

採用 Orchestrator 模式：一個統一入口（`orchestrator.ts`）接收使用者請求，透過工具呼叫（tool use）路由至對應的 handler。不同 Agent（Schema / UI / Query / Logic / Test）只是工具的執行子集，由 Orchestrator 統一協調。

### Consequences

- **正面**：統一入口，語意清晰；新增 Agent 只需加 Tool handler，不需改整體架構；可觀測性（tool event logging）集中管理。
- **負面**：Orchestrator 本身需維護所有 Tool 的 context，system prompt 複雜度較高；若工具過多，prompt token 消耗增加。

### Alternatives Considered

- **多個獨立 Agent 各自對話**：使用者體驗割裂（需切換對話），AI 缺乏跨領域 context，不採用。
- **純 RAG + 工具呼叫**：無法處理多步驟協作（如先建 schema 再建 UI），不採用。

---

## ADR-002：集中式 Data Service

- **Date**：2026-05-08（Batch 2）
- **Status**：Accepted

### Context

`/api/data/:table`（Browser route）、`/api/ext/data/:table`（External API）、`write_data` tool 三個入口都需要執行相同的資料寫入 pipeline：rule engine before/after、auto-number、computed fields、DB-specific INSERT、journal 記錄。但三者各自實作，導致 ext API 缺少 auto-number，journal reversible 語意不一致。

### Decision

建立 `packages/server/src/services/data-service.ts`，提供 `createRecord()`、`updateRecord()`、`deleteRecord()` 三個函式，封裝完整 pipeline。各 route 和 tool 改用 service。Browser route 不寫 journal（維持既有行為）；ext API 和 AI tool 寫入可逆或不可逆 journal。

### Consequences

- **正面**：三個入口行為一致；新增 pipeline 步驟只需改 service；journal reversible 語意正確。
- **負面**：service 層需處理多種 actor（browser / ext_api / ai_tool），稍微複雜；data.ts DELETE（含 cascade）暫未納入 service，仍在 route 層。

### Alternatives Considered

- **只修 ext.ts**：修補成本低，但未來若有第四個入口又需再修，不採用。
- **合併為單一 route**：Browser 和 Ext API 有不同的 auth 中間件，不宜合併，不採用。

---

## ADR-003：Chat / MCP 共用 Instruction Builder

- **Date**：2026-05-08（Batch 4）
- **Status**：Accepted

### Context

Chat Orchestrator（`orchestrator.ts`）和 MCP route（`routes/mcp.ts`）各自維護一份 system prompt 組裝邏輯，且各自有一份 role/scope → tools 的 mapping。兩份實作容易漂移：MCP 原本缺少 `buildGanttInstructions` 和 `buildTreeInstructions`；`/api/mcp/info` 的工具清單與實際實作不一致。

### Decision

建立 `prompts/instruction-builder.ts`（`buildZenkuInstructions()`）作為統一 prompt 組裝入口；建立 `security/tool-policy.ts`（`USER_ROLE_TOOL_POLICY`、`MCP_SCOPE_TOOL_POLICY`）作為唯一工具授權來源。Chat 和 MCP 都使用這兩個模組，`/api/mcp/info` 也由 policy 動態生成。

### Consequences

- **正面**：新增 prompt fragment 只改一處；工具授權矩陣有單一來源；`/api/mcp/info` 永遠準確。
- **負面**：builder 需兼顧 Chat 和 MCP 兩種 surface 的細節差異，需維護兩套 intro 文字。

### Alternatives Considered

- **只修 mcp.ts 漏掉的 fragments**：治標不治本，下次仍可能漂移，不採用。
- **完全合併 Chat 和 MCP 入口**：兩者認證機制（Session vs API Key）差異太大，不採用。

---

## ADR-004：Access Policy 作為唯一授權來源

- **Date**：2026-05-08（Batch 1）
- **Status**：Accepted

### Context

External REST API 的 scope 驗證分散在 `db/auth.ts` 和 `routes/ext.ts` 兩處，`read:*` middleware 會提前擋住 `read:orders` 這類 table-specific key，導致外部 API 實際上只能使用 wildcard key。

### Decision

建立 `security/access-policy.ts`，提供 `hasScope()`、`hasAnyScope()`、`expandScopes()` 三個純函式，作為所有 scope 判斷的唯一來源。Middleware 改用 `requireApiKeyAny(req => ['read:*', \`read:${table}\`])`，允許兩種 scope 任一通過。

### Consequences

- **正面**：table-specific API Key 真正可用；scope 邏輯集中測試；MCP scope 繼承（`mcp:admin` → `mcp:write` → `mcp:read`）清楚定義。
- **負面**：middleware 需在 request lifecycle 中延遲解析 table name，稍微增加複雜度。

### Alternatives Considered

- **在 route 層再次驗證**：已有雙重驗證，但 middleware 提前擋住的問題仍在，不採用。
- **只用 wildcard key**：降低安全性，不採用。

---

---

## ADR-005：資料表特徵 (Table Trait) 系統與狀態機實作

- **Date**：2026-05-13（Batch 6）
- **Status**：Accepted

### Context

Zenku 需要為特定資料表（如請假單、採購單）提供標準化的生命週期管理（狀態轉換、唯讀鎖定、刪除限制）。若透過 Logic Agent 手動配置大量 Business Rules，不僅效率低且容易出錯，且 UI 層（Stepper）難以自動化適配。

### Decision

引入「資料表特徵 (Table Trait)」概念：
1.  **宣告式配置**：在 `_zenku_table_traits` 儲存 trait 定義，`manage_schema` 建立表時可選用。
2.  **自動注入**：選用 `state_machine` 時，系統自動注入 `status` 與 `created_by` 欄位。
3.  **引擎級保護**：Rule Engine 內建 `State Machine Guard`，在 `before_update` 階段攔截非法狀態轉換，無需手動寫規則。
4.  **UI 自動適配**：`FormView` 偵測到 trait 時自動顯示步進器（Stepper）並根據狀態切換 `disabled` 模式。

### Consequences

- **正面**：開發者只需一行指令即可啟用複雜工作流；保證了資料安全性（後端強制檢查）；前端 UI 高度一致且自動化。
- **負面**：目前 Trait 設定一旦寫入 DB 後，尚無專用 Tool 供 AI 進行二次修改；自動注入的欄位名稱（status）目前是寫死的。

### Alternatives Considered

- **純前端實作**：安全性不足（API 可繞過），不採用。
- **純規則引擎實作**：配置過於繁瑣，難以自動產生 Stepper UI，不採用。

---

*最後更新：2026-05-13 (Batch 6)*
