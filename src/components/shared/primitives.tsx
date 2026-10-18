"use client";

import { AlertTriangle, Clock, RefreshCw, type LucideIcon } from "lucide-react";
import { useEffect, useId, useState } from "react";
import { cn } from "@/lib/utils";
import { countdown } from "@/lib/dates";
import type { Priority } from "@/lib/db/schema";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";

export function PageHeader({ title, description, actions }: { title: string; description?: React.ReactNode; actions?: React.ReactNode }) {
  return (
    // Title and primary action share one row on every screen size.
    <header className="mb-5 flex items-start justify-between gap-3 sm:mb-6">
      <div className="min-w-0 flex-1">
        <h1 className="text-2xl font-bold tracking-tight text-balance sm:text-3xl">{title}</h1>
        {description && <p className="mt-1 max-w-prose text-sm text-pretty text-muted-foreground">{description}</p>}
      </div>
      {actions && <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">{actions}</div>}
    </header>
  );
}

export function SectionCard({ title, icon: Icon, action, children, className }: {
  title: string; icon?: LucideIcon; action?: React.ReactNode; children: React.ReactNode; className?: string;
}) {
  return (
    <section className={cn("rounded-2xl border bg-card p-4 shadow-card sm:p-5", className)}>
      <div className="mb-3 flex items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 text-sm font-semibold">
          {Icon && <Icon className="size-4 text-primary" aria-hidden />}
          {title}
        </h2>
        {action}
      </div>
      {children}
    </section>
  );
}

export function EmptyState({ icon: Icon, title, description, action, compact }: {
  icon: LucideIcon; title: string; description?: string; action?: React.ReactNode; compact?: boolean;
}) {
  return (
    <div className={cn("flex flex-col items-center justify-center gap-2 text-center", compact ? "py-6" : "rounded-2xl border border-dashed py-12 px-6")}>
      <div className="flex size-11 items-center justify-center rounded-xl bg-secondary text-secondary-foreground">
        <Icon className="size-5" aria-hidden />
      </div>
      <p className="font-medium">{title}</p>
      {description && <p className="max-w-xs text-sm text-muted-foreground">{description}</p>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div role="alert" className="flex flex-col items-center gap-2 rounded-2xl border border-destructive/30 bg-destructive/5 px-6 py-8 text-center">
      <AlertTriangle className="size-6 text-destructive" aria-hidden />
      <p className="text-sm font-medium">Something went wrong</p>
      <p className="max-w-sm text-sm text-muted-foreground">{message}</p>
      {onRetry && (
        <Button variant="outline" onClick={onRetry} className="mt-1">
          <RefreshCw /> Retry
        </Button>
      )}
    </div>
  );
}

export function ListSkeleton({ rows = 4, className }: { rows?: number; className?: string }) {
  return (
    <div className={cn("space-y-2", className)} aria-busy="true" aria-label="Loading">
      {Array.from({ length: rows }, (_, i) => (
        <Skeleton key={i} className="h-16 w-full rounded-xl" />
      ))}
    </div>
  );
}

/** Label + control + inline error/help text, wired up for screen readers. */
export function Field({ label, error, hint, children, className, htmlFor }: {
  label: string; error?: string; hint?: string; children: (props: { id: string; "aria-invalid"?: boolean; "aria-describedby"?: string }) => React.ReactNode;
  className?: string; htmlFor?: string;
}) {
  const auto = useId();
  const id = htmlFor ?? auto;
  const descId = `${id}-desc`;
  return (
    <div className={cn("grid gap-1.5", className)}>
      <Label htmlFor={id}>{label}</Label>
      {children({ id, "aria-invalid": error ? true : undefined, "aria-describedby": error || hint ? descId : undefined })}
      {error ? (
        <p id={descId} className="text-xs font-medium text-destructive" role="alert">{error}</p>
      ) : hint ? (
        <p id={descId} className="text-xs text-muted-foreground">{hint}</p>
      ) : null}
    </div>
  );
}

export interface Option { value: string; label: React.ReactNode }

/** Thin wrapper over the Base UI Select that shows option labels, not raw values. */
export function SimpleSelect({ value, onChange, options, placeholder, id, className, ariaLabel, size, ...aria }: {
  value: string; onChange: (v: string) => void; options: Option[]; placeholder?: string; id?: string; className?: string;
  ariaLabel?: string; size?: "sm" | "default"; "aria-invalid"?: boolean; "aria-describedby"?: string;
}) {
  const items = Object.fromEntries(options.map((o) => [o.value, o.label]));
  return (
    <Select value={value} onValueChange={(v) => onChange((v as string) ?? "")} items={items}>
      <SelectTrigger id={id} size={size} className={cn("w-full", className)} aria-label={ariaLabel} {...aria}>
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        {options.map((o) => (
          <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

export const PRIORITY_STYLES: Record<Priority, string> = {
  low: "bg-muted text-muted-foreground",
  medium: "bg-secondary text-secondary-foreground",
  high: "bg-warning/15 text-warning",
  urgent: "bg-destructive/12 text-destructive",
};

export function PriorityBadge({ priority }: { priority: Priority }) {
  return (
    <span className={cn("inline-flex h-5 items-center rounded-md px-1.5 text-2xs font-semibold capitalize whitespace-nowrap", PRIORITY_STYLES[priority])}>
      {priority}
    </span>
  );
}

export function SubjectDot({ color, className }: { color?: string | null; className?: string }) {
  return <span aria-hidden className={cn("inline-block size-2.5 shrink-0 rounded-full", className)} style={{ background: color ?? "var(--muted-foreground)" }} />;
}

/** Live countdown that refreshes every 30s. */
export function Countdown({ iso, done, className }: { iso: string; done?: boolean; className?: string }) {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(t);
  }, []);
  if (done) return null;
  const c = countdown(iso, now);
  return (
    <span className={cn("inline-flex items-center gap-1 text-xs font-medium whitespace-nowrap tabular", c.overdue ? "text-destructive" : c.urgent ? "text-warning" : "text-muted-foreground", className)}>
      <Clock className="size-3" aria-hidden />
      {c.label}
    </span>
  );
}

export function StatTile({ label, value, hint, icon: Icon, tone = "primary" }: {
  label: string; value: React.ReactNode; hint?: React.ReactNode; icon: LucideIcon; tone?: "primary" | "success" | "warning" | "destructive" | "accent";
}) {
  const tones = {
    primary: "bg-secondary text-secondary-foreground",
    success: "bg-success/12 text-success",
    warning: "bg-warning/15 text-warning",
    destructive: "bg-destructive/10 text-destructive",
    accent: "bg-accent text-accent-foreground",
  };
  return (
    <div className="rounded-2xl border bg-card p-4 shadow-card">
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-medium text-muted-foreground">{label}</span>
        <span className={cn("flex size-8 items-center justify-center rounded-lg", tones[tone])}>
          <Icon className="size-4" aria-hidden />
        </span>
      </div>
      <div className="mt-2 text-2xl font-bold tracking-tight tabular">{value}</div>
      {hint && <div className="mt-0.5 text-xs text-muted-foreground">{hint}</div>}
    </div>
  );
}
