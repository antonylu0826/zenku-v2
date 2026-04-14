# Phase 3：Master-Detail 介面

> **目標：** 支援「訂單 + 訂單明細」、「採購單 + 採購明細」等一對多場景。
> **依賴：** Phase 2（關聯欄位、計算欄位）
> **狀態：✅ 完成**

---

## 概念

```
┌─ MasterDetailView ──────────────────────────────┐
│                                                   │
│  ┌─ 主檔表單 ─────────────────────────────────┐  │
│  │  訂單編號: ORD-001     狀態: [已確認 ▼]     │  │
│  │  客戶: [張三 ▼]        日期: 2026-04-12     │  │
│  │  備註: ...              總金額: $15,000      │  │
│  └────────────────────────────────────────────┘  │
│                                                   │
│  ┌─ [訂單明細] ─┬─ [附件] ──────────────────┐  │
│  │               │                           │  │
│  │  品名    數量  單價    小計                │  │
│  │  ──────────────────────────               │  │
│  │  螢幕     2   $5,000  $10,000             │  │
│  │  鍵盤     5   $1,000  $5,000              │  │
│  │                                           │  │
│  │              [+ 新增明細]                  │  │
│  └───────────────────────────────────────────┘  │
└───────────────────────────────────────────────────┘
```

---

## View Schema 擴充

```typescript
interface ViewDefinition {
  type: 'table' | 'master-detail';  // 新增 master-detail

  // master-detail 專用
  detail_views?: DetailViewDef[];
}

interface DetailViewDef {
  table_name: string;       // 明細表名
  foreign_key: string;      // 明細表中指向主表的外鍵欄位
  tab_label: string;        // Tab 標籤名
  view: ViewDefinition;     // 明細的 view 定義（遞迴，type='table'）
}
```

---

## 新增流程（草稿明細模式）

點「新增」不開 Dialog，而是跳到全頁面 `/view/:viewId/new`：

```
┌─ MasterDetailCreateView ────────────────────────┐
│  主檔資料                                         │
│  ┌─────────────────────────────────────────────┐ │
│  │  客戶: [...]   日期: [...]   備註: [...]     │ │
│  └─────────────────────────────────────────────┘ │
│                                                   │
│  訂單明細                          [+ 新增明細]   │
│  ┌─────────────────────────────────────────────┐ │
│  │  品名   數量  單價  小計   [待寫入]  [刪]   │ │  ← amber 底色
│  └─────────────────────────────────────────────┘ │
│                                                   │
│  主檔與所有待寫入明細將一併儲存     [取消] [全部儲存] │
└───────────────────────────────────────────────────┘
```

**儲存邏輯：**
1. POST 主表 → 取得 master id
2. 批次 POST 所有草稿明細（自動注入 FK）
3. 跳至 `/view/:viewId/:masterId`

---

## 前端路由

```tsx
<Routes>
  <Route path="/" element={<AppShell />}>
    <Route path="view/:viewId" element={<AppArea />} />
    <Route path="view/:viewId/:recordId" element={<AppArea />} />
    {/* recordId === 'new' → MasterDetailCreateView */}
    {/* recordId === '123' → MasterDetailView       */}
  </Route>
</Routes>
```

| URL | 行為 |
|-----|------|
| `/view/orders` | 訂單列表（TableView，點列進入詳情） |
| `/view/orders/new` | 新增訂單（主檔 + 草稿明細，一鍵儲存） |
| `/view/orders/3` | 訂單 #3 的 master-detail view |

---

## 架構說明

### ViewsContext

```tsx
// src/contexts/ViewsContext.tsx
// 全域 views 狀態，取代 prop drilling
const { views, fetchViews } = useViews();
```

AppShell、Sidebar、AppArea 均從 context 讀取，無需逐層傳 props。

### AppShell

- 使用 `<Outlet />` 渲染中間面板（react-router-dom nested routes）
- `useParams` 取得 viewId，從 context 查詢 viewName 顯示 breadcrumb
- Sidebar 改用 `NavLink`（active 狀態自動追蹤）

### FormView mode

```tsx
<FormView mode="view"  />  // 唯讀 + 右上角「編輯」按鈕
<FormView mode="edit"  />  // 可編輯
<FormView mode="create" /> // 預設
```

---

## 新增檔案

| 檔案 | 用途 |
|------|------|
| `src/contexts/ViewsContext.tsx` | 全域 views 狀態 |
| `src/components/ui/tabs.tsx` | Radix Tabs 元件 |
| `src/components/blocks/MasterDetailView.tsx` | 已存主檔詳情（view/edit + 明細 tabs） |
| `src/components/blocks/MasterDetailCreateView.tsx` | 新增主檔（含草稿明細） |

---

## 後端 API 調整

### 篩選支援

```
GET /api/data/:table?filter[order_id]=3
```

明細表按外鍵篩選，對應 `DetailTable` 的資料載入。

### 單筆查詢

```
GET /api/data/:table/:id
```

MasterDetailView 讀取主檔用。

### Cascade Delete

刪除主檔時，server 自動查詢 `PRAGMA foreign_key_list` 找到所有子表，
在同一 transaction 內先刪明細再刪主檔。

```typescript
// 自動 cascade，不需前端額外處理
DELETE /api/data/orders/3
// → 先刪 order_items WHERE order_id = 3
// → 再刪 orders WHERE id = 3
```

---

## Orchestrator Prompt 更新

```
建立一對多關係時：
1. manage_schema → 建主表（如 orders）
2. manage_schema → 建明細表（如 order_items），含外鍵 INTEGER + references: { table: 'orders' }
3. manage_ui → type: 'master-detail'，detail_views 定義明細
   - detail_views[0].foreign_key：明細表中指向主表的欄位名
   - detail_views[0].view.type 必須是 'table'
```

---

## 驗收結果

- [x] 「訂單有明細」→ AI 自動建兩張表 + master-detail view
- [x] 新增訂單時可同步加入草稿明細（待寫入標示）
- [x] 全部儲存：主檔 + 明細一次寫入
- [x] 訂單列表點擊 → 進入 master-detail 畫面
- [x] 上半部顯示主檔資訊（view/edit 模式切換）
- [x] 下半部 Tab 顯示明細列表（可新增/編輯/刪除）
- [x] 新增明細時自動帶入 FK（order_id）
- [x] 刪除主檔自動 cascade 刪明細
- [x] 返回列表（上一頁）
