"use client";

import { differenceInCalendarDays, parseISO } from "date-fns";
import { CheckCircle2, GraduationCap, MapPin, Plus, RotateCcw } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { reportError } from "@/components/editors/common";
import { useEditors } from "@/components/editors/editors-provider";
import { useDb } from "@/components/providers/db-provider";
import { Countdown, EmptyState, ErrorState, ListSkeleton, PageHeader, SubjectDot } from "@/components/shared/primitives";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { usePlannerData } from "@/hooks/use-planner-data";
import { friendlyDateTime } from "@/lib/dates";
import type { Exam } from "@/lib/db/schema";
import { cn } from "@/lib/utils";

export default function ExamsPage() {
  const db = useDb();
  const editors = useEditors();
  const { data, error, loading, reload, subjectById } = usePlannerData();
  const [tab, setTab] = useState<"upcoming" | "completed">("upcoming");

  const lists = useMemo(() => {
    const now = new Date();
    const all = data?.exams ?? [];
    // Exams whose time has passed but aren't marked done still show as upcoming, flagged "awaiting".
    return {
      upcoming: all.filter((e) => !e.completed),
      completed: all.filter((e) => e.completed).sort((a, b) => b.examAt.localeCompare(a.examAt)),
      now,
    };
  }, [data]);

  const toggleItem = (exam: Exam, itemId: string, done: boolean) =>
    db.exams.update(exam.id, { checklist: exam.checklist.map((c) => (c.id === itemId ? { ...c, done } : c)) }).catch(reportError);

  const setDone = async (exam: Exam, completed: boolean) => {
    try {
      await db.exams.setCompleted(exam.id, completed);
      toast.success(completed ? "Marked as done — reminder cancelled" : "Moved back to upcoming");
    } catch (err) {
      reportError(err);
    }
  };

  const list = lists[tab];

  return (
    <div className="animate-rise">
      <PageHeader title="Exams" description="Countdowns and preparation checklists."
        actions={<Button onClick={() => editors.openExam()}><Plus /> New exam</Button>} />
      <Tabs value={tab} onValueChange={(v) => setTab(v as typeof tab)} className="mb-4">
        <TabsList>
          <TabsTrigger value="upcoming" className="px-4">Upcoming ({lists.upcoming.length})</TabsTrigger>
          <TabsTrigger value="completed" className="px-4">Completed ({lists.completed.length})</TabsTrigger>
        </TabsList>
      </Tabs>
      {error && <ErrorState message={error} onRetry={reload} />}
      {loading && !data && <ListSkeleton rows={3} />}
      {data && list.length === 0 && (
        <EmptyState icon={GraduationCap}
          title={tab === "upcoming" ? "No upcoming exams" : "No completed exams"}
          description={tab === "upcoming" ? "Add exam dates to get countdowns and reminders." : undefined}
          action={tab === "upcoming" ? <Button onClick={() => editors.openExam()}><Plus /> Add exam</Button> : undefined} />
      )}
      <ul className="grid gap-3 lg:grid-cols-2">
        {list.map((e) => {
          const s = e.subjectId ? subjectById.get(e.subjectId) : undefined;
          const done = e.checklist.filter((c) => c.done).length;
          const days = differenceInCalendarDays(parseISO(e.examAt), lists.now);
          const passed = parseISO(e.examAt) < lists.now;
          return (
            <li key={e.id} className="rounded-2xl border bg-card p-4 shadow-card">
              <div className="flex items-start gap-3">
                {!e.completed && (
                  <div className={cn("flex size-14 shrink-0 flex-col items-center justify-center rounded-xl", days <= 3 && !passed ? "bg-destructive/10 text-destructive" : "bg-secondary text-secondary-foreground")}>
                    <span className="text-xl leading-none font-bold tabular">{passed ? "—" : Math.max(0, days)}</span>
                    <span className="text-2xs font-medium">{passed ? "past" : days === 1 ? "day" : "days"}</span>
                  </div>
                )}
                <button type="button" onClick={() => editors.openExam(e)} className="min-w-0 flex-1 rounded-md text-left outline-none focus-visible:ring-3 focus-visible:ring-ring/50">
                  <span className={cn("block font-semibold", e.completed && "text-muted-foreground line-through")}>{e.title}</span>
                  {s && <span className="mt-0.5 flex items-center gap-1.5 text-xs text-muted-foreground"><SubjectDot color={s.color} className="size-2" />{s.name}</span>}
                  <span className="mt-1 block text-xs text-muted-foreground tabular">{friendlyDateTime(e.examAt)} · {e.durationMinutes} min</span>
                  {e.venue && <span className="mt-0.5 flex items-center gap-1 text-xs text-muted-foreground"><MapPin className="size-3" aria-hidden />{e.venue}</span>}
                </button>
                {!e.completed && !passed && <Countdown iso={e.examAt} />}
              </div>
              {e.checklist.length > 0 && (
                <div className="mt-3 border-t pt-3">
                  <div className="mb-2 flex items-center justify-between text-xs">
                    <span className="font-medium">Preparation</span>
                    <span className="text-muted-foreground tabular">{done}/{e.checklist.length}</span>
                  </div>
                  <Progress value={(done / e.checklist.length) * 100} className="mb-2" aria-label="Preparation progress" />
                  <ul className="space-y-0.5">
                    {e.checklist.map((c) => (
                      <li key={c.id}>
                        <label className="flex min-h-10 cursor-pointer items-center gap-2.5 rounded-lg px-1 text-sm hover:bg-muted/60">
                          <Checkbox checked={c.done} onCheckedChange={(v) => toggleItem(e, c.id, !!v)} />
                          <span className={cn(c.done && "text-muted-foreground line-through")}>{c.text}</span>
                        </label>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {e.notes && <p className="mt-3 line-clamp-3 text-xs whitespace-pre-wrap text-muted-foreground">{e.notes}</p>}
              <div className="mt-3 flex justify-end">
                {e.completed ? (
                  <Button size="sm" variant="ghost" onClick={() => setDone(e, false)}><RotateCcw /> Mark upcoming</Button>
                ) : (
                  <Button size="sm" variant={passed ? "default" : "outline"} onClick={() => setDone(e, true)}><CheckCircle2 /> {passed ? "Mark as taken" : "Mark done"}</Button>
                )}
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
