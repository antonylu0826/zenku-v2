import type { Request, Response, NextFunction } from 'express';
import { verifyApiKey } from '../db';

declare global {
  namespace Express {
    interface Request {
      apiKeyId?: string;
      apiKeyScopes?: string[];
    }
  }
}

// Sliding window rate limiter: 60 requests per minute per key
const RATE_LIMIT_WINDOW = 60_000;
const RATE_LIMIT_MAX = 60;
const rateLimitMap = new Map<string, number[]>();

function checkRateLimit(keyId: string): boolean {
  const now = Date.now();
  const timestamps = (rateLimitMap.get(keyId) ?? []).filter(t => now - t < RATE_LIMIT_WINDOW);
  if (timestamps.length >= RATE_LIMIT_MAX) return false;
  timestamps.push(now);
  rateLimitMap.set(keyId, timestamps);
  return true;
}

export function expandScopes(scopes: string[]): string[] {
  const expanded = new Set(scopes);
  if (expanded.has('mcp:admin')) {
    expanded.add('mcp:write');
    expanded.add('mcp:read');
  }
  if (expanded.has('mcp:write')) {
    expanded.add('mcp:read');
  }
  return [...expanded];
}

export function requireApiKey(scope: string) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const header = req.headers.authorization;
    if (!header?.startsWith('Bearer zk_live_')) {
      res.setHeader('WWW-Authenticate', 'Bearer realm="zenku", charset="UTF-8"');
      res.status(401).json({ error: 'ERROR_API_KEY_REQUIRED' });
      return;
    }
    const rawKey = header.slice(7);
    const record = verifyApiKey(rawKey, scope);
    if (!record) {
      res.status(403).json({ error: 'ERROR_API_KEY_INVALID_OR_INSUFFICIENT_SCOPE' });
      return;
    }
    if (!checkRateLimit(record.id)) {
      res.status(429).json({ error: 'ERROR_RATE_LIMIT_EXCEEDED' });
      return;
    }
    req.apiKeyId = record.id;
    req.apiKeyScopes = record.scopes;
    next();
  };
}
