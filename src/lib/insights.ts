/**
 * Local "smart" features and statistics. Everything here is a pure function
 * of database records — no AI, no network — so it is deterministic and
 * unit-tested (tests/insights.test.ts).
 */
import { addDays, differenceInHours, endOfDay, isBefore, parseISO, startOfDay, subDays } from "date-fns";
import { dayKey, minutesOfDay } from "./dates";
import type { ClassSchedule, Exam, FocusSession, Priority, Subject, Subtask, Task, UserSettings, WeeklyGoal } from "./db/schema";

// ------------------------------------------------------------ Task views
export const isOverdue = (t: Task, now = new Date()) => !t.completed && !!t.dueAt && isBefore(parseISO(t.dueAt), now);
export const isDueToday = (t: Task, now = new Date()) =>
  !!t.dueAt && parseISO(t.dueAt) >= startOfDay(now) && parseISO(t.dueAt) <= endOfDay(now);

export type TaskView = "today" | "upcoming" | "overdue" | "completed" | "all";

export function filterByView(tasks: Task[], view: TaskView, now = new Date()): Task[] {
  switch (view) {
    case "today":
      return tasks.filter((t) => !t.completed && isDueToday(t, now) && !isOverdue(t, now));
    case "upcoming":
      return tasks.filter((t) => !t.completed && (!t.dueAt || parseISO(t.dueAt) > endOfDay(now)));
    case "overdue":
      return tasks.filter((t) => isOverdue(t, now));
    case "completed":
      return tasks.filter((t) => t.completed);
    default:
      return tasks;
  }
}

export const PRIORITY_WEIGHT: Record<Priority, number> = { low: 1, medium: 2, high: 3, urgent: 4 };

// ---------------------------------------------- Deadline priority suggestions
export interface Suggestion {
  task: Task;
  score: number;
  reasons: string[];
  /** Suggested priority if it differs from the current one. */
  suggestedPriority?: Priority;
}

/**
 * Scores open tasks by urgency so students know what to do next.
 * score = priority weight + deadline pressure + assessment weight + unfinished-checklist pressure
 */
export function suggestPriorities(tasks: Task[], subtasks: Subtask[], now = new Date()): Suggestion[] {
  const open = tasks.filter((t) => !t.completed);
  const byTask = new Map<string, Subtask[]>();
  for (const s of subtasks) byTask.set(s.taskId, [...(byTask.get(s.taskId) ?? []), s]);

  return open
    .map((task) => {
      const reasons: string[] = [];
      let score = PRIORITY_WEIGHT[task.priority] * 2;
      if (task.dueAt) {
        const hours = differenceInHours(parseISO(task.dueAt), now);
        if (hours < 0) { score += 10; reasons.push("Overdue"); }
        else if (hours <= 24) { score += 8; reasons.push("Due within 24 hours"); }
        else if (hours <= 72) { score += 5; reasons.push("Due within 3 days"); }
        else if (hours <= 168) { score += 2; reasons.push("Due this week"); }
      }
      if (task.category === "exam" || task.category === "quiz") { score += 2; reasons.push("Graded assessment"); }
      if (task.category === "project") score += 1;
      const items = byTask.get(task.id) ?? [];
      const remaining = items.filter((s) => !s.completed).length;
      if (remaining >= 3) { score += 1; reasons.push(`${remaining} checklist steps left`); }

      let suggestedPriority: Priority | undefined;
      const hoursLeft = task.dueAt ? differenceInHours(parseISO(task.dueAt), now) : Infinity;
      const target: Priority = hoursLeft <= 24 ? "urgent" : hoursLeft <= 72 ? "high" : task.priority;
      if (PRIORITY_WEIGHT[target] > PRIORITY_WEIGHT[task.priority]) suggestedPriority = target;
      return { task, score, reasons, suggestedPriority };
    })
    .sort((a, b) => b.score - a.score);
}

// ---------------------------------------------------- Heavy-workload days
export interface WorkloadDay {
  date: Date;
  key: string;
  tasks: Task[];
  exams: Exam[];
  load: number;
  heavy: boolean;
}

/** Exams count double. A day is "heavy" when load >= settings.heavyDayThreshold. */
export function workloadByDay(tasks: Task[], exams: Exam[], threshold: number, days = 14, now = new Date()): WorkloadDay[] {
  const out: WorkloadDay[] = [];
  for (let i = 0; i < days; i++) {
    const date = startOfDay(addDays(now, i));
    const key = dayKey(date);
    const dTasks = tasks.filter((t) => !t.completed && t.dueAt && dayKey(parseISO(t.dueAt)) === key);
    const dExams = exams.filter((e) => !e.completed && dayKey(parseISO(e.examAt)) === key);
    const load = dTasks.length + dExams.length * 2;
    out.push({ date, key, tasks: dTasks, exams: dExams, load, heavy: load >= threshold });
  }
  return out;
}

// ------------------------------------------------------------ Study streak
/** Consecutive days with focus time or a completed task, ending today (or yesterday if today is still empty). */
export function studyStreak(sessions: FocusSession[], tasks: Task[], now = new Date()) {
  const active = new Set<string>();
  for (const s of sessions) if (s.durationMinutes >= 1) active.add(dayKey(parseISO(s.startedAt)));
  for (const t of tasks) if (t.completedAt) active.add(dayKey(parseISO(t.completedAt)));

  let cursor = startOfDay(now);
  const todayActive = active.has(dayKey(cursor));
  if (!todayActive) cursor = subDays(cursor, 1);
  let current = 0;
  while (active.has(dayKey(cursor))) { current++; cursor = subDays(cursor, 1); }

  // Longest streak over all history.
  const keys = [...active].sort();
  let longest = 0, run = 0, prev: string | null = null;
  for (const k of keys) {
    run = prev && dayKey(addDays(parseISO(prev), 1)) === k ? run + 1 : 1;
    longest = Math.max(longest, run);
    prev = k;
  }
  return { current, longest, todayActive };
}

// ------------------------------------------------------------- Catch-Up
export interface CatchUpItem { task: Task; newDate: Date }

/**
 * Spreads overdue tasks over the next days, most important first, never
 * scheduling more than `perDay` catch-up items on a day and avoiding heavy days.
 */
export function catchUpPlan(tasks: Task[], exams: Exam[], settings: Pick<UserSettings, "heavyDayThreshold">, perDay = 2, now = new Date()): CatchUpItem[] {
  const overdue = tasks
    .filter((t) => isOverdue(t, now))
    .sort((a, b) => PRIORITY_WEIGHT[b.priority] - PRIORITY_WEIGHT[a.priority] || a.dueAt!.localeCompare(b.dueAt!));
  const load = workloadByDay(tasks, exams, settings.heavyDayThreshold, 30, now);
  const assigned = new Map<string, number>();
  const plan: CatchUpItem[] = [];
  let dayIndex = now.getHours() >= 18 ? 1 : 0; // late evening: start tomorrow
  for (const task of overdue) {
    while (dayIndex < load.length) {
      const d = load[dayIndex];
      const used = assigned.get(d.key) ?? 0;
      if (used < perDay && d.load + used < settings.heavyDayThreshold) break;
      dayIndex++;
    }
    const day = load[Math.min(dayIndex, load.length - 1)];
    assigned.set(day.key, (assigned.get(day.key) ?? 0) + 1);
    const due = parseISO(task.dueAt!);
    const newDate = new Date(day.date);
    newDate.setHours(due.getHours() || 21, due.getMinutes(), 0, 0);
    if (newDate < now) newDate.setTime(endOfDay(now).getTime() - 60_000);
    plan.push({ task, newDate });
  }
  return plan;
}

// ------------------------------------------------------- Schedule overlap
export function findOverlaps(
  schedules: ClassSchedule[],
  candidate: { weekday: number; startTime: string; endTime: string },
  excludeId?: string,
): ClassSchedule[] {
  const s = minutesOfDay(candidate.startTime);
  const e = minutesOfDay(candidate.endTime);
  return schedules.filter(
    (c) => c.id !== excludeId && c.weekday === candidate.weekday && minutesOfDay(c.startTime) < e && s < minutesOfDay(c.endTime),
  );
}

// -------------------------------------------------------------- Analytics
export interface DayStat { key: string; date: Date; completed: number; due: number; focusMinutes: number }

export function dailyStats(tasks: Task[], sessions: FocusSession[], from: Date, days: number): DayStat[] {
  const stats: DayStat[] = Array.from({ length: days }, (_, i) => {
    const date = startOfDay(addDays(from, i));
    return { key: dayKey(date), date, completed: 0, due: 0, focusMinutes: 0 };
  });
  const idx = new Map(stats.map((s) => [s.key, s]));
  for (const t of tasks) {
    if (t.completedAt) { const s = idx.get(dayKey(parseISO(t.completedAt))); if (s) s.completed++; }
    if (t.dueAt) { const s = idx.get(dayKey(parseISO(t.dueAt))); if (s) s.due++; }
  }
  for (const f of sessions) {
    const s = idx.get(dayKey(parseISO(f.startedAt)));
    if (s) s.focusMinutes += f.durationMinutes;
  }
  return stats;
}

/** Of the tasks due in [from, to], the share that are completed. null when nothing was due. */
export function completionRate(tasks: Task[], from: Date, to: Date): { rate: number | null; done: number; total: number } {
  const due = tasks.filter((t) => t.dueAt && parseISO(t.dueAt) >= from && parseISO(t.dueAt) <= to);
  const done = due.filter((t) => t.completed).length;
  return { rate: due.length ? done / due.length : null, done, total: due.length };
}

export interface SubjectLoad { subject: Subject; openTasks: number; completedTasks: number; upcomingExams: number; focusMinutes: number; progress: number | null }

export function subjectWorkload(subjects: Subject[], tasks: Task[], exams: Exam[], sessions: FocusSession[], now = new Date()): SubjectLoad[] {
  return subjects.map((subject) => {
    const st = tasks.filter((t) => t.subjectId === subject.id);
    const completedTasks = st.filter((t) => t.completed).length;
    return {
      subject,
      openTasks: st.length - completedTasks,
      completedTasks,
      upcomingExams: exams.filter((e) => e.subjectId === subject.id && !e.completed && parseISO(e.examAt) >= now).length,
      focusMinutes: sessions.filter((f) => f.subjectId === subject.id).reduce((a, f) => a + f.durationMinutes, 0),
      progress: st.length ? completedTasks / st.length : null,
    };
  });
}

// ----------------------------------------------------------- Weekly goals
export function goalProgress(goal: WeeklyGoal, tasks: Task[], sessions: FocusSession[], weekStartsAt: Date): number {
  const end = addDays(weekStartsAt, 7);
  if (goal.metric === "tasks_completed")
    return tasks.filter((t) => t.completedAt && parseISO(t.completedAt) >= weekStartsAt && parseISO(t.completedAt) < end).length;
  if (goal.metric === "focus_minutes")
    return Math.round(
      sessions.filter((f) => parseISO(f.startedAt) >= weekStartsAt && parseISO(f.startedAt) < end).reduce((a, f) => a + f.durationMinutes, 0),
    );
  return goal.progress;
}
