import Anthropic from '@anthropic-ai/sdk';
import type { LLMMessage, LLMResponse, ToolCall } from '../types';
import type { AIProvider, ChatParams, ToolDefinition } from './types';

export class ClaudeProvider implements AIProvider {
  readonly name = 'claude';
  private client: Anthropic;

  constructor(apiKey?: string) {
    this.client = new Anthropic(apiKey ? { apiKey } : undefined);
  }

  async chat(params: ChatParams): Promise<LLMResponse> {
    const startTime = Date.now();

    const tools = params.tools.map(t => this.toAnthropicTool(t));
    // Mark the end of static content so Anthropic can cache system prompt + tools.
    // Cache TTL is 5 min; hits cost ~90% less than regular input tokens.
    if (tools.length > 0) {
      (tools[tools.length - 1] as unknown as Record<string, unknown>).cache_control = { type: 'ephemeral' };
    }

    const response = await this.client.messages.create({
      model: params.model,
      max_tokens: params.maxTokens ?? 4096,
      system: [{ type: 'text', text: params.system, cache_control: { type: 'ephemeral' } }],
      tools: tools as Anthropic.Tool[],
      messages: this.toAnthropicMessages(params.messages),
    });

    const text = response.content
      .filter((b): b is Anthropic.TextBlock => b.type === 'text')
      .map(b => b.text)
      .join('');

    const tool_calls: ToolCall[] = response.content
      .filter((b): b is Anthropic.ToolUseBlock => b.type === 'tool_use')
      .map(b => ({ id: b.id, name: b.name, input: b.input as Record<string, unknown> }));

    return {
      content: text,
      tool_calls,
      stop_reason: response.stop_reason === 'tool_use' ? 'tool_use' : 'end_turn',
      usage: {
        input_tokens: response.usage.input_tokens,
        output_tokens: response.usage.output_tokens,
        cache_read_tokens: (response.usage as unknown as Record<string, number>).cache_read_input_tokens ?? 0,
        cache_write_tokens: (response.usage as unknown as Record<string, number>).cache_creation_input_tokens ?? 0,
      },
      latency_ms: Date.now() - startTime,
    };
  }

  // ── Format conversion ────────────────────────────────────────────

  private toAnthropicTool(t: ToolDefinition): Anthropic.Tool {
    return {
      name: t.name,
      description: t.description,
      input_schema: t.input_schema as Anthropic.Tool.InputSchema,
    };
  }

  private toAnthropicMessages(messages: LLMMessage[]): Anthropic.MessageParam[] {
    const result: Anthropic.MessageParam[] = [];

    for (const msg of messages) {
      if (msg.tool_results && msg.tool_results.length > 0) {
        // Tool results → Anthropic expects them as user messages
        result.push({
          role: 'user',
          content: msg.tool_results.map(r => ({
            type: 'tool_result' as const,
            tool_use_id: r.tool_use_id,
            content: r.content,
          })),
        });
      } else if (msg.role === 'assistant') {
        const content: (Anthropic.TextBlockParam | Anthropic.ToolUseBlockParam)[] = [];
        if (msg.content) {
          content.push({ type: 'text', text: msg.content });
        }
        if (msg.tool_calls) {
          for (const tc of msg.tool_calls) {
            content.push({
              type: 'tool_use',
              id: tc.id,
              name: tc.name,
              input: tc.input,
            });
          }
        }
        result.push({ role: 'assistant', content });
      } else if (msg.content_blocks && msg.content_blocks.length > 0) {
        // user message with multimodal content blocks
        const blocks: Anthropic.ContentBlockParam[] = msg.content_blocks.map(b => {
          if (b.type === 'image' && b.source) {
            return {
              type: 'image',
              source: {
                type: 'base64',
                media_type: b.source.media_type as 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp',
                data: b.source.data,
              },
            } as Anthropic.ImageBlockParam;
          }
          if (b.type === 'document' && b.source) {
            return {
              type: 'document',
              source: {
                type: 'base64',
                media_type: b.source.media_type as 'application/pdf',
                data: b.source.data,
              },
            } as unknown as Anthropic.ContentBlockParam;
          }
          return { type: 'text', text: b.text ?? '' } as Anthropic.TextBlockParam;
        });
        if (msg.content) blocks.push({ type: 'text', text: msg.content });
        result.push({ role: 'user', content: blocks });
      } else {
        // user or system → plain text
        result.push({ role: 'user', content: msg.content });
      }
    }

    return result;
  }
}
