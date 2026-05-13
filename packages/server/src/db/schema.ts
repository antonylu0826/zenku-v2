import { getDb } from './index';
import type { ColumnInfo } from './adapter';

export type { ColumnInfo };

export async function getUserTables(): Promise<string[]> {
  return getDb().listTables();
}

export async function getTableSchema(tableName: string): Promise<ColumnInfo[]> {
  return getDb().getColumns(tableName);
}

export async function getAllSchemas(): Promise<Record<string, { columns: ColumnInfo[]; traits?: string[] }>> {
  const tables = await getUserTables();
  const db = getDb();
  const { rows: traitRows } = await db.query<{ table_name: string; trait_name: string }>(
    'SELECT table_name, trait_name FROM _zenku_table_traits'
  );
  const traitMap = new Map<string, string[]>();
  for (const r of traitRows) {
    const list = traitMap.get(r.table_name) ?? [];
    list.push(r.trait_name);
    traitMap.set(r.table_name, list);
  }

  const result: Record<string, { columns: ColumnInfo[]; traits?: string[] }> = {};
  for (const table of tables) {
    result[table] = {
      columns: await getTableSchema(table),
      traits: traitMap.get(table),
    };
  }
  return result;
}
