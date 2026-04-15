# Zenku 改善規劃

> 基於 2026-04-15 測試回饋，涵蓋 UI、佈局、AI 工具、使用者管理、對話歷程七大模組。

---

## 模組一：UI 主題對齊 shadcn/ui 官方風格

**問題根源：**  
`packages/web/src/index.css` 中的 CSS 變數使用自訂藍色（`--primary: 225.9 70.7% 40.2%`），而 shadcn 官方預設是 zinc 灰黑色系。`ProviderSelector` 在 ChatPanel 也用了原生 `<select>` 而非 shadcn `Select` 元件。

**修改清單：**

| 檔案 | 修改說明 |
|------|----------|
| `packages/web/src/index.css` | 更新 CSS 變數為 shadcn 官方 zinc 預設值（light/dark 皆更新） |
| `packages/web/src/components/ChatPanel.tsx` L231-273 | `ProviderSelector` 改用 shadcn `Select` 元件 |
| `packages/web/src/components/admin/UserManagement.tsx` L91-99 | 原生 `<select>` 改用 shadcn `Select` |
| `packages/web/src/components/ui/` | 補裝缺少的 shadcn 元件：`scroll-area`、`dropdown-menu`、`popover`、`command` |

---

## 模組二：DetailView / MasterDetailView 多欄佈局

**問題根源：**  
`packages/web/src/components/blocks/MasterDetailView.tsx` L69-83 的 master form 是全寬單欄，`FormView.tsx` 也沒有分欄邏輯，造成 master 區域高度過高、空間利用不佳。

**修改清單：**

### `FormView.tsx`
- 新增 `columns?: 1 | 2 | 3` prop
- 欄位清單用 `grid grid-cols-{n} gap-4` 排版
- 特殊欄位（`textarea`、`richtext`、`computed`）強制 `col-span-full`

### `MasterDetailView.tsx`
- master 區改為三欄 grid（`grid grid-cols-3`）：
  - 左側 2 欄（`col-span-2`）放主要業務欄位
  - 右側 1 欄放元資料（`created_at`、`updated_at` 等系統欄），包在 `Card` 內
- detail 區：每個明細用 `Card` 包住 `TableView`，Card header 帶明細標題與新增按鈕

### View Schema 型別擴充（`packages/web/src/types.ts`）

```typescript
interface FormDefinition {
  columns?: 2 | 3;  // 新增，預設 1
  fields: FieldDef[];
}
```

### UI Agent 提示更新（`packages/server/src/agents/ui-agent.ts`）
- 建立 master-detail view 時預設帶 `columns: 2`

---

## 模組三：AI Chat write_data 工具

**問題根源：**  
`packages/server/src/tools/db-tools.ts` 只有 `queryData`（純 SELECT），沒有寫入函式。`packages/server/src/orchestrator.ts` 的工具清單也沒有 `write_data`。

**修改清單：**

### `packages/server/src/tools/db-tools.ts`
新增 `writeData(operation, table, data, where?, userRequest?)` 函式：
- 支援 `insert` / `update` / `delete` 三種操作
- 禁止寫入 `_zenku_` 前綴系統表
- `update` / `delete` 必須帶 `where` 條件，防止全表誤操作
- 寫入 journal 紀錄操作歷程

### `packages/server/src/orchestrator.ts`
在 `user` 角色的工具清單新增 `write_data` tool definition：

```typescript
{
  name: 'write_data',
  description: '向使用者資料表寫入、更新或刪除資料',
  input_schema: {
    type: 'object',
    properties: {
      operation: { type: 'string', enum: ['insert', 'update', 'delete'] },
      table: { type: 'string', description: '目標表名（不可為系統表）' },
      data: { type: 'object', description: 'insert/update 的欄位值' },
      where: { type: 'object', description: 'update/delete 的篩選條件（必填）' },
    },
    required: ['operation', 'table'],
  },
}
```

### `packages/web/src/components/ChatPanel.tsx`
`TOOL_LABELS` 補上 `write_data: '資料寫入'`

---

## 模組四：系統管理員 CRUD 使用者 + 停用 + 重設密碼

**問題根源：**  
目前 `packages/server/src/index.ts` L96-112 只有查詢與改角色兩支 API，無新增/停用/刪除/重設密碼。`UserManagement.tsx` 也只有角色下拉。

### DB Schema 變更（`packages/server/src/db.ts`）

```sql
ALTER TABLE _zenku_users ADD COLUMN disabled INTEGER DEFAULT 0;
```

`requireAuth` 中間件補檢查：`WHERE ... AND u.disabled = 0`

### 後端新增 API（`packages/server/src/index.ts`）

| Method | 路徑 | 說明 |
|--------|------|------|
| `POST` | `/api/admin/users` | 管理員新增使用者（含初始密碼） |
| `PATCH` | `/api/admin/users/:id/disable` | 停用使用者（`disabled = 1`） |
| `PATCH` | `/api/admin/users/:id/enable` | 啟用使用者（`disabled = 0`） |
| `DELETE` | `/api/admin/users/:id` | 刪除使用者（同時清除 sessions） |
| `POST` | `/api/admin/users/:id/reset-password` | 重設密碼（body 帶 `new_password`） |

### 前端重構（`packages/web/src/components/admin/UserManagement.tsx`）

- 用 shadcn `Table` 替換原生 `<table>`
- 每列操作按鈕：
  - 停用/啟用（toggle，已停用顯示 `Badge variant="secondary"`）
  - 重設密碼（開 `Dialog` 確認，支援輸入新密碼）
  - 刪除（`AlertDialog` 二次確認）
- 右上角「新增使用者」按鈕，開 `Dialog` 填 name / email / password / role

---

## 模組五：一般使用者編輯個人資料 + 重設密碼

**問題根源：**  
目前使用者無法修改自己的資料，`UserMenu.tsx` 也沒有個人設定入口。

### 後端新增 API（`packages/server/src/index.ts`）

| Method | 路徑 | 說明 |
|--------|------|------|
| `PUT` | `/api/users/me` | 修改自己的 `name`（不可改 email/role） |
| `PUT` | `/api/users/me/password` | 舊密碼 + 新密碼驗證後更新 |

### 前端新增

**`packages/web/src/components/auth/UserMenu.tsx`**  
新增「個人設定」選單項目，開啟 `ProfileDialog`

**新建 `packages/web/src/components/auth/ProfileDialog.tsx`**  
Dialog 內分兩個 Tab：
- **基本資料** tab：修改顯示名稱
- **修改密碼** tab：舊密碼 / 新密碼 / 確認密碼三個欄位

---

## 模組六：管理者對話歷程管理 — 封存 + 硬刪除

**問題根源：**  
`_zenku_chat_sessions` 沒有 `archived` 欄，`ChatHistory.tsx` 沒有封存/刪除操作。

### DB Schema 變更（`packages/server/src/db.ts`）

```sql
ALTER TABLE _zenku_chat_sessions ADD COLUMN archived INTEGER DEFAULT 0;
```

### 後端新增 API（`packages/server/src/index.ts`）

| Method | 路徑 | 說明 |
|--------|------|------|
| `PATCH` | `/api/admin/sessions/:id/archive` | 封存（`archived = 1`） |
| `PATCH` | `/api/admin/sessions/:id/unarchive` | 取消封存（`archived = 0`） |
| `DELETE` | `/api/admin/sessions/:id` | 硬刪除（含 messages + tool_events） |
| `GET` | `/api/admin/sessions?archived=0\|1` | 加 `archived` 篩選參數 |

### 前端重構（`packages/web/src/components/admin/ChatHistory.tsx`）

- 工具列加「顯示已封存」切換
- 每列加封存/取消封存、刪除按鈕（刪除用 `AlertDialog` 確認）
- 已封存 session 用 `Badge` 標記 `已封存`

---

## 模組七：ChatPanel 多對話歷程

**問題根源：**  
`packages/web/src/components/ChatPanel.tsx` 訊息只存在 React state，沒有對應到 `_zenku_chat_sessions` 的 sessionId，重整即消失，也無法切換對話。

### 後端新增 API（`packages/server/src/index.ts`）

| Method | 路徑 | 說明 |
|--------|------|------|
| `GET` | `/api/sessions` | 取得自己所有未封存 sessions（含標題、時間） |
| `GET` | `/api/sessions/:id/messages` | 載入某 session 的訊息歷程 |
| `PATCH` | `/api/sessions/:id/title` | 修改 session 標題 |
| `PATCH` | `/api/sessions/:id/archive` | 封存（使用者封存後不顯示在清單，admin 才能硬刪） |

**`/api/chat` SSE 修改：**  
第一個 chunk 新增 `{ type: 'session_id', id: '...' }` 讓前端取得 session id；後續每次送訊息帶 `session_id` body 參數。

### 前端重構（`packages/web/src/components/ChatPanel.tsx`）

UI 佈局：

```
+------------------------------------------+
| [+ 新對話]  [v 目前對話標題 ▼]       [⋯] |
+------------------------------------------+
| 訊息列表（目前 session）                  |
| ...                                      |
+------------------------------------------+
| 輸入框                          [送出 ▶] |
+------------------------------------------+
```

**行為細節：**
- 下拉選單列出最近 20 個 sessions（標題 + 相對時間），底部「檢視全部」
- 雙擊對話標題進入行內編輯（儲存後呼叫 `PATCH /api/sessions/:id/title`）
- 「⋯」選單：封存此對話
- 切換 session 時 lazy 載入訊息（`GET /api/sessions/:id/messages`）
- 新開對話：建立 session → 清空訊息列表 → 更新 URL（可選）
- 封存後該 session 從下拉清單消失，但管理後台仍可查看

### 型別更新（`packages/web/src/types.ts`）

```typescript
interface ChatSession {
  id: string;
  title: string | null;
  provider: string;
  model: string;
  message_count: number;
  created_at: string;
  updated_at: string;
}
```

`ChatMessage` 補 `session_id?: string`

---

## 執行順序建議

| 順序 | 模組 | 理由 |
|------|------|------|
| 1 | 模組一（UI 主題） | 視覺基礎，影響後續所有截圖 |
| 2 | 模組二（多欄佈局） | 純前端，不依賴其他模組 |
| 3 | 模組三（write_data） | 後端小改，獨立不影響其他模組 |
| 4 | 模組四（管理員使用者管理） | 需先加 `disabled` DB 欄位 |
| 5 | 模組五（個人設定） | 依賴模組四的 auth 基礎穩定後做 |
| 6 | 模組六（封存歷程） | 需先加 `archived` DB 欄位 |
| 7 | 模組七（多對話歷程） | 最複雜，依賴 session API 完整後做 |


[ ] 將 agent 提示詞和 tool descriptions 改寫為英文
[ ] AI Chat 的對話內容要支援顯示 Markdown, table, 流程圖及 emoji，chat 的對話框要能適當的長高，適應多行的內容
[ ] MasterDetailView 裡的 Detail Modal 內容也要支援多欄並寬度適合，避免 detail 欄位一多就變一長條
[ ] 左側邊欄選單需要支援群組