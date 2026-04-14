import Anthropic from '@anthropic-ai/sdk';
import { getAllSchemas, getAllViews } from './db';
import { runSchemaAgent } from './agents/schema-agent';
import { runUiAgent } from './agents/ui-agent';
import { runQueryAgent } from './agents/query-agent';
import type { ViewDefinition } from './types';

let _client: Anthropic | null = null;
function getClient(): Anthropic {
  if (!_client) _client = new Anthropic();
  return _client;
}

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

const TOOLS: Anthropic.Tool[] = [
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
    description: `建立或更新使用者介面（列表 + 表單）。在 manage_schema 後呼叫，保持介面與資料結構同步。

欄位 type 決定前端渲染方式：
- text/number/date/boolean/textarea：基本輸入
- select + options：靜態下拉
- select + source：動態下拉（從指定表載入）
- relation + relation：關聯欄位（搜尋式下拉，存 id）
- currency：金額（千分位格式）
- phone/email/url：特殊文字（可點擊）
- computed：只需在 form.fields 設定，columns 用 number 型別即可`,
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
            type: { type: 'string', enum: ['table', 'master-detail'] },
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
          required: ['id', 'name', 'table_name', 'type', 'columns', 'form', 'actions'],
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
- query_data：查詢資料、回答統計問題

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
${viewStr}`;
}

export async function* chat(
  userMessage: string,
  history: { role: 'user' | 'assistant'; content: string }[]
): AsyncGenerator<string> {
  const messages: Anthropic.MessageParam[] = [
    ...history.map(h => ({ role: h.role as 'user' | 'assistant', content: h.content })),
    { role: 'user', content: userMessage },
  ];

  let continueLoop = true;
  const currentMessages = [...messages];

  while (continueLoop) {
    const response = await getClient().messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 4096,
      system: buildSystemPrompt(),
      tools: TOOLS,
      messages: currentMessages,
    });

    for (const block of response.content) {
      if (block.type === 'text' && block.text) {
        yield JSON.stringify({ type: 'text', content: block.text }) + '\n';
      }
    }

    if (response.stop_reason === 'tool_use') {
      const toolResults: Anthropic.ToolResultBlockParam[] = [];

      for (const block of response.content) {
        if (block.type !== 'tool_use') continue;

        const toolName = block.name;
        const toolInput = block.input as Record<string, unknown>;

        yield JSON.stringify({ type: 'tool_start', tool: toolName }) + '\n';

        let result;
        try {
          if (toolName === 'manage_schema') {
            result = runSchemaAgent(toolInput as unknown as Parameters<typeof runSchemaAgent>[0], userMessage);
          } else if (toolName === 'manage_ui') {
            result = runUiAgent(
              toolInput as { action: 'create_view' | 'update_view'; view: ViewDefinition },
              userMessage
            );
          } else if (toolName === 'query_data') {
            result = runQueryAgent(toolInput as { sql: string; explanation: string });
          } else {
            result = { success: false, message: `未知工具：${toolName}` };
          }
        } catch (err) {
          result = { success: false, message: String(err) };
        }

        yield JSON.stringify({ type: 'tool_result', tool: toolName, result }) + '\n';

        toolResults.push({
          type: 'tool_result',
          tool_use_id: block.id,
          content: JSON.stringify(result),
        });
      }

      currentMessages.push({ role: 'assistant', content: response.content });
      currentMessages.push({ role: 'user', content: toolResults });
    } else {
      continueLoop = false;
    }
  }

  yield JSON.stringify({ type: 'done' }) + '\n';
}
