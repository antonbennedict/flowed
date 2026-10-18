"use client";

import { format, parseISO } from "date-fns";
import { MapPin } from "lucide-react";
import { useEditors } from "@/components/editors/editors-provider";
import type { PersonalEvent } from "@/lib/db/schema";
import { eventDayLabel, eventTimeLabel } from "@/lib/events";
import { cn } from "@/lib/utils";

/** One personal event: date badge, title, time and place. Tap to view or edit. */
export function EventRow({ event, now = new Date(), past, compact }: { event: PersonalEvent; now?: Date; past?: boolean; compact?: boolean }) {
  const editors = useEditors();
  const start = parseISO(event.startAt);
  const day = eventDayLabel(event, now);
  const live = day === "Now";
  return (
    <button type="button" onClick={() => editors.openEvent(event)}
      aria-label={`${event.title}, ${past ? format(start, "EEEE, MMMM d") : day}, ${eventTimeLabel(event)}${event.location ? `, at ${event.location}` : ""}`}
      className={cn("flex w-full items-center gap-3 rounded-xl border bg-card px-3 text-left transition-colors outline-none hover:bg-muted/60 focus-visible:ring-3 focus-visible:ring-ring/50", compact ? "py-2" : "py-2.5", past && "opacity-70")}>
      <span aria-hidden className={cn("flex size-12 shrink-0 flex-col items-center justify-center rounded-xl", live ? "bg-ev-event text-white dark:text-background" : "bg-ev-event/12 text-ev-event")}>
        <span className="text-2xs leading-none font-semibold uppercase">{format(start, "MMM")}</span>
        <span className="text-lg leading-tight font-bold tabular">{format(start, "d")}</span>
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-2">
          <span className="truncate text-sm font-semibold">{event.title}</span>
          {!past && (day === "Today" || live) && (
            <span className={cn("shrink-0 rounded-full px-2 py-0.5 text-2xs font-semibold", live ? "bg-success/15 text-success" : "bg-ev-event/12 text-ev-event")}>{live ? "Now" : "Today"}</span>
          )}
        </span>
        <span className="mt-0.5 block truncate text-xs text-muted-foreground tabular">
          {!past && day !== "Today" && !live ? `${day} · ` : past ? `${format(start, "EEE, MMM d")} · ` : ""}{eventTimeLabel(event)}
        </span>
        {event.location && !compact && (
          <span className="mt-0.5 flex items-center gap-1 truncate text-xs text-muted-foreground"><MapPin className="size-3 shrink-0" aria-hidden />{event.location}</span>
        )}
      </span>
    </button>
  );
}
