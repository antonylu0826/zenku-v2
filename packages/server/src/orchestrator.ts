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
import { buildCoreToolRules } from './prompts/core-tool-rules-instructions';
import { buildViewInstructions } from './prompts/view-instructions';
import { buildRelationInstructions } from './prompts/relation-instructions';
import { buildKanbanInstructions } from './prompts/kanban-instructions';
import { buildCalendarInstructions } from './prompts/calendar-instructions';
import { buildTimelineInstructions } from './prompts/timeline-instructions';
import { buildGanttInstructions } from './prompts/gantt-instructions';
import { buildTreeInstructions } from './prompts/tree-instructions';
import { buildDashboardInstructions } from './prompts/dashboard-instructions';
import { buildBusinessRulesInstructions } from './prompts/business-rules-instructions';
import { buildDestructiveSchemaInstructions } from './prompts/destructive-schema-instructions';
import { buildConditionalAppearanceInstructions } from './prompts/conditional-appearance-instructions';
import { buildViewActionsInstructions } from './prompts/view-actions-instructions';
import { buildFieldTypeInstructions } from './prompts/field-type-instructions';
import { buildI18nInstructions } from './prompts/i18n-instructions';
import type { ToolDefinition } from './ai';
import type { LLMMessage, ToolResult, AIProvider as AIProviderName } from './types';

export interface SystemPromptParts {
  static: string;
  dynamic: string;
}

function buildStaticPrompt(userLanguage: string = 'zh-TW'): string {
  return `You are the Zenku Orchestrator. Users describe their needs, and you build the application.

Available Tools:
- manage_schema: Create or modify table structures.
- manage_ui: Create or update user interfaces (list + form).
- query_data: Query data or answer statistics questions (SELECT only).
- write_data: Insert, update, or delete records in user data tables (cannot operate on system tables).
- manage_rules: Create or modify business rules (automation, validation, triggers).
- assess_impact: Assess impact of destructive schema changes (must call before modification).
- get_table_schema: Retrieve names of all tables or detailed column definitions for a specific table.
- get_integration_guide: Returns the full integration guide for connecting Zenku with n8n or other automation tools (API endpoints, webhook payload format, write-back options, common errors).
- set_translations: Register or update translation entries ($key → display text per locale). Call after creating schema/views when user language is not English.

Language: ALL responses to the user must be in the [${userLanguage}] language.

${buildCoreToolRules()}

STRICT TOOL CALL FORMAT (failure to follow causes errors):

manage_schema create_table — columns array is MANDATORY:
{ "action": "create_table", "table_name": "products", "columns": [{"name": "title", "type": "TEXT"}, {"name": "price", "type": "REAL"}] }
NEVER call create_table without the columns array. NEVER pass an empty columns array.

manage_schema alter_table — changes array is MANDATORY:
{ "action": "alter_table", "table_name": "products", "changes": [{"operation": "add_column", "column": {"name": "stock", "type": "INTEGER"}}] }

manage_ui create_view — view object with id, name, table_name, columns, form, actions is MANDATORY:
{ "action": "create_view", "view": { "id": "products", "name": "Products", "table_name": "products", "type": "table", "columns": [...], "form": {"columns": 2, "fields": [...]}, "actions": ["create","edit","delete"] } }
NEVER call create_view without the view object. NEVER omit view.id, view.name, or view.table_name.

manage_ui get_view — view_id is MANDATORY:
{ "action": "get_view", "view_id": "products" }

${buildRelationInstructions()}

${buildViewInstructions()}

Visualization Interfaces:
- Statistics / Dashboard -> manage_ui, type: 'dashboard', widgets array.

${buildDashboardInstructions()}

${buildKanbanInstructions()}

${buildCalendarInstructions()}

${buildTimelineInstructions()}

${buildGanttInstructions()}

${buildTreeInstructions()}

${buildBusinessRulesInstructions()}

${buildDestructiveSchemaInstructions()}

${buildConditionalAppearanceInstructions()}

${buildViewActionsInstructions()}

${buildFieldTypeInstructions()}

${buildI18nInstructions(userLanguage)}`;
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
    ? rules.map(r => `- ${r.name} (${r.trigger_type} on ${r.table_name})${r.enabled ? '' : ' (Disabled)'}`).join('\n')
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

// ===== Tool dispatch =====

type UserRole = 'admin' | 'builder' | 'user';

function getToolsForRole(role: UserRole): ToolDefinition[] {
  const tools = ALL_TOOLS.map(t => t.definition);
  if (role === 'user') {
    return tools.filter(t => t.name === 'query_data' || t.name === 'write_data');
  }
  if (role === 'builder') {
    return tools.filter(t => t.name !== 'undo_action');
  }
  return tools;
}

// ===== Main chat loop =====

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
  const tools = getToolsForRole(userRole);

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
  const staticPrompt = buildStaticPrompt(userLanguage);
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
