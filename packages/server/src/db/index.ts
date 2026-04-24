import { SqliteAdapter } from './sqlite-adapter';
import { PostgresAdapter } from './postgres-adapter';
import { MssqlAdapter } from './mssql-adapter';
import type { DbAdapter } from './adapter';

export type { DbAdapter, ColumnSpec, ColumnInfo, QueryResult, ExecResult, FieldType } from './adapter';

let _adapter: DbAdapter | null = null;

export function getDb(): DbAdapter {
  if (!_adapter) {
    const type = process.env.DB_TYPE ?? 'sqlite';
    if (type === 'postgres') {
      _adapter = new PostgresAdapter(process.env.DB_URL!);
    } else if (type === 'mssql') {
      _adapter = new MssqlAdapter(process.env.DB_URL!);
    } else {
      _adapter = new SqliteAdapter();
    }
  }
  return _adapter;
}

/** Call once at server startup after getDb() is first invoked. */
export async function initDb(): Promise<void> {
  await getDb().initSystemTables();
}

/** For tests — replace the singleton with a custom adapter instance. */
export function setDb(adapter: DbAdapter): void {
  _adapter = adapter;
}

/** Current timestamp as a DB-storable string: '2024-01-15 10:30:00' */
export function dbNow(): string {
  return new Date().toISOString().replace('T', ' ').slice(0, 19);
}
