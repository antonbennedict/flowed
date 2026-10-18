import type { EntityStore, IndexedField, Row, Snapshot, StorageBackend, Stores } from "../backend";
import { DatabaseError, toDatabaseError } from "../errors";
import { PARENT_FIRST_ORDER, TABLES, type TableName } from "../schema";
import { COLUMNS, columnFor, fromRow, toRow, toSqlValue } from "./columns";
import type { SqlDriver, SqlValue } from "./driver";
import { migrations, SQLITE_SCHEMA_VERSION } from "./migrations";

/** Serialises access to the single connection so transactions never interleave. */
class Mutex {
  private tail: Promise<unknown> = Promise.resolve();
  run<R>(fn: () => Promise<R>): Promise<R> {
    const next = this.tail.then(fn, fn);
    this.tail = next.catch(() => undefined);
    return next;
  }
}

const ORDER_BY: { [K in TableName]: string } = {
  subjects: "name COLLATE NOCASE ASC",
  tasks: "completed ASC, due_at IS NULL, due_at ASC, created_at ASC",
  subtasks: "position ASC, created_at ASC",
  class_schedules: "weekday ASC, start_time ASC",
  exams: "exam_at ASC",
  personal_events: "start_at ASC",
  focus_sessions: "started_at DESC",
  user_settings: "id ASC",
  weekly_goals: "week_start DESC, created_at ASC",
};

function createStore<T extends TableName>(table: T, exec: <R>(fn: (d: SqlDriver) => Promise<R>) => Promise<R>): EntityStore<T> {
  const defs = COLUMNS[table];
  const cols = defs.map((d) => d.column);
  const placeholders = cols.map(() => "?").join(", ");
  const insertSql = `INSERT INTO ${table} (${cols.join(", ")}) VALUES (${placeholders})`;
  const updateCols = cols.filter((col) => col !== "id");
  const updateSql = `UPDATE ${table} SET ${updateCols.map((col) => `${col} = ?`).join(", ")} WHERE id = ?`;

  const select = async (where = "", params: SqlValue[] = []) =>
    exec(async (d) => {
      const rows = await d.query(`SELECT * FROM ${table}${where ? ` WHERE ${where}` : ""} ORDER BY ${ORDER_BY[table]}`, params);
      return rows.map((r) => fromRow(table, r));
    });

  const fieldType = (field: string) => defs.find((d) => d.key === field)!.type;

  return {
    list: () => select(),
    async get(id) {
      const rows = await select("id = ?", [id]);
      return rows[0] ?? null;
    },
    findBy(field: IndexedField<T>, value) {
      const col = columnFor(table, field);
      if (value === null) return select(`${col} IS NULL`);
      return select(`${col} = ?`, [toSqlValue(fieldType(field), value)]);
    },
    findRange(field: IndexedField<T>, lower, upper) {
      const col = columnFor(table, field);
      return select(`${col} >= ? AND ${col} <= ?`, [lower, upper]);
    },
    async insert(row) {
      await exec((d) => d.run(insertSql, toRow(table, row)));
    },
    async update(row: Row<T>) {
      const values = toRow(table, row);
      const id = values[0];
      const res = await exec((d) => d.run(updateSql, [...values.slice(1), id]));
      if (res.changes === 0) throw new DatabaseError("NOT_FOUND", "That record no longer exists.");
    },
    async delete(id) {
      // Cascades / SET NULL are enforced by FOREIGN KEY clauses (foreign_keys = ON).
      await exec((d) => d.run(`DELETE FROM ${table} WHERE id = ?`, [id]));
    },
  };
}

function createStores(exec: <R>(fn: (d: SqlDriver) => Promise<R>) => Promise<R>): Stores {
  return Object.fromEntries(TABLES.map((t) => [t, createStore(t, exec)])) as unknown as Stores;
}

function upsertSql(table: TableName) {
  const cols = COLUMNS[table].map((d) => d.column);
  const updates = cols.filter((c) => c !== "id").map((c) => `${c} = excluded.${c}`);
  // ON CONFLICT DO UPDATE (not INSERT OR REPLACE) so existing parents are not
  // deleted-and-reinserted, which would fire ON DELETE CASCADE on children.
  return `INSERT INTO ${table} (${cols.join(", ")}) VALUES (${cols.map(() => "?").join(", ")}) ON CONFLICT(id) DO UPDATE SET ${updates.join(", ")}`;
}

export async function runMigrations(driver: SqlDriver): Promise<number> {
  const [{ user_version: current = 0 } = { user_version: 0 }] = await driver.query<{ user_version: number }>("PRAGMA user_version");
  if (current > SQLITE_SCHEMA_VERSION) {
    throw new DatabaseError(
      "MIGRATION_FAILED",
      `This database was created by a newer version of Flowed (schema v${current}). Please update the app.`,
    );
  }
  for (const m of migrations) {
    if (m.version <= current) continue;
    await driver.begin();
    try {
      for (const sql of m.statements) await driver.exec(sql);
      await driver.exec(`PRAGMA user_version = ${Number(m.version)}`);
      await driver.commit();
    } catch (err) {
      await driver.rollback().catch(() => undefined);
      throw new DatabaseError("MIGRATION_FAILED", `Database upgrade to v${m.version} failed: ${m.description}.`, err);
    }
  }
  return SQLITE_SCHEMA_VERSION;
}

export async function createSqliteBackend(driver: SqlDriver): Promise<StorageBackend> {
  // Must run outside a transaction; enforced per connection.
  await driver.exec("PRAGMA foreign_keys = ON");
  const schemaVersion = await runMigrations(driver);

  const mutex = new Mutex();
  const locked = <R,>(fn: (d: SqlDriver) => Promise<R>) => mutex.run(() => fn(driver));
  const unlocked = <R,>(fn: (d: SqlDriver) => Promise<R>) => fn(driver);
  const stores = createStores(locked);
  const txStores = createStores(unlocked);

  const inTransaction = <R,>(fn: () => Promise<R>) =>
    mutex.run(async () => {
      await driver.begin();
      try {
        const out = await fn();
        await driver.commit();
        return out;
      } catch (err) {
        await driver.rollback().catch(() => undefined);
        throw err;
      }
    });

  return {
    kind: "sqlite",
    schemaVersion,
    stores,
    transaction: (fn) => inTransaction(() => fn(txStores)),
    async snapshot() {
      return inTransaction(async () => {
        const out = {} as Snapshot;
        for (const t of TABLES) (out as Record<string, unknown>)[t] = await txStores[t].list();
        return out;
      });
    },
    async bulkWrite(data, mode) {
      await inTransaction(async () => {
        if (mode === "replace") {
          for (const t of [...PARENT_FIRST_ORDER].reverse()) await driver.run(`DELETE FROM ${t}`);
        }
        for (const t of PARENT_FIRST_ORDER) {
          const sql = upsertSql(t);
          for (const row of data[t] as Row<typeof t>[]) await driver.run(sql, toRow(t, row));
        }
      }).catch((err) => {
        throw toDatabaseError(err, "import the backup");
      });
    },
    async clearAll() {
      await inTransaction(async () => {
        for (const t of [...PARENT_FIRST_ORDER].reverse()) await driver.run(`DELETE FROM ${t}`);
      });
    },
    close: () => mutex.run(() => driver.close()),
  };
}
