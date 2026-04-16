import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { getDb } from '../db';
import {
  requireAuth,
  registerHandler, loginHandler, meHandler, logoutHandler, statusHandler,
} from '../middleware/auth';

const router = Router();

// ──────────────────────────────────────────────
// Auth endpoints
// ──────────────────────────────────────────────
router.get('/auth/status', statusHandler);
router.post('/auth/register', (req, res) => { void registerHandler(req, res); });
router.post('/auth/login', (req, res) => { void loginHandler(req, res); });
router.get('/auth/me', requireAuth, meHandler);
router.post('/auth/logout', requireAuth, logoutHandler);

// ──────────────────────────────────────────────
// User self-service (any authenticated user)
// ──────────────────────────────────────────────
router.put('/users/me', requireAuth, (req, res) => {
  const { name } = req.body as { name?: string };
  if (!name || !name.trim()) {
    res.status(400).json({ error: '姓名不可為空' });
    return;
  }
  const db = getDb();
  db.prepare('UPDATE _zenku_users SET name = ? WHERE id = ?').run(name.trim(), req.user!.id);
  res.json({ success: true, name: name.trim() });
});

router.put('/users/me/password', requireAuth, async (req, res) => {
  const { old_password, new_password } = req.body as { old_password?: string; new_password?: string };
  if (!old_password || !new_password) {
    res.status(400).json({ error: '缺少必填欄位' });
    return;
  }
  if (new_password.length < 6) {
    res.status(400).json({ error: '新密碼至少 6 個字元' });
    return;
  }
  const db = getDb();
  const user = db.prepare('SELECT password_hash FROM _zenku_users WHERE id = ?').get(req.user!.id) as { password_hash: string } | undefined;
  if (!user) {
    res.status(404).json({ error: '使用者不存在' });
    return;
  }
  const valid = await bcrypt.compare(old_password, user.password_hash);
  if (!valid) {
    res.status(400).json({ error: '舊密碼不正確' });
    return;
  }
  const hash = await bcrypt.hash(new_password, 12);
  db.prepare('UPDATE _zenku_users SET password_hash = ? WHERE id = ?').run(hash, req.user!.id);
  // Invalidate all other sessions (keep current one)
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    const currentToken = authHeader.slice(7);
    db.prepare('DELETE FROM _zenku_sessions WHERE user_id = ? AND token != ?').run(req.user!.id, currentToken);
  }
  res.json({ success: true });
});

export default router;
