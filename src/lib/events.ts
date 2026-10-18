/** Helpers for personal events: what's coming up and how to describe its time. */
import { addDays, differenceInCalendarDays, format, isSameDay, parseISO, startOfDay } from "date-fns";
import type { PersonalEvent } from "./db/schema";

/** Events that haven't ended yet and start within `days` days, soonest first. */
export function upcomingEvents(events: PersonalEvent[], now = new Date(), days = 30): PersonalEvent[] {
  const limit = addDays(startOfDay(now), days + 1);
  return events
    .filter((e) => parseISO(e.endAt) >= now && parseISO(e.startAt) < limit)
    .sort((a, b) => a.startAt.localeCompare(b.startAt));
}

/** Events that already ended, most recent first. */
export function pastEvents(events: PersonalEvent[], now = new Date()): PersonalEvent[] {
  return events.filter((e) => parseISO(e.endAt) < now).sort((a, b) => b.startAt.localeCompare(a.startAt));
}

/** "All day", "6:00 – 7:30 PM", "9:00 AM – Oct 22, 5:00 PM", "Oct 20 – Oct 22". */
export function eventTimeLabel(e: PersonalEvent): string {
  const s = parseISO(e.startAt), end = parseISO(e.endAt);
  if (e.allDay) return isSameDay(s, end) ? "All day" : `${format(s, "MMM d")} – ${format(end, "MMM d")}`;
  if (isSameDay(s, end)) {
    const sameMeridiem = format(s, "a") === format(end, "a");
    return `${format(s, sameMeridiem ? "h:mm" : "h:mm a")} – ${format(end, "h:mm a")}`;
  }
  return `${format(s, "h:mm a")} – ${format(end, "MMM d, h:mm a")}`;
}

/** "Today", "Tomorrow", "Fri", "Oct 30" — relative label for the event's start day. */
export function eventDayLabel(e: PersonalEvent, now = new Date()): string {
  const s = parseISO(e.startAt);
  if (parseISO(e.startAt) <= now && parseISO(e.endAt) >= now) return "Now";
  const d = differenceInCalendarDays(s, now);
  return d === 0 ? "Today" : d === 1 ? "Tomorrow" : d < 7 ? format(s, "EEEE") : format(s, "EEE, MMM d");
}
