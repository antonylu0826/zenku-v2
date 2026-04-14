import { NavLink } from 'react-router-dom';
import { Database } from 'lucide-react';
import { cn } from '../lib/cn';
import { useViews } from '../contexts/ViewsContext';

interface Props {
  collapsed?: boolean;
}

export function Sidebar({ collapsed = false }: Props) {
  const { views } = useViews();

  return (
    <aside className="flex h-full flex-col bg-card">
      <nav className="flex-1 space-y-1 overflow-y-auto p-2">
        {views.length === 0 ? (
          <div className={cn('px-2 py-3 text-xs text-muted-foreground', collapsed && 'text-center')}>
            {collapsed ? '無' : '尚無頁面'}
          </div>
        ) : (
          views.map(view => (
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
              <Database size={14} className="shrink-0" />
              {!collapsed && <span className="truncate">{view.name}</span>}
            </NavLink>
          ))
        )}
      </nav>
    </aside>
  );
}
