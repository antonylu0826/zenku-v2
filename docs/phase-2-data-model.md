# Phase 2：資料模型升級

> **目標：** 支援關聯、動態選項、計算欄位、更多欄位類型。
> **這是 Zenku 能否承載真實業務場景的關鍵 Phase。**
> **建議模型：Opus 設計 tool schema → Sonnet 實作前後端**

---

## 2.1 關聯欄位（Foreign Key）

### Schema Agent 變更

`manage_schema` tool 的 column 定義擴充：

```typescript
// orchestrator.ts — columns item 新增 references 屬性
{
  name: { type: 'string' },
  type: { type: 'string', enum: ['TEXT', 'INTEGER', 'REAL', 'BOOLEAN', 'DATE', 'DATETIME'] },
  required: { type: 'boolean' },
  options: { type: 'array', items: { type: 'string' } },
  references: {
    type: 'object',
    properties: {
      table: { type: 'string', description: '關聯的表名' },
      column: { type: 'string', default: 'id', description: '關聯的欄位' }
    },
    description: '外鍵，讓此欄位關聯到另一張表'
  }
}
```

### db-tools.ts 變更

```typescript
// createTable — 支援 REFERENCES
const colDefs = columns.map(col => {
  let def = `"${col.name}" ${col.type}`;
  if (col.required) def += ' NOT NULL';
  if (col.references) {
    def += ` REFERENCES "${col.references.table}"("${col.references.column || 'id'}")`;
  }
  return def;
});
```

### 新增 API：選項端點

```typescript
// server/src/index.ts
// 關聯欄位 + 動態下拉的選項來源
app.get('/api/data/:table/options', (req, res) => {
  const { table } = req.params;
  const { value_field = 'id', display_field = 'name', search } = req.query;

  let sql = `SELECT "${value_field}" as value, "${display_field}" as label FROM "${table}"`;
  if (search) {
    sql += ` WHERE "${display_field}" LIKE ?`;
    const rows = db.prepare(sql + ' LIMIT 50').all(`%${search}%`);
    return res.json(rows);
  }
  res.json(db.prepare(sql + ' ORDER BY "${display_field}" LIMIT 100').all());
});
```

### 前端 RelationField 元件

```
components/fields/RelationField.tsx
```

```tsx
// 使用 shadcn <Command> + <Popover> 做搜尋式下拉
// 1. 顯示已選的關聯名稱（不是 ID）
// 2. 點開下拉框，可輸入搜尋
// 3. 呼叫 GET /api/data/:table/options?search=xxx 取選項
// 4. 選擇後存 value_field（通常是 id）到表單值
```

### UI Agent 變更

`manage_ui` tool 的 form field 定義擴充：

```typescript
// 新增 relation 型別的欄位
{
  key: 'customer_id',
  label: '客戶',
  type: 'relation',
  required: true,
  relation: {
    table: 'customers',
    value_field: 'id',
    display_field: 'name'
  }
}
```

### 對話→動作 範例

```
使用者：「訂單要關聯到客戶」

Orchestrator：
  1. manage_schema({ action: 'alter_table', table_name: 'orders', changes: [{
       operation: 'add_column',
       column: { name: 'customer_id', type: 'INTEGER', references: { table: 'customers' } }
     }]})
  2. manage_ui({ action: 'update_view', view: { ..., form: { fields: [..., {
       key: 'customer_id', label: '客戶', type: 'relation',
       relation: { table: 'customers', value_field: 'id', display_field: 'name' }
     }]}}})
```

---

## 2.2 動態下拉選項

### FieldDef 擴充

```typescript
// 新增 source 屬性（與 relation 不同，source 用於 select 型別）
{
  key: 'category',
  label: '分類',
  type: 'select',
  source: {
    table: 'categories',      // 從 categories 表取選項
    value_field: 'name',      // 選項值
    display_field: 'name'     // 顯示文字
  }
}
```

### 前端 DynamicSelectField

```
components/fields/DynamicSelectField.tsx
```

```tsx
// 判斷邏輯：
// if (field.options)       → 靜態 <Select>（現有）
// if (field.source)        → DynamicSelectField（呼叫 /api/data/:table/options）
// if (field.relation)      → RelationField（搜尋式）
```

### FormView 路由判斷

```tsx
function renderField(field: FieldDef) {
  if (field.type === 'relation') return <RelationField field={field} />;
  if (field.type === 'select' && field.source) return <DynamicSelectField field={field} />;
  if (field.type === 'select' && field.options) return <SelectField field={field} />;
  if (field.computed) return <ComputedField field={field} />;
  // ... 其他 by type
}
```

---

## 2.3 計算欄位

### 公式引擎（@zenku/shared/formula.ts）

```typescript
// 安全解析，不使用 eval
// Tokenizer → Parser → AST → Evaluator

type Token = { type: 'number' | 'field' | 'op' | 'paren'; value: string };

// 支援的運算：+ - * / ( )
// 欄位引用直接用欄位名：'quantity * unit_price'

export function evaluateFormula(
  formula: string,
  values: Record<string, number>
): number {
  const tokens = tokenize(formula);
  const ast = parse(tokens);
  return evaluate(ast, values);
}
```

### 前端即時計算

```tsx
// ComputedField.tsx
function ComputedField({ field, formValues, onChange }) {
  useEffect(() => {
    // 監聽 dependencies 的值變化
    const depValues: Record<string, number> = {};
    for (const dep of field.computed.dependencies) {
      depValues[dep] = Number(formValues[dep]) || 0;
    }
    const result = evaluateFormula(field.computed.formula, depValues);
    onChange(result);
  }, field.computed.dependencies.map(d => formValues[d]));

  return <Input value={formatValue(value, field.computed.format)} disabled />;
}
```

### 後端驗證

```typescript
// server/src/index.ts — POST/PUT /api/data/:table 時
// 讀取 view definition，找出 computed 欄位
// 用 formula engine 重算，覆蓋前端傳來的值
```

---

## 2.4 欄位類型擴充

### 新增欄位元件

| 元件 | 路徑 | 說明 |
|------|------|------|
| `CurrencyField` | `fields/CurrencyField.tsx` | 千分位格式化、小數點、$ 前綴 |
| `PhoneField` | `fields/PhoneField.tsx` | 電話格式化、點擊撥號 `tel:` |
| `EmailField` | `fields/EmailField.tsx` | Email 驗證、點擊 `mailto:` |
| `UrlField` | `fields/UrlField.tsx` | URL 驗證、可點擊連結 |
| `EnumField` | `fields/EnumField.tsx` | Badge 顯示（列表用彩色標籤） |

### 列表顯示格式化

```tsx
// TableView 的 CellValue 元件擴充
function CellValue({ value, field }: { value: unknown; field: ColumnDef }) {
  switch (field.type) {
    case 'currency':
      return <span>${Number(value).toLocaleString()}</span>;
    case 'phone':
      return <a href={`tel:${value}`} className="text-blue-600">{value}</a>;
    case 'email':
      return <a href={`mailto:${value}`} className="text-blue-600">{value}</a>;
    case 'url':
      return <a href={String(value)} target="_blank" className="text-blue-600 underline">連結</a>;
    case 'enum':
      return <Badge variant={getBadgeVariant(value)}>{value}</Badge>;
    case 'relation':
      return <span>{/* 已 JOIN 的顯示文字 */}</span>;
    // ...
  }
}
```

### 後端 GET /api/data/:table 加入 JOIN

```typescript
// 當表有 relation 欄位時，自動 LEFT JOIN 取得顯示值
// GET /api/data/orders
// → SELECT orders.*, customers.name as customer_id__display
//   FROM orders LEFT JOIN customers ON orders.customer_id = customers.id
```

---

## 新增檔案清單

```
packages/shared/src/formula.ts              # 公式引擎

packages/web/src/components/fields/
├── TextField.tsx
├── NumberField.tsx
├── SelectField.tsx
├── RelationField.tsx
├── DynamicSelectField.tsx
├── ComputedField.tsx
├── CurrencyField.tsx
├── PhoneField.tsx
├── EmailField.tsx
├── UrlField.tsx
├── EnumField.tsx
└── index.tsx                # renderField 路由

packages/server/src/engine/formula.ts       # 後端公式計算（引用 shared）
```

---

## Orchestrator System Prompt 更新

```
// 新增到 system prompt：
欄位類型對照：
- 一般文字 → TEXT
- 數字 → INTEGER 或 REAL
- 金額 → REAL，前端用 currency 顯示
- 電話 → TEXT，前端用 phone 顯示
- Email → TEXT，前端用 email 顯示
- 是/否 → BOOLEAN
- 日期 → DATE 或 DATETIME
- 關聯到其他表 → INTEGER + references

建立關聯欄位時：
1. Schema 用 INTEGER + references
2. UI 用 type: 'relation' + relation: { table, value_field, display_field }

建立計算欄位時：
1. Schema 用 REAL
2. UI 用 computed: { formula, dependencies }
```

---

## 驗收標準

- [x] 「訂單要關聯到客戶」→ 自動建外鍵 + 搜尋式下拉
- [x] 新增分類後，引用該分類的下拉選單自動包含新選項
- [x] 「小計 = 數量 × 單價」→ 輸入數量和單價時，小計即時計算
- [x] 金額欄位有千分位格式
- [x] 電話欄位可點擊撥號
- [x] 列表中的關聯欄位顯示名稱而非 ID
