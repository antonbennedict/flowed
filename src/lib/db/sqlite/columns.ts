/**
 * Maps camelCase entity fields to snake_case SQLite columns and handles
 * type conversion (booleans as 0/1, JSON as TEXT).
 */
import type { EntityMap, TableName } from "../schema";

type ColType = "text" | "int" | "real" | "bool" | "json" | "nullable-text";
type ColumnDef<T> = { key: keyof T & string; column: string; type: ColType };

const c = <T,>(key: keyof T & string, column: string, type: ColType = "text"): ColumnDef<T> => ({ key, column, type });

const stamp = <T extends { createdAt: string; updatedAt: string }>() =>
  [c<T>("createdAt", "created_at"), c<T>("updatedAt", "updated_at")] as ColumnDef<T>[];

export const COLUMNS: { [K in TableName]: ColumnDef<EntityMap[K]>[] } = {
  subjects: [
    c("id", "id"), c("name", "name"), c("code", "code"), c("instructor", "instructor"),
    c("color", "color"), c("notes", "notes"), ...stamp(),
  ],
  tasks: [
    c("id", "id"), c("title", "title"), c("description", "description"),
    c("subjectId", "subject_id", "nullable-text"), c("dueAt", "due_at", "nullable-text"),
    c("priority", "priority"), c("category", "category"), c("completed", "completed", "bool"),
    c("completedAt", "completed_at", "nullable-text"), ...stamp(),
  ],
  subtasks: [
    c("id", "id"), c("taskId", "task_id"), c("title", "title"), c("completed", "completed", "bool"),
    c("position", "position", "int"), ...stamp(),
  ],
  class_schedules: [
    c("id", "id"), c("subjectId", "subject_id"), c("weekday", "weekday", "int"),
    c("startTime", "start_time"), c("endTime", "end_time"), c("room", "room"),
    c("instructor", "instructor"), ...stamp(),
  ],
  exams: [
    c("id", "id"), c("title", "title"), c("subjectId", "subject_id", "nullable-text"),
    c("examAt", "exam_at"), c("durationMinutes", "duration_minutes", "int"), c("venue", "venue"),
    c("notes", "notes"), c("checklist", "checklist", "json"), c("completed", "completed", "bool"), ...stamp(),
  ],
  personal_events: [
    c("id", "id"), c("title", "title"), c("description", "description"), c("location", "location"),
    c("startAt", "start_at"), c("endAt", "end_at"), c("allDay", "all_day", "bool"), ...stamp(),
  ],
  focus_sessions: [
    c("id", "id"), c("subjectId", "subject_id", "nullable-text"), c("startedAt", "started_at"),
    c("endedAt", "ended_at"), c("durationMinutes", "duration_minutes", "real"),
    c("completed", "completed", "bool"), ...stamp(),
  ],
  user_settings: [
    c("id", "id"), c("displayName", "display_name"), c("course", "course"), c("yearLevel", "year_level"),
    c("theme", "theme"), c("weekStartsOn", "week_starts_on", "int"), c("focusMinutes", "focus_minutes", "int"),
    c("shortBreakMinutes", "short_break_minutes", "int"), c("longBreakMinutes", "long_break_minutes", "int"),
    c("sessionsBeforeLongBreak", "sessions_before_long_break", "int"),
    c("dailyFocusGoalMinutes", "daily_focus_goal_minutes", "int"),
    c("remindersEnabled", "reminders_enabled", "bool"), c("taskReminderMinutes", "task_reminder_minutes", "int"),
    c("examReminderMinutes", "exam_reminder_minutes", "int"),
    c("focusEndNotification", "focus_end_notification", "bool"),
    c("heavyDayThreshold", "heavy_day_threshold", "int"),
    c("textScale", "text_scale"), c("classReminderMinutes", "class_reminder_minutes", "int"),
    c("headsUpEnabled", "heads_up_enabled", "bool"), ...stamp(),
  ],
  weekly_goals: [
    c("id", "id"), c("weekStart", "week_start"), c("title", "title"), c("metric", "metric"),
    c("target", "target", "int"), c("progress", "progress", "int"), c("reflection", "reflection"), ...stamp(),
  ],
};

export function columnFor<T extends TableName>(table: T, key: string): string {
  const def = (COLUMNS[table] as ColumnDef<unknown>[]).find((d) => d.key === key);
  // Whitelisted mapping: column names are never taken from user input.
  if (!def) throw new Error(`Unknown field ${table}.${key}`);
  return def.column;
}

export function toSqlValue(type: ColType, value: unknown): string | number | null {
  if (value === undefined || value === null) return null;
  switch (type) {
    case "bool":
      return value ? 1 : 0;
    case "json":
      return JSON.stringify(value);
    case "int":
    case "real":
      return Number(value);
    default:
      return String(value);
  }
}

export function toRow<T extends TableName>(table: T, entity: EntityMap[T]): (string | number | null)[] {
  return (COLUMNS[table] as ColumnDef<EntityMap[T]>[]).map((d) => toSqlValue(d.type, entity[d.key]));
}

export function fromRow<T extends TableName>(table: T, row: Record<string, unknown>): EntityMap[T] {
  const out: Record<string, unknown> = {};
  for (const d of COLUMNS[table] as ColumnDef<EntityMap[T]>[]) {
    const v = row[d.column];
    switch (d.type) {
      case "bool":
        out[d.key] = v === 1 || v === true || v === "1";
        break;
      case "json":
        out[d.key] = typeof v === "string" ? JSON.parse(v) : (v ?? []);
        break;
      case "int":
      case "real":
        out[d.key] = Number(v);
        break;
      case "nullable-text":
        out[d.key] = v === null || v === undefined || v === "" ? null : String(v);
        break;
      default:
        out[d.key] = v === null || v === undefined ? "" : String(v);
    }
  }
  return out as EntityMap[T];
}
