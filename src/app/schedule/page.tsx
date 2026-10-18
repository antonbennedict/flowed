"use client";

import { AlertTriangle, CalendarRange, Clock, Coffee, Plus, ScanLine } from "lucide-react";
import { useMemo, useState } from "react";
import { ImportScheduleDialog } from "@/components/schedule/import-schedule-dialog";
import { freeSlots, toClock } from "@/lib/alerts";
import { formatMinutes } from "@/lib/dates";
import { useEditors } from "@/components/editors/editors-provider";
import { useSettings } from "@/components/providers/settings-provider";
import { EmptyState, ErrorState, ListSkeleton, PageHeader } from "@/components/shared/primitives";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { usePlannerData } from "@/hooks/use-planner-data";
import { formatClock, minutesOfDay, weekdayNames, WEEKDAY_LONG } from "@/lib/dates";
import type { ClassSchedule } from "@/lib/db/schema";
import { findOverlaps } from "@/lib/insights";
import { cn } from "@/lib/utils";

const HOUR_PX = 56;

export default function SchedulePage() {
  const editors = useEditors();
  const settings = useSettings();
  const { data, error, loading, reload, subjectById } = usePlannerData();
  const days = weekdayNames(settings.weekStartsOn, "short");
  const [importOpen, setImportOpen] = useState(false);
  const [day, setDay] = useState(() => new Date().getDay());
  const today = new Date().getDay();

  const info = useMemo(() => {
    if (!data) return null;
    const schedules = data.schedules;
    const overlapping = new Set(schedules.filter((c) => findOverlaps(schedules, c, c.id).length > 0).map((c) => c.id));
    const startHour = Math.min(8, ...schedules.map((c) => Math.floor(minutesOfDay(c.startTime) / 60)));
    const endHour = Math.max(17, ...schedules.map((c) => Math.ceil(minutesOfDay(c.endTime) / 60)));
    // Next upcoming class from "now", wrapping around the week.
    const now = new Date();
    const nowKey = now.getDay() * 1440 + now.getHours() * 60 + now.getMinutes();
    const ranked = schedules
      .map((c) => {
        const start = c.weekday * 1440 + minutesOfDay(c.startTime);
        const end = c.weekday * 1440 + minutesOfDay(c.endTime);
        const live = nowKey >= start && nowKey < end;
        return { c, live, wait: live ? 0 : (start - nowKey + 7 * 1440) % (7 * 1440) };
      })
      .sort((a, b) => a.wait - b.wait);
    // Side-by-side lanes for overlapping classes on the same day (greedy interval colouring).
    const lanes = new Map<string, { lane: number; of: number }>();
    for (let wd = 0; wd < 7; wd++) {
      const day = schedules.filter((c) => c.weekday === wd).sort((x, y) => x.startTime.localeCompare(y.startTime));
      let cluster: { c: ClassSchedule; lane: number }[] = [];
      let clusterEnd = -1;
      const flush = () => {
        const of = Math.max(1, ...cluster.map((x) => x.lane + 1));
        cluster.forEach((x) => lanes.set(x.c.id, { lane: x.lane, of }));
        cluster = [];
      };
      for (const c of day) {
        const st = minutesOfDay(c.startTime);
        if (st >= clusterEnd) { flush(); clusterEnd = -1; }
        const used = new Set(cluster.filter((x) => minutesOfDay(x.c.endTime) > st).map((x) => x.lane));
        let lane = 0;
        while (used.has(lane)) lane++;
        cluster.push({ c, lane });
        clusterEnd = Math.max(clusterEnd, minutesOfDay(c.endTime));
      }
      flush();
    }
    return { overlapping, startHour, endHour, next: ranked[0], lanes };
  }, [data]);

  const block = (c: ClassSchedule, grid: boolean) => {
    const s = subjectById.get(c.subjectId);
    const top = ((minutesOfDay(c.startTime) - (info?.startHour ?? 8) * 60) / 60) * HOUR_PX;
    const height = ((minutesOfDay(c.endTime) - minutesOfDay(c.startTime)) / 60) * HOUR_PX;
    const overlap = info?.overlapping.has(c.id);
    return (
      <button
        key={c.id} type="button" onClick={() => editors.openClass(c)}
        className={cn(
          "overflow-hidden rounded-lg border-l-4 bg-card px-2 py-1.5 text-left text-xs shadow-card ring-1 ring-border transition-colors outline-none hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50",
          grid ? "absolute" : "flex w-full items-center gap-3 py-2.5 text-sm",
          overlap && "ring-warning/60",
        )}
        style={{
          borderLeftColor: s?.color,
          ...(grid ? (() => {
            const l = info?.lanes.get(c.id) ?? { lane: 0, of: 1 };
            return { top, height: Math.max(height, 28), left: `calc(${(l.lane / l.of) * 100}% + 4px)`, width: `calc(${100 / l.of}% - 8px)` };
          })() : {}),
        }}
        aria-label={`${s?.name ?? "Class"}, ${WEEKDAY_LONG[c.weekday]} ${formatClock(c.startTime)} to ${formatClock(c.endTime)}${overlap ? ", overlaps another class" : ""}`}
      >
        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-1 font-semibold">
            {overlap && <AlertTriangle className="size-3 shrink-0 text-warning" aria-hidden />}
            <span className="truncate">{s?.code || s?.name}</span>
          </span>
          <span className="block truncate text-muted-foreground tabular">{formatClock(c.startTime)}–{formatClock(c.endTime)}</span>
          {c.room && <span className="block truncate text-muted-foreground">{c.room}</span>}
        </span>
      </button>
    );
  };

  return (
    <div className="animate-rise">
      <PageHeader title="Class schedule" description="Your recurring weekly timetable."
        actions={<>
          <Button variant="outline" onClick={() => setImportOpen(true)} aria-label="Import schedule from a photo or text"><ScanLine /> <span className="hidden sm:inline">Import</span></Button>
          <Button onClick={() => editors.openClass(undefined, { weekday: day })} aria-label="Add class"><Plus /> <span className="hidden sm:inline">Add class</span><span className="sm:hidden">Add</span></Button>
        </>} />
      <ImportScheduleDialog open={importOpen} onOpenChange={setImportOpen} />
      {error && <ErrorState message={error} onRetry={reload} />}
      {loading && !data && <ListSkeleton rows={4} />}
      {data && data.schedules.length === 0 && (
        <EmptyState icon={CalendarRange} title="No classes yet"
          description={data.subjects.length ? "Add your weekly class times." : "Create a subject first, then add its class times."}
          action={
            <div className="flex flex-wrap justify-center gap-2">
              <Button onClick={() => setImportOpen(true)}><ScanLine /> Import from photo</Button>
              {data.subjects.length ? <Button variant="outline" onClick={() => editors.openClass()}><Plus /> Add manually</Button>
                : <Button variant="outline" onClick={() => editors.openSubject()}><Plus /> Add subject</Button>}
            </div>
          } />
      )}
      {data && info && data.schedules.length > 0 && (
        <div className="space-y-4">
          {info.next && (
            <div className="flex items-center gap-3 rounded-2xl border bg-secondary/50 p-4">
              <Clock className="size-5 text-primary" aria-hidden />
              <p className="text-sm">
                <span className="font-semibold">{info.next.live ? "Happening now: " : "Next class: "}</span>
                {subjectById.get(info.next.c.subjectId)?.name} · {WEEKDAY_LONG[info.next.c.weekday]} {formatClock(info.next.c.startTime)}
                {info.next.c.room ? ` · ${info.next.c.room}` : ""}
              </p>
            </div>
          )}
          {info.overlapping.size > 0 && (
            <Alert className="border-warning/40 bg-warning/10">
              <AlertTriangle className="text-warning" />
              <AlertTitle>{info.overlapping.size} classes overlap</AlertTitle>
              <AlertDescription>Overlapping slots are marked with a warning icon. Tap one to adjust its time.</AlertDescription>
            </Alert>
          )}

          {/* Desktop: time grid */}
          <div className="hidden overflow-x-auto rounded-2xl border bg-card p-3 shadow-card lg:block">
            <div className="grid min-w-[620px] grid-cols-[3rem_repeat(7,1fr)]">
              <div />
              {days.map((d) => (
                <div key={d.weekday} className={cn("pb-2 text-center text-xs font-semibold", d.weekday === new Date().getDay() ? "text-primary" : "text-muted-foreground")}>{d.label}</div>
              ))}
              <div className="relative" style={{ height: (info.endHour - info.startHour) * HOUR_PX }}>
                {Array.from({ length: info.endHour - info.startHour }, (_, i) => (
                  <span key={i} className="absolute right-2 -translate-y-1/2 text-2xs text-muted-foreground tabular" style={{ top: i * HOUR_PX }}>
                    {formatClock(`${String(info.startHour + i).padStart(2, "0")}:00`).replace(":00", "")}
                  </span>
                ))}
              </div>
              {days.map((d) => (
                <div key={d.weekday} className="relative border-l" style={{ height: (info.endHour - info.startHour) * HOUR_PX }}>
                  {Array.from({ length: info.endHour - info.startHour }, (_, i) => (
                    <div key={i} className="absolute inset-x-0 border-t border-dashed border-border/70" style={{ top: i * HOUR_PX }} aria-hidden />
                  ))}
                  {data.schedules.filter((c) => c.weekday === d.weekday).map((c) => block(c, true))}
                </div>
              ))}
            </div>
          </div>

          {/* Day picker: phones show one day at a time; free time is shown for every size. */}
          <div role="tablist" aria-label="Day" className="grid grid-cols-7 gap-1 rounded-2xl bg-muted p-1 lg:hidden">
            {days.map((d) => {
              const count = data.schedules.filter((c) => c.weekday === d.weekday).length;
              return (
                <button key={d.weekday} type="button" role="tab" aria-selected={day === d.weekday} onClick={() => setDay(d.weekday)}
                  aria-label={`${WEEKDAY_LONG[d.weekday]}${d.weekday === today ? ", today" : ""}, ${count} class${count === 1 ? "" : "es"}`}
                  className={cn("flex min-h-12 flex-col items-center justify-center rounded-xl text-xs font-semibold text-muted-foreground transition-colors aria-selected:bg-card aria-selected:text-foreground aria-selected:shadow-sm",
                    d.weekday === today && "text-primary")}>
                  {d.label.slice(0, 3)}
                  <span aria-hidden className={cn("mt-1 size-1.5 rounded-full", count ? "bg-primary" : "bg-transparent")} />
                </button>
              );
            })}
          </div>

          <div className="grid gap-4">
            <section className="lg:hidden" aria-label={`${WEEKDAY_LONG[day]} classes`}>
              {(() => {
                const list = data.schedules.filter((c) => c.weekday === day);
                return list.length ? <div className="space-y-2">{list.map((c) => block(c, false))}</div>
                  : <EmptyState compact icon={Coffee} title={`No classes on ${WEEKDAY_LONG[day]}`} action={<Button size="sm" variant="outline" onClick={() => editors.openClass(undefined, { weekday: day })}><Plus /> Add class</Button>} />;
              })()}
            </section>
            <section className="rounded-2xl border bg-card p-4 shadow-card" aria-labelledby="free-time">
              <h2 id="free-time" className="mb-1 flex items-center gap-2 text-sm font-semibold"><Coffee className="size-4 text-primary" aria-hidden /> Free time · {WEEKDAY_LONG[day]}</h2>
              <p className="mb-3 text-xs text-muted-foreground">Gaps of 30+ minutes between 7 AM and 9 PM. Good for study blocks.</p>
              <ul className="space-y-1.5">
                {freeSlots(data.schedules, day).map((f) => (
                  <li key={f.start} className="flex items-center justify-between rounded-xl bg-success/10 px-3 py-2 text-sm">
                    <span className="font-medium tabular">{formatClock(toClock(f.start))} – {formatClock(toClock(f.end))}</span>
                    <span className="text-xs text-muted-foreground tabular">{formatMinutes(f.end - f.start)}</span>
                  </li>
                ))}
              </ul>
              <div className="mt-3 hidden flex-wrap gap-1 lg:flex" role="group" aria-label="Choose day for free time">
                {days.map((d) => (
                  <Button key={d.weekday} size="sm" variant={day === d.weekday ? "default" : "ghost"} aria-pressed={day === d.weekday} onClick={() => setDay(d.weekday)}>{d.label}</Button>
                ))}
              </div>
            </section>
          </div>
        </div>
      )}
    </div>
  );
}
