import bcrypt from 'bcryptjs';
import { getDb, dbNow } from '../db';
import { getUserCount } from '../db/auth';
import { listOidcProviders } from '../db/oidc';
import { getAuthMode } from '../db/settings';
import { dbSessionExpiry } from '../db';
import type { Request, Response, NextFunction } from 'express';

export interface AuthUser {
  id: string;
  email: string;
  name: string;
  role: 'admin' | 'builder' | 'user';
  language: string;
}

declare global {
  namespace Express {
    interface Request {
      user?: AuthUser;
    }
  }
}

function generateToken(): string {
  return crypto.randomUUID().replace(/-/g, '') + crypto.randomUUID().replace(/-/g, '');
}


// ===== Middleware =====

export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) {
    res.status(401).json({ error: 'ERROR_UNAUTHORIZED' });
    return;
  }
  const token = header.slice(7);
  void (async () => {
    try {
      const { rows } = await getDb().query<AuthUser & { user_id: string }>(
        `SELECT s.user_id, u.id, u.email, u.name, u.role, u.language
         FROM _zenku_sessions s
         JOIN _zenku_users u ON u.id = s.user_id
         WHERE s.token = ? AND s.expires_at > ? AND u.disabled = 0`,
        [token, dbNow()]
      );
      const session = rows[0];
      if (!session) {
        res.status(401).json({ error: 'ERROR_INVALID_TOKEN' });
        return;
      }
      req.user = { id: session.id, email: session.email, name: session.name, role: session.role, language: session.language };
      next();
    } catch (err) {
      next(err);
    }
  })();
}

export function requireAdmin(req: Request, res: Response, next: NextFunction): void {
  requireAuth(req, res, () => {
    if (req.user?.role !== 'admin') {
      res.status(403).json({ error: 'ERROR_FORBIDDEN_ADMIN' });
      return;
    }
    next();
  });
}

// ===== Route handlers =====

const SUPPORTED_LANGUAGES = new Set(['en', 'zh-TW']);

export async function registerHandler(req: Request, res: Response): Promise<void> {
  const { email, name, password, language: reqLanguage } = req.body as { email?: string; name?: string; password?: string; language?: string };
  if (!email || !name || !password) {
    res.status(400).json({ error: 'ERROR_MISSING_FIELDS' });
    return;
  }
  if (password.length < 6) {
    res.status(400).json({ error: 'ERROR_PASSWORD_TOO_SHORT', params: { min: 6 } });
    return;
  }

  const db = getDb();
  const { rows: existing } = await db.query(
    'SELECT id FROM _zenku_users WHERE email = ?',
    [email]
  );
  if (existing.length > 0) {
    res.status(409).json({ error: 'ERROR_EMAIL_TAKEN' });
    return;
  }

  const isFirst = (await getUserCount()) === 0;
  if (!isFirst && await getAuthMode() === 'sso_only') {
    res.status(403).json({ error: 'ERROR_SSO_ONLY' });
    return;
  }
  const role = isFirst ? 'admin' : 'user';
  const language = (reqLanguage && SUPPORTED_LANGUAGES.has(reqLanguage)) ? reqLanguage : 'en';
  const id = crypto.randomUUID();
  const hash = await bcrypt.hash(password, 12);

  await db.execute(
    'INSERT INTO _zenku_users (id, email, name, password_hash, role, language) VALUES (?, ?, ?, ?, ?, ?)',
    [id, email, name, hash, role, language]
  );

  const token = generateToken();
  const sessionId = crypto.randomUUID();
  await db.execute(
    'INSERT INTO _zenku_sessions (id, user_id, token, expires_at) VALUES (?, ?, ?, ?)',
    [sessionId, id, token, dbSessionExpiry()]
  );

  res.json({ token, user: { id, email, name, role, language } });
}

export async function loginHandler(req: Request, res: Response): Promise<void> {
  const { email, password } = req.body as { email?: string; password?: string };
  if (!email || !password) {
    res.status(400).json({ error: 'ERROR_MISSING_FIELDS' });
    return;
  }
  if (await getAuthMode() === 'sso_only') {
    res.status(403).json({ error: 'ERROR_SSO_ONLY' });
    return;
  }

  const db = getDb();
  const { rows } = await db.query<{
    id: string; email: string; name: string; password_hash: string; role: string; language: string;
  }>(
    'SELECT * FROM _zenku_users WHERE email = ?',
    [email]
  );
  const user = rows[0];

  if (!user || !(await bcrypt.compare(password, user.password_hash))) {
    res.status(401).json({ error: 'ERROR_LOGIN_FAILED' });
    return;
  }

  await db.execute(
    `UPDATE _zenku_users SET last_login_at = ? WHERE id = ?`,
    [dbNow(), user.id]
  );

  const token = generateToken();
  const sessionId = crypto.randomUUID();
  await db.execute(
    'INSERT INTO _zenku_sessions (id, user_id, token, expires_at) VALUES (?, ?, ?, ?)',
    [sessionId, user.id, token, dbSessionExpiry()]
  );

  res.json({ token, user: { id: user.id, email: user.email, name: user.name, role: user.role, language: user.language } });
}

export function meHandler(req: Request, res: Response): void {
  res.json(req.user);
}

export function logoutHandler(req: Request, res: Response): void {
  const header = req.headers.authorization;
  if (header?.startsWith('Bearer ')) {
    const token = header.slice(7);
    void getDb().execute('DELETE FROM _zenku_sessions WHERE token = ?', [token]);
  }
  res.json({ success: true });
}

export async function statusHandler(_req: Request, res: Response): Promise<void> {
  const [count, providers, authMode] = await Promise.all([
    getUserCount(),
    listOidcProviders(true).catch(() => []),
    getAuthMode().catch(() => 'local' as const),
  ]);
  res.json({
    has_users: count > 0,
    oidc_providers: providers.map(p => ({ id: p.id, name: p.name })),
    auth_mode: authMode,
  });
}
