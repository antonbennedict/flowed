/**
 * Heads-up engine: what needs the student's attention right now.
 * Pure function of local records + the clock, so it works offline and is
 * unit-tested. The UI shows these in the bell panel and, while the app is
 * open, pops a toast/system notification when one becomes "due".
 */
import { addDays, differenceInMinutes, endOfDay, format, isSameDay, parseISO, startOfDay } from "date-fns";
import { formatClock, minutesOfDay } from "./dates";
import type { ClassSchedule, Exam, PersonalEvent, Subject, Task, UserSettings } from "./db/schema";
import { eventTimeLabel } from "./events";
import { workloadByDay } from "./insights";

export type AlertSeverity = "critical" | "warning" | "info";
export type AlertKind = "overdue" | "task-due" | "class" | "exam" | "heavy-day" | "exam-prep" | "event";

export interface HeadsUp {
  /** Stable per occurrence, e.g. "task-due:<id>:<dueAt>", used for dedupe/dismiss. */
  id: string;
  kind: AlertKind;
  severity: AlertSeverity;
  title: string;
  body: string;
  at: Date;
  /** True when this alert should pop a notification (crossed its heads-up threshold). */
  notify: boolean;
  ref?: { type: "task"; task: Task } | { type: "exam"; exam: Exam } | { type: "class"; schedule: ClassSchedule } | { type: "event"; event: PersonalEvent };
}

const SEVERITY_ORDER: Record<AlertSeverity, number> = { critical: 0, warning: 1, info: 2 };

function rel(mins: number): string {
  if (mins <= 1) return "now";
  if (mins < 60) return `in ${mins} min`;
  const h = Math.round(mins / 60);
  return h < 24 ? `in ${h} hour${h === 1 ? "" : "s"}` : `in ${Math.round(h / 24)} day${Math.round(h / 24) === 1 ? "" : "s"}`;
}

export function computeHeadsUp(
  data: { tasks: Task[]; exams: Exam[]; schedules: ClassSchedule[]; subjects: Subject[]; events?: PersonalEvent[] },
  settings: Pick<UserSettings, "taskReminderMinutes" | "examReminderMinutes" | "classReminderMinutes" | "heavyDayThreshold">,
  now = new Date(),
): HeadsUp[] {
  const out: HeadsUp[] = [];
  const subj = new Map(data.subjects.map((s) => [s.id, s]));
  const label = (id: string | null) => (id ? subj.get(id)?.code || subj.get(id)?.name : undefined);
  const taskLead = Math.max(settings.taskReminderMinutes, 60);

  for (const t of data.tasks) {
    if (t.completed || !t.dueAt) continue;
    const due = parseISO(t.dueAt);
    const mins = differenceInMinutes(due, now);
    const s = label(t.subjectId);
    if (mins < 0) {
      const late = -mins < 60 ? `${-mins} min` : -mins < 1440 ? `${Math.round(-mins / 60)} h` : `${Math.round(-mins / 1440)} d`;
      out.push({ id: `overdue:${t.id}:${t.dueAt}`, kind: "overdue", severity: "critical", title: `Overdue: ${t.title}`, body: `${late} late${s ? ` · ${s}` : ""}`, at: due, notify: true, ref: { type: "task", task: t } });
    } else if (mins <= taskLead) {
      out.push({ id: `task-due:${t.id}:${t.dueAt}`, kind: "task-due", severity: "warning", title: `Due ${rel(mins)}: ${t.title}`, body: `${format(due, "h:mm a")}${s ? ` · ${s}` : ""}`, at: due, notify: true, ref: { type: "task", task: t } });
    } else if (due <= endOfDay(addDays(now, 1))) {
      out.push({ id: `task-due:${t.id}:${t.dueAt}`, kind: "task-due", severity: "info", title: `${isSameDay(due, now) ? "Due today" : "Due tomorrow"}: ${t.title}`, body: `${format(due, "h:mm a")}${s ? ` · ${s}` : ""}`, at: due, notify: false, ref: { type: "task", task: t } });
    }
  }

  for (const e of data.exams) {
    if (e.completed) continue;
    const at = parseISO(e.examAt);
    const mins = differenceInMinutes(at, now);
    if (mins < -e.durationMinutes || mins > 3 * 1440) continue;
    const s = label(e.subjectId);
    const prepLeft = e.checklist.filter((c) => !c.done).length;
    const where = [s, e.venue].filter(Boolean).join(" · ");
    if (mins <= 0) {
      out.push({ id: `exam:${e.id}:now`, kind: "exam", severity: "warning", title: `Exam in progress: ${e.title}`, body: where, at, notify: false, ref: { type: "exam", exam: e } });
    } else {
      const soon = mins <= Math.max(settings.examReminderMinutes, 1440);
      out.push({
        id: `exam:${e.id}:${e.examAt}`, kind: "exam", severity: soon ? "warning" : "info",
        title: `${e.title} ${rel(mins)}`, body: `${format(at, "EEE h:mm a")}${where ? ` · ${where}` : ""}`, at, notify: soon, ref: { type: "exam", exam: e },
      });
      if (prepLeft > 0)
        out.push({ id: `exam-prep:${e.id}:${e.examAt}`, kind: "exam-prep", severity: "info", title: `Prep for ${e.title}`, body: `${prepLeft} checklist item${prepLeft === 1 ? "" : "s"} left`, at, notify: false, ref: { type: "exam", exam: e } });
    }
  }

  const nowMin = now.getHours() * 60 + now.getMinutes();
  for (const c of data.schedules) {
    if (c.weekday !== now.getDay()) continue;
    const start = minutesOfDay(c.startTime);
    const end = minutesOfDay(c.endTime);
    const until = start - nowMin;
    const name = subj.get(c.subjectId)?.name ?? "Class";
    const day = format(now, "yyyy-MM-dd");
    if (until > 0 && until <= Math.max(settings.classReminderMinutes, 1)) {
      out.push({ id: `class:${c.id}:${day}`, kind: "class", severity: "warning", title: `${name} starts ${rel(until)}`, body: `${formatClock(c.startTime)}${c.room ? ` · ${c.room}` : ""}`, at: new Date(startOfDay(now).getTime() + start * 60_000), notify: true, ref: { type: "class", schedule: c } });
    } else if (until <= 0 && nowMin < end) {
      out.push({ id: `class-now:${c.id}:${day}`, kind: "class", severity: "info", title: `In class: ${name}`, body: `Until ${formatClock(c.endTime)}${c.room ? ` · ${c.room}` : ""}`, at: new Date(startOfDay(now).getTime() + start * 60_000), notify: false, ref: { type: "class", schedule: c } });
    }
  }

  // Personal events: heads-up shortly before (same lead time as classes), plus today's list.
  for (const ev of data.events ?? []) {
    const start = parseISO(ev.startAt), end = parseISO(ev.endAt);
    if (end < now) continue;
    const where = ev.location ? ` · ${ev.location}` : "";
    const until = differenceInMinutes(start, now);
    if (!ev.allDay && until > 0 && until <= Math.max(settings.classReminderMinutes, 1)) {
      out.push({ id: `event:${ev.id}:${ev.startAt}`, kind: "event", severity: "warning", title: `${ev.title} starts ${rel(until)}`, body: `${eventTimeLabel(ev)}${where}`, at: start, notify: true, ref: { type: "event", event: ev } });
    } else if (start <= now) {
      out.push({ id: `event-now:${ev.id}:${format(now, "yyyy-MM-dd")}`, kind: "event", severity: "info", title: `Now: ${ev.title}`, body: `${eventTimeLabel(ev)}${where}`, at: start, notify: false, ref: { type: "event", event: ev } });
    } else if (start <= endOfDay(addDays(now, 1))) {
      out.push({ id: `event-soon:${ev.id}:${ev.startAt}`, kind: "event", severity: "info", title: `${isSameDay(start, now) ? "Today" : "Tomorrow"}: ${ev.title}`, body: `${eventTimeLabel(ev)}${where}`, at: start, notify: false, ref: { type: "event", event: ev } });
    }
  }

  const tomorrow = workloadByDay(data.tasks, data.exams, settings.heavyDayThreshold, 2, now)[1];
  if (tomorrow?.heavy)
    out.push({ id: `heavy:${tomorrow.key}`, kind: "heavy-day", severity: "info", title: "Heavy day tomorrow", body: `${tomorrow.tasks.length} task${tomorrow.tasks.length === 1 ? "" : "s"}${tomorrow.exams.length ? ` and ${tomorrow.exams.length} exam${tomorrow.exams.length === 1 ? "" : "s"}` : ""}. Start something tonight.`, at: tomorrow.date, notify: false });

  return out.sort((a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity] || a.at.getTime() - b.at.getTime());
}

/** Free gaps between today's classes, for the "free time" helper. */
export function freeSlots(classes: ClassSchedule[], weekday: number, dayStart = "07:00", dayEnd = "21:00", minMinutes = 30) {
  const busy = classes
    .filter((c) => c.weekday === weekday)
    .map((c) => [minutesOfDay(c.startTime), minutesOfDay(c.endTime)] as const)
    .sort((a, b) => a[0] - b[0]);
  const slots: { start: number; end: number }[] = [];
  let cursor = minutesOfDay(dayStart);
  const limit = minutesOfDay(dayEnd);
  for (const [s, e] of busy) {
    if (s - cursor >= minMinutes) slots.push({ start: cursor, end: Math.min(s, limit) });
    cursor = Math.max(cursor, e);
  }
  if (limit - cursor >= minMinutes) slots.push({ start: cursor, end: limit });
  return slots.filter((s) => s.end - s.start >= minMinutes);
}

export const toClock = (mins: number) => `${String(Math.floor(mins / 60)).padStart(2, "0")}:${String(mins % 60).padStart(2, "0")}`;
