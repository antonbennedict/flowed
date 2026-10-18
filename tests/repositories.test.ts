/**
 * Contract tests: the same suite runs against the SQLite backend (production
 * SQL + migrations executed by Node's built-in SQLite) and the IndexedDB
 * backend (fake-indexeddb), proving both behave identically.
 */
import "fake-indexeddb/auto";
import { describe, expect, it, beforeEach } from "vitest";
import os from "node:os";
import path from "node:path";
import { createDatabase, type Database } from "@/lib/db";
import { createSqliteBackend } from "@/lib/db/sqlite/backend";
import { migrations } from "@/lib/db/sqlite/migrations";
import { createIndexedDbBackend } from "@/lib/db/indexeddb/backend";
import { DatabaseError } from "@/lib/db/errors";
import { createBackup, parseBackup, planImport, applyImport, BackupValidationError, tasksCsv } from "@/lib/backup";
import { nodeSqliteDriver } from "./node-sqlite-driver";

let n = 0;
const backends: Record<string, () => Promise<Database>> = {
  sqlite: async () => createDatabase(await createSqliteBackend(nodeSqliteDriver())),
  indexeddb: async () => createDatabase(await createIndexedDbBackend(`test-${n++}`)),
};

for (const [name, open] of Object.entries(backends)) {
  describe(`repositories on ${name}`, () => {
    let db: Database;
    beforeEach(async () => {
      db = await open();
    });

    it("creates default settings on first access and updates them", async () => {
      const s = await db.settings.get();
      expect(s.focusMinutes).toBe(25);
      const u = await db.settings.update({ displayName: "Ana", weekStartsOn: 0 });
      expect(u.displayName).toBe("Ana");
      expect((await db.settings.get()).weekStartsOn).toBe(0);
    });

    it("validates input with useful messages", async () => {
      await expect(db.subjects.create({ name: "" })).rejects.toMatchObject({ code: "VALIDATION" });
      await expect(db.subjects.create({ name: "Bio", color: "red" })).rejects.toThrow(/colour/);
    });

    it("enforces foreign keys", async () => {
      await expect(
        db.tasks.create({ title: "x", subjectId: "11111111-1111-4111-8111-111111111111" }),
      ).rejects.toMatchObject({ code: "CONSTRAINT" });
    });

    it("saves a task with its checklist atomically and replaces items on edit", async () => {
      const subj = await db.subjects.create({ name: "Physics", code: "PHY101" });
      const task = await db.tasks.saveWithSubtasks(null, { title: "Lab report", subjectId: subj.id, priority: "high" }, [
        { title: "Collect data", completed: true },
        { title: "Write up", completed: false },
        { title: "   ", completed: false },
      ]);
      let items = await db.subtasks.listByTask(task.id);
      expect(items.map((i) => i.title)).toEqual(["Collect data", "Write up"]);

      await db.tasks.saveWithSubtasks(task.id, { title: "Lab report v2", subjectId: subj.id }, [
        { id: items[1].id, title: "Write up", completed: true },
        { title: "Submit", completed: false },
      ]);
      items = await db.subtasks.listByTask(task.id);
      expect(items.map((i) => [i.title, i.completed])).toEqual([
        ["Write up", true],
        ["Submit", false],
      ]);
      expect((await db.tasks.get(task.id))?.title).toBe("Lab report v2");
    });

    it("rolls back the whole transaction on failure", async () => {
      const task = await db.tasks.create({ title: "Keep me" });
      await expect(
        db.tasks.saveWithSubtasks(task.id, { title: "Changed" }, [{ title: "x".repeat(500), completed: false }]),
      ).rejects.toBeInstanceOf(DatabaseError);
      expect((await db.tasks.get(task.id))?.title).toBe("Keep me");
    });

    it("cascades and sets null on delete like SQLite FKs", async () => {
      const subj = await db.subjects.create({ name: "Chem" });
      const task = await db.tasks.saveWithSubtasks(null, { title: "T", subjectId: subj.id }, [{ title: "a", completed: false }]);
      const exam = await db.exams.create({ title: "Midterm", subjectId: subj.id, examAt: new Date().toISOString() });
      await db.schedules.create({ subjectId: subj.id, weekday: 1, startTime: "09:00", endTime: "10:30" });

      await db.subjects.delete(subj.id);
      expect((await db.tasks.get(task.id))?.subjectId).toBeNull();
      expect((await db.exams.get(exam.id))?.subjectId).toBeNull();
      expect(await db.schedules.list()).toHaveLength(0);

      await db.tasks.delete(task.id);
      expect(await db.subtasks.list()).toHaveLength(0);
    });

    it("tracks completion timestamps and orders open tasks by due date", async () => {
      await db.tasks.create({ title: "later", dueAt: "2030-01-02T00:00:00.000Z" });
      const sooner = await db.tasks.create({ title: "sooner", dueAt: "2030-01-01T00:00:00.000Z" });
      await db.tasks.create({ title: "no date" });
      expect((await db.tasks.list()).map((t) => t.title)).toEqual(["sooner", "later", "no date"]);
      const done = await db.tasks.setCompleted(sooner.id, true);
      expect(done.completedAt).not.toBeNull();
      expect((await db.tasks.list()).map((t) => t.title)).toEqual(["later", "no date", "sooner"]);
      expect((await db.tasks.setCompleted(sooner.id, false)).completedAt).toBeNull();
    });

    it("rejects invalid class times and queries by weekday and range", async () => {
      const subj = await db.subjects.create({ name: "Math" });
      await expect(
        db.schedules.create({ subjectId: subj.id, weekday: 2, startTime: "10:00", endTime: "09:00" }),
      ).rejects.toThrow(/after start/);
      await db.schedules.create({ subjectId: subj.id, weekday: 2, startTime: "13:00", endTime: "14:00" });
      await db.schedules.create({ subjectId: subj.id, weekday: 2, startTime: "08:00", endTime: "09:00" });
      expect((await db.schedules.listByWeekday(2)).map((s) => s.startTime)).toEqual(["08:00", "13:00"]);

      await db.focusSessions.create({ startedAt: "2026-10-01T10:00:00.000Z", endedAt: "2026-10-01T10:25:00.000Z", durationMinutes: 25 });
      await db.focusSessions.create({ startedAt: "2026-10-05T10:00:00.000Z", endedAt: "2026-10-05T10:25:00.000Z", durationMinutes: 25 });
      expect(await db.focusSessions.listBetween("2026-10-04T00:00:00.000Z", "2026-10-06T00:00:00.000Z")).toHaveLength(1);
    });

    it("emits change events after writes", async () => {
      const seen: string[][] = [];
      db.onChange((t) => seen.push(t));
      await db.subjects.create({ name: "Art" });
      expect(seen[0]).toContain("subjects");
    });

    it("exports, validates and merges a backup without duplicates", async () => {
      const subj = await db.subjects.create({ name: "History" });
      await db.tasks.saveWithSubtasks(null, { title: "Essay", subjectId: subj.id }, [{ title: "Outline", completed: false }]);
      await db.settings.update({ displayName: "Ana" });
      const text = JSON.stringify(await createBackup(db));

      // Importing the same file again is a no-op.
      const parsed = parseBackup(text);
      const plan = await planImport(db, parsed, "merge");
      expect(plan.summary.every((s) => s.added === 0 && s.updated === 0)).toBe(true);

      // Replace into an empty database restores everything.
      const fresh = await open();
      await fresh.subjects.create({ name: "Will be replaced" });
      const plan2 = await planImport(fresh, parsed, "replace");
      expect(plan2.willDelete).toBe(1);
      await applyImport(fresh, plan2);
      expect((await fresh.subjects.list()).map((s) => s.name)).toEqual(["History"]);
      expect((await fresh.tasks.list())[0].title).toBe("Essay");
      expect(await fresh.subtasks.list()).toHaveLength(1);
      expect((await fresh.settings.get()).displayName).toBe("Ana");
      expect(tasksCsv(await fresh.exportSnapshot())).toContain("History");
    });

    it("rejects malformed backups", async () => {
      expect(() => parseBackup("nope")).toThrow(BackupValidationError);
      expect(() => parseBackup(JSON.stringify({ app: "other" }))).toThrow(/not a Flowed/);
      // Backups made before the rename (app: "uniflow") still import.
      expect(parseBackup(JSON.stringify({ app: "uniflow", formatVersion: 1, schemaVersion: 1, exportedAt: "", data: {} })).formatVersion).toBe(1);
      expect(() =>
        parseBackup(JSON.stringify({ app: "uniflow", formatVersion: 99, schemaVersion: 1, exportedAt: "", data: {} })),
      ).toThrow(/newer version/);
      const bad = { app: "uniflow", formatVersion: 1, schemaVersion: 1, exportedAt: "", data: { tasks: [{ id: "x" }] } };
      expect(() => parseBackup(JSON.stringify(bad))).toThrow(/invalid record/);
    });

    it("imports a parsed timetable atomically, reusing subjects and skipping duplicates", async () => {
      await db.subjects.create({ name: "Data Structures", code: "CS 201" });
      const rows = [
        { subject: { name: "Data Structures", code: "CS201", instructor: "" }, weekday: 2, startTime: "13:00", endTime: "14:30", room: "Lab 3" },
        { subject: { name: "Data Structures", code: "CS201", instructor: "" }, weekday: 4, startTime: "13:00", endTime: "14:30", room: "Lab 3" },
        { subject: { name: "Intro to Computing", code: "IT 101", instructor: "Prof. Cruz" }, weekday: 1, startTime: "08:00", endTime: "09:00", room: "" },
      ];
      expect(await db.schedules.importMany(rows)).toEqual({ subjectsCreated: 1, classesCreated: 3, skipped: 0 });
      expect(await db.schedules.importMany(rows)).toEqual({ subjectsCreated: 0, classesCreated: 0, skipped: 3 });
      expect((await db.subjects.list()).map((s) => s.name)).toEqual(["Data Structures", "Intro to Computing"]);
      await expect(db.schedules.importMany([{ ...rows[0], endTime: "12:00" }])).rejects.toThrow(/End time/);
      expect(await db.schedules.list()).toHaveLength(3);
    });

    it("clears all data", async () => {
      await db.subjects.create({ name: "Gone" });
      await db.clearAll();
      expect(await db.subjects.list()).toHaveLength(0);
    });
  });
}

describe("sqlite persistence & migrations", () => {
  it("persists across reconnects and does not re-run migrations", async () => {
    const file = path.join(os.tmpdir(), `uniflow-test-${Date.now()}.db`);
    const d1 = nodeSqliteDriver(file);
    const db1 = createDatabase(await createSqliteBackend(d1));
    await db1.subjects.create({ name: "Persisted" });
    await d1.close();

    const d2 = nodeSqliteDriver(file);
    const db2 = createDatabase(await createSqliteBackend(d2));
    expect((await db2.subjects.list())[0].name).toBe("Persisted");
    const [{ user_version }] = await d2.query<{ user_version: number }>("PRAGMA user_version");
    expect(user_version).toBe(2);
    const [{ foreign_keys }] = await d2.query<{ foreign_keys: number }>("PRAGMA foreign_keys");
    expect(foreign_keys).toBe(1);
    await d2.close();
  });
});

describe("sqlite upgrade v1 → v2", () => {
  it("adds the new settings columns with defaults and keeps existing data", async () => {
    const d = nodeSqliteDriver();
    // Build a genuine v1 database by hand.
    for (const sql of migrations[0].statements) await d.exec(sql);
    await d.exec("PRAGMA user_version = 1");
    const ts = new Date().toISOString();
    await d.run("INSERT INTO user_settings (id, display_name, created_at, updated_at) VALUES ('default', 'Old user', ?, ?)", [ts, ts]);

    const db = createDatabase(await createSqliteBackend(d));
    const s = await db.settings.get();
    expect(s.displayName).toBe("Old user");
    expect(s.textScale).toBe("md");
    expect(s.classReminderMinutes).toBe(15);
    expect(s.headsUpEnabled).toBe(true);
    expect((await db.settings.update({ textScale: "xl" })).textScale).toBe("xl");
    const [{ user_version }] = await d.query<{ user_version: number }>("PRAGMA user_version");
    expect(user_version).toBe(2);
  });
});

describe("indexeddb upgrade v1 → v2", () => {
  it("backfills new settings fields on existing rows", async () => {
    const { openDB } = await import("idb");
    const { idbMigrations } = await import("@/lib/db/indexeddb/migrations");
    const name = "upgrade-test";
    const v1 = await openDB(name, 1, { upgrade: (db, _o, _n, tx) => idbMigrations[0].apply(db, tx as never) });
    const ts = new Date().toISOString();
    await v1.put("user_settings", { id: "default", displayName: "Old", theme: "dark", createdAt: ts, updatedAt: ts });
    v1.close();

    const db = createDatabase(await createIndexedDbBackend(name));
    expect(db.schemaVersion).toBe(2);
    const raw = (await db.exportSnapshot()).user_settings[0];
    expect(raw).toMatchObject({ displayName: "Old", theme: "dark", textScale: "md", classReminderMinutes: 15, headsUpEnabled: true });
  });
});
