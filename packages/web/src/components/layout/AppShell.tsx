import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Outlet, useParams } from 'react-router-dom';
import { Group, type PanelSize, Panel, Separator, usePanelRef } from 'react-resizable-panels';
import {
  PanelLeftClose,
  PanelLeftOpen,
  PanelRightClose,
  PanelRightOpen,
  ChevronRight,
  Menu,
  MessageSquare,
} from 'lucide-react';
import { Button } from '../ui/button';
import { ThemeToggle } from './ThemeToggle';
import { Card } from '../ui/card';
import i18next from 'i18next';
import { Sheet, SheetContent, SheetTitle } from '../ui/sheet';
import { Sidebar } from '../Sidebar';
import { ChatPanel } from '../ChatPanel';
import { useViews } from '../../contexts/ViewsContext';
import { useIsMobile } from '../../lib/use-mobile';
import { cn } from '../../lib/cn';

export function AppShell() {
  const { views, fetchViews } = useViews();
  const { viewId } = useParams();
  const isMobile = useIsMobile();
  const hasViews = views.length > 0;
  const currentView = views.find(v => v.id === viewId);

  const sidebarPanelRef = usePanelRef();
  const chatPanelRef = usePanelRef();

  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [chatCollapsed, setChatCollapsed] = useState(hasViews);
  const [enterSystem, setEnterSystem] = useState(false);
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const [mobileChatOpen, setMobileChatOpen] = useState(false);

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

  if (!hasViews && !enterSystem) {
    return (
      <div className="flex h-screen flex-col bg-background">
        <AppBar
          isMobile={isMobile}
          sidebarCollapsed={false}
          chatCollapsed={false}
          onToggleSidebar={() => {}}
          onToggleChat={() => {}}
          showPanelToggles={false}
        />
        <div className="relative flex flex-1 items-center justify-center p-6">
          <Card className="h-[640px] w-full max-w-2xl overflow-hidden">
            <ChatPanel onViewsChanged={fetchViews} />
          </Card>
          <EnterSystemButton onClick={() => setEnterSystem(true)} />
        </div>
      </div>
    );
  }

  if (isMobile) {
    return (
      <div className="flex h-screen flex-col bg-background text-foreground">
        <AppBar
          viewName={currentView?.name}
          isMobile={isMobile}
          sidebarCollapsed={false}
          chatCollapsed={false}
          onToggleSidebar={() => setMobileSidebarOpen(true)}
          onToggleChat={() => setMobileChatOpen(true)}
        />
        <Sheet open={mobileSidebarOpen} onOpenChange={setMobileSidebarOpen}>
          <SheetContent side="left" className="w-64 p-0" aria-describedby={undefined}>
            <SheetTitle className="sr-only">Navigation</SheetTitle>
            <Sidebar collapsed={false} />
          </SheetContent>
        </Sheet>
        <Sheet open={mobileChatOpen} onOpenChange={setMobileChatOpen}>
          <SheetContent side="right" className="w-full p-0 sm:w-96" aria-describedby={undefined}>
            <SheetTitle className="sr-only">AI Chat</SheetTitle>
            <ChatPanel onViewsChanged={fetchViews} />
          </SheetContent>
        </Sheet>
        <div className="flex-1 overflow-hidden">
          <Outlet />
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-screen flex-col bg-background text-foreground">
      <AppBar
        viewName={currentView?.name}
        isMobile={false}
        sidebarCollapsed={sidebarCollapsed}
        chatCollapsed={chatCollapsed}
        onToggleSidebar={toggleSidebar}
        onToggleChat={toggleChat}
      />
      <Group orientation="horizontal" className="h-full w-full overflow-hidden">
        <Panel
          defaultSize="14%"
          minSize="12%"
          maxSize="28%"
          collapsible
          collapsedSize="0%"
          panelRef={sidebarPanelRef}
          onResize={handleSidebarResize}
        >
          <div className="h-full border-r border-sidebar-border">
            <Sidebar collapsed={sidebarCollapsed} />
          </div>
        </Panel>
        <Separator className="w-1 bg-border/50 transition hover:bg-border data-[resize-handle-active]:bg-border" />

        <Panel defaultSize="56%" minSize="30%">
          <div className="h-full overflow-hidden bg-background">
            <Outlet />
          </div>
        </Panel>
        <Separator className="w-1 bg-border/50 transition hover:bg-border data-[resize-handle-active]:bg-border" />

        <Panel
          defaultSize={hasViews ? '0%' : '28%'}
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

const LANGUAGES = [
  { code: 'zh-TW', label: '中文' },
  { code: 'en', label: 'EN' },
];

function LangToggle() {
  const { i18n } = useTranslation();
  return (
    <div className="flex gap-1">
      {LANGUAGES.map(({ code, label }) => (
        <button
          key={code}
          type="button"
          onClick={() => { void i18next.changeLanguage(code); }}
          className={cn(
            'rounded px-2 py-1 text-xs font-medium transition',
            i18n.language === code
              ? 'bg-primary/10 text-primary'
              : 'text-muted-foreground hover:text-foreground',
          )}
        >
          {label}
        </button>
      ))}
    </div>
  );
}

function EnterSystemButton({ onClick }: { onClick: () => void }) {
  const { t } = useTranslation();
  return (
    <button
      type="button"
      onClick={onClick}
      className="absolute bottom-8 right-8 rounded-lg border bg-card px-4 py-2 text-sm font-medium shadow-sm transition hover:bg-muted"
    >
      {t('common.enter_system')}
    </button>
  );
}

interface AppBarProps {
  viewName?: string;
  isMobile: boolean;
  sidebarCollapsed: boolean;
  chatCollapsed: boolean;
  onToggleSidebar: () => void;
  onToggleChat: () => void;
  showPanelToggles?: boolean;
}

function AppBar({
  viewName,
  isMobile,
  sidebarCollapsed,
  chatCollapsed,
  onToggleSidebar,
  onToggleChat,
  showPanelToggles = true,
}: AppBarProps) {
  const { t } = useTranslation();

  return (
    <header
      className={cn(
        'sticky top-0 z-10 flex h-12 shrink-0 items-center justify-between gap-2 border-b bg-background/80 px-3 backdrop-blur-md lg:px-4',
      )}
    >
      <div className="flex min-w-0 items-center gap-1">
        {showPanelToggles && (
          <Button
            variant="ghost"
            size="icon"
            onClick={onToggleSidebar}
            aria-label={sidebarCollapsed ? t('common.expand_sidebar') : t('common.collapse_sidebar')}
          >
            {isMobile ? (
              <Menu className="h-4 w-4 text-muted-foreground" />
            ) : sidebarCollapsed ? (
              <PanelLeftOpen className="h-4 w-4 text-muted-foreground" />
            ) : (
              <PanelLeftClose className="h-4 w-4 text-muted-foreground" />
            )}
          </Button>
        )}

        <div className="flex items-center gap-1.5 px-1">
          <div className="flex h-6 w-6 items-center justify-center rounded bg-primary text-xs font-bold text-primary-foreground">
            Z
          </div>
          <span className="text-sm font-semibold">Zenku</span>
        </div>

        {viewName && (
          <div className="flex min-w-0 items-center gap-1 px-1 text-sm text-muted-foreground">
            <ChevronRight className="h-3.5 w-3.5 shrink-0" />
            <span className="truncate font-medium text-foreground">{viewName}</span>
          </div>
        )}
      </div>

      <div className="flex shrink-0 items-center gap-2">
        {!showPanelToggles && <LangToggle />}
        <ThemeToggle />
        {showPanelToggles && (
          <Button
            variant="ghost"
            size="icon"
            onClick={onToggleChat}
            aria-label={chatCollapsed ? t('common.expand_chat') : t('common.collapse_chat')}
          >
            {isMobile ? (
              <MessageSquare className="h-4 w-4 text-muted-foreground" />
            ) : chatCollapsed ? (
              <PanelRightOpen className="h-4 w-4 text-muted-foreground" />
            ) : (
              <PanelRightClose className="h-4 w-4 text-muted-foreground" />
            )}
          </Button>
        )}
      </div>
    </header>
  );
}
