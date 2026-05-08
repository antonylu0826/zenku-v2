import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeToolInput, validateToolInput, type JsonSchema } from './validation';

// ── normalizeToolInput ────────────────────────────────────────────────────

describe('normalizeToolInput', () => {
  const schema: JsonSchema = {
    type: 'object',
    properties: {
      columns: { type: 'array', items: { type: 'object' } },
      name: { type: 'string' },
      config: { type: 'object' },
    },
  };

  test('JSON-stringified top-level input is parsed', () => {
    const input = JSON.stringify({ columns: [], name: 'test' });
    const result = normalizeToolInput(schema, input) as Record<string, unknown>;
    assert.deepEqual(result.columns, []);
    assert.equal(result.name, 'test');
  });

  test('JSON-stringified array property is parsed', () => {
    const input = { columns: JSON.stringify([{ name: 'title', type: 'TEXT' }]) };
    const result = normalizeToolInput(schema, input) as Record<string, unknown>;
    assert.deepEqual(result.columns, [{ name: 'title', type: 'TEXT' }]);
  });

  test('JSON-stringified object property is parsed', () => {
    const input = { config: JSON.stringify({ key: 'value' }) };
    const result = normalizeToolInput(schema, input) as Record<string, unknown>;
    assert.deepEqual(result.config, { key: 'value' });
  });

  test('plain values are left as-is', () => {
    const input = { columns: [{ name: 'x' }], name: 'test' };
    const result = normalizeToolInput(schema, input) as Record<string, unknown>;
    assert.deepEqual(result.columns, [{ name: 'x' }]);
    assert.equal(result.name, 'test');
  });

  test('invalid JSON string is left as-is', () => {
    const input = { columns: '{ bad json' };
    const result = normalizeToolInput(schema, input) as Record<string, unknown>;
    assert.equal(result.columns, '{ bad json');
  });

  test('empty string is not parsed', () => {
    const input = { name: '' };
    const result = normalizeToolInput(schema, input) as Record<string, unknown>;
    assert.equal(result.name, '');
  });
});

// ── validateToolInput ─────────────────────────────────────────────────────

describe('validateToolInput – required fields', () => {
  const schema: JsonSchema = {
    type: 'object',
    properties: {
      action: { type: 'string', enum: ['create', 'delete'] },
      name: { type: 'string' },
    },
    required: ['action', 'name'],
  };

  test('valid input passes', () => {
    assert.equal(validateToolInput(schema, { action: 'create', name: 'x' }), null);
  });

  test('missing required field fails', () => {
    const err = validateToolInput(schema, { action: 'create' });
    assert.ok(err?.includes('"name" is required'));
  });

  test('missing required at root fails', () => {
    const err = validateToolInput(schema, { name: 'x' });
    assert.ok(err?.includes('"action" is required'));
  });
});

describe('validateToolInput – enum', () => {
  const schema: JsonSchema = {
    type: 'object',
    properties: {
      type: { type: 'string', enum: ['TEXT', 'INTEGER', 'REAL'] },
    },
    required: ['type'],
  };

  test('valid enum value passes', () => {
    assert.equal(validateToolInput(schema, { type: 'TEXT' }), null);
  });

  test('invalid enum value fails', () => {
    const err = validateToolInput(schema, { type: 'VARCHAR' });
    assert.ok(err?.includes('"type"'));
    assert.ok(err?.includes('VARCHAR') || err?.includes('one of'));
  });
});

describe('validateToolInput – type checking', () => {
  const schema: JsonSchema = {
    type: 'object',
    properties: {
      entries: { type: 'array' },
      count: { type: 'integer' },
      flag: { type: 'boolean' },
    },
  };

  test('correct types pass', () => {
    assert.equal(validateToolInput(schema, { entries: [], count: 5, flag: true }), null);
  });

  test('wrong type for array fails', () => {
    const err = validateToolInput(schema, { entries: 'not-array' });
    assert.ok(err?.includes('"entries"'));
  });

  test('wrong type for integer fails', () => {
    const err = validateToolInput(schema, { count: 'five' });
    assert.ok(err?.includes('"count"'));
  });

  test('float fails integer check', () => {
    const err = validateToolInput(schema, { count: 1.5 });
    assert.ok(err?.includes('"count"'));
  });
});

describe('validateToolInput – additionalProperties: false', () => {
  const schema: JsonSchema = {
    type: 'object',
    properties: {
      key: { type: 'string' },
    },
    additionalProperties: false,
  };

  test('no extra properties passes', () => {
    assert.equal(validateToolInput(schema, { key: 'value' }), null);
  });

  test('extra property fails', () => {
    const err = validateToolInput(schema, { key: 'value', extra: 'oops' });
    assert.ok(err?.includes('"extra"') || err?.includes('not allowed'));
  });
});

describe('validateToolInput – set_translations entries', () => {
  const schema: JsonSchema = {
    type: 'object',
    properties: {
      entries: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            key: { type: 'string' },
            locale: { type: 'string' },
            content: { type: 'string' },
          },
          required: ['key', 'locale', 'content'],
        },
      },
    },
    required: ['entries'],
  };

  test('valid entries pass', () => {
    const input = { entries: [{ key: '$field.x', locale: 'zh-TW', content: '測試' }] };
    assert.equal(validateToolInput(schema, input), null);
  });

  test('missing required entry field fails', () => {
    const input = { entries: [{ key: '$field.x', locale: 'zh-TW' }] };
    const err = validateToolInput(schema, input);
    assert.ok(err?.includes('content'));
  });

  test('entries not array fails', () => {
    const err = validateToolInput(schema, { entries: 'not-array' });
    assert.ok(err?.includes('"entries"'));
  });
});

describe('validateToolInput – manage_schema columns', () => {
  const schema: JsonSchema = {
    type: 'object',
    properties: {
      action: { type: 'string', enum: ['create_table', 'alter_table', 'describe_tables'] },
      table_name: { type: 'string' },
      columns: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            name: { type: 'string' },
            type: { type: 'string', enum: ['TEXT', 'INTEGER', 'REAL', 'BOOLEAN', 'DATE', 'DATETIME'] },
          },
          required: ['name', 'type'],
        },
      },
    },
    required: ['action', 'table_name', 'columns'],
  };

  test('valid create_table passes', () => {
    const input = {
      action: 'create_table',
      table_name: 'orders',
      columns: [{ name: 'title', type: 'TEXT' }],
    };
    assert.equal(validateToolInput(schema, input), null);
  });

  test('invalid column type fails', () => {
    const input = {
      action: 'create_table',
      table_name: 'orders',
      columns: [{ name: 'title', type: 'VARCHAR' }],
    };
    const err = validateToolInput(schema, input);
    assert.ok(err !== null);
  });

  test('missing table_name fails', () => {
    const input = { action: 'create_table', columns: [] };
    const err = validateToolInput(schema, input);
    assert.ok(err?.includes('table_name'));
  });
});
