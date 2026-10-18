/**
 * iCalendar (.ics, RFC 5545) export with alarms. Adding this file to the
 * iPhone/Android Calendar app gives OS-level reminders that fire even when
 * Flowed is closed — the offline alternative to push notifications for the
 * Home Screen web app.
 */
import { addMinutes, addWeeks, format, parseISO, startOfDay } from "date-fns";
import type { ClassSchedule, Exam, PersonalEvent, Subject, Task, UserSettings } from "./db/schema";

const esc = (s: string) => s.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");
const utc = (d: Date) => d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
const local = (d: Date) => format(d, "yyyyMMdd'T'HHmmss"); // floating local time

/** Lines must be folded at 75 octets (we fold by characters, conservatively at 60). */
function fold(line: string): string {
  const parts: string[] = [];
  for (let i = 0; i < line.length; i += 60) parts.push((i ? " " : "") + line.slice(i, i + 60));
  return parts.join("\r\n");
}

function alarm(minutesBefore: number, text: string): string[] {
  return ["BEGIN:VALARM", "ACTION:DISPLAY", `DESCRIPTION:${esc(text)}`, `TRIGGER:-PT${Math.max(0, Math.round(minutesBefore))}M`, "END:VALARM"];
}

export function buildIcs(
  data: { tasks: Task[]; exams: Exam[]; schedules: ClassSchedule[]; subjects: Subject[]; events?: PersonalEvent[] },
  settings: Pick<UserSettings, "taskReminderMinutes" | "examReminderMinutes" | "classReminderMinutes">,
  opts: { includeClasses: boolean; includeTasks: boolean; includeExams: boolean; includeEvents?: boolean; weeks: number },
  now = new Date(),
): { ics: string; count: number } {
  const subj = new Map(data.subjects.map((s) => [s.id, s]));
  const stamp = utc(now);
  const lines = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Flowed//Student Planner//EN", "CALSCALE:GREGORIAN", "METHOD:PUBLISH", "X-WR-CALNAME:Flowed"];
  let count = 0;
  const event = (uid: string, fields: string[], alarms: string[][]) => {
    lines.push("BEGIN:VEVENT", `UID:${uid}@flowed.local`, `DTSTAMP:${stamp}`, ...fields, ...alarms.flat(), "END:VEVENT");
    count++;
  };

  if (opts.includeTasks)
    for (const t of data.tasks) {
      if (t.completed || !t.dueAt || parseISO(t.dueAt) < now) continue;
      const due = parseISO(t.dueAt);
      const s = t.subjectId ? subj.get(t.subjectId) : undefined;
      event(`task-${t.id}`, [
        `DTSTART:${utc(addMinutes(due, -15))}`, `DTEND:${utc(due)}`,
        `SUMMARY:${esc(`Due: ${t.title}`)}`,
        `DESCRIPTION:${esc([s?.name, `Priority: ${t.priority}`, t.description].filter(Boolean).join("\n"))}`,
        `CATEGORIES:${esc(t.category)}`,
      ], [alarm(settings.taskReminderMinutes, `Due soon: ${t.title}`)]);
    }

  if (opts.includeExams)
    for (const e of data.exams) {
      if (e.completed || parseISO(e.examAt) < now) continue;
      const at = parseISO(e.examAt);
      const s = e.subjectId ? subj.get(e.subjectId) : undefined;
      const alarms = [alarm(settings.examReminderMinutes, `Exam: ${e.title}`)];
      if (settings.examReminderMinutes !== 60) alarms.push(alarm(60, `Exam in 1 hour: ${e.title}`));
      event(`exam-${e.id}`, [
        `DTSTART:${utc(at)}`, `DTEND:${utc(addMinutes(at, e.durationMinutes))}`,
        `SUMMARY:${esc(`Exam: ${e.title}`)}`,
        ...(e.venue ? [`LOCATION:${esc(e.venue)}`] : []),
        `DESCRIPTION:${esc([s?.name, e.notes].filter(Boolean).join("\n"))}`,
      ], alarms);
    }

  if (opts.includeEvents)
    for (const ev of data.events ?? []) {
      if (parseISO(ev.endAt) < now) continue;
      const s = parseISO(ev.startAt), e = parseISO(ev.endAt);
      // All-day events use DATE values (end is exclusive per RFC 5545).
      const when = ev.allDay
        ? [`DTSTART;VALUE=DATE:${format(s, "yyyyMMdd")}`, `DTEND;VALUE=DATE:${format(addMinutes(startOfDay(e), 24 * 60), "yyyyMMdd")}`]
        : [`DTSTART:${utc(s)}`, `DTEND:${utc(e)}`];
      event(`event-${ev.id}`, [
        ...when, `SUMMARY:${esc(ev.title)}`,
        ...(ev.location ? [`LOCATION:${esc(ev.location)}`] : []),
        ...(ev.description ? [`DESCRIPTION:${esc(ev.description)}`] : []),
      ], !ev.allDay && settings.classReminderMinutes > 0 ? [alarm(settings.classReminderMinutes, `Soon: ${ev.title}`)] : []);
    }

  if (opts.includeClasses)
    for (const c of data.schedules) {
      const s = subj.get(c.subjectId);
      const first = startOfDay(now);
      first.setDate(first.getDate() + ((c.weekday - first.getDay() + 7) % 7));
      const [sh, sm] = c.startTime.split(":").map(Number);
      const [eh, em] = c.endTime.split(":").map(Number);
      const start = new Date(first); start.setHours(sh, sm, 0, 0);
      const end = new Date(first); end.setHours(eh, em, 0, 0);
      const until = addWeeks(start, opts.weeks);
      event(`class-${c.id}`, [
        `DTSTART:${local(start)}`, `DTEND:${local(end)}`,
        `RRULE:FREQ=WEEKLY;UNTIL=${utc(until)}`,
        `SUMMARY:${esc(s?.code ? `${s.code} · ${s.name}` : s?.name ?? "Class")}`,
        ...(c.room ? [`LOCATION:${esc(c.room)}`] : []),
        ...(c.instructor || s?.instructor ? [`DESCRIPTION:${esc(c.instructor || s!.instructor)}`] : []),
      ], settings.classReminderMinutes > 0 ? [alarm(settings.classReminderMinutes, `Class soon: ${s?.name ?? "Class"}`)] : []);
    }

  lines.push("END:VCALENDAR");
  return { ics: lines.map(fold).join("\r\n") + "\r\n", count };
}
