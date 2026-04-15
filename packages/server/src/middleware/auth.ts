import bcrypt from 'bcryptjs';
import { getDb, getUserCount } from '../db';
import type { Request, Response, NextFunction } from 'express';

export interface AuthUser {
  id: string;
  email: string;
  name: string;
  role: 'admin' | 'builder' | 'user';
}

// Extend Express Request
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

function expiresAt(): string {
  const d = new Date();
  d.setDate(d.getDate() + 30);
  return d.toISOString().replace('T', ' ').slice(0, 19);
}

// ===== Middleware =====

export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) {
    res.status(401).json({ error: '未登入' });
    return;
  }
  const token = header.slice(7);
  const db = getDb();
  const session = db.prepare(
    `SELECT s.user_id, u.id, u.email, u.name, u.role
     FROM _zenku_sessions s
     JOIN _zenku_users u ON u.id = s.user_id
     WHERE s.token = ? AND s.expires_at > datetime('now') AND u.disabled = 0`
  ).get(token) as (AuthUser & { user_id: string }) | undefined;

  if (!session) {
    res.status(401).json({ error: 'Token 無效或已過期' });
    return;
  }

  req.user = { id: session.id, email: session.email, name: session.name, role: session.role };
  next();
}

export function requireAdmin(req: Request, res: Response, next: NextFunction): void {
  requireAuth(req, res, () => {
    if (req.user?.role !== 'admin') {
      res.status(403).json({ error: '需要管理員權限' });
      return;
    }
    next();
  });
}

// ===== Route handlers =====

export async function registerHandler(req: Request, res: Response): Promise<void> {
  const { email, name, password } = req.body as { email?: string; name?: string; password?: string };
  if (!email || !name || !password) {
    res.status(400).json({ error: '缺少必填欄位' });
    return;
  }
  if (password.length < 6) {
    res.status(400).json({ error: '密碼至少 6 個字元' });
    return;
  }

  const db = getDb();
  const existing = db.prepare('SELECT id FROM _zenku_users WHERE email = ?').get(email);
  if (existing) {
    res.status(409).json({ error: '此 Email 已被使用' });
    return;
  }

  const isFirst = getUserCount() === 0;
  const role = isFirst ? 'admin' : 'user';
  const id = crypto.randomUUID();
  const hash = await bcrypt.hash(password, 12);

  db.prepare('INSERT INTO _zenku_users (id, email, name, password_hash, role) VALUES (?, ?, ?, ?, ?)')
    .run(id, email, name, hash, role);

  const token = generateToken();
  const sessionId = crypto.randomUUID();
  db.prepare('INSERT INTO _zenku_sessions (id, user_id, token, expires_at) VALUES (?, ?, ?, ?)')
    .run(sessionId, id, token, expiresAt());

  res.json({ token, user: { id, email, name, role } });
}

export async function loginHandler(req: Request, res: Response): Promise<void> {
  const { email, password } = req.body as { email?: string; password?: string };
  if (!email || !password) {
    res.status(400).json({ error: '缺少 email 或 password' });
    return;
  }

  const db = getDb();
  const user = db.prepare('SELECT * FROM _zenku_users WHERE email = ?').get(email) as {
    id: string; email: string; name: string; password_hash: string; role: string;
  } | undefined;

  if (!user || !(await bcrypt.compare(password, user.password_hash))) {
    res.status(401).json({ error: '帳號或密碼錯誤' });
    return;
  }

  db.prepare(`UPDATE _zenku_users SET last_login_at = datetime('now') WHERE id = ?`).run(user.id);

  const token = generateToken();
  const sessionId = crypto.randomUUID();
  db.prepare('INSERT INTO _zenku_sessions (id, user_id, token, expires_at) VALUES (?, ?, ?, ?)')
    .run(sessionId, user.id, token, expiresAt());

  res.json({ token, user: { id: user.id, email: user.email, name: user.name, role: user.role } });
}

export function meHandler(req: Request, res: Response): void {
  res.json(req.user);
}

export function logoutHandler(req: Request, res: Response): void {
  const header = req.headers.authorization;
  if (header?.startsWith('Bearer ')) {
    const token = header.slice(7);
    getDb().prepare('DELETE FROM _zenku_sessions WHERE token = ?').run(token);
  }
  res.json({ success: true });
}

export function statusHandler(_req: Request, res: Response): void {
  const count = getUserCount();
  res.json({ has_users: count > 0 });
}
