import type { ViewDefinition, ViewType } from '../../types';
import { TableView } from './TableView';
import { MasterDetailView } from './MasterDetailView';
import { MasterDetailCreateView } from './MasterDetailCreateView';
import { DashboardView } from './DashboardView';
import { KanbanView } from './KanbanView';
import { CalendarView } from './CalendarView';
import { GalleryView } from './GalleryView';

// ─── Registry entry ───────────────────────────────────────────────────────────

export interface ViewEntry {
  /** 主列表頁（或唯一頁面） */
  component: React.ComponentType<{ view: ViewDefinition }>;
  /** 詳情頁（/:recordId） */
  detailComponent?: React.ComponentType<{ view: ViewDefinition; recordId: string }>;
  /** 新增頁（/new） */
  createComponent?: React.ComponentType<{ view: ViewDefinition }>;
}

// ─── Registry ─────────────────────────────────────────────────────────────────

export const VIEW_REGISTRY: Record<ViewType, ViewEntry> = {
  table: {
    component: TableView,
  },
  'master-detail': {
    component: TableView,
    detailComponent: MasterDetailView,
    createComponent: MasterDetailCreateView,
  },
  dashboard: {
    component: DashboardView,
  },
  kanban: {
    component: KanbanView,
  },
  calendar: {
    component: CalendarView,
  },
  gallery: {
    component: GalleryView,
  },
  // 新增 View type 只需在這裡加一個 entry ↓
};
