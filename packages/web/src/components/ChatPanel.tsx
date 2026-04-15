import { useState, useRef, useEffect, useCallback } from 'react';
import { Send, Loader2, Wrench, CheckCircle, XCircle, Plus, Archive, ChevronDown, Pencil, Check, X } from 'lucide-react';
import { MarkdownRenderer } from './MarkdownRenderer';
import {
  sendChat, getAIProviders, getSessions, getSessionMessages, updateSessionTitle, archiveSession,
  type AIProviderInfo, type SessionSummary, type SessionMessage,
} from '../api';
import type { ChatMessage, SSEChunk, ToolEvent } from '../types';
import { Button } from './ui/button';
import { Textarea } from './ui/textarea';
import { Badge } from './ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { Popover, PopoverContent, PopoverTrigger } from './ui/popover';
import { cn } from '../lib/cn';
import { toast } from 'sonner';

interface Props {
  onViewsChanged: () => void;
  className?: string;
}

const WELCOME_MSG: ChatMessage = {
  id: 'welcome',
  role: 'assistant',
  content: '你好！我是 Zenku。告訴我你想要管理什麼資料，我來幫你建立應用。\n\n例如：「我要管理客戶資料，有姓名、電話、email」',
};

function sessionMessagesToChatMessages(msgs: SessionMessage[]): ChatMessage[] {
  return msgs
    .filter(m => m.role === 'user' || m.content)
    .map(m => ({
      id: m.id,
      role: m.role,
      content: m.content,
      toolEvents: m.tool_events.map(te => ({
        type: 'tool_result' as const,
        tool: te.tool_name,
        result: te.tool_output,
      })),
    }));
}

export function ChatPanel({ onViewsChanged, className }: Props) {
  const [messages, setMessages] = useState<ChatMessage[]>([WELCOME_MSG]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  // AI provider/model state
  const [providers, setProviders] = useState<AIProviderInfo[]>([]);
  const [selectedProvider, setSelectedProvider] = useState('');
  const [selectedModel, setSelectedModel] = useState('');

  // Session state
  const [sessions, setSessions] = useState<SessionSummary[]>([]);
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null);
  const [sessionsOpen, setSessionsOpen] = useState(false);
  const [sessionsLoading, setSessionsLoading] = useState(false);
  const [switchingSession, setSwitchingSession] = useState(false);

  // Title editing
  const [editingTitle, setEditingTitle] = useState(false);
  const [titleDraft, setTitleDraft] = useState('');
  const titleInputRef = useRef<HTMLInputElement>(null);

  const currentSession = sessions.find(s => s.id === currentSessionId) ?? null;

  // ── Init ────────────────────────────────────────────────────────────────────

  useEffect(() => {
    getAIProviders().then(list => {
      setProviders(list);
      if (list.length > 0) {
        setSelectedProvider(list[0].name);
        setSelectedModel(list[0].default_model);
      }
    }).catch(() => {});
  }, []);

  const refreshSessions = useCallback(async () => {
    try {
      const list = await getSessions(20);
      setSessions(list);
      return list;
    } catch { return []; }
  }, []);

  useEffect(() => {
    void (async () => {
      setSessionsLoading(true);
      const list = await refreshSessions();
      // Auto-load the most recent session
      if (list.length > 0) {
        await loadSession(list[0].id, list);
      }
      setSessionsLoading(false);
    })();
  }, []);

  // ── Scroll ────────────────────────────────────────────────────────────────
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // ── Session loading ────────────────────────────────────────────────────────
  const loadSession = async (sessionId: string, sessionList?: SessionSummary[]) => {
    setSwitchingSession(true);
    setSessionsOpen(false);
    try {
      const msgs = await getSessionMessages(sessionId);
      const chatMsgs = sessionMessagesToChatMessages(msgs);
      setMessages(chatMsgs.length > 0 ? chatMsgs : [WELCOME_MSG]);
      setCurrentSessionId(sessionId);
      if (sessionList) setSessions(sessionList);
    } catch {
      toast.error('載入對話失敗');
    } finally {
      setSwitchingSession(false);
    }
  };

  const startNewSession = () => {
    setCurrentSessionId(null);
    setMessages([WELCOME_MSG]);
    setSessionsOpen(false);
    setEditingTitle(false);
  };

  // ── Title editing ──────────────────────────────────────────────────────────
  const beginEditTitle = () => {
    if (!currentSession) return;
    setTitleDraft(currentSession.title ?? '');
    setEditingTitle(true);
    setTimeout(() => titleInputRef.current?.focus(), 0);
  };

  const commitTitle = async () => {
    if (!currentSessionId || !titleDraft.trim()) { setEditingTitle(false); return; }
    try {
      await updateSessionTitle(currentSessionId, titleDraft.trim());
      setSessions(prev => prev.map(s => s.id === currentSessionId ? { ...s, title: titleDraft.trim() } : s));
    } catch { toast.error('更新標題失敗'); }
    setEditingTitle(false);
  };

  // ── Archive ─────────────────────────────────────────────────────────────────
  const handleArchive = async () => {
    if (!currentSessionId) return;
    try {
      await archiveSession(currentSessionId);
      toast.success('對話已封存');
      const list = await refreshSessions();
      if (list.length > 0) {
        await loadSession(list[0].id, list);
      } else {
        startNewSession();
      }
    } catch { toast.error('封存失敗'); }
  };

  // ── Send ────────────────────────────────────────────────────────────────────
  const handleSend = async () => {
    const text = input.trim();
    if (!text || loading) return;

    const userMsg: ChatMessage = {
      id: Date.now().toString(),
      role: 'user',
      content: text,
    };
    const assistantMsg: ChatMessage = {
      id: (Date.now() + 1).toString(),
      role: 'assistant',
      content: '',
      toolEvents: [],
    };

    setMessages(prev => [...prev, userMsg, assistantMsg]);
    setInput('');
    setLoading(true);

    const history = messages
      .filter(m => m.id !== 'welcome' && (m.role === 'user' || (m.role === 'assistant' && m.content)))
      .map(m => ({ role: m.role, content: m.content }));

    let hasViewChange = false;
    let newSessionId: string | null = null;

    try {
      const aiOptions = {
        provider: selectedProvider || undefined,
        model: selectedModel,
        session_id: currentSessionId ?? undefined,
      };
      for await (const chunk of sendChat(text, history, aiOptions)) {
        const c = chunk as SSEChunk;

        if (c.type === 'text') {
          setMessages(prev =>
            prev.map(m => m.id === assistantMsg.id ? { ...m, content: m.content + c.content } : m)
          );
        } else if (c.type === 'tool_start') {
          const event: ToolEvent = { type: 'tool_start', tool: c.tool };
          setMessages(prev =>
            prev.map(m =>
              m.id === assistantMsg.id
                ? { ...m, toolEvents: [...(m.toolEvents ?? []), event] }
                : m
            )
          );
        } else if (c.type === 'tool_result') {
          const event: ToolEvent = { type: 'tool_result', tool: c.tool, result: c.result };
          setMessages(prev =>
            prev.map(m =>
              m.id === assistantMsg.id
                ? {
                    ...m,
                    toolEvents: (m.toolEvents ?? []).map(e =>
                      e.type === 'tool_start' && e.tool === c.tool && !e.result ? event : e
                    ),
                  }
                : m
            )
          );
          if (c.tool === 'manage_schema' || c.tool === 'manage_ui') hasViewChange = true;
        } else if (c.type === 'done') {
          if (hasViewChange) onViewsChanged();
          if (c.session_id) newSessionId = c.session_id;
        } else if (c.type === 'error') {
          setMessages(prev =>
            prev.map(m =>
              m.id === assistantMsg.id ? { ...m, content: `錯誤：${c.message}` } : m
            )
          );
        }
      }
    } catch (err) {
      setMessages(prev =>
        prev.map(m =>
          m.id === assistantMsg.id ? { ...m, content: `發生錯誤：${String(err)}` } : m
        )
      );
    } finally {
      setLoading(false);
      // Update session state after response
      if (newSessionId && !currentSessionId) {
        setCurrentSessionId(newSessionId);
      }
      // Refresh session list to update title/updated_at
      void refreshSessions();
    }
  };

  // ── Render ───────────────────────────────────────────────────────────────────

  return (
    <div className={cn('flex h-full flex-col bg-background', className)}>
      {/* Session header */}
      <div className="flex shrink-0 items-center gap-1.5 border-b px-3 py-2">
        {/* New session */}
        <Button
          variant="ghost"
          size="icon"
          title="新對話"
          onClick={startNewSession}
          className="h-7 w-7 shrink-0"
        >
          <Plus size={14} />
        </Button>

        {/* Session selector / title */}
        <Popover open={sessionsOpen} onOpenChange={setSessionsOpen}>
          <PopoverTrigger asChild>
            <button
              className="flex min-w-0 flex-1 items-center gap-1 rounded-md px-2 py-1 text-xs hover:bg-accent"
              title="切換對話"
            >
              {sessionsLoading || switchingSession ? (
                <Loader2 size={12} className="animate-spin text-muted-foreground" />
              ) : (
                <>
                  <span className="truncate text-muted-foreground">
                    {currentSession?.title ?? (currentSessionId ? '（無標題）' : '新對話')}
                  </span>
                  <ChevronDown size={12} className="shrink-0 text-muted-foreground" />
                </>
              )}
            </button>
          </PopoverTrigger>
          <PopoverContent className="w-72 p-0" align="start">
            <div className="max-h-64 overflow-y-auto">
              {sessions.length === 0 ? (
                <div className="px-3 py-4 text-center text-xs text-muted-foreground">尚無歷史對話</div>
              ) : (
                sessions.map(s => (
                  <button
                    key={s.id}
                    onClick={() => void loadSession(s.id)}
                    className={cn(
                      'flex w-full flex-col px-3 py-2.5 text-left hover:bg-accent',
                      s.id === currentSessionId && 'bg-accent'
                    )}
                  >
                    <span className="truncate text-xs font-medium">{s.title ?? '（無標題）'}</span>
                    <span className="text-xs text-muted-foreground">
                      {new Date(s.updated_at).toLocaleString('zh-TW', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                      {' · '}{s.message_count} 則
                    </span>
                  </button>
                ))
              )}
            </div>
          </PopoverContent>
        </Popover>

        {/* Title edit (only when session exists) */}
        {currentSessionId && !editingTitle && (
          <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0" title="編輯標題" onClick={beginEditTitle}>
            <Pencil size={12} />
          </Button>
        )}
        {currentSessionId && editingTitle && (
          <div className="flex flex-1 items-center gap-1">
            <input
              ref={titleInputRef}
              value={titleDraft}
              onChange={e => setTitleDraft(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter') void commitTitle();
                if (e.key === 'Escape') setEditingTitle(false);
              }}
              className="min-w-0 flex-1 rounded border bg-background px-2 py-0.5 text-xs outline-none focus:ring-1 focus:ring-ring"
              placeholder="輸入標題..."
            />
            <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => void commitTitle()}>
              <Check size={11} />
            </Button>
            <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => setEditingTitle(false)}>
              <X size={11} />
            </Button>
          </div>
        )}

        {/* Archive */}
        {currentSessionId && !editingTitle && (
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7 shrink-0"
            title="封存此對話"
            onClick={() => void handleArchive()}
          >
            <Archive size={12} />
          </Button>
        )}
      </div>

      {/* Messages */}
      <div className="flex-1 space-y-4 overflow-y-auto px-4 py-4">
        {switchingSession ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : (
          messages.map(msg => <MessageBubble key={msg.id} message={msg} />)
        )}
        <div ref={bottomRef} />
      </div>

      {/* Input area */}
      <div className="border-t px-4 py-3">
        {providers.length > 1 && (
          <ProviderSelector
            providers={providers}
            selectedProvider={selectedProvider}
            selectedModel={selectedModel}
            onProviderChange={(p) => {
              setSelectedProvider(p);
              const info = providers.find(x => x.name === p);
              if (info) setSelectedModel(info.default_model);
            }}
            onModelChange={setSelectedModel}
          />
        )}
        <div className="flex gap-2">
          <Textarea
            className="min-h-[74px] flex-1 resize-none"
            rows={2}
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                void handleSend();
              }
            }}
            placeholder="描述你想要的功能... (Enter 送出)"
            disabled={loading}
          />
          <Button
            onClick={() => void handleSend()}
            disabled={loading || !input.trim()}
            size="icon"
            className="self-end"
          >
            {loading ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
          </Button>
        </div>
      </div>
    </div>
  );
}

// ── Message bubble ─────────────────────────────────────────────────────────────

function MessageBubble({ message }: { message: ChatMessage }) {
  const isUser = message.role === 'user';

  return (
    <div className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}>
      <div className={`max-w-[85%] ${isUser ? 'order-1' : 'order-2'}`}>
        {isUser ? (
          <div className="whitespace-pre-wrap rounded-2xl rounded-tr-sm bg-primary px-4 py-2.5 text-sm text-primary-foreground">
            {message.content}
          </div>
        ) : (
          <div>
            {message.toolEvents && message.toolEvents.length > 0 && (
              <div className="mb-2 space-y-1">
                {message.toolEvents.map((event, i) => (
                  <ToolEventBadge key={i} event={event} />
                ))}
              </div>
            )}
            {message.content && (
              <div className="rounded-2xl rounded-tl-sm bg-muted px-4 py-2.5 text-sm text-foreground">
                <MarkdownRenderer content={message.content} />
              </div>
            )}
            {!message.content && (!message.toolEvents || message.toolEvents.length === 0) && (
              <div className="rounded-2xl rounded-tl-sm bg-muted px-4 py-2.5">
                <Loader2 size={14} className="animate-spin text-muted-foreground" />
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Provider selector ──────────────────────────────────────────────────────────

const PROVIDER_LABELS: Record<string, string> = {
  claude: 'Claude',
  openai: 'OpenAI',
  gemini: 'Gemini',
};

function ProviderSelector({
  providers,
  selectedProvider,
  selectedModel,
  onProviderChange,
  onModelChange,
}: {
  providers: AIProviderInfo[];
  selectedProvider: string;
  selectedModel: string;
  onProviderChange: (p: string) => void;
  onModelChange: (m: string) => void;
}) {
  const currentModels = providers.find(p => p.name === selectedProvider)?.models ?? [];

  return (
    <div className="mb-2 flex items-center gap-2">
      <Select value={selectedProvider} onValueChange={onProviderChange}>
        <SelectTrigger className="h-7 w-auto min-w-[90px] px-2 py-0 text-xs">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {providers.map(p => (
            <SelectItem key={p.name} value={p.name} className="text-xs">
              {PROVIDER_LABELS[p.name] ?? p.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Select value={selectedModel} onValueChange={onModelChange}>
        <SelectTrigger className="h-7 w-auto min-w-[140px] px-2 py-0 text-xs">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {currentModels.map(m => (
            <SelectItem key={m} value={m} className="text-xs">
              {m}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

// ── Tool event badges ──────────────────────────────────────────────────────────

const TOOL_LABELS: Record<string, string> = {
  manage_schema: '資料結構',
  manage_ui: '介面',
  query_data: '資料查詢',
  write_data: '資料寫入',
};

function ToolEventBadge({ event }: { event: ToolEvent }) {
  const label = TOOL_LABELS[event.tool] ?? event.tool;

  if (event.type === 'tool_start') {
    return (
      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <Wrench size={11} className="animate-pulse" />
        <span>更新{label}中...</span>
      </div>
    );
  }

  if (event.type === 'tool_result') {
    const ok = event.result?.success;
    return (
      <div className="flex items-center gap-1.5 text-xs">
        {ok ? <CheckCircle size={11} /> : <XCircle size={11} />}
        <Badge variant={ok ? 'secondary' : 'destructive'}>{event.result?.message}</Badge>
      </div>
    );
  }

  return null;
}
