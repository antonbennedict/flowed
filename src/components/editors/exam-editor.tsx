"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Plus, Trash2, X } from "lucide-react";
import { useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";
import { useDb } from "@/components/providers/db-provider";
import { useConfirm } from "@/components/shared/confirm";
import { Field } from "@/components/shared/primitives";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { combineDateTime, splitDateTime } from "@/lib/dates";
import { uuid } from "@/lib/db/ids";
import type { ChecklistItem, Exam, ExamInput } from "@/lib/db/schema";
import { dialogFormClass, reportError, SubjectPicker } from "./common";

const formSchema = z.object({
  title: z.string().trim().min(1, "Exam title is required").max(160),
  subjectId: z.string().nullable(),
  date: z.string().min(1, "Pick the exam date"),
  time: z.string().min(1, "Pick the start time"),
  durationMinutes: z.coerce.number<string>().int().min(5, "At least 5 minutes").max(600, "At most 10 hours"),
  venue: z.string().trim().max(120),
  notes: z.string().max(4000),
});
type FormInput = z.input<typeof formSchema>;
type FormValues = z.output<typeof formSchema>;

export function ExamEditor({ open, onOpenChange, exam, defaults }: {
  open: boolean; onOpenChange: (o: boolean) => void; exam?: Exam; defaults?: Partial<ExamInput>;
}) {
  const db = useDb();
  const confirm = useConfirm();
  const [checklist, setChecklist] = useState<ChecklistItem[]>(exam?.checklist ?? []);
  const [newItem, setNewItem] = useState("");
  const when = splitDateTime(exam?.examAt ?? defaults?.examAt);

  const { register, handleSubmit, control, formState: { errors, isSubmitting } } = useForm<FormInput, unknown, FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      title: exam?.title ?? "", subjectId: exam?.subjectId ?? defaults?.subjectId ?? null,
      date: when.date, time: when.time || "09:00", durationMinutes: String(exam?.durationMinutes ?? 60),
      venue: exam?.venue ?? "", notes: exam?.notes ?? "",
    },
  });

  const addItem = () => {
    const t = newItem.trim();
    if (!t) return;
    setChecklist((xs) => [...xs, { id: uuid(), text: t, done: false }]);
    setNewItem("");
  };

  const onSubmit = async (v: FormValues) => {
    const items = newItem.trim() ? [...checklist, { id: uuid(), text: newItem.trim(), done: false }] : checklist;
    const input: ExamInput = {
      title: v.title, subjectId: v.subjectId, examAt: combineDateTime(v.date, v.time), durationMinutes: v.durationMinutes,
      venue: v.venue, notes: v.notes, checklist: items.filter((i) => i.text.trim()), completed: exam?.completed ?? false,
    };
    try {
      if (exam) await db.exams.update(exam.id, input);
      else await db.exams.create(input);
      toast.success(exam ? "Exam updated" : "Exam added");
      onOpenChange(false);
    } catch (err) {
      reportError(err);
    }
  };

  const onDelete = async () => {
    if (!exam) return;
    if (!(await confirm({ title: "Delete this exam?", description: `"${exam.title}" and its preparation checklist will be removed.`, confirmLabel: "Delete", destructive: true }))) return;
    try {
      await db.exams.delete(exam.id);
      toast.success("Exam deleted");
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
            <DialogTitle>{exam ? "Edit exam" : "New exam"}</DialogTitle>
            <DialogDescription>Track the date, venue and what to review.</DialogDescription>
          </DialogHeader>
          <Field label="Title" error={errors.title?.message}>
            {(p) => <Input {...p} {...register("title")} placeholder="e.g. Midterm exam" autoFocus={!exam} />}
          </Field>
          <Field label="Subject">
            {(p) => <Controller control={control} name="subjectId" render={({ field }) => <SubjectPicker {...p} value={field.value} onChange={field.onChange} />} />}
          </Field>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
            <Field label="Date" error={errors.date?.message}>{(p) => <Input {...p} type="date" {...register("date")} />}</Field>
            <Field label="Start time" error={errors.time?.message}>{(p) => <Input {...p} type="time" {...register("time")} />}</Field>
            <Field label="Minutes" error={errors.durationMinutes?.message} className="col-span-2 sm:col-span-1">
              {(p) => <Input {...p} type="number" inputMode="numeric" min={5} max={600} {...register("durationMinutes")} />}
            </Field>
          </div>
          <Field label="Venue">{(p) => <Input {...p} {...register("venue")} placeholder="Main Hall, Room 3" />}</Field>
          <Field label="Notes" hint="Coverage, allowed materials, format…">{(p) => <Textarea {...p} {...register("notes")} rows={3} />}</Field>

          <fieldset className="grid gap-2">
            <legend className="mb-1.5 text-sm font-medium">Preparation checklist</legend>
            {checklist.length > 0 && (
              <ul className="grid gap-1">
                {checklist.map((it) => (
                  <li key={it.id} className="flex items-center gap-2 rounded-lg border bg-card py-1 pr-1 pl-3">
                    <Checkbox checked={it.done} onCheckedChange={(c) => setChecklist((xs) => xs.map((x) => (x.id === it.id ? { ...x, done: !!c } : x)))} aria-label={`Mark "${it.text}" done`} />
                    <Input
                      value={it.text} aria-label="Checklist item"
                      onChange={(e) => setChecklist((xs) => xs.map((x) => (x.id === it.id ? { ...x, text: e.target.value } : x)))}
                      className="h-9 border-0 bg-transparent px-1 shadow-none focus-visible:ring-0 sm:h-8 dark:bg-transparent"
                    />
                    <Button type="button" variant="ghost" size="icon-sm" onClick={() => setChecklist((xs) => xs.filter((x) => x.id !== it.id))} aria-label={`Remove "${it.text}"`}>
                      <X />
                    </Button>
                  </li>
                ))}
              </ul>
            )}
            <div className="flex gap-2">
              <Input value={newItem} onChange={(e) => setNewItem(e.target.value)} placeholder="e.g. Review lecture 1–5" aria-label="New checklist item"
                onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addItem(); } }} />
              <Button type="button" variant="outline" onClick={addItem} aria-label="Add checklist item"><Plus /></Button>
            </div>
          </fieldset>

          <DialogFooter className="sm:justify-between">
            {exam ? <Button type="button" variant="destructive" onClick={onDelete}><Trash2 /> Delete</Button> : <span />}
            <div className="flex flex-col-reverse gap-2 sm:flex-row">
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
              <Button type="submit" disabled={isSubmitting}>{exam ? "Save changes" : "Add exam"}</Button>
            </div>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
