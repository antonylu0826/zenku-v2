import { Router } from 'express';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { ListToolsRequestSchema, CallToolRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import { requireApiKey, expandScopes } from '../middleware/api-key-auth';
import { ALL_TOOLS, dispatchTool } from '../tools/registry';
import { buildDynamicContext } from '../orchestrator';
import { buildCoreToolRules } from '../prompts/core-tool-rules-instructions';
import { buildViewInstructions } from '../prompts/view-instructions';
import { buildRelationInstructions } from '../prompts/relation-instructions';
import { buildKanbanInstructions } from '../prompts/kanban-instructions';
import { buildCalendarInstructions } from '../prompts/calendar-instructions';
import { buildTimelineInstructions } from '../prompts/timeline-instructions';
import { buildDashboardInstructions } from '../prompts/dashboard-instructions';
import { buildBusinessRulesInstructions } from '../prompts/business-rules-instructions';
import { buildDestructiveSchemaInstructions } from '../prompts/destructive-schema-instructions';
import { buildConditionalAppearanceInstructions } from '../prompts/conditional-appearance-instructions';
import { buildViewActionsInstructions } from '../prompts/view-actions-instructions';
import { buildFieldTypeInstructions } from '../prompts/field-type-instructions';
import { buildI18nInstructions } from '../prompts/i18n-instructions';
import type { ToolDefinition } from '../ai';

const router = Router();

const READ_TOOLS  = new Set(['query_data', 'get_table_schema', 'get_integration_guide']);
const WRITE_TOOLS = new Set(['write_data']);
const ADMIN_TOOLS = new Set(['manage_schema', 'manage_ui', 'manage_rules', 'assess_impact', 'undo_action', 'set_translations']);

function getToolsForScopes(scopes: string[]): ToolDefinition[] {
  const expanded = new Set(expandScopes(scopes));
  const allowed = new Set<string>();
  if (expanded.has('mcp:read'))  READ_TOOLS.forEach(t => allowed.add(t));
  if (expanded.has('mcp:write')) WRITE_TOOLS.forEach(t => allowed.add(t));
  if (expanded.has('mcp:admin')) ADMIN_TOOLS.forEach(t => allowed.add(t));
  return ALL_TOOLS.filter(t => allowed.has(t.definition.name)).map(t => t.definition);
}

function sanitizeSchemaForMcp(schema: any): any {
  if (!schema || typeof schema !== 'object') return schema;
  const s = { ...schema };
  if (Array.isArray(s.enum) && s.type && s.type !== 'string') delete s.enum;
  if (s.properties) {
    s.properties = Object.fromEntries(
      Object.entries(s.properties).map(([k, v]) => [k, sanitizeSchemaForMcp(v)])
    );
  }
  if (s.items) s.items = sanitizeSchemaForMcp(s.items);
  if (Array.isArray(s.oneOf)) s.oneOf = s.oneOf.map(sanitizeSchemaForMcp);
  if (Array.isArray(s.anyOf)) s.anyOf = s.anyOf.map(sanitizeSchemaForMcp);
  return s;
}

async function buildMcpInstructions(language = 'en'): Promise<string> {
  const dynamicContext = await buildDynamicContext();
  return `You are connected to a Zenku instance — a low-code application runtime.

${buildCoreToolRules()}

${buildViewInstructions()}

${buildRelationInstructions()}

${buildDashboardInstructions()}

${buildKanbanInstructions()}

${buildCalendarInstructions()}

${buildTimelineInstructions()}

${buildConditionalAppearanceInstructions()}

${buildBusinessRulesInstructions()}

${buildViewActionsInstructions()}

${buildDestructiveSchemaInstructions()}

${buildFieldTypeInstructions()}

${buildI18nInstructions(language)}

${dynamicContext}`;
}

router.post('/', requireApiKey('mcp:read'), async (req, res) => {
  const scopes  = req.apiKeyScopes ?? [];
  const tools   = getToolsForScopes(scopes);
  const allowedNames = new Set(tools.map(t => t.name));
  // Language: prefer ?lang= query param, fall back to Accept-Language header, default en
  const lang = typeof req.query.lang === 'string'
    ? req.query.lang
    : (req.headers['accept-language'] ?? '').split(',')[0].split(';')[0].trim() || 'en';
  const instructions = await buildMcpInstructions(lang);

  const server = new Server(
    { name: 'zenku', version: '1.0.0' },
    { capabilities: { tools: {} }, instructions },
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: tools.map(t => ({
      name: t.name,
      description: t.description,
      inputSchema: sanitizeSchemaForMcp(t.input_schema),
    })),
  }));

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;
    if (!allowedNames.has(name)) {
      return {
        content: [{ type: 'text' as const, text: JSON.stringify({ success: false, message: `Tool "${name}" is not available for this API key scope.` }) }],
        isError: true,
      };
    }
    // Clean up undefined values from arguments
    const cleanArgs = args ? JSON.parse(JSON.stringify(args)) : {};
    const result = await dispatchTool(name, cleanArgs, '(MCP)');
    return {
      content: [{ type: 'text' as const, text: JSON.stringify(result) }],
      isError: !result.success,
    };
  });

  const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
  await server.connect(transport);
  try {
    await transport.handleRequest(req as any, res as any, req.body);
  } finally {
    await server.close();
  }
});

router.get('/', requireApiKey('mcp:read'), async (req, res) => {
  const server = new Server({ name: 'zenku', version: '1.0.0' }, { capabilities: { tools: {} } });
  const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
  await server.connect(transport);
  try {
    await transport.handleRequest(req as any, res as any);
  } finally {
    await server.close();
  }
});

router.get('/info', (_req, res) => {
  res.json({
    name: 'zenku',
    protocol: 'MCP Streamable HTTP',
    endpoint: '/api/mcp',
    auth: 'Bearer zk_live_<key>  (Header: Authorization)',
    scopes: {
      'mcp:read':  ['query_data', 'get_table_schema'],
      'mcp:write': ['query_data', 'get_table_schema', 'write_data'],
      'mcp:admin': ['query_data', 'get_table_schema', 'write_data', 'manage_schema', 'manage_ui', 'manage_rules', 'assess_impact', 'undo_action'],
    },
  });
});

export default router;
