import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { NavLink } from 'react-router-dom';
import {
  Database,
  BarChart3,
  Columns3,
  Calendar,
  FileText,
  Image,
  ClipboardList,
  GitCommitVertical,
  Network,
  GanttChartSquare,
  Globe,
  ChevronRight,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { cn } from '../lib/cn';
import { useViews } from '../contexts/ViewsContext';
import { UserMenu } from './auth/UserMenu';
import type { ViewDefinition, ViewType } from '../types';

interface Props {
  collapsed?: boolean;
}

const VIEW_ICONS: Record<ViewType, LucideIcon> = {
  'table':         Database,
  'master-detail': FileText,
  'dashboard':     BarChart3,
  'kanban':        Columns3,
  'calendar':      Calendar,
  'gallery':       Image,
  'form-only':     ClipboardList,
  'timeline':      GitCommitVertical,
  'embed':         Globe,
  'gantt':         GanttChartSquare,
  'tree':          Network,
};

export function Sidebar({ collapsed = false }: Props) {
  const { t } = useTranslation();
  const { views } = useViews();

  const ungrouped: ViewDefinition[] = [];
  const groups = new Map<string, ViewDefinition[]>();

  for (const view of views) {
    if (view.group) {
      if (!groups.has(view.group)) groups.set(view.group, []);
      groups.get(view.group)!.push(view);
    } else {
      ungrouped.push(view);
    }
  }

  return (
    <aside className="flex h-full flex-col bg-sidebar text-sidebar-foreground">
      <nav className="flex-1 space-y-3 overflow-y-auto p-2 pt-3">
        {views.length === 0 ? (
          <div className={cn('px-2 py-3 text-xs text-muted-foreground', collapsed && 'text-center')}>
            {collapsed ? t('common.none') : t('common.no_pages')}
          </div>
        ) : (
          <>
            {ungrouped.length > 0 && (
              <div className="space-y-0.5">
                {ungrouped.map(view => (
                  <ViewNavLink key={view.id} view={view} collapsed={collapsed} />
                ))}
              </div>
            )}
            {Array.from(groups.entries()).map(([label, groupViews]) => (
              <GroupSection key={label} label={label} views={groupViews} collapsed={collapsed} />
            ))}
          </>
        )}
      </nav>

      {!collapsed && <UserMenu />}
    </aside>
  );
}

function ViewNavLink({ view, collapsed }: { view: ViewDefinition; collapsed: boolean }) {
  const Icon = VIEW_ICONS[view.type] ?? Database;
  return (
    <NavLink
      to={`/view/${view.id}`}
      className={({ isActive }) =>
        cn(
          'flex w-full items-center gap-2.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors',
          collapsed && 'justify-center px-2',
          isActive
            ? 'bg-sidebar-accent text-sidebar-accent-foreground'
            : 'text-sidebar-foreground/80 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground',
        )
      }
    >
      <Icon className="size-4 shrink-0" />
      {!collapsed && <span className="truncate">{view.name}</span>}
    </NavLink>
  );
}

function GroupSection({
  label,
  views,
  collapsed,
}: {
  label: string;
  views: ViewDefinition[];
  collapsed: boolean;
}) {
  const [open, setOpen] = useState(true);

  if (collapsed) {
    return (
      <div className="space-y-0.5">
        {views.map(view => (
          <ViewNavLink key={view.id} view={view} collapsed={collapsed} />
        ))}
      </div>
    );
  }

  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className="flex w-full items-center gap-1.5 rounded-md px-3 py-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/70 transition-colors hover:text-muted-foreground"
      >
        <ChevronRight
          size={11}
          className={cn('shrink-0 transition-transform', open && 'rotate-90')}
        />
        <span className="truncate">{label}</span>
      </button>
      {open && (
        <div className="mt-0.5 space-y-0.5">
          {views.map(view => (
            <ViewNavLink key={view.id} view={view} collapsed={collapsed} />
          ))}
        </div>
      )}
    </div>
  );
}
