"use client";

import { addDays, endOfWeek, format, startOfDay, startOfWeek, subDays, subWeeks } from "date-fns";
import { AlertTriangle, BarChart3, BookOpen, CheckCircle2, Percent, Timer, TrendingUp } from "lucide-react";
import { useMemo, useState } from "react";
import { Bar, BarChart, CartesianGrid, Cell, LabelList, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { SimpleBarChart } from "@/components/charts/bar-chart";
import { useSettings } from "@/components/providers/settings-provider";
import { EmptyState, ErrorState, ListSkeleton, PageHeader, SectionCard, StatTile } from "@/components/shared/primitives";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { usePlannerData } from "@/hooks/use-planner-data";
import { formatMinutes } from "@/lib/dates";
import { completionRate, dailyStats, filterByView, subjectWorkload } from "@/lib/insights";

const pct = (r: number | null) => (r === null ? "—" : `${Math.round(r * 100)}%`);

export default function AnalyticsPage() {
  const settings = useSettings();
  const { data, error, loading, reload } = usePlannerData();
  const [days, setDays] = useState<7 | 30>(7);

  const a = useMemo(() => {
    if (!data) return null;
    const now = new Date();
    const today = startOfDay(now);
    const from = subDays(today, days - 1);
    const daily = dailyStats(data.tasks, data.focusSessions, from, days);
    const ws = { weekStartsOn: settings.weekStartsOn };
    const thisWeek = completionRate(data.tasks, startOfWeek(now, ws), endOfWeek(now, ws));
    const weeks = Array.from({ length: 8 }, (_, i) => {
      const start = startOfWeek(subWeeks(now, 7 - i), ws);
      const r = completionRate(data.tasks, start, addDays(start, 7));
      return { label: format(start, "MMM d"), value: r.rate === null ? 0 : Math.round(r.rate * 100), total: r.total };
    });
    const workload = subjectWorkload(data.subjects, data.tasks, data.exams, data.focusSessions, now)
      .map((w) => ({ name: w.subject.code || w.subject.name, color: w.subject.color, load: w.openTasks + w.upcomingExams * 2, focus: Math.round(w.focusMinutes) }))
      .sort((x, y) => y.load - x.load);
    return {
      completed: daily.reduce((s, d) => s + d.completed, 0),
      focus: daily.reduce((s, d) => s + d.focusMinutes, 0),
      overdue: filterByView(data.tasks, "overdue", now).length,
      thisWeek, daily, weeks, workload,
    };
  }, [data, days, settings.weekStartsOn]);

  const dayLabel = (d: Date) => (days === 7 ? format(d, "EEE") : format(d, "d"));
  const tooltipStyle = { background: "var(--popover)", border: "1px solid var(--border)", borderRadius: 10, fontSize: 12, color: "var(--popover-foreground)" };

  return (
    <div className="animate-rise">
      <PageHeader title="Analytics" description="Calculated from the records on this device."
        actions={
          <Tabs value={String(days)} onValueChange={(v) => setDays(Number(v) as 7 | 30)}>
            <TabsList>
              <TabsTrigger value="7" className="px-3">7 days</TabsTrigger>
              <TabsTrigger value="30" className="px-3">30 days</TabsTrigger>
            </TabsList>
          </Tabs>
        } />
      {error && <ErrorState message={error} onRetry={reload} />}
      {loading && !a && <ListSkeleton rows={4} />}
      {a && data && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <StatTile label={`Completed · ${days}d`} value={a.completed} icon={CheckCircle2} tone="success" />
            <StatTile label="Overdue now" value={a.overdue} icon={AlertTriangle} tone={a.overdue ? "destructive" : "success"} />
            <StatTile label="Completion this week" value={pct(a.thisWeek.rate)} hint={a.thisWeek.total ? `${a.thisWeek.done} of ${a.thisWeek.total} due` : "Nothing due yet"} icon={Percent} />
            <StatTile label={`Focus · ${days}d`} value={formatMinutes(a.focus)} hint={`${(a.focus / 60).toFixed(1)} hours`} icon={Timer} tone="accent" />
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <SectionCard title="Tasks completed per day" icon={CheckCircle2}>
              <SimpleBarChart valueLabel="Tasks completed" data={a.daily.map((d) => ({ label: dayLabel(d.date), value: d.completed }))} />
            </SectionCard>
            <SectionCard title="Focus minutes per day" icon={Timer}>
              <SimpleBarChart valueLabel="Focus minutes" format={formatMinutes} data={a.daily.map((d) => ({ label: dayLabel(d.date), value: Math.round(d.focusMinutes) }))} />
            </SectionCard>
          </div>

          <SectionCard title="Weekly completion rate · last 8 weeks" icon={TrendingUp}>
            <SimpleBarChart valueLabel="Completion rate" format={(v) => `${v}%`} data={a.weeks.map((w) => ({ label: w.label, value: w.value }))} />
            <p className="mt-2 text-xs text-muted-foreground">Share of tasks due each week that were completed. Weeks with nothing due show 0%.</p>
          </SectionCard>

          <SectionCard title="Subject workload" icon={BookOpen}>
            {a.workload.length === 0 ? (
              <EmptyState compact icon={BarChart3} title="No subjects yet" description="Add subjects to compare workload." />
            ) : (
              <figure>
                <div style={{ height: Math.max(120, a.workload.length * 40 + 24) }} aria-hidden>
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={a.workload} layout="vertical" margin={{ top: 0, right: 32, bottom: 0, left: 8 }} barCategoryGap="30%">
                      <CartesianGrid horizontal={false} stroke="var(--border)" />
                      <XAxis type="number" allowDecimals={false} tickLine={false} axisLine={false} tick={{ fill: "var(--muted-foreground)", fontSize: 11 }} />
                      <YAxis type="category" dataKey="name" width={96} tickLine={false} axisLine={false} tick={{ fill: "var(--foreground)", fontSize: 12 }} />
                      <Tooltip cursor={{ fill: "var(--muted)", opacity: 0.6 }} contentStyle={tooltipStyle} formatter={(v) => [String(v), "Workload points"]} />
                      <Bar dataKey="load" radius={[0, 4, 4, 0]} maxBarSize={22} isAnimationActive={false}>
                        {a.workload.map((w) => <Cell key={w.name} fill={w.color} />)}
                        <LabelList dataKey="load" position="right" fill="var(--muted-foreground)" fontSize={11} />
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
                <figcaption className="mt-2 text-xs text-muted-foreground">Open tasks + 2 × upcoming exams per subject.</figcaption>
              </figure>
            )}
            {a.workload.length > 0 && (
              <table className="mt-4 w-full text-sm">
                <caption className="sr-only">Workload and focus by subject</caption>
                <thead>
                  <tr className="text-left text-xs text-muted-foreground">
                    <th scope="col" className="pb-2 font-medium">Subject</th>
                    <th scope="col" className="pb-2 text-right font-medium">Workload</th>
                    <th scope="col" className="pb-2 text-right font-medium">Focus time</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {a.workload.map((w) => (
                    <tr key={w.name}>
                      <th scope="row" className="py-1.5 text-left font-medium">
                        <span className="mr-2 inline-block size-2.5 rounded-full align-middle" style={{ background: w.color }} aria-hidden />{w.name}
                      </th>
                      <td className="py-1.5 text-right tabular">{w.load}</td>
                      <td className="py-1.5 text-right tabular">{formatMinutes(w.focus)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </SectionCard>
        </div>
      )}
    </div>
  );
}
