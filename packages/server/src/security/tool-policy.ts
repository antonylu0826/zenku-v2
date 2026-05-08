import { expandScopes } from './access-policy';
import type { ZenkuTool } from '../tools/types';
import type { ToolDefinition } from '../ai';

const BUILDER_EXCLUDED_TOOLS = ['undo_action'];
const USER_TOOLS = ['query_data', 'write_data'];

export const MCP_SCOPE_TOOL_POLICY: Record<string, string[]> = {
  'mcp:read':  ['query_data', 'get_table_schema', 'get_integration_guide'],
  'mcp:write': ['write_data'],
  'mcp:admin': ['manage_schema', 'manage_ui', 'manage_rules', 'assess_impact', 'undo_action', 'set_translations'],
};

export function getToolsForRole(role: string, allTools: ZenkuTool[]): ToolDefinition[] {
  if (role === 'user') {
    return allTools
      .filter(t => USER_TOOLS.includes(t.definition.name))
      .map(t => t.definition);
  }
  if (role === 'builder') {
    return allTools
      .filter(t => !BUILDER_EXCLUDED_TOOLS.includes(t.definition.name))
      .map(t => t.definition);
  }
  return allTools.map(t => t.definition); // admin: all tools
}

export function getToolsForScopes(scopes: string[], allTools: ZenkuTool[]): ToolDefinition[] {
  const expanded = new Set(expandScopes(scopes));
  const allowed = new Set<string>();
  for (const scope of expanded) {
    for (const toolName of MCP_SCOPE_TOOL_POLICY[scope] ?? []) {
      allowed.add(toolName);
    }
  }
  return allTools.filter(t => allowed.has(t.definition.name)).map(t => t.definition);
}
