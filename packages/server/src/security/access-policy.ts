export type Scope = string;

interface ParsedScope {
  action: string;
  resource: string;
}

function parseScope(scope: Scope): ParsedScope | null {
  const idx = scope.indexOf(':');
  if (idx <= 0 || idx === scope.length - 1) return null;
  return {
    action: scope.slice(0, idx),
    resource: scope.slice(idx + 1),
  };
}

export function expandScopes(scopes: Scope[]): Scope[] {
  const expanded = new Set(scopes.filter(Boolean));
  if (expanded.has('mcp:admin')) {
    expanded.add('mcp:write');
    expanded.add('mcp:read');
  }
  if (expanded.has('mcp:write')) {
    expanded.add('mcp:read');
  }
  return [...expanded];
}

export function scopeMatches(grantedScope: Scope, requiredScope: Scope): boolean {
  const granted = parseScope(grantedScope);
  const required = parseScope(requiredScope);
  if (!granted || !required) return false;
  return granted.action === required.action
    && (granted.resource === '*' || granted.resource === required.resource);
}

export function hasScope(grantedScopes: Scope[], requiredScope: Scope): boolean {
  return expandScopes(grantedScopes).some(scope => scopeMatches(scope, requiredScope));
}

export function hasAnyScope(grantedScopes: Scope[], requiredScopes: Scope[]): boolean {
  return requiredScopes.some(requiredScope => hasScope(grantedScopes, requiredScope));
}
