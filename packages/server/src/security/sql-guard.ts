export interface SqlGuardContext {
  role?: 'admin' | 'builder' | 'user';
  userId?: string;
  apiKeyScopes?: string[];
}

export interface SqlGuardResult {
  allowed: boolean;
  reason?: string;
}

const DANGEROUS_KEYWORDS =
  /\b(INSERT|UPDATE|DELETE|DROP|ALTER|TRUNCATE|CREATE|PRAGMA|ATTACH|DETACH|VACUUM|REINDEX)\b/i;

const SYSTEM_TABLE_ACCESS =
  /\b(?:FROM|JOIN)\s+["'`\[]?_zenku_/i;

function hasSemicolonOutsideString(sql: string): boolean {
  let inString = false;
  for (let i = 0; i < sql.length; i++) {
    const ch = sql[i];
    if (inString) {
      if (ch === "'" && sql[i + 1] === "'") {
        i++; // escaped single-quote inside string
      } else if (ch === "'") {
        inString = false;
      }
    } else {
      if (ch === "'") {
        inString = true;
      } else if (ch === ';') {
        return true;
      }
    }
  }
  return false;
}

export function guardSql(sql: string, _context?: SqlGuardContext): SqlGuardResult {
  const trimmed = sql.trim();

  if (!trimmed) {
    return { allowed: false, reason: 'SQL is empty' };
  }

  const upper = trimmed.toUpperCase();
  if (!upper.startsWith('SELECT') && !upper.startsWith('WITH')) {
    return {
      allowed: false,
      reason: 'Only SELECT (or WITH … SELECT) queries are allowed',
    };
  }

  if (hasSemicolonOutsideString(trimmed)) {
    return {
      allowed: false,
      reason: 'Multi-statement SQL is not allowed',
    };
  }

  const match = DANGEROUS_KEYWORDS.exec(trimmed);
  if (match) {
    return {
      allowed: false,
      reason: `SQL contains potentially dangerous operation: ${match[1]?.toUpperCase()}`,
    };
  }

  if (SYSTEM_TABLE_ACCESS.test(trimmed)) {
    return {
      allowed: false,
      reason: 'Access to system tables is not allowed',
    };
  }

  return { allowed: true };
}
