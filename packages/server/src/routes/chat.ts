import { Router } from 'express';
import { getDb } from '../db';
import { requireAuth } from '../middleware/auth';
import { chat } from '../orchestrator';
import { p } from '../utils';

const router = Router();

// ──────────────────────────────────────────────
// Chat endpoint (SSE)
// ──────────────────────────────────────────────
router.post('/chat', requireAuth, async (req, res) => {
  const { message, history = [], provider, model, session_id, attachments = [] } = req.body as {
    message: string;
    history: { role: 'user' | 'assistant'; content: string }[];
    provider?: string;
    model?: string;
    session_id?: string;
    attachments?: { filename: string; mime_type: string; data: string }[];
  };

  if (!message) {
    res.status(400).json({ error: 'ERROR_MISSING_MESSAGE' });
    return;
  }

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');

  try {
    const role = req.user!.role;
    let existingSessionId: string | undefined;
    if (session_id) {
      const owned = getDb().prepare(
        'SELECT id FROM _zenku_chat_sessions WHERE id = ? AND user_id = ? AND archived = 0'
      ).get(session_id, req.user!.id);
      if (owned) existingSessionId = session_id;
    }
    const aiOptions = {
      provider: provider as any,
      model,
      userId: req.user!.id,
      existingSessionId,
    };
    for await (const chunk of chat(message, history, role, aiOptions, attachments)) {
      res.write(`data: ${chunk}\n`);
    }
  } catch (err) {
    const errorBody = { type: 'error', error: 'ERROR_INTERNAL_SERVER', params: { detail: err instanceof Error ? err.message : String(err) } };
    res.write(`data: ${JSON.stringify(errorBody)}\n`);
  }

  res.end();
});

// ──────────────────────────────────────────────
// Sessions
// ──────────────────────────────────────────────
router.get('/sessions', requireAuth, (req, res) => {
  const db = getDb();
  const limit = Math.min(50, Math.max(1, Number(req.query.limit ?? 20)));
  const sessions = db.prepare(`
    SELECT id, title, provider, model, message_count, created_at, updated_at
    FROM _zenku_chat_sessions
    WHERE user_id = ? AND archived = 0
    ORDER BY updated_at DESC
    LIMIT ?
  `).all(req.user!.id, limit);
  res.json(sessions);
});

router.get('/sessions/:id/messages', requireAuth, (req, res) => {
  const db = getDb();
  const sessionId = p(req.params.id);
  const session = db.prepare(
    'SELECT id FROM _zenku_chat_sessions WHERE id = ? AND user_id = ?'
  ).get(sessionId, req.user!.id);
  if (!session) { res.status(404).json({ error: 'ERROR_SESSION_NOT_FOUND' }); return; }

  const messages = db.prepare(
    'SELECT * FROM _zenku_chat_messages WHERE session_id = ? ORDER BY created_at'
  ).all(sessionId) as { id: string }[];

  const toolEvents = db.prepare(
    'SELECT * FROM _zenku_tool_events WHERE session_id = ? ORDER BY started_at'
  ).all(sessionId) as { message_id: string; tool_input: string; tool_output: string }[];

  const toolsByMsg: Record<string, unknown[]> = {};
  for (const te of toolEvents) {
    const mid = te.message_id;
    if (!toolsByMsg[mid]) toolsByMsg[mid] = [];
    toolsByMsg[mid].push({
      ...te,
      tool_input: JSON.parse(te.tool_input || '{}'),
      tool_output: JSON.parse(te.tool_output || '{}'),
    });
  }

  const timeline = messages.map(m => ({ ...m, tool_events: toolsByMsg[m.id] ?? [] }));
  res.json(timeline);
});

router.patch('/sessions/:id/title', requireAuth, (req, res) => {
  const db = getDb();
  const sessionId = p(req.params.id);
  const { title } = req.body as { title?: string };
  if (!title?.trim()) { res.status(400).json({ error: 'ERROR_INVALID_NAME' }); return; }
  const session = db.prepare(
    'SELECT id FROM _zenku_chat_sessions WHERE id = ? AND user_id = ?'
  ).get(sessionId, req.user!.id);
  if (!session) { res.status(404).json({ error: 'ERROR_SESSION_NOT_FOUND' }); return; }
  db.prepare('UPDATE _zenku_chat_sessions SET title = ? WHERE id = ?').run(title.trim(), sessionId);
  res.json({ success: true });
});

router.patch('/sessions/:id/archive', requireAuth, (req, res) => {
  const db = getDb();
  const sessionId = p(req.params.id);
  const session = db.prepare(
    'SELECT id FROM _zenku_chat_sessions WHERE id = ? AND user_id = ?'
  ).get(sessionId, req.user!.id);
  if (!session) { res.status(404).json({ error: 'ERROR_SESSION_NOT_FOUND' }); return; }
  db.prepare('UPDATE _zenku_chat_sessions SET archived = 1 WHERE id = ?').run(sessionId);
  res.json({ success: true });
});

// ──────────────────────────────────────────────
// Dashboard query endpoint (SELECT only)
// ──────────────────────────────────────────────
router.post('/query', requireAuth, (req, res) => {
  const { sql } = req.body as { sql?: string };
  if (!sql || typeof sql !== 'string') {
    res.status(400).json({ error: 'ERROR_MISSING_SQL' });
    return;
  }
  const normalized = sql.trim().toUpperCase();
  if (!normalized.startsWith('SELECT')) {
    res.status(400).json({ error: 'ERROR_ONLY_SELECT_ALLOWED' });
    return;
  }
  try {
    const db = getDb();
    const safeSQL = /\bLIMIT\b/i.test(sql) ? sql : `${sql} LIMIT 1000`;
    const rows = db.prepare(safeSQL).all();
    res.json(rows);
  } catch (err) {
    res.status(400).json({ error: 'ERROR_INTERNAL_SERVER', params: { detail: String(err) } });
  }
});

export default router;
