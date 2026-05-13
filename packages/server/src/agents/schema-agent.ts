import { createTable, alterTable, describeTables } from '../tools/db-tools';
import type { AgentResult } from '../types';

interface ReferenceDef { table: string; column?: string; }
interface ColumnInput {
  name: string; type: string; required?: boolean;
  default_value?: string; options?: string[]; references?: ReferenceDef;
}
interface CreateTableInput { action: 'create_table'; table_name: string; columns: ColumnInput[]; traits?: string[]; }
interface AlterTableInput { action: 'alter_table'; table_name: string; changes: { operation: 'add_column'; column: ColumnInput }[]; }
interface DescribeInput { action: 'describe_tables'; }

type SchemaInput = CreateTableInput | AlterTableInput | DescribeInput;

export async function runSchemaAgent(input: SchemaInput, userRequest: string): Promise<AgentResult> {
  switch (input.action) {
    case 'create_table': {
      const inp = input as CreateTableInput;
      // Claude sometimes serializes arrays as JSON strings — parse them back
      let columns = inp.columns;
      if (typeof columns === 'string') {
        try { columns = JSON.parse(columns); } catch { columns = []; }
      }
      if (!inp.table_name) {
        return { success: false, message: 'create_table requires table_name parameter' };
      }
      if (!Array.isArray(columns) || columns.length === 0) {
        return { success: false, message: 'create_table requires non-empty columns array' };
      }
      return createTable(inp.table_name, columns, userRequest, inp.traits);
    }
    case 'alter_table': {
      const inp = input as AlterTableInput;
      let changes = inp.changes;
      if (typeof changes === 'string') {
        try { changes = JSON.parse(changes); } catch { changes = []; }
      }
      if (!inp.table_name) {
        return { success: false, message: 'alter_table requires table_name parameter' };
      }
      if (!Array.isArray(changes) || changes.length === 0) {
        return { success: false, message: 'alter_table requires non-empty changes array' };
      }
      return alterTable(inp.table_name, changes, userRequest);
    }
    case 'describe_tables':
      return describeTables();
    default:
      return { success: false, message: 'Unknown schema operation' };
  }
}
