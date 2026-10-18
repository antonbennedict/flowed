/**
 * Default list ordering per table. SQLite expresses the same rules in
 * ORDER BY clauses (see sqlite/backend.ts); IndexedDB sorts with these.
 */
import type { EntityMap, TableName } from "./schema";

const str = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);
const nullsLast = (a: string | null, b: string | null) =>
  a === b ? 0 : a === null ? 1 : b === null ? -1 : str(a, b);

export const COMPARATORS: { [K in TableName]: (a: EntityMap[K], b: EntityMap[K]) => number } = {
  subjects: (a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" }),
  tasks: (a, b) =>
    Number(a.completed) - Number(b.completed) || nullsLast(a.dueAt, b.dueAt) || str(a.createdAt, b.createdAt),
  subtasks: (a, b) => a.position - b.position || str(a.createdAt, b.createdAt),
  class_schedules: (a, b) => a.weekday - b.weekday || str(a.startTime, b.startTime),
  exams: (a, b) => str(a.examAt, b.examAt),
  personal_events: (a, b) => str(a.startAt, b.startAt),
  focus_sessions: (a, b) => str(b.startedAt, a.startedAt),
  user_settings: (a, b) => str(a.id, b.id),
  weekly_goals: (a, b) => str(b.weekStart, a.weekStart) || str(a.createdAt, b.createdAt),
};
