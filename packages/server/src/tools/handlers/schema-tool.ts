import { ZenkuTool } from '../types';
import { runSchemaAgent } from '../../agents/schema-agent';

export const COLUMN_DEF_SCHEMA = {
  type: 'object' as const,
  properties: {
    name: { type: 'string', description: 'Field name (lowercase with underscores)' },
    type: {
      type: 'string',
      enum: ['TEXT', 'INTEGER', 'REAL', 'BOOLEAN', 'DATE', 'DATETIME'],
    },
    required: { type: 'boolean' },
    options: {
      type: 'array',
      items: { type: 'string' },
      description: 'List of allowed values for enum-type fields',
    },
    references: {
      type: 'object',
      description: 'Foreign key reference. This field references a column in the target table (default: id)',
      properties: {
        table: { type: 'string', description: 'Target table name' },
        column: { type: 'string', description: 'Target field, default id' },
      },
      required: ['table'],
    },
  },
  required: ['name', 'type'],
};

export const manageSchemaTool: ZenkuTool = {
  definition: {
    name: 'manage_schema',
    description: `Create or modify database table schema.

After creating a new table, you must call manage_ui to create the corresponding interface.

Field type mapping:
- Plain text → TEXT
- Number (integer) → INTEGER
- Number (decimal/currency) → REAL
- Yes/No → BOOLEAN
- Date → DATE
- DateTime → DATETIME
- Reference to another table → INTEGER + references: { table: 'target_table' }

Table Traits (advanced features):
- When creating a table, you can pass traits: ["state_machine"] to automatically inject status management fields (status, created_by) and enable lifecycle protection (state transitions, edit locking, delete control).
- Do NOT manually create status or created_by fields when using state_machine trait — they are auto-injected.
- After creating a state_machine table, use manage_ui to create the view, then configure the states and transitions via the trait config.`,
    input_schema: {
      type: 'object' as const,
      properties: {
        action: {
          type: 'string',
          enum: ['create_table', 'alter_table', 'describe_tables'],
          description: 'Action to perform.',
        },
        table_name: {
          type: 'string',
          description: 'Table name (lowercase_underscores). Required for create_table and alter_table.',
        },
        columns: {
          type: 'array',
          description: 'For create_table: ALL field definitions in one call. For alter_table/describe_tables: pass [].',
          items: COLUMN_DEF_SCHEMA,
        },
        changes: {
          type: 'array',
          description: 'For alter_table: list of add_column operations.',
          items: {
            type: 'object',
            properties: {
              operation: { type: 'string', enum: ['add_column'] },
              column: COLUMN_DEF_SCHEMA,
            },
            required: ['operation', 'column'],
          },
        },
        traits: {
          type: 'array',
          items: { type: 'string', enum: ['state_machine'] },
          description: 'Optional list of table traits. "state_machine" auto-injects status/created_by fields and enables state transition protection.',
        },
      },
      required: ['action', 'table_name', 'columns'],
    },
  },
  execute: async (input: any, userMessage?: string) => {
    return runSchemaAgent(input, userMessage!);
  },
};
