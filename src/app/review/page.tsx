"use client";

import { addDays, addWeeks, format, parseISO, startOfWeek, subWeeks } from "date-fns";
import { CheckCircle2, ChevronLeft, ChevronRight, ClipboardCheck, Copy, Minus, Plus, Target, Timer, Trash2 } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { reportError } from "@/components/editors/common";
import { useDb, useLiveQuery } from "@/components/providers/db-provider";
import { useSettings } from "@/components/providers/settings-provider";
import { useConfirm } from "@/components/shared/confirm";
import { EmptyState, Field, PageHeader, SectionCard, SimpleSelect, StatTile } from "@/components/shared/primitives";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { Textarea } from "@/components/ui/textarea";
import { usePlannerData } from "@/hooks/use-planner-data";
import { dayKey, formatMinutes } from "@/lib/dates";
import type { GoalMetric, WeeklyGoal } from "@/lib/db/schema";
import { completionRate, dailyStats, goalProgress, isOverdue, workloadByDay } from "@/lib/insights";

const METRIC_LABEL: Record<GoalMetric, string> = { tasks_completed: "Tasks completed", focus_minutes: "Focus minutes", custom: "Custom (track manually)" };

function GoalCard({ goal, value }: { goal: WeeklyGoal; value: number }) {
  const db = useDb();
  const confirm = useConfirm();
  const [notes, setNotes] = useState(goal.reflection);
  const done = value >= goal.target;
  return (
    <li className="rounded-2xl border bg-card p-4 shadow-card">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="flex items-center gap-1.5 font-medium">
            {done && <CheckCircle2 className="size-4 text-success" aria-label="Goal reached" />}
            {goal.title}
          </p>
          <p className="text-xs text-muted-foreground">{METRIC_LABEL[goal.metric]}</p>
        </div>
        <Button variant="ghost" size="icon-sm" aria-label={`Delete goal ${goal.title}`}
          onClick={async () => { if (await confirm({ title: "Delete this goal?", confirmLabel: "Delete", destructive: true })) db.weeklyGoals.delete(goal.id).catch(reportError); }}>
          <Trash2 />
        </Button>
      </div>
      <div className="mt-3 flex items-center gap-3">
        <Progress value={Math.min(100, (value / goal.target) * 100)} className="flex-1" aria-label={`${goal.title} progress`} />
        <span className="text-sm font-semibold tabular">
          {goal.metric === "focus_minutes" ? `${formatMinutes(value)} / ${formatMinutes(goal.target)}` : `${value} / ${goal.target}`}
        </span>
      </div>
      {goal.metric === "custom" && (
        <div className="mt-2 flex gap-2">
          <Button size="sm" variant="outline" aria-label="Decrease progress" disabled={goal.progress <= 0}
            onClick={() => db.weeklyGoals.update(goal.id, { progress: goal.progress - 1 }).catch(reportError)}><Minus /></Button>
          <Button size="sm" variant="outline" aria-label="Increase progress"
            onClick={() => db.weeklyGoals.update(goal.id, { progress: goal.progress + 1 }).catch(reportError)}><Plus /></Button>
        </div>
      )}
      <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} placeholder="Reflection: what helped or got in the way?"
        aria-label={`Reflection for ${goal.title}`} className="mt-3 text-sm"
        onBlur={() => notes !== goal.reflection && db.weeklyGoals.update(goal.id, { reflection: notes }).catch(reportError)} />
    </li>
  );
}

export default function ReviewPage() {
  const db = useDb();
  const settings = useSettings();
  const { data } = usePlannerData();
  const [anchor, setAnchor] = useState(() => new Date());
  const weekStart = startOfWeek(anchor, { weekStartsOn: settings.weekStartsOn });
  const weekKey = dayKey(weekStart);
  const weekTime = weekStart.getTime();
  const { data: goals = [] } = useLiveQuery((d) => d.weeklyGoals.listByWeek(weekKey), [weekKey], ["weekly_goals"]);
  const [title, setTitle] = useState("");
  const [metric, setMetric] = useState<GoalMetric>("tasks_completed");
  const [target, setTarget] = useState("5");

  const summary = useMemo(() => {
    if (!data) return null;
    const end = addDays(weekStart, 7);
    const days = dailyStats(data.tasks, data.focusSessions, weekStart, 7);
    const best = [...days].sort((a, b) => b.focusMinutes + b.completed * 30 - (a.focusMinutes + a.completed * 30))[0];
    const nextWeekLoad = workloadByDay(data.tasks, data.exams, settings.heavyDayThreshold, 7, end).filter((d) => d.heavy);
    return {
      completed: days.reduce((s, d) => s + d.completed, 0),
      focus: days.reduce((s, d) => s + d.focusMinutes, 0),
      rate: completionRate(data.tasks, weekStart, end),
      carried: data.tasks.filter((t) => t.dueAt && parseISO(t.dueAt) < end && parseISO(t.dueAt) >= weekStart && isOverdue(t, end > new Date() ? new Date() : end)).length,
      best: best && (best.completed || best.focusMinutes) ? best : null,
      nextWeekLoad,
    };
  }, [data, weekTime, settings.heavyDayThreshold]); // eslint-disable-line react-hooks/exhaustive-deps

  const addGoal = async () => {
    const n = Number(target);
    try {
      await db.weeklyGoals.create({ weekStart: weekKey, title: title.trim(), metric, target: Number.isFinite(n) ? n : 1 });
      setTitle("");
      toast.success("Goal added");
    } catch (err) {
      reportError(err);
    }
  };

  const copyLastWeek = async () => {
    try {
      const prev = await db.weeklyGoals.listByWeek(dayKey(subWeeks(weekStart, 1)));
      if (!prev.length) return toast.info("No goals last week to copy.");
      for (const g of prev) await db.weeklyGoals.create({ weekStart: weekKey, title: g.title, metric: g.metric, target: g.target });
      toast.success(`Copied ${prev.length} goal${prev.length === 1 ? "" : "s"}`);
    } catch (err) {
      reportError(err);
    }
  };

  const isCurrent = weekKey === dayKey(startOfWeek(new Date(), { weekStartsOn: settings.weekStartsOn }));

  return (
    <div className="animate-rise">
      <PageHeader title="Weekly review" description="Look back, then set goals for the week." />
      <div className="mb-4 flex items-center gap-1">
        <Button variant="outline" size="icon" aria-label="Previous week" onClick={() => setAnchor((a) => subWeeks(a, 1))}><ChevronLeft /></Button>
        <Button variant="outline" size="icon" aria-label="Next week" onClick={() => setAnchor((a) => addWeeks(a, 1))}><ChevronRight /></Button>
        {!isCurrent && <Button variant="ghost" onClick={() => setAnchor(new Date())}>This week</Button>}
        <h2 className="ml-2 font-semibold" aria-live="polite">
          {format(weekStart, "MMM d")} – {format(addDays(weekStart, 6), "MMM d, yyyy")}{isCurrent && <span className="ml-2 text-xs font-medium text-primary">This week</span>}
        </h2>
      </div>

      {summary && (
        <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
          <StatTile label="Tasks completed" value={summary.completed} icon={CheckCircle2} tone="success" />
          <StatTile label="Focus time" value={formatMinutes(summary.focus)} icon={Timer} tone="accent" />
          <StatTile label="Completion rate" value={summary.rate.rate === null ? "—" : `${Math.round(summary.rate.rate * 100)}%`} hint={`${summary.rate.done}/${summary.rate.total} due tasks`} icon={Target} />
          <StatTile label="Left unfinished" value={summary.carried} icon={ClipboardCheck} tone={summary.carried ? "warning" : "success"} />
        </div>
      )}
      {summary && (summary.best || summary.nextWeekLoad.length > 0) && (
        <SectionCard title="Highlights" icon={ClipboardCheck} className="mb-4">
          <ul className="list-disc space-y-1 pl-5 text-sm text-muted-foreground">
            {summary.best && <li>Most productive day: <span className="font-medium text-foreground">{format(summary.best.date, "EEEE")}</span> ({summary.best.completed} tasks, {formatMinutes(summary.best.focusMinutes)} focus).</li>}
            {summary.nextWeekLoad.length > 0 && <li>Next week has heavy days: {summary.nextWeekLoad.map((d) => format(d.date, "EEE d")).join(", ")}. Plan ahead.</li>}
          </ul>
        </SectionCard>
      )}

      <div className="grid gap-4 lg:grid-cols-[1fr_22rem]">
        <section>
          <div className="mb-2 flex items-center justify-between">
            <h2 className="text-sm font-semibold">Goals</h2>
            <Button size="sm" variant="ghost" onClick={copyLastWeek}><Copy /> Copy last week</Button>
          </div>
          {goals.length === 0 ? (
            <EmptyState icon={Target} title="No goals for this week" description="Set one to three achievable goals." />
          ) : (
            <ul className="space-y-3">
              {goals.map((g) => (
                <GoalCard key={g.id} goal={g} value={data ? goalProgress(g, data.tasks, data.focusSessions, weekStart) : g.progress} />
              ))}
            </ul>
          )}
        </section>
        <SectionCard title="New goal" icon={Plus} className="h-fit">
          <form className="grid gap-3" onSubmit={(e) => { e.preventDefault(); addGoal(); }}>
            <Field label="Goal">{(p) => <Input {...p} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Finish 6 tasks" required maxLength={160} />}</Field>
            <Field label="Measure">{(p) => <SimpleSelect {...p} value={metric} onChange={(v) => setMetric(v as GoalMetric)}
              options={(Object.keys(METRIC_LABEL) as GoalMetric[]).map((m) => ({ value: m, label: METRIC_LABEL[m] }))} />}</Field>
            <Field label={metric === "focus_minutes" ? "Target (minutes)" : "Target"}>
              {(p) => <Input {...p} type="number" inputMode="numeric" min={1} value={target} onChange={(e) => setTarget(e.target.value)} />}
            </Field>
            <Button type="submit" disabled={!title.trim()}><Plus /> Add goal</Button>
            <p className="text-xs text-muted-foreground">Task and focus goals update automatically from your records.</p>
          </form>
        </SectionCard>
      </div>
    </div>
  );
}
