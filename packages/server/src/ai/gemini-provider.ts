import { GoogleGenerativeAI, type Content, type Part } from '@google/generative-ai';
import type { LLMMessage, LLMResponse, ToolCall } from '../types';
import type { AIProvider, ChatParams, ToolDefinition } from './types';

export class GeminiProvider implements AIProvider {
  readonly name = 'gemini';
  private client: GoogleGenerativeAI;

  constructor(apiKey: string) {
    this.client = new GoogleGenerativeAI(apiKey);
  }

  async chat(params: ChatParams): Promise<LLMResponse> {
    const startTime = Date.now();

    const model = this.client.getGenerativeModel({
      model: params.model,
      systemInstruction: params.system,
      tools: [{
        functionDeclarations: params.tools.map(t => this.toGeminiFunctionDeclaration(t)) as never,
      }],
    });

    const result = await model.generateContent({
      contents: this.toGeminiContents(params.messages),
    });

    const response = result.response;
    const parts = response.candidates?.[0]?.content?.parts ?? [];

    const text = parts
      .filter(p => p.text != null)
      .map(p => p.text!)
      .join('');

    const tool_calls: ToolCall[] = parts
      .filter(p => p.functionCall != null)
      .map((p, i) => ({
        id: `gemini-${Date.now()}-${i}`,
        name: p.functionCall!.name,
        input: (p.functionCall!.args ?? {}) as Record<string, unknown>,
      }));

    return {
      content: text,
      tool_calls,
      stop_reason: tool_calls.length > 0 ? 'tool_use' : 'end_turn',
      usage: {
        input_tokens: response.usageMetadata?.promptTokenCount ?? 0,
        output_tokens: response.usageMetadata?.candidatesTokenCount ?? 0,
      },
      latency_ms: Date.now() - startTime,
    };
  }

  // ── Format conversion ────────────────────────────────────────────

  private toGeminiFunctionDeclaration(t: ToolDefinition) {
    // Gemini SDK's FunctionDeclarationSchema type is strict;
    // our JSON Schema objects are structurally compatible at runtime.
    return {
      name: t.name,
      description: t.description,
      parameters: t.input_schema as Record<string, unknown>,
    };
  }

  private toGeminiContents(messages: LLMMessage[]): Content[] {
    const result: Content[] = [];

    for (let i = 0; i < messages.length; i++) {
      const msg = messages[i];

      if (msg.tool_results && msg.tool_results.length > 0) {
        // Gemini expects functionResponse parts in a 'user' turn.
        // Look up the function names from the preceding assistant message.
        const prevMsg = messages[i - 1];
        const parts: Part[] = msg.tool_results.map(r => {
          const tc = prevMsg?.tool_calls?.find(c => c.id === r.tool_use_id);
          return {
            functionResponse: {
              name: tc?.name ?? 'unknown',
              response: safeJsonParse(r.content),
            },
          };
        });
        result.push({ role: 'user', parts });
      } else if (msg.role === 'assistant') {
        const parts: Part[] = [];
        if (msg.content) parts.push({ text: msg.content });
        if (msg.tool_calls) {
          for (const tc of msg.tool_calls) {
            parts.push({ functionCall: { name: tc.name, args: tc.input } });
          }
        }
        if (parts.length > 0) result.push({ role: 'model', parts });
      } else {
        // user or system → user turn
        result.push({ role: 'user', parts: [{ text: msg.content }] });
      }
    }

    return result;
  }
}

function safeJsonParse(s: string): Record<string, unknown> {
  try { return JSON.parse(s) as Record<string, unknown>; }
  catch { return { raw: s }; }
}
