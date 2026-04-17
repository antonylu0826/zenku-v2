import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ArrowLeft, X, ChevronDown, ChevronRight, Wrench } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';

interface ToolEventRow {
  id: string;
  tool_name: string;
  agent: string;
  tool_input: Record<string, unknown>;
  tool_output: { success: boolean; message: string; data?: unknown };
  latency_ms: number;
  started_at: string;
}

interface MessageRow {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  provider?: string;
  model?: string;
  input_tokens: number;
  output_tokens: number;
  thinking_tokens: number;
  thinking_content?: string;
  latency_ms: number;
  created_at: string;
  tool_events: ToolEventRow[];
}

interface SessionData {
  id: string;
  title: string | null;
  provider: string;
  model: string;
  user_name: string;
  message_count: number;
  total_input_tokens: number;
  total_output_tokens: number;
  total_cost_usd: number;
  created_at: string;
}

interface Props {
  sessionId: string;
  onBack: () => void;
  onClose: () => void;
}

function ToolEventCard({ event }: { event: ToolEventRow }) {
  const { t } = useTranslation();
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="ml-4 mt-1 rounded border border-dashed border-muted-foreground/30 bg-muted/20 text-xs">
      <button
        className="flex w-full items-center gap-1.5 px-3 py-2 hover:bg-muted/30"
        onClick={() => setExpanded(e => !e)}
      >
        <Wrench size={11} className="text-muted-foreground" />
        <span className="font-mono font-medium">{event.tool_name}</span>
        <span className={`ml-1 rounded-full px-1.5 py-0.5 ${event.tool_output.success ? 'bg-green-500/15 text-green-600' : 'bg-red-500/15 text-red-600'}`}>
          {event.tool_output.success ? t('admin.chat.tool_ok') : t('admin.chat.tool_fail')}
        </span>
        <span className="ml-auto text-muted-foreground">{event.latency_ms}ms</span>
        {expanded ? <ChevronDown size={11} /> : <ChevronRight size={11} />}
      </button>
      {expanded && (
        <div className="space-y-2 border-t px-3 py-2">
          <div>
            <div className="mb-1 font-medium text-muted-foreground">Input</div>
            <pre className="overflow-auto rounded bg-muted/40 p-2 text-[10px] leading-relaxed">
              {JSON.stringify(event.tool_input, null, 2)}
            </pre>
          </div>
          <div>
            <div className="mb-1 font-medium text-muted-foreground">Output</div>
            <div className="text-muted-foreground">{event.tool_output.message}</div>
            {!!event.tool_output.data && (
              <pre className="mt-1 overflow-auto rounded bg-muted/40 p-2 text-[10px] leading-relaxed">
                {JSON.stringify(event.tool_output.data, null, 2)}
              </pre>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function MessageBubble({ msg }: { msg: MessageRow }) {
  const { t, i18n } = useTranslation();
  const [showThinking, setShowThinking] = useState(false);
  const isUser = msg.role === 'user';

  return (
    <div className={`flex gap-3 ${isUser ? 'flex-row-reverse' : ''}`}>
      {/* Avatar */}
      <div className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[10px] font-bold ${isUser ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'}`}>
        {isUser ? 'U' : 'AI'}
      </div>

      {/* Content */}
      <div className={`flex-1 ${isUser ? 'flex flex-col items-end' : ''}`}>
        {/* Timestamp */}
        <div className="mb-1 text-[10px] text-muted-foreground">
          {new Date(msg.created_at).toLocaleTimeString(i18n.language)}
          {!isUser && msg.model && (
            <span className="ml-2 rounded-full bg-primary/10 px-1.5 py-0.5 font-medium text-primary">
              {msg.model}
            </span>
          )}
        </div>

        {/* Thinking chain */}
        {msg.thinking_content && (
          <div className="mb-2 w-full">
            <button
              className="flex items-center gap-1 text-[10px] text-muted-foreground hover:text-foreground"
              onClick={() => setShowThinking(v => !v)}
            >
              {showThinking ? <ChevronDown size={10} /> : <ChevronRight size={10} />}
              {t('admin.chat.thinking_chain', { tokens: msg.thinking_tokens })}
            </button>
            {showThinking && (
              <pre className="mt-1 overflow-auto rounded border border-dashed bg-muted/20 p-2 text-[10px] leading-relaxed text-muted-foreground">
                {msg.thinking_content}
              </pre>
            )}
          </div>
        )}

        {/* Tool events */}
        {msg.tool_events.length > 0 && (
          <div className="mb-2 w-full space-y-1">
            {msg.tool_events.map(te => <ToolEventCard key={te.id} event={te} />)}
          </div>
        )}

        {/* Text bubble */}
        {msg.content && (
          <div className={`max-w-lg rounded-lg px-3 py-2 text-sm leading-relaxed ${isUser ? 'bg-primary text-primary-foreground' : 'border bg-card'}`}>
            {msg.content}
          </div>
        )}

        {/* Token stats */}
        {!isUser && (msg.input_tokens > 0 || msg.output_tokens > 0) && (
          <div className="mt-1 text-[10px] text-muted-foreground">
            {msg.input_tokens.toLocaleString()} in / {msg.output_tokens.toLocaleString()} out
            {msg.thinking_tokens > 0 && ` / ${msg.thinking_tokens.toLocaleString()} thinking`}
            {' | '}{(msg.latency_ms / 1000).toFixed(1)}s
          </div>
        )}
      </div>
    </div>
  );
}

export function SessionDetail({ sessionId, onBack, onClose }: Props) {
  const { t } = useTranslation();
  const { token } = useAuth();
  const [session, setSession] = useState<SessionData | null>(null);
  const [messages, setMessages] = useState<MessageRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    void (async () => {
      const res = await fetch(`/api/admin/sessions/${sessionId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json() as { session: SessionData; messages: MessageRow[] };
        setSession(data.session);
        setMessages(data.messages);
      }
      setLoading(false);
    })();
  }, [sessionId]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="flex w-full max-w-3xl flex-col overflow-hidden rounded-xl border bg-background shadow-xl" style={{ maxHeight: '85vh' }}>
        {/* Header */}
        <div className="flex items-center gap-3 border-b px-6 py-4">
          <button onClick={onBack} className="rounded-md p-1 hover:bg-accent">
            <ArrowLeft size={16} />
          </button>
          <div className="flex-1">
            <h2 className="text-base font-semibold">{session?.title ?? t('admin.chat.session_detail')}</h2>
            {session && (
              <p className="text-xs text-muted-foreground">
                {session.user_name} · {session.provider}/{session.model} · {t('admin.chat.msg_count', { count: session.message_count })}
                · {t('admin.chat.token_total', { count: (session.total_input_tokens + session.total_output_tokens).toLocaleString() })}
                · ${session.total_cost_usd.toFixed(4)}
              </p>
            )}
          </div>
          <button onClick={onClose} className="rounded-md p-1 hover:bg-accent">
            <X size={16} />
          </button>
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto p-4">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <div className="h-5 w-5 animate-spin rounded-full border-2 border-primary border-t-transparent" />
            </div>
          ) : messages.length === 0 ? (
            <div className="py-12 text-center text-sm text-muted-foreground">{t('admin.chat.no_messages')}</div>
          ) : (
            <div className="space-y-6">
              {messages.map(msg => <MessageBubble key={msg.id} msg={msg} />)}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
