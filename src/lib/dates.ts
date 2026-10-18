import {
  addDays, differenceInMinutes, endOfDay, format, formatDistanceToNowStrict, isSameDay, isToday, isTomorrow,
  isYesterday, parseISO, startOfDay, startOfWeek,
} from "date-fns";

export type WeekStart = 0 | 1;

export const toIso = (d: Date) => d.toISOString();
export const fromIso = (s: string) => parseISO(s);

/** Local "yyyy-MM-dd" key used for grouping by calendar day. */
export const dayKey = (d: Date) => format(d, "yyyy-MM-dd");
export const weekStartKey = (d: Date, weekStartsOn: WeekStart) => dayKey(startOfWeek(d, { weekStartsOn }));

export const dayRange = (d: Date) => ({ from: startOfDay(d), to: endOfDay(d) });

/** Combine `<input type=date>` + `<input type=time>` values into an ISO instant (local time). */
export function combineDateTime(date: string, time: string | undefined): string {
  const [y, m, d] = date.split("-").map(Number);
  const [hh, mm] = (time || "23:59").split(":").map(Number);
  return new Date(y, m - 1, d, hh, mm, 0, 0).toISOString();
}

export function splitDateTime(iso: string | null | undefined): { date: string; time: string } {
  if (!iso) return { date: "", time: "" };
  const d = parseISO(iso);
  return { date: format(d, "yyyy-MM-dd"), time: format(d, "HH:mm") };
}

export function friendlyDay(d: Date): string {
  if (isToday(d)) return "Today";
  if (isTomorrow(d)) return "Tomorrow";
  if (isYesterday(d)) return "Yesterday";
  return format(d, "EEE, MMM d");
}

export function friendlyDateTime(iso: string): string {
  const d = parseISO(iso);
  return `${friendlyDay(d)}, ${format(d, "h:mm a")}`;
}

/** "in 3 days", "2 hours overdue", "due now". */
export function countdown(iso: string, now = new Date()): { label: string; overdue: boolean; urgent: boolean } {
  const target = parseISO(iso);
  const mins = differenceInMinutes(target, now);
  if (Math.abs(mins) < 1) return { label: "due now", overdue: false, urgent: true };
  const dist = formatDistanceToNowStrict(target, { roundingMethod: "floor" });
  if (mins < 0) return { label: `${dist} overdue`, overdue: true, urgent: true };
  return { label: `in ${dist}`, overdue: false, urgent: mins <= 24 * 60 };
}

/** "HH:mm" -> "9:30 AM" */
export function formatClock(hhmm: string): string {
  const [h, m] = hhmm.split(":").map(Number);
  return format(new Date(2000, 0, 1, h, m), "h:mm a");
}

export const minutesOfDay = (hhmm: string) => {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
};

export function weekdayNames(weekStartsOn: WeekStart, style: "short" | "long" = "short") {
  const base = startOfWeek(new Date(2024, 0, 10), { weekStartsOn });
  return Array.from({ length: 7 }, (_, i) => {
    const d = addDays(base, i);
    return { weekday: d.getDay(), label: format(d, style === "short" ? "EEE" : "EEEE") };
  });
}

export const WEEKDAY_LONG = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

export function formatMinutes(total: number): string {
  const m = Math.round(total);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  const r = m % 60;
  return r ? `${h}h ${r}m` : `${h}h`;
}

export { isSameDay };
