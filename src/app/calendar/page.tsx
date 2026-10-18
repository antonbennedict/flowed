"use client";

import {
  addDays, addMonths, addWeeks, eachDayOfInterval, endOfDay, endOfMonth, endOfWeek, format, isSameDay, isSameMonth,
  isToday, startOfDay, startOfMonth, startOfWeek, subDays, subMonths, subWeeks,
} from "date-fns";
import { BookOpen, CalendarDays, CheckSquare, ChevronLeft, ChevronRight, GraduationCap, Plus, Users, type LucideIcon } from "lucide-react";
import { useMemo, useState } from "react";
import { useEditors } from "@/components/editors/editors-provider";
import { useSettings } from "@/components/providers/settings-provider";
import { EmptyState, ErrorState, ListSkeleton, PageHeader } from "@/components/shared/primitives";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { usePlannerData } from "@/hooks/use-planner-data";
import { buildCalendar, itemsOnDay, KIND_LABEL, type CalendarItem, type CalendarKind } from "@/lib/calendar";
import { dayKey } from "@/lib/dates";
import { cn } from "@/lib/utils";

type Mode = "month" | "week" | "day";

const KIND_ICON: Record<CalendarKind, LucideIcon> = { class: BookOpen, task: CheckSquare, exam: GraduationCap, event: Users };
const KIND_BG: Record<CalendarKind, string> = {
  class: "bg-ev-class/12 text-ev-class", task: "bg-ev-task/12 text-ev-task", exam: "bg-ev-exam/12 text-ev-exam", event: "bg-ev-event/12 text-ev-event",
};
const KIND_DOT: Record<CalendarKind, string> = { class: "bg-ev-class", task: "bg-ev-task", exam: "bg-ev-exam", event: "bg-ev-event" };

function Chip({ i, onOpen, showTime = true }: { i: CalendarItem; onOpen: (i: CalendarItem) => void; showTime?: boolean }) {
  const Icon = KIND_ICON[i.kind];
  return (
    <button type="button" onClick={() => onOpen(i)}
      className={cn("flex w-full items-center gap-1.5 truncate rounded-md px-1.5 py-1 text-left text-2xs font-medium outline-none focus-visible:ring-2 focus-visible:ring-ring", KIND_BG[i.kind], i.done && "opacity-55 line-through")}
      aria-label={`${KIND_LABEL[i.kind]}: ${i.title}, ${i.allDay ? "all day" : format(i.start, "h:mm a")}`}>
      <Icon className="size-3 shrink-0" aria-hidden />
      {showTime && !i.allDay && <span className="hidden shrink-0 tabular opacity-80 2xl:inline">{format(i.start, "h:mma").toLowerCase()}</span>}
      <span className="truncate">{i.title}</span>
    </button>
  );
}

function Agenda({ day, items, onOpen, onAdd }: { day: Date; items: CalendarItem[]; onOpen: (i: CalendarItem) => void; onAdd: (d: Date) => void }) {
  const list = itemsOnDay(items, day);
  return (
    <section aria-label={`Agenda for ${format(day, "EEEE, MMMM d")}`} className="rounded-2xl border bg-card p-4 shadow-card">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-sm font-semibold">{isToday(day) ? "Today" : format(day, "EEEE, MMM d")}</h2>
        <Button size="sm" variant="ghost" onClick={() => onAdd(day)}><Plus /> Event</Button>
      </div>
      {list.length === 0 ? (
        <p className="py-4 text-center text-sm text-muted-foreground">Nothing scheduled.</p>
      ) : (
        <ul className="space-y-2">
          {list.map((i) => {
            const Icon = KIND_ICON[i.kind];
            return (
              <li key={i.key}>
                <button type="button" onClick={() => onOpen(i)} className="flex w-full items-center gap-3 rounded-xl border px-3 py-2.5 text-left transition-colors hover:bg-muted/60">
                  <span className="w-16 shrink-0 text-xs text-muted-foreground tabular">
                    {i.allDay ? "All day" : format(i.start, "h:mm a")}
                    {i.kind !== "task" && !i.allDay && <span className="block">{format(i.end, "h:mm a")}</span>}
                  </span>
                  <span className={cn("flex size-8 shrink-0 items-center justify-center rounded-lg", KIND_BG[i.kind])}><Icon className="size-4" aria-hidden /></span>
                  <span className="min-w-0 flex-1">
                    <span className={cn("block truncate text-sm font-medium", i.done && "text-muted-foreground line-through")}>{i.title}</span>
                    <span className="block truncate text-xs text-muted-foreground">{KIND_LABEL[i.kind]}{i.subtitle ? ` · ${i.subtitle}` : ""}</span>
                  </span>
                  {i.color && <span className="size-2.5 shrink-0 rounded-full" style={{ background: i.color }} aria-hidden />}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}


export default function CalendarPage() {
  const editors = useEditors();
  const settings = useSettings();
  const { data, error, loading, reload } = usePlannerData();
  const [mode, setMode] = useState<Mode>("month");
  const [cursor, setCursor] = useState(() => startOfDay(new Date()));
  const [selected, setSelected] = useState(() => startOfDay(new Date()));
  const ws = { weekStartsOn: settings.weekStartsOn };

  const range = useMemo(() => {
    if (mode === "month") return { from: startOfWeek(startOfMonth(cursor), ws), to: endOfWeek(endOfMonth(cursor), ws) };
    if (mode === "week") return { from: startOfWeek(cursor, ws), to: endOfWeek(cursor, ws) };
    return { from: startOfDay(cursor), to: endOfDay(cursor) };
  }, [mode, cursor, settings.weekStartsOn]); // eslint-disable-line react-hooks/exhaustive-deps

  const items = useMemo(() => (data ? buildCalendar(range.from, range.to, data) : []), [data, range]);
  const days = eachDayOfInterval({ start: range.from, end: range.to });

  const step = (dir: 1 | -1) => {
    const fn = mode === "month" ? (dir > 0 ? addMonths : subMonths) : mode === "week" ? (dir > 0 ? addWeeks : subWeeks) : dir > 0 ? addDays : subDays;
    const next = fn(cursor, 1);
    setCursor(next);
    setSelected(mode === "month" ? startOfMonth(next) : next);
  };
  const goToday = () => { const t = startOfDay(new Date()); setCursor(t); setSelected(t); };
  const title = mode === "month" ? format(cursor, "MMMM yyyy")
    : mode === "week" ? `${format(range.from, "MMM d")} – ${format(range.to, isSameMonth(range.from, range.to) ? "d, yyyy" : "MMM d, yyyy")}`
    : format(cursor, "EEEE, MMMM d");

  const open = (i: CalendarItem) => {
    if (i.ref.kind === "class") editors.openClass(i.ref.schedule);
    else if (i.ref.kind === "task") editors.openTask(i.ref.task);
    else if (i.ref.kind === "exam") editors.openExam(i.ref.exam);
    else editors.openEvent(i.ref.event);
  };
  const addOn = (d: Date) => {
    const start = new Date(d); start.setHours(18, 0, 0, 0);
    const end = new Date(d); end.setHours(19, 0, 0, 0);
    editors.openEvent(undefined, { startAt: start.toISOString(), endAt: end.toISOString() });
  };

  return (
    <div className="animate-rise">
      <PageHeader title="Calendar" description="Classes, deadlines, exams and personal events."
        actions={<Button onClick={() => addOn(selected)}><Plus /> New event</Button>} />

      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-1">
          <Button variant="outline" size="icon" onClick={() => step(-1)} aria-label={`Previous ${mode}`}><ChevronLeft /></Button>
          <Button variant="outline" size="icon" onClick={() => step(1)} aria-label={`Next ${mode}`}><ChevronRight /></Button>
          <Button variant="ghost" onClick={goToday}>Today</Button>
          <h2 className="ml-1 text-base font-semibold sm:text-lg" aria-live="polite">{title}</h2>
        </div>
        <Tabs value={mode} onValueChange={(v) => { setMode(v as Mode); setCursor(selected); }}>
          <TabsList>
            <TabsTrigger value="month" className="px-3">Month</TabsTrigger>
            <TabsTrigger value="week" className="px-3">Week</TabsTrigger>
            <TabsTrigger value="day" className="px-3">Day</TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      <ul className="mb-4 flex flex-wrap gap-3 text-xs text-muted-foreground" aria-label="Legend">
        {(Object.keys(KIND_LABEL) as CalendarKind[]).map((k) => {
          const Icon = KIND_ICON[k];
          return <li key={k} className="inline-flex items-center gap-1.5"><span className={cn("flex size-5 items-center justify-center rounded", KIND_BG[k])}><Icon className="size-3" aria-hidden /></span>{KIND_LABEL[k]}</li>;
        })}
      </ul>

      {error && <ErrorState message={error} onRetry={reload} />}
      {loading && !data && <ListSkeleton rows={4} />}

      {data && mode === "month" && (
        <div className="grid gap-4 lg:grid-cols-[1fr_20rem]">
          <div className="overflow-hidden rounded-2xl border bg-card shadow-card">
            <div className="grid grid-cols-7 border-b">
              {days.slice(0, 7).map((d) => (
                <div key={d.toISOString()} className="py-2 text-center text-2xs font-semibold text-muted-foreground uppercase">{format(d, "EEEEE")}<span className="hidden sm:inline">{format(d, "EEE").slice(1)}</span></div>
              ))}
            </div>
            <div className="grid grid-cols-7" role="grid">
              {days.map((d) => {
                const list = itemsOnDay(items, d);
                const inMonth = isSameMonth(d, cursor);
                const sel = isSameDay(d, selected);
                return (
                  <div key={dayKey(d)} role="gridcell" aria-selected={sel}
                    className={cn("min-h-16 border-r border-b p-1 last:border-r-0 sm:min-h-28 [&:nth-child(7n)]:border-r-0", !inMonth && "bg-muted/40")}>
                    <button type="button" onClick={() => setSelected(d)} aria-label={`${format(d, "EEEE, MMMM d")}, ${list.length} item${list.length === 1 ? "" : "s"}`}
                      className={cn("mb-1 flex size-8 items-center justify-center rounded-full text-xs font-medium tabular transition-colors hover:bg-muted sm:size-7",
                        !inMonth && "text-muted-foreground/60", isToday(d) && "bg-primary text-primary-foreground hover:bg-primary/90", sel && !isToday(d) && "ring-2 ring-primary")}>
                      {format(d, "d")}
                    </button>
                    <div className="hidden space-y-0.5 sm:block">
                      {list.slice(0, 3).map((i) => <Chip key={i.key} i={i} onOpen={open} />)}
                      {list.length > 3 && (
                        <button type="button" onClick={() => setSelected(d)} className="px-1.5 text-2xs font-medium text-muted-foreground hover:text-foreground">+{list.length - 3} more</button>
                      )}
                    </div>
                    <div className="flex flex-wrap justify-center gap-0.5 sm:hidden" aria-hidden>
                      {[...new Set(list.map((i) => i.kind))].map((k) => <span key={k} className={cn("size-1.5 rounded-full", KIND_DOT[k])} />)}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
          <Agenda day={selected} items={items} onOpen={open} onAdd={addOn} />
        </div>
      )}

      {data && mode === "week" && (
        <div className="grid gap-3 md:grid-cols-7">
          {days.map((d) => {
            const list = itemsOnDay(items, d);
            return (
              <section key={dayKey(d)} className={cn("rounded-2xl border bg-card p-2.5 shadow-card md:min-h-64", isToday(d) && "border-primary/40")}>
                <button type="button" onClick={() => { setSelected(d); setCursor(d); setMode("day"); }}
                  className="mb-2 flex w-full items-baseline justify-between gap-1 rounded-md px-1 text-left hover:text-primary md:flex-col md:items-start">
                  <span className="text-xs font-semibold text-muted-foreground uppercase">{format(d, "EEE")}</span>
                  <span className={cn("text-lg font-bold tabular", isToday(d) && "text-primary")}>{format(d, "d")}</span>
                </button>
                <div className="space-y-1">
                  {list.map((i) => <Chip key={i.key} i={i} onOpen={open} />)}
                  {list.length === 0 && <p className="px-1 text-xs text-muted-foreground">—</p>}
                </div>
              </section>
            );
          })}
        </div>
      )}

      {data && mode === "day" && <Agenda day={cursor} items={items} onOpen={open} onAdd={addOn} />}

      {data && items.length === 0 && mode !== "day" && (
        <div className="mt-4">
          <EmptyState compact icon={CalendarDays} title="Nothing in this period" description="Classes, task deadlines, exams and events appear here automatically." />
        </div>
      )}
    </div>
  );
}
