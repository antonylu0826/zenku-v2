import { Router } from 'express';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { ListToolsRequestSchema, CallToolRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import { requireApiKey, expandScopes } from '../middleware/api-key-auth';
import { ALL_TOOLS, dispatchTool } from '../tools/registry';
import { buildDynamicContext } from '../orchestrator';
import { buildDashboardInstructions } from '../dashboard-instructions';
import type { ToolDefinition } from '../ai';

const router = Router();

const READ_TOOLS  = new Set(['query_data', 'get_table_schema', 'get_integration_guide']);
const WRITE_TOOLS = new Set(['write_data']);
const ADMIN_TOOLS = new Set(['manage_schema', 'manage_ui', 'manage_rules', 'assess_impact', 'undo_action']);

function getToolsForScopes(scopes: string[]): ToolDefinition[] {
  const expanded = new Set(expandScopes(scopes));
  const allowed = new Set<string>();
  if (expanded.has('mcp:read'))  READ_TOOLS.forEach(t => allowed.add(t));
  if (expanded.has('mcp:write')) WRITE_TOOLS.forEach(t => allowed.add(t));
  if (expanded.has('mcp:admin')) ADMIN_TOOLS.forEach(t => allowed.add(t));
  return ALL_TOOLS.filter(t => allowed.has(t.definition.name)).map(t => t.definition);
}

/**
 * Strip `enum` from non-string typed fields.
 * Gemini (and some other providers) only allow enum on STRING type.
 * This keeps the schema semantically correct — the description already communicates valid values.
 */
function sanitizeSchemaForMcp(schema: any): any {
  if (!schema || typeof schema !== 'object') return schema;
  const s = { ...schema };
  if (Array.isArray(s.enum) && s.type && s.type !== 'string') {
    delete s.enum;
  }
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

function buildMcpInstructions(): string {
  return `You are connected to a Zenku instance — a low-code application runtime.

## Tool usage rules
- Call manage_schema before manage_ui when creating or modifying data types.
- Never guess column names; call get_table_schema first if unsure.
- query_data is SELECT-only; use write_data for mutations.
- Destructive schema changes (drop_column, drop_table) require assess_impact first.
- When updating an existing view, always call manage_ui(get_view) first, then submit the COMPLETE modified definition with update_view. Never send a partial definition.

## Creating views (manage_ui)
Every view MUST include an "actions" array. Without it, no buttons appear in the UI.
- Standard CRUD: actions: ["create", "edit", "delete"]
- Read-only: actions: []
- With export: actions: ["create", "edit", "delete", "export"]

**Field key alignment (critical):** Every form field "key" and every column "key" in a view MUST exactly match the actual database column name returned by get_table_schema. A mismatch causes runtime errors when saving records. After calling manage_schema, always verify column names before passing them to manage_ui.

Field naming: use English lowercase_underscore for all table and field names.

form.columns controls the form layout width (integer 1–4):
- Set 2 for most forms with 5+ fields; 3 for 8+ fields.

${buildDashboardInstructions()}

## Relation fields
- Schema: INTEGER + references: { table: 'other_table' }
- UI columns: type "relation", relation: { table, display_field }
- UI form: type "relation", relation: { table, value_field: "id", display_field }

${buildDynamicContext()}`;
}

// ──────────────────────────────────────────────
// POST /api/mcp  (Streamable HTTP, stateless)
// ──────────────────────────────────────────────
router.post('/', requireApiKey('mcp:read'), async (req, res) => {
  const scopes  = req.apiKeyScopes ?? [];
  const tools   = getToolsForScopes(scopes);
  const allowedNames = new Set(tools.map(t => t.name));

  const server = new Server(
    { name: 'zenku', version: '1.0.0' },
    { capabilities: { tools: {} }, instructions: buildMcpInstructions() },
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
        content: [{
          type: 'text' as const,
          text: JSON.stringify({ success: false, message: `Tool "${name}" is not available for this API key scope.` }),
        }],
        isError: true,
      };
    }

    const result = await dispatchTool(name, args ?? {}, '(MCP)');
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

// ──────────────────────────────────────────────
// GET /api/mcp  (SSE stream for server-initiated messages, stateless)
// ──────────────────────────────────────────────
router.get('/', requireApiKey('mcp:read'), async (req, res) => {
  const server = new Server(
    { name: 'zenku', version: '1.0.0' },
    { capabilities: { tools: {} } },
  );

  const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
  await server.connect(transport);

  try {
    await transport.handleRequest(req as any, res as any);
  } finally {
    await server.close();
  }
});

// ──────────────────────────────────────────────
// GET /api/mcp/info  (lightweight health + capability summary, no auth)
// ──────────────────────────────────────────────
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
    claude_desktop_note: 'Claude Desktop requires mcp-remote bridge. See plans/MCP_SERVER.md for setup instructions.',
  });
});

export default router;
