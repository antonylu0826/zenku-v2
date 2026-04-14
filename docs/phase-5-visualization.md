# Phase 5：視覺化與報表

> **目標：** 讓資料不只是表格，能用圖表、看板、行事曆呈現。
> **建議模型：Sonnet**（圖表元件整合，模式明確）

---

## 進度總覽

| 項目 | 狀態 |
|------|------|
| Dashboard（stat_card / bar / line / pie / mini_table） | ✅ 完成 |
| Kanban（拖曳換狀態） | ✅ 完成 |
| Calendar（月曆格、事件顏色） | ✅ 完成 |
| Sidebar 圖示依 type 切換 | ✅ 完成 |
| POST /api/query 後端端點 | ✅ 完成 |
| Orchestrator 支援 dashboard/kanban/calendar | ✅ 完成 |

---

## 5.1 新增 View 類型 ✅

| 類型 | 用途 | 前端元件 |
|------|------|----------|
| `table` | 列表（現有） | TableView |
| `master-detail` | 主檔+明細（Phase 3） | MasterDetailView |
| `dashboard` | 統計面板 | DashboardView |
| `kanban` | 看板 | KanbanView |
| `calendar` | 行事曆 | CalendarView |

---

## 5.2 Dashboard ✅

### 依賴

```bash
npm install recharts
```

### 實作位置

`web/src/components/blocks/DashboardView.tsx`

### Widget 類型

| type | 資料格式 | 說明 |
|------|---------|------|
| `stat_card` | `[{ value: N }]` | 單一數字，支援 count/value/total 任一欄 |
| `bar_chart` | `[{ label, value }]` | config: x_key, y_key, color |
| `line_chart` | `[{ label, value }]` | config: x_key, y_key, color |
| `pie_chart` | `[{ label, value }]` | config: label_key, value_key |
| `mini_table` | 任意欄位 | 最多 10 rows |

### 後端：通用查詢 API

```typescript
// POST /api/query（只允許 SELECT）
app.post('/api/query', (req, res) => {
  const { sql } = req.body;
  if (!sql.trim().toUpperCase().startsWith('SELECT')) {
    return res.status(400).json({ error: '只允許 SELECT 查詢' });
  }
  const safeSQL = /\bLIMIT\b/i.test(sql) ? sql : `${sql} LIMIT 1000`;
  res.json(db.prepare(safeSQL).all());
});
```

### Orchestrator 使用指引

- dashboard 不需要 columns / form / actions
- stat_card query 需回傳 `value` 欄位
- bar/line query 需回傳 `label` + `value` 欄位（或設 config.x_key/y_key）

---

## 5.3 Kanban ✅

### 依賴

```bash
npm install @dnd-kit/core @dnd-kit/sortable @dnd-kit/utilities
```

### 實作位置

`web/src/components/blocks/KanbanView.tsx`

### 行為

- 分組來源：form.fields 中 `group_field` 的 `options`，若無則從資料 distinct values 推導
- **未知值**：資料中出現但不在 options 的值，自動多開一個欄位顯示（避免資料消失）
- 拖曳：`@dnd-kit/core` PointerSensor，拖到不同欄放下觸發 `PUT /api/data/:table/:id`，樂觀更新 + 失敗回退

### 已修正的 Bug

1. **資料消失**：form.options 與實際資料 status 值不符時，未知值不顯示。Fix：`allGroups = options + 實際資料中未在 options 的值`
2. **拖曳無效**：SQLite `row.id` 是 number，`useDraggable.id` 是 string，`===` 比對失敗。Fix：全部用 `String()` 轉換後比對
3. **CSS 高度塌陷**：`flex-1 overflow-y-auto` 在特定 flex 鏈無法拿到父元素高度。Fix：改用 `items-start` + 自然高度 + `space-y-2`

---

## 5.4 Calendar ✅

### 實作位置

`web/src/components/blocks/CalendarView.tsx`

### 行為

- 月曆格（7 欄 × 動態行數）
- 上下月導航 + 今天按鈕
- 事件依 `date_field`（YYYY-MM-DD）分組顯示
- `color_field`：不同值自動套用不同顏色（循環 6 色）
- 每格最多顯示 3 個事件，超過顯示「+N 更多」
- 今天高亮（圓形背景）

---

## AppArea 路由 ✅

```tsx
switch (view.type) {
  case 'master-detail': return <MasterDetailView ... />;
  case 'dashboard':     return <DashboardView view={view} />;
  case 'kanban':        return <KanbanView view={view} />;
  case 'calendar':      return <CalendarView view={view} />;
  default:              return <TableView view={view} />;
}
```

---

## Sidebar 圖示 ✅

```tsx
const VIEW_ICONS: Record<ViewType, LucideIcon> = {
  'table':         Database,
  'master-detail': FileText,
  'dashboard':     BarChart3,
  'kanban':        Columns3,
  'calendar':      Calendar,
};
```

---

## 新增檔案

```
web/src/components/blocks/DashboardView.tsx   ✅
web/src/components/blocks/KanbanView.tsx      ✅
web/src/components/blocks/CalendarView.tsx    ✅
web/src/components/ui/skeleton.tsx            ✅
```

---

## 驗收標準

- [x] 「看客戶統計」→ 生成 dashboard 含 stat cards + 圖表
- [x] Dashboard 圖表正確渲染（bar, line, pie）
- [x] 「用看板管理訂單進度」→ kanban view，拖曳更新狀態
- [x] 「行事曆顯示排程」→ calendar view
- [ ] 暗色模式下圖表正常顯示
