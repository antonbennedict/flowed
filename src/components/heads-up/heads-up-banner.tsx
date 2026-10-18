"use client";

import { AlarmClock, AlertTriangle, ChevronRight } from "lucide-react";
import { useHeadsUp } from "./heads-up-provider";
import { cn } from "@/lib/utils";

/** The single most urgent heads-up, shown at the top of the dashboard. */
export function HeadsUpBanner() {
  const { alerts, attention, setPanelOpen } = useHeadsUp();
  const top = alerts.find((a) => a.severity !== "info");
  if (!top) return null;
  const critical = top.severity === "critical";
  const Icon = critical ? AlertTriangle : AlarmClock;
  return (
    <button type="button" onClick={() => setPanelOpen(true)}
      className={cn("flex w-full items-center gap-3 rounded-2xl border p-3 text-left transition-colors outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
        critical ? "border-destructive/30 bg-destructive/8 hover:bg-destructive/12" : "border-warning/40 bg-warning/10 hover:bg-warning/15")}>
      <span className={cn("flex size-9 shrink-0 items-center justify-center rounded-xl", critical ? "bg-destructive/15 text-destructive" : "bg-warning/20 text-warning")}>
        <Icon className="size-4.5" aria-hidden />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-semibold">{top.title}</span>
        <span className="block truncate text-xs text-muted-foreground">
          {top.body}{attention > 1 ? ` · +${attention - 1} more` : ""}
        </span>
      </span>
      <span className="sr-only">Open heads-up</span>
      <ChevronRight className="size-4 shrink-0 text-muted-foreground" aria-hidden />
    </button>
  );
}
