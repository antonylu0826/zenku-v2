import { getUserTables, getAllViews, getAllRules, getUserLanguage } from './db';
import { buildJournalContext } from './tools/journal-tools';
import { createProvider, getDefaultProviderName, getDefaultModel } from './ai';
import {
  createChatSession, updateSessionTitle, updateSessionStats,
  recordMessage, recordToolEvent, toolToAgent,
} from './tools/chat-logger';
import { ALL_TOOLS, dispatchTool } from './tools/registry';
import { buildDashboardInstructions } from './dashboard-instructions';
import type { ToolDefinition } from './ai';
import type { ViewDefinition, LLMMessage, ToolResult, AIProvider as AIProviderName } from './types';




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

Critical Rules:
1. New Data Type: manage_schema (create_table) first, then manage_ui (create_view).
2. Modify Structure: manage_schema (alter_table) first, then manage_ui (update_view).
3. Statistics queries: Use query_data.
4. Naming: Use English lowercase underscores for tables and fields.
5. Language: ALL responses to the user must be in the [${userLanguage}] language.
6. Identity: View ID should usually match its table_name.
7. Modifying an existing view: ALWAYS call manage_ui (get_view) first to retrieve the current definition, then apply your changes and call update_view with the COMPLETE modified definition. Never write a partial definition — it will overwrite and lose existing fields, columns, and actions.
8. Unknown Schema: If you need to query or modify a table but don't know its column definitions, you MUST call get_table_schema(action: 'get_schema', table_name: '...') first. Never guess column names.
9. Required Fields: Any schema column with required: true MUST also have required: true on the corresponding form.fields entry. Omitting this causes NOT NULL constraint errors on insert.

Relation Guidance (e.g., "Orders link to Customers"):
1. manage_schema: Field uses INTEGER + references: { table: 'customers' }.
2. manage_ui columns: type uses 'relation', relation: { table: 'customers', display_field: 'name' }.
3. manage_ui form.fields: type uses 'relation', relation: { table: 'customers', value_field: 'id', display_field: 'name' }.

Dynamic Select (e.g., "Category loaded from category table"):
1. Ensure source table exists.
2. form.fields: type 'select', set source: { table: 'categories', value_field: 'name', display_field: 'name' }.

One-to-Many Relationships (e.g., "Order + Order Items"):
1. manage_schema -> Build master table (e.g., orders).
2. manage_schema -> Build detail table (e.g., order_items) with foreign key: INTEGER + references: { table: 'orders' }.
3. manage_ui -> Create master-detail view, type 'master-detail', define details in detail_views.
   - detail_views[0].foreign_key: Field in detail table pointing to master (e.g., 'order_id').
   - detail_views[0].view.type must be 'table'.
   - Detail form fields do not need the foreign key field (system injection).

Computed Fields (e.g., "Subtotal = Quantity * Price"):
1. manage_schema: Field type REAL.
2. manage_ui form.fields: Add computed: { formula: 'quantity * unit_price', dependencies: ['quantity', 'unit_price'], format: 'currency' }.
3. manage_ui columns: type 'currency' or 'number'.

Visualization Interfaces:
- Statistics / Dashboard ("Show me XXX stats") -> manage_ui, type: 'dashboard', widgets array.

${buildDashboardInstructions()}

- Kanban -> manage_ui, type: 'kanban', set kanban: { group_field, title_field }.
  - group_field should be a select type with options (e.g., status).
  - Still require columns and form (for list mode fallback).
- Calendar -> manage_ui, type: 'calendar', set calendar: { date_field, title_field }.
  - Still require columns and form.
- Timeline -> manage_ui, type: 'timeline', set timeline: { date_field, title_field, description_field?, icon_field?, tags_field? }.
  - icon_field: A field containing a lucide icon name (e.g., "package", "check-circle").
  - tags_field: A field containing an array of strings (e.g., ["Urgent", "VIP"]).
  - Still require columns and form.

Business Rules (e.g., "90% discount for VIPs"):
1. manage_rules -> create_rule.
2. trigger_type: before_insert (modification/validation), after_insert (side effects).
3. condition.field: Supports FK dot path, e.g., "order_id.customer_id.tier".
4. actions:
   - set_field: Modify field values of source record.
   - validate: Reject operation with message.
   - create_record: INSERT into another table.
   - update_record: UPDATE record in another table via where condition and record_data.
   - update_related_records: Batch update multiple records via intermediate table (e.g., order -> items -> inventory).
     - via_table: Intermediate detail table.
     - via_foreign_key: FK in detail table pointing to source.
     - target_table: Table to update.
     - where: Mapping between target table fields and source/detail fields.
     - record_data: Update expressions, target current value is prefixed with __old_.
   - webhook: Call external URL.

Destructive Schema Changes (drop_column, rename_column, change_type, drop_table):
1. Must call assess_impact first.
2. Report impact to user.
3. Proceed with manage_schema only after user confirmation.

Conditional Appearance (Dynamic UI rendering):
Use appearance[] on form fields to change how a field looks or behaves based on other field values. This is evaluated client-side in real time — no extra server calls.

Common patterns:
1. Show a field only when another field has a specific value:
   appearance: [{ when: { field: "customer_type", operator: "neq", value: "company" }, apply: { visibility: "hidden" } }]
2. Make fields read-only after a status is set:
   appearance: [{ when: { field: "status", operator: "eq", value: "completed" }, apply: { enabled: false } }]
3. Highlight value by threshold:
   appearance: [{ when: { field: "amount", operator: "gt", value: 10000 }, apply: { text_color: "#dc2626", font_weight: "bold" } }]
4. Conditionally required:
   appearance: [{ when: { field: "payment_method", operator: "eq", value: "credit_card" }, apply: { required: true } }]
5. Master record lookup (Master-Detail only):
   Use "$master." prefix to read values from the parent master record when configuring detail views.
   appearance: [{ when: { field: "$master.status", operator: "neq", value: "draft" }, apply: { enabled: false } }]
6. Multiple rules (later rules override earlier when both match).

Important constraints:
- appearance[] only works in form.fields (not columns).
- The "field" in "when" must be a key that exists in the same form OR use "$master.field_key" for master-detail.
- For permanent hiding, use hidden_in_form: true instead of appearance[].
- To remove a conditional appearance rule, call update_view and omit the appearance property from that field.

Custom ViewActions:
To add a custom action to an existing view, always follow this sequence:
1. manage_ui({ action: 'get_view', view_id: '...' }) — get current full definition
2. Add the new action object into definition.actions[]
3. manage_ui({ action: 'update_view', view: { ...full modified definition } })

behavior types:
1. set_field — { type: 'set_field', field: 'status', value: 'approved' }
2. trigger_rule — { type: 'trigger_rule', rule_id: '<rule_id>' }
3. webhook — { type: 'webhook', url: 'https://...', method: 'POST', payload: '{"id":"{{id}}"}' }
4. navigate — { type: 'navigate', view_id: 'orders', filter_field: 'customer_id', filter_value_from: 'id' }
5. create_related — { type: 'create_related', table: 'shipments', field_mapping: { order_id: 'id', status: 'pending' } }

context rules: 'record' (default) | 'list' | 'both'
Use visible_when, confirm { title, description } for status transitions.

Form Layout:
- form.columns: 1 | 2 | 3 | 4. Controls how many columns the form renders.
- Default fallback: 2 if visible fields >= 5, otherwise 1.
- Always set explicitly when creating a view with many fields (>= 5) to avoid a single long column.
- Use 3 for 8+ fields; use 4 for showcase/demo views with many field types.

Field Type Guide:
- Currency -> schema: REAL, ui type: currency.
- Phone -> schema: TEXT, ui type: phone.
- Email -> schema: TEXT, ui type: email.
- URL -> schema: TEXT, ui type: url.
- Status/Category (Fixed) -> schema: TEXT, ui type: select + options.
- Status/Category (Dynamic) -> schema: TEXT, ui type: select + source.`;
}

export function buildDynamicContext(): string {
  const tables = getUserTables();
  const views = getAllViews();
  const rules = getAllRules();

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
${buildJournalContext()}`;
}

function buildSystemPrompt(userLanguage: string = 'zh-TW'): SystemPromptParts {
  return {
    static: buildStaticPrompt(userLanguage),
    dynamic: buildDynamicContext(),
  };
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

  // Create or reuse chat session
  const sessionId = options?.existingSessionId
    ?? (userId ? createChatSession(userId, providerName, model, userMessage.slice(0, 80)) : null);

  if (sessionId && userId) {
    recordMessage({ session_id: sessionId, user_id: userId, role: 'user', content: userMessage });
  }

  // Build initial messages from history
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

  const userLanguage = userId ? getUserLanguage(userId) : 'zh-TW';
  const { static: staticPrompt } = buildSystemPrompt(userLanguage);

  let continueLoop = true;

  while (continueLoop) {
    const response = await provider.chat({
      model,
      system: `${staticPrompt}\n\n${buildDynamicContext()}`,
      messages: currentMessages,
      tools,
      maxTokens: 4096,
    });

    // Yield text content
    if (response.content) {
      yield JSON.stringify({ type: 'text', content: response.content }) + '\n';
    }

    // Yield usage info after each LLM call
    yield JSON.stringify({ type: 'usage', usage: response.usage, latency_ms: response.latency_ms }) + '\n';

    if (response.stop_reason === 'tool_use' && response.tool_calls.length > 0) {
      // Log the assistant turn before processing tools
      const assistantMsgId = sessionId && userId
        ? recordMessage({
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

      if (sessionId) updateSessionStats(sessionId, response.usage, model);

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
          recordToolEvent({
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

        toolResults.push({
          tool_use_id: tc.id,
          content: JSON.stringify(result),
        });
      }

      // Append assistant response + tool results to the conversation
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
      // Final assistant turn — log it
      if (sessionId && userId) {
        recordMessage({
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
        updateSessionStats(sessionId, response.usage, model);
        updateSessionTitle(sessionId, userMessage.slice(0, 80));
      }
      continueLoop = false;
    }
  }

  // Yield done with session info
  yield JSON.stringify({ type: 'done', provider: providerName, model, session_id: sessionId }) + '\n';
}
