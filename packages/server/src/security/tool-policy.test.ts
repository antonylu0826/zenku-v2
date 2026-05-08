import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { getToolsForRole, getToolsForScopes, MCP_SCOPE_TOOL_POLICY } from './tool-policy';
import type { ZenkuTool } from '../tools/types';
import type { ToolDefinition } from '../ai';

function makeTool(name: string): ZenkuTool {
  return {
    definition: {
      name,
      description: name,
      input_schema: { type: 'object', properties: {} },
    } as ToolDefinition,
    execute: async () => ({ success: true, message: '' }),
  };
}

const ALL_MOCK_TOOLS: ZenkuTool[] = [
  'manage_schema', 'manage_ui', 'query_data', 'write_data',
  'manage_rules', 'assess_impact', 'undo_action',
  'get_table_schema', 'get_integration_guide', 'set_translations',
].map(makeTool);

// ── getToolsForRole ───────────────────────────────────────────────────────

describe('getToolsForRole – admin', () => {
  test('gets all tools', () => {
    const tools = getToolsForRole('admin', ALL_MOCK_TOOLS);
    const names = tools.map(t => t.name);
    assert.equal(names.length, ALL_MOCK_TOOLS.length);
    assert.ok(names.includes('undo_action'));
    assert.ok(names.includes('manage_schema'));
  });
});

describe('getToolsForRole – builder', () => {
  test('excludes undo_action', () => {
    const tools = getToolsForRole('builder', ALL_MOCK_TOOLS);
    const names = tools.map(t => t.name);
    assert.ok(!names.includes('undo_action'));
    assert.ok(names.includes('manage_schema'));
    assert.ok(names.includes('query_data'));
  });

  test('has all tools except undo_action', () => {
    const tools = getToolsForRole('builder', ALL_MOCK_TOOLS);
    assert.equal(tools.length, ALL_MOCK_TOOLS.length - 1);
  });
});

describe('getToolsForRole – user', () => {
  test('only gets query_data and write_data', () => {
    const tools = getToolsForRole('user', ALL_MOCK_TOOLS);
    const names = tools.map(t => t.name).sort();
    assert.deepEqual(names, ['query_data', 'write_data'].sort());
  });

  test('does not include manage_schema', () => {
    const tools = getToolsForRole('user', ALL_MOCK_TOOLS);
    assert.ok(!tools.map(t => t.name).includes('manage_schema'));
  });
});

// ── getToolsForScopes ─────────────────────────────────────────────────────

describe('getToolsForScopes – mcp:read', () => {
  test('gets read tools only', () => {
    const tools = getToolsForScopes(['mcp:read'], ALL_MOCK_TOOLS);
    const names = tools.map(t => t.name).sort();
    assert.deepEqual(names, MCP_SCOPE_TOOL_POLICY['mcp:read'].sort());
  });

  test('includes get_integration_guide', () => {
    const tools = getToolsForScopes(['mcp:read'], ALL_MOCK_TOOLS);
    assert.ok(tools.map(t => t.name).includes('get_integration_guide'));
  });

  test('does not include write_data', () => {
    const tools = getToolsForScopes(['mcp:read'], ALL_MOCK_TOOLS);
    assert.ok(!tools.map(t => t.name).includes('write_data'));
  });
});

describe('getToolsForScopes – mcp:write', () => {
  test('includes write_data (cumulative with read)', () => {
    const tools = getToolsForScopes(['mcp:write'], ALL_MOCK_TOOLS);
    const names = tools.map(t => t.name);
    assert.ok(names.includes('write_data'));
    assert.ok(names.includes('query_data'));
    assert.ok(names.includes('get_integration_guide'));
  });

  test('does not include admin tools', () => {
    const tools = getToolsForScopes(['mcp:write'], ALL_MOCK_TOOLS);
    const names = tools.map(t => t.name);
    assert.ok(!names.includes('manage_schema'));
    assert.ok(!names.includes('undo_action'));
  });
});

describe('getToolsForScopes – mcp:admin', () => {
  test('includes all MCP tools including set_translations', () => {
    const tools = getToolsForScopes(['mcp:admin'], ALL_MOCK_TOOLS);
    const names = tools.map(t => t.name);
    assert.ok(names.includes('set_translations'));
    assert.ok(names.includes('undo_action'));
    assert.ok(names.includes('manage_schema'));
    assert.ok(names.includes('write_data'));
    assert.ok(names.includes('query_data'));
  });
});

// ── MCP_SCOPE_TOOL_POLICY ─────────────────────────────────────────────────

describe('MCP_SCOPE_TOOL_POLICY consistency', () => {
  test('all scopes defined', () => {
    assert.ok(MCP_SCOPE_TOOL_POLICY['mcp:read']);
    assert.ok(MCP_SCOPE_TOOL_POLICY['mcp:write']);
    assert.ok(MCP_SCOPE_TOOL_POLICY['mcp:admin']);
  });

  test('mcp:read includes get_integration_guide', () => {
    assert.ok(MCP_SCOPE_TOOL_POLICY['mcp:read'].includes('get_integration_guide'));
  });

  test('mcp:admin includes set_translations', () => {
    assert.ok(MCP_SCOPE_TOOL_POLICY['mcp:admin'].includes('set_translations'));
  });

  test('mcp:admin includes undo_action', () => {
    assert.ok(MCP_SCOPE_TOOL_POLICY['mcp:admin'].includes('undo_action'));
  });
});
