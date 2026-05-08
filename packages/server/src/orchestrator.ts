import { getUserTables } from './db/schema';
import { getAllViews } from './db/views';
import { getAllRules } from './db/rules';
import { getUserLanguage } from './db/auth';
import { buildJournalContext } from './tools/journal-tools';
import { createProvider, getDefaultProviderName, getDefaultModel } from './ai';
import {
  createChatSession, updateSessionTitle, updateSessionStats,
  recordMessage, recordToolEvent, toolToAgent,
} from './tools/chat-logger';
import { ALL_TOOLS, dispatchTool } from './tools/registry';
import { getToolsForRole } from './security/tool-policy';
import { buildZenkuInstructions } from './prompts/instruction-builder';
import type { LLMMessage, ToolResult, AIProvider as AIProviderName } from './types';

export interface SystemPromptParts {
  static: string;
  dynamic: string;
}

export async function buildDynamicContext(): Promise<string> {
  const [tables, views, rules, journalCtx] = await Promise.all([
    getUserTables(),
    getAllViews(),
    getAllRules(),
    buildJournalContext(),
  ]);

  const tableListStr = tables.length > 0
    ? tables.map(t => `- ${t}`).join('\n')
    : '(No tables yet)';

  const viewStr = views.length > 0
    ? views.map(v => `- ${v.name} (Source Table: ${v.table_name})`).join('\n')
    : '(No interfaces yet)';

  const rulesStr = rules.length > 0
    ? rules.map(r => {
        let types: string;
        try { const p = JSON.parse(r.trigger_types); types = Array.isArray(p) ? p.join(',') : r.trigger_types; } catch { types = r.trigger_types; }
        return `- ${r.name} (${types} on ${r.table_name})${r.enabled ? '' : ' (Disabled)'}`;
      }).join('\n')
    : '(No rules defined)';

  return `Current Database (Tables):
${tableListStr}

Current Interfaces:
${viewStr}

Current Rules:
${rulesStr}

Recent Operations (for undo reference):
${journalCtx}`;
}

// ===== Main chat loop =====

type UserRole = 'admin' | 'builder' | 'user';

export interface ChatOptions {
  existingSessionId?: string;
  provider?: AIProviderName;
  model?: string;
  userId?: string;
}

export async function* chat(
  userMessage: string,
  history: { role: 'user' | 'assistant'; content: string }[],
  userRole: UserRole = 'admin',
  options?: ChatOptions,
  attachments?: { filename: string; mime_type: string; data: string }[]
): AsyncGenerator<string> {
  const providerName = options?.provider ?? await getDefaultProviderName();
  const model = options?.model ?? await getDefaultModel(providerName);
  const userId = options?.userId;
  const provider = createProvider(providerName);
  const tools = getToolsForRole(userRole, ALL_TOOLS);

  const sessionId = options?.existingSessionId
    ?? (userId ? await createChatSession(userId, providerName, model, userMessage.slice(0, 80)) : null);

  if (sessionId && userId) {
    await recordMessage({ session_id: sessionId, user_id: userId, role: 'user', content: userMessage });
  }

  const userMsg: LLMMessage = { role: 'user' as const, content: userMessage };
  if (attachments && attachments.length > 0) {
    userMsg.content_blocks = attachments.map(a => {
      const isImage = a.mime_type.startsWith('image/');
      const isPdf = a.mime_type === 'application/pdf';
      if (isImage) {
        return { type: 'image' as const, source: { type: 'base64' as const, media_type: a.mime_type, data: a.data } };
      }
      if (isPdf) {
        return { type: 'document' as const, source: { type: 'base64' as const, media_type: a.mime_type, data: a.data } };
      }
      return { type: 'text' as const, text: `[Attachment: ${a.filename}, format ${a.mime_type} is not supported for AI analysis]` };
    });
  }
  const currentMessages: LLMMessage[] = [
    ...history.map(h => ({ role: h.role as 'user' | 'assistant', content: h.content })),
    userMsg,
  ];

  const userLanguage = userId ? await getUserLanguage(userId) : 'zh-TW';
  const staticPrompt = buildZenkuInstructions({ surface: 'chat', language: userLanguage });
  let continueLoop = true;

  while (continueLoop) {
    const dynamicContext = await buildDynamicContext();
    const response = await provider.chat({
      model,
      system: `${staticPrompt}\n\n${dynamicContext}`,
      messages: currentMessages,
      tools,
      maxTokens: 4096,
    });

    if (response.content) {
      yield JSON.stringify({ type: 'text', content: response.content }) + '\n';
    }
    yield JSON.stringify({ type: 'usage', usage: response.usage, latency_ms: response.latency_ms }) + '\n';

    if (response.stop_reason === 'tool_use' && response.tool_calls.length > 0) {
      const assistantMsgId = sessionId && userId
        ? await recordMessage({
            session_id: sessionId,
            user_id: userId,
            role: 'assistant',
            content: response.content,
            provider: providerName,
            model,
            input_tokens: response.usage.input_tokens,
            output_tokens: response.usage.output_tokens,
            thinking_tokens: response.usage.thinking_tokens ?? 0,
            latency_ms: response.latency_ms,
          })
        : null;

      if (sessionId) await updateSessionStats(sessionId, response.usage, model);

      const toolResults: ToolResult[] = [];

      for (const tc of response.tool_calls) {
        const agent = toolToAgent(tc.name);
        yield JSON.stringify({ type: 'tool_start', tool: tc.name, agent }) + '\n';

        const toolStart = Date.now();
        const startedAt = new Date().toISOString();
        let result;
        try {
          result = await dispatchTool(tc.name, tc.input, userMessage);
        } catch (err) {
          result = { success: false, message: String(err) };
        }
        const finishedAt = new Date().toISOString();
        const toolLatency = Date.now() - toolStart;

        yield JSON.stringify({ type: 'tool_result', tool: tc.name, agent, result }) + '\n';

        if (assistantMsgId && sessionId) {
          await recordToolEvent({
            message_id: assistantMsgId,
            session_id: sessionId,
            tool_name: tc.name,
            tool_input: tc.input,
            tool_output: result,
            started_at: startedAt,
            finished_at: finishedAt,
            latency_ms: toolLatency,
          });
        }

        toolResults.push({ tool_use_id: tc.id, content: JSON.stringify(result) });
      }

      currentMessages.push({
        role: 'assistant',
        content: response.content,
        tool_calls: response.tool_calls,
      });
      currentMessages.push({
        role: 'user',
        content: '',
        tool_results: toolResults,
      });
    } else {
      if (sessionId && userId) {
        await recordMessage({
          session_id: sessionId,
          user_id: userId,
          role: 'assistant',
          content: response.content,
          provider: providerName,
          model,
          input_tokens: response.usage.input_tokens,
          output_tokens: response.usage.output_tokens,
          thinking_tokens: response.usage.thinking_tokens ?? 0,
          latency_ms: response.latency_ms,
        });
        await updateSessionStats(sessionId, response.usage, model);
        await updateSessionTitle(sessionId, userMessage.slice(0, 80));
      }
      continueLoop = false;
    }
  }

  yield JSON.stringify({ type: 'done', provider: providerName, model, session_id: sessionId }) + '\n';
}
