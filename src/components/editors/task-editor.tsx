"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Plus, Trash2, X } from "lucide-react";
import { useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";
import { useDb, useLiveQuery } from "@/components/providers/db-provider";
import { useSettings } from "@/components/providers/settings-provider";
import { useConfirm } from "@/components/shared/confirm";
import { Field, SimpleSelect } from "@/components/shared/primitives";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { combineDateTime, splitDateTime } from "@/lib/dates";
import type { ChecklistDraft } from "@/lib/db/repositories";
import { CATEGORIES, PRIORITIES, type Task, type TaskInput } from "@/lib/db/schema";
import { dialogFormClass, reportError, SubjectPicker } from "./common";

const formSchema = z
  .object({
    title: z.string().trim().min(1, "Give the task a title").max(160, "Keep the title under 160 characters"),
    description: z.string().max(4000),
    subjectId: z.string().nullable(),
    dueDate: z.string(),
    dueTime: z.string(),
    priority: z.enum(PRIORITIES),
    category: z.enum(CATEGORIES),
  })
  .refine((v) => !v.dueTime || v.dueDate, { message: "Pick a date for this time", path: ["dueDate"] });
type FormValues = z.infer<typeof formSchema>;

const label = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

interface EditorProps {
  open: boolean; onOpenChange: (o: boolean) => void; task?: Task; defaults?: Partial<TaskInput>;
}

/** Loads the task's checklist first so the form starts with it (no flash, no effect syncing). */
export function TaskEditor(props: EditorProps) {
  const id = props.task?.id ?? null;
  const { data: existing } = useLiveQuery((d) => (id ? d.subtasks.listByTask(id) : Promise.resolve([])), [id], ["subtasks"]);
  if (!existing) return null;
  return <TaskEditorForm {...props} initialItems={existing.map((s) => ({ id: s.id, title: s.title, completed: s.completed }))} />;
}

function TaskEditorForm({ open, onOpenChange, task, defaults, initialItems }: EditorProps & { initialItems: ChecklistDraft[] }) {
  const db = useDb();
  const confirm = useConfirm();
  const settings = useSettings();
  const [items, setItems] = useState<ChecklistDraft[]>(initialItems);
  const [newItem, setNewItem] = useState("");

  const due = splitDateTime(task?.dueAt ?? defaults?.dueAt);
  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      title: task?.title ?? defaults?.title ?? "",
      description: task?.description ?? "",
      subjectId: task?.subjectId ?? defaults?.subjectId ?? null,
      dueDate: due.date,
      dueTime: due.time,
      priority: task?.priority ?? defaults?.priority ?? "medium",
      category: task?.category ?? defaults?.category ?? "assignment",
    },
  });
  const { register, handleSubmit, control, formState: { errors, isSubmitting } } = form;

  const addItem = () => {
    const t = newItem.trim();
    if (!t) return;
    setItems((xs) => [...xs, { title: t, completed: false }]);
    setNewItem("");
  };

  const onSubmit = async (v: FormValues) => {
    const input: TaskInput = {
      title: v.title,
      description: v.description,
      subjectId: v.subjectId,
      dueAt: v.dueDate ? combineDateTime(v.dueDate, v.dueTime || "23:59") : null,
      priority: v.priority,
      category: v.category,
    };
    try {
      const pending = newItem.trim() ? [...items, { title: newItem.trim(), completed: false }] : items;
      await db.tasks.saveWithSubtasks(task?.id ?? null, input, pending);
      toast.success(task ? "Task updated" : "Task added", {
        description: input.dueAt && settings.remindersEnabled ? "A reminder will be scheduled where supported." : undefined,
      });
      onOpenChange(false);
    } catch (err) {
      reportError(err);
    }
  };

  const onDelete = async () => {
    if (!task) return;
    if (!(await confirm({ title: "Delete this task?", description: `"${task.title}" and its checklist will be removed permanently.`, confirmLabel: "Delete", destructive: true }))) return;
    try {
      await db.tasks.delete(task.id);
      toast.success("Task deleted");
      onOpenChange(false);
    } catch (err) {
      reportError(err);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className={dialogFormClass}>
        <form onSubmit={handleSubmit(onSubmit)} className="grid gap-4" noValidate>
          <DialogHeader>
            <DialogTitle>{task ? "Edit task" : "New task"}</DialogTitle>
            <DialogDescription>Saved on this device. Due tasks get a local reminder.</DialogDescription>
          </DialogHeader>

          <Field label="Title" error={errors.title?.message}>
            {(p) => <Input {...p} {...register("title")} placeholder="e.g. Chapter 4 problem set" autoFocus={!task} enterKeyHint="next" />}
          </Field>

          <Field label="Description" hint="Optional notes, links or instructions.">
            {(p) => <Textarea {...p} {...register("description")} rows={3} />}
          </Field>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Subject">
              {(p) => <Controller control={control} name="subjectId" render={({ field }) => <SubjectPicker {...p} value={field.value} onChange={field.onChange} />} />}
            </Field>
            <Field label="Category">
              {(p) => (
                <Controller control={control} name="category" render={({ field }) => (
                  <SimpleSelect {...p} value={field.value} onChange={field.onChange} options={CATEGORIES.map((c) => ({ value: c, label: label(c) }))} />
                )} />
              )}
            </Field>
            <Field label="Due date" error={errors.dueDate?.message}>
              {(p) => <Input {...p} type="date" {...register("dueDate")} />}
            </Field>
            <Field label="Due time" hint="Defaults to 11:59 PM">
              {(p) => <Input {...p} type="time" {...register("dueTime")} />}
            </Field>
          </div>

          <Field label="Priority">
            {() => (
              <Controller control={control} name="priority" render={({ field }) => (
                <div role="radiogroup" aria-label="Priority" className="grid grid-cols-4 gap-1.5 rounded-xl bg-muted p-1">
                  {PRIORITIES.map((p) => (
                    <button
                      key={p} type="button" role="radio" aria-checked={field.value === p} onClick={() => field.onChange(p)}
                      className="h-10 rounded-lg text-sm font-medium capitalize text-muted-foreground transition-colors aria-checked:bg-card aria-checked:text-foreground aria-checked:shadow-sm sm:h-8"
                    >
                      {p}
                    </button>
                  ))}
                </div>
              )} />
            )}
          </Field>

          <fieldset className="grid gap-2">
            <legend className="mb-1.5 text-sm font-medium">Checklist</legend>
            {items.length > 0 && (
              <ul className="grid gap-1">
                {items.map((it, i) => (
                  <li key={it.id ?? `new-${i}`} className="flex items-center gap-2 rounded-lg border bg-card py-1 pr-1 pl-3">
                    <Checkbox
                      checked={it.completed}
                      onCheckedChange={(c) => setItems((xs) => xs.map((x, j) => (j === i ? { ...x, completed: !!c } : x)))}
                      aria-label={`Mark "${it.title}" done`}
                    />
                    <Input
                      value={it.title}
                      onChange={(e) => setItems((xs) => xs.map((x, j) => (j === i ? { ...x, title: e.target.value } : x)))}
                      className="h-9 border-0 bg-transparent px-1 shadow-none focus-visible:ring-0 sm:h-8 dark:bg-transparent"
                      aria-label="Checklist item"
                    />
                    <Button type="button" variant="ghost" size="icon-sm" onClick={() => setItems((xs) => xs.filter((_, j) => j !== i))} aria-label={`Remove "${it.title}"`}>
                      <X />
                    </Button>
                  </li>
                ))}
              </ul>
            )}
            <div className="flex gap-2">
              <Input
                value={newItem}
                onChange={(e) => setNewItem(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addItem(); } }}
                placeholder="Add a step…"
                aria-label="New checklist item"
                enterKeyHint="done"
              />
              <Button type="button" variant="outline" onClick={addItem} aria-label="Add checklist item">
                <Plus />
              </Button>
            </div>
          </fieldset>

          <DialogFooter className="sm:justify-between">
            {task ? (
              <Button type="button" variant="destructive" onClick={onDelete}>
                <Trash2 /> Delete
              </Button>
            ) : <span />}
            <div className="flex flex-col-reverse gap-2 sm:flex-row">
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
              <Button type="submit" disabled={isSubmitting}>{isSubmitting ? "Saving…" : task ? "Save changes" : "Add task"}</Button>
            </div>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
