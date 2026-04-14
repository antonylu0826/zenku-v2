import OpenAI from 'openai';
import type { LLMMessage, LLMResponse, ToolCall } from '../types';
import type { AIProvider, ChatParams, ToolDefinition } from './types';

type OAIMessage = OpenAI.ChatCompletionMessageParam;

export class OpenAIProvider implements AIProvider {
  readonly name = 'openai';
  private client: OpenAI;

  constructor(apiKey: string) {
    this.client = new OpenAI({ apiKey });
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

  // ── Format conversion ────────────────────────────────────────────

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

  private toOpenAIMessages(messages: LLMMessage[]): OAIMessage[] {
    const result: OAIMessage[] = [];

    for (const msg of messages) {
      if (msg.tool_results && msg.tool_results.length > 0) {
        // OpenAI wants one 'tool' message per tool result
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
      } else {
        result.push({ role: 'user' as const, content: msg.content });
      }
    }

    return result;
  }
}
