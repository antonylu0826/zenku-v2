import { useState, useRef, useEffect } from 'react';
import { Send, Loader2, Wrench, CheckCircle, XCircle } from 'lucide-react';
import { sendChat, getAIProviders, type AIProviderInfo } from '../api';
import type { ChatMessage, SSEChunk, ToolEvent } from '../types';
import { Button } from './ui/button';
import { Textarea } from './ui/textarea';
import { Badge } from './ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { cn } from '../lib/cn';

interface Props {
  onViewsChanged: () => void;
  className?: string;
}

export function ChatPanel({ onViewsChanged, className }: Props) {
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: 'welcome',
      role: 'assistant',
      content: '你好！我是 Zenku。告訴我你想要管理什麼資料，我來幫你建立應用。\n\n例如：「我要管理客戶資料，有姓名、電話、email」',
    },
  ]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  // AI provider/model state
  const [providers, setProviders] = useState<AIProviderInfo[]>([]);
  const [selectedProvider, setSelectedProvider] = useState('');
  const [selectedModel, setSelectedModel] = useState('');

  useEffect(() => {
    getAIProviders().then(list => {
      setProviders(list);
      if (list.length > 0 && !selectedProvider) {
        setSelectedProvider(list[0].name);
        setSelectedModel(list[0].default_model);
      }
    }).catch(() => {});
  }, []);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

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
      .filter(m => m.role === 'user' || (m.role === 'assistant' && m.content))
      .map(m => ({ role: m.role, content: m.content }));

    let hasViewChange = false;

    try {
      const aiOptions = selectedProvider ? { provider: selectedProvider, model: selectedModel } : undefined;
      for await (const chunk of sendChat(text, history, aiOptions)) {
        const c = chunk as SSEChunk;

        if (c.type === 'text') {
          setMessages(prev =>
            prev.map(m =>
              m.id === assistantMsg.id ? { ...m, content: m.content + c.content } : m
            )
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
          if (c.tool === 'manage_schema' || c.tool === 'manage_ui') {
            hasViewChange = true;
          }
        } else if (c.type === 'done') {
          if (hasViewChange) onViewsChanged();
        } else if (c.type === 'error') {
          setMessages(prev =>
            prev.map(m =>
              m.id === assistantMsg.id
                ? { ...m, content: `錯誤：${c.message}` }
                : m
            )
          );
        }
      }
    } catch (err) {
      setMessages(prev =>
        prev.map(m =>
          m.id === assistantMsg.id
            ? { ...m, content: `發生錯誤：${String(err)}` }
            : m
        )
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className={cn('flex h-full flex-col bg-background', className)}>
      <div className="flex-1 space-y-4 overflow-y-auto px-4 py-4">
        {messages.map(msg => (
          <MessageBubble key={msg.id} message={msg} />
        ))}
        <div ref={bottomRef} />
      </div>

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
                handleSend();
              }
            }}
            placeholder="描述你想要的功能... (Enter 送出)"
            disabled={loading}
          />
          <Button
            onClick={handleSend}
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

function MessageBubble({ message }: { message: ChatMessage }) {
  const isUser = message.role === 'user';

  return (
    <div className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}>
      <div className={`max-w-[85%] ${isUser ? 'order-1' : 'order-2'}`}>
        {isUser ? (
          <div className="rounded-2xl rounded-tr-sm bg-primary px-4 py-2.5 text-sm text-primary-foreground">
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
              <div className="whitespace-pre-wrap rounded-2xl rounded-tl-sm bg-muted px-4 py-2.5 text-sm text-foreground">
                {message.content}
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

// ===== Provider selector =====

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

// ===== Tool event badges =====

const TOOL_LABELS: Record<string, string> = {
  manage_schema: '資料結構',
  manage_ui: '介面',
  query_data: '資料查詢',
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
