/** Test driver: runs the production SQL against Node's built-in SQLite. */
import { DatabaseSync } from "node:sqlite";
import type { SqlDriver, SqlValue } from "@/lib/db/sqlite/driver";

export function nodeSqliteDriver(file = ":memory:"): SqlDriver & { raw: DatabaseSync } {
  const db = new DatabaseSync(file);
  return {
    raw: db,
    async exec(sql) {
      db.exec(sql);
    },
    async run(sql, params: SqlValue[] = []) {
      const r = db.prepare(sql).run(...params);
      return { changes: Number(r.changes) };
    },
    async query<T>(sql: string, params: SqlValue[] = []) {
      return db.prepare(sql).all(...params) as T[];
    },
    async begin() {
      db.exec("BEGIN");
    },
    async commit() {
      db.exec("COMMIT");
    },
    async rollback() {
      if (db.isTransaction) db.exec("ROLLBACK");
    },
    async close() {
      db.close();
    },
  };
}
