import { ZenkuTool } from '../types';
import { getUserTables, getTableSchema } from '../../db';

export const metaTool: ZenkuTool = {
  definition: {
    name: 'get_table_schema',
    description: `Retrieve database structure information. Use this when you need to know which tables exist or need the detailed column definitions of a specific table before performing queries or modifications.

Actions:
- list_tables: Returns a list of all user-defined table names.
- get_schema: Returns detailed column info (name, type, nullability, etc.) for a specific table.`,
    input_schema: {
      type: 'object' as const,
      properties: {
        action: {
          type: 'string',
          enum: ['list_tables', 'get_schema'],
          description: 'The type of meta-information to retrieve.',
        },
        table_name: {
          type: 'string',
          description: 'Required if action is "get_schema". Case-sensitive table name.',
        },
      },
      required: ['action'],
    },
  },
  execute: async (input: any) => {
    const { action, table_name } = input;

    if (action === 'list_tables') {
      const tables = getUserTables();
      return {
        success: true,
        message: `Found ${tables.length} tables.`,
        data: { tables, count: tables.length },
      };
    }

    if (action === 'get_schema') {
      if (!table_name) {
        return { success: false, message: 'Missing table_name for get_schema action.' };
      }
      const schema = getTableSchema(table_name);
      if (!schema || schema.length === 0) {
        return { success: false, message: `Table "${table_name}" not found or has no columns.` };
      }
      return {
        success: true,
        message: `Retrieved schema for table "${table_name}".`,
        data: { table: table_name, columns: schema },
      };
    }

    return { success: false, message: `Invalid action: ${action}` };
  },
};
