import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { SqliteAdapter } from '../db/sqlite-adapter';
import { setDb, getDb } from '../db';
import { writeJournal } from '../db/journal';
import { createRecord, updateRecord, deleteRecord } from './data-service';

let testDb: SqliteAdapter;

before(async () => {
  testDb = new SqliteAdapter(':memory:');
  setDb(testDb);
  await testDb.initSystemTables();
  // Create a minimal user table for data-service tests
  await testDb.createTable('test_items', [
    { name: 'name', type: 'TEXT', required: true },
    { name: 'notes', type: 'TEXT' },
    { name: 'amount', type: 'REAL' },
  ]);
});

after(async () => {
  await testDb.close();
  // Restore clean state so other test files can set their own DB
  setDb(new SqliteAdapter(':memory:'));
});

// ── journal reversible ────────────────────────────────────────────────────

describe('writeJournal reversible semantics', () => {
  test('no reverse_operations → reversible = 0', async () => {
    const id = await writeJournal({
      agent: 'test',
      type: 'test',
      description: 'no reverse ops',
      diff: { before: null, after: null },
    });
    const { rows } = await getDb().query<{ reversible: number }>(
      'SELECT reversible FROM _zenku_journal WHERE id = ?', [id],
    );
    assert.equal(rows[0]?.reversible, 0);
  });

  test('empty reverse_operations array → reversible = 0', async () => {
    const id = await writeJournal({
      agent: 'test',
      type: 'test',
      description: 'empty reverse ops',
      diff: { before: null, after: null },
      reverse_operations: [],
    });
    const { rows } = await getDb().query<{ reversible: number }>(
      'SELECT reversible FROM _zenku_journal WHERE id = ?', [id],
    );
    assert.equal(rows[0]?.reversible, 0);
  });

  test('with reverse_operations → reversible = 1', async () => {
    const id = await writeJournal({
      agent: 'test',
      type: 'test',
      description: 'has reverse ops',
      diff: { before: null, after: null },
      reverse_operations: [{ type: 'sql', sql: 'SELECT 1' }],
    });
    const { rows } = await getDb().query<{ reversible: number }>(
      'SELECT reversible FROM _zenku_journal WHERE id = ?', [id],
    );
    assert.equal(rows[0]?.reversible, 1);
  });
});

// ── createRecord ─────────────────────────────────────────────────────────

describe('createRecord', () => {
  test('inserts a record and returns it', async () => {
    const result = await createRecord({
      table: 'test_items',
      data: { name: 'Widget A', notes: 'test' },
      actor: { type: 'browser' },
    });
    assert.equal(result.success, true);
    assert.ok(result.record);
    assert.equal(result.record.name, 'Widget A');
    assert.ok(result.id !== undefined);
  });

  test('fails for invalid table name', async () => {
    const result = await createRecord({
      table: 'DROP TABLE users;--',
      data: { name: 'x' },
      actor: { type: 'browser' },
    });
    assert.equal(result.success, false);
    assert.equal(result.errorCode, 'ERROR_INVALID_TABLE');
  });

  test('fails for system table', async () => {
    const result = await createRecord({
      table: '_zenku_users',
      data: { name: 'x' },
      actor: { type: 'browser' },
    });
    assert.equal(result.success, false);
    assert.equal(result.errorCode, 'ERROR_INVALID_TABLE');
  });

  test('ext_api actor writes journal entry with reverse op (reversible)', async () => {
    const result = await createRecord({
      table: 'test_items',
      data: { name: 'API Item' },
      actor: { type: 'ext_api', apiKeyId: 'key_test' },
      userRequest: 'api test',
    });
    assert.equal(result.success, true);
    const id = result.id;
    const { rows } = await getDb().query<{ reversible: number; reverse_operations: string }>(
      'SELECT reversible, reverse_operations FROM _zenku_journal WHERE description LIKE ? ORDER BY id DESC LIMIT 1',
      [`%test_items (id: ${id})%`],
    );
    assert.ok(rows[0]);
    assert.equal(rows[0].reversible, 1);
    assert.ok(rows[0].reverse_operations?.includes('DELETE'));
  });

  test('browser actor does not write journal entry', async () => {
    const { rows: before } = await getDb().query<{ id: number }>(
      'SELECT id FROM _zenku_journal ORDER BY id DESC LIMIT 1',
    );
    const lastId = before[0]?.id ?? 0;

    await createRecord({
      table: 'test_items',
      data: { name: 'Browser Item' },
      actor: { type: 'browser' },
    });

    const { rows: after } = await getDb().query<{ id: number }>(
      'SELECT id FROM _zenku_journal WHERE id > ? AND agent NOT LIKE ?',
      [lastId, 'ext_api%'],
    );
    assert.equal(after.length, 0);
  });
});

// ── updateRecord ─────────────────────────────────────────────────────────

describe('updateRecord', () => {
  test('updates a record and journal entry is reversible', async () => {
    const created = await createRecord({
      table: 'test_items',
      data: { name: 'Before Update', notes: 'original' },
      actor: { type: 'browser' },
    });
    assert.ok(created.id !== undefined);
    const recordId = created.id;

    const result = await updateRecord({
      table: 'test_items',
      id: recordId,
      data: { notes: 'updated' },
      actor: { type: 'ext_api', apiKeyId: 'key_test' },
      userRequest: 'patch test',
    });
    assert.equal(result.success, true);
    assert.equal(result.record?.notes, 'updated');

    const { rows } = await getDb().query<{ reversible: number; reverse_operations: string }>(
      "SELECT reversible, reverse_operations FROM _zenku_journal WHERE description LIKE '%test_items%' AND description LIKE '%updated%' ORDER BY id DESC LIMIT 1",
    );
    // If no rows found, look more broadly
    const { rows: rows2 } = await getDb().query<{ reversible: number; reverse_operations: string }>(
      'SELECT reversible, reverse_operations FROM _zenku_journal ORDER BY id DESC LIMIT 3',
    );
    const entry = rows[0] ?? rows2.find(r => r.reverse_operations?.includes('UPDATE'));
    assert.ok(entry, 'Expected a journal entry for update');
    assert.equal(entry.reversible, 1);
    assert.ok(entry.reverse_operations?.includes('UPDATE'));
    assert.ok(entry.reverse_operations?.includes('original'));
  });

  test('returns error for non-existent record', async () => {
    const result = await updateRecord({
      table: 'test_items',
      id: 99999,
      data: { notes: 'x' },
      actor: { type: 'ext_api' },
    });
    assert.equal(result.success, false);
    assert.equal(result.errorCode, 'ERROR_DATA_NOT_FOUND');
  });
});

// ── deleteRecord ─────────────────────────────────────────────────────────

describe('deleteRecord', () => {
  test('deletes record and journal entry is NOT reversible', async () => {
    const created = await createRecord({
      table: 'test_items',
      data: { name: 'To Delete' },
      actor: { type: 'browser' },
    });
    assert.ok(created.id !== undefined);

    const result = await deleteRecord({
      table: 'test_items',
      id: created.id,
      actor: { type: 'ext_api', apiKeyId: 'key_del' },
    });
    assert.equal(result.success, true);

    // Journal entry should be irreversible (no reverse_operations)
    const { rows } = await getDb().query<{ reversible: number }>(
      "SELECT reversible FROM _zenku_journal WHERE description LIKE '%deleted%' AND description LIKE '%test_items%' ORDER BY id DESC LIMIT 1",
    );
    assert.ok(rows[0]);
    assert.equal(rows[0].reversible, 0);
  });

  test('returns error for non-existent record', async () => {
    const result = await deleteRecord({
      table: 'test_items',
      id: 99999,
      actor: { type: 'ext_api' },
    });
    assert.equal(result.success, false);
    assert.equal(result.errorCode, 'ERROR_DATA_NOT_FOUND');
  });
});
