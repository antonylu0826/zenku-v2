import type { ColumnDef } from './column';
import type { FieldDef } from './field';
import type { AppearanceCondition } from './appearance';

// ===== View Types =====

export type ViewType = 'table' | 'master-detail' | 'dashboard' | 'kanban' | 'calendar' | 'gallery' | 'form-only' | 'timeline';

/** Runtime constant array (used by server-side AI tool schema) */
export const VIEW_TYPES: ViewType[] = ['table', 'master-detail', 'dashboard', 'kanban', 'calendar', 'gallery', 'form-only', 'timeline'];

// ===== View Definition =====

export interface ViewDefinition {
  id: string;
  name: string;
  table_name: string;
  type: ViewType;
  /** Sidebar icon (lucide icon name) */
  icon?: string;
  /** Sidebar group name; views with the same group are grouped together */
  group?: string;
  columns: ColumnDef[];
  form: { fields: FieldDef[]; columns?: 1 | 2 | 3 };
  actions: ViewAction[];

  /** Detail view definitions for master-detail type */
  detail_views?: DetailViewDef[];
  /** Widget definitions for dashboard type */
  widgets?: DashboardWidget[];
  /** Kanban settings */
  kanban?: KanbanConfig;
  /** Calendar settings */
  calendar?: CalendarConfig;
  /** Gallery settings */
  gallery?: GalleryConfig;
  /** Timeline settings */
  timeline?: TimelineConfig;

  /** Default sort */
  default_sort?: { field: string; direction: 'asc' | 'desc' };
  /** Default filters */
  default_filters?: Filter[];
}

// ===== ViewAction =====

/** Built-in CRUD actions (string format, backward compatible) */
export type BuiltinAction = 'create' | 'edit' | 'delete' | 'export';

/** Custom action execution behavior */
export type ActionBehavior =
  | {
      /** Directly modify a field value on the current record */
      type: 'set_field';
      field: string;
      value: string;
    }
  | {
      /** Trigger a business rule with trigger_type='manual' */
      type: 'trigger_rule';
      rule_id: string;
    }
  | {
      /** Call an external Webhook */
      type: 'webhook';
      url: string;
      method?: 'GET' | 'POST';
      /** JSON template; use {{field}} to inject record field values */
      payload?: string;
    }
  | {
      /** Navigate to another View */
      type: 'navigate';
      view_id: string;
      filter_field?: string;
      filter_value_from?: string;
    }
  | {
      /** Create a related record in another table */
      type: 'create_related';
      table: string;
      field_mapping: Record<string, string>;
    };

/** Custom action button definition */
export interface CustomViewAction {
  /** Unique identifier (lowercase underscore) */
  id: string;
  /** Button label */
  label: string;
  /** Lucide icon name, e.g. "check", "truck", "x-circle" */
  icon?: string;
  /** Button variant */
  variant?: 'default' | 'outline' | 'secondary' | 'destructive' | 'warning';
  /** Where the button appears: record = detail page, list = table row, both = both */
  context?: 'record' | 'list' | 'both';
  /** Visibility condition */
  visible_when?: AppearanceCondition;
  /** Enable condition (button is disabled when not met) */
  enabled_when?: AppearanceCondition;
  /** Execution behavior */
  behavior: ActionBehavior;
  /** Show a confirmation dialog before executing */
  confirm?: { title: string; description: string };
}

/** ViewDefinition.actions type (string = built-in; object = custom) */
export type ViewAction = BuiltinAction | CustomViewAction;

// ===== Master-Detail =====

export interface DetailViewDef {
  /** Detail table name */
  table_name: string;
  /** Foreign key field in the detail table pointing to the master table */
  foreign_key: string;
  /** Tab label */
  tab_label: string;
  /** View definition for the detail */
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
  /** Chart-specific settings (x_key, y_key, color, etc.) */
  config?: Record<string, unknown>;
}

export type WidgetType = 'stat_card' | 'bar_chart' | 'line_chart' | 'area_chart' | 'pie_chart' | 'mini_table' | 'trend_card';

// ===== Kanban =====

export interface KanbanConfig {
  /** Group field (e.g. 'status') */
  group_field: string;
  /** Card title field */
  title_field: string;
  /** Card description field */
  description_field?: string;
  /** Column background color map (keyed by group_field value) */
  column_color_map?: Record<string, string>;
}

// ===== Calendar =====

export interface CalendarConfig {
  /** Date field */
  date_field: string;
  /** Title field */
  title_field: string;
  /** Color field (which field value determines the color) */
  color_field?: string;
}

export interface GalleryConfig {
  /** Image field */
  image_field: string;
  /** Title field */
  title_field: string;
  /** Subtitle field */
  subtitle_field?: string;
}

// ===== Timeline =====

export interface TimelineConfig {
  /** Date field (used for sorting and display) */
  date_field: string;
  /** Title field */
  title_field: string;
  /** Description field */
  description_field?: string;
  /** Color field (if the value is a hex string it is used directly; otherwise treated as a category and auto-mapped to a color) */
  color_field?: string;
}

// ===== Filters =====

export interface Filter {
  field: string;
  operator: FilterOperator;
  value: unknown;
}

export type FilterOperator = 'eq' | 'neq' | 'gt' | 'lt' | 'gte' | 'lte' | 'contains' | 'not_contains' | 'is_empty' | 'is_not_empty' | 'in';
