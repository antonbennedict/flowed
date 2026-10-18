/**
 * Native-only module. Imported dynamically from `lib/db/index.ts` *after*
 * `Capacitor.isNativePlatform()` returns true, so browsers never load it.
 */
import { CapacitorSQLite, SQLiteConnection, type SQLiteDBConnection } from "@capacitor-community/sqlite";
import type { SqlDriver, SqlValue } from "./driver";

export const DB_NAME = "uniflow";

export async function openCapacitorDriver(): Promise<SqlDriver> {
  const sqlite = new SQLiteConnection(CapacitorSQLite);
  // Re-sync JS and native connection registries (e.g. after a WebView reload).
  await sqlite.checkConnectionsConsistency().catch(() => undefined);
  const existing = (await sqlite.isConnection(DB_NAME, false)).result;
  // `version` is the plugin's own upgrade counter; we run our own migrations
  // (PRAGMA user_version) and never register plugin upgrade statements.
  const db: SQLiteDBConnection = existing
    ? await sqlite.retrieveConnection(DB_NAME, false)
    : await sqlite.createConnection(DB_NAME, false, "no-encryption", 1, false);
  await db.open();

  // We control transactions explicitly, so tell the plugin not to wrap
  // individual statements (transaction = false).
  return {
    async exec(sql) {
      await db.execute(sql, false);
    },
    async run(sql, params: SqlValue[] = []) {
      const res = await db.run(sql, params, false);
      return { changes: res.changes?.changes ?? 0 };
    },
    async query<T>(sql: string, params: SqlValue[] = []) {
      const res = await db.query(sql, params);
      // iOS prepends a `{ ios_columns: [...] }` metadata row; drop it so both
      // platforms return the same shape.
      return (res.values ?? []).filter((r) => !(r && typeof r === "object" && "ios_columns" in r)) as T[];
    },
    async begin() {
      await db.beginTransaction();
    },
    async commit() {
      await db.commitTransaction();
    },
    async rollback() {
      if ((await db.isTransactionActive()).result) await db.rollbackTransaction();
    },
    async close() {
      await sqlite.closeConnection(DB_NAME, false);
    },
  };
}
