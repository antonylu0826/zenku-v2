# 視圖動作與條件式 UI (Actions & Conditional UI)

> 視圖動作讓資料不再只是靜態展示，而是成為可互動的業務流程；條件式 UI 則能根據資料狀態即時引導使用者操作。

---

## 1. 視圖動作 (View Actions)

Zenku 支援在各類視圖（如表格、看板、表單）中掛載動作按鈕。

### A. 內建動作 (Built-in Actions)
基礎的 CRUD 操作：
*   `create`：新增資料（彈出表單或導向新增頁面）。
*   `edit`：編輯選取的紀錄。
*   `delete`：刪除紀錄。
*   `export`：將當前過濾後的資料導出為 CSV。

### B. 自訂動作 (Custom Actions)
由 AI 代理或管理員定義的高級動作，具備以下屬性：
*   **上下文 (`context`)**：可設定按鈕出現在「列表列 (`list`)」、「詳情頁 (`record`)」或兩者皆是。
*   **外觀 (`variant`)**：支援不同的按鈕樣式（如 `destructive` 紅色按鈕、`warning` 橘色按鈕）。

### C. 動作行為 (Action Behaviors)
點擊按鈕後觸發的具體邏輯：
*   `set_field`：點擊後直接修改該筆紀錄的某個欄位值（如「確認收貨」按鈕）。
*   `trigger_rule`：觸發一個指定的「手動商業規則 (Manual Rule)」。
*   `webhook`：呼叫外部 API 並帶入當前紀錄資料。
*   `navigate`：跳轉至另一個視圖，並自動帶入過濾條件。
*   `create_related`：在關聯表中建立紀錄（如從「訂單」一鍵生成「發票」）。

---

## 2. 條件式外觀規則 (Appearance Rules)

外觀規則允許前端在「不經過伺服器」的情況下，根據目前欄位的值即時改變 UI 樣式。

### 支援的效果 (`apply`)
*   **欄位樣式**：`text_color` (文字顏色), `bg_color` (背景顏色), `font_weight` (粗細)。
*   **元件控制**：`hidden` (隱藏欄位), `disabled` (禁用欄位)。

### 判定邏輯
*   **觸發條件 (`when`)**：支援 `eq`, `neq`, `gt`, `lt` 等比較。
*   **複合邏輯**：支援 `AND` / `OR` 多重條件組合。
*   **動態變數**：支援 `TODAY` 關鍵字（例如：若「到期日」小於 `TODAY`，則將「狀態」欄位顯示為紅色）。

---

## 3. 按鈕的可見性與可用性

自訂動作可以透過 `AppearanceCondition` 進行更精細的控制：
*   **可見條件 (`visible_when`)**：只有滿足條件時按鈕才會出現（如：只有「未付款」的訂單才顯示「支付」按鈕）。
*   **啟用條件 (`enabled_when`)**：按鈕雖然出現但為灰色不可點擊（如：庫存不足時，「出貨」按鈕禁用）。

---

## 4. 互動確認 (Confirm Dialog)

為了防止誤觸重要操作（如刪除或批次更新），動作可以配置確認對話框：
*   `title`：標題（如「確定要結案嗎？」）。
*   `description`：警示文字（如「此操作不可復原，請確認資料正確性」）。

---

## 5. 狀態機 (State Machine Trait)

狀態機是 Zenku 的「表格特徵 (Trait)」系統之一，能為任何業務資料表賦予工作流審核能力。

### 核心概念

狀態機以 JSON 設定儲存於 `_zenku_table_traits` 表中，並在伺服器啟動時載入至記憶體快取（`TraitCache`）。其主要設定如下：

```json
{
  "status_field": "status",
  "initial_state": "draft",
  "states": {
    "draft":     { "label": "草稿",   "is_editable": true },
    "submitted": { "label": "待審核", "is_editable": false },
    "approved":  { "label": "已核准", "is_final": true },
    "rejected":  { "label": "已駁回", "is_final": true }
  },
  "transitions": {
    "draft":     ["submitted"],
    "submitted": ["approved", "rejected"]
  },
  "allow_delete_in": ["draft"]
}
```

### 關鍵屬性說明

| 屬性 | 說明 |
| :--- | :--- |
| `status_field` | 代表狀態的欄位名稱（通常為 `status`）。 |
| `initial_state` | 新增紀錄時預設的初始狀態。 |
| `states[key].is_editable` | 設為 `false` 時，前端表單自動進入唯讀模式。 |
| `states[key].is_final` | 設為 `true` 時，表示終態，自動唯讀且不可再轉換。 |
| `transitions` | 合法的狀態轉換路徑，後端 Guard 會阻擋非法轉換。 |
| `allow_delete_in` | 只有列出的狀態才允許刪除該筆紀錄。 |

### 前端 UI 行為

*   **步進器 (StatusStepper)**：`FormView` 在偵測到 `state_machine` Trait 時，會自動在表單頂部渲染步進器，視覺化呈現當前所在的流程節點。
*   **自動唯讀**：當紀錄狀態的 `is_editable === false` 或 `is_final === true` 時，`FormView` 和 `TableView` 的「編輯」按鈕會自動禁用，無法修改欄位。
*   **操作按鈕動態顯示**：自訂動作（如「核准」、「駁回」）可透過 `visible_when` 條件，確保只在正確的狀態下出現。

### 後端 Guard 機制

伺服器在 `before_update` Hook 中會自動：
1.  讀取 TraitCache 中的狀態機設定。
2.  比對更新後的狀態是否為目前狀態的合法轉換目標。
3.  若非合法轉換（或目前狀態為終態），直接拋出錯誤並中止寫入。
