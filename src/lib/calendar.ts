/** Expands stored records into dated calendar occurrences for a range. */
import { addDays, addMinutes, eachDayOfInterval, parseISO, startOfDay } from "date-fns";
import type { ClassSchedule, Exam, PersonalEvent, Subject, Task } from "./db/schema";

export type CalendarKind = "class" | "task" | "exam" | "event";

export interface CalendarItem {
  key: string;
  kind: CalendarKind;
  title: string;
  start: Date;
  end: Date;
  allDay: boolean;
  subtitle?: string;
  color?: string;
  done?: boolean;
  ref: { kind: "class"; schedule: ClassSchedule } | { kind: "task"; task: Task } | { kind: "exam"; exam: Exam } | { kind: "event"; event: PersonalEvent };
}

export const KIND_LABEL: Record<CalendarKind, string> = { class: "Class", task: "Task", exam: "Exam", event: "Event" };

export function buildCalendar(
  from: Date,
  to: Date,
  data: { schedules: ClassSchedule[]; tasks: Task[]; exams: Exam[]; events: PersonalEvent[]; subjects: Subject[] },
): CalendarItem[] {
  const subjects = new Map(data.subjects.map((s) => [s.id, s]));
  const items: CalendarItem[] = [];
  const inRange = (d: Date) => d >= from && d <= to;

  for (const day of eachDayOfInterval({ start: startOfDay(from), end: to })) {
    for (const c of data.schedules) {
      if (c.weekday !== day.getDay()) continue;
      const [sh, sm] = c.startTime.split(":").map(Number);
      const [eh, em] = c.endTime.split(":").map(Number);
      const start = new Date(day.getFullYear(), day.getMonth(), day.getDate(), sh, sm);
      const end = new Date(day.getFullYear(), day.getMonth(), day.getDate(), eh, em);
      const subj = subjects.get(c.subjectId);
      items.push({
        key: `class-${c.id}-${day.toDateString()}`,
        kind: "class",
        title: subj?.name ?? "Class",
        subtitle: [c.room, c.instructor || subj?.instructor].filter(Boolean).join(" · "),
        start, end, allDay: false, color: subj?.color,
        ref: { kind: "class", schedule: c },
      });
    }
  }
  for (const t of data.tasks) {
    if (!t.dueAt) continue;
    const start = parseISO(t.dueAt);
    if (!inRange(start)) continue;
    const subj = t.subjectId ? subjects.get(t.subjectId) : undefined;
    items.push({
      key: `task-${t.id}`, kind: "task", title: t.title, subtitle: subj?.name, start, end: start, allDay: false,
      color: subj?.color, done: t.completed, ref: { kind: "task", task: t },
    });
  }
  for (const e of data.exams) {
    const start = parseISO(e.examAt);
    if (!inRange(start)) continue;
    const subj = e.subjectId ? subjects.get(e.subjectId) : undefined;
    items.push({
      key: `exam-${e.id}`, kind: "exam", title: e.title, subtitle: [subj?.name, e.venue].filter(Boolean).join(" · "),
      start, end: addMinutes(start, e.durationMinutes), allDay: false, color: subj?.color, done: e.completed,
      ref: { kind: "exam", exam: e },
    });
  }
  for (const ev of data.events) {
    const start = parseISO(ev.startAt);
    const end = parseISO(ev.endAt);
    if (end < from || start > to) continue;
    items.push({
      key: `event-${ev.id}`, kind: "event", title: ev.title, subtitle: ev.location, start, end, allDay: ev.allDay,
      ref: { kind: "event", event: ev },
    });
  }
  return items.sort((a, b) => Number(b.allDay) - Number(a.allDay) || a.start.getTime() - b.start.getTime());
}

export function itemsOnDay(items: CalendarItem[], day: Date) {
  const s = startOfDay(day);
  const e = addDays(s, 1);
  return items.filter((i) => i.start < e && i.end >= s);
}
