import { Router } from 'express';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { ListToolsRequestSchema, CallToolRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import { requireApiKey } from '../middleware/api-key-auth';
import { ALL_TOOLS, dispatchTool } from '../tools/registry';
import { buildDynamicContext } from '../orchestrator';
import { getToolsForScopes, MCP_SCOPE_TOOL_POLICY } from '../security/tool-policy';
import { buildZenkuInstructions } from '../prompts/instruction-builder';

const router = Router();

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
  return buildZenkuInstructions({ surface: 'mcp', language, dynamicContext });
}

router.post('/', requireApiKey('mcp:read'), async (req, res) => {
  const scopes  = req.apiKeyScopes ?? [];
  const tools   = getToolsForScopes(scopes, ALL_TOOLS);
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
  const scopeToolNames: Record<string, string[]> = {};
  for (const scope of Object.keys(MCP_SCOPE_TOOL_POLICY)) {
    scopeToolNames[scope] = getToolsForScopes([scope], ALL_TOOLS).map(t => t.name);
  }
  res.json({
    name: 'zenku',
    protocol: 'MCP Streamable HTTP',
    endpoint: '/api/mcp',
    auth: 'Bearer zk_live_<key>  (Header: Authorization)',
    scopes: scopeToolNames,
  });
});

export default router;
