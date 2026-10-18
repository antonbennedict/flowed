"use client";

import { format, isAfter, parseISO, startOfDay, subDays } from "date-fns";
import {
  AlertTriangle, BookOpen, CalendarClock, CalendarDays, CalendarRange, CheckCircle2, CheckSquare, Flame, GraduationCap,
  Lightbulb, Plus, Timer, TrendingUp,
} from "lucide-react";
import Link from "next/link";
import { useMemo } from "react";
import { SimpleBarChart } from "@/components/charts/bar-chart";
import { useEditors } from "@/components/editors/editors-provider";
import { useSettings } from "@/components/providers/settings-provider";
import { Countdown, EmptyState, ErrorState, ListSkeleton, SectionCard, StatTile, SubjectDot } from "@/components/shared/primitives";
import { TaskRow } from "@/components/tasks/task-row";
import { QuickAddBar } from "@/components/tasks/quick-add-bar";
import { HeadsUpBanner } from "@/components/heads-up/heads-up-banner";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { usePlannerData } from "@/hooks/use-planner-data";
import { formatClock, formatMinutes, friendlyDateTime, minutesOfDay } from "@/lib/dates";
import { dailyStats, filterByView, isDueToday, studyStreak, suggestPriorities, workloadByDay } from "@/lib/insights";
import { cn } from "@/lib/utils";

function greeting(d: Date) {
  const h = d.getHours();
  return h < 5 ? "Good night" : h < 12 ? "Good morning" : h < 18 ? "Good afternoon" : "Good evening";
}

export default function DashboardPage() {
  const settings = useSettings();
  const editors = useEditors();
  const { data, error, loading, reload, subjectById, subtasksByTask } = usePlannerData();
  const now = useMemo(() => new Date(), [data]); // eslint-disable-line react-hooks/exhaustive-deps

  const view = useMemo(() => {
    if (!data) return null;
    const dueToday = data.tasks.filter((t) => isDueToday(t, now));
    const doneToday = dueToday.filter((t) => t.completed).length;
    const overdue = filterByView(data.tasks, "overdue", now);
    const todaysClasses = data.schedules.filter((c) => c.weekday === now.getDay());
    const nowMin = now.getHours() * 60 + now.getMinutes();
    const upcomingExams = data.exams.filter((e) => !e.completed && isAfter(parseISO(e.examAt), now)).slice(0, 4);
    const today = startOfDay(now);
    const focusToday = data.focusSessions.filter((f) => parseISO(f.startedAt) >= today).reduce((a, f) => a + f.durationMinutes, 0);
    const week = dailyStats(data.tasks, data.focusSessions, subDays(today, 6), 7);
    const heavy = workloadByDay(data.tasks, data.exams, settings.heavyDayThreshold, 7, now).filter((d) => d.heavy);
    const suggestions = suggestPriorities(data.tasks, data.subtasks, now).slice(0, 3);
    const streak = studyStreak(data.focusSessions, data.tasks, now);
    return { dueToday, doneToday, overdue, todaysClasses, nowMin, upcomingExams, focusToday, week, heavy, suggestions, streak };
  }, [data, now, settings.heavyDayThreshold]);

  const name = settings.displayName.trim().split(" ")[0];

  return (
    <div className="animate-rise space-y-5">
      <header>
        <p className="text-sm text-muted-foreground">{format(now, "EEEE, MMMM d")}</p>
        <h1 className="text-2xl font-bold tracking-tight text-balance sm:text-3xl">
          {greeting(now)}{name ? `, ${name}` : ""}
        </h1>
        {view && view.streak.current > 0 && (
          <p className="mt-2 inline-flex items-center gap-1.5 rounded-full bg-warning/15 px-3 py-1 text-sm font-semibold text-warning">
            <Flame className="size-4" aria-hidden /> {view.streak.current}-day study streak
          </p>
        )}
      </header>

      <HeadsUpBanner />

      <QuickAddBar />
      <div className="grid grid-cols-4 gap-2" role="group" aria-label="Add something else">
        {([
          ["Exam", GraduationCap, () => editors.openExam()],
          ["Class", CalendarRange, () => editors.openClass()],
          ["Event", CalendarDays, () => editors.openEvent()],
        ] as const).map(([label, Icon, onClick]) => (
          <button key={label} type="button" onClick={onClick}
            className="flex min-h-16 flex-col items-center justify-center gap-1 rounded-2xl border bg-card text-xs font-medium shadow-card transition-colors outline-none hover:bg-muted active:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50">
            <Icon className="size-5 text-primary" aria-hidden /> {label}
          </button>
        ))}
        <Link href="/focus" className="flex min-h-16 flex-col items-center justify-center gap-1 rounded-2xl border bg-card text-xs font-medium shadow-card transition-colors outline-none hover:bg-muted active:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50">
          <Timer className="size-5 text-primary" aria-hidden /> Focus
        </Link>
      </div>

      {error && <ErrorState message={error} onRetry={reload} />}
      {loading && !view && <ListSkeleton rows={6} />}

      {view && data && (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <div className="rounded-2xl border bg-card p-4 shadow-card">
              <div className="flex items-center justify-between text-xs font-medium text-muted-foreground">
                Today&apos;s progress <CheckCircle2 className="size-4 text-success" aria-hidden />
              </div>
              <div className="mt-2 text-2xl font-bold tabular">
                {view.doneToday}<span className="text-base font-medium text-muted-foreground">/{view.dueToday.length}</span>
              </div>
              <Progress value={view.dueToday.length ? (view.doneToday / view.dueToday.length) * 100 : 0} className="mt-2" aria-label="Tasks due today completed" />
            </div>
            <StatTile label="Overdue" value={view.overdue.length} icon={view.overdue.length ? AlertTriangle : CheckCircle2} tone={view.overdue.length ? "destructive" : "success"}
              hint={view.overdue.length ? <Link href="/tasks?view=overdue" className="underline-offset-2 hover:underline">Open Catch-Up</Link> : "All caught up"} />
            <div className="rounded-2xl border bg-card p-4 shadow-card">
              <div className="flex items-center justify-between text-xs font-medium text-muted-foreground">
                Focus today <Timer className="size-4 text-primary" aria-hidden />
              </div>
              <div className="mt-2 text-2xl font-bold tabular">{formatMinutes(view.focusToday)}</div>
              {settings.dailyFocusGoalMinutes > 0 && (
                <>
                  <Progress value={Math.min(100, (view.focusToday / settings.dailyFocusGoalMinutes) * 100)} className="mt-2" aria-label="Daily focus goal" />
                  <p className="mt-1 text-xs text-muted-foreground">Goal {formatMinutes(settings.dailyFocusGoalMinutes)}</p>
                </>
              )}
            </div>
            <StatTile label="Completed this week" value={view.week.reduce((a, d) => a + d.completed, 0)} icon={TrendingUp} tone="accent"
              hint={`Best streak ${view.streak.longest} day${view.streak.longest === 1 ? "" : "s"}`} />
          </div>

          {view.heavy.length > 0 && (
            <Alert className="border-warning/40 bg-warning/10">
              <AlertTriangle className="text-warning" />
              <AlertTitle>Heavy workload ahead</AlertTitle>
              <AlertDescription>
                {view.heavy.map((d) => `${format(d.date, "EEE d")} (${d.tasks.length} task${d.tasks.length === 1 ? "" : "s"}${d.exams.length ? `, ${d.exams.length} exam${d.exams.length === 1 ? "" : "s"}` : ""})`).join(" · ")}.
                {" "}Consider starting earlier or moving lower-priority work.
              </AlertDescription>
            </Alert>
          )}

          <div className="grid gap-4 lg:grid-cols-3">
            <div className="space-y-4 lg:col-span-2">
              <SectionCard title="Due today" icon={CheckSquare} action={<Link href="/tasks" className="text-xs font-medium text-primary hover:underline">All tasks</Link>}>
                {view.dueToday.length === 0 ? (
                  <EmptyState compact icon={CheckSquare} title="Nothing due today" description="Enjoy the breathing room, or get ahead on upcoming work."
                    action={<Button size="sm" variant="outline" onClick={() => editors.openTask()}><Plus /> Add task</Button>} />
                ) : (
                  <ul className="space-y-2">
                    {view.dueToday.map((t) => <TaskRow key={t.id} task={t} compact subject={t.subjectId ? subjectById.get(t.subjectId) : undefined} subtasks={subtasksByTask.get(t.id)} />)}
                  </ul>
                )}
              </SectionCard>

              {view.overdue.length > 0 && (
                <SectionCard title={`Overdue (${view.overdue.length})`} icon={AlertTriangle}
                  action={<Link href="/tasks?view=overdue" className="text-xs font-medium text-primary hover:underline">Catch-Up mode</Link>}>
                  <ul className="space-y-2">
                    {view.overdue.slice(0, 4).map((t) => <TaskRow key={t.id} task={t} compact subject={t.subjectId ? subjectById.get(t.subjectId) : undefined} subtasks={subtasksByTask.get(t.id)} />)}
                  </ul>
                </SectionCard>
              )}

              <SectionCard title="Tasks completed · last 7 days" icon={TrendingUp}>
                <SimpleBarChart valueLabel="Tasks completed" data={view.week.map((d) => ({ label: format(d.date, "EEE"), value: d.completed }))} />
              </SectionCard>
            </div>

            <div className="space-y-4">
              <SectionCard title="Today's classes" icon={CalendarClock} action={<Link href="/schedule" className="text-xs font-medium text-primary hover:underline">Timetable</Link>}>
                {view.todaysClasses.length === 0 ? (
                  <EmptyState compact icon={CalendarRange} title="No classes today" />
                ) : (
                  <ul className="space-y-2">
                    {view.todaysClasses.map((c) => {
                      const s = subjectById.get(c.subjectId);
                      const live = view.nowMin >= minutesOfDay(c.startTime) && view.nowMin < minutesOfDay(c.endTime);
                      const past = view.nowMin >= minutesOfDay(c.endTime);
                      return (
                        <li key={c.id}>
                          <button type="button" onClick={() => editors.openClass(c)} className={cn("flex w-full items-center gap-3 rounded-xl border px-3 py-2.5 text-left transition-colors hover:bg-muted/60", past && "opacity-60")}>
                            <span className="h-9 w-1 rounded-full" style={{ background: s?.color }} aria-hidden />
                            <span className="min-w-0 flex-1">
                              <span className="block truncate text-sm font-medium">{s?.name}</span>
                              <span className="block text-xs text-muted-foreground tabular">
                                {formatClock(c.startTime)}–{formatClock(c.endTime)}{c.room ? ` · ${c.room}` : ""}
                              </span>
                            </span>
                            {live && <span className="rounded-full bg-success/15 px-2 py-0.5 text-2xs font-semibold text-success">Now</span>}
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </SectionCard>

              <SectionCard title="Upcoming exams" icon={GraduationCap} action={<Link href="/exams" className="text-xs font-medium text-primary hover:underline">All exams</Link>}>
                {view.upcomingExams.length === 0 ? (
                  <EmptyState compact icon={GraduationCap} title="No upcoming exams" />
                ) : (
                  <ul className="space-y-2">
                    {view.upcomingExams.map((e) => {
                      const s = e.subjectId ? subjectById.get(e.subjectId) : undefined;
                      const prep = e.checklist.length ? e.checklist.filter((c) => c.done).length / e.checklist.length : null;
                      return (
                        <li key={e.id}>
                          <button type="button" onClick={() => editors.openExam(e)} className="w-full rounded-xl border px-3 py-2.5 text-left transition-colors hover:bg-muted/60">
                            <span className="flex items-center gap-2 text-sm font-medium"><SubjectDot color={s?.color} /> <span className="truncate">{e.title}</span></span>
                            <span className="mt-1 flex items-center justify-between gap-2 text-xs text-muted-foreground">
                              <span className="truncate">{friendlyDateTime(e.examAt)}</span>
                              <Countdown iso={e.examAt} />
                            </span>
                            {prep !== null && <Progress value={prep * 100} className="mt-2" aria-label="Preparation progress" />}
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </SectionCard>

              <SectionCard title="Work on next" icon={Lightbulb}>
                {view.suggestions.length === 0 ? (
                  <EmptyState compact icon={BookOpen} title="No open tasks" />
                ) : (
                  <ol className="space-y-2">
                    {view.suggestions.map((sg, i) => (
                      <li key={sg.task.id}>
                        <button type="button" onClick={() => editors.openTask(sg.task)} className="flex w-full gap-3 rounded-xl px-1 py-1.5 text-left hover:bg-muted/60">
                          <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-secondary text-xs font-bold text-secondary-foreground">{i + 1}</span>
                          <span className="min-w-0">
                            <span className="block truncate text-sm font-medium">{sg.task.title}</span>
                            <span className="block text-xs text-muted-foreground">{sg.reasons.join(" · ") || "Keep momentum"}</span>
                          </span>
                        </button>
                      </li>
                    ))}
                  </ol>
                )}
              </SectionCard>
            </div>
          </div>
          {data.subjects.length === 0 && (
            <EmptyState icon={BookOpen} title="Set up your semester" description="Add your subjects and weekly classes to see them here."
              action={<Button onClick={() => editors.openSubject()}><Plus /> Add first subject</Button>} />
          )}
        </>
      )}
    </div>
  );
}
