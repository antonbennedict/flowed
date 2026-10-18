"use client";

import { ListChecks } from "lucide-react";
import { toast } from "sonner";
import { useEditors } from "@/components/editors/editors-provider";
import { reportError } from "@/components/editors/common";
import { useDb } from "@/components/providers/db-provider";
import { Countdown, PriorityBadge, SubjectDot } from "@/components/shared/primitives";
import { Checkbox } from "@/components/ui/checkbox";
import { friendlyDateTime } from "@/lib/dates";
import type { Subject, Subtask, Task } from "@/lib/db/schema";
import { cn } from "@/lib/utils";

export function TaskRow({ task, subject, subtasks = [], compact }: { task: Task; subject?: Subject; subtasks?: Subtask[]; compact?: boolean }) {
  const db = useDb();
  const editors = useEditors();
  const done = subtasks.filter((s) => s.completed).length;

  const toggle = async (completed: boolean) => {
    try {
      await db.tasks.setCompleted(task.id, completed);
      if (completed)
        toast.success("Task completed", {
          description: task.title,
          action: { label: "Undo", onClick: () => db.tasks.setCompleted(task.id, false).catch(reportError) },
        });
    } catch (err) {
      reportError(err);
    }
  };

  return (
    <li className={cn("group flex items-start gap-3 rounded-xl border bg-card px-3 transition-colors hover:border-primary/30", compact ? "py-2.5" : "py-3")}>
      <div className="flex min-h-6 items-center pt-0.5">
        <Checkbox checked={task.completed} onCheckedChange={(c) => toggle(!!c)} aria-label={task.completed ? `Mark "${task.title}" not done` : `Complete "${task.title}"`} />
      </div>
      <button type="button" onClick={() => editors.openTask(task)} className="min-w-0 flex-1 rounded-md text-left outline-none focus-visible:ring-3 focus-visible:ring-ring/50">
        <span className={cn("block truncate text-sm font-medium", task.completed && "text-muted-foreground line-through")}>{task.title}</span>
        <span className="mt-1 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-xs text-muted-foreground">
          {subject && (
            <span className="inline-flex items-center gap-1.5">
              <SubjectDot color={subject.color} className="size-2" /> {subject.code || subject.name}
            </span>
          )}
          {!compact && <span className="capitalize">{task.category}</span>}
          {task.dueAt && <span className="tabular">{friendlyDateTime(task.dueAt)}</span>}
          {subtasks.length > 0 && (
            <span className="inline-flex items-center gap-1 tabular">
              <ListChecks className="size-3" aria-hidden /> {done}/{subtasks.length}
            </span>
          )}
        </span>
      </button>
      <div className="flex shrink-0 flex-col items-end gap-1.5">
        <PriorityBadge priority={task.priority} />
        {task.dueAt && <Countdown iso={task.dueAt} done={task.completed} />}
      </div>
    </li>
  );
}
