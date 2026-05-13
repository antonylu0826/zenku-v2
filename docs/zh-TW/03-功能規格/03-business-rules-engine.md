# 商業規則引擎與自動化 (Business Rules Engine)

> Zenku 透過商業規則引擎實現「無代碼自動化」。AI 代理（Logic Agent）能根據使用者需求配置觸發條件與動作，實現複雜的業務邏輯。

---

## 1. 觸發時機 (Trigger Types)

規則引擎掛載於資料生命週期的不同階段，分為四類：

> **多觸發點**：`trigger_types` 接受陣列，例如 `["on_change", "before_insert"]`，讓同一條規則同時作用於即時帶入（UX）與儲存時的資料保險。

### A. 表單即時 (Form-time)
在使用者填表時即時觸發，記錄尚未儲存至資料庫。
*   `on_change`：某個欄位值在前端變動時觸發。
    *   **主要用途**：FK 關聯帶入（如選擇採購單 → 自動填入供應商、幣別）。
    *   **限制**：只允許 `set_field` 與 `validate`，不允許寫入其他資料表。
    *   **範例**：`trigger_types: ["on_change", "before_insert"]`，condition `po_id changed`，action `set vendor_id = po_id.vendor_id`。

### B. 資料異動前 (Before Hooks)
用於資料驗證或寫入前的自動修正。
*   `before_insert`：新紀錄建立前。
*   `before_update`：紀錄更新前。
*   `before_delete`：紀錄刪除前（常用於阻擋刪除）。

### C. 資料異動後 (After Hooks)
用於連動更新或外部通知。
*   `after_insert`：新紀錄建立後。
*   `after_update`：紀錄更新後。
*   `after_delete`：紀錄刪除後。

### D. 手動觸發 (Manual)
*   `manual`：由前端「自訂動作按鈕 (ViewAction)」主動點擊觸發。

---

## 2. 動作種類 (Action Types)

當條件滿足時，引擎可執行以下一連串動作：

| 動作 | 說明 | 範例 |
| :--- | :--- | :--- |
| `validate` | 中斷操作並拋出錯誤訊息。 | 「庫存不足，無法出貨」。 |
| `set_field` | 自動覆寫當前紀錄的欄位值。 | 「狀態」自動設為「已完工」。 |
| `create_record` | 在另一張表建立新紀錄。 | 訂單成立後自動建立一筆「出貨單」。 |
| `update_record` | 根據條件更新另一張表的單筆紀錄。 | 更新「產品表」中的最新售價。 |
| `update_related_records` | **批次**更新關聯資料。 | 出貨後，自動扣除所有明細對應的「庫存量」。 |
| `webhook` | 發送 HTTP 請求至外部系統。 | 通知 n8n 或 Slack。 |
| `notify` | 系統內通知或日誌記錄。 | 記錄一筆操作紀錄。 |

---

## 3. 條件判定邏輯 (Condition Evaluation)

引擎支援豐富的比較運算子，且可進行欄位間的比對：
*   **比較**：`eq`, `neq`, `gt`, `lt`, `gte`, `lte`, `contains`。
*   **狀態變化**：`changed`（欄位值是否變動，常與 `on_change` 搭配使用）、`was_eq`（變更前的值是否為某值）。
*   **跨表引用**：支援 `customer_id.tier` 這種語法，直接抓取關聯表（客戶表）中的欄位進行判定。
*   **同表欄位比對**：使用明確的 `@欄位名` 前綴來比較同一表中的兩個欄位。例如：
    *   條件：`{ field: "quantity", operator: "gt", value: "@available_stock" }` 檢查 `quantity > available_stock`。
    *   沒有 `@` 前綴的值會被視為字面值（字串或數字）。

---

## 4. 表達式與計算 (Expressions)

在 `set_field` 或 `create_record` 中，支援帶入動態公式：
*   支援基礎四則運算：`price * quantity * 0.9`。
*   支援引用舊值：使用 `__old_fieldname` 取得更新前的原始資料。
*   支援系統變數：如 `TODAY` 或 `NOW`。

---

## 5. Webhook 整合

*   **自動重試與日誌**：所有 Webhook 執行結果都會記錄在 `_zenku_webhook_logs` 表中，包含 HTTP 狀態碼與回應時間，方便開發者偵錯。
*   **Payload 結構**：預設會帶入當前資料表的名稱、執行的動作以及完整的資料 Payload。

---

## 6. 狀態機護路機制 (State Machine Guard)

當資料表附加了 `state_machine` Trait 時，規則引擎會在 `before_update` 阶段自動插入一個內建的護路機制：

1.  **讀取快取**：從 `TraitCache` 中取出該資料表的狀態機設定。
2.  **偵測狀態變更**：比較「更改前狀態 (`old_status`)」與「更改後狀態 (`new_status`)」。
3.  **強制終態**：若 `old_status` 為 `is_final: true`，直接拋出錯誤、拒絕任何寫入。
4.  **轉換合法檢查**：檢查 `new_status` 是否在 `transitions[old_status]` 列表中；若不在，拒絕寫入。

此機制自動對所有資料寫入路徑生效（包含直接 PATCH API、MCP 工具、外部整合），不依賴前端 UI 就能確保工作流程完整性。
