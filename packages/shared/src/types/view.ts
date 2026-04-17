import type { ColumnDef } from './column';
import type { FieldDef } from './field';
import type { AppearanceCondition } from './appearance';

// ===== View 類型 =====

export type ViewType = 'table' | 'master-detail' | 'dashboard' | 'kanban' | 'calendar' | 'gallery';

/** Runtime 常數陣列（供 server 端 AI tool schema 使用） */
export const VIEW_TYPES: ViewType[] = ['table', 'master-detail', 'dashboard', 'kanban', 'calendar', 'gallery'];

// ===== View 定義 =====

export interface ViewDefinition {
  id: string;
  name: string;
  table_name: string;
  type: ViewType;
  /** Sidebar 圖示（lucide icon name） */
  icon?: string;
  /** Sidebar 群組名稱，相同 group 的 view 會歸到同一個群組 */
  group?: string;
  columns: ColumnDef[];
  form: { fields: FieldDef[]; columns?: 1 | 2 | 3 };
  actions: ViewAction[];

  /** master-detail 的明細定義 */
  detail_views?: DetailViewDef[];
  /** dashboard 的 widget 定義 */
  widgets?: DashboardWidget[];
  /** kanban 設定 */
  kanban?: KanbanConfig;
  /** calendar 設定 */
  calendar?: CalendarConfig;
  /** gallery 設定 */
  gallery?: GalleryConfig;

  /** 預設排序 */
  default_sort?: { field: string; direction: 'asc' | 'desc' };
  /** 預設篩選 */
  default_filters?: Filter[];
}

// ===== ViewAction =====

/** 內建 CRUD 動作（字串格式，向下相容） */
export type BuiltinAction = 'create' | 'edit' | 'delete' | 'export';

/** 自訂動作執行行為 */
export type ActionBehavior =
  | {
      /** 直接修改當前記錄的欄位值 */
      type: 'set_field';
      field: string;
      value: string;
    }
  | {
      /** 觸發一條 trigger_type='manual' 的業務規則 */
      type: 'trigger_rule';
      rule_id: string;
    }
  | {
      /** 呼叫外部 Webhook */
      type: 'webhook';
      url: string;
      method?: 'GET' | 'POST';
      /** JSON 樣板，可用 {{field}} 插入記錄欄位值 */
      payload?: string;
    }
  | {
      /** 跳轉到另一個 View */
      type: 'navigate';
      view_id: string;
      filter_field?: string;
      filter_value_from?: string;
    }
  | {
      /** 在另一張表建立關聯記錄 */
      type: 'create_related';
      table: string;
      field_mapping: Record<string, string>;
    };

/** 自訂動作按鈕定義 */
export interface CustomViewAction {
  /** 唯一識別碼（英文 underscore） */
  id: string;
  /** 按鈕文字 */
  label: string;
  /** Lucide icon 名稱，如 "check", "truck", "x-circle" */
  icon?: string;
  /** 按鈕樣式 */
  variant?: 'default' | 'outline' | 'secondary' | 'destructive' | 'warning';
  /** 出現在哪個情境：record = 詳情頁, list = 列表列, both = 兩者皆有 */
  context?: 'record' | 'list' | 'both';
  /** 顯示條件 */
  visible_when?: AppearanceCondition;
  /** 啟用條件（不滿足時按鈕 disabled） */
  enabled_when?: AppearanceCondition;
  /** 執行行為 */
  behavior: ActionBehavior;
  /** 執行前彈出確認框 */
  confirm?: { title: string; description: string };
}

/** ViewDefinition.actions 型別（字串 = 內建；物件 = 自訂） */
export type ViewAction = BuiltinAction | CustomViewAction;

// ===== Master-Detail =====

export interface DetailViewDef {
  /** 明細表名 */
  table_name: string;
  /** 明細表中指向主表的外鍵欄位 */
  foreign_key: string;
  /** Tab 標籤名 */
  tab_label: string;
  /** 明細的 view 定義 */
  view: ViewDefinition;
}

// ===== Dashboard =====

export interface DashboardWidget {
  id: string;
  type: WidgetType;
  title: string;
  /** SELECT SQL */
  query: string;
  size: 'sm' | 'md' | 'lg' | 'full';
  position: { row: number; col: number; rowSpan?: number; colSpan?: number };
  /** 圖表特有設定（x_key, y_key, color 等） */
  config?: Record<string, unknown>;
}

export type WidgetType = 'stat_card' | 'bar_chart' | 'line_chart' | 'pie_chart' | 'mini_table';

// ===== Kanban =====

export interface KanbanConfig {
  /** 分組欄位（如 'status'） */
  group_field: string;
  /** 卡片標題欄位 */
  title_field: string;
  /** 卡片描述欄位 */
  description_field?: string;
}

// ===== Calendar =====

export interface CalendarConfig {
  /** 日期欄位 */
  date_field: string;
  /** 標題欄位 */
  title_field: string;
  /** 顏色欄位（用哪個欄位的值決定顏色） */
  color_field?: string;
}

export interface GalleryConfig {
  /** 圖片欄位 */
  image_field: string;
  /** 標題欄位 */
  title_field: string;
  /** 副標題欄位 */
  subtitle_field?: string;
}

// ===== 篩選 =====

export interface Filter {
  field: string;
  operator: FilterOperator;
  value: unknown;
}

export type FilterOperator = 'eq' | 'neq' | 'gt' | 'lt' | 'gte' | 'lte' | 'contains' | 'in';
