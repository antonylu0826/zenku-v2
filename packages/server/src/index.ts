import dotenv from 'dotenv';
import path from 'path';
import express from 'express';
import cors from 'cors';

// Environment configuration
dotenv.config({ path: path.resolve(process.cwd(), '../../.env') });

import { getDb, writeJournal } from './db';
import authRouter from './routes/auth';
import adminRouter from './routes/admin';
import viewsRouter from './routes/views';
import dataRouter from './routes/data';
import chatRouter from './routes/chat';
import extRouter from './routes/ext';
import filesRouter from './routes/files';
import mcpRouter from './routes/mcp';
import { requireAuth } from './middleware/auth';
import crypto from 'crypto';

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());

// ──────────────────────────────────────────────
// Routes
// ──────────────────────────────────────────────
app.use('/api', authRouter);
app.use('/api', adminRouter);
app.use('/api', viewsRouter);
app.use('/api/data', dataRouter);
app.use('/api', chatRouter);
app.use('/api/ext', extRouter);
app.use('/api/files', filesRouter);
app.use('/api/mcp', mcpRouter);

// ──────────────────────────────────────────────
// Webhook callback
// ──────────────────────────────────────────────
// Legacy webhook callback — kept for backward compatibility but now requires WEBHOOK_SECRET.
// Prefer using POST /api/ext/webhook/callback with API Key instead.
function authenticateWebhook(req: express.Request, res: express.Response, next: express.NextFunction): void {
  const secret = process.env.WEBHOOK_SECRET;
  if (!secret) {
    res.status(503).json({ error: 'Webhook not configured. Use /api/ext/webhook/callback with an API Key instead.' });
    return;
  }

  const signature = req.headers['x-zenku-signature'];
  const expected = crypto
    .createHmac('sha256', secret)
    .update(JSON.stringify(req.body))
    .digest('hex');

  const sigBuf = Buffer.from(typeof signature === 'string' ? signature : '', 'utf8');
  const expBuf = Buffer.from(expected, 'utf8');
  if (sigBuf.length !== expBuf.length || !crypto.timingSafeEqual(sigBuf, expBuf)) {
    res.status(401).json({ error: 'Invalid signature' });
    return;
  }
  next();
}

app.post('/api/webhook/callback', authenticateWebhook, (req, res) => {
  const { table, record_id, updates } = req.body as {
    table?: string;
    record_id?: unknown;
    updates?: Record<string, unknown>;
  };

  if (!table || !record_id || !updates || typeof updates !== 'object') {
    res.status(400).json({ error: 'Missing required fields: table, record_id, updates' });
    return;
  }
  if (String(table).startsWith('_zenku_')) {
    res.status(403).json({ error: 'Modifying system tables is not allowed' });
    return;
  }

  try {
    const db = getDb();
    const keys = Object.keys(updates);
    if (keys.length === 0) { res.json({ success: true }); return; }

    const setClause = keys.map(k => `"${k}" = ?`).join(', ');
    db.prepare(`UPDATE "${table}" SET ${setClause} WHERE id = ?`)
      .run(...(Object.values(updates) as (string | number | null)[]), record_id as string | number);

    writeJournal({
      agent: 'logic',
      type: 'rule_change',
      description: `Webhook callback updated ${table} #${String(record_id)}`,
      diff: { before: null, after: updates },
      user_request: 'webhook callback',
      reversible: false,
    });

    res.json({ success: true });
  } catch (err) {
    res.status(400).json({ error: String(err) });
  }
});

// ──────────────────────────────────────────────
// Production static file serving
// ──────────────────────────────────────────────
if (process.env.NODE_ENV === 'production') {
  const clientBuildPath = path.resolve(process.cwd(), '../client/dist');
  app.use(express.static(clientBuildPath));
  app.get('*', (req, res) => {
    if (!req.path.startsWith('/api')) {
      res.sendFile(path.join(clientBuildPath, 'index.html'));
    } else {
      res.status(404).json({ error: 'Not found' });
    }
  });
}

app.listen(PORT, () => {
  console.log(`[Zenku Engine] Server running on port ${PORT}`);
});
