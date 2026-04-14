import type { LLMMessage, LLMResponse } from '../types';

/**
 * Provider-agnostic tool definition.
 * Shape matches Anthropic's `input_schema` convention — each provider
 * maps to its own format (OpenAI → `parameters`, Gemini → `parameters`).
 */
export interface ToolDefinition {
  name: string;
  description: string;
  input_schema: {
    type: 'object';
    properties: Record<string, unknown>;
    required?: string[];
  };
}

export interface ChatParams {
  model: string;
  system: string;
  messages: LLMMessage[];
  tools: ToolDefinition[];
  maxTokens?: number;
}

/**
 * An AI provider that can drive the orchestrator's tool-use loop.
 *
 * Each implementation converts between the provider-agnostic LLMMessage /
 * LLMResponse format and the provider's native SDK types.
 */
export interface AIProvider {
  readonly name: string;
  chat(params: ChatParams): Promise<LLMResponse>;
}
