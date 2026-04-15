import { getAllSchemas, getAllViews, getAllRules } from './db';
import { runSchemaAgent } from './agents/schema-agent';
import { runUiAgent } from './agents/ui-agent';
import { runQueryAgent } from './agents/query-agent';
import { runLogicAgent } from './agents/logic-agent';
import { runTestAgent } from './agents/test-agent';
import { writeData } from './tools/db-tools';
import { undoLast, undoById, undoSince, buildJournalContext } from './tools/journal-tools';
import { createProvider, getDefaultProviderName, getDefaultModel } from './ai';
import {
  createChatSession, updateSessionTitle, updateSessionStats,
  recordMessage, recordToolEvent, toolToAgent,
} from './tools/chat-logger';
import type { ToolDefinition } from './ai';
import type { ViewDefinition, LLMMessage, ToolResult, AIProvider as AIProviderName } from './types';

// ===== Column definition (shared between create_table and alter_table) =====

const COLUMN_DEF_SCHEMA = {
  type: 'object' as const,
  properties: {
    name: { type: 'string', description: '欄位名（英文小寫底線）' },
    type: {
      type: 'string',
      enum: ['TEXT', 'INTEGER', 'REAL', 'BOOLEAN', 'DATE', 'DATETIME'],
    },
    required: { type: 'boolean' },
    options: {
      type: 'array',
      items: { type: 'string' },
      description: 'enum 性質的欄位，列出所有允許值',
    },
    references: {
      type: 'object',
      description: '外鍵關聯。此欄位的值對應目標表的某個欄位（預設 id）',
      properties: {
        table: { type: 'string', description: '關聯目標表名' },
        column: { type: 'string', description: '關聯目標欄位，預設 id' },
      },
      required: ['table'],
    },
  },
  required: ['name', 'type'],
};

// ===== Form field schema (for manage_ui) =====

const FORM_FIELD_SCHEMA = {
  type: 'object' as const,
  properties: {
    key: { type: 'string', description: 'DB 欄位名' },
    label: { type: 'string', description: '欄位標題（繁體中文）' },
    type: {
      type: 'string',
      enum: [
        'text', 'number', 'select', 'boolean', 'date', 'textarea',
        'relation', 'currency', 'phone', 'email', 'url',
      ],
    },
    required: { type: 'boolean' },
    placeholder: { type: 'string' },
    options: {
      type: 'array',
      items: { type: 'string' },
      description: '靜態下拉選項（select 型別用）',
    },
    source: {
      type: 'object',
      description: '動態下拉來源（取代靜態 options，從另一張表即時載入選項）',
      properties: {
        table: { type: 'string' },
        value_field: { type: 'string', description: '存入表單的值欄位（如 name）' },
        display_field: { type: 'string', description: '下拉顯示的文字欄位' },
      },
      required: ['table', 'value_field', 'display_field'],
    },
    relation: {
      type: 'object',
      description: '關聯欄位定義（type 為 relation 時必填）。使用搜尋式下拉，存 value_field 值',
      properties: {
        table: { type: 'string', description: '關聯的表名' },
        value_field: { type: 'string', description: '存入的值欄位（通常是 id）' },
        display_field: { type: 'string', description: '下拉中顯示的欄位（如 name）' },
      },
      required: ['table', 'value_field', 'display_field'],
    },
    computed: {
      type: 'object',
      description: '計算欄位。公式用欄位名引用，如 "quantity * unit_price"。前後端都會計算',
      properties: {
        formula: { type: 'string', description: '計算公式，支援 + - * / 和括號' },
        dependencies: {
          type: 'array',
          items: { type: 'string' },
          description: '公式中引用的欄位名列表',
        },
        format: {
          type: 'string',
          enum: ['currency', 'number', 'percent'],
          description: '顯示格式',
        },
      },
      required: ['formula', 'dependencies'],
    },
  },
  required: ['key', 'label', 'type'],
};

const TOOLS: ToolDefinition[] = [
  {
    name: 'manage_schema',
    description: `建立或修改資料表結構。

建立新表後，必須接著呼叫 manage_ui 建立對應介面。

欄位類型對照：
- 一般文字 → TEXT
- 數字（整數）→ INTEGER
- 數字（小數/金額）→ REAL
- 是/否 → BOOLEAN
- 日期 → DATE
- 日期時間 → DATETIME
- 關聯到其他表 → INTEGER + references: { table: '目標表' }`,
    input_schema: {
      type: 'object' as const,
      properties: {
        action: {
          type: 'string',
          enum: ['create_table', 'alter_table', 'describe_tables'],
          description: '操作類型',
        },
        table_name: {
          type: 'string',
          description: '表名（英文小寫，底線分隔）',
        },
        columns: {
          type: 'array',
          description: 'create_table 時的欄位定義',
          items: COLUMN_DEF_SCHEMA,
        },
        changes: {
          type: 'array',
          description: 'alter_table 時的修改項目',
          items: {
            type: 'object',
            properties: {
              operation: { type: 'string', enum: ['add_column'] },
              column: COLUMN_DEF_SCHEMA,
            },
            required: ['operation', 'column'],
          },
        },
      },
      required: ['action'],
    },
  },
  {
    name: 'manage_ui',
    description: `建立或更新使用者介面。type 決定佈局：

type 選擇指南：
- table：一般列表管理（預設）
- master-detail：主檔 + 明細（如訂單 + 訂單明細），需設 detail_views
- dashboard：統計面板，需設 widgets（不需 columns/form）
- kanban：看板拖曳，需設 kanban（group_field, title_field）
- calendar：行事曆，需設 calendar（date_field, title_field）

欄位 type 決定前端渲染方式（table/master-detail 適用）：
- text/number/date/boolean/textarea：基本輸入
- select + options：靜態下拉
- relation + relation：關聯欄位（搜尋式下拉，存 id）
- currency：金額（千分位格式）
- computed：只需在 form.fields 設定，columns 用 number 型別即可

form.columns 控制表單欄數：
- 一般 table view 預設 1（不設或 1 均可）
- master-detail 主表欄位較多，建議設 2；欄位超過 8 個時用 3

使用者說「統計/看板/行事曆」時，直接建對應 type 的 view，不需要 table 作為前提。`,
    input_schema: {
      type: 'object' as const,
      properties: {
        action: {
          type: 'string',
          enum: ['create_view', 'update_view'],
        },
        view: {
          type: 'object',
          description: 'View 定義',
          properties: {
            id: { type: 'string', description: '唯一 ID，通常等於 table_name' },
            name: { type: 'string', description: '顯示名稱（繁體中文）' },
            table_name: { type: 'string' },
            type: { type: 'string', enum: ['table', 'master-detail', 'dashboard', 'kanban', 'calendar'] },
            columns: {
              type: 'array',
              description: '列表欄位定義',
              items: {
                type: 'object',
                properties: {
                  key: { type: 'string', description: 'DB 欄位名' },
                  label: { type: 'string', description: '欄位標題（繁體中文）' },
                  type: {
                    type: 'string',
                    enum: [
                      'text', 'number', 'select', 'boolean', 'date',
                      'relation', 'currency', 'phone', 'email', 'url', 'enum',
                    ],
                  },
                  sortable: { type: 'boolean' },
                  relation: {
                    type: 'object',
                    description: 'relation 型別的列表顯示設定',
                    properties: {
                      table: { type: 'string' },
                      display_field: { type: 'string', description: '列表顯示關聯表的哪個欄位' },
                    },
                    required: ['table', 'display_field'],
                  },
                },
                required: ['key', 'label', 'type'],
              },
            },
            form: {
              type: 'object',
              properties: {
                columns: {
                  type: 'number',
                  enum: [1, 2, 3],
                  description: '表單欄位欄數（預設 1；master-detail 主表建議 2，欄位多時用 3）',
                },
                fields: {
                  type: 'array',
                  description: '表單欄位定義',
                  items: FORM_FIELD_SCHEMA,
                },
              },
              required: ['fields'],
            },
            actions: {
              type: 'array',
              items: { type: 'string', enum: ['create', 'edit', 'delete'] },
            },
          },
          detail_views: {
              type: 'array',
              description: 'master-detail 型別時的明細定義',
              items: {
                type: 'object',
                properties: {
                  table_name: { type: 'string', description: '明細表名' },
                  foreign_key: { type: 'string', description: '明細表中指向主表的外鍵欄位名' },
                  tab_label: { type: 'string', description: 'Tab 標籤名（繁體中文）' },
                  view: {
                    type: 'object',
                    description: '明細的 view 定義（type 必須是 table）',
                    properties: {
                      id: { type: 'string' },
                      name: { type: 'string' },
                      table_name: { type: 'string' },
                      type: { type: 'string', enum: ['table'] },
                      columns: { type: 'array', items: { type: 'object' } },
                      form: { type: 'object' },
                      actions: { type: 'array', items: { type: 'string' } },
                    },
                    required: ['id', 'name', 'table_name', 'type', 'columns', 'form', 'actions'],
                  },
                },
                required: ['table_name', 'foreign_key', 'tab_label', 'view'],
              },
            },
          widgets: {
            type: 'array',
            description: 'dashboard 型別的 widget 列表',
            items: {
              type: 'object',
              properties: {
                id: { type: 'string' },
                type: { type: 'string', enum: ['stat_card', 'bar_chart', 'line_chart', 'pie_chart', 'mini_table'] },
                title: { type: 'string', description: 'Widget 標題（繁體中文）' },
                query: { type: 'string', description: 'SELECT SQL（必須是 SELECT）' },
                size: { type: 'string', enum: ['sm', 'md', 'lg', 'full'] },
                position: {
                  type: 'object',
                  properties: { row: { type: 'number' }, col: { type: 'number' } },
                  required: ['row', 'col'],
                },
                config: {
                  type: 'object',
                  description: '圖表設定：x_key, y_key, label_key, value_key, color',
                },
              },
              required: ['id', 'type', 'title', 'query', 'size', 'position'],
            },
          },
          kanban: {
            type: 'object',
            description: 'kanban 型別的設定',
            properties: {
              group_field: { type: 'string' },
              title_field: { type: 'string' },
              description_field: { type: 'string' },
            },
            required: ['group_field', 'title_field'],
          },
          calendar: {
            type: 'object',
            description: 'calendar 型別的設定',
            properties: {
              date_field: { type: 'string' },
              title_field: { type: 'string' },
              color_field: { type: 'string' },
            },
            required: ['date_field', 'title_field'],
          },
          required: ['id', 'name', 'table_name', 'type'],
        },
      },
      required: ['action', 'view'],
    },
  },
  {
    name: 'query_data',
    description: '查詢資料、回答統計問題。只能執行 SELECT 查詢。',
    input_schema: {
      type: 'object' as const,
      properties: {
        sql: { type: 'string', description: 'SELECT SQL 語句' },
        explanation: { type: 'string', description: '這個查詢在做什麼' },
      },
      required: ['sql', 'explanation'],
    },
  },
  {
    name: 'write_data',
    description: `對使用者資料表執行新增、更新或刪除。不可操作系統表（_zenku_ 前綴）。

操作說明：
- insert：新增一筆記錄，data 填入欄位值
- update：更新符合 where 條件的記錄，data 填更新值，where 為篩選條件（必填，防止全表誤改）
- delete：刪除符合 where 條件的記錄，where 為篩選條件（必填，防止全表誤刪）

注意：update/delete 的 where 是必填的安全保護，不可省略。`,
    input_schema: {
      type: 'object' as const,
      properties: {
        operation: {
          type: 'string',
          enum: ['insert', 'update', 'delete'],
          description: '操作類型',
        },
        table: {
          type: 'string',
          description: '目標表名（英文小寫底線，不可為系統表）',
        },
        data: {
          type: 'object',
          description: 'insert / update 的欄位值（key 為欄位名，value 為要寫入的值）',
        },
        where: {
          type: 'object',
          description: 'update / delete 的篩選條件（key 為欄位名，value 為比對值）。update/delete 時必填',
        },
      },
      required: ['operation', 'table'],
    },
  },
  {
    name: 'manage_rules',
    description: `建立或修改業務規則（自動化流程、驗證）。

規則在 CRUD 操作前後自動執行：
- before_insert / before_update / before_delete：可攔截、修改資料、驗證
- after_insert / after_update / after_delete：可觸發副作用（webhook、建記錄）

Action 類型：
- set_field：設定欄位值（value 可以是公式如 "total * 0.9"）
- validate：驗證規則（條件成立時拒絕操作，回傳 message）
- create_record：在另一張表新增一筆記錄（INSERT）
- update_record：更新另一張表的現有記錄（UPDATE），適合 1:1 關係
- update_related_records：透過中間明細表批次更新目標表（適合 1:多，如採購單→明細→庫存）
- webhook：呼叫外部 URL
- notify：記錄通知

Condition operator：eq, neq, gt, lt, gte, lte, contains, changed, was_eq, was_neq
- was_eq：觸發前舊值等於 value（適合「狀態從 X 變更」的 after_update 規則）
- was_neq：觸發前舊值不等於 value（例如：前一個狀態不是草稿才觸發）

Condition field 支援 FK 路徑（跨表條件）：
- 若要在 order_items 的規則中檢查客戶等級，condition.field 填 "order_id.customer_id.tier"
- 引擎會自動沿 FK 查詢：order_items.order_id → orders → orders.customer_id → customers → customers.tier`,
    input_schema: {
      type: 'object' as const,
      properties: {
        action: {
          type: 'string',
          enum: ['create_rule', 'update_rule', 'delete_rule', 'list_rules'],
        },
        rule_id: { type: 'string', description: 'update_rule / delete_rule 時的規則 ID' },
        table_name: { type: 'string', description: 'list_rules 時篩選特定表' },
        rule: {
          type: 'object',
          description: '規則定義（create_rule / update_rule 時必填）',
          properties: {
            name: { type: 'string', description: '規則名稱（繁體中文）' },
            description: { type: 'string' },
            table_name: { type: 'string', description: '作用的表名' },
            trigger_type: {
              type: 'string',
              enum: ['before_insert', 'after_insert', 'before_update', 'after_update', 'before_delete', 'after_delete'],
            },
            condition: {
              type: 'object',
              description: '觸發條件（不設 = 永遠觸發）。field 支援 FK 路徑：如 order_items 要檢查客戶等級，寫 "order_id.customer_id.tier"（沿 FK 逐層查）',
              properties: {
                field: {
                  type: 'string',
                  description: '欄位名。可用 FK 點路徑跨表，如 "order_id.customer_id.tier"',
                },
                operator: { type: 'string', enum: ['eq', 'neq', 'gt', 'lt', 'gte', 'lte', 'contains', 'changed', 'was_eq', 'was_neq'] },
                value: {},
              },
              required: ['field', 'operator'],
            },
            actions: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  type: { type: 'string', enum: ['set_field', 'validate', 'create_record', 'update_record', 'update_related_records', 'webhook', 'notify'] },
                  field: { type: 'string', description: 'set_field 的目標欄位' },
                  value: { type: 'string', description: 'set_field 的值或公式' },
                  message: { type: 'string', description: 'validate 的錯誤訊息' },
                  target_table: { type: 'string', description: 'create_record / update_record / update_related_records 的目標表' },
                  record_data: { type: 'object', description: '欄位對應（欄位名 → 表達式）。update_related_records 中，明細欄位直接引用，目標表現值加 __old_ 前綴，如 "__old_quantity + quantity"' },
                  where: { type: 'object', description: 'update_record / update_related_records：定位目標記錄的條件。key 為目標表欄位，value 為來源（或明細）表達式。例：{ product_id: "product_id" }' },
                  via_table: { type: 'string', description: 'update_related_records 專用：中間明細表（如 purchase_order_items）' },
                  via_foreign_key: { type: 'string', description: 'update_related_records 專用：明細表中指向來源表的 FK 欄位（如 purchase_order_id）' },
                  url: { type: 'string', description: 'webhook URL' },
                  method: { type: 'string', description: 'webhook HTTP 方法，預設 POST' },
                  text: { type: 'string', description: 'notify 的文字' },
                },
                required: ['type'],
              },
            },
            priority: { type: 'number', description: '優先序（數字越小越先執行），預設 0' },
          },
          required: ['name', 'table_name', 'trigger_type', 'actions'],
        },
      },
      required: ['action'],
    },
  },
  {
    name: 'assess_impact',
    description: `評估破壞性 schema 變更的影響。在執行 drop_column、rename_column、change_type、drop_table 前必須先呼叫此工具。
回報受影響的介面、規則、資料筆數及外鍵依賴。`,
    input_schema: {
      type: 'object' as const,
      properties: {
        table_name: { type: 'string', description: '要變更的表名' },
        change_type: {
          type: 'string',
          enum: ['drop_column', 'rename_column', 'change_type', 'drop_table'],
        },
        details: {
          type: 'object',
          properties: {
            column_name: { type: 'string' },
            new_name: { type: 'string' },
            new_type: { type: 'string' },
          },
        },
      },
      required: ['table_name', 'change_type'],
    },
  },
  {
    name: 'undo_action',
    description: `復原先前的操作。使用者說「復原」「取消剛才」「回到之前的版本」時呼叫。
- target=last：復原最近一筆可逆操作
- target=by_id：復原指定 journal id 的操作
- target=by_time：復原指定時間之後的所有操作（批次回滾）`,
    input_schema: {
      type: 'object' as const,
      properties: {
        target: {
          type: 'string',
          enum: ['last', 'by_id', 'by_time'],
        },
        journal_id: { type: 'number', description: 'target=by_id 時的 journal 記錄 ID' },
        since: { type: 'string', description: 'target=by_time 時的 ISO timestamp（如 "2026-04-14 09:00:00"）' },
      },
      required: ['target'],
    },
  },
];

function buildSystemPrompt(): string {
  const schemas = getAllSchemas();
  const views = getAllViews();

  const schemaStr = Object.keys(schemas).length > 0
    ? Object.entries(schemas).map(([table, cols]) =>
        `表 ${table}：${cols.map(c => `${c.name}(${c.type})`).join(', ')}`
      ).join('\n')
    : '（目前沒有任何資料表）';

  const viewStr = views.length > 0
    ? views.map(v => `- ${v.name}（對應表：${v.table_name}）`).join('\n')
    : '（目前沒有任何介面）';

  return `你是 Zenku 的 Orchestrator。使用者透過對話描述需求，你負責建構應用。

你有以下工具：
- manage_schema：建立或修改資料表結構
- manage_ui：建立或更新使用者介面（列表＋表單）
- query_data：查詢資料、回答統計問題（SELECT only）
- write_data：新增、更新或刪除使用者資料表的記錄（insert / update / delete，不可操作系統表）
- manage_rules：建立或修改業務規則（自動化流程、驗證、觸發器）
- assess_impact：評估破壞性 schema 變更的影響（變更前必須先呼叫）

重要規則：
1. 建立新資料類型：先 manage_schema（create_table），再 manage_ui（create_view）
2. 修改資料結構：先 manage_schema（alter_table），再 manage_ui（update_view）
3. 統計問題：呼叫 query_data
4. 表名和欄位名用英文小寫底線
5. 所有回應使用繁體中文
6. View 的 id 與 table_name 保持一致

建立關聯欄位時（如「訂單關聯客戶」）：
1. manage_schema：欄位用 INTEGER + references: { table: 'customers' }
2. manage_ui columns：type 用 relation，relation: { table: 'customers', display_field: 'name' }
3. manage_ui form.fields：type 用 relation，relation: { table: 'customers', value_field: 'id', display_field: 'name' }

建立動態下拉時（如「分類從分類表載入」）：
1. 確保來源表已存在
2. form.fields：type 用 select，加上 source: { table: 'categories', value_field: 'name', display_field: 'name' }

建立一對多關係（如「訂單 + 訂單明細」）時：
1. manage_schema → 建主表（如 orders）
2. manage_schema → 建明細表（如 order_items），含外鍵：INTEGER + references: { table: 'orders' }
3. manage_ui → 建 master-detail view，type: 'master-detail'，detail_views 定義明細
   - detail_views[0].foreign_key：明細表中指向主表的欄位名（如 'order_id'）
   - detail_views[0].view.type 必須是 'table'
   - 明細的 form.fields 不需包含外鍵欄位（系統自動注入）

建立計算欄位時（如「小計 = 數量 × 單價」）：
1. manage_schema：欄位用 REAL
2. manage_ui form.fields：加 computed: { formula: 'quantity * unit_price', dependencies: ['quantity', 'unit_price'], format: 'currency' }
3. manage_ui columns：type 用 currency 或 number

建立視覺化介面：
- 統計面板（「我想看 XXX 統計」）→ manage_ui，type: 'dashboard'，widgets 陣列，每個 widget 有 SELECT SQL
  - stat_card：單一數字，query 回傳 { value: N }
  - bar_chart / line_chart：query 回傳 [{ label, value }]，設 config.x_key / y_key
  - pie_chart：query 回傳 [{ label, value }]，設 config.label_key / value_key
  - dashboard 不需要 columns / form / actions
- 看板（「用看板管理」）→ manage_ui，type: 'kanban'，設 kanban: { group_field, title_field }
  - group_field 應是 select 型別且有 options（如 status）
  - 仍需定義 columns 和 form（切回列表模式時使用）
- 行事曆（「行事曆/排程」）→ manage_ui，type: 'calendar'，設 calendar: { date_field, title_field }
  - 仍需定義 columns 和 form

建立業務規則時（如「VIP 客戶打 9 折」）：
1. manage_rules → create_rule
2. trigger_type 決定時機：before_insert（寫入前修改/驗證）、after_insert（寫入後觸發副作用）
3. condition.field 支援 FK 點路徑跨表：如 order_items 要檢查客戶等級，寫 "order_id.customer_id.tier"
4. actions 決定動作：
   - set_field：修改來源記錄的欄位值
   - validate：拒絕操作
   - create_record：在另一張表新增記錄（INSERT）
   - update_record：更新另一張表的現有記錄（UPDATE）。需指定 where（定位條件）和 record_data（更新值）
   - update_related_records：透過中間表（如明細表）批次更新目標表的多筆記錄
     適用場景：採購到貨更新庫存（1 張採購單有多筆明細，每筆明細更新對應庫存）
     - via_table：中間明細表（如 purchase_order_items）
     - via_foreign_key：明細表中指向來源表的 FK（如 purchase_order_id）
     - target_table：要更新的表（如 inventory）
     - where：定位目標記錄的條件（key=目標表欄位, value=明細表欄位表達式）
       如 { product_id: "product_id", warehouse_id: "warehouse_id" }
     - record_data：更新表達式，明細表欄位直接引用，目標表現有值加 __old_ 前綴
       如 { quantity: "__old_quantity + quantity" }（__old_quantity=庫存現況, quantity=採購數量）
   - webhook：呼叫外部 URL

破壞性 schema 變更（drop_column, rename_column, change_type, drop_table）：
1. 必須先呼叫 assess_impact 評估影響
2. 把影響報告告知使用者
3. 使用者確認後才執行 manage_schema

欄位類型指引：
- 金額 → schema: REAL，ui type: currency
- 電話 → schema: TEXT，ui type: phone
- Email → schema: TEXT，ui type: email
- 網址 → schema: TEXT，ui type: url
- 狀態/分類（固定選項）→ schema: TEXT，ui type: select + options
- 狀態/分類（動態載入）→ schema: TEXT，ui type: select + source

目前資料庫：
${schemaStr}

目前介面：
${viewStr}

目前規則：
${(() => {
  const rules = getAllRules();
  return rules.length > 0
    ? rules.map(r => `- ${r.name}（${r.trigger_type} on ${r.table_name}）${r.enabled ? '' : '（停用）'}`).join('\n')
    : '（目前沒有任何規則）';
})()}

最近操作紀錄（供復原參考）：
${buildJournalContext()}`;
}

// ===== Tool dispatch =====

type UserRole = 'admin' | 'builder' | 'user';

function getToolsForRole(role: UserRole): ToolDefinition[] {
  if (role === 'user') {
    return TOOLS.filter(t => t.name === 'query_data' || t.name === 'write_data');
  }
  if (role === 'builder') {
    return TOOLS.filter(t => t.name !== 'undo_action');
  }
  return TOOLS;
}

function executeTool(
  toolName: string,
  toolInput: Record<string, unknown>,
  userMessage: string
): { success: boolean; message: string; data?: unknown } {
  if (toolName === 'manage_schema') {
    return runSchemaAgent(toolInput as unknown as Parameters<typeof runSchemaAgent>[0], userMessage);
  } else if (toolName === 'manage_ui') {
    return runUiAgent(
      toolInput as { action: 'create_view' | 'update_view'; view: ViewDefinition },
      userMessage
    );
  } else if (toolName === 'query_data') {
    return runQueryAgent(toolInput as { sql: string; explanation: string });
  } else if (toolName === 'write_data') {
    return writeData(
      toolInput as { operation: 'insert' | 'update' | 'delete'; table: string; data?: Record<string, string | number | boolean | null>; where?: Record<string, string | number | boolean | null> },
      userMessage,
    );
  } else if (toolName === 'manage_rules') {
    return runLogicAgent(
      toolInput as unknown as Parameters<typeof runLogicAgent>[0],
      userMessage
    );
  } else if (toolName === 'assess_impact') {
    return runTestAgent(
      toolInput as unknown as Parameters<typeof runTestAgent>[0]
    );
  } else if (toolName === 'undo_action') {
    const { target, journal_id, since } = toolInput as { target: string; journal_id?: number; since?: string };
    if (target === 'last') return undoLast(userMessage);
    if (target === 'by_id' && journal_id != null) return undoById(journal_id, userMessage);
    if (target === 'by_time' && since) return undoSince(since, userMessage);
    return { success: false, message: '無效的 undo 參數' };
  } else {
    return { success: false, message: `未知工具：${toolName}` };
  }
}

// ===== Main chat loop =====

export interface ChatOptions {
  existingSessionId?: string;
  provider?: AIProviderName;
  model?: string;
  userId?: string;
}

export async function* chat(
  userMessage: string,
  history: { role: 'user' | 'assistant'; content: string }[],
  userRole: UserRole = 'admin',
  options?: ChatOptions
): AsyncGenerator<string> {
  const providerName = options?.provider ?? getDefaultProviderName();
  const model = options?.model ?? getDefaultModel(providerName);
  const userId = options?.userId;
  const provider = createProvider(providerName);
  const tools = getToolsForRole(userRole);

  // Create or reuse chat session
  const sessionId = options?.existingSessionId
    ?? (userId ? createChatSession(userId, providerName, model, userMessage.slice(0, 80)) : null);

  if (sessionId && userId) {
    recordMessage({ session_id: sessionId, user_id: userId, role: 'user', content: userMessage });
  }

  // Build initial messages from history
  const currentMessages: LLMMessage[] = [
    ...history.map(h => ({ role: h.role as 'user' | 'assistant', content: h.content })),
    { role: 'user' as const, content: userMessage },
  ];

  let continueLoop = true;

  while (continueLoop) {
    const response = await provider.chat({
      model,
      system: buildSystemPrompt(),
      messages: currentMessages,
      tools,
      maxTokens: 4096,
    });

    // Yield text content
    if (response.content) {
      yield JSON.stringify({ type: 'text', content: response.content }) + '\n';
    }

    // Yield usage info after each LLM call
    yield JSON.stringify({ type: 'usage', usage: response.usage, latency_ms: response.latency_ms }) + '\n';

    if (response.stop_reason === 'tool_use' && response.tool_calls.length > 0) {
      // Log the assistant turn before processing tools
      const assistantMsgId = sessionId && userId
        ? recordMessage({
            session_id: sessionId,
            user_id: userId,
            role: 'assistant',
            content: response.content,
            provider: providerName,
            model,
            input_tokens: response.usage.input_tokens,
            output_tokens: response.usage.output_tokens,
            thinking_tokens: response.usage.thinking_tokens ?? 0,
            latency_ms: response.latency_ms,
          })
        : null;

      if (sessionId) updateSessionStats(sessionId, response.usage, model);

      const toolResults: ToolResult[] = [];

      for (const tc of response.tool_calls) {
        const agent = toolToAgent(tc.name);
        yield JSON.stringify({ type: 'tool_start', tool: tc.name, agent }) + '\n';

        const toolStart = Date.now();
        const startedAt = new Date().toISOString();
        let result;
        try {
          result = executeTool(tc.name, tc.input, userMessage);
        } catch (err) {
          result = { success: false, message: String(err) };
        }
        const finishedAt = new Date().toISOString();
        const toolLatency = Date.now() - toolStart;

        yield JSON.stringify({ type: 'tool_result', tool: tc.name, agent, result }) + '\n';

        if (assistantMsgId && sessionId) {
          recordToolEvent({
            message_id: assistantMsgId,
            session_id: sessionId,
            tool_name: tc.name,
            tool_input: tc.input,
            tool_output: result,
            started_at: startedAt,
            finished_at: finishedAt,
            latency_ms: toolLatency,
          });
        }

        toolResults.push({
          tool_use_id: tc.id,
          content: JSON.stringify(result),
        });
      }

      // Append assistant response + tool results to the conversation
      currentMessages.push({
        role: 'assistant',
        content: response.content,
        tool_calls: response.tool_calls,
      });
      currentMessages.push({
        role: 'user',
        content: '',
        tool_results: toolResults,
      });
    } else {
      // Final assistant turn — log it
      if (sessionId && userId) {
        recordMessage({
          session_id: sessionId,
          user_id: userId,
          role: 'assistant',
          content: response.content,
          provider: providerName,
          model,
          input_tokens: response.usage.input_tokens,
          output_tokens: response.usage.output_tokens,
          thinking_tokens: response.usage.thinking_tokens ?? 0,
          latency_ms: response.latency_ms,
        });
        updateSessionStats(sessionId, response.usage, model);
        updateSessionTitle(sessionId, userMessage.slice(0, 80));
      }
      continueLoop = false;
    }
  }

  // Yield done with session info
  yield JSON.stringify({ type: 'done', provider: providerName, model, session_id: sessionId }) + '\n';
}
