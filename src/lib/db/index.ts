/**
 * Database entry point.
 *
 *   const db = await getDatabase();
 *   await db.tasks.create({ title: "Essay draft" });
 *
 * Platform selection happens once at runtime:
 *   - Native Android/iOS (Capacitor) -> SQLite (@capacitor-community/sqlite)
 *   - Browser                          -> IndexedDB (idb)
 * Native-only modules are loaded with dynamic import() inside the native
 * branch, so they are never evaluated in a regular browser.
 */
import type { Snapshot, StorageBackend } from "./backend";
import { createRepositories, type ChangeListener, type Repositories } from "./repositories";
import type { TableName } from "./schema";

export interface Database extends Repositories {
  readonly kind: StorageBackend["kind"];
  readonly schemaVersion: number;
  /** Subscribe to writes; returns an unsubscribe function. */
  onChange(listener: ChangeListener): () => void;
  exportSnapshot(): Promise<Snapshot>;
  importSnapshot(rows: Snapshot, mode: "merge" | "replace"): Promise<void>;
  clearAll(): Promise<void>;
}

const ALL: TableName[] = [
  "subjects", "tasks", "subtasks", "class_schedules", "exams", "personal_events", "focus_sessions", "user_settings", "weekly_goals",
];

export function createDatabase(backend: StorageBackend): Database {
  const listeners = new Set<ChangeListener>();
  const emit = (tables: TableName[]) => listeners.forEach((l) => l(tables));
  const repos = createRepositories(backend, emit);
  return {
    ...repos,
    kind: backend.kind,
    schemaVersion: backend.schemaVersion,
    onChange(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    exportSnapshot: () => backend.snapshot(),
    async importSnapshot(rows, mode) {
      await backend.bulkWrite(rows, mode);
      emit(ALL);
    },
    async clearAll() {
      await backend.clearAll();
      emit(ALL);
    },
  };
}

let instance: Promise<Database> | null = null;

async function openBackend(): Promise<StorageBackend> {
  const { Capacitor } = await import("@capacitor/core");
  if (Capacitor.isNativePlatform() && Capacitor.isPluginAvailable("CapacitorSQLite")) {
    const [{ openCapacitorDriver }, { createSqliteBackend }] = await Promise.all([
      import("./sqlite/capacitor-driver"),
      import("./sqlite/backend"),
    ]);
    return createSqliteBackend(await openCapacitorDriver());
  }
  const { createIndexedDbBackend } = await import("./indexeddb/backend");
  // Ask the browser not to evict our data under storage pressure.
  navigator.storage?.persist?.().catch(() => undefined);
  return createIndexedDbBackend();
}

/** Lazily opens (and on first launch creates + migrates) the local database. */
export function getDatabase(): Promise<Database> {
  if (typeof window === "undefined") throw new Error("getDatabase() is client-only");
  if (!instance) {
    instance = openBackend()
      .then(createDatabase)
      .catch((err) => {
        instance = null; // allow retry
        throw err;
      });
  }
  return instance;
}

export { DatabaseError } from "./errors";
export type * from "./schema";
