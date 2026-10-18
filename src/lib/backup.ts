/**
 * Backup & restore.
 *
 * File format (JSON):
 * {
 *   "app": "flowed",            // "uniflow" (the app's old name) is also accepted
 *   "formatVersion": 1,          // version of this envelope
 *   "schemaVersion": 1,          // database schema the data came from
 *   "exportedAt": "2026-10-18T09:00:00.000Z",
 *   "data": { "subjects": [...], "tasks": [...], ..., "user_settings": [...] }
 * }
 *
 * Import is two-step: `planImport` validates and produces a preview with no
 * side effects; `applyImport` writes atomically in one transaction.
 */
import { z } from "zod";
import type { Snapshot } from "./db/backend";
import type { Database } from "./db";
import { FOREIGN_KEYS } from "./db/backend";
import { entitySchemas, TABLES, type TableName } from "./db/schema";

export const BACKUP_FORMAT_VERSION = 1;

export const TABLE_LABELS: Record<TableName, string> = {
  subjects: "Subjects",
  tasks: "Tasks",
  subtasks: "Checklist items",
  class_schedules: "Classes",
  exams: "Exams",
  personal_events: "Personal events",
  focus_sessions: "Focus sessions",
  user_settings: "Settings",
  weekly_goals: "Weekly goals",
};

const envelopeSchema = z.object({
  // "uniflow" = backups made before the app was renamed to Flowed.
  app: z.enum(["flowed", "uniflow"], { message: "This is not a Flowed backup file." }),
  formatVersion: z.number().int().min(1),
  schemaVersion: z.number().int().min(1),
  exportedAt: z.string(),
  data: z.record(z.string(), z.array(z.unknown())),
});

export interface BackupFile {
  formatVersion: number;
  schemaVersion: number;
  exportedAt: string;
  data: Snapshot;
}

export async function createBackup(db: Database): Promise<BackupFile & { app: "flowed" }> {
  return {
    app: "flowed",
    formatVersion: BACKUP_FORMAT_VERSION,
    schemaVersion: db.schemaVersion,
    exportedAt: new Date().toISOString(),
    data: await db.exportSnapshot(),
  };
}

export class BackupValidationError extends Error {
  constructor(message: string, public readonly problems: string[] = []) {
    super(message);
    this.name = "BackupValidationError";
  }
}

/** Parses and strictly validates a backup file. Throws BackupValidationError. */
export function parseBackup(text: string): BackupFile {
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    throw new BackupValidationError("The file is not valid JSON.");
  }
  const env = envelopeSchema.safeParse(json);
  if (!env.success) throw new BackupValidationError(env.error.issues[0]?.message ?? "Unrecognised file structure.");
  if (env.data.formatVersion > BACKUP_FORMAT_VERSION)
    throw new BackupValidationError(
      `This backup was made by a newer version of Flowed (format v${env.data.formatVersion}). Update the app to import it.`,
    );

  const unknownTables = Object.keys(env.data.data).filter((k) => !(TABLES as readonly string[]).includes(k));
  if (unknownTables.length) throw new BackupValidationError(`Unknown data sections: ${unknownTables.join(", ")}.`);

  const problems: string[] = [];
  const data = {} as Snapshot;
  for (const table of TABLES) {
    const rows = env.data.data[table] ?? [];
    const parsed: unknown[] = [];
    const seen = new Set<string>();
    rows.forEach((row, i) => {
      const r = entitySchemas[table].safeParse(row);
      if (!r.success) {
        const issue = r.error.issues[0];
        problems.push(`${TABLE_LABELS[table]} #${i + 1}: ${issue?.message} (${issue?.path.join(".") || "record"})`);
        return;
      }
      const id = (r.data as { id: string }).id;
      if (seen.has(id)) problems.push(`${TABLE_LABELS[table]} #${i + 1}: duplicate id ${id}`);
      seen.add(id);
      parsed.push(r.data);
    });
    (data as Record<string, unknown[]>)[table] = parsed;
  }
  if (data.user_settings.length > 1) problems.push("Settings: more than one settings record.");
  if (problems.length)
    throw new BackupValidationError(`The backup contains ${problems.length} invalid record(s); nothing was imported.`, problems.slice(0, 20));

  return { formatVersion: env.data.formatVersion, schemaVersion: env.data.schemaVersion, exportedAt: env.data.exportedAt, data };
}

export type ImportMode = "merge" | "replace";

export interface ImportPlan {
  mode: ImportMode;
  backup: BackupFile;
  /** Rows that will actually be written. */
  rows: Snapshot;
  summary: { table: TableName; incoming: number; added: number; updated: number; skipped: number }[];
  /** Existing records that a "replace" import will delete. */
  willDelete: number;
}

/**
 * Builds a preview. Merge rules (avoid duplicates):
 *  - same id not in the database  -> added
 *  - same id, backup copy newer    -> updated
 *  - same id, backup copy same/older -> skipped (so re-importing a file is a no-op)
 */
export async function planImport(db: Database, backup: BackupFile, mode: ImportMode): Promise<ImportPlan> {
  const current = await db.exportSnapshot();
  const rows = {} as Snapshot;
  const summary: ImportPlan["summary"] = [];
  let willDelete = 0;

  for (const table of TABLES) {
    const incoming = backup.data[table] as { id: string; updatedAt: string }[];
    const existing = new Map((current[table] as { id: string; updatedAt: string }[]).map((r) => [r.id, r]));
    let added = 0, updated = 0, skipped = 0;
    const write: unknown[] = [];
    if (mode === "replace") {
      willDelete += existing.size;
      write.push(...incoming);
      added = incoming.length;
    } else {
      for (const r of incoming) {
        const prev = existing.get(r.id);
        if (!prev) { added++; write.push(r); }
        else if (r.updatedAt > prev.updatedAt) { updated++; write.push(r); }
        else skipped++;
      }
    }
    (rows as Record<string, unknown[]>)[table] = write;
    summary.push({ table, incoming: incoming.length, added, updated, skipped });
  }

  // Referential integrity against the post-import state.
  const problems: string[] = [];
  for (const [table, fks] of Object.entries(FOREIGN_KEYS) as [TableName, { field: string; references: TableName }[]][]) {
    for (const fk of fks) {
      const parents = new Set<string>([
        ...(backup.data[fk.references] as { id: string }[]).map((r) => r.id),
        ...(mode === "merge" ? (current[fk.references] as { id: string }[]).map((r) => r.id) : []),
      ]);
      for (const r of rows[table] as Record<string, unknown>[]) {
        const ref = r[fk.field];
        if (ref && !parents.has(ref as string))
          problems.push(`${TABLE_LABELS[table]} "${(r.title ?? r.name ?? r.id) as string}" refers to a missing ${TABLE_LABELS[fk.references].toLowerCase().replace(/s$/, "")}.`);
      }
    }
  }
  if (problems.length) throw new BackupValidationError("The backup has broken links between records; nothing was imported.", problems.slice(0, 20));

  return { mode, backup, rows, summary, willDelete };
}

export async function applyImport(db: Database, plan: ImportPlan): Promise<void> {
  await db.importSnapshot(plan.rows, plan.mode);
}

// ------------------------------------------------------------------ CSV
const csvCell = (v: unknown) => {
  const s = v === null || v === undefined ? "" : String(v);
  // Neutralise spreadsheet formula injection, then quote.
  const safe = /^[=+\-@\t\r]/.test(s) ? `'${s}` : s;
  return /[",\n\r]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
};
export const toCsv = (header: string[], rows: unknown[][]) =>
  [header, ...rows].map((r) => r.map(csvCell).join(",")).join("\r\n");

export function tasksCsv(snapshot: Snapshot): string {
  const subjects = new Map(snapshot.subjects.map((s) => [s.id, s.name]));
  return toCsv(
    ["Title", "Subject", "Category", "Priority", "Due", "Completed", "Completed at", "Description"],
    snapshot.tasks.map((t) => [
      t.title, t.subjectId ? subjects.get(t.subjectId) : "", t.category, t.priority, t.dueAt ?? "",
      t.completed ? "yes" : "no", t.completedAt ?? "", t.description,
    ]),
  );
}

export function focusCsv(snapshot: Snapshot): string {
  const subjects = new Map(snapshot.subjects.map((s) => [s.id, s.name]));
  return toCsv(
    ["Started", "Ended", "Minutes", "Subject", "Completed"],
    snapshot.focus_sessions.map((f) => [
      f.startedAt, f.endedAt, f.durationMinutes, f.subjectId ? subjects.get(f.subjectId) : "", f.completed ? "yes" : "no",
    ]),
  );
}
