"use client";

import { Check, ChevronRight, Rocket, X } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { useEditors } from "@/components/editors/editors-provider";
import { useSettings } from "@/components/providers/settings-provider";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import type { PlannerData } from "@/hooks/use-planner-data";
import { cn } from "@/lib/utils";

const HIDE_KEY = "flowed.getting-started.hidden"; // per-device UI preference
const CAL_KEY = "flowed.calendar-synced";

/** Self-completing setup checklist for new users; disappears when done or hidden. */
export function GettingStarted({ data }: { data: PlannerData }) {
  const settings = useSettings();
  const editors = useEditors();
  const [hidden, setHidden] = useState(() => {
    try { return localStorage.getItem(HIDE_KEY) === "1"; } catch { return false; }
  });
  const calendarSynced = (() => { try { return localStorage.getItem(CAL_KEY) === "1"; } catch { return false; } })();

  const steps = [
    { done: !!settings.displayName.trim(), label: "Add your name", hint: "So Flowed can greet you", href: "/settings/" },
    { done: data.schedules.length > 0, label: "Import your class schedule", hint: "From a photo or screenshot", href: "/schedule/" },
    { done: data.tasks.length > 0, label: "Add your first task", hint: "Try: Essay fri 5pm !high", onClick: () => editors.openTask() },
    { done: data.exams.length > 0, label: "Add an exam", hint: "Get a countdown and prep list", onClick: () => editors.openExam() },
    { done: calendarSynced, label: "Turn on reminders", hint: "Calendar sync works even when Flowed is closed", href: "/settings/#calendar-sync" },
  ];
  const done = steps.filter((s) => s.done).length;
  if (hidden || done === steps.length) return null;

  const hide = () => {
    setHidden(true);
    try { localStorage.setItem(HIDE_KEY, "1"); } catch { /* blocked */ }
  };

  return (
    <section aria-labelledby="gs-title" className="rounded-2xl border border-primary/25 bg-gradient-to-br from-secondary/80 to-accent/60 p-4 shadow-card sm:p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 id="gs-title" className="flex items-center gap-2 font-semibold"><Rocket className="size-4 text-primary" aria-hidden /> Getting started</h2>
          <p className="mt-0.5 text-sm text-muted-foreground">{done} of {steps.length} done. Set up Flowed in about 2 minutes.</p>
        </div>
        <Button variant="ghost" size="icon-sm" onClick={hide} aria-label="Hide getting started"><X /></Button>
      </div>
      <Progress value={(done / steps.length) * 100} className="mt-3" aria-label="Setup progress" />
      <ol className="mt-3 grid gap-1.5 sm:grid-cols-2">
        {steps.map((s, i) => {
          const body = (
            <>
              <span className={cn("flex size-7 shrink-0 items-center justify-center rounded-full border text-xs font-bold", s.done ? "border-success bg-success text-white dark:text-background" : "border-primary/40 bg-card text-primary")}>
                {s.done ? <Check className="size-4" aria-hidden /> : i + 1}
              </span>
              <span className="min-w-0 flex-1">
                <span className={cn("block text-sm font-medium", s.done && "text-muted-foreground line-through")}>{s.label}</span>
                <span className="block truncate text-xs text-muted-foreground">{s.hint}</span>
              </span>
              {!s.done && <ChevronRight className="size-4 shrink-0 text-muted-foreground" aria-hidden />}
            </>
          );
          const cls = "flex min-h-14 w-full items-center gap-3 rounded-xl bg-card/80 px-3 py-2 text-left transition-colors outline-none hover:bg-card focus-visible:ring-3 focus-visible:ring-ring/50";
          return (
            <li key={s.label}>
              {s.done ? <div className={cn(cls, "hover:bg-card/80")} aria-label={`${s.label}: done`}>{body}</div>
                : s.href ? <Link href={s.href} className={cls}>{body}</Link>
                : <button type="button" onClick={s.onClick} className={cls}>{body}</button>}
            </li>
          );
        })}
      </ol>
    </section>
  );
}

/** Called after a successful calendar export so the checklist step completes. */
export function markCalendarSynced() {
  try { localStorage.setItem(CAL_KEY, "1"); } catch { /* blocked */ }
}
