import OpenAI from 'openai';
import type { LLMMessage, LLMResponse, ToolCall } from '../types';
import type { AIProvider, ChatParams, ToolDefinition } from './types';

export class OllamaProvider implements AIProvider {
  readonly name = 'ollama';
  private client: OpenAI;

  constructor(ollamaUrl: string) {
    this.client = new OpenAI({
      apiKey: 'ollama',
      baseURL: `${ollamaUrl.replace(/\/+$/, '')}/v1`,
    });
  }

  async chat(params: ChatParams): Promise<LLMResponse> {
    const startTime = Date.now();

    const response = await this.client.chat.completions.create({
      model: params.model,
      max_tokens: params.maxTokens ?? 4096,
      messages: [
        { role: 'system' as const, content: params.system },
        ...this.toOpenAIMessages(params.messages),
      ],
      tools: params.tools.map(t => this.toOpenAITool(t)),
    });

    const choice = response.choices[0];
    if (!choice) {
      return {
        content: '',
        tool_calls: [],
        stop_reason: 'end_turn',
        usage: { input_tokens: 0, output_tokens: 0 },
        latency_ms: Date.now() - startTime,
      };
    }

    const tool_calls: ToolCall[] = (choice.message.tool_calls ?? [])
      .filter((tc): tc is Extract<typeof tc, { type: 'function' }> => tc.type === 'function')
      .map(tc => ({
        id: tc.id,
        name: tc.function.name,
        input: JSON.parse(tc.function.arguments) as Record<string, unknown>,
      }));

    return {
      content: choice.message.content ?? '',
      tool_calls,
      stop_reason: choice.finish_reason === 'tool_calls' ? 'tool_use' : 'end_turn',
      usage: {
        input_tokens: response.usage?.prompt_tokens ?? 0,
        output_tokens: response.usage?.completion_tokens ?? 0,
      },
      latency_ms: Date.now() - startTime,
    };
  }

  private toOpenAITool(t: ToolDefinition): OpenAI.ChatCompletionTool {
    return {
      type: 'function',
      function: {
        name: t.name,
        description: t.description,
        parameters: t.input_schema as OpenAI.FunctionParameters,
      },
    };
  }

  private toOpenAIMessages(messages: LLMMessage[]): OpenAI.ChatCompletionMessageParam[] {
    const result: OpenAI.ChatCompletionMessageParam[] = [];

    for (const msg of messages) {
      if (msg.tool_results && msg.tool_results.length > 0) {
        for (const r of msg.tool_results) {
          result.push({
            role: 'tool' as const,
            tool_call_id: r.tool_use_id,
            content: r.content,
          });
        }
      } else if (msg.role === 'assistant') {
        const oaiMsg: OpenAI.ChatCompletionAssistantMessageParam = {
          role: 'assistant',
          content: msg.content || null,
        };
        if (msg.tool_calls && msg.tool_calls.length > 0) {
          oaiMsg.tool_calls = msg.tool_calls.map(tc => ({
            id: tc.id,
            type: 'function' as const,
            function: {
              name: tc.name,
              arguments: JSON.stringify(tc.input),
            },
          }));
        }
        result.push(oaiMsg);
      } else if (msg.content_blocks && msg.content_blocks.length > 0) {
        const parts: OpenAI.ChatCompletionContentPart[] = msg.content_blocks.map(b => {
          if (b.type === 'image' && b.source) {
            return {
              type: 'image_url' as const,
              image_url: { url: `data:${b.source.media_type};base64,${b.source.data}` },
            };
          }
          return { type: 'text' as const, text: b.text ?? `[Attachment: format ${b.source?.media_type ?? 'unknown'} not supported]` };
        });
        if (msg.content) parts.push({ type: 'text' as const, text: msg.content });
        result.push({ role: 'user' as const, content: parts });
      } else {
        result.push({ role: 'user' as const, content: msg.content });
      }
    }

    return result;
  }
}