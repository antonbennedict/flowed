"use client";

import { format } from "date-fns";
import { CalendarDays, CornerDownLeft, Flag, HelpCircle, Hash, SlidersHorizontal, Sparkles, Tag } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { reportError } from "@/components/editors/common";
import { useEditors } from "@/components/editors/editors-provider";
import { useDb, useLiveQuery } from "@/components/providers/db-provider";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { parseQuickAdd } from "@/lib/quick-add";
import { cn } from "@/lib/utils";

const CHIP_ICON = { date: CalendarDays, time: CalendarDays, subject: Hash, priority: Flag, category: Tag } as const;

/** One-line task entry that understands "Essay due fri 5pm #CS201 !high". */
export function QuickAddBar({ className, autoFocus }: { className?: string; autoFocus?: boolean }) {
  const db = useDb();
  const editors = useEditors();
  const { data: subjects = [] } = useLiveQuery((d) => d.subjects.list(), [], ["subjects"]);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const parsed = useMemo(() => (text.trim() ? parseQuickAdd(text, subjects) : null), [text, subjects]);

  const input = parsed && {
    title: parsed.title || text.trim(),
    dueAt: parsed.dueAt?.toISOString() ?? null,
    subjectId: parsed.subject?.id ?? null,
    priority: parsed.priority ?? "medium",
    category: parsed.category ?? "assignment",
  };

  const save = async () => {
    if (!input || busy) return;
    setBusy(true);
    try {
      const t = await db.tasks.create(input);
      setText("");
      toast.success("Task added", {
        description: [t.title, parsed?.dueAt && format(parsed.dueAt, "EEE MMM d, h:mm a")].filter(Boolean).join(" · "),
        action: { label: "Edit", onClick: () => editors.openTask(t) },
      });
    } catch (err) {
      reportError(err);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className={cn("rounded-2xl border bg-card p-2 shadow-card focus-within:border-primary/50", className)}>
      <form className="flex items-center gap-1.5" onSubmit={(e) => { e.preventDefault(); save(); }}>
        <Sparkles className="ml-2 size-4 shrink-0 text-primary" aria-hidden />
        <Input
          value={text} onChange={(e) => setText(e.target.value)} autoFocus={autoFocus}
          placeholder="e.g. Essay fri 5pm #CS201"
          aria-label="Quick add task: what to do, plus an optional date, #subject and !priority"
          aria-describedby="quick-add-preview"
          enterKeyHint="done" autoComplete="off"
          className="h-11 border-0 bg-transparent px-1 shadow-none focus-visible:ring-0 sm:h-10 dark:bg-transparent"
        />
        <Popover>
          <PopoverTrigger render={<Button type="button" variant="ghost" size="icon-sm" aria-label="Quick add tips" />}>
            <HelpCircle />
          </PopoverTrigger>
          <PopoverContent align="end" className="w-72 text-sm">
            <p className="mb-2 font-semibold">Type naturally</p>
            <ul className="space-y-1.5 text-xs text-muted-foreground">
              <li><b className="text-foreground">Dates:</b> today, tonight, tomorrow, fri, next mon, in 3 days, oct 25, 10/25</li>
              <li><b className="text-foreground">Times:</b> 5pm, 9:30am, 17:00, noon</li>
              <li><b className="text-foreground">Subject:</b> #CS201 or #calc</li>
              <li><b className="text-foreground">Priority:</b> !low, !high, !urgent (or !! / !!!)</li>
              <li><b className="text-foreground">Category:</b> words like quiz, exam, project</li>
            </ul>
          </PopoverContent>
        </Popover>
        <Button type="button" variant="ghost" size="icon-sm" aria-label="Open full task form" disabled={!input}
          onClick={() => { if (input) { editors.openTask(undefined, input); setText(""); } }}>
          <SlidersHorizontal />
        </Button>
        <Button type="submit" size="sm" disabled={!input || busy} aria-label="Save quick task"><CornerDownLeft /> <span className="hidden sm:inline">Add</span></Button>
      </form>
      <div id="quick-add-preview" aria-live="polite" className={cn("flex flex-wrap gap-1.5 px-2", parsed?.recognised.length ? "pt-1.5 pb-1" : "sr-only")}>
        {parsed?.recognised.map((r, i) => {
          const Icon = CHIP_ICON[r.kind];
          const label = r.kind === "date" || r.kind === "time" ? (parsed.dueAt ? format(parsed.dueAt, parsed.hasTime ? "EEE MMM d, h:mm a" : "EEE MMM d") : r.text)
            : r.kind === "priority" ? `${parsed.priority} priority` : r.text;
          if ((r.kind === "time" && parsed.recognised.some((x) => x.kind === "date")) ) return null;
          return (
            <span key={`${r.kind}-${i}`} className="inline-flex items-center gap-1 rounded-full bg-secondary px-2 py-0.5 text-xs font-medium text-secondary-foreground capitalize">
              <Icon className="size-3" aria-hidden />{label}
            </span>
          );
        })}
      </div>
    </div>
  );
}
