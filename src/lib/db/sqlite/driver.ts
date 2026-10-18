/**
 * Minimal SQL driver contract. The production implementation wraps
 * @capacitor-community/sqlite; tests use Node's built-in `node:sqlite`.
 * Every statement with user data goes through `run`/`query` with bound
 * parameters — values are never interpolated into SQL strings.
 */
export type SqlValue = string | number | null;

export interface SqlDriver {
  /** Executes one or more raw statements (schema / pragmas). No parameters. */
  exec(sql: string): Promise<void>;
  run(sql: string, params?: SqlValue[]): Promise<{ changes: number }>;
  query<T = Record<string, unknown>>(sql: string, params?: SqlValue[]): Promise<T[]>;
  begin(): Promise<void>;
  commit(): Promise<void>;
  rollback(): Promise<void>;
  close(): Promise<void>;
}
