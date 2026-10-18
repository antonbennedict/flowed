/**
 * IndexedDB schema migrations — the browser equivalent of
 * `sqlite/migrations.ts`. Each step runs inside the `upgradeneeded`
 * versionchange transaction, which is atomic.
 */
import type { IDBPDatabase, IDBPTransaction } from "idb";

type UpgradeDb = IDBPDatabase<unknown>;
type UpgradeTx = IDBPTransaction<unknown, string[], "versionchange">;

export interface IdbMigration {
  version: number;
  description: string;
  apply(db: UpgradeDb, tx: UpgradeTx): void;
}

export const idbMigrations: IdbMigration[] = [
  {
    version: 1,
    description: "Initial object stores",
    apply(db) {
      const subjects = db.createObjectStore("subjects", { keyPath: "id" });
      subjects.createIndex("name", "name");

      // Booleans and nulls are not valid IndexedDB keys, so `completed` and
      // nullable foreign keys are filtered in code rather than indexed.
      const tasks = db.createObjectStore("tasks", { keyPath: "id" });
      tasks.createIndex("subjectId", "subjectId");
      tasks.createIndex("dueAt", "dueAt");

      const subtasks = db.createObjectStore("subtasks", { keyPath: "id" });
      subtasks.createIndex("taskId", "taskId");

      const schedules = db.createObjectStore("class_schedules", { keyPath: "id" });
      schedules.createIndex("subjectId", "subjectId");
      schedules.createIndex("weekday", "weekday");

      const exams = db.createObjectStore("exams", { keyPath: "id" });
      exams.createIndex("subjectId", "subjectId");
      exams.createIndex("examAt", "examAt");

      const events = db.createObjectStore("personal_events", { keyPath: "id" });
      events.createIndex("startAt", "startAt");

      const focus = db.createObjectStore("focus_sessions", { keyPath: "id" });
      focus.createIndex("subjectId", "subjectId");
      focus.createIndex("startedAt", "startedAt");

      db.createObjectStore("user_settings", { keyPath: "id" });

      const goals = db.createObjectStore("weekly_goals", { keyPath: "id" });
      goals.createIndex("weekStart", "weekStart");
    },
  },
  {
    version: 2,
    description: "Backfill v2 settings fields",
    apply(_db, tx) {
      // Same defaults as SQLite migration v2. Only IDB requests are awaited,
      // so the versionchange transaction stays alive.
      const store = tx.objectStore("user_settings");
      store.openCursor().then(function next(cursor): Promise<void> | void {
        if (!cursor) return;
        cursor.update({ textScale: "md", classReminderMinutes: 15, headsUpEnabled: true, ...(cursor.value as object) });
        return cursor.continue().then(next);
      });
    },
  },
];

export const IDB_SCHEMA_VERSION = idbMigrations[idbMigrations.length - 1].version;
