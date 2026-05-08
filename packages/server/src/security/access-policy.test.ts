import test from 'node:test';
import assert from 'node:assert/strict';
import { expandScopes, hasAnyScope, hasScope, scopeMatches } from './access-policy';

test('expands inherited MCP scopes', () => {
  assert.deepEqual(new Set(expandScopes(['mcp:admin'])), new Set(['mcp:admin', 'mcp:write', 'mcp:read']));
  assert.deepEqual(new Set(expandScopes(['mcp:write'])), new Set(['mcp:write', 'mcp:read']));
});

test('wildcard scopes grant table-specific access', () => {
  assert.equal(scopeMatches('read:*', 'read:orders'), true);
  assert.equal(hasScope(['write:*'], 'write:orders'), true);
});

test('table-specific scopes do not grant wildcard access', () => {
  assert.equal(scopeMatches('read:orders', 'read:*'), false);
  assert.equal(hasScope(['read:orders'], 'read:*'), false);
});

test('table-specific scopes work when middleware accepts any required scope', () => {
  assert.equal(hasAnyScope(['read:orders'], ['read:*', 'read:orders']), true);
  assert.equal(hasAnyScope(['read:orders'], ['read:*', 'read:customers']), false);
});

test('scope actions must match', () => {
  assert.equal(hasScope(['write:orders'], 'read:orders'), false);
});
