import { describe, expect, it } from "vitest";
import { addDays, addHours, addMinutes, subHours } from "date-fns";
import { computeHeadsUp, freeSlots } from "@/lib/alerts";
import { buildIcs } from "@/lib/ics";
import type { ClassSchedule, Exam, Subject, Task } from "@/lib/db/schema";

const NOW = new Date(2026, 9, 14, 10, 0); // Wed 10:00
const ts = NOW.toISOString();
let n = 0;
const id = () => `00000000-0000-4000-8000-${String(++n).padStart(12, "0")}`;
const task = (p: Partial<Task>): Task => ({ id: id(), title: "t", description: "", subjectId: null, dueAt: null, priority: "medium", category: "assignment", completed: false, completedAt: null, createdAt: ts, updatedAt: ts, ...p });
const exam = (p: Partial<Exam>): Exam => ({ id: id(), title: "Midterm", subjectId: null, examAt: ts, durationMinutes: 60, venue: "Hall B", notes: "", checklist: [], completed: false, createdAt: ts, updatedAt: ts, ...p });
const subject: Subject = { id: id(), name: "Data Structures", code: "CS 201", instructor: "Prof. Reyes", color: "#4F46E5", notes: "", createdAt: ts, updatedAt: ts };
const cls = (p: Partial<ClassSchedule>): ClassSchedule => ({ id: id(), subjectId: subject.id, weekday: 3, startTime: "10:10", endTime: "11:30", room: "Lab 3", instructor: "", createdAt: ts, updatedAt: ts, ...p });
const settings = { taskReminderMinutes: 60, examReminderMinutes: 1440, classReminderMinutes: 15, heavyDayThreshold: 4 };

describe("heads-up engine", () => {
  it("orders overdue first and marks what should notify", () => {
    const alerts = computeHeadsUp({
      tasks: [
        task({ title: "Late", dueAt: subHours(NOW, 3).toISOString() }),
        task({ title: "Soon", dueAt: addMinutes(NOW, 45).toISOString() }),
        task({ title: "Tonight", dueAt: addHours(NOW, 10).toISOString() }),
        task({ title: "Next week", dueAt: addDays(NOW, 7).toISOString() }),
        task({ title: "Done", dueAt: addMinutes(NOW, 10).toISOString(), completed: true }),
      ],
      exams: [], schedules: [], subjects: [],
    }, settings, NOW);
    expect(alerts.map((a) => [a.kind, a.severity, a.notify])).toEqual([
      ["overdue", "critical", true],
      ["task-due", "warning", true],
      ["task-due", "info", false],
    ]);
    expect(alerts[1].title).toBe("Due in 45 min: Soon");
  });

  it("warns about classes about to start and exams within a day, with prep left", () => {
    const alerts = computeHeadsUp({
      tasks: [],
      exams: [exam({ examAt: addHours(NOW, 20).toISOString(), checklist: [{ id: id(), text: "Review", done: false }] })],
      schedules: [cls({}), cls({ weekday: 4 })],
      subjects: [subject],
    }, settings, NOW);
    const kinds = alerts.map((a) => a.kind);
    expect(kinds).toContain("class");
    expect(alerts.find((a) => a.kind === "class")?.title).toBe("Data Structures starts in 10 min");
    expect(alerts.find((a) => a.kind === "exam")).toMatchObject({ severity: "warning", notify: true });
    expect(alerts.find((a) => a.kind === "exam-prep")?.body).toBe("1 checklist item left");
  });

  it("ids are stable per occurrence so re-dating creates a fresh heads-up", () => {
    const t = task({ dueAt: addMinutes(NOW, 30).toISOString() });
    const a1 = computeHeadsUp({ tasks: [t], exams: [], schedules: [], subjects: [] }, settings, NOW)[0].id;
    const a2 = computeHeadsUp({ tasks: [t], exams: [], schedules: [], subjects: [] }, settings, addMinutes(NOW, 5))[0].id;
    const moved = computeHeadsUp({ tasks: [{ ...t, dueAt: addMinutes(NOW, 40).toISOString() }], exams: [], schedules: [], subjects: [] }, settings, NOW)[0].id;
    expect(a1).toBe(a2);
    expect(moved).not.toBe(a1);
  });

  it("finds free time between classes", () => {
    const slots = freeSlots([cls({ startTime: "08:00", endTime: "09:30" }), cls({ startTime: "13:00", endTime: "14:00" })], 3);
    expect(slots.map((s) => [s.start / 60, s.end / 60])).toEqual([[7, 8], [9.5, 13], [14, 21]]);
  });
});

describe("ics export", () => {
  it("emits valid events with alarms and weekly recurrence", () => {
    const { ics, count } = buildIcs(
      { tasks: [task({ title: "Essay, final", dueAt: addDays(NOW, 2).toISOString() })], exams: [exam({ examAt: addDays(NOW, 5).toISOString() })], schedules: [cls({})], subjects: [subject] },
      settings, { includeClasses: true, includeExams: true, includeTasks: true, weeks: 16 }, NOW,
    );
    expect(count).toBe(3);
    expect(ics.startsWith("BEGIN:VCALENDAR\r\n")).toBe(true);
    expect(ics).toContain("SUMMARY:Due: Essay\\, final");
    expect(ics).toContain("TRIGGER:-PT60M");
    expect(ics).toContain("RRULE:FREQ=WEEKLY;UNTIL=");
    expect(ics).toContain("DTSTART:20261014T101000"); // floating local class time, today (Wed)
    expect(ics.split("\r\n").every((l) => l.length <= 75)).toBe(true);
    expect((ics.match(/BEGIN:VEVENT/g) ?? []).length).toBe((ics.match(/END:VEVENT/g) ?? []).length);
  });
});

import { eventDayLabel, eventTimeLabel, pastEvents, upcomingEvents } from "@/lib/events";
import type { PersonalEvent } from "@/lib/db/schema";

const ev = (p: Partial<PersonalEvent>): PersonalEvent => ({
  id: id(), title: "Org meeting", description: "", location: "Room 5", startAt: ts, endAt: ts, allDay: false, createdAt: ts, updatedAt: ts, ...p,
});

describe("personal events", () => {
  it("lists upcoming (incl. in-progress) and past events in the right order", () => {
    const now = NOW;
    const later = ev({ title: "later", startAt: addDays(now, 3).toISOString(), endAt: addHours(addDays(now, 3), 1).toISOString() });
    const live = ev({ title: "live", startAt: subHours(now, 1).toISOString(), endAt: addHours(now, 1).toISOString() });
    const done = ev({ title: "done", startAt: subHours(now, 5).toISOString(), endAt: subHours(now, 4).toISOString() });
    const far = ev({ title: "far", startAt: addDays(now, 90).toISOString(), endAt: addDays(now, 90).toISOString() });
    expect(upcomingEvents([later, live, done, far], now, 30).map((e) => e.title)).toEqual(["live", "later"]);
    expect(pastEvents([later, live, done], now).map((e) => e.title)).toEqual(["done"]);
    expect(eventDayLabel(live, now)).toBe("Now");
    expect(eventDayLabel(later, now)).toBe("Saturday");
  });

  it("formats time ranges readably", () => {
    const d = (h: number, m = 0) => new Date(2026, 9, 20, h, m).toISOString();
    expect(eventTimeLabel(ev({ startAt: d(18), endAt: d(19, 30) }))).toBe("6:00 – 7:30 PM");
    expect(eventTimeLabel(ev({ startAt: d(11), endAt: d(13) }))).toBe("11:00 AM – 1:00 PM");
    expect(eventTimeLabel(ev({ allDay: true, startAt: d(0), endAt: d(23, 59) }))).toBe("All day");
  });

  it("gives a heads-up before an event and lists today's", () => {
    const soon = ev({ title: "Shift", startAt: addMinutes(NOW, 10).toISOString(), endAt: addHours(NOW, 3).toISOString() });
    const tonight = ev({ title: "Dinner", startAt: addHours(NOW, 8).toISOString(), endAt: addHours(NOW, 10).toISOString() });
    const a = computeHeadsUp({ tasks: [], exams: [], schedules: [], subjects: [], events: [soon, tonight] }, settings, NOW);
    expect(a.find((x) => x.title === "Shift starts in 10 min")).toMatchObject({ kind: "event", severity: "warning", notify: true });
    expect(a.find((x) => x.title === "Today: Dinner")).toMatchObject({ severity: "info", notify: false });
  });

  it("exports events to .ics, all-day ones as dates", () => {
    const allDay = ev({ title: "Foundation Day", allDay: true, startAt: new Date(2026, 9, 20).toISOString(), endAt: new Date(2026, 9, 20, 23, 59).toISOString() });
    const timed = ev({ title: "Org meeting", startAt: addDays(NOW, 1).toISOString(), endAt: addHours(addDays(NOW, 1), 1).toISOString() });
    const { ics, count } = buildIcs({ tasks: [], exams: [], schedules: [], subjects: [], events: [allDay, timed] }, settings,
      { includeClasses: false, includeExams: false, includeTasks: false, includeEvents: true, weeks: 1 }, NOW);
    expect(count).toBe(2);
    expect(ics).toContain("DTSTART;VALUE=DATE:20261020");
    expect(ics).toContain("DTEND;VALUE=DATE:20261021");
    expect(ics).toContain("LOCATION:Room 5");
    expect(ics).toContain("TRIGGER:-PT15M");
  });
});
