import { AgentResult } from '../types';
import { ZenkuTool } from './types';
import { normalizeToolInput, validateToolInput, type JsonSchema } from './validation';

import { manageSchemaTool } from './handlers/schema-tool';
import { manageUiTool } from './handlers/ui-tool';
import { queryDataTool } from './handlers/query-tool';
import { writeDataTool } from './handlers/data-tool';
import { manageRulesTool } from './handlers/rule-tool';
import { assessImpactTool } from './handlers/test-tool';
import { undoActionTool } from './handlers/undo-tool';
import { metaTool } from './handlers/meta-tool';
import { guideTool } from './handlers/guide-tool';
import { setTranslationsTool } from './handlers/i18n-tool';

export const ALL_TOOLS: ZenkuTool[] = [
  manageSchemaTool,
  manageUiTool,
  queryDataTool,
  writeDataTool,
  manageRulesTool,
  assessImpactTool,
  undoActionTool,
  metaTool,
  guideTool,
  setTranslationsTool,
];

export async function dispatchTool(toolName: string, input: unknown, context?: unknown): Promise<AgentResult> {
  const tool = ALL_TOOLS.find((t) => t.definition.name === toolName);
  if (!tool) {
    return { success: false, message: `Tool "${toolName}" not found.` };
  }

  const schema = tool.definition.input_schema as JsonSchema;
  const normalized = normalizeToolInput(schema, input);
  const validationError = validateToolInput(schema, normalized);
  if (validationError) {
    return { success: false, message: `Invalid input for tool "${toolName}": ${validationError}` };
  }

  try {
    return await tool.execute(normalized, context);
  } catch (error) {
    return { success: false, message: `Error executing tool "${toolName}": ${String(error)}` };
  }
}
