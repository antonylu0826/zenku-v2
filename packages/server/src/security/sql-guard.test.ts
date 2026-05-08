import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { guardSql } from './sql-guard';

describe('guardSql – allowed queries', () => {
  test('simple SELECT passes', () => {
    assert.equal(guardSql('SELECT * FROM orders').allowed, true);
  });

  test('SELECT with WHERE passes', () => {
    assert.equal(guardSql("SELECT id, name FROM orders WHERE status = 'active'").allowed, true);
  });

  test('SELECT with JOIN passes', () => {
    assert.equal(guardSql('SELECT o.id, c.name FROM orders o JOIN customers c ON o.customer_id = c.id').allowed, true);
  });

  test('lowercase select passes', () => {
    assert.equal(guardSql('select * from orders').allowed, true);
  });

  test('WITH CTE passes', () => {
    assert.equal(guardSql('WITH recent AS (SELECT * FROM orders) SELECT * FROM recent').allowed, true);
  });

  test('SELECT with semicolon inside string passes', () => {
    assert.equal(guardSql("SELECT * FROM orders WHERE notes = 'a;b'").allowed, true);
  });

  test('SELECT with aggregate passes', () => {
    assert.equal(guardSql('SELECT COUNT(*) AS total FROM orders').allowed, true);
  });
});

describe('guardSql – blocked: non-SELECT start', () => {
  test('DELETE statement is blocked', () => {
    const r = guardSql('DELETE FROM orders');
    assert.equal(r.allowed, false);
    assert.ok(r.reason);
  });

  test('INSERT statement is blocked', () => {
    assert.equal(guardSql("INSERT INTO orders VALUES (1, 'x')").allowed, false);
  });

  test('UPDATE statement is blocked', () => {
    assert.equal(guardSql("UPDATE orders SET status = 'x'").allowed, false);
  });

  test('DROP TABLE is blocked', () => {
    assert.equal(guardSql('DROP TABLE orders').allowed, false);
  });

  test('empty SQL is blocked', () => {
    assert.equal(guardSql('').allowed, false);
  });

  test('whitespace-only SQL is blocked', () => {
    assert.equal(guardSql('   ').allowed, false);
  });
});

describe('guardSql – blocked: multi-statement', () => {
  test('SELECT followed by DROP via semicolon is blocked', () => {
    const r = guardSql('SELECT * FROM orders; DROP TABLE orders');
    assert.equal(r.allowed, false);
    assert.ok(r.reason?.toLowerCase().includes('multi-statement') || r.reason?.includes(';'));
  });

  test('SELECT 1; SELECT 2 is blocked', () => {
    assert.equal(guardSql('SELECT 1; SELECT 2').allowed, false);
  });
});

describe('guardSql – blocked: dangerous keywords in SELECT', () => {
  test('SELECT with embedded DROP is blocked', () => {
    assert.equal(guardSql('SELECT * FROM orders WHERE 1=1; DROP TABLE orders').allowed, false);
  });

  test('WITH CTE followed by DELETE is blocked', () => {
    assert.equal(guardSql('WITH x AS (SELECT 1) DELETE FROM orders').allowed, false);
  });

  test('PRAGMA in SELECT context is blocked', () => {
    // PRAGMA is not a valid SELECT keyword, but let's ensure it's blocked
    assert.equal(guardSql('SELECT PRAGMA table_info(orders)').allowed, false);
  });
});

describe('guardSql – blocked: system tables', () => {
  test('FROM _zenku_users is blocked', () => {
    const r = guardSql('SELECT * FROM _zenku_users');
    assert.equal(r.allowed, false);
    assert.ok(r.reason?.toLowerCase().includes('system'));
  });

  test('JOIN _zenku_sessions is blocked', () => {
    assert.equal(guardSql('SELECT * FROM orders JOIN _zenku_sessions ON 1=1').allowed, false);
  });

  test('quoted system table is blocked', () => {
    assert.equal(guardSql('SELECT * FROM "_zenku_users"').allowed, false);
  });

  test('non-system table with _zenku_ in value is NOT blocked', () => {
    // A user table named something else that has _zenku_ in a string literal
    // This might be a false negative, but not a security issue since
    // _zenku_ in a WHERE value doesn't grant access
    const r = guardSql("SELECT * FROM orders WHERE tag = '_zenku_test'");
    assert.equal(r.allowed, true);
  });
});
