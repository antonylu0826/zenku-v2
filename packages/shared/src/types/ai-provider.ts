export type AIProvider = 'claude' | 'openai' | 'gemini' | 'openrouter';

export interface AIProviderConfig {
  provider: AIProvider;
  model: string;
  apiKey: string;
  baseUrl?: string;
  maxTokens?: number;
  temperature?: number;
}

export const AI_MODELS: Record<AIProvider, string[]> = {
  claude: ['claude-sonnet-4-6', 'claude-haiku-4-5-20251001', 'claude-opus-4-6'],
  openai: ['gpt-4o', 'gpt-4o-mini', 'o3-mini'],
  gemini: ['gemini-2.5-flash', 'gemini-2.5-pro'],
  openrouter: ['deepseek/deepseek-r1', 'deepseek/deepseek-chat', 'meta-llama/llama-4-maverick', 'mistralai/mistral-small-3.1', 'google/gemini-2.5-flash-preview', 'anthropic/claude-sonnet-4-6'],
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
  'deepseek/deepseek-r1':            { input: 0.55,  output: 2.19 },
  'deepseek/deepseek-chat':          { input: 0.14,  output: 0.28 },
  'meta-llama/llama-4-maverick':     { input: 0.08,  output: 0.32 },
  'mistralai/mistral-small-3.1':     { input: 0.10,  output: 0.30 },
  'google/gemini-2.5-flash-preview':  { input: 0.15,  output: 0.60 },
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
