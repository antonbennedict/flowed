/**
 * Public repository interfaces — the only way UI code touches data.
 *
 * `createRepositories(backend)` builds one implementation that works on top of
 * either storage backend. It owns validation (Zod), id generation,
 * timestamps, multi-record transactions and change notifications.
 */
import type { z } from "zod";
import type { StorageBackend } from "./backend";
import { DatabaseError, toDatabaseError, validationError } from "./errors";
import { nowIso, uuid } from "./ids";
import {
  classScheduleInputSchema, examInputSchema, focusSessionInputSchema, personalEventInputSchema,
  settingsInputSchema, SETTINGS_ID, subjectInputSchema, subtaskInputSchema, taskInputSchema, weeklyGoalInputSchema,
  type ClassSchedule, type ClassScheduleInput, type Exam, type ExamInput, type FocusSession, type FocusSessionInput,
  type PersonalEvent, type PersonalEventInput, type Subject, type SubjectInput, type Subtask, type SubtaskInput,
  type TableName, type Task, type TaskInput, type UserSettings, type UserSettingsInput, type WeeklyGoal, type WeeklyGoalInput,
} from "./schema";

// ------------------------------------------------------------ Interfaces
export interface CrudRepository<T, I> {
  list(): Promise<T[]>;
  get(id: string): Promise<T | null>;
  create(input: I): Promise<T>;
  update(id: string, patch: Partial<I>): Promise<T>;
  delete(id: string): Promise<void>;
}

export type SubjectRepository = CrudRepository<Subject, SubjectInput>;

export interface ChecklistDraft {
  id?: string;
  title: string;
  completed: boolean;
}

export interface TaskRepository extends CrudRepository<Task, TaskInput> {
  listBySubject(subjectId: string): Promise<Task[]>;
  /** Creates or updates a task and replaces its checklist atomically. */
  saveWithSubtasks(id: string | null, input: TaskInput, subtasks: ChecklistDraft[]): Promise<Task>;
  setCompleted(id: string, completed: boolean): Promise<Task>;
  /** Moves several due dates in one transaction (Catch-Up mode). */
  rescheduleMany(changes: { id: string; dueAt: string }[]): Promise<void>;
}

export interface SubtaskRepository {
  listByTask(taskId: string): Promise<Subtask[]>;
  list(): Promise<Subtask[]>;
  create(input: SubtaskInput): Promise<Subtask>;
  update(id: string, patch: Partial<SubtaskInput>): Promise<Subtask>;
  toggle(id: string): Promise<Subtask>;
  delete(id: string): Promise<void>;
}

export interface ScheduleImportRow {
  subject: { name: string; code: string; instructor: string };
  weekday: number;
  startTime: string;
  endTime: string;
  room: string;
}

export interface ClassScheduleRepository extends CrudRepository<ClassSchedule, ClassScheduleInput> {
  listByWeekday(weekday: number): Promise<ClassSchedule[]>;
  listBySubject(subjectId: string): Promise<ClassSchedule[]>;
  /**
   * Saves an imported timetable in one transaction: reuses subjects matched by
   * code or name, creates the rest, and skips classes that already exist.
   */
  importMany(rows: ScheduleImportRow[]): Promise<{ subjectsCreated: number; classesCreated: number; skipped: number }>;
}

export interface ExamRepository extends CrudRepository<Exam, ExamInput> {
  setCompleted(id: string, completed: boolean): Promise<Exam>;
}

export interface PersonalEventRepository extends CrudRepository<PersonalEvent, PersonalEventInput> {
  listBetween(fromIso: string, toIso: string): Promise<PersonalEvent[]>;
}

export interface FocusSessionRepository {
  list(): Promise<FocusSession[]>;
  listBetween(fromIso: string, toIso: string): Promise<FocusSession[]>;
  create(input: FocusSessionInput): Promise<FocusSession>;
  delete(id: string): Promise<void>;
}

export interface SettingsRepository {
  /** Returns the settings row, creating defaults on first launch. */
  get(): Promise<UserSettings>;
  update(patch: Partial<UserSettingsInput>): Promise<UserSettings>;
}

export interface WeeklyGoalRepository extends CrudRepository<WeeklyGoal, WeeklyGoalInput> {
  listByWeek(weekStart: string): Promise<WeeklyGoal[]>;
}

export interface Repositories {
  subjects: SubjectRepository;
  tasks: TaskRepository;
  subtasks: SubtaskRepository;
  schedules: ClassScheduleRepository;
  exams: ExamRepository;
  events: PersonalEventRepository;
  focusSessions: FocusSessionRepository;
  settings: SettingsRepository;
  weeklyGoals: WeeklyGoalRepository;
}

export type ChangeListener = (tables: TableName[]) => void;

// -------------------------------------------------------- Implementation
function parse<S extends z.ZodType>(schema: S, value: unknown, what: string): z.output<S> {
  const res = schema.safeParse(value);
  if (!res.success) throw validationError(res.error, what);
  return res.data;
}

/** Strips system fields so an entity can be re-validated as input. */
function editable<T extends { id: string; createdAt: string; updatedAt: string }>(row: T) {
  const { id: _id, createdAt: _c, updatedAt: _u, ...rest } = row;
  return rest;
}

export function createRepositories(backend: StorageBackend, emit: (tables: TableName[]) => void): Repositories {
  const s = backend.stores;

  /** Wraps a write: converts errors, then notifies subscribers. */
  const write = async <R,>(tables: TableName[], action: string, fn: () => Promise<R>): Promise<R> => {
    try {
      const out = await fn();
      emit(tables);
      return out;
    } catch (err) {
      throw toDatabaseError(err, action);
    }
  };
  const read = async <R,>(action: string, fn: () => Promise<R>): Promise<R> => {
    try {
      return await fn();
    } catch (err) {
      throw toDatabaseError(err, action);
    }
  };
  const mustGet = async <T,>(p: Promise<T | null>, what: string): Promise<T> => {
    const v = await p;
    if (!v) throw new DatabaseError("NOT_FOUND", `That ${what} no longer exists.`);
    return v;
  };

  // Generic CRUD for simple tables.
  function crud<T extends TableName, E extends { id: string; createdAt: string; updatedAt: string }, I>(
    table: T,
    schema: z.ZodType,
    what: string,
    affects: TableName[] = [table],
  ): CrudRepository<E, I> {
    const store = s[table] as unknown as {
      list(): Promise<E[]>;
      get(id: string): Promise<E | null>;
      insert(r: E): Promise<void>;
      update(r: E): Promise<void>;
      delete(id: string): Promise<void>;
    };
    return {
      list: () => read(`load ${what}s`, () => store.list()),
      get: (id) => read(`load the ${what}`, () => store.get(id)),
      create: (input) =>
        write(affects, `save the ${what}`, async () => {
          const data = parse(schema, input, `the ${what}`) as Record<string, unknown>;
          const ts = nowIso();
          const row = { ...data, id: uuid(), createdAt: ts, updatedAt: ts } as E;
          await store.insert(row);
          return row;
        }),
      update: (id, patch) =>
        write(affects, `update the ${what}`, async () => {
          const existing = await mustGet(store.get(id), what);
          const data = parse(schema, { ...editable(existing), ...patch }, `the ${what}`) as Record<string, unknown>;
          const row = { ...existing, ...data, updatedAt: nowIso() } as E;
          await store.update(row);
          return row;
        }),
      delete: (id) => write(affects, `delete the ${what}`, () => store.delete(id)),
    };
  }

  const subjects = crud<"subjects", Subject, SubjectInput>("subjects", subjectInputSchema, "subject", [
    "subjects", "tasks", "class_schedules", "exams", "focus_sessions",
  ]);

  // ---- Tasks
  const taskCrud = crud<"tasks", Task, TaskInput>("tasks", taskInputSchema, "task", ["tasks", "subtasks"]);
  const tasks: TaskRepository = {
    ...taskCrud,
    create: (input) =>
      write(["tasks"], "save the task", async () => {
        const data = parse(taskInputSchema, input, "the task");
        const ts = nowIso();
        const row: Task = { ...data, id: uuid(), completed: false, completedAt: null, createdAt: ts, updatedAt: ts };
        await s.tasks.insert(row);
        return row;
      }),
    update: (id, patch) =>
      write(["tasks"], "update the task", async () => {
        const existing = await mustGet(s.tasks.get(id), "task");
        const { completed: _c, completedAt: _ca, ...rest } = editable(existing);
        const data = parse(taskInputSchema, { ...rest, ...patch }, "the task");
        const row: Task = { ...existing, ...data, updatedAt: nowIso() };
        await s.tasks.update(row);
        return row;
      }),
    listBySubject: (subjectId) => read("load tasks", () => s.tasks.findBy("subjectId", subjectId)),
    saveWithSubtasks: (id, input, drafts) =>
      write(["tasks", "subtasks"], "save the task", async () => {
        const data = parse(taskInputSchema, input, "the task");
        const cleaned = drafts.map((d) => ({ ...d, title: d.title.trim() })).filter((d) => d.title.length > 0);
        for (const d of cleaned) parse(subtaskInputSchema.pick({ title: true }), { title: d.title }, "a checklist item");
        return backend.transaction(async (tx) => {
          const ts = nowIso();
          let task: Task;
          if (id) {
            const existing = await mustGet(tx.tasks.get(id), "task");
            task = { ...existing, ...data, updatedAt: ts };
            await tx.tasks.update(task);
          } else {
            task = { ...data, id: uuid(), completed: false, completedAt: null, createdAt: ts, updatedAt: ts };
            await tx.tasks.insert(task);
          }
          const current = id ? await tx.subtasks.findBy("taskId", task.id) : [];
          const keep = new Set(cleaned.map((d) => d.id).filter(Boolean));
          for (const old of current) if (!keep.has(old.id)) await tx.subtasks.delete(old.id);
          for (const [position, d] of cleaned.entries()) {
            const prev = current.find((c) => c.id === d.id);
            if (prev) await tx.subtasks.update({ ...prev, title: d.title, completed: d.completed, position, updatedAt: ts });
            else
              await tx.subtasks.insert({
                id: uuid(), taskId: task.id, title: d.title, completed: d.completed, position, createdAt: ts, updatedAt: ts,
              });
          }
          return task;
        });
      }),
    rescheduleMany: (changes) =>
      write(["tasks"], "reschedule tasks", async () => {
        for (const c of changes) parse(taskInputSchema.shape.dueAt, c.dueAt, "the new due date");
        await backend.transaction(async (tx) => {
          const ts = nowIso();
          for (const c of changes) {
            const existing = await mustGet(tx.tasks.get(c.id), "task");
            await tx.tasks.update({ ...existing, dueAt: c.dueAt, updatedAt: ts });
          }
        });
      }),
    setCompleted: (id, completed) =>
      write(["tasks"], "update the task", async () => {
        const existing = await mustGet(s.tasks.get(id), "task");
        const ts = nowIso();
        const row: Task = { ...existing, completed, completedAt: completed ? (existing.completedAt ?? ts) : null, updatedAt: ts };
        await s.tasks.update(row);
        return row;
      }),
  };

  // ---- Subtasks
  const subtasks: SubtaskRepository = {
    list: () => read("load checklists", () => s.subtasks.list()),
    listByTask: (taskId) => read("load the checklist", () => s.subtasks.findBy("taskId", taskId)),
    create: (input) =>
      write(["subtasks"], "add the checklist item", async () => {
        const data = parse(subtaskInputSchema, input, "the checklist item");
        const ts = nowIso();
        const row: Subtask = { ...data, id: uuid(), createdAt: ts, updatedAt: ts };
        await s.subtasks.insert(row);
        return row;
      }),
    update: (id, patch) =>
      write(["subtasks"], "update the checklist item", async () => {
        const existing = await mustGet(s.subtasks.get(id), "checklist item");
        const data = parse(subtaskInputSchema, { ...editable(existing), ...patch }, "the checklist item");
        const row: Subtask = { ...existing, ...data, updatedAt: nowIso() };
        await s.subtasks.update(row);
        return row;
      }),
    toggle: (id) =>
      write(["subtasks"], "update the checklist item", async () => {
        const existing = await mustGet(s.subtasks.get(id), "checklist item");
        const row: Subtask = { ...existing, completed: !existing.completed, updatedAt: nowIso() };
        await s.subtasks.update(row);
        return row;
      }),
    delete: (id) => write(["subtasks"], "delete the checklist item", () => s.subtasks.delete(id)),
  };

  // ---- Schedules
  const schedules: ClassScheduleRepository = {
    ...crud<"class_schedules", ClassSchedule, ClassScheduleInput>("class_schedules", classScheduleInputSchema, "class"),
    listByWeekday: (weekday) => read("load classes", () => s.class_schedules.findBy("weekday", weekday)),
    listBySubject: (subjectId) => read("load classes", () => s.class_schedules.findBy("subjectId", subjectId)),
    importMany: (rows) =>
      write(["subjects", "class_schedules"], "import the schedule", async () => {
        const key = (v: string) => v.toLowerCase().replace(/[^a-z0-9]/g, "");
        // Validate everything before touching the database.
        const valid = rows.map((r, i) => {
          const subject = parse(subjectInputSchema, { name: r.subject.name || r.subject.code, code: r.subject.code, instructor: r.subject.instructor }, `row ${i + 1}`);
          parse(classScheduleInputSchema, { subjectId: "00000000-0000-4000-8000-000000000000", weekday: r.weekday, startTime: r.startTime, endTime: r.endTime, room: r.room }, `row ${i + 1}`);
          return { ...r, subject };
        });
        const palette = ["#4F46E5", "#7C3AED", "#0284C7", "#0D9488", "#16A34A", "#CA8A04", "#EA580C", "#DB2777", "#C026D3", "#DC2626"];
        return backend.transaction(async (tx) => {
          const subjects = await tx.subjects.list();
          const existingClasses = await tx.class_schedules.list();
          const ts = nowIso();
          let subjectsCreated = 0, classesCreated = 0, skipped = 0;
          for (const r of valid) {
            let subj = subjects.find((x) => (r.subject.code && key(x.code) === key(r.subject.code)) || key(x.name) === key(r.subject.name));
            if (!subj) {
              subj = { ...r.subject, color: palette[(subjects.length) % palette.length], id: uuid(), createdAt: ts, updatedAt: ts };
              await tx.subjects.insert(subj);
              subjects.push(subj);
              subjectsCreated++;
            }
            const dup = existingClasses.some((c) => c.subjectId === subj!.id && c.weekday === r.weekday && c.startTime === r.startTime && c.endTime === r.endTime);
            if (dup) { skipped++; continue; }
            const row: ClassSchedule = { id: uuid(), subjectId: subj.id, weekday: r.weekday, startTime: r.startTime, endTime: r.endTime, room: r.room, instructor: "", createdAt: ts, updatedAt: ts };
            await tx.class_schedules.insert(row);
            existingClasses.push(row);
            classesCreated++;
          }
          return { subjectsCreated, classesCreated, skipped };
        });
      }),
  };

  // ---- Exams
  const examCrud = crud<"exams", Exam, ExamInput>("exams", examInputSchema, "exam");
  const exams: ExamRepository = {
    ...examCrud,
    setCompleted: (id, completed) => examCrud.update(id, { completed }),
  };

  // ---- Events
  const events: PersonalEventRepository = {
    ...crud<"personal_events", PersonalEvent, PersonalEventInput>("personal_events", personalEventInputSchema, "event"),
    listBetween: (from, to) => read("load events", () => s.personal_events.findRange("startAt", from, to)),
  };

  // ---- Focus sessions
  const focusSessions: FocusSessionRepository = {
    list: () => read("load focus sessions", () => s.focus_sessions.list()),
    listBetween: (from, to) => read("load focus sessions", () => s.focus_sessions.findRange("startedAt", from, to)),
    create: (input) =>
      write(["focus_sessions"], "save the focus session", async () => {
        const data = parse(focusSessionInputSchema, input, "the focus session");
        const ts = nowIso();
        const row: FocusSession = { ...data, durationMinutes: Math.round(data.durationMinutes * 100) / 100, id: uuid(), createdAt: ts, updatedAt: ts };
        await s.focus_sessions.insert(row);
        return row;
      }),
    delete: (id) => write(["focus_sessions"], "delete the focus session", () => s.focus_sessions.delete(id)),
  };

  // ---- Settings (single row, created lazily)
  const settings: SettingsRepository = {
    get: () =>
      read("load settings", async () => {
        const existing = await s.user_settings.get(SETTINGS_ID);
        // Fill fields added by later schema versions.
        if (existing) return { ...settingsInputSchema.parse({}), ...existing };
        const ts = nowIso();
        const row: UserSettings = { ...settingsInputSchema.parse({}), id: SETTINGS_ID, createdAt: ts, updatedAt: ts };
        await s.user_settings.insert(row);
        return row;
      }),
    update: (patch) =>
      write(["user_settings"], "save settings", async () => {
        const existing = await settings.get();
        const data = parse(settingsInputSchema, { ...editable(existing), ...patch }, "settings");
        const row: UserSettings = { ...existing, ...data, updatedAt: nowIso() };
        await s.user_settings.update(row);
        return row;
      }),
  };

  // ---- Weekly goals
  const weeklyGoals: WeeklyGoalRepository = {
    ...crud<"weekly_goals", WeeklyGoal, WeeklyGoalInput>("weekly_goals", weeklyGoalInputSchema, "goal"),
    listByWeek: (weekStart) => read("load goals", () => s.weekly_goals.findBy("weekStart", weekStart)),
  };

  return { subjects, tasks, subtasks, schedules, exams, events, focusSessions, settings, weeklyGoals };
}
