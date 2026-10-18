"use client";

import { format, parseISO, startOfDay, startOfWeek, subDays } from "date-fns";
import { BellOff, Pause, Play, RotateCcw, SkipForward, Timer, Trash2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { SimpleBarChart } from "@/components/charts/bar-chart";
import { reportError, SubjectPicker } from "@/components/editors/common";
import { formatClockMs, useFocusTimer, type Phase } from "@/components/focus/focus-provider";
import { useDb } from "@/components/providers/db-provider";
import { useSettings } from "@/components/providers/settings-provider";
import { useConfirm } from "@/components/shared/confirm";
import { EmptyState, Field, PageHeader, SectionCard, StatTile, SubjectDot } from "@/components/shared/primitives";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { usePlannerData } from "@/hooks/use-planner-data";
import { formatMinutes } from "@/lib/dates";
import { dailyStats, studyStreak } from "@/lib/insights";
import { getNotificationStatus, type NotificationStatus } from "@/lib/notifications";
import { cn } from "@/lib/utils";

const PHASE_LABEL: Record<Phase, string> = { focus: "Focus", short: "Short break", long: "Long break" };

function DurationInput({ label, value, onCommit, max }: { label: string; value: number; onCommit: (v: number) => void; max: number }) {
  // Parent passes key={value}, so the draft resets when the saved value changes.
  const [draft, setDraft] = useState(String(value));
  const n = Number(draft);
  const invalid = !Number.isInteger(n) || n < 1 || n > max;
  return (
    <Field label={label} error={invalid ? `1–${max} minutes` : undefined}>
      {(p) => (
        <Input {...p} type="number" inputMode="numeric" min={1} max={max} value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={() => (invalid ? setDraft(String(value)) : n !== value && onCommit(n))} />
      )}
    </Field>
  );
}

export default function FocusPage() {
  const db = useDb();
  const settings = useSettings();
  const timer = useFocusTimer();
  const confirm = useConfirm();
  const { data, subjectById } = usePlannerData();
  const [notif, setNotif] = useState<NotificationStatus>("prompt");
  useEffect(() => { getNotificationStatus().then(setNotif); }, []);

  const stats = useMemo(() => {
    if (!data) return null;
    const now = new Date();
    const today = startOfDay(now);
    const weekStart = startOfWeek(now, { weekStartsOn: settings.weekStartsOn });
    const sessions = data.focusSessions;
    const sum = (from: Date) => sessions.filter((s) => parseISO(s.startedAt) >= from).reduce((a, s) => a + s.durationMinutes, 0);
    return {
      today: sum(today),
      todayCount: sessions.filter((s) => parseISO(s.startedAt) >= today && s.completed).length,
      week: sum(weekStart),
      last7: dailyStats(data.tasks, sessions, subDays(today, 6), 7),
      streak: studyStreak(sessions, data.tasks, now),
      recent: sessions.slice(0, 8),
    };
  }, [data, settings.weekStartsOn]);

  const progress = 1 - timer.remainingMs / timer.total;
  const R = 108;
  const C = 2 * Math.PI * R;

  const onReset = async () => {
    const { elapsedMinutes } = await timer.reset();
    if (elapsedMinutes >= 1 && (await confirm({ title: `Save ${elapsedMinutes} minutes?`, description: "Keep the time you already focused as a partial session.", confirmLabel: "Save" }))) {
      timer.savePartial(elapsedMinutes).then(() => toast.success("Partial session saved")).catch(reportError);
    }
  };

  const updateSetting = (patch: Parameters<typeof db.settings.update>[0]) => db.settings.update(patch).catch(reportError);

  return (
    <div className="animate-rise">
      <PageHeader title="Focus timer" description="Pomodoro sessions are saved on this device." />
      <div className="grid gap-4 lg:grid-cols-[1.2fr_1fr]">
        <section className="flex flex-col items-center rounded-2xl border bg-card p-5 shadow-card sm:p-8" aria-label="Timer">
          <Tabs value={timer.phase} onValueChange={(v) => timer.status === "idle" ? timer.setPhase(v as Phase) : undefined}>
            <TabsList>
              {(Object.keys(PHASE_LABEL) as Phase[]).map((p) => (
                <TabsTrigger key={p} value={p} disabled={timer.status !== "idle" && timer.phase !== p} className="px-3">{PHASE_LABEL[p]}</TabsTrigger>
              ))}
            </TabsList>
          </Tabs>

          <div className="relative my-6 size-64 sm:size-72">
            <svg viewBox="0 0 240 240" className="size-full -rotate-90" aria-hidden>
              <circle cx="120" cy="120" r={R} fill="none" stroke="var(--muted)" strokeWidth="10" />
              <circle cx="120" cy="120" r={R} fill="none" stroke={timer.phase === "focus" ? "var(--primary)" : "var(--success)"} strokeWidth="10" strokeLinecap="round"
                strokeDasharray={C} strokeDashoffset={C * (1 - progress)} className="transition-[stroke-dashoffset] duration-300 ease-linear" />
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <span className="text-6xl font-bold tracking-tight tabular sm:text-7xl" role="timer" aria-live="off">{formatClockMs(timer.remainingMs)}</span>
              <span className="mt-1 text-sm font-medium text-muted-foreground">
                {timer.status === "paused" ? "Paused" : PHASE_LABEL[timer.phase]} · #{timer.completedFocus + (timer.phase === "focus" ? 1 : 0)}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <Button variant="outline" size="icon-lg" onClick={onReset} disabled={timer.status === "idle"} aria-label="Reset timer"><RotateCcw /></Button>
            {timer.status === "running" ? (
              <Button size="lg" className="h-14 w-36 rounded-full text-base" onClick={timer.pause}><Pause /> Pause</Button>
            ) : (
              <Button size="lg" className="h-14 w-36 rounded-full text-base" onClick={timer.start}><Play /> {timer.status === "paused" ? "Resume" : "Start"}</Button>
            )}
            <Button variant="outline" size="icon-lg" onClick={timer.skip} aria-label={timer.phase === "focus" ? "Skip to break" : "Skip break"}><SkipForward /></Button>
          </div>

          <div className="mt-6 w-full max-w-xs">
            <Field label="Studying (optional)">
              {(p) => <SubjectPicker {...p} value={timer.subjectId} onChange={timer.setSubject} />}
            </Field>
          </div>
          {settings.focusEndNotification && notif === "denied" && (
            <p className="mt-4 flex items-center gap-1.5 text-xs text-muted-foreground">
              <BellOff className="size-3.5" aria-hidden /> Notifications are blocked; you&apos;ll only hear a chime in the app.
            </p>
          )}
        </section>

        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <StatTile label="Today" value={formatMinutes(stats?.today ?? 0)} hint={`${stats?.todayCount ?? 0} full sessions`} icon={Timer} />
            <StatTile label="This week" value={formatMinutes(stats?.week ?? 0)} hint={`Streak ${stats?.streak.current ?? 0} days`} icon={Timer} tone="accent" />
          </div>
          <SectionCard title="Focus minutes · last 7 days" icon={Timer}>
            <SimpleBarChart valueLabel="Focus minutes" format={formatMinutes} data={(stats?.last7 ?? []).map((d) => ({ label: format(d.date, "EEE"), value: Math.round(d.focusMinutes) }))} />
          </SectionCard>
          <SectionCard title="Durations (minutes)" icon={Timer}>
            <div className="grid grid-cols-3 gap-3">
              <DurationInput key={`f${settings.focusMinutes}`} label="Focus" value={settings.focusMinutes} max={180} onCommit={(v) => updateSetting({ focusMinutes: v })} />
              <DurationInput key={`s${settings.shortBreakMinutes}`} label="Short" value={settings.shortBreakMinutes} max={60} onCommit={(v) => updateSetting({ shortBreakMinutes: v })} />
              <DurationInput key={`l${settings.longBreakMinutes}`} label="Long" value={settings.longBreakMinutes} max={90} onCommit={(v) => updateSetting({ longBreakMinutes: v })} />
            </div>
            <p className="mt-2 text-xs text-muted-foreground">Long break after every {settings.sessionsBeforeLongBreak} focus sessions. New durations apply when the timer is idle.</p>
          </SectionCard>
        </div>
      </div>

      <SectionCard title="Recent sessions" icon={Timer} className="mt-4">
        {!stats || stats.recent.length === 0 ? (
          <EmptyState compact icon={Timer} title="No sessions yet" description="Complete a focus session and it will appear here." />
        ) : (
          <ul className="divide-y">
            {stats.recent.map((s) => {
              const subj = s.subjectId ? subjectById.get(s.subjectId) : undefined;
              return (
                <li key={s.id} className="flex items-center gap-3 py-2 text-sm">
                  <span className="w-28 shrink-0 text-xs text-muted-foreground tabular">{format(parseISO(s.startedAt), "MMM d, h:mm a")}</span>
                  <span className="flex min-w-0 flex-1 items-center gap-1.5 truncate">
                    {subj ? <><SubjectDot color={subj.color} /> {subj.name}</> : <span className="text-muted-foreground">General</span>}
                  </span>
                  <span className={cn("font-medium tabular", !s.completed && "text-muted-foreground")}>{formatMinutes(s.durationMinutes)}{!s.completed && " (partial)"}</span>
                  <Button variant="ghost" size="icon-sm" aria-label="Delete session"
                    onClick={async () => { if (await confirm({ title: "Delete this session?", confirmLabel: "Delete", destructive: true })) db.focusSessions.delete(s.id).catch(reportError); }}>
                    <Trash2 />
                  </Button>
                </li>
              );
            })}
          </ul>
        )}
      </SectionCard>
    </div>
  );
}
