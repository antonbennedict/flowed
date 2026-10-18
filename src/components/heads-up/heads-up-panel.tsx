"use client";

import { format, isAfter, parseISO } from "date-fns";
import {
  AlarmClock, AlertTriangle, Bell, BellRing, BookOpen, CalendarClock, CheckCircle2, ClipboardList, Flame, GraduationCap, X,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { reportError } from "@/components/editors/common";
import { useEditors } from "@/components/editors/editors-provider";
import { useDb } from "@/components/providers/db-provider";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { usePlannerData } from "@/hooks/use-planner-data";
import type { AlertKind, HeadsUp } from "@/lib/alerts";
import { isDueToday } from "@/lib/insights";
import { getNotificationStatus, requestNotificationPermission, type NotificationStatus } from "@/lib/notifications";
import { cn } from "@/lib/utils";
import { useHeadsUp } from "./heads-up-provider";

const ICON: Record<AlertKind, LucideIcon> = {
  overdue: AlertTriangle, "task-due": AlarmClock, class: CalendarClock, exam: GraduationCap, "heavy-day": Flame, "exam-prep": ClipboardList,
};
const TONE = {
  critical: "bg-destructive/12 text-destructive",
  warning: "bg-warning/15 text-warning",
  info: "bg-secondary text-secondary-foreground",
};

/** Bell button with an accessible count. */
export function HeadsUpBell({ className }: { className?: string }) {
  const { attention, setPanelOpen } = useHeadsUp();
  return (
    <Button variant="ghost" size="icon" onClick={() => setPanelOpen(true)} className={cn("relative rounded-full", className)}
      aria-label={attention ? `Heads-up: ${attention} need${attention === 1 ? "s" : ""} attention` : "Heads-up: all caught up"}>
      {attention ? <BellRing /> : <Bell />}
      {attention > 0 && (
        <span aria-hidden className="absolute top-1 right-1 flex min-w-4.5 items-center justify-center rounded-full bg-destructive px-1 text-2xs font-bold text-white tabular ring-2 ring-background dark:text-background">
          {attention > 9 ? "9+" : attention}
        </span>
      )}
    </Button>
  );
}

function AlertItem({ a }: { a: HeadsUp }) {
  const db = useDb();
  const editors = useEditors();
  const { dismiss, snooze, setPanelOpen } = useHeadsUp();
  const Icon = ICON[a.kind];
  const open = () => {
    setPanelOpen(false);
    if (a.ref?.type === "task") editors.openTask(a.ref.task);
    else if (a.ref?.type === "exam") editors.openExam(a.ref.exam);
    else if (a.ref?.type === "class") editors.openClass(a.ref.schedule);
  };
  return (
    <li className="rounded-2xl border bg-card p-3">
      <div className="flex gap-3">
        <span className={cn("flex size-9 shrink-0 items-center justify-center rounded-xl", TONE[a.severity])}><Icon className="size-4.5" aria-hidden /></span>
        <button type="button" onClick={open} disabled={!a.ref} className="min-w-0 flex-1 rounded-md text-left outline-none focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-default">
          <span className="block text-sm font-semibold text-pretty">{a.title}</span>
          {a.body && <span className="mt-0.5 block text-xs text-muted-foreground">{a.body}</span>}
        </button>
      </div>
      <div className="mt-2 flex flex-wrap justify-end gap-1.5">
        {a.ref?.type === "task" && (
          <Button size="sm" variant="secondary" onClick={() => {
            if (a.ref?.type === "task") db.tasks.setCompleted(a.ref.task.id, true).then(() => toast.success("Marked done")).catch(reportError);
          }}>
            <CheckCircle2 /> Done
          </Button>
        )}
        {a.severity !== "info" && <Button size="sm" variant="ghost" onClick={() => snooze(a.id, 60)}><AlarmClock /> 1 hour</Button>}
        <Button size="sm" variant="ghost" onClick={() => dismiss(a.id)} aria-label={`Dismiss: ${a.title}`}><X /> Dismiss</Button>
      </div>
    </li>
  );
}

export function HeadsUpPanel() {
  const { alerts, panelOpen, setPanelOpen } = useHeadsUp();
  const { data, subjectById } = usePlannerData();
  const [perm, setPerm] = useState<NotificationStatus>("prompt");
  useEffect(() => { if (panelOpen) getNotificationStatus().then(setPerm); }, [panelOpen]);

  const briefing = useMemo(() => {
    if (!data) return null;
    const now = new Date();
    const classes = data.schedules.filter((c) => c.weekday === now.getDay());
    const due = data.tasks.filter((t) => !t.completed && isDueToday(t, now));
    const nextExam = data.exams.find((e) => !e.completed && isAfter(parseISO(e.examAt), now));
    return { now, classes, due, nextExam };
  }, [data]);

  const urgent = alerts.filter((a) => a.severity !== "info");
  const later = alerts.filter((a) => a.severity === "info");

  return (
    <Sheet open={panelOpen} onOpenChange={setPanelOpen}>
      <SheetContent side="right" className="overflow-y-auto pb-safe data-[side=right]:w-full data-[side=right]:sm:max-w-md">
        <SheetHeader className="pt-safe">
          <SheetTitle className="flex items-center gap-2 text-lg"><BellRing className="size-5 text-primary" aria-hidden /> Heads-up</SheetTitle>
          <SheetDescription>What needs your attention, worked out on this device.</SheetDescription>
        </SheetHeader>
        <div className="space-y-5 px-4 pb-6">
          {briefing && (
            <section aria-label="Today's briefing" className="rounded-2xl bg-secondary/60 p-4">
              <p className="text-xs font-semibold tracking-wide text-secondary-foreground uppercase">{format(briefing.now, "EEEE, MMM d")}</p>
              <ul className="mt-2 space-y-1.5 text-sm">
                <li className="flex items-center gap-2"><BookOpen className="size-4 text-primary" aria-hidden />{briefing.classes.length ? `${briefing.classes.length} class${briefing.classes.length === 1 ? "" : "es"} today` : "No classes today"}</li>
                <li className="flex items-center gap-2"><AlarmClock className="size-4 text-primary" aria-hidden />{briefing.due.length ? `${briefing.due.length} task${briefing.due.length === 1 ? "" : "s"} due today` : "Nothing due today"}</li>
                {briefing.nextExam && (
                  <li className="flex items-center gap-2"><GraduationCap className="size-4 text-primary" aria-hidden />
                    Next exam: {briefing.nextExam.title}{briefing.nextExam.subjectId ? ` (${subjectById.get(briefing.nextExam.subjectId)?.code || subjectById.get(briefing.nextExam.subjectId)?.name})` : ""}, {format(parseISO(briefing.nextExam.examAt), "EEE MMM d")}
                  </li>
                )}
              </ul>
            </section>
          )}

          {perm === "prompt" && (
            <div className="flex items-start gap-3 rounded-2xl border p-3">
              <Bell className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden />
              <div className="flex-1 text-sm">
                <p className="font-medium">Get pop-up alerts</p>
                <p className="text-xs text-muted-foreground">Shows a notification when something is due while Flowed is open.</p>
                <Button size="sm" className="mt-2" onClick={() => requestNotificationPermission().then(setPerm)}>Allow notifications</Button>
              </div>
            </div>
          )}

          <section aria-labelledby="hu-now">
            <h3 id="hu-now" className="mb-2 text-sm font-semibold">Needs attention {urgent.length > 0 && <span className="text-muted-foreground">({urgent.length})</span>}</h3>
            {urgent.length ? <ul className="space-y-2">{urgent.map((a) => <AlertItem key={a.id} a={a} />)}</ul>
              : <p className="flex items-center gap-2 rounded-2xl border border-dashed p-4 text-sm text-muted-foreground"><CheckCircle2 className="size-4 text-success" aria-hidden /> You&apos;re all caught up.</p>}
          </section>
          {later.length > 0 && (
            <section aria-labelledby="hu-later">
              <h3 id="hu-later" className="mb-2 text-sm font-semibold">Coming up</h3>
              <ul className="space-y-2">{later.map((a) => <AlertItem key={a.id} a={a} />)}</ul>
            </section>
          )}
          <p className="text-xs text-muted-foreground">
            Want reminders even when Flowed is closed?{" "}
            <Link href="/settings/#calendar-sync" onClick={() => setPanelOpen(false)} className="font-medium text-primary underline-offset-2 hover:underline">Add them to your phone&apos;s Calendar</Link>.
          </p>
        </div>
      </SheetContent>
    </Sheet>
  );
}
