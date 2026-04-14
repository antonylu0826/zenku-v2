# Phase 0：共用型別系統

> **目標：** 建立 `@zenku/shared` package，定義整個系統的核心型別。
> **所有後續 Phase 都依賴這套型別，必須最先完成。**
> **建議模型：Opus**（型別定義要精準，影響全域）

---

## 工作範圍

1. 建立 `packages/shared` workspace package
2. 定義所有核心型別
3. 將 `packages/server/src/types.ts` 和 `packages/web/src/types.ts` 改為引用 `@zenku/shared`

---

## 檔案結構

```
packages/shared/
├── src/
│   ├── types/
│   │   ├── field.ts          # 欄位定義（最核心）
│   │   ├── view.ts           # View 定義 + 所有 Block 型別
│   │   ├── column.ts         # 列表欄位定義
│   │   ├── agent.ts          # Agent 結果、權限、名稱
│   │   ├── rule.ts           # 業務規則定義
│   │   ├── journal.ts        # Design Journal
│   │   ├── chat.ts           # 對話訊息、SSE、對話歷程
│   │   ├── ai-provider.ts    # 多 AI provider 型別
│   │   └── auth.ts           # 使用者、角色
│   ├── formula.ts            # 公式計算引擎（前後端共用）
│   └── index.ts              # 統一匯出
├── package.json
└── tsconfig.json
```

---

## 型別定義

### field.ts — 欄位定義

```typescript
export type FieldType =
  // 基礎
  | 'text' | 'number' | 'select' | 'boolean' | 'date' | 'textarea'
  // Phase 2
  | 'relation' | 'currency' | 'phone' | 'email' | 'url' | 'enum' | 'richtext'
  // Phase 4
  | 'image' | 'file';

export interface FieldDef {
  key: string;
  label: string;
  type: FieldType;
  required?: boolean;
  placeholder?: string;

  // select：靜態選項
  options?: string[];

  // select：動態來源（取代 options）
  source?: {
    table: string;
    value_field: string;
    display_field: string;
  };

  // relation：關聯到其他表
  relation?: {
    table: string;
    value_field: string;       // 通常 'id'
    display_field: string;     // 顯示用欄位，如 'name'
    display_format?: string;   // 複合格式 '{name} ({phone})'
  };

  // computed：公式計算
  computed?: {
    formula: string;           // 'quantity * unit_price'
    dependencies: string[];    // ['quantity', 'unit_price']
    format?: 'currency' | 'number' | 'percent';
  };

  // 顯示控制
  hidden_in_table?: boolean;
  hidden_in_form?: boolean;
  width?: number;              // 列表欄寬 px

  // 驗證
  validation?: {
    min?: number;
    max?: number;
    pattern?: string;
    message?: string;
  };
}
```

### column.ts — 列表欄定義

```typescript
import type { FieldType } from './field';

export interface ColumnDef {
  key: string;
  label: string;
  type: FieldType;
  sortable?: boolean;
  width?: number;
  relation?: {
    table: string;
    display_field: string;
  };
}
```

### view.ts — View 定義

```typescript
import type { ColumnDef } from './column';
import type { FieldDef } from './field';

export type ViewType = 'table' | 'master-detail' | 'dashboard' | 'kanban' | 'calendar';

export interface ViewDefinition {
  id: string;
  name: string;
  table_name: string;
  type: ViewType;
  icon?: string;
  columns: ColumnDef[];
  form: { fields: FieldDef[] };
  actions: ('create' | 'edit' | 'delete' | 'export')[];

  // master-detail
  detail_views?: DetailViewDef[];

  // dashboard
  widgets?: DashboardWidget[];

  // kanban
  kanban?: {
    group_field: string;
    title_field: string;
    description_field?: string;
  };

  // calendar
  calendar?: {
    date_field: string;
    title_field: string;
    color_field?: string;
  };

  default_sort?: { field: string; direction: 'asc' | 'desc' };
  default_filters?: Filter[];
}

export interface DetailViewDef {
  table_name: string;
  foreign_key: string;
  tab_label: string;
  view: ViewDefinition;
}

export interface DashboardWidget {
  id: string;
  type: 'stat_card' | 'bar_chart' | 'line_chart' | 'pie_chart' | 'mini_table';
  title: string;
  query: string;
  size: 'sm' | 'md' | 'lg' | 'full';
  position: { row: number; col: number; rowSpan?: number; colSpan?: number };
  config?: Record<string, unknown>;
}

export interface Filter {
  field: string;
  operator: 'eq' | 'neq' | 'gt' | 'lt' | 'gte' | 'lte' | 'contains' | 'in';
  value: unknown;
}
```

### agent.ts — Agent 型別

```typescript
export type AgentName = 'orchestrator' | 'schema' | 'ui' | 'query' | 'file' | 'logic' | 'test';

export interface AgentResult {
  success: boolean;
  message: string;
  data?: unknown;
}

export type UserRole = 'admin' | 'builder' | 'user';

export interface AgentPermission {
  agent: AgentName;
  db: ('ddl' | 'select' | 'insert' | 'update' | 'delete' | 'none')[];
  view: 'read' | 'readwrite' | 'none';
  file: 'read' | 'readwrite' | 'none';
  allowed_by_roles: UserRole[];
}

export const AGENT_PERMISSIONS: AgentPermission[] = [
  { agent: 'orchestrator', db: ['none'],    view: 'read',      file: 'none',      allowed_by_roles: ['admin', 'builder', 'user'] },
  { agent: 'schema',       db: ['ddl'],     view: 'none',      file: 'none',      allowed_by_roles: ['admin', 'builder'] },
  { agent: 'ui',           db: ['none'],    view: 'readwrite', file: 'none',      allowed_by_roles: ['admin', 'builder'] },
  { agent: 'query',        db: ['select'],  view: 'none',      file: 'none',      allowed_by_roles: ['admin', 'builder', 'user'] },
  { agent: 'file',         db: ['insert'],  view: 'none',      file: 'readwrite', allowed_by_roles: ['admin', 'builder', 'user'] },
  { agent: 'logic',        db: ['select', 'insert', 'update'], view: 'none', file: 'none', allowed_by_roles: ['admin', 'builder'] },
  { agent: 'test',         db: ['select'],  view: 'read',      file: 'none',      allowed_by_roles: ['admin', 'builder'] },
];
```

### ai-provider.ts — 多 AI Provider

```typescript
export type AIProvider = 'claude' | 'openai' | 'gemini';

export interface AIProviderConfig {
  provider: AIProvider;
  model: string;
  apiKey: string;        // 從 env 讀取
  baseUrl?: string;      // 自訂 endpoint
  maxTokens?: number;
  temperature?: number;
}

// 每個 provider 的模型選項
export const AI_MODELS: Record<AIProvider, string[]> = {
  claude: ['claude-sonnet-4-6', 'claude-haiku-4-5-20251001', 'claude-opus-4-6'],
  openai: ['gpt-4o', 'gpt-4o-mini', 'o3-mini'],
  gemini: ['gemini-2.5-flash', 'gemini-2.5-pro'],
};

// tool_use 呼叫的標準化介面（跨 provider）
export interface ToolCall {
  id: string;
  name: string;
  input: Record<string, unknown>;
}

export interface ToolResult {
  tool_use_id: string;
  content: string;
}

export interface LLMMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
  tool_calls?: ToolCall[];
  tool_results?: ToolResult[];
}

export interface LLMResponse {
  content: string;
  tool_calls: ToolCall[];
  stop_reason: 'end_turn' | 'tool_use';
  usage: TokenUsage;
  thinking?: string;           // 思考鏈（如 Claude extended thinking）
  latency_ms: number;
}

export interface TokenUsage {
  input_tokens: number;
  output_tokens: number;
  cache_read_tokens?: number;
  cache_write_tokens?: number;
  thinking_tokens?: number;
}
```

### chat.ts — 對話與歷程

```typescript
import type { AIProvider, TokenUsage, ToolCall } from './ai-provider';
import type { AgentName } from './agent';

// ===== 對話 Session =====
export interface ChatSession {
  id: string;
  user_id: string;
  title: string;                // 自動產生或使用者命名
  provider: AIProvider;
  model: string;
  created_at: string;
  updated_at: string;
  total_input_tokens: number;
  total_output_tokens: number;
  total_cost_usd: number;       // 估算花費
  message_count: number;
}

// ===== 單則訊息 =====
export interface ChatMessageRecord {
  id: string;
  session_id: string;
  user_id: string;
  role: 'user' | 'assistant';
  content: string;
  created_at: string;

  // AI 回應的附加資訊
  provider?: AIProvider;
  model?: string;
  usage?: TokenUsage;
  latency_ms?: number;
  thinking?: string;            // 思考鏈原文

  // 工具使用記錄
  tool_events?: ToolEventRecord[];
}

// ===== 工具使用記錄 =====
export interface ToolEventRecord {
  id: string;
  message_id: string;
  agent: AgentName;
  tool_name: string;
  tool_input: Record<string, unknown>;
  tool_output: {
    success: boolean;
    message: string;
    data?: unknown;
  };
  started_at: string;
  finished_at: string;
  latency_ms: number;
}

// ===== 管理者統計 =====
export interface UsageStats {
  period: string;               // '2026-04', '2026-04-12'
  total_sessions: number;
  total_messages: number;
  total_input_tokens: number;
  total_output_tokens: number;
  total_cost_usd: number;
  by_provider: Record<string, {
    sessions: number;
    messages: number;
    tokens: number;
    cost_usd: number;
  }>;
  by_user: Record<string, {
    sessions: number;
    messages: number;
    tokens: number;
    cost_usd: number;
  }>;
  by_agent: Record<string, {
    calls: number;
    avg_latency_ms: number;
    error_count: number;
  }>;
}

// ===== SSE 串流 chunk =====
export type SSEChunk =
  | { type: 'text'; content: string }
  | { type: 'thinking'; content: string }
  | { type: 'tool_start'; tool: string; agent: AgentName }
  | { type: 'tool_result'; tool: string; agent: AgentName; result: { success: boolean; message: string; data?: unknown } }
  | { type: 'usage'; usage: TokenUsage; latency_ms: number }
  | { type: 'done' }
  | { type: 'error'; message: string };
```

### rule.ts — 業務規則

```typescript
export type TriggerType =
  | 'before_insert' | 'after_insert'
  | 'before_update' | 'after_update'
  | 'before_delete'
  | 'on_schedule' | 'manual';

export interface Rule {
  id: string;
  name: string;
  description: string;
  table_name: string;
  trigger_type: TriggerType;
  enabled: boolean;

  condition?: {
    field: string;
    operator: 'eq' | 'neq' | 'gt' | 'lt' | 'contains' | 'changed';
    value?: unknown;
  };

  actions: RuleAction[];
}

export type RuleAction =
  | { type: 'set_field'; field: string; value: string }
  | { type: 'validate'; field: string; rule: string; message: string }
  | { type: 'webhook'; url: string; method: 'GET' | 'POST'; payload?: string }
  | { type: 'create_record'; table: string; data: Record<string, string> }
  | { type: 'notify'; channel: 'log' | 'webhook'; message: string };
```

### journal.ts — Design Journal

```typescript
import type { AgentName } from './agent';

export interface JournalEntry {
  id: number;
  timestamp: string;
  session_id: string;
  agent: AgentName;
  type: 'schema_change' | 'view_change' | 'rule_change' | 'data_import' | 'file_upload';
  description: string;
  diff: { before: unknown; after: unknown };
  reason: string;
  user_request: string;
  reversible: boolean;
  reverse_operations?: string;
}
```

### auth.ts — 使用者

```typescript
import type { UserRole } from './agent';

export interface User {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  avatar_url?: string;
  created_at: string;
  last_login_at?: string;
}

export interface AuthToken {
  token: string;
  user: User;
  expires_at: string;
}
```

---

## formula.ts — 公式引擎

```typescript
// 安全的公式計算（不使用 eval）
// 只支援：數字、四則運算、括號、欄位引用
// 範例：'quantity * unit_price'、'(price - discount) * quantity'

export function evaluateFormula(
  formula: string,
  values: Record<string, number>
): number;

export function validateFormula(
  formula: string,
  availableFields: string[]
): { valid: boolean; error?: string };

export function extractDependencies(formula: string): string[];
```

---

## 遷移步驟

1. 建立 `packages/shared/` 的 package.json + tsconfig
2. 把型別檔案寫入 `packages/shared/src/`
3. 根 `package.json` workspaces 加入 `packages/shared`
4. `packages/server/package.json` 加 `"@zenku/shared": "*"` dependency
5. `packages/web/package.json` 加 `"@zenku/shared": "*"` dependency
6. 將 `server/src/types.ts` 和 `web/src/types.ts` 改為 re-export from `@zenku/shared`
7. `npm install` 讓 workspace 連結生效

---

## 驗收標準

- [x] `packages/shared` 能被 server 和 web 都 import
- [x] `npx tsc --noEmit` 在三個 package 都通過
- [x] 現有功能（對話建表、CRUD）不受影響
