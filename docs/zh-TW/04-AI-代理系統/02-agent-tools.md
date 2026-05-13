# AI 代理工具箱 (Agent Toolkit)

> 本文件詳列了各專職 Agent 可使用的工具定義，這些工具是 AI 操控資料庫與 UI 的唯一路徑。

---

## 1. Schema Agent 工具：`manage_schema`

負責資料庫實體結構的建立與變更。

*   **動作 (`action`)**：`create_table`, `alter_table`, `describe_tables`。
*   **特徵 (`traits`)**：支援 `state_machine`（自動注入 `status`, `created_by` 欄位並啟用流程保護）。
*   **型別映射規範**：
    *   `TEXT`：字串、長文本。
    *   `INTEGER`：整數、ID、外鍵。
    *   `REAL`：浮點數、金額。
    *   `BOOLEAN`：布林值。
    *   `DATE` / `DATETIME`：日期時間。
*   **設計原則**：建立表後，**必須**緊接著呼叫 `manage_ui` 建立對應介面。

---

## 2. UI Agent 工具：`manage_ui`

負責 View Definition (JSON) 的生命週期管理。

*   **動作 (`action`)**：`create_view`, `update_view`, `get_view`, `delete_view`。
*   **核心參數**：
    *   `type`：指定視圖型態（table, kanban, dashboard 等）。
    *   `columns` / `form`：定義列表欄位與表單控制項（含 `appearance` 規則）。
    *   `actions`：定義功能按鈕（含內建 CRUD 與自訂動作）。
*   **設計原則**：當使用者要求「統計/看板」時，應直接建立對應型態的視圖，而非僅建立基礎表格。

---

## 3. Logic Agent 工具：`manage_rules`

負責商業自動化規則的配置。

*   **參數結構**：
    *   `trigger_type`：`before_insert`, `after_update`, `manual` 等。
    *   `condition`：判定條件（支援跨表引用）。
    *   `actions`：動作清單（`set_field`, `validate`, `webhook`, `update_related_records`）。

---

## 4. Query Agent 工具：`query_data`

負責執行業務資料的檢索。

*   **核心功能**：執行 `SELECT` SQL 語句。
*   **安全邊界**：系統層級強制限制為「唯讀」，禁止任何變更類 SQL。
*   **應用場景**：回答使用者關於「上個月總業績是多少？」或「列出所有庫存低於 10 的產品」等問題。

---

## 5. Test Agent 工具：`assess_impact`

負責評估結構變更的潛在風險。

*   **設計原則**：在執行任何「破壞性變更」（如刪除欄位、修改型別）之前，`Orchestrator` 會強制要求執行此工具，以確保 AI 意識到可能引發的連鎖反應。

---

## 6. 其他支援工具

*   **`set_translations`**：用於手動或自動更新 `_zenku_translations` 表。
*   **`undo_action`**：執行回滾邏輯，讀取設計日誌並執行反向操作。
*   **`get_integration_guide`**：當使用者詢問如何串接 n8n 或外部 API 時，AI 呼叫此工具獲取最新的 Webhook 手冊。
