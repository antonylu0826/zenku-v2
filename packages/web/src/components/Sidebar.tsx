import { Database } from 'lucide-react';
import type { ViewDefinition } from '../types';
import { Button } from './ui/button';
import { cn } from '../lib/cn';

interface Props {
  views: ViewDefinition[];
  activeViewId: string | null;
  onSelect: (viewId: string) => void;
  collapsed?: boolean;
}

export function Sidebar({ views, activeViewId, onSelect, collapsed = false }: Props) {
  return (
    <aside className="flex h-full flex-col bg-card">
      <nav className="flex-1 space-y-1 overflow-y-auto p-2">
        {views.length === 0 ? (
          <div className={cn('px-2 py-3 text-xs text-muted-foreground', collapsed && 'text-center')}>
            {collapsed ? '無' : '尚無頁面'}
          </div>
        ) : (
          views.map(view => (
            <Button
              key={view.id}
              onClick={() => onSelect(view.id)}
              variant={activeViewId === view.id ? 'secondary' : 'ghost'}
              className={cn(
                'w-full justify-start gap-2.5',
                collapsed && 'justify-center px-2',
                activeViewId === view.id
                  ? 'bg-primary/10 text-primary hover:bg-primary/15'
                  : 'text-muted-foreground hover:text-foreground',
              )}
            >
              <Database size={14} className="shrink-0" />
              {!collapsed && <span className="truncate">{view.name}</span>}
            </Button>
          ))
        )}
      </nav>
    </aside>
  );
}
