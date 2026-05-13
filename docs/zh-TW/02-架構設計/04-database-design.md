# 資料庫設計 (Database Design)

> Zenku 採用「混合式資料庫模型」：系統元資料表負責管理應用程式結構與 AI 狀態，而業務資料表則根據使用者需求動態生成。

---

## 1. 系統元資料表 (`_zenku_*`)
這些表格由系統自動管理，用於儲存應用程式的「靈魂」。

| 表名 | 職責 |
| :--- | :--- |
| `_zenku_views` | 儲存前端視圖定義 (JSON)。 |
| `_zenku_rules` | 儲存商業邏輯觸發條件與動作。 |
| `_zenku_table_traits` | 儲存資料表特徵設定（如狀態機 JSON），於啟動時載入至記憶體快取。 |
| `_zenku_journal` | 變更日誌，支援 Undo 復原機制。 |
| `_zenku_chat_*` | 儲存對話歷史、Token 消耗與延遲觀測。 |
| `_zenku_users` | 使用者帳號與基本設定。 |
| `_zenku_files` | 檔案附件元資料。 |
| `_zenku_translations` | 多語言翻譯字典。 |
| `_zenku_permissions` | 資料表層級 RBAC 權限規則（role × table_name × CRUD）。 |
| `_zenku_roles` | 自訂角色定義（名稱、說明）。 |
| `_zenku_role_members` | 使用者↔自訂角色的多對多指派關係。 |

---

## 2. 業務資料表 (Business Tables)
業務資料表是由 AI (Schema Agent) 根據使用者對話動態建立。

### 生命週期 (Lifecycle)
1.  **建立**：使用者描述需求後，AI 發送 `create_table` 指令。
2.  **演進**：透過 `alter_table` 新增欄位，或修改現有結構。
3.  **預設欄位**：每個業務表建立時，系統會自動補上 `id` (PK), `created_at`, `updated_at` 欄位。

---

## 3. 資料型別對照表 (Field Type Mapping)

Zenku 抽象了一套統一的欄位型態，並自動映射至底層資料庫的實體類型：

| Zenku 型態 | SQLite 類型 | Postgres 類型 | 說明 |
| :--- | :--- | :--- | :--- |
| `TEXT` | `TEXT` | `text` | 字串、長文本、JSON 內容。 |
| `INTEGER` | `INTEGER` | `integer` | 整數、外鍵 ID、計數。 |
| `REAL` | `REAL` | `double precision` | 浮點數、金額、百分比。 |
| `BOOLEAN` | `INTEGER` (0/1) | `boolean` | 布林開關。 |
| `DATE` | `TEXT` (ISO) | `date` | 日期。 |
| `DATETIME` | `TEXT` (ISO) | `timestamp` | 日期時間。 |

---

## 4. 多資料庫適配 (Database Adapters)

系統透過 `DbAdapter` 介面實現多資料庫支援，切換資料庫僅需調整環境變數 `DB_TYPE`：

*   **SQLite Adapter** (`node:sqlite`)：預設選擇，適合單機部署與快速開發。
*   **Postgres Adapter** (`postgres`)：適合生產環境，具備更好的併發處理能力。
*   **MSSQL Adapter** (`mssql`)：支援企業級 Windows 環境整合。

---

## 5. 初始化與遷移策略 (Initialization & Migration)

*   **延遲初始化 (Lazy Init)**：系統表會在伺服器啟動後，第一次與資料庫連線時自動檢查並建立 (`CREATE TABLE IF NOT EXISTS`)，無需手動執行 Migration 腳本。
*   **動態遷移**：業務表的變更（如新增欄位）是在執行期（Runtime）由 AI 代理完成，並同步更新 `_zenku_journal` 以確保變更可追蹤。
