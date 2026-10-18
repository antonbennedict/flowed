import { openDB, type IDBPDatabase, type IDBPTransaction } from "idb";
import { childRelations, FOREIGN_KEYS, type EntityStore, type IndexedField, type Row, type Snapshot, type StorageBackend, type Stores } from "../backend";
import { DatabaseError, toDatabaseError } from "../errors";
import { COMPARATORS } from "../ordering";
import { PARENT_FIRST_ORDER, TABLES, type TableName } from "../schema";
import { IDB_SCHEMA_VERSION, idbMigrations } from "./migrations";

export const IDB_NAME = "uniflow";

// Typed as readwrite for method access; readonly transactions only call read methods.
type Tx = IDBPTransaction<unknown, TableName[], "readwrite">;
type TxProvider = <R>(mode: "readonly" | "readwrite", fn: (tx: Tx) => Promise<R>) => Promise<R>;

const sortRows = <T extends TableName>(table: T, rows: Row<T>[]) =>
  rows.sort(COMPARATORS[table] as (a: Row<T>, b: Row<T>) => number);

async function assertForeignKeys(tx: Tx, table: TableName, row: Record<string, unknown>) {
  for (const fk of FOREIGN_KEYS[table] ?? []) {
    const ref = row[fk.field];
    if (ref === null || ref === undefined) continue;
    const parent = await tx.objectStore(fk.references).get(ref as string);
    if (!parent) throw new DatabaseError("CONSTRAINT", "FOREIGN KEY constraint failed", { table, field: fk.field });
  }
}

/** Mirrors SQLite ON DELETE CASCADE / SET NULL inside the same transaction. */
async function deleteWithRelations(tx: Tx, table: TableName, id: string): Promise<void> {
  for (const rel of childRelations(table)) {
    const store = tx.objectStore(rel.table);
    const children = (await store.index(rel.field).getAll(id)) as Record<string, unknown>[];
    for (const child of children) {
      if (rel.onDelete === "cascade") await deleteWithRelations(tx, rel.table, child.id as string);
      else await store.put({ ...child, [rel.field]: null });
    }
  }
  await tx.objectStore(table).delete(id);
}

function createStore<T extends TableName>(table: T, withTx: TxProvider): EntityStore<T> {
  const indexNames = (tx: Tx) => Array.from(tx.objectStore(table).indexNames) as string[];
  const all = (tx: Tx) => tx.objectStore(table).getAll() as Promise<Row<T>[]>;

  return {
    list: () => withTx("readonly", async (tx) => sortRows(table, await all(tx))),
    get: (id) => withTx("readonly", async (tx) => ((await tx.objectStore(table).get(id)) as Row<T>) ?? null),
    findBy: (field: IndexedField<T>, value) =>
      withTx("readonly", async (tx) => {
        // Booleans and nulls cannot be index keys: fall back to a filtered scan.
        if (typeof value === "boolean" || value === null || !indexNames(tx).includes(field)) {
          const rows = await all(tx);
          return sortRows(table, rows.filter((r) => (r as Record<string, unknown>)[field] === value));
        }
        const rows = (await tx.objectStore(table).index(field).getAll(value)) as Row<T>[];
        return sortRows(table, rows);
      }),
    findRange: (field: IndexedField<T>, lower, upper) =>
      withTx("readonly", async (tx) => {
        const range = IDBKeyRange.bound(lower, upper);
        const rows = indexNames(tx).includes(field)
          ? ((await tx.objectStore(table).index(field).getAll(range)) as Row<T>[])
          : (await all(tx)).filter((r) => range.includes((r as Record<string, unknown>)[field]));
        return sortRows(table, rows);
      }),
    insert: (row) =>
      withTx("readwrite", async (tx) => {
        await assertForeignKeys(tx, table, row as Record<string, unknown>);
        await tx.objectStore(table).add(row);
      }),
    update: (row) =>
      withTx("readwrite", async (tx) => {
        const existing = await tx.objectStore(table).get((row as { id: string }).id);
        if (!existing) throw new DatabaseError("NOT_FOUND", "That record no longer exists.");
        await assertForeignKeys(tx, table, row as Record<string, unknown>);
        await tx.objectStore(table).put(row);
      }),
    delete: (id) => withTx("readwrite", (tx) => deleteWithRelations(tx, table, id)),
  };
}

function createStores(withTx: TxProvider): Stores {
  return Object.fromEntries(TABLES.map((t) => [t, createStore(t, withTx)])) as unknown as Stores;
}

/** Runs `fn` in its own transaction and waits for it to commit. */
async function runTx<R>(db: IDBPDatabase<unknown>, mode: "readonly" | "readwrite", fn: (tx: Tx) => Promise<R>): Promise<R> {
  const tx = db.transaction([...TABLES], mode) as unknown as Tx;
  try {
    const out = await fn(tx);
    await tx.done;
    return out;
  } catch (err) {
    try {
      tx.abort();
    } catch {
      /* already finished */
    }
    await tx.done.catch(() => undefined);
    throw err;
  }
}

export async function createIndexedDbBackend(name = IDB_NAME): Promise<StorageBackend> {
  if (typeof indexedDB === "undefined") {
    throw new DatabaseError("STORAGE_UNAVAILABLE", "This browser does not support IndexedDB, so Flowed cannot store data.");
  }

  let db: IDBPDatabase<unknown>;
  try {
    db = await openDB(name, IDB_SCHEMA_VERSION, {
      upgrade(database, oldVersion, _newVersion, tx) {
        for (const m of idbMigrations) {
          if (m.version > oldVersion) m.apply(database, tx as never);
        }
      },
      blocked() {
        console.warn("Flowed: database upgrade blocked by another open tab.");
      },
    });
  } catch (err) {
    const name = err instanceof Error ? err.name : "";
    if (name === "VersionError")
      throw new DatabaseError("MIGRATION_FAILED", "This data was created by a newer version of Flowed. Please reload or update the app.", err);
    throw new DatabaseError("INIT_FAILED", "Could not open local storage. Private browsing mode can block IndexedDB.", err);
  }
  // Another tab upgraded the schema: close so it can proceed.
  db.addEventListener("versionchange", () => db.close());

  const withTx: TxProvider = (mode, fn) => runTx(db, mode, fn);

  return {
    kind: "indexeddb",
    schemaVersion: db.version,
    stores: createStores(withTx),
    transaction: (fn) =>
      runTx(db, "readwrite", (tx) => {
        // Every store call inside `fn` joins this single transaction.
        const shared: TxProvider = (_mode, inner) => inner(tx);
        return fn(createStores(shared));
      }),
    snapshot: () =>
      runTx(db, "readonly", async (tx) => {
        const out = {} as Snapshot;
        for (const t of TABLES) (out as Record<string, unknown>)[t] = sortRows(t, (await tx.objectStore(t).getAll()) as Row<typeof t>[]);
        return out;
      }),
    bulkWrite: (data, mode) =>
      runTx(db, "readwrite", async (tx) => {
        if (mode === "replace") for (const t of TABLES) await tx.objectStore(t).clear();
        for (const t of PARENT_FIRST_ORDER) {
          for (const row of data[t]) {
            await assertForeignKeys(tx, t, row as Record<string, unknown>);
            await tx.objectStore(t).put(row);
          }
        }
      }).catch((err) => {
        throw toDatabaseError(err, "import the backup");
      }),
    clearAll: () =>
      runTx(db, "readwrite", async (tx) => {
        for (const t of TABLES) await tx.objectStore(t).clear();
      }),
    close: async () => db.close(),
  };
}
