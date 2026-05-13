# 已知問題與技術債紀錄

本文件追蹤 Zenku 目前已知的限制、已修問題與待解事項。
每個條目都應標明狀態、影響範圍與下一步行動。

---

## 狀態說明

| 狀態 | 說明 |
| :--- | :--- |
| `fixed` | 已修復並合併至 main |
| `open` | 尚未修復 |
| `deferred` | 有意識地延後，不影響當前功能 |
| `in-progress` | 正在修復中 |

---

## KI-001：外部 API 資料寫入 pipeline 與 Browser route 不一致

- **Status**：`fixed`（Batch 2，2026-05-08）
- **Impact**：`/api/ext/data/:table` POST 缺少 `applyAutoNumbers()` 與完整 `executeAfter()`；外部 API 建立的資料行為與 Browser 操作不同。
- **Evidence**：`routes/ext.ts` POST 缺少 auto-number engine 呼叫；`routes/data.ts` POST 有完整流程。
- **Fix**：建立 `services/data-service.ts`，`createRecord()` 統一 pipeline；兩個 route 改用 service。
- **Owner area**：`packages/server/src/services/data-service.ts`、`routes/ext.ts`、`routes/data.ts`

---

## KI-002：`query_data` SQL 安全驗證不足

- **Status**：`fixed`（Batch 3，2026-05-08）
- **Impact**：原本只用 `startsWith('SELECT')` 判斷，無法擋住多語句（`; DROP TABLE`）、危險關鍵字、系統表存取。
- **Evidence**：`tools/db-tools.ts` `queryData()` 原始實作。
- **Fix**：建立 `security/sql-guard.ts`，`guardSql()` 檢查多語句、關鍵字黑名單、`_zenku_` 系統表。
- **Owner area**：`packages/server/src/security/sql-guard.ts`、`tools/db-tools.ts`

---

## KI-003：AI tool input normalization 分散

- **Status**：`fixed`（Batch 3，2026-05-08）
- **Impact**：各 agent 各自處理 JSON string 化輸入；`dispatchTool()` 接受 `any`，無集中 validation。
- **Evidence**：`schema-agent.ts` 和 `ui-agent.ts` 各有局部 `JSON.parse` fallback。
- **Fix**：建立 `tools/validation.ts`，`normalizeToolInput()` + `validateToolInput()`；`dispatchTool()` 統一呼叫。
- **Owner area**：`packages/server/src/tools/validation.ts`、`tools/registry.ts`

---

## KI-004：非 SQLite 資料庫的 FK dot-path 支援不完整

- **Status**：`fixed`（Batch 5，2026-05-08）
- **Impact**：rule-engine.ts 的 `resolveFieldPath()` 直接呼叫 SQLite PRAGMA，PostgreSQL / MSSQL 會回傳 `undefined`，FK dot-path 規則失效。
- **Evidence**：`engine/rule-engine.ts` 原始 `if (db.type !== 'sqlite') return undefined;`
- **Fix**：在 `DbAdapter` interface 加入 `getForeignKeys()`，各 adapter 各自實作，rule-engine 改用 adapter 方法。
- **Owner area**：`packages/server/src/db/adapter.ts`、`sqlite-adapter.ts`、`postgres-adapter.ts`、`mssql-adapter.ts`、`engine/rule-engine.ts`

---

## KI-005：前端 bundle size 超過 Vite 建議上限

- **Status**：`open`
- **Impact**：`SheetField`（~10.5MB）、`index`（~3.2MB）、`mermaid.core`（~589kB）超過 Vite 500kB 建議，一般 CRUD 使用者會下載不必要的重型模組。
- **Evidence**：`npm run build` 輸出的 Vite chunk size warning。
- **Next action**：對 Univer（SheetField）、Mermaid、admin panels、CodeMirror 實作 dynamic import() 或 manualChunks，由 P3 Roadmap 處理。
- **Owner area**：`packages/web/vite.config.ts`、`packages/web/src/`

---

## KI-006：測試覆蓋率偏低

- **Status**：`in-progress`
- **Impact**：Server-side 高風險區域（scope matching、rule engine、adapter SQL translation、undo、tool input normalization）仍缺整合測試。
- **Evidence**：`npm test` 目前 85 個測試，主要覆蓋安全模組與服務層；DB adapter、rule engine 的端對端行為仍靠手測。
- **Next action**：逐步在每個 Batch 補對應的 unit / integration test；目前 Batch 2~5 已補完核心路徑。
- **Owner area**：`packages/server/src/**/*.test.ts`

---

---

## KI-007：Table Trait 配置無法透過 AI 工具修改

- **Status**：`open`
- **Impact**：AI 可以透過 `manage_schema` 啟用 `state_machine`，但一旦寫入 `_zenku_table_traits` 後，目前沒有任何 Tool 可以修改其 JSON config（例如調整狀態名稱或轉換路徑）。
- **Evidence**：`tools/db-tools.ts` 僅在 `createTable` 時寫入一次；`writeData` 不允許修改系統表。
- **Next action**：在 `manage_schema` 加入 `update_trait` 動作，或建立獨立的 `manage_traits` 工具。
- **Owner area**：`packages/server/src/tools/handlers/schema-tool.ts`、`db-tools.ts`

---

*最後更新：2026-05-13 (Batch 6)*
