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
    { id: 'deepseek/deepseek-chat-v3-1', label: 'deepseek/deepseek-chat-v3-1' },
    { id: 'deepseek/deepseek-r1', label: 'deepseek/deepseek-r1' },
    { id: 'deepseek/deepseek-r1-0528', label: 'deepseek/deepseek-r1-0528' },
    { id: 'anthropic/claude-sonnet-4-6', label: 'anthropic/claude-sonnet-4-6' },
    { id: 'anthropic/claude-haiku-4-5', label: 'anthropic/claude-haiku-4-5' },
    { id: 'openai/gpt-4o', label: 'openai/gpt-4o' },
    { id: 'openai/gpt-4o-mini', label: 'openai/gpt-4o-mini' },
    { id: 'openai/gpt-4.1', label: 'openai/gpt-4.1' },
    { id: 'openai/gpt-4.1-mini', label: 'openai/gpt-4.1-mini' },
    { id: 'google/gemini-2.5-flash', label: 'google/gemini-2.5-flash' },
    { id: 'google/gemini-2.5-pro', label: 'google/gemini-2.5-pro' },
    { id: 'qwen/qwen3-coder', label: 'qwen/qwen3-coder' },
    { id: 'qwen/qwen3.6-plus', label: 'qwen/qwen3.6-plus' },
    { id: 'qwen/qwen3-coder-plus', label: 'qwen/qwen3-coder-plus' },
    { id: 'z-ai/glm-5.1', label: 'z-ai/glm-5.1' },
    { id: 'minimax/minimax-m2.7', label: 'minimax/minimax-m2.7' },
    { id: 'meta-llama/llama-4-maverick', label: 'meta-llama/llama-4-maverick' },
    { id: 'meta-llama/llama-4-scout', label: 'meta-llama/llama-4-scout' },
    { id: 'mistralai/mistral-small-3.2-24b-instruct', label: 'mistralai/mistral-small-3.2-24b-instruct' },
    { id: 'qwen/qwen3-coder:free', label: 'qwen/qwen3-coder (free)' },
    { id: 'deepseek/deepseek-r1-distill-llama-70b:free', label: 'deepseek-r1-distill-llama-70b (free)' },
    { id: 'meta-llama/llama-3.3-70b-instruct:free', label: 'llama-3.3-70b (free)' },
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
  'gpt-4o':                    { input: 2.5,  output: 10   },
  'gpt-4o-mini':               { input: 0.15, output: 0.6  },
  'o3-mini':                   { input: 1.1,  output: 4.4  },
  'gemini-2.5-flash':          { input: 0.15, output: 0.6  },
  'gemini-2.5-pro':            { input: 1.25, output: 10   },
  // OpenRouter models
  'deepseek/deepseek-chat-v3-1':              { input: 0.15, output: 0.75 },
  'deepseek/deepseek-r1':                     { input: 0.70, output: 2.50 },
  'deepseek/deepseek-r1-0528':                { input: 0.50, output: 2.15 },
  'anthropic/claude-sonnet-4-6':              { input: 3,    output: 15   },
  'anthropic/claude-haiku-4-5':               { input: 1,    output: 5    },
  'openai/gpt-4o':                            { input: 2.5,  output: 10   },
  'openai/gpt-4o-mini':                       { input: 0.15, output: 0.60 },
  'openai/gpt-4.1':                           { input: 2,    output: 8    },
  'openai/gpt-4.1-mini':                      { input: 0.40, output: 1.60 },
  'google/gemini-2.5-flash':                  { input: 0.30, output: 2.50 },
  'google/gemini-2.5-pro':                    { input: 1.25, output: 10   },
  'qwen/qwen3-coder':                         { input: 0.22, output: 1.00 },
  'qwen/qwen3.6-plus':                        { input: 0.33, output: 1.95 },
  'qwen/qwen3-coder-plus':                    { input: 0.65, output: 3.25 },
  'z-ai/glm-5.1':                             { input: 0.95, output: 3.15 },
  'minimax/minimax-m2.7':                     { input: 0.30, output: 1.20 },
  'meta-llama/llama-4-maverick':              { input: 0.15, output: 0.60 },
  'meta-llama/llama-4-scout':                { input: 0.08, output: 0.30 },
  'mistralai/mistral-small-3.2-24b-instruct': { input: 0.07, output: 0.20 },
  'moonshotai/kimi-k2.5':                     { input: 0,    output: 0    },
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
