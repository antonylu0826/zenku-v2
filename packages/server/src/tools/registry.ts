import { AgentResult } from '../types';
import { ZenkuTool } from './types';

import { manageSchemaTool } from './handlers/schema-tool';
import { manageUiTool } from './handlers/ui-tool';
import { queryDataTool } from './handlers/query-tool';
import { writeDataTool } from './handlers/data-tool';
import { manageRulesTool } from './handlers/rule-tool';
import { assessImpactTool } from './handlers/test-tool';
import { undoActionTool } from './handlers/undo-tool';
import { metaTool } from './handlers/meta-tool';
import { guideTool } from './handlers/guide-tool';

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
];

export async function dispatchTool(toolName: string, input: any, context?: any): Promise<AgentResult> {
  const tool = ALL_TOOLS.find((t) => t.definition.name === toolName);
  if (!tool) {
    return { success: false, message: `Tool "${toolName}" not found.` };
  }
  try {
    return await tool.execute(input, context);
  } catch (error) {
    return { success: false, message: `Error executing tool "${toolName}": ${String(error)}` };
  }
}
