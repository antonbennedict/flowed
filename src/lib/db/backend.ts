/**
 * Low-level storage contract implemented by both backends:
 *   - SqliteBackend    (Android / iOS via @capacitor-community/sqlite)
 *   - IndexedDbBackend (browsers via `idb`)
 *
 * Backends store already-validated entities. Validation, id generation and
 * timestamps live one level up in the repositories (`repositories.ts`), so
 * both platforms behave identically.
 */
import type { EntityMap, TableName } from "./schema";

export type Row<T extends TableName> = EntityMap[T];

/** Fields that can be used for indexed lookups / range scans, per table. */
export const INDEXED_FIELDS = {
  subjects: ["name"],
  tasks: ["subjectId", "dueAt", "completed"],
  subtasks: ["taskId"],
  class_schedules: ["subjectId", "weekday"],
  exams: ["subjectId", "examAt"],
  personal_events: ["startAt"],
  focus_sessions: ["subjectId", "startedAt"],
  user_settings: [],
  weekly_goals: ["weekStart"],
} as const satisfies { [K in TableName]: readonly (keyof EntityMap[K] & string)[] };

export type IndexedField<T extends TableName> = (typeof INDEXED_FIELDS)[T][number];

export interface EntityStore<T extends TableName> {
  list(): Promise<Row<T>[]>;
  get(id: string): Promise<Row<T> | null>;
  /** Exact-match lookup on an indexed field. */
  findBy(field: IndexedField<T>, value: string | number | boolean | null): Promise<Row<T>[]>;
  /** Inclusive range scan on an indexed (string) field, e.g. ISO dates. */
  findRange(field: IndexedField<T>, lower: string, upper: string): Promise<Row<T>[]>;
  insert(row: Row<T>): Promise<void>;
  update(row: Row<T>): Promise<void>;
  /**
   * Deletes a row and applies the relational rules from `RELATIONS`
   * (cascade / set-null) atomically.
   */
  delete(id: string): Promise<void>;
}

export type Stores = { [K in TableName]: EntityStore<K> };

/** Unit of work handed to `transaction()`; all writes commit or roll back together. */
export type TxStores = Stores;

export type Snapshot = { [K in TableName]: Row<K>[] };

export interface StorageBackend {
  readonly kind: "sqlite" | "indexeddb";
  readonly schemaVersion: number;
  readonly stores: Stores;
  /** Runs `fn` atomically. Nested calls are not supported. */
  transaction<R>(fn: (tx: TxStores) => Promise<R>): Promise<R>;
  /** Reads every table in a single consistent pass. */
  snapshot(): Promise<Snapshot>;
  /**
   * Writes a full data set atomically.
   *  - mode "replace": wipes all tables first.
   *  - mode "merge":   upserts by id, leaving other rows untouched.
   */
  bulkWrite(data: Snapshot, mode: "replace" | "merge"): Promise<void>;
  /** Deletes every record in every table. */
  clearAll(): Promise<void>;
  close(): Promise<void>;
}

/**
 * Relational rules mirrored by both backends. SQLite enforces these with
 * FOREIGN KEY ... ON DELETE clauses; IndexedDB applies them in code inside a
 * single readwrite transaction.
 */
export const FOREIGN_KEYS: {
  [K in TableName]?: { field: keyof EntityMap[K] & string; references: TableName; onDelete: "cascade" | "set-null" }[];
} = {
  tasks: [{ field: "subjectId", references: "subjects", onDelete: "set-null" }],
  subtasks: [{ field: "taskId", references: "tasks", onDelete: "cascade" }],
  class_schedules: [{ field: "subjectId", references: "subjects", onDelete: "cascade" }],
  exams: [{ field: "subjectId", references: "subjects", onDelete: "set-null" }],
  focus_sessions: [{ field: "subjectId", references: "subjects", onDelete: "set-null" }],
};

/** Reverse view of FOREIGN_KEYS: for a parent table, which children point at it. */
export function childRelations(parent: TableName) {
  const out: { table: TableName; field: string; onDelete: "cascade" | "set-null" }[] = [];
  for (const [table, fks] of Object.entries(FOREIGN_KEYS) as [TableName, { field: string; references: TableName; onDelete: "cascade" | "set-null" }[]][]) {
    for (const fk of fks) if (fk.references === parent) out.push({ table, field: fk.field, onDelete: fk.onDelete });
  }
  return out;
}
