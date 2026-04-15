import { useState } from 'react';
import { NavLink } from 'react-router-dom';
import { Database, BarChart3, Columns3, Calendar, FileText, ChevronDown, ChevronRight } from 'lucide-react';
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
};

function ViewNavLink({ view, collapsed }: { view: ViewDefinition; collapsed: boolean }) {
  const Icon = VIEW_ICONS[view.type] ?? Database;
  return (
    <NavLink
      key={view.id}
      to={`/view/${view.id}`}
      className={({ isActive }) =>
        cn(
          'flex w-full items-center gap-2.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors',
          collapsed && 'justify-center px-2',
          isActive
            ? 'bg-primary/10 text-primary'
            : 'text-muted-foreground hover:bg-accent hover:text-foreground',
        )
      }
    >
      <Icon size={14} className="shrink-0" />
      {!collapsed && <span className="truncate">{view.name}</span>}
    </NavLink>
  );
}

function GroupSection({ label, views, collapsed }: { label: string; views: ViewDefinition[]; collapsed: boolean }) {
  const [open, setOpen] = useState(true);

  if (collapsed) {
    // In collapsed mode just show icons without group header
    return (
      <>
        {views.map(view => <ViewNavLink key={view.id} view={view} collapsed={collapsed} />)}
      </>
    );
  }

  return (
    <div>
      <button
        onClick={() => setOpen(o => !o)}
        className="flex w-full items-center gap-1 px-3 py-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground/70 hover:text-muted-foreground"
      >
        {open
          ? <ChevronDown size={11} className="shrink-0" />
          : <ChevronRight size={11} className="shrink-0" />}
        <span className="truncate">{label}</span>
      </button>
      {open && (
        <div className="mt-0.5 space-y-0.5 pl-2">
          {views.map(view => <ViewNavLink key={view.id} view={view} collapsed={collapsed} />)}
        </div>
      )}
    </div>
  );
}

export function Sidebar({ collapsed = false }: Props) {
  const { views } = useViews();

  // Separate grouped vs ungrouped views (preserve insertion order)
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
    <aside className="flex h-full flex-col bg-card">
      <nav className="flex-1 space-y-1 overflow-y-auto p-2">
        {views.length === 0 ? (
          <div className={cn('px-2 py-3 text-xs text-muted-foreground', collapsed && 'text-center')}>
            {collapsed ? '無' : '尚無頁面'}
          </div>
        ) : (
          <>
            {ungrouped.map(view => (
              <ViewNavLink key={view.id} view={view} collapsed={collapsed} />
            ))}
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
