import { useState, useRef, useEffect, useCallback, type ChangeEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { Send, Loader2, Wrench, CheckCircle, XCircle, Plus, Archive, ChevronDown, Pencil, Check, X, Paperclip, Sparkles } from 'lucide-react';
import { MarkdownRenderer } from './MarkdownRenderer';
import {
  sendChat, getAIProviders, getOllamaModels, getSessions, getSessionMessages, updateSessionTitle, archiveSession,
  ApiError,
  type AIProviderInfo, type SessionSummary, type SessionMessage,
} from '../api';
import type { ChatMessage, SSEChunk, ToolEvent } from '../types';
import { Badge } from './ui/badge';
import { Button } from './ui/button';
import { Textarea } from './ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { Popover, PopoverContent, PopoverTrigger } from './ui/popover';
import { cn } from '../lib/cn';
import { toast } from 'sonner';

interface Props {
  onViewsChanged: () => void;
  className?: string;
}

const getWelcomeMsg = (t: (key: string) => string): ChatMessage => ({
  id: 'welcome',
  role: 'assistant',
  content: t('chat.welcome'),
});

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
  const { t, i18n } = useTranslation();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [attachments, setAttachments] = useState<{ file: File; preview?: string }[]>([]);
  const attachInputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const adjustTextareaHeight = useCallback(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 200)}px`;
  }, []);

  const MAX_ATTACH_MB = 4;

  // Use a ref to store the current welcome message to avoid initialization issues
  useEffect(() => {
    if (messages.length === 0) {
      setMessages([getWelcomeMsg(t)]);
    }
  }, [t]);
  const [loading, setLoading] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  // AI provider/model state
  const [providers, setProviders] = useState<AIProviderInfo[]>([]);
  const [selectedProvider, setSelectedProvider] = useState('');
  const [selectedModel, setSelectedModel] = useState('');
  const [ollamaModels, setOllamaModels] = useState<{ id: string; label?: string }[] | null>(null);

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
      setMessages(chatMsgs.length > 0 ? chatMsgs : [getWelcomeMsg(t)]);
      setCurrentSessionId(sessionId);
      if (sessionList) setSessions(sessionList);
    } catch {
      toast.error(t('chat.load_error'));
    } finally {
      setSwitchingSession(false);
    }
  };

  const startNewSession = () => {
    setCurrentSessionId(null);
    setMessages([getWelcomeMsg(t)]);
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
    } catch { toast.error(t('chat.update_title_error')); }
    setEditingTitle(false);
  };

  // ── Archive ─────────────────────────────────────────────────────────────────
  const handleArchive = async () => {
    if (!currentSessionId) return;
    try {
      await archiveSession(currentSessionId);
      toast.success(t('chat.archive_success'));
      const list = await refreshSessions();
      if (list.length > 0) {
        await loadSession(list[0].id, list);
      } else {
        startNewSession();
      }
    } catch { toast.error(t('chat.archive_error')); }
  };

  // ── Send ────────────────────────────────────────────────────────────────────
  const fileToBase64 = (file: File): Promise<string> =>
    new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve((reader.result as string).split(',')[1]);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });

  const handleSend = async () => {
    const text = input.trim();
    if ((!text && attachments.length === 0) || loading) return;

    const attachData = await Promise.all(
      attachments.map(async a => ({
        filename: a.file.name,
        mime_type: a.file.type,
        data: await fileToBase64(a.file),
      }))
    );

    const userMsg: ChatMessage = {
      id: Date.now().toString(),
      role: 'user',
      content: text,
      attachments: attachments.map(a => ({
        filename: a.file.name,
        mime_type: a.file.type,
        previewUrl: a.preview,
      })),
    };
    const assistantMsg: ChatMessage = {
      id: (Date.now() + 1).toString(),
      role: 'assistant',
      content: '',
      toolEvents: [],
    };

    setMessages(prev => [...prev, userMsg, assistantMsg]);
    setInput('');
    setAttachments([]);
    if (textareaRef.current) textareaRef.current.style.height = 'auto';
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
      for await (const chunk of sendChat(text || attachments.map(a => a.file.name).join(', '), history, aiOptions, attachData)) {
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
              m.id === assistantMsg.id ? { ...m, content: `${t('common.error')}：${t('errors.ERROR_INTERNAL_SERVER', { detail: c.message, defaultValue: c.message })}` } : m
            )
          );
        }
      }
    } catch (err) {
      let errorMessage = String(err);
      if (err instanceof ApiError) {
        errorMessage = String(t(`errors.${err.code}`, { ...err.params, defaultValue: err.code }));
      }
      setMessages(prev =>
        prev.map(m =>
          m.id === assistantMsg.id ? { ...m, content: `${t('common.error')}：${errorMessage}` } : m
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
    <div className={cn('flex h-full flex-col bg-card', className)}>
      {/* Session header */}
      <div className="flex h-12 shrink-0 items-center gap-1 border-b px-3">
        <Sparkles className="size-4 shrink-0 text-muted-foreground" />

        {/* Session selector / title (hidden while editing so input can fill the row) */}
        {!editingTitle && (
          <Popover open={sessionsOpen} onOpenChange={setSessionsOpen}>
            <PopoverTrigger asChild>
              <button
                className="flex min-w-0 flex-1 items-center gap-1 rounded-md px-2 py-1 text-sm hover:bg-accent"
                title={t('chat.switch_session')}
              >
                {sessionsLoading || switchingSession ? (
                  <Loader2 size={12} className="animate-spin text-muted-foreground" />
                ) : (
                  <>
                    <span className="truncate text-muted-foreground">
                      {currentSession?.title ?? (currentSessionId ? t('chat.untitled') : t('chat.new_session'))}
                    </span>
                    <ChevronDown size={12} className="shrink-0 text-muted-foreground" />
                  </>
                )}
              </button>
            </PopoverTrigger>
            <PopoverContent className="w-72 p-0" align="start">
              <div className="max-h-64 overflow-y-auto">
                {sessions.length === 0 ? (
                  <div className="px-3 py-4 text-center text-xs text-muted-foreground">{t('chat.no_history')}</div>
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
                      <span className="truncate text-xs font-medium">{s.title ?? t('chat.untitled')}</span>
                      <span className="text-xs text-muted-foreground">
                        {new Date(s.updated_at).toLocaleString(i18n.language, { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                        {' · '}{t('chat.message_count', { count: s.message_count })}
                      </span>
                    </button>
                  ))
                )}
              </div>
            </PopoverContent>
          </Popover>
        )}

        {/* New session (always visible when not editing) */}
        {!editingTitle && (
          <Button
            variant="ghost"
            size="icon"
            title={t('chat.new_session')}
            onClick={startNewSession}
            className="h-7 w-7 shrink-0"
          >
            <Plus size={14} />
          </Button>
        )}

        {/* Title edit (only when session exists) */}
        {currentSessionId && !editingTitle && (
          <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0" title={t('chat.edit_title')} onClick={beginEditTitle}>
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
              placeholder={t('chat.placeholder_title')}
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
            title={t('chat.archive_session')}
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
      <div className="border-t bg-background px-3 py-3">
        {/* Attachment previews */}
        {attachments.length > 0 && (
          <div className="mb-2 flex flex-wrap gap-1.5">
            {attachments.map((a, i) => (
              <div key={i} className="flex items-center gap-1 rounded-full border bg-muted px-2.5 py-0.5 text-xs">
                {a.file.type.startsWith('image/') && a.preview
                  ? <img src={a.preview} alt="" className="h-4 w-4 rounded object-cover" />
                  : <Paperclip size={11} />}
                <span className="max-w-[120px] truncate">{a.file.name}</span>
                <button onClick={() => setAttachments(prev => prev.filter((_, j) => j !== i))} className="ml-0.5 text-muted-foreground hover:text-foreground">
                  <X size={11} />
                </button>
              </div>
            ))}
          </div>
        )}

        <div className="flex items-end gap-1.5 rounded-lg border bg-card p-1.5 focus-within:ring-1 focus-within:ring-ring">
          <input
            ref={attachInputRef}
            id="chat-file-input"
            type="file"
            multiple
            accept="image/*,application/pdf,text/*"
            className="hidden"
            onChange={e => {
              const files = Array.from(e.target.files ?? []);
              e.target.value = '';
              const newItems = files
                .filter(f => {
                  if (f.size > MAX_ATTACH_MB * 1024 * 1024) {
                    toast.error(t('chat.attachment_too_large', { max: MAX_ATTACH_MB, defaultValue: `File exceeds ${MAX_ATTACH_MB} MB limit` }));
                    return false;
                  }
                  return true;
                })
                .map(f => {
                  const item: { file: File; preview?: string } = { file: f };
                  if (f.type.startsWith('image/')) {
                    item.preview = URL.createObjectURL(f);
                  }
                  return item;
                });
              setAttachments(prev => [...prev, ...newItems]);
            }}
          />
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="size-7 shrink-0"
            title={t('chat.attach_file')}
            onClick={() => attachInputRef.current?.click()}
            disabled={loading}
          >
            <Paperclip size={15} />
          </Button>
          <Textarea
            ref={textareaRef}
            id="chat-input"
            className="max-h-[200px] min-h-[36px] flex-1 resize-none overflow-hidden border-0 bg-transparent px-1 py-1.5 text-sm shadow-none focus-visible:ring-0"
            rows={1}
            value={input}
            onChange={(e: ChangeEvent<HTMLTextAreaElement>) => {
              setInput(e.target.value);
              adjustTextareaHeight();
            }}
            onKeyDown={e => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                void handleSend();
              }
            }}
            onPaste={e => {
              const images = Array.from(e.clipboardData.items)
                .filter(item => item.type.startsWith('image/'))
                .map(item => item.getAsFile())
                .filter((f): f is File => f !== null);
              if (images.length === 0) return;
              e.preventDefault();
              const newItems = images.map(f => ({
                file: f,
                preview: URL.createObjectURL(f),
              }));
              setAttachments(prev => [...prev, ...newItems]);
            }}
            placeholder={t('chat.placeholder_input')}
            disabled={loading}
          />
          <Button
            onClick={() => void handleSend()}
            disabled={loading || (!input.trim() && attachments.length === 0)}
            size="icon"
            className="size-7 shrink-0"
          >
            {loading ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
          </Button>
        </div>

        {providers.length > 1 && (
          <ProviderSelector
            providers={providers}
            selectedProvider={selectedProvider}
            selectedModel={selectedModel}
            onProviderChange={async (p) => {
              setSelectedProvider(p);
              if (p === 'ollama') {
                try {
                  const models = await getOllamaModels();
                  setOllamaModels(models);
                  if (models.length > 0) {
                    setSelectedModel(models[0].id);
                  } else {
                    setSelectedModel('llama3.2');
                  }
                } catch {
                  setOllamaModels(null);
                  setSelectedModel('llama3.2');
                }
              } else {
                setOllamaModels(null);
                const info = providers.find(x => x.name === p);
                if (info) setSelectedModel(info.default_model);
              }
            }}
            onModelChange={setSelectedModel}
            ollamaModels={ollamaModels}
          />
        )}
      </div>
    </div>
  );
}

// ── Message bubble ─────────────────────────────────────────────────────────────

function MessageBubble({ message }: { message: ChatMessage }) {
  if (message.role === 'user') {
    return (
      <div className="flex justify-end">
        <div className="max-w-[85%] rounded-lg bg-primary px-3 py-2 text-sm leading-relaxed text-primary-foreground">
          {message.attachments && message.attachments.length > 0 && (
            <div className="mb-2 flex flex-wrap gap-1.5">
              {message.attachments.map((a, i) =>
                a.mime_type.startsWith('image/') && a.previewUrl
                  ? <img key={i} src={a.previewUrl} alt={a.filename} className="h-20 max-w-[160px] rounded object-cover" />
                  : <div key={i} className="flex items-center gap-1 rounded bg-primary-foreground/20 px-2 py-1 text-xs">
                      <Paperclip size={11} />{a.filename}
                    </div>
              )}
            </div>
          )}
          {message.content && <p className="whitespace-pre-wrap">{message.content}</p>}
        </div>
      </div>
    );
  }

  return (
    <div className="flex gap-2">
      <div className="flex size-7 shrink-0 items-center justify-center rounded-md border bg-muted text-muted-foreground">
        <Sparkles className="size-3.5" />
      </div>
      <div className="min-w-0 flex-1 space-y-2">
        {message.toolEvents && message.toolEvents.length > 0 && (
          <div className="space-y-1">
            {message.toolEvents.map((event, i) => (
              <ToolEventBadge key={i} event={event} />
            ))}
          </div>
        )}
        {message.content && (
          <div className="rounded-lg bg-muted/40 px-3 py-2 text-sm leading-relaxed text-foreground">
            <MarkdownRenderer content={message.content} />
          </div>
        )}
        {!message.content && (!message.toolEvents || message.toolEvents.length === 0) && (
          <div className="rounded-lg bg-muted/40 px-3 py-2">
            <Loader2 size={14} className="animate-spin text-muted-foreground" />
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
  openrouter: 'OpenRouter',
  ollama: 'Ollama',
};

function ProviderSelector({
  providers,
  selectedProvider,
  selectedModel,
  onProviderChange,
  onModelChange,
  ollamaModels,
}: {
  providers: AIProviderInfo[];
  selectedProvider: string;
  selectedModel: string;
  onProviderChange: (p: string) => void;
  onModelChange: (m: string) => void;
  ollamaModels: { id: string; label?: string }[] | null;
}) {
  const currentModels = selectedProvider === 'ollama' && ollamaModels !== null
    ? ollamaModels
    : providers.find(p => p.name === selectedProvider)?.models ?? [];

  return (
    <div className="mt-2 flex items-center gap-2 px-1 text-[11px] text-muted-foreground">
      <Select value={selectedProvider} onValueChange={onProviderChange}>
        <SelectTrigger className="h-6 w-auto gap-1 border-0 bg-transparent px-1 py-0 text-[11px] text-muted-foreground shadow-none hover:text-foreground focus:ring-0">
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
      <span>·</span>
      <Select value={selectedModel} onValueChange={onModelChange}>
        <SelectTrigger className="h-6 w-auto gap-1 border-0 bg-transparent px-1 py-0 text-[11px] text-muted-foreground shadow-none hover:text-foreground focus:ring-0">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {currentModels.map(m => (
            <SelectItem key={m.id} value={m.id} className="text-xs">
              {m.label ?? m.id}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

// ── Tool event badges ──────────────────────────────────────────────────────────

function ToolEventBadge({ event }: { event: ToolEvent }) {
  const { t } = useTranslation();

  if (event.type === 'tool_start') {
    const label = t(`chat.tool_labels.${event.tool}`, { defaultValue: event.tool });
    return (
      <div className="flex items-center gap-2 rounded-md border bg-background px-2.5 py-1.5 text-xs">
        <Wrench className="size-3.5 shrink-0 animate-pulse text-muted-foreground" />
        <span className="font-mono font-medium">{event.tool}</span>
        <span className="truncate text-muted-foreground">· {label}</span>
        <Badge variant="secondary" className="ml-auto gap-1 px-1.5 py-0 text-[10px]">
          <Loader2 className="size-3 animate-spin" />
          {t('chat.tool_running', { defaultValue: 'running' })}
        </Badge>
      </div>
    );
  }

  if (event.type === 'tool_result') {
    const ok = event.result?.success;
    const label = t(`chat.tool_labels.${event.tool}`, { defaultValue: event.tool });
    return (
      <div className="flex items-center gap-2 rounded-md border bg-background px-2.5 py-1.5 text-xs">
        <Wrench className="size-3.5 shrink-0 text-muted-foreground" />
        <span className="font-mono font-medium">{event.tool}</span>
        <span className={cn('truncate', ok ? 'text-muted-foreground' : 'text-destructive')}>
          · {ok ? label : event.result?.message ?? label}
        </span>
        {ok ? (
          <Badge variant="secondary" className="ml-auto gap-1 px-1.5 py-0 text-[10px]">
            <CheckCircle className="size-3" />
            {t('chat.tool_done_short', { defaultValue: 'done' })}
          </Badge>
        ) : (
          <Badge variant="destructive" className="ml-auto gap-1 px-1.5 py-0 text-[10px]">
            <XCircle className="size-3" />
            {t('chat.tool_failed_short', { defaultValue: 'failed' })}
          </Badge>
        )}
      </div>
    );
  }

  return null;
}
