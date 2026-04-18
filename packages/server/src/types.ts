// Re-export all shared types
export type {
  FieldType, FieldDef, RelationDef, SourceDef, ComputedDef, ValidationDef,
  ColumnDef,
  ViewType, ViewDefinition, ViewAction, DetailViewDef, DashboardWidget, KanbanConfig, CalendarConfig, Filter,
  AgentName, UserRole, AgentResult, AgentPermission,
  AIProvider, AIProviderConfig, TokenUsage, ToolCall, ToolResult, LLMMessage, LLMResponse,
  ModelOption,
  ChatSession, ChatMessageRecord, ToolEventRecord, UsageStats, SSEChunk, ChatMessage, ToolEvent,
  TriggerType, Rule, RuleCondition, RuleAction,
  JournalType, JournalEntry,
  User, AuthToken,
} from '@zenku/shared';

export { AGENT_PERMISSIONS, AI_MODELS, TOKEN_COSTS, estimateCost } from '@zenku/shared';
export { evaluateFormula, validateFormula, extractDependencies } from '@zenku/shared';

// ===== Server-only types =====

export interface TableColumn {
  name: string;
  type: string;
  notnull: number;
  dflt_value: string | null;
  pk: number;
}
