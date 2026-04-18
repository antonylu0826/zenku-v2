export type AIProvider = 'claude' | 'openai' | 'gemini' | 'openrouter';

export interface AIProviderConfig {
  provider: AIProvider;
  model: string;
  apiKey: string;
  baseUrl?: string;
  maxTokens?: number;
  temperature?: number;
}

export interface ModelOption {
  id: string;
  label?: string;
}

export const AI_MODELS: Record<AIProvider, ModelOption[]> = {
  claude: [
    { id: 'claude-sonnet-4-6' },
    { id: 'claude-haiku-4-5-20251001' },
    { id: 'claude-opus-4-6' },
  ],
  openai: [
    { id: 'gpt-4o' },
    { id: 'gpt-4o-mini' },
    { id: 'o3-mini' },
  ],
  gemini: [
    { id: 'gemini-2.5-flash' },
    { id: 'gemini-2.5-pro' },
  ],
  openrouter: [
    { id: 'anthropic/claude-sonnet-4-6', label: 'anthropic/claude-sonnet-4-6' },
    { id: 'anthropic/claude-haiku-4-5', label: 'anthropic/claude-haiku-4-5' },
    { id: 'anthropic/claude-opus-4.7', label: 'anthropic/claude-opus-4.7' },
    { id: 'openai/gpt-5.4', label: 'openai/gpt-5.4' },
    { id: 'openai/gpt-5.3-codex', label: 'openai/gpt-5.3-codex' },
    { id: 'google/gemini-3.1-pro-preview', label: 'google/gemini-3.1-pro-preview' },
    { id: 'google/gemini-3-flash-preview', label: 'google/gemini-3-flash-preview' },
    { id: 'qwen/qwen3-coder', label: 'qwen/qwen3-coder' },
    { id: 'qwen/qwen3.6-plus', label: 'qwen/qwen3.6-plus' },
    { id: 'qwen/qwen3-coder-plus', label: 'qwen/qwen3-coder-plus' },
    { id: 'z-ai/glm-5.1', label: 'z-ai/glm-5.1' },
    { id: 'minimax/minimax-m2.7', label: 'minimax/minimax-m2.7' },
    { id: 'moonshotai/kimi-k2.7', label: 'moonshotai/kimi-k2.7' },
    { id: 'qwen/qwen3-coder:free', label: 'qwen/qwen3-coder (free)' },
    { id: 'google/gemma-3-27b-it:free', label: 'gemma-3-27b (free)' },
    { id: 'z-ai/glm-4.5-air:free', label: 'glm-4.5-air (free)' },
    { id: 'minimax/minimax-m2.5:free', label: 'minimax-m2.5 (free)' },
    { id: 'moonshotai/kimi-k2.5', label: 'moonshotai/kimi-k2.5 (free)' },
    { id: 'openai/gpt-oss-120b:free', label: 'gpt-oss-120b (free)' },
    { id: 'qwen/qwen3-next-80b-a3b-instruct:free', label: 'qwen3-next-80b (free)' },
  ],
};

/** 每 1M tokens 的 USD 價格 */
export const TOKEN_COSTS: Record<string, { input: number; output: number }> = {
  'claude-sonnet-4-6':         { input: 3,    output: 15   },
  'claude-haiku-4-5-20251001': { input: 0.8,  output: 4    },
  'claude-opus-4-6':           { input: 15,   output: 75   },
  'o3-mini':                   { input: 1.1,  output: 4.4  },
  'gemini-2.5-flash':          { input: 0.15, output: 0.6  },
  'gemini-2.5-pro':            { input: 1.25, output: 10   },
  // OpenRouter models
  'anthropic/claude-sonnet-4-6':              { input: 3,    output: 15   },
  'anthropic/claude-haiku-4-5':               { input: 1,    output: 5    },
  'anthropic/claude-opus-4.7':                { input: 5,    output: 25   },
  'openai/gpt-5.4':                           { input: 2.5,  output: 15   },
  'openai/gpt-5.3-codex':                     { input: 1.75, output: 14   },
  'google/gemini-3.1-pro-preview':            { input: 2,    output: 12   },
  'google/gemini-3-flash-preview':             { input: 0.50, output: 3    },
  'qwen/qwen3-coder':                         { input: 0.22, output: 1.00 },
  'qwen/qwen3.6-plus':                        { input: 0.33, output: 1.95 },
  'qwen/qwen3-coder-plus':                    { input: 0.65, output: 3.25 },
  'z-ai/glm-5.1':                             { input: 0.95, output: 3.15 },
  'minimax/minimax-m2.7':                     { input: 0.30, output: 1.20 },
  'moonshotai/kimi-k2.7':                     { input: 0,    output: 0    },
};

export interface TokenUsage {
  input_tokens: number;
  output_tokens: number;
  cache_read_tokens?: number;
  cache_write_tokens?: number;
  thinking_tokens?: number;
}

export function estimateCost(model: string, usage: TokenUsage): number {
  const cost = TOKEN_COSTS[model];
  if (!cost) return 0;
  return (usage.input_tokens * cost.input + usage.output_tokens * cost.output) / 1_000_000;
}

export interface ToolCall {
  id: string;
  name: string;
  input: Record<string, unknown>;
}

export interface ToolResult {
  tool_use_id: string;
  content: string;
}

export interface ContentBlock {
  type: 'text' | 'image' | 'document';
  text?: string;
  source?: {
    type: 'base64';
    media_type: string;
    data: string;
  };
}

export interface LLMMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
  /** Multimodal content blocks (images, documents). Set alongside content for user messages. */
  content_blocks?: ContentBlock[];
  tool_calls?: ToolCall[];
  tool_results?: ToolResult[];
}

export interface ChatAttachment {
  filename: string;
  mime_type: string;
  data: string; // base64
}

export interface LLMResponse {
  content: string;
  tool_calls: ToolCall[];
  stop_reason: 'end_turn' | 'tool_use';
  usage: TokenUsage;
  thinking?: string;
  latency_ms: number;
}
