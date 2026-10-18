"use client";

import { parseISO } from "date-fns";
import { BookOpen, CalendarRange, CheckSquare, GraduationCap, Pencil, Plus, User } from "lucide-react";
import { useMemo, useState } from "react";
import { useEditors } from "@/components/editors/editors-provider";
import { Countdown, EmptyState, ErrorState, ListSkeleton, PageHeader } from "@/components/shared/primitives";
import { TaskRow } from "@/components/tasks/task-row";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { usePlannerData } from "@/hooks/use-planner-data";
import { formatClock, formatMinutes, friendlyDateTime, WEEKDAY_LONG } from "@/lib/dates";
import { subjectWorkload } from "@/lib/insights";

export default function SubjectsPage() {
  const editors = useEditors();
  const { data, error, loading, reload, subtasksByTask } = usePlannerData();
  const [openId, setOpenId] = useState<string | null>(null);

  const loads = useMemo(() => (data ? subjectWorkload(data.subjects, data.tasks, data.exams, data.focusSessions) : []), [data]);
  const selected = loads.find((l) => l.subject.id === openId);

  return (
    <div className="animate-rise">
      <PageHeader title="Subjects" description="Your courses this term, with linked tasks and exams."
        actions={<Button onClick={() => editors.openSubject()}><Plus /> New subject</Button>} />
      {error && <ErrorState message={error} onRetry={reload} />}
      {loading && !data && <ListSkeleton rows={4} />}
      {data && data.subjects.length === 0 && (
        <EmptyState icon={BookOpen} title="No subjects yet" description="Add a subject to colour-code classes, tasks and exams."
          action={<Button onClick={() => editors.openSubject()}><Plus /> Add subject</Button>} />
      )}
      {data && data.subjects.length > 0 && (
        <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {loads.map((l) => {
            const classes = data.schedules.filter((c) => c.subjectId === l.subject.id).length;
            return (
              <li key={l.subject.id}>
                <button type="button" onClick={() => setOpenId(l.subject.id)}
                  className="group relative block w-full overflow-hidden rounded-2xl border bg-card p-4 pl-5 text-left shadow-card transition-colors outline-none hover:border-primary/30 focus-visible:ring-3 focus-visible:ring-ring/50">
                  <span className="absolute inset-y-0 left-0 w-1.5" style={{ background: l.subject.color }} aria-hidden />
                  <span className="flex items-start justify-between gap-2">
                    <span className="min-w-0">
                      <span className="block truncate font-semibold">{l.subject.name}</span>
                      <span className="block truncate text-xs text-muted-foreground">
                        {[l.subject.code, l.subject.instructor].filter(Boolean).join(" · ") || "No code or instructor"}
                      </span>
                    </span>
                    <span className="text-sm font-semibold tabular">{l.progress === null ? "—" : `${Math.round(l.progress * 100)}%`}</span>
                  </span>
                  <Progress value={(l.progress ?? 0) * 100} className="mt-3" aria-label={`${l.subject.name} task progress`} />
                  <span className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                    <span className="inline-flex items-center gap-1"><CheckSquare className="size-3.5" aria-hidden /> {l.openTasks} open</span>
                    <span className="inline-flex items-center gap-1"><GraduationCap className="size-3.5" aria-hidden /> {l.upcomingExams} exam{l.upcomingExams === 1 ? "" : "s"}</span>
                    <span className="inline-flex items-center gap-1"><CalendarRange className="size-3.5" aria-hidden /> {classes}×/week</span>
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}

      <Sheet open={!!selected} onOpenChange={(o) => !o && setOpenId(null)}>
        <SheetContent className="w-full overflow-y-auto pb-safe sm:max-w-md">
          {selected && data && (
            <>
              <SheetHeader className="border-b pt-safe" style={{ borderTop: `4px solid ${selected.subject.color}` }}>
                <SheetTitle className="pr-8 text-lg">{selected.subject.name}</SheetTitle>
                <SheetDescription className="flex flex-wrap gap-x-3">
                  {selected.subject.code && <span>{selected.subject.code}</span>}
                  {selected.subject.instructor && <span className="inline-flex items-center gap-1"><User className="size-3.5" aria-hidden />{selected.subject.instructor}</span>}
                </SheetDescription>
                <Button variant="outline" size="sm" className="mt-2 w-fit" onClick={() => editors.openSubject(selected.subject)}><Pencil /> Edit subject</Button>
              </SheetHeader>
              <div className="space-y-6 px-4 pb-6">
                <div className="grid grid-cols-3 gap-2 text-center">
                  {[
                    ["Progress", selected.progress === null ? "—" : `${Math.round(selected.progress * 100)}%`],
                    ["Done", `${selected.completedTasks}/${selected.completedTasks + selected.openTasks}`],
                    ["Focus", formatMinutes(selected.focusMinutes)],
                  ].map(([k, v]) => (
                    <div key={k} className="rounded-xl bg-muted p-2.5">
                      <div className="text-base font-bold tabular">{v}</div>
                      <div className="text-2xs text-muted-foreground">{k}</div>
                    </div>
                  ))}
                </div>
                {selected.subject.notes && (
                  <section>
                    <h3 className="mb-1.5 text-sm font-semibold">Notes</h3>
                    <p className="text-sm whitespace-pre-wrap text-muted-foreground">{selected.subject.notes}</p>
                  </section>
                )}
                <section>
                  <div className="mb-2 flex items-center justify-between">
                    <h3 className="text-sm font-semibold">Weekly classes</h3>
                    <Button size="sm" variant="ghost" onClick={() => editors.openClass(undefined, { subjectId: selected.subject.id })}><Plus /> Add</Button>
                  </div>
                  <ul className="space-y-1.5">
                    {data.schedules.filter((c) => c.subjectId === selected.subject.id).map((c) => (
                      <li key={c.id}>
                        <button type="button" onClick={() => editors.openClass(c)} className="flex w-full justify-between rounded-lg border px-3 py-2 text-left text-sm hover:bg-muted/60">
                          <span>{WEEKDAY_LONG[c.weekday]}</span>
                          <span className="text-muted-foreground tabular">{formatClock(c.startTime)}–{formatClock(c.endTime)}{c.room ? ` · ${c.room}` : ""}</span>
                        </button>
                      </li>
                    ))}
                    {!data.schedules.some((c) => c.subjectId === selected.subject.id) && <li className="text-sm text-muted-foreground">No classes scheduled.</li>}
                  </ul>
                </section>
                <section>
                  <div className="mb-2 flex items-center justify-between">
                    <h3 className="text-sm font-semibold">Tasks</h3>
                    <Button size="sm" variant="ghost" onClick={() => editors.openTask(undefined, { subjectId: selected.subject.id })}><Plus /> Add</Button>
                  </div>
                  <ul className="space-y-2">
                    {data.tasks.filter((t) => t.subjectId === selected.subject.id).map((t) => (
                      <TaskRow key={t.id} task={t} compact subject={selected.subject} subtasks={subtasksByTask.get(t.id)} />
                    ))}
                    {!data.tasks.some((t) => t.subjectId === selected.subject.id) && <li className="text-sm text-muted-foreground">No tasks linked.</li>}
                  </ul>
                </section>
                <section>
                  <div className="mb-2 flex items-center justify-between">
                    <h3 className="text-sm font-semibold">Exams</h3>
                    <Button size="sm" variant="ghost" onClick={() => editors.openExam(undefined, { subjectId: selected.subject.id })}><Plus /> Add</Button>
                  </div>
                  <ul className="space-y-1.5">
                    {data.exams.filter((e) => e.subjectId === selected.subject.id).map((e) => (
                      <li key={e.id}>
                        <button type="button" onClick={() => editors.openExam(e)} className="flex w-full items-center justify-between gap-2 rounded-lg border px-3 py-2 text-left text-sm hover:bg-muted/60">
                          <span className="min-w-0">
                            <span className={`block truncate font-medium ${e.completed ? "line-through text-muted-foreground" : ""}`}>{e.title}</span>
                            <span className="block text-xs text-muted-foreground">{friendlyDateTime(e.examAt)}</span>
                          </span>
                          {parseISO(e.examAt) > new Date() && <Countdown iso={e.examAt} done={e.completed} />}
                        </button>
                      </li>
                    ))}
                    {!data.exams.some((e) => e.subjectId === selected.subject.id) && <li className="text-sm text-muted-foreground">No exams linked.</li>}
                  </ul>
                </section>
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}
