"use client";

import { format, parseISO } from "date-fns";
import { CalendarClock, CheckSquare, LifeBuoy, Plus, Search, SlidersHorizontal, Sparkles, X } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useMemo, useState } from "react";
import { toast } from "sonner";
import { reportError } from "@/components/editors/common";
import { useEditors } from "@/components/editors/editors-provider";
import { useDb } from "@/components/providers/db-provider";
import { useSettings } from "@/components/providers/settings-provider";
import { EmptyState, ErrorState, ListSkeleton, PageHeader, SectionCard, SimpleSelect } from "@/components/shared/primitives";
import { QuickAddBar } from "@/components/tasks/quick-add-bar";
import { TaskRow } from "@/components/tasks/task-row";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { usePlannerData } from "@/hooks/use-planner-data";
import { CATEGORIES, PRIORITIES, type Task } from "@/lib/db/schema";
import { catchUpPlan, filterByView, PRIORITY_WEIGHT, suggestPriorities, type TaskView } from "@/lib/insights";

const VIEWS: { value: TaskView; label: string }[] = [
  { value: "today", label: "Today" },
  { value: "upcoming", label: "Upcoming" },
  { value: "overdue", label: "Overdue" },
  { value: "completed", label: "Done" },
  { value: "all", label: "All" },
];
type Sort = "due" | "priority" | "created" | "title";
const ALL = "all";
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

function TasksView() {
  const db = useDb();
  const editors = useEditors();
  const settings = useSettings();
  const router = useRouter();
  const params = useSearchParams();
  const view = (VIEWS.find((v) => v.value === params.get("view"))?.value ?? "today") as TaskView;
  const setView = (v: TaskView) => router.replace(`/tasks/?view=${v}`, { scroll: false });

  const { data, error, loading, reload, subjectById, subtasksByTask } = usePlannerData();
  const [query, setQuery] = useState("");
  const [subject, setSubject] = useState(ALL);
  const [priority, setPriority] = useState(ALL);
  const [category, setCategory] = useState(ALL);
  const [sort, setSort] = useState<Sort>("due");
  const [showFilters, setShowFilters] = useState(false);
  const now = useMemo(() => new Date(), [data]); // eslint-disable-line react-hooks/exhaustive-deps

  const counts = useMemo(
    () => Object.fromEntries(VIEWS.map((v) => [v.value, data ? filterByView(data.tasks, v.value, now).length : 0])),
    [data, now],
  );

  const tasks = useMemo(() => {
    if (!data) return [];
    const q = query.trim().toLowerCase();
    const list = filterByView(data.tasks, view, now).filter(
      (t) =>
        (subject === ALL || (subject === "none" ? !t.subjectId : t.subjectId === subject)) &&
        (priority === ALL || t.priority === priority) &&
        (category === ALL || t.category === category) &&
        (!q || t.title.toLowerCase().includes(q) || t.description.toLowerCase().includes(q)),
    );
    const cmp: Record<Sort, (a: Task, b: Task) => number> = {
      due: (a, b) => (a.dueAt ?? "9999").localeCompare(b.dueAt ?? "9999"),
      priority: (a, b) => PRIORITY_WEIGHT[b.priority] - PRIORITY_WEIGHT[a.priority] || (a.dueAt ?? "9999").localeCompare(b.dueAt ?? "9999"),
      created: (a, b) => b.createdAt.localeCompare(a.createdAt),
      title: (a, b) => a.title.localeCompare(b.title),
    };
    const sorted = [...list].sort(cmp[sort]);
    return view === "completed" && sort === "due" ? sorted.sort((a, b) => (b.completedAt ?? "").localeCompare(a.completedAt ?? "")) : sorted;
  }, [data, view, now, query, subject, priority, category, sort]);

  const suggestions = useMemo(
    () => (data ? suggestPriorities(data.tasks, data.subtasks, now).filter((s) => s.suggestedPriority).slice(0, 3) : []),
    [data, now],
  );
  const plan = useMemo(() => (data && view === "overdue" ? catchUpPlan(data.tasks, data.exams, settings, 2, now) : []), [data, view, settings, now]);

  const activeFilters = [subject, priority, category].filter((f) => f !== ALL).length + (query ? 1 : 0);
  const clearFilters = () => { setQuery(""); setSubject(ALL); setPriority(ALL); setCategory(ALL); };

  const applyPlan = async () => {
    try {
      await db.tasks.rescheduleMany(plan.map((p) => ({ id: p.task.id, dueAt: p.newDate.toISOString() })));
      toast.success(`Rescheduled ${plan.length} task${plan.length === 1 ? "" : "s"}`, { description: "Reminders were updated to the new dates." });
    } catch (err) {
      reportError(err);
    }
  };

  return (
    <div className="animate-rise">
      <PageHeader title="Tasks" description="Assignments, projects, quizzes and personal to-dos."
        actions={<Button onClick={() => editors.openTask()}><Plus /> New task</Button>} />

      <QuickAddBar className="mb-4" />

      <Tabs value={view} onValueChange={(v) => setView(v as TaskView)} className="mb-4">
        {/* Five equal segments: no horizontal scrolling on small phones. */}
        <TabsList className="grid w-full grid-cols-5 group-data-horizontal/tabs:h-auto sm:group-data-horizontal/tabs:h-auto">
          {VIEWS.map((v) => {
            const n = v.value === "all" ? 0 : counts[v.value];
            return (
              // Count sits under the label on phones (no overlap), beside it on wider screens.
              <TabsTrigger key={v.value} value={v.value} className="min-h-12 flex-col gap-0 px-0.5 py-1 text-xs sm:min-h-9 sm:flex-row sm:gap-1.5 sm:text-sm"
                aria-label={n ? `${v.label}, ${n} task${n === 1 ? "" : "s"}` : v.label}>
                {v.label}
                <span aria-hidden className={`min-h-4 text-2xs leading-4 font-semibold tabular ${n ? (v.value === "overdue" ? "text-destructive" : "text-primary") : "text-transparent sm:hidden"}`}>{n || "0"}</span>
              </TabsTrigger>
            );
          })}
        </TabsList>
      </Tabs>

      <div className="mb-4 space-y-3">
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
            <Input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search tasks" aria-label="Search tasks" className="pl-9" />
          </div>
          <Button variant="outline" onClick={() => setShowFilters((s) => !s)} aria-expanded={showFilters} aria-controls="task-filters">
            <SlidersHorizontal /> <span className="hidden sm:inline">Filters</span>
            {activeFilters > 0 && <span className="rounded-full bg-primary px-1.5 text-2xs text-primary-foreground tabular">{activeFilters}</span>}
          </Button>
        </div>
        {showFilters && (
          <div id="task-filters" className="grid grid-cols-2 gap-2 rounded-2xl border bg-card p-3 sm:grid-cols-4">
            <SimpleSelect ariaLabel="Filter by subject" value={subject} onChange={setSubject} options={[
              { value: ALL, label: "All subjects" }, { value: "none", label: "No subject" },
              ...(data?.subjects ?? []).map((s) => ({ value: s.id, label: s.name })),
            ]} />
            <SimpleSelect ariaLabel="Filter by priority" value={priority} onChange={setPriority}
              options={[{ value: ALL, label: "Any priority" }, ...PRIORITIES.map((p) => ({ value: p, label: cap(p) }))]} />
            <SimpleSelect ariaLabel="Filter by category" value={category} onChange={setCategory}
              options={[{ value: ALL, label: "Any category" }, ...CATEGORIES.map((c) => ({ value: c, label: cap(c) }))]} />
            <SimpleSelect ariaLabel="Sort tasks" value={sort} onChange={(v) => setSort(v as Sort)} options={[
              { value: "due", label: view === "completed" ? "Recently completed" : "Sort: due date" },
              { value: "priority", label: "Sort: priority" }, { value: "created", label: "Sort: newest" }, { value: "title", label: "Sort: A–Z" },
            ]} />
            {activeFilters > 0 && (
              <Button variant="ghost" onClick={clearFilters} className="col-span-2 justify-self-start sm:col-span-4"><X /> Clear filters</Button>
            )}
          </div>
        )}
      </div>

      {error && <ErrorState message={error} onRetry={reload} />}
      {loading && !data && <ListSkeleton rows={5} />}

      {data && view === "overdue" && plan.length > 0 && (
        <SectionCard title="Catch-Up mode" icon={LifeBuoy} className="mb-4 border-primary/25 bg-secondary/40"
          action={<Button size="sm" onClick={applyPlan}><CalendarClock /> Apply plan</Button>}>
          <p className="mb-3 text-sm text-muted-foreground">
            A realistic plan: at most two catch-up tasks per day, most important first, skipping days that are already heavy.
          </p>
          <ul className="divide-y rounded-xl border bg-card">
            {plan.map((p) => (
              <li key={p.task.id} className="flex items-center justify-between gap-3 px-3 py-2 text-sm">
                <span className="min-w-0 truncate">{p.task.title}</span>
                <span className="shrink-0 text-xs text-muted-foreground tabular">
                  {p.task.dueAt && <s className="mr-1.5">{format(parseISO(p.task.dueAt), "MMM d")}</s>}
                  <span className="font-medium text-foreground">{format(p.newDate, "EEE, MMM d")}</span>
                </span>
              </li>
            ))}
          </ul>
        </SectionCard>
      )}

      {data && (view === "upcoming" || view === "today" || view === "all") && suggestions.length > 0 && (
        <SectionCard title="Priority suggestions" icon={Sparkles} className="mb-4">
          <ul className="space-y-2">
            {suggestions.map((s) => (
              <li key={s.task.id} className="flex flex-wrap items-center justify-between gap-2 text-sm">
                <span className="min-w-0">
                  <span className="font-medium">{s.task.title}</span>
                  <span className="block text-xs text-muted-foreground">{s.reasons.join(" · ")} — currently {s.task.priority}</span>
                </span>
                <Button size="sm" variant="secondary" onClick={() => db.tasks.update(s.task.id, { priority: s.suggestedPriority }).then(() => toast.success("Priority updated")).catch(reportError)}>
                  Make {s.suggestedPriority}
                </Button>
              </li>
            ))}
          </ul>
        </SectionCard>
      )}

      {data && tasks.length === 0 && (
        activeFilters > 0 ? (
          <EmptyState icon={Search} title="No matching tasks" description="Try a different search or clear the filters." action={<Button variant="outline" onClick={clearFilters}>Clear filters</Button>} />
        ) : (
          <EmptyState icon={CheckSquare}
            title={{ today: "Nothing due today", upcoming: "No upcoming tasks", overdue: "No overdue tasks", completed: "No completed tasks yet", all: "No tasks yet" }[view]}
            description={view === "overdue" ? "You're all caught up." : "Add assignments and to-dos to stay ahead."}
            action={view !== "completed" && view !== "overdue" ? <Button onClick={() => editors.openTask()}><Plus /> Add task</Button> : undefined} />
        )
      )}
      {tasks.length > 0 && (
        <ul className="space-y-2" aria-label={`${VIEWS.find((v) => v.value === view)?.label} tasks`}>
          {tasks.map((t) => <TaskRow key={t.id} task={t} subject={t.subjectId ? subjectById.get(t.subjectId) : undefined} subtasks={subtasksByTask.get(t.id)} />)}
        </ul>
      )}
    </div>
  );
}

export default function TasksPage() {
  return (
    <Suspense fallback={<ListSkeleton rows={5} />}>
      <TasksView />
    </Suspense>
  );
}
