import { useState, useEffect, useCallback } from 'react';
import { getViews } from './api';
import type { ViewDefinition } from './types';
import { Sidebar } from './components/Sidebar';
import { AppArea } from './components/AppArea';
import { ChatPanel } from './components/ChatPanel';
import { AppShell } from './components/layout/AppShell';
import { ThemeProvider } from './components/layout/ThemeProvider';
import { Toaster } from './components/ui/sonner';

export default function App() {
  const [views, setViews] = useState<ViewDefinition[]>([]);
  const [activeViewId, setActiveViewId] = useState<string | null>(null);

  const fetchViews = useCallback(async () => {
    const data = await getViews();
    const defs = data.map(d => d.definition);
    setViews(defs);
    // 如果目前沒有選中的 view，或者選中的 view 被刪除，自動選第一個
    if (defs.length > 0) {
      setActiveViewId(prev => prev && defs.find(v => v.id === prev) ? prev : defs[0].id);
    }
  }, []);

  useEffect(() => {
    fetchViews();
  }, [fetchViews]);

  const activeView = views.find(v => v.id === activeViewId) ?? null;
  const hasViews = views.length > 0;

  return (
    <ThemeProvider>
      <AppShell
        hasViews={hasViews}
        viewName={activeView?.name}
        sidebar={(collapsed) => (
          <Sidebar
            views={views}
            activeViewId={activeViewId}
            onSelect={setActiveViewId}
            collapsed={collapsed}
          />
        )}
        appArea={<AppArea view={activeView} />}
        chatPanel={<ChatPanel onViewsChanged={fetchViews} />}
      />
      <Toaster position="top-right" />
    </ThemeProvider>
  );
}
