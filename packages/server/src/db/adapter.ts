export type FieldType = 'TEXT' | 'INTEGER' | 'REAL' | 'BLOB' | 'BOOLEAN' | 'DATE' | 'DATETIME';

export interface ColumnSpec {
  name: string;
  type: FieldType;
  required?: boolean;
  /** Abstract default: 'now' | 'true' | 'false' | literal string value */
  default?: string;
  references?: {
    table: string;
    column?: string; // default: 'id'
  };
}

export interface ColumnInfo {
  name: string;
  type: string;         // DB-native type string (e.g. TEXT, INTEGER, NVARCHAR(MAX))
  notNull: boolean;
  defaultValue: string | null;
  isPrimaryKey: boolean;
}

export interface QueryResult<T = Record<string, unknown>> {
  rows: T[];
}

export interface ExecResult {
  rowsAffected: number;
  lastInsertId?: number;
}

export interface ForeignKeyInfo {
  table: string;     // source table (the one queried)
  from: string;      // FK column in source table
  toTable: string;   // referenced table
  toColumn: string;  // referenced column (usually 'id')
}

export interface DbAdapter {
  readonly type: 'sqlite' | 'postgres' | 'mssql';
  // DML
  query<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<QueryResult<T>>;
  execute(sql: string, params?: unknown[]): Promise<ExecResult>;

  // DDL - user tables
  createTable(tableName: string, columns: ColumnSpec[], userRequest?: string): Promise<void>;
  addColumn(tableName: string, column: ColumnSpec): Promise<void>;
  dropColumn(tableName: string, columnName: string): Promise<void>;
  dropTable(tableName: string): Promise<void>;
  tableExists(tableName: string): Promise<boolean>;

  // Schema introspection
  listTables(): Promise<string[]>;
  getColumns(tableName: string): Promise<ColumnInfo[]>;
  getForeignKeys(tableName: string): Promise<ForeignKeyInfo[]>;

  /**
   * Atomic upsert-and-increment for auto-number counters.
   * Inserts row with current_value=1 on first call; increments by 1 on subsequent calls.
   * Returns the new current_value.
   */
  upsertCounter(tableName: string, fieldName: string, period: string): Promise<number>;

  // DDL - system tables
  initSystemTables(): Promise<void>;

  // Lifecycle
  close(): Promise<void>;
}
