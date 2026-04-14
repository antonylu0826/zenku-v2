# Phase 4：Agent 擴展

> **目標：** 完成 File Agent、Logic Agent、Test Agent，並建立 Agent 權限控管。
> **建議模型：Opus**（Prompt 設計 + 規則引擎核心邏輯）
> **Sonnet 可做 File upload UI 和 rule CRUD**。

---

## 進度總覽

| 項目 | 狀態 |
|------|------|
| 4.1 Orchestrator 升級（manage_rules + assess_impact） | ✅ 完成 |
| 4.4 Logic Agent（規則 CRUD） | ✅ 完成 |
| 4.5 Test Agent（assess_impact） | ✅ 完成 |
| Rule Engine（before/after hooks + FK 路徑條件） | ✅ 完成 |
| 4.2 Agent 權限矩陣 | ⬜ 待實作 |
| 4.3 File Agent（CSV 匯入、圖片 OCR、附件） | ⬜ 待實作 |

---

## 4.1 Orchestrator 升級 ✅

### Tool 清單擴展

```typescript
const TOOLS: Anthropic.Tool[] = [
  // 現有
  { name: 'manage_schema',  description: '建立或修改資料表結構' },
  { name: 'manage_ui',      description: '建立或更新使用者介面' },
  { name: 'query_data',     description: '查詢資料' },
  // 新增
  { name: 'manage_files',   description: '上傳、解析、管理檔案和圖片' },
  { name: 'manage_rules',   description: '建立或修改業務規則（自動化流程、驗證）' },
  { name: 'assess_impact',  description: '評估 schema 變更的影響（變更前必須先呼叫）' },
];
```

### 流程變更：Schema 變更必經 Test Agent

```
破壞性變更（drop_column, rename_column, change_type）：
  1. Orchestrator 先呼叫 assess_impact
  2. Test Agent 回報影響範圍
  3. Orchestrator 把影響告知使用者，詢問確認
  4. 使用者確認後才執行 manage_schema

非破壞性變更（add_column）：
  直接執行 manage_schema，不需 assess_impact
```

---

## 4.2 Agent 權限矩陣 ⬜

### 權限表

| Agent | DB 權限 | View 權限 | 檔案權限 | admin | builder | user |
|-------|---------|-----------|----------|-------|---------|------|
| Orchestrator | 無 | 讀 | 無 | ✓ | ✓ | ✓ |
| Schema Agent | DDL | 無 | 無 | ✓ | ✓ | ✗ |
| UI Agent | 無 | 讀寫 | 無 | ✓ | ✓ | ✗ |
| Query Agent | SELECT | 無 | 無 | ✓ | ✓ | ✓ |
| File Agent | INSERT | 無 | 讀寫 | ✓ | ✓ | ✓ |
| Logic Agent | 規則表讀寫 | 無 | 無 | ✓ | ✓ | ✗ |
| Test Agent | SELECT | 讀 | 無 | ✓ | ✓ | ✗ |

### 實作（待完成）

```typescript
// server/src/middleware/permission.ts
import { AGENT_PERMISSIONS } from '@zenku/shared';

export function canUserAccessAgent(userRole: UserRole, agentName: AgentName): boolean {
  const perm = AGENT_PERMISSIONS.find(p => p.agent === agentName);
  return perm?.allowed_by_roles.includes(userRole) ?? false;
}
```

```typescript
// orchestrator.ts — tool 執行前檢查
if (toolName === 'manage_schema' && !canUserAccessAgent(user.role, 'schema')) {
  result = { success: false, message: '你的權限不足以修改資料結構，請聯繫管理員' };
}
```

### Orchestrator System Prompt 動態調整（待完成）

```typescript
// 依使用者角色，只提供可用的 tools
function getToolsForRole(role: UserRole): Anthropic.Tool[] {
  return TOOLS.filter(tool => {
    const agentName = toolToAgent(tool.name);
    return canUserAccessAgent(role, agentName);
  });
}
```

---

## 4.3 File Agent ⬜

### 系統表

```sql
CREATE TABLE _zenku_files (
  id TEXT PRIMARY KEY,
  original_name TEXT NOT NULL,
  stored_path TEXT NOT NULL,
  mime_type TEXT,
  size_bytes INTEGER,
  table_name TEXT,           -- 關聯到哪張表（可 null）
  record_id INTEGER,         -- 關聯到哪筆記錄（可 null）
  field_key TEXT,            -- 關聯到哪個欄位（可 null）
  uploaded_by TEXT,          -- user_id
  uploaded_at TEXT DEFAULT (datetime('now'))
);
```

### Tool 定義

```typescript
{
  name: 'manage_files',
  input_schema: {
    properties: {
      action: { enum: ['upload', 'parse_csv', 'parse_image', 'list', 'delete'] },
      // upload：前端已上傳到 /api/files，AI 只需處理關聯
      file_id: { type: 'string' },
      // parse_csv：解析 CSV 自動建表
      // parse_image：OCR 解析圖片
    }
  }
}
```

### API

```typescript
// 檔案上傳（前端直接呼叫，不經 AI）
app.post('/api/files', multer.single('file'), (req, res) => {
  // 存檔到 uploads/
  // 寫入 _zenku_files
  // 回傳 file record
});

// 取得檔案
app.get('/api/files/:id', (req, res) => {
  // 從 _zenku_files 查路徑
  // res.sendFile()
});

// 列出某記錄的附件
app.get('/api/files?table=orders&record_id=1', (req, res) => {
  // 查 _zenku_files
});
```

### CSV 匯入流程

```
使用者上傳 CSV
    ↓
前端 POST /api/files → 存檔
    ↓
使用者：「幫我把這個客戶名單匯入」
    ↓
Orchestrator → manage_files({ action: 'parse_csv', file_id: '...' })
    ↓
File Agent：
  1. 讀取 CSV header → 推斷欄位（name TEXT, email TEXT, phone TEXT）
  2. 呼叫 Schema Agent 建表（或配對現有表）
  3. 批次 INSERT 資料
  4. 呼叫 UI Agent 建 view
```

### 圖片 OCR 流程

```
使用者上傳截圖
    ↓
Orchestrator → manage_files({ action: 'parse_image', file_id: '...' })
    ↓
File Agent：
  1. 讀取圖片
  2. 呼叫 Claude Vision API 解析
  3. 結構化資料 → 推斷 schema
  4. 問使用者確認後建表 + 匯入
```

### 前端元件

```
components/fields/ImageField.tsx   — 圖片上傳 + 預覽
components/fields/FileField.tsx    — 檔案上傳 + 下載連結
```

---

## 4.4 Logic Agent ✅

### 系統表

```sql
CREATE TABLE _zenku_rules (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  table_name TEXT NOT NULL,
  trigger_type TEXT NOT NULL,   -- before_insert, after_insert, ...
  condition TEXT,               -- JSON
  actions TEXT NOT NULL,        -- JSON array of RuleAction
  priority INTEGER DEFAULT 0,  -- 同 trigger 多條 rule 的執行順序
  enabled BOOLEAN DEFAULT 1,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);
```

### 實作位置

- `server/src/agents/logic-agent.ts` — CRUD 操作（create/update/delete/list）
- `server/src/engine/rule-engine.ts` — 執行引擎（executeBefore / executeAfter）
- `server/src/db.ts` — getRulesForTable、getAllRules

### Rule Engine 實作細節

**支援的 trigger：**
- `before_insert / before_update / before_delete`：同步攔截，可修改資料或拒絕操作
- `after_insert / after_update / after_delete`：非同步副作用，不阻塞回應

**Action 類型：**

| type | 時機 | 說明 |
|------|------|------|
| `set_field` | before/after | 設定欄位值，value 支援公式（`quantity * unit_price * 0.9`） |
| `validate` | before | 條件成立時拒絕操作並回傳 message |
| `create_record` | after | 在另一張表插入新記錄，record_data 值支援表達式 |
| `webhook` | after | POST 到外部 URL |
| `notify` | after | console.log 通知（未來可擴展為推播） |

**Condition 支援 FK 路徑（跨表條件）：**

`condition.field` 可使用點路徑沿 FK 跨表查詢：

```json
{
  "field": "order_id.customer_id.tier",
  "operator": "eq",
  "value": "VIP"
}
```

引擎會自動解析：`order_items.order_id` → 查 `orders` → `orders.customer_id` → 查 `customers` → 取 `customers.tier`。

這讓規則可以在明細表（order_items）上根據主檔關聯的欄位（客戶等級）觸發。

**Condition operator：** `eq`, `neq`, `gt`, `lt`, `gte`, `lte`, `contains`, `changed`

### 對話→動作 範例

```
使用者：「VIP 客戶下單自動打 9 折」

Orchestrator → manage_rules({
  action: 'create_rule',
  rule: {
    name: 'VIP 自動折扣',
    table_name: 'order_items',
    trigger_type: 'before_insert',
    condition: { field: 'order_id.customer_id.tier', operator: 'eq', value: 'VIP' },
    actions: [
      { type: 'set_field', field: 'subtotal', value: 'quantity * unit_price * 0.9' }
    ]
  }
})
```

> **注意：** 若客戶等級（tier）在關聯表上，condition.field 須使用 FK 路徑，而非直接欄位名。

---

## 4.5 Test Agent ✅

### 實作位置

- `server/src/agents/test-agent.ts`

### 分析範圍

- 受影響的 views（table_name 或 detail_views 中引用）
- 受影響的 rules（同表名）
- 資料筆數
- 外鍵依賴表（PRAGMA foreign_key_list 逐表掃描）
- 欄位級影響（哪些 view column / rule action 引用了該欄位）

### 嚴重度判斷

| 條件 | 嚴重度 |
|------|--------|
| 資料筆數 > 100 或有外鍵依賴表 | 高風險 |
| 其他 | 中風險 |

---

## 新增依賴（File Agent 待安裝）

```bash
npm install multer @types/multer   # 檔案上傳
npm install uuid                    # 檔案 ID 生成
```

---

## 新增檔案

```
server/src/agents/file-agent.ts         ⬜ 待實作
server/src/agents/logic-agent.ts        ✅
server/src/agents/test-agent.ts         ✅
server/src/engine/rule-engine.ts        ✅
server/src/middleware/permission.ts     ⬜ 待實作

web/src/components/fields/ImageField.tsx  ⬜ 待實作
web/src/components/fields/FileField.tsx   ⬜ 待實作
```

---

## 驗收標準

- [ ] 上傳 CSV → AI 自動建表 + 匯入資料 + 建 UI
- [x] 「VIP 客戶下單打 9 折」→ 自動建 rule，新增訂單時自動套用（含 FK 跨表條件）
- [x] 破壞性 schema 變更 → 先顯示影響評估 → 使用者確認後才執行
- [ ] user 角色無法使用 manage_schema（被拒絕並提示）
- [ ] Webhook rule → 觸發後正確呼叫外部 URL
