import { useState } from 'react';
import { Outlet, useParams } from 'react-router-dom';
import { Group, type PanelSize, Panel, Separator, usePanelRef } from 'react-resizable-panels';
import { PanelLeftClose, PanelLeftOpen, PanelRightClose, PanelRightOpen, ChevronRight } from 'lucide-react';
import { Button } from '../ui/button';
import { ThemeToggle } from './ThemeToggle';
import { Card } from '../ui/card';
import { Sidebar } from '../Sidebar';
import { ChatPanel } from '../ChatPanel';
import { useViews } from '../../contexts/ViewsContext';

export function AppShell() {
  const { views, fetchViews } = useViews();
  const { viewId } = useParams();
  const hasViews = views.length > 0;
  const currentView = views.find(v => v.id === viewId);

  const sidebarPanelRef = usePanelRef();
  const chatPanelRef = usePanelRef();

  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [chatCollapsed, setChatCollapsed] = useState(false);

  const handleSidebarResize = (size: PanelSize) => {
    setSidebarCollapsed(size.asPercentage <= 6);
  };

  const handleChatResize = (size: PanelSize) => {
    setChatCollapsed(size.asPercentage <= 6);
  };

  const toggleSidebar = () => {
    const panel = sidebarPanelRef.current;
    if (!panel) return;
    panel.isCollapsed() ? panel.expand() : panel.collapse();
  };

  const toggleChat = () => {
    const panel = chatPanelRef.current;
    if (!panel) return;
    panel.isCollapsed() ? panel.expand() : panel.collapse();
  };

  if (!hasViews) {
    return (
      <div className="flex h-screen flex-col bg-background">
        <AppBar
          sidebarCollapsed={false}
          chatCollapsed={false}
          onToggleSidebar={() => {}}
          onToggleChat={() => {}}
          showPanelToggles={false}
        />
        <div className="flex flex-1 items-center justify-center p-6">
          <Card className="h-[640px] w-full max-w-2xl overflow-hidden">
            <ChatPanel onViewsChanged={fetchViews} />
          </Card>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-screen flex-col bg-background text-foreground">
      <AppBar
        viewName={currentView?.name}
        sidebarCollapsed={sidebarCollapsed}
        chatCollapsed={chatCollapsed}
        onToggleSidebar={toggleSidebar}
        onToggleChat={toggleChat}
      />
      <Group orientation="horizontal" className="h-full w-full overflow-hidden">
        <Panel
          defaultSize="16%"
          minSize="10%"
          maxSize="28%"
          collapsible
          collapsedSize="0%"
          panelRef={sidebarPanelRef}
          onResize={handleSidebarResize}
        >
          <div className="h-full border-r">
            <Sidebar collapsed={sidebarCollapsed} />
          </div>
        </Panel>
        <Separator className="w-1 bg-border/60 transition hover:bg-border data-[resize-handle-active]:bg-border" />

        <Panel defaultSize="56%" minSize="30%">
          <div className="h-full overflow-hidden bg-background">
            <Outlet />
          </div>
        </Panel>
        <Separator className="w-1 bg-border/60 transition hover:bg-border data-[resize-handle-active]:bg-border" />

        <Panel
          defaultSize="28%"
          minSize="22%"
          maxSize="45%"
          collapsible
          collapsedSize="0%"
          panelRef={chatPanelRef}
          onResize={handleChatResize}
        >
          <div className="h-full border-l">
            <ChatPanel onViewsChanged={fetchViews} />
          </div>
        </Panel>
      </Group>
    </div>
  );
}

interface AppBarProps {
  viewName?: string;
  sidebarCollapsed: boolean;
  chatCollapsed: boolean;
  onToggleSidebar: () => void;
  onToggleChat: () => void;
  showPanelToggles?: boolean;
}

function AppBar({
  viewName,
  sidebarCollapsed,
  chatCollapsed,
  onToggleSidebar,
  onToggleChat,
  showPanelToggles = true,
}: AppBarProps) {
  return (
    <header className="flex h-11 shrink-0 items-center border-b bg-card px-2 gap-1">
      {/* 左側：sidebar toggle + logo */}
      <div className="flex items-center gap-1">
        {showPanelToggles && (
          <Button
            variant="ghost"
            size="icon"
            onClick={onToggleSidebar}
            aria-label={sidebarCollapsed ? '展開側欄' : '收合側欄'}
          >
            {sidebarCollapsed
              ? <PanelLeftOpen className="h-4 w-4 text-muted-foreground" />
              : <PanelLeftClose className="h-4 w-4 text-muted-foreground" />}
          </Button>
        )}
        <div className="flex items-center gap-1.5 px-1">
          <div className="flex h-6 w-6 items-center justify-center rounded bg-primary text-xs font-bold text-primary-foreground">
            Z
          </div>
          <span className="text-sm font-semibold">Zenku</span>
        </div>
      </div>

      {/* 中間：breadcrumb */}
      {viewName && (
        <div className="flex items-center gap-1 text-sm text-muted-foreground">
          <ChevronRight className="h-3.5 w-3.5" />
          <span className="font-medium text-foreground">{viewName}</span>
        </div>
      )}

      {/* 右側：theme toggle + chat toggle */}
      <div className="ml-auto flex items-center gap-1">
        <ThemeToggle />
        {showPanelToggles && (
          <Button
            variant="ghost"
            size="icon"
            onClick={onToggleChat}
            aria-label={chatCollapsed ? '展開對話' : '收合對話'}
          >
            {chatCollapsed
              ? <PanelRightOpen className="h-4 w-4 text-muted-foreground" />
              : <PanelRightClose className="h-4 w-4 text-muted-foreground" />}
          </Button>
        )}
      </div>
    </header>
  );
}
