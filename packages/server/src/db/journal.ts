import { getDb } from './index';

let _sessionId: string | null = null;

export function getSessionId(): string {
  if (!_sessionId) _sessionId = crypto.randomUUID();
  return _sessionId;
}

export interface ReverseOp {
  type: 'sql' | 'drop_column' | 'drop_table';
  sql?: string;
  table?: string;
  column?: string;
}

export interface JournalWriteInput {
  agent: string;
  type: string;
  description: string;
  diff: { before: unknown; after: unknown };
  reason?: string;
  user_request?: string;
  reversible?: boolean;
  reverse_operations?: ReverseOp[];
}

export interface JournalRow {
  id: number;
  timestamp: string;
  session_id: string;
  agent: string;
  type: string;
  description: string;
  diff: string;
  reason: string | null;
  user_request: string | null;
  reversible: number;
  reverse_operations: string | null;
  reversed: number;
  reversed_by: number | null;
}

export async function writeJournal(entry: JournalWriteInput): Promise<number> {
  const db = getDb();
  const result = await db.execute(`
    INSERT INTO _zenku_journal
    (session_id, agent, type, description, diff, reason, user_request, reversible, reverse_operations)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `, [
    getSessionId(),
    entry.agent,
    entry.type,
    entry.description,
    JSON.stringify(entry.diff),
    entry.reason ?? '',
    entry.user_request ?? '',
    (entry.reverse_operations && entry.reverse_operations.length > 0) ? 1 : 0,
    entry.reverse_operations ? JSON.stringify(entry.reverse_operations) : null,
  ]);
  return result.lastInsertId ?? 0;
}

export async function getRecentJournal(limit = 20): Promise<JournalRow[]> {
  const { rows } = await getDb().query<JournalRow>(
    'SELECT * FROM _zenku_journal WHERE reversed = 0 ORDER BY id DESC LIMIT ?',
    [limit]
  );
  return rows;
}
