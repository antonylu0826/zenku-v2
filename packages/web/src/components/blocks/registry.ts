import type { ViewDefinition, ViewType } from '../../types';
import { TableView } from './TableView';
import { MasterDetailView } from './MasterDetailView';
import { MasterDetailCreateView } from './MasterDetailCreateView';
import { DashboardView } from './DashboardView';
import { KanbanView } from './KanbanView';
import { CalendarView } from './CalendarView';
import { GalleryView } from './GalleryView';
import { FormOnlyView } from './FormOnlyView';
import { TimelineView } from './TimelineView';
import { EmbedView } from './EmbedView';
import { GanttView } from './GanttView';
import { TreeView } from './TreeView';

// ─── Registry entry ───────────────────────────────────────────────────────────

export interface ViewEntry {
  /** Main list page (or the only page) */
  component: React.ComponentType<{ view: ViewDefinition }>;
  /** Detail page (/:recordId) */
  detailComponent?: React.ComponentType<{ view: ViewDefinition; recordId: string }>;
  /** Create page (/new) */
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
  'form-only': {
    component: FormOnlyView,
  },
  timeline: {
    component: TimelineView,
  },
  embed: {
    component: EmbedView,
  },
  gantt: {
    component: GanttView,
  },
  tree: {
    component: TreeView,
  },
  // To add a new View type, just add one entry here ↓
};
