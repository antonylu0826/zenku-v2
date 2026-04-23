// Re-export all shared types used by the frontend
export type {
  AppearanceCondition, AppearanceEffect, AppearanceRule, AppearanceContext
} from '@zenku/shared';
export { resolveAppearance } from '@zenku/shared';

export type {
  FieldType, FieldDef, RelationDef, SourceDef, ComputedDef, ValidationDef,
  ColumnDef,
  ViewType, ViewDefinition, ViewAction, BuiltinAction, CustomViewAction, ActionBehavior,
  DetailViewDef, DashboardWidget, KanbanConfig, CalendarConfig, Filter,
  AgentName, UserRole, AgentResult,
  AIProvider, TokenUsage,
  ChatSession, ChatMessageRecord, SSEChunk, ChatMessage, ToolEvent,
} from '@zenku/shared';

export { estimateCost } from '@zenku/shared';
