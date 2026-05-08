import { getUserTables, getTableSchema } from './db/schema';
import { getAllViews } from './db/views';
import { getAllRules, parseTriggerTypes } from './db/rules';
import { getUserLanguage } from './db/auth';
import { getDb } from './db';
import type { ForeignKeyInfo } from './db/adapter';
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

const MAX_COLS = 30;
const MAX_FIELDS = 40;
const MAX_RULES = 30;

export async function buildDynamicContext(): Promise<string> {
  const db = getDb();
  const [tables, views, rules, journalCtx] = await Promise.all([
    getUserTables(),
    getAllViews(),
    getAllRules(),
    buildJournalContext(),
  ]);

  const sections: string[] = [];

  // ── Tables ──────────────────────────────────────────────────────────────
  if (tables.length === 0) {
    sections.push('## Tables\n(No tables yet)');
  } else {
    const lines: string[] = [`## Tables (${tables.length})`];
    for (const table of tables) {
      const [cols, fks] = await Promise.all([
        getTableSchema(table),
        db.getForeignKeys(table).catch(() => [] as ForeignKeyInfo[]),
      ]);
      const shown = cols.slice(0, MAX_COLS);
      const colStr = shown.map(c => {
        const flags = c.isPrimaryKey ? ' pk' : c.notNull ? ' req' : '';
        return `${c.name} (${c.type}${flags})`;
      }).join(', ');
      const more = cols.length > MAX_COLS ? ` ...and ${cols.length - MAX_COLS} more` : '';
      lines.push(`\n### ${table}`);
      lines.push(`Columns: ${colStr}${more}`);
      if (fks.length > 0) {
        lines.push(`FK: ${fks.map(fk => `${fk.from} → ${fk.toTable}.${fk.toColumn}`).join(', ')}`);
      }
    }
    sections.push(lines.join('\n'));
  }

  // ── Views ────────────────────────────────────────────────────────────────
  if (views.length === 0) {
    sections.push('## Views\n(No views yet)');
  } else {
    const lines: string[] = [`## Views (${views.length})`];
    for (const v of views) {
      try {
        type ViewDef = {
          type?: string;
          actions?: unknown[];
          form?: { fields?: { key: string; type: string }[] };
        };
        const def = JSON.parse(v.definition) as ViewDef;
        const type = def.type ?? 'table';
        const actionList = Array.isArray(def.actions)
          ? def.actions.map(a => (typeof a === 'string' ? a : (a as { id?: string }).id ?? '?')).join(', ')
          : '';
        const allFields = def.form?.fields ?? [];
        const shownFields = allFields.slice(0, MAX_FIELDS);
        const fieldStr = shownFields.map(f => `${f.key} [${f.type}]`).join(', ');
        const moreFields = allFields.length > MAX_FIELDS ? ` ...and ${allFields.length - MAX_FIELDS} more` : '';
        lines.push(`\n### ${v.name} [${type}] → ${v.table_name}`);
        if (actionList) lines.push(`Actions: ${actionList}`);
        if (fieldStr) lines.push(`Form fields (${allFields.length}): ${fieldStr}${moreFields}`);
      } catch {
        lines.push(`\n### ${v.name} → ${v.table_name}`);
      }
    }
    sections.push(lines.join('\n'));
  }

  // ── Rules ────────────────────────────────────────────────────────────────
  if (rules.length === 0) {
    sections.push('## Rules\n(No rules defined)');
  } else {
    const shown = rules.slice(0, MAX_RULES);
    const lines: string[] = [`## Rules (${rules.length})`];
    for (const r of shown) {
      const triggers = parseTriggerTypes(r.trigger_types).join(', ');
      const status = r.enabled ? 'enabled' : 'disabled';
      lines.push(`\n### ${r.name} [${r.table_name}, ${triggers}, ${status}]`);
      try {
        if (r.condition) {
          const cond = JSON.parse(r.condition) as { field?: string; operator?: string; value?: unknown };
          if (cond.field) lines.push(`Condition: ${cond.field} ${cond.operator ?? ''} ${String(cond.value ?? '')}`.trimEnd());
        }
      } catch { /* ignore */ }
      try {
        const acts = JSON.parse(r.actions) as { type: string; field?: string }[];
        if (acts.length > 0) {
          lines.push(`Actions: ${acts.map(a => (a.field ? `${a.type}(${a.field})` : a.type)).join(', ')}`);
        }
      } catch { /* ignore */ }
    }
    if (rules.length > MAX_RULES) lines.push(`\n...and ${rules.length - MAX_RULES} more rules`);
    sections.push(lines.join('\n'));
  }

  // ── Translations ─────────────────────────────────────────────────────────
  try {
    const { rows } = await db.query<{ locale: string; cnt: number }>(
      'SELECT locale, COUNT(*) AS cnt FROM _zenku_translations GROUP BY locale ORDER BY locale',
    );
    if (rows.length > 0) {
      const locales = rows.map(r => r.locale).join(', ');
      const total = rows.reduce((s, r) => s + Number(r.cnt), 0);
      sections.push(`## Translations\nLocales: ${locales} | Total keys: ${total}`);
    }
  } catch { /* table may not exist yet */ }

  // ── Recent Operations ────────────────────────────────────────────────────
  sections.push(`## Recent Operations (for undo reference)\n${journalCtx}`);

  return sections.join('\n\n');
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
