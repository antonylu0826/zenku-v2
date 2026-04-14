# Phase 1：UI 基礎升級

> **目標：** 將 PoC 的粗糙介面升級為可用的產品介面。
> **範圍：** 純前端，不涉及後端邏輯變更（後端只加分頁/排序 API）。
> **建議模型：Sonnet**（大量元件替換，模式固定）
> **可選用 Codex** 做 shadcn 元件的批次搬遷。

---

## 1.1 導入 shadcn/ui

### 安裝步驟

```bash
cd packages/web
npx shadcn@latest init    # 選 New York style, Zinc color, CSS variables
npx shadcn@latest add button input select table dialog \
  checkbox label toast sheet tabs separator \
  dropdown-menu popover command scroll-area badge \
  card avatar tooltip
```

### 元件替換對照表

| 現有手寫 | 替換為 shadcn | 檔案 |
|---------|--------------|------|
| `<button className="...">` | `<Button>` | 全部 |
| `<input className="...">` | `<Input>` | FormView |
| `<select className="...">` | `<Select>` | FormView |
| `<table className="...">` | `<Table>` | TableView |
| Modal 元件 | `<Dialog>` | TableView |
| confirm() | `<AlertDialog>` | TableView (delete) |
| 無 | `<Toast>` (Sonner) | 操作回饋 |

### 主題設定

```css
/* packages/web/src/index.css */
@layer base {
  :root {
    --background: 0 0% 100%;
    --foreground: 240 10% 3.9%;
    --primary: 239 84% 67%;      /* indigo-500 */
    --primary-foreground: 0 0% 100%;
    /* ... shadcn 標準 CSS variables */
  }
  .dark {
    --background: 240 10% 3.9%;
    --foreground: 0 0% 98%;
    --primary: 239 84% 67%;
    /* ... dark mode variables */
  }
}
```

---

## 1.2 佈局重構

### 目標佈局

```
┌──────────────────────────────────────────────────┐
│ AppShell                                          │
│ ┌────────┬───────────────────────┬──────────────┐│
│ │Sidebar │    AppArea            │  ChatPanel    ││
│ │(可折疊) │                       │  (可拖曳寬度) ││
│ │        │                       │              ││
│ │ w:52   │    flex:1             │  280~600px   ││
│ │        │                       │  default:360 ││
│ └────────┴───────────────────────┴──────────────┘│
└──────────────────────────────────────────────────┘
```

### 新增依賴

```bash
npm install react-resizable-panels
```

### 新增檔案

```
components/layout/
├── AppShell.tsx         # 整體佈局框架（ResizablePanelGroup）
├── ThemeProvider.tsx     # next-themes 或自訂 ThemeContext
└── ThemeToggle.tsx       # 明暗切換按鈕
```

### AppShell.tsx 架構

```tsx
import { ResizablePanelGroup, ResizablePanel, ResizableHandle } from 'react-resizable-panels';

function AppShell() {
  return (
    <div className="h-screen">
      <ResizablePanelGroup direction="horizontal">
        {/* Sidebar */}
        <ResizablePanel defaultSize={12} minSize={0} maxSize={20} collapsible>
          <Sidebar />
        </ResizablePanel>
        <ResizableHandle />

        {/* App Area */}
        <ResizablePanel defaultSize={60}>
          <AppArea />
        </ResizablePanel>
        <ResizableHandle />

        {/* Chat Panel */}
        <ResizablePanel defaultSize={28} minSize={20} maxSize={50}>
          <ChatPanel />
        </ResizablePanel>
      </ResizablePanelGroup>
    </div>
  );
}
```

### 初始狀態（無 views 時）

```
┌──────────────────────────────────────────────────┐
│                                                    │
│              ┌──────────────────┐                  │
│              │   ChatPanel      │                  │
│              │   (居中，卡片式)  │                  │
│              │   max-w-lg       │                  │
│              └──────────────────┘                  │
│                                                    │
└──────────────────────────────────────────────────┘
```

有 views 後自動展開為三欄佈局。

---

## 1.3 暗色模式

### 實作方式

使用 CSS class 策略（不依賴 next-themes）：

```tsx
// ThemeProvider.tsx
const ThemeContext = createContext<{ theme: 'light' | 'dark'; toggle: () => void }>();

function ThemeProvider({ children }) {
  const [theme, setTheme] = useState(() =>
    localStorage.getItem('zenku-theme') ?? 'light'
  );

  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark');
    localStorage.setItem('zenku-theme', theme);
  }, [theme]);

  return (
    <ThemeContext.Provider value={{ theme, toggle: () => setTheme(t => t === 'light' ? 'dark' : 'light') }}>
      {children}
    </ThemeContext.Provider>
  );
}
```

### ThemeToggle 位置

放在 Sidebar 底部或 ChatPanel header。

---

## 1.4 表格增強

### 新增依賴

```bash
npm install @tanstack/react-table
```

### TableView 重寫重點

```tsx
import { useReactTable, getCoreRowModel, getSortedRowModel, getPaginationRowModel } from '@tanstack/react-table';

// 1. 分頁（後端分頁）
// GET /api/data/:table?page=1&limit=20
// 回傳 { rows: [...], total: 150 }

// 2. 排序
// GET /api/data/:table?sort=name&order=asc

// 3. 搜尋
// GET /api/data/:table?search=keyword
// 後端搜尋所有 TEXT 欄位（LIKE '%keyword%'）

// 4. 欄寬拖曳
// columnResizeMode="onChange"
```

### 後端 API 調整

```typescript
// server/src/index.ts — 修改 GET /api/data/:table
app.get('/api/data/:table', (req, res) => {
  const { table } = req.params;
  const page = parseInt(req.query.page as string) || 1;
  const limit = parseInt(req.query.limit as string) || 20;
  const sort = req.query.sort as string;
  const order = (req.query.order as string) === 'asc' ? 'ASC' : 'DESC';
  const search = req.query.search as string;
  const offset = (page - 1) * limit;

  let where = '';
  if (search) {
    // 取所有 TEXT 欄位做 LIKE 搜尋
    const cols = getTableSchema(table).filter(c => c.type === 'TEXT');
    where = 'WHERE ' + cols.map(c => `"${c.name}" LIKE '%${search}%'`).join(' OR ');
  }

  const orderBy = sort ? `ORDER BY "${sort}" ${order}` : 'ORDER BY id DESC';
  const rows = db.prepare(`SELECT * FROM "${table}" ${where} ${orderBy} LIMIT ? OFFSET ?`).all(limit, offset);
  const total = db.prepare(`SELECT COUNT(*) as count FROM "${table}" ${where}`).get();

  res.json({ rows, total: total.count, page, limit });
});
```

---

## 1.5 表單增強

- 驗證回饋：shadcn `<FormMessage>` 顯示錯誤
- 成功回饋：shadcn `<Toast>` 顯示「儲存成功」
- Loading 狀態：Submit button 加 spinner

---

## 現有檔案影響範圍

| 檔案 | 變更 |
|------|------|
| `App.tsx` | 改用 AppShell 佈局 + ThemeProvider |
| `components/ChatPanel.tsx` | 換 shadcn 元件 |
| `components/Sidebar.tsx` | 換 shadcn 元件 + 折疊 |
| `components/blocks/TableView.tsx` | 重寫，用 tanstack-table + shadcn |
| `components/blocks/FormView.tsx` | 換 shadcn 元件 + 驗證 |
| `components/AppArea.tsx` | 小改 |
| `index.css` | shadcn CSS variables + dark mode |
| `server/src/index.ts` | GET /api/data/:table 加分頁排序 |

### 新增檔案

| 檔案 | 用途 |
|------|------|
| `components/layout/AppShell.tsx` | 佈局框架 |
| `components/layout/ThemeProvider.tsx` | 暗色模式 |
| `components/layout/ThemeToggle.tsx` | 切換按鈕 |
| `lib/cn.ts` | class merge util (shadcn 需要) |
| `components/ui/*.tsx` | shadcn 自動生成的元件 |

---

## 驗收標準

- [x] 所有手寫元件替換為 shadcn
- [x] 明暗模式可切換，偏好持久化
- [x] ChatPanel 可拖曳調整寬度
- [x] Sidebar 可折疊
- [x] 表格有分頁、排序、搜尋
- [x] 表單有驗證回饋和 toast 提示
- [x] 初始狀態（無 view）ChatPanel 居中顯示
- [x] 暗色模式下所有元件正常顯示
