import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { SqliteAdapter } from './sqlite-adapter';
import { setDb, getDb } from './index';
import { buildDynamicContext } from '../orchestrator';

let testDb: SqliteAdapter;

before(async () => {
  testDb = new SqliteAdapter(':memory:');
  setDb(testDb);
  await testDb.initSystemTables();
});

after(async () => {
  await testDb.close();
  setDb(new SqliteAdapter(':memory:'));
});

// ── buildDynamicContext – empty DB (must run BEFORE any table creation) ──────

describe('buildDynamicContext – empty DB', () => {
  test('produces stable output with no user tables', async () => {
    const ctx = await buildDynamicContext();
    assert.ok(ctx.includes('## Tables'));
    assert.ok(ctx.includes('(No tables yet)'));
    assert.ok(ctx.includes('## Views'));
    assert.ok(ctx.includes('(No views yet)'));
    assert.ok(ctx.includes('## Rules'));
    assert.ok(ctx.includes('(No rules defined)'));
    assert.ok(ctx.includes('## Recent Operations'));
  });
});

// ── getForeignKeys (SQLite) ────────────────────────────────────────────────

describe('SqliteAdapter.getForeignKeys', () => {
  test('returns empty array for table with no FKs', async () => {
    await testDb.createTable('fk_test_items', [{ name: 'name', type: 'TEXT' }]);
    const fks = await testDb.getForeignKeys('fk_test_items');
    assert.deepEqual(fks, []);
  });

  test('returns FK metadata for a table with a foreign key', async () => {
    await testDb.createTable('fk_customers', [{ name: 'name', type: 'TEXT', required: true }]);
    await testDb.createTable('fk_orders', [
      { name: 'title', type: 'TEXT' },
      { name: 'customer_id', type: 'INTEGER', references: { table: 'fk_customers', column: 'id' } },
    ]);
    const fks = await testDb.getForeignKeys('fk_orders');
    assert.equal(fks.length, 1);
    assert.equal(fks[0].from, 'customer_id');
    assert.equal(fks[0].toTable, 'fk_customers');
    assert.equal(fks[0].toColumn, 'id');
    assert.equal(fks[0].table, 'fk_orders');
  });

  test('returns empty array for non-existent table without throwing', async () => {
    const fks = await testDb.getForeignKeys('nonexistent_table_xyz');
    assert.deepEqual(fks, []);
  });
});

describe('buildDynamicContext – with table and FK', () => {
  before(async () => {
    // Tables created in getForeignKeys tests above are reused
    // Insert a view definition for orders
    await getDb().execute(
      `INSERT INTO _zenku_views (id, name, table_name, definition) VALUES (?, ?, ?, ?)`,
      [
        'fk_orders',
        'Orders',
        'fk_orders',
        JSON.stringify({
          type: 'table',
          actions: ['create', 'edit', 'delete'],
          form: {
            fields: [
              { key: 'title', type: 'text', label: 'Title' },
              { key: 'customer_id', type: 'relation', label: 'Customer' },
            ],
          },
        }),
      ],
    );
    // Insert a rule
    await getDb().execute(
      `INSERT INTO _zenku_rules (id, name, table_name, trigger_types, condition, actions, enabled) VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        'rule1',
        'require_title',
        'fk_orders',
        JSON.stringify(['before_insert']),
        JSON.stringify({ field: 'title', operator: 'eq', value: '' }),
        JSON.stringify([{ type: 'validate', message: 'Title required' }]),
        1,
      ],
    );
  });

  test('output includes column type information', async () => {
    const ctx = await buildDynamicContext();
    assert.ok(ctx.includes('### fk_orders'));
    assert.ok(ctx.includes('Columns:'));
    assert.ok(ctx.includes('TEXT') || ctx.includes('INTEGER'));
  });

  test('output includes FK information', async () => {
    const ctx = await buildDynamicContext();
    assert.ok(ctx.includes('FK:'));
    assert.ok(ctx.includes('customer_id → fk_customers.id'));
  });

  test('output includes view type and form fields', async () => {
    const ctx = await buildDynamicContext();
    assert.ok(ctx.includes('### Orders [table]'));
    assert.ok(ctx.includes('Actions: create, edit, delete'));
    assert.ok(ctx.includes('Form fields'));
    assert.ok(ctx.includes('title [text]'));
    assert.ok(ctx.includes('customer_id [relation]'));
  });

  test('output includes rule condition and action', async () => {
    const ctx = await buildDynamicContext();
    assert.ok(ctx.includes('### require_title'));
    assert.ok(ctx.includes('before_insert'));
    assert.ok(ctx.includes('Condition:'));
    assert.ok(ctx.includes('Actions:'));
    assert.ok(ctx.includes('validate'));
  });
});
