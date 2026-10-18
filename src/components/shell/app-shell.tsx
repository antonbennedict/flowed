"use client";

import {
  BarChart3, BookOpen, CalendarDays, CalendarRange, CheckSquare, ClipboardCheck, GraduationCap, LayoutDashboard,
  MoreHorizontal, Plus, ScanLine, Settings, Timer, type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { useEditors } from "@/components/editors/editors-provider";
import { formatClockMs, useFocusTimer } from "@/components/focus/focus-provider";
import { FlowedMark } from "@/components/brand/flowed-mark";
import { HeadsUpBell } from "@/components/heads-up/heads-up-panel";
import { ImportScheduleDialog } from "@/components/schedule/import-schedule-dialog";
import { useSettings } from "@/components/providers/settings-provider";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";

interface NavItem { href: string; label: string; icon: LucideIcon }

const NAV_GROUPS: { label: string; items: NavItem[] }[] = [
  { label: "Plan", items: [
    { href: "/", label: "Dashboard", icon: LayoutDashboard },
    { href: "/tasks", label: "Tasks", icon: CheckSquare },
    { href: "/calendar", label: "Calendar", icon: CalendarDays },
  ] },
  { label: "Study", items: [
    { href: "/subjects", label: "Subjects", icon: BookOpen },
    { href: "/schedule", label: "Class schedule", icon: CalendarRange },
    { href: "/exams", label: "Exams", icon: GraduationCap },
    { href: "/focus", label: "Focus timer", icon: Timer },
  ] },
  { label: "Insights", items: [
    { href: "/analytics", label: "Analytics", icon: BarChart3 },
    { href: "/review", label: "Weekly review", icon: ClipboardCheck },
  ] },
];
const SETTINGS: NavItem = { href: "/settings", label: "Settings", icon: Settings };
const BOTTOM: NavItem[] = [
  { href: "/", label: "Home", icon: LayoutDashboard },
  { href: "/tasks", label: "Tasks", icon: CheckSquare },
  { href: "/calendar", label: "Calendar", icon: CalendarDays },
  { href: "/focus", label: "Focus", icon: Timer },
];
const MORE: NavItem[] = [
  { href: "/subjects", label: "Subjects", icon: BookOpen },
  { href: "/schedule", label: "Schedule", icon: CalendarRange },
  { href: "/exams", label: "Exams", icon: GraduationCap },
  { href: "/analytics", label: "Analytics", icon: BarChart3 },
  { href: "/review", label: "Weekly review", icon: ClipboardCheck },
  SETTINGS,
];

const normalize = (p: string) => (p.length > 1 ? p.replace(/\/$/, "") : p);
function useIsActive() {
  const pathname = normalize(usePathname() ?? "/");
  return (href: string) => (href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(`${href}/`));
}

function QuickAdd({ compact }: { compact?: boolean }) {
  const editors = useEditors();
  const [importOpen, setImportOpen] = useState(false);
  return (
    <>
    <ImportScheduleDialog open={importOpen} onOpenChange={setImportOpen} />
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button size={compact ? "icon" : "default"} aria-label="Quick add" className={compact ? "rounded-full" : "w-full justify-start"}>
            <Plus /> {!compact && "New"}
          </Button>
        }
      />
      <DropdownMenuContent align={compact ? "end" : "start"} className="w-52">
        <DropdownMenuItem className="py-2.5" onClick={() => editors.openTask()}><CheckSquare /> Task</DropdownMenuItem>
        <DropdownMenuItem className="py-2.5" onClick={() => editors.openExam()}><GraduationCap /> Exam</DropdownMenuItem>
        <DropdownMenuItem className="py-2.5" onClick={() => editors.openClass()}><CalendarRange /> Class</DropdownMenuItem>
        <DropdownMenuItem className="py-2.5" onClick={() => editors.openEvent()}><CalendarDays /> Personal event</DropdownMenuItem>
        <DropdownMenuItem className="py-2.5" onClick={() => editors.openSubject()}><BookOpen /> Subject</DropdownMenuItem>
        <DropdownMenuItem className="py-2.5" onClick={() => setImportOpen(true)}><ScanLine /> Import schedule…</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
    </>
  );
}

function Brand() {
  return (
    <Link href="/" className="flex items-center gap-2.5 rounded-lg outline-none focus-visible:ring-3 focus-visible:ring-ring/50">
      <FlowedMark className="size-9 drop-shadow-sm" />
      <span className="text-lg font-extrabold tracking-tight">Flowed</span>
    </Link>
  );
}

function Sidebar() {
  const isActive = useIsActive();
  const settings = useSettings();
  const link = (item: NavItem) => {
    const active = isActive(item.href);
    return (
      <Link
        key={item.href} href={item.href} aria-current={active ? "page" : undefined}
        className={cn(
          "flex h-10 items-center gap-3 rounded-xl px-3 text-sm font-medium text-muted-foreground transition-colors duration-150 outline-none hover:bg-sidebar-accent hover:text-sidebar-accent-foreground focus-visible:ring-3 focus-visible:ring-ring/50",
          active && "bg-sidebar-accent text-sidebar-accent-foreground",
        )}
      >
        <item.icon className={cn("size-[18px]", active && "text-primary")} aria-hidden />
        {item.label}
      </Link>
    );
  };
  return (
    <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 flex-col border-r bg-sidebar pt-safe pl-safe lg:flex">
      <div className="flex h-16 items-center justify-between pr-3 pl-5"><Brand /><HeadsUpBell /></div>
      <div className="space-y-2 px-4 pb-2"><QuickAdd /><FocusPill /></div>
      <nav aria-label="Main" className="flex-1 space-y-5 overflow-y-auto px-3 py-3">
        {NAV_GROUPS.map((g) => (
          <div key={g.label}>
            <p className="mb-1 px-3 text-2xs font-semibold tracking-wider text-muted-foreground/80 uppercase">{g.label}</p>
            <div className="space-y-0.5">{g.items.map(link)}</div>
          </div>
        ))}
      </nav>
      <div className="border-t p-3 pb-safe">
        {link(SETTINGS)}
        {settings.displayName && (
          <p className="mt-2 truncate px-3 text-xs text-muted-foreground">
            {settings.displayName}{settings.course ? ` · ${settings.course}` : ""}
          </p>
        )}
      </div>
    </aside>
  );
}

/** Shows a running/paused timer while you're on another page. */
function FocusPill() {
  const timer = useFocusTimer();
  const pathname = normalize(usePathname() ?? "/");
  if (timer.status === "idle" || pathname === "/focus") return null;
  return (
    <Link href="/focus" className="inline-flex h-9 items-center gap-1.5 rounded-full bg-secondary px-3 text-sm font-semibold text-secondary-foreground tabular" aria-label={`Focus timer ${timer.status}, ${formatClockMs(timer.remainingMs)} left`}>
      <Timer className={cn("size-4", timer.status === "running" && "animate-pulse")} aria-hidden />
      {formatClockMs(timer.remainingMs)}
    </Link>
  );
}

function MobileHeader() {
  return (
    <header className="sticky top-0 z-30 border-b bg-background/85 pt-safe backdrop-blur-md lg:hidden">
      <div className="flex h-14 items-center justify-between px-4">
        <Brand />
        <div className="flex items-center gap-2">
          <FocusPill />
          <HeadsUpBell />
          <QuickAdd compact />
        </div>
      </div>
    </header>
  );
}

function BottomNav() {
  const isActive = useIsActive();
  const [moreOpen, setMoreOpen] = useState(false);
  const moreActive = MORE.some((m) => isActive(m.href));
  const tab = "flex min-h-14 flex-1 flex-col items-center justify-center gap-0.5 text-2xs font-medium text-muted-foreground transition-colors outline-none focus-visible:bg-muted aria-[current=page]:text-primary";
  return (
    <>
      <nav aria-label="Main" className="fixed inset-x-0 bottom-0 z-30 border-t bg-background/95 pb-safe backdrop-blur-md lg:hidden">
        <div className="mx-auto flex max-w-lg">
          {BOTTOM.map((item) => {
            const active = isActive(item.href);
            return (
              <Link key={item.href} href={item.href} aria-current={active ? "page" : undefined} className={tab}>
                <span className={cn("flex h-7 w-12 items-center justify-center rounded-full transition-colors", active && "bg-secondary")}>
                  <item.icon className="size-5" aria-hidden />
                </span>
                {item.label}
              </Link>
            );
          })}
          <button type="button" onClick={() => setMoreOpen(true)} aria-current={moreActive ? "page" : undefined} aria-haspopup="dialog" className={tab}>
            <span className={cn("flex h-7 w-12 items-center justify-center rounded-full", moreActive && "bg-secondary")}>
              <MoreHorizontal className="size-5" aria-hidden />
            </span>
            More
          </button>
        </div>
      </nav>
      <Sheet open={moreOpen} onOpenChange={setMoreOpen}>
        <SheetContent side="bottom" className="rounded-t-3xl pb-safe">
          <SheetHeader><SheetTitle>More</SheetTitle></SheetHeader>
          <div className="grid grid-cols-3 gap-2 px-4 pb-6">
            {MORE.map((item) => (
              <Link
                key={item.href} href={item.href} onClick={() => setMoreOpen(false)} aria-current={isActive(item.href) ? "page" : undefined}
                className="flex min-h-20 flex-col items-center justify-center gap-1.5 rounded-2xl border bg-card p-2 text-xs font-medium transition-colors outline-none hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50 aria-[current=page]:border-primary aria-[current=page]:text-primary"
              >
                <item.icon className="size-5" aria-hidden />
                {item.label}
              </Link>
            ))}
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}

export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-dvh">
      <a href="#main" className="sr-only z-50 rounded-lg bg-primary px-3 py-2 text-primary-foreground focus:not-sr-only focus:fixed focus:top-3 focus:left-3">
        Skip to content
      </a>
      <Sidebar />
      <MobileHeader />
      <main id="main" tabIndex={-1} className="pr-safe pl-safe outline-none lg:ml-64">
        <div className="mx-auto w-full max-w-6xl px-4 pt-5 pb-[calc(6rem+env(safe-area-inset-bottom))] sm:px-6 lg:px-8 lg:pt-8 lg:pb-12">
          {children}
        </div>
      </main>
      <BottomNav />
    </div>
  );
}
