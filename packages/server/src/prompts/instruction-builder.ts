import { buildCoreToolRules } from './core-tool-rules-instructions';
import { buildViewInstructions } from './view-instructions';
import { buildRelationInstructions } from './relation-instructions';
import { buildKanbanInstructions } from './kanban-instructions';
import { buildCalendarInstructions } from './calendar-instructions';
import { buildTimelineInstructions } from './timeline-instructions';
import { buildGanttInstructions } from './gantt-instructions';
import { buildTreeInstructions } from './tree-instructions';
import { buildDashboardInstructions } from './dashboard-instructions';
import { buildBusinessRulesInstructions } from './business-rules-instructions';
import { buildDestructiveSchemaInstructions } from './destructive-schema-instructions';
import { buildConditionalAppearanceInstructions } from './conditional-appearance-instructions';
import { buildViewActionsInstructions } from './view-actions-instructions';
import { buildFieldTypeInstructions } from './field-type-instructions';
import { buildI18nInstructions } from './i18n-instructions';

export interface InstructionOptions {
  surface: 'chat' | 'mcp';
  language?: string;
  dynamicContext?: string;
}

function buildSharedFragments(language: string): string {
  return [
    buildCoreToolRules(),
    buildRelationInstructions(),
    buildViewInstructions(),
    buildDashboardInstructions(),
    buildKanbanInstructions(),
    buildCalendarInstructions(),
    buildTimelineInstructions(),
    buildGanttInstructions(),
    buildTreeInstructions(),
    buildBusinessRulesInstructions(),
    buildDestructiveSchemaInstructions(),
    buildConditionalAppearanceInstructions(),
    buildViewActionsInstructions(),
    buildFieldTypeInstructions(),
    buildI18nInstructions(language),
  ].join('\n\n');
}

export function buildZenkuInstructions(options: InstructionOptions): string {
  const { surface, language = 'zh-TW', dynamicContext } = options;
  const fragments = buildSharedFragments(language);

  if (surface === 'chat') {
    const intro = `You are the Zenku Orchestrator. Users describe their needs, and you build the application.

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

Language: ALL responses to the user must be in the [${language}] language.`;

    const toolFormats = `STRICT TOOL CALL FORMAT (failure to follow causes errors):

manage_schema create_table — columns array is MANDATORY:
{ "action": "create_table", "table_name": "products", "columns": [{"name": "title", "type": "TEXT"}, {"name": "price", "type": "REAL"}] }
NEVER call create_table without the columns array. NEVER pass an empty columns array.

manage_schema alter_table — changes array is MANDATORY:
{ "action": "alter_table", "table_name": "products", "changes": [{"operation": "add_column", "column": {"name": "stock", "type": "INTEGER"}}] }

manage_ui create_view — view object with id, name, table_name, columns, form, actions is MANDATORY:
{ "action": "create_view", "view": { "id": "products", "name": "Products", "table_name": "products", "type": "table", "columns": [...], "form": {"columns": 2, "fields": [...]}, "actions": ["create","edit","delete"] } }
NEVER call create_view without the view object. NEVER omit view.id, view.name, or view.table_name.

manage_ui get_view — view_id is MANDATORY:
{ "action": "get_view", "view_id": "products" }`;

    const parts = [intro, toolFormats, fragments];
    if (dynamicContext) parts.push(dynamicContext);
    return parts.join('\n\n');
  }

  // mcp surface
  const intro = `You are connected to a Zenku instance — a low-code application runtime.`;
  const parts = [intro, fragments];
  if (dynamicContext) parts.push(dynamicContext);
  return parts.join('\n\n');
}
