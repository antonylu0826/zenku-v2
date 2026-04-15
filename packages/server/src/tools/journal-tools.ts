import { getDb, getTableSchema, writeJournal, getRecentJournal, type JournalRow, type ReverseOp } from '../db';
import type { AgentResult } from '../types';

export { writeJournal, getRecentJournal };

// ===== Undo =====

function executeReverseOp(op: ReverseOp): void {
  const db = getDb();
  if (op.type === 'sql' && op.sql) {
    db.exec(op.sql);
  } else if (op.type === 'drop_column' && op.table && op.column) {
    // SQLite 3.35+ supports DROP COLUMN directly
    db.exec(`ALTER TABLE "${op.table}" DROP COLUMN "${op.column}"`);
  }
}

function undoEntry(entry: JournalRow, reversedBy: number): AgentResult {
  if (!entry.reversible) return { success: false, message: `Operation "${entry.description}" is not reversible` };
  if (entry.reversed) return { success: false, message: `Operation "${entry.description}" has already been reversed` };
  if (!entry.reverse_operations) return { success: false, message: `Operation "${entry.description}" has no reversal information` };

  const ops: ReverseOp[] = JSON.parse(entry.reverse_operations);

  try {
    for (const op of ops) {
      executeReverseOp(op);
    }
  } catch (err) {
    return { success: false, message: `Reversal failed: ${String(err)}` };
  }

  const db = getDb();
  db.prepare('UPDATE _zenku_journal SET reversed = 1, reversed_by = ? WHERE id = ?')
    .run(reversedBy, entry.id);

  return { success: true, message: `Reversed: ${entry.description}` };
}

export function undoLast(userRequest: string): AgentResult {
  const db = getDb();
  const entry = db.prepare(
    'SELECT * FROM _zenku_journal WHERE reversed = 0 AND reversible = 1 ORDER BY id DESC LIMIT 1'
  ).get() as JournalRow | undefined;

  if (!entry) return { success: false, message: 'No reversible operations' };

  // Write undo journal entry first
  const undoId = writeJournal({
    agent: 'undo',
    type: 'undo',
    description: `Undo: ${entry.description}`,
    diff: { before: entry.description, after: null },
    user_request: userRequest,
    reversible: false,
  });

  return undoEntry(entry, undoId);
}

export function undoById(journalId: number, userRequest: string): AgentResult {
  const db = getDb();
  const entry = db.prepare('SELECT * FROM _zenku_journal WHERE id = ?').get(journalId) as JournalRow | undefined;

  if (!entry) return { success: false, message: `Journal record #${journalId} not found` };

  const undoId = writeJournal({
    agent: 'undo',
    type: 'undo',
    description: `Undo: ${entry.description}`,
    diff: { before: entry.description, after: null },
    user_request: userRequest,
    reversible: false,
  });

  return undoEntry(entry, undoId);
}

export function undoSince(since: string, userRequest: string): AgentResult {
  const db = getDb();
  const entries = db.prepare(
    "SELECT * FROM _zenku_journal WHERE timestamp >= ? AND reversed = 0 AND reversible = 1 ORDER BY id DESC"
  ).all(since) as unknown as JournalRow[];

  if (entries.length === 0) return { success: false, message: `No reversible operations after ${since}` };

  const undoId = writeJournal({
    agent: 'undo',
    type: 'undo',
    description: `Batch undo ${entries.length} operations (since ${since})`,
    diff: { before: entries.map(e => e.description), after: null },
    user_request: userRequest,
    reversible: false,
  });

  const results: string[] = [];
  let failCount = 0;

  for (const entry of entries) {
    const r = undoEntry(entry, undoId);
    if (r.success) results.push(entry.description);
    else failCount++;
  }

  return {
    success: true,
    message: `Reversed ${results.length} operations${failCount > 0 ? `, ${failCount} failed` : ''}`,
    data: { undone: results, failed: failCount },
  };
}

// ===== Journal summary for system prompt =====

export function buildJournalContext(): string {
  const entries = getRecentJournal(20);
  if (entries.length === 0) return '(No operation history)';

  return entries
    .slice()
    .reverse() // chronological order
    .map(e => `[${e.timestamp.slice(0, 16)}] ${e.description}${e.user_request ? ` (Reason: ${e.user_request})` : ''}`)
    .join('\n');
}
