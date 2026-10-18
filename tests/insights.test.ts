import { describe, expect, it } from "vitest";
import { addDays, addHours, subDays } from "date-fns";
import { catchUpPlan, completionRate, findOverlaps, studyStreak, suggestPriorities, workloadByDay } from "@/lib/insights";
import { desiredReminders, notificationId } from "@/lib/notifications";
import { settingsInputSchema, settingsSchema, type ClassSchedule, type Exam, type FocusSession, type Task } from "@/lib/db/schema";
import type { Snapshot } from "@/lib/db/backend";

const NOW = new Date(2026, 9, 14, 10, 0); // Wed 14 Oct 2026, 10:00 local
let n = 0;
const id = () => `00000000-0000-4000-8000-${String(++n).padStart(12, "0")}`;
const ts = NOW.toISOString();

const task = (p: Partial<Task>): Task => ({
  id: id(), title: "t", description: "", subjectId: null, dueAt: null, priority: "medium", category: "assignment",
  completed: false, completedAt: null, createdAt: ts, updatedAt: ts, ...p,
});
const exam = (p: Partial<Exam>): Exam => ({
  id: id(), title: "e", subjectId: null, examAt: ts, durationMinutes: 60, venue: "", notes: "", checklist: [], completed: false,
  createdAt: ts, updatedAt: ts, ...p,
});
const focus = (start: Date, minutes: number): FocusSession => ({
  id: id(), subjectId: null, startedAt: start.toISOString(), endedAt: start.toISOString(), durationMinutes: minutes, completed: true, createdAt: ts, updatedAt: ts,
});

describe("smart features", () => {
  it("ranks overdue and near deadlines first and suggests raising priority", () => {
    const later = task({ title: "later", dueAt: addDays(NOW, 10).toISOString(), priority: "high" });
    const soon = task({ title: "soon", dueAt: addHours(NOW, 5).toISOString(), priority: "low" });
    const late = task({ title: "late", dueAt: subDays(NOW, 1).toISOString() });
    const s = suggestPriorities([later, soon, late], [], NOW);
    expect(s.map((x) => x.task.title)).toEqual(["late", "soon", "later"]);
    expect(s.find((x) => x.task.title === "soon")?.suggestedPriority).toBe("urgent");
    expect(s.find((x) => x.task.title === "later")?.suggestedPriority).toBeUndefined();
  });

  it("flags heavy days with exams weighted double", () => {
    const day = addDays(NOW, 2);
    const tasks = [task({ dueAt: day.toISOString() }), task({ dueAt: day.toISOString() })];
    const exams = [exam({ examAt: day.toISOString() })];
    const w = workloadByDay(tasks, exams, 4, 7, NOW);
    expect(w[2].load).toBe(4);
    expect(w[2].heavy).toBe(true);
    expect(w.filter((d) => d.heavy)).toHaveLength(1);
  });

  it("counts study streaks from focus sessions and completed tasks", () => {
    const sessions = [focus(subDays(NOW, 1), 25), focus(subDays(NOW, 2), 10)];
    const tasks = [task({ completed: true, completedAt: subDays(NOW, 3).toISOString() })];
    expect(studyStreak(sessions, tasks, NOW)).toMatchObject({ current: 3, todayActive: false, longest: 3 });
    expect(studyStreak([], [], NOW).current).toBe(0);
  });

  it("spreads overdue tasks without exceeding per-day and heavy-day limits", () => {
    const overdue = Array.from({ length: 5 }, (_, i) => task({ title: `o${i}`, dueAt: subDays(NOW, i + 1).toISOString(), priority: i === 4 ? "urgent" : "medium" }));
    const plan = catchUpPlan(overdue, [], { heavyDayThreshold: 4 }, 2, NOW);
    expect(plan).toHaveLength(5);
    expect(plan[0].task.title).toBe("o4"); // urgent first
    const perDay = new Map<string, number>();
    for (const p of plan) perDay.set(p.newDate.toDateString(), (perDay.get(p.newDate.toDateString()) ?? 0) + 1);
    expect(Math.max(...perDay.values())).toBeLessThanOrEqual(2);
    expect(plan.every((p) => p.newDate >= NOW)).toBe(true);
  });

  it("detects overlapping classes on the same weekday only", () => {
    const base = { subjectId: id(), room: "", instructor: "", createdAt: ts, updatedAt: ts };
    const a: ClassSchedule = { ...base, id: id(), weekday: 1, startTime: "09:00", endTime: "10:30" };
    const b: ClassSchedule = { ...base, id: id(), weekday: 2, startTime: "09:00", endTime: "10:30" };
    expect(findOverlaps([a, b], { weekday: 1, startTime: "10:00", endTime: "11:00" })).toEqual([a]);
    expect(findOverlaps([a, b], { weekday: 1, startTime: "10:30", endTime: "11:00" })).toEqual([]); // touching is fine
    expect(findOverlaps([a], a, a.id)).toEqual([]); // editing itself
  });

  it("computes completion rate only over tasks due in range", () => {
    const tasks = [task({ dueAt: NOW.toISOString(), completed: true }), task({ dueAt: NOW.toISOString() }), task({ dueAt: addDays(NOW, 30).toISOString() })];
    expect(completionRate(tasks, subDays(NOW, 1), addDays(NOW, 1))).toEqual({ rate: 0.5, done: 1, total: 2 });
    expect(completionRate([], NOW, NOW).rate).toBeNull();
  });
});

describe("reminders", () => {
  const settings = settingsSchema.parse({ ...settingsInputSchema.parse({}), id: "default", createdAt: ts, updatedAt: ts });
  const snapshot = (p: Partial<Snapshot>): Snapshot => ({
    subjects: [], tasks: [], subtasks: [], class_schedules: [], exams: [], personal_events: [], focus_sessions: [], weekly_goals: [],
    user_settings: [settings], ...p,
  });

  it("uses stable ids so rescheduling replaces instead of duplicating", () => {
    expect(notificationId("task:abc")).toBe(notificationId("task:abc"));
    expect(notificationId("task:abc")).not.toBe(notificationId("exam:abc"));
    expect(notificationId("task:abc")).toBeGreaterThan(1);
  });

  it("skips completed, past and undated items, and honours lead times", () => {
    const due = addDays(NOW, 2);
    const s = desiredReminders(snapshot({
      tasks: [task({ dueAt: due.toISOString() }), task({ dueAt: due.toISOString(), completed: true }), task({}), task({ dueAt: subDays(NOW, 1).toISOString() })],
      exams: [exam({ examAt: addDays(NOW, 3).toISOString() }), exam({ examAt: addDays(NOW, 3).toISOString(), completed: true })],
    }), NOW);
    expect(s).toHaveLength(2);
    const t = s.find((r) => r.kind === "task-reminder")!;
    expect(due.getTime() - t.at.getTime()).toBe(settings.taskReminderMinutes * 60_000);
    expect(new Set(s.map((r) => r.id)).size).toBe(2);
  });

  it("schedules nothing when reminders are disabled", () => {
    const off = { ...settings, remindersEnabled: false };
    expect(desiredReminders(snapshot({ user_settings: [off], tasks: [task({ dueAt: addDays(NOW, 2).toISOString() })] }), NOW)).toEqual([]);
  });
});
