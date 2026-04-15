import type { ColumnDef } from './column';
import type { FieldDef } from './field';

// ===== View 類型 =====

export type ViewType = 'table' | 'master-detail' | 'dashboard' | 'kanban' | 'calendar';

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

  /** 預設排序 */
  default_sort?: { field: string; direction: 'asc' | 'desc' };
  /** 預設篩選 */
  default_filters?: Filter[];
}

export type ViewAction = 'create' | 'edit' | 'delete' | 'export';

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

// ===== 篩選 =====

export interface Filter {
  field: string;
  operator: FilterOperator;
  value: unknown;
}

export type FilterOperator = 'eq' | 'neq' | 'gt' | 'lt' | 'gte' | 'lte' | 'contains' | 'in';
