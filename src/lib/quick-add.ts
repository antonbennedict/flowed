/**
 * Natural-language quick add, fully offline:
 *   "Lab report due fri 5pm #CS201 !high"
 *   "Quiz 3 tomorrow 8am #math"
 *   "Read chapter 4 in 3 days"
 *   "Essay oct 25 !!"
 *
 * Recognised: dates (today, tonight, tomorrow/tmr, weekday names, "next fri",
 * "in N days/weeks", "oct 25", "25 oct", "10/25"), times (5pm, 5:30pm, 17:00,
 * noon, midnight, "at 9"), #subject (code or name prefix), !low/!med/!high/
 * !urgent or !!/!!!, and category words (quiz, exam/midterm/final, project).
 */
import { addDays, addWeeks, setHours, setMinutes, startOfDay } from "date-fns";
import type { Category, Priority, Subject } from "./db/schema";
import { subjectKey } from "./schedule-import";

export interface QuickAddResult {
  title: string;
  dueAt: Date | null;
  hasTime: boolean;
  priority: Priority | null;
  category: Category | null;
  subject: Subject | null;
  /** Pieces recognised, for showing chips under the input. */
  recognised: { kind: "date" | "time" | "subject" | "priority" | "category"; text: string }[];
}

const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
const WEEKDAYS = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];
const WD = "(sun|mon|tue|tues|wed|thu|thur|thurs|fri|sat)(?:day|nesday|sday|urday)?";

export function parseQuickAdd(input: string, subjects: Subject[], now = new Date()): QuickAddResult {
  let text = ` ${input} `;
  const recognised: QuickAddResult["recognised"] = [];
  const take = (re: RegExp, kind: QuickAddResult["recognised"][number]["kind"]) => {
    const m = re.exec(text);
    if (!m) return null;
    text = text.replace(m[0], " ");
    recognised.push({ kind, text: m[0].trim() });
    return m;
  };

  // Priority
  let priority: Priority | null = null;
  const p = take(/\s(!{1,3}|!(?:low|med|medium|high|urgent|u|h|l|m))(?=\s)/i, "priority");
  if (p) {
    const v = p[1].toLowerCase();
    priority = v === "!" ? "medium" : v === "!!" ? "high" : v === "!!!" ? "urgent"
      : /^!(u|urgent)$/.test(v) ? "urgent" : /^!(h|high)$/.test(v) ? "high" : /^!(l|low)$/.test(v) ? "low" : "medium";
  }

  // Subject
  let subject: Subject | null = null;
  const s = /\s#([\w-]+)(?=\s)/.exec(text);
  if (s) {
    const key = subjectKey(s[1]);
    subject = subjects.find((x) => subjectKey(x.code) === key) ?? subjects.find((x) => subjectKey(x.name) === key)
      ?? subjects.find((x) => subjectKey(x.code).startsWith(key) || subjectKey(x.name).startsWith(key)) ?? null;
    if (subject) { text = text.replace(s[0], " "); recognised.push({ kind: "subject", text: subject.code || subject.name }); }
  }

  // Time
  let hours: number | null = null, minutes = 0;
  const t = take(/\s(?:at\s+)?(\d{1,2})(?::(\d{2}))?\s*(am|pm|a|p)(?=\s)/i, "time")
    ?? take(/\s(?:at\s+)?([01]?\d|2[0-3]):(\d{2})(?=\s)/i, "time")
    ?? take(/\sat\s+(\d{1,2})(?=\s)/i, "time");
  if (t) {
    hours = Number(t[1]); minutes = Number(t[2] ?? 0);
    const mer = t[3]?.toLowerCase();
    if (mer?.startsWith("p") && hours < 12) hours += 12;
    if (mer?.startsWith("a") && hours === 12) hours = 0;
    if (!mer && !t[2] && hours < 8) hours += 12; // "at 5" → 5 PM
  } else if (take(/\s(noon|midday)(?=\s)/i, "time")) hours = 12;
  else if (take(/\s(midnight|eod|end of day)(?=\s)/i, "time")) { hours = 23; minutes = 59; }

  // Date
  const today = startOfDay(now);
  let date: Date | null = null;
  let d: RegExpExecArray | null;
  if (take(/\s(today|tdy)(?=\s)/i, "date")) date = today;
  else if (take(/\s(tonight)(?=\s)/i, "date")) { date = today; if (hours === null) { hours = 21; } }
  else if (take(/\s(tomorrow|tmr|tmrw|tom)(?=\s)/i, "date")) date = addDays(today, 1);
  else if ((d = take(/\sin\s+(\d{1,2})\s+(day|days|week|weeks)(?=\s)/i, "date")))
    date = d[2].startsWith("week") ? addWeeks(today, Number(d[1])) : addDays(today, Number(d[1]));
  else if ((d = take(new RegExp(`\\s(next\\s+)?${WD}(?=\\s)`, "i"), "date"))) {
    const target = WEEKDAYS.indexOf(d[2].toLowerCase().slice(0, 3));
    // "fri" = the coming Friday (today if it is Friday); "next fri" = one week after that.
    const diff = (target - today.getDay() + 7) % 7;
    date = addDays(today, d[1] ? (diff === 0 ? 7 : diff + 7) : diff);
  } else if ((d = take(/\s(jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\.?\s+(\d{1,2})(?:st|nd|rd|th)?(?=\s)/i, "date"))
    || (d = take(/\s(\d{1,2})(?:st|nd|rd|th)?\s+(jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\.?(?=\s)/i, "date"))) {
    const monthTok = /\d/.test(d[1]) ? d[2] : d[1];
    const day = Number(/\d/.test(d[1]) ? d[1] : d[2]);
    let candidate = new Date(today.getFullYear(), MONTHS.indexOf(monthTok.toLowerCase().slice(0, 3)), day);
    if (candidate < today) candidate = new Date(today.getFullYear() + 1, candidate.getMonth(), day);
    date = candidate;
  } else if ((d = take(/\s(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?(?=\s)/, "date"))) {
    const y = d[3] ? (d[3].length === 2 ? 2000 + Number(d[3]) : Number(d[3])) : today.getFullYear();
    let candidate = new Date(y, Number(d[1]) - 1, Number(d[2]));
    if (!d[3] && candidate < today) candidate = new Date(y + 1, candidate.getMonth(), candidate.getDate());
    date = candidate;
  }
  if (!date && hours !== null) {
    date = today;
    if (setMinutes(setHours(today, hours), minutes) < now) date = addDays(today, 1); // time already passed → tomorrow
  }
  const dueAt = date ? setMinutes(setHours(date, hours ?? 23), hours === null ? 59 : minutes) : null;

  // Category from words (kept in the title)
  let category: Category | null = null;
  if (/\b(quiz|quizzes)\b/i.test(input)) category = "quiz";
  else if (/\b(exam|midterms?|finals?|prelims?)\b/i.test(input)) category = "exam";
  else if (/\b(project|capstone|thesis)\b/i.test(input)) category = "project";
  if (category) recognised.push({ kind: "category", text: category });

  const title = text
    .replace(/\s(due|by|on|at|deadline)(?=\s*$)/gi, " ")
    .replace(/\s(due|by|deadline)\s/gi, " ")
    .replace(/\s{2,}/g, " ")
    .trim();
  return { title, dueAt, hasTime: hours !== null, priority, category, subject, recognised };
}
