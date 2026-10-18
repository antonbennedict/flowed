"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Check, Trash2 } from "lucide-react";
import { Controller, useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";
import { useDb } from "@/components/providers/db-provider";
import { useConfirm } from "@/components/shared/confirm";
import { Field } from "@/components/shared/primitives";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import type { Subject } from "@/lib/db/schema";
import { dialogFormClass, reportError } from "./common";

export const SUBJECT_COLORS = [
  { hex: "#4F46E5", name: "Indigo" }, { hex: "#7C3AED", name: "Violet" }, { hex: "#C026D3", name: "Fuchsia" },
  { hex: "#DB2777", name: "Pink" }, { hex: "#DC2626", name: "Red" }, { hex: "#EA580C", name: "Orange" },
  { hex: "#CA8A04", name: "Amber" }, { hex: "#16A34A", name: "Green" }, { hex: "#0D9488", name: "Teal" },
  { hex: "#0284C7", name: "Sky" }, { hex: "#475569", name: "Slate" },
];

const formSchema = z.object({
  name: z.string().trim().min(1, "Subject name is required").max(80),
  code: z.string().trim().max(24, "Keep the code under 24 characters"),
  instructor: z.string().trim().max(80),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  notes: z.string().max(4000),
});
type FormValues = z.infer<typeof formSchema>;

export function SubjectEditor({ open, onOpenChange, subject }: { open: boolean; onOpenChange: (o: boolean) => void; subject?: Subject }) {
  const db = useDb();
  const confirm = useConfirm();
  const { register, handleSubmit, control, formState: { errors, isSubmitting } } = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      name: subject?.name ?? "", code: subject?.code ?? "", instructor: subject?.instructor ?? "",
      color: subject?.color ?? SUBJECT_COLORS[0].hex, notes: subject?.notes ?? "",
    },
  });

  const onSubmit = async (v: FormValues) => {
    try {
      if (subject) await db.subjects.update(subject.id, v);
      else await db.subjects.create(v);
      toast.success(subject ? "Subject updated" : "Subject added");
      onOpenChange(false);
    } catch (err) {
      reportError(err);
    }
  };

  const onDelete = async () => {
    if (!subject) return;
    const ok = await confirm({
      title: `Delete ${subject.name}?`,
      description: "Its class schedule will be deleted. Tasks, exams and focus sessions are kept but no longer linked to a subject.",
      confirmLabel: "Delete subject", destructive: true,
    });
    if (!ok) return;
    try {
      await db.subjects.delete(subject.id);
      toast.success("Subject deleted");
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
            <DialogTitle>{subject ? "Edit subject" : "New subject"}</DialogTitle>
            <DialogDescription>Subjects group your classes, tasks and exams.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 sm:grid-cols-[1fr_9rem]">
            <Field label="Name" error={errors.name?.message}>
              {(p) => <Input {...p} {...register("name")} placeholder="e.g. Organic Chemistry" autoFocus={!subject} />}
            </Field>
            <Field label="Code" error={errors.code?.message}>
              {(p) => <Input {...p} {...register("code")} placeholder="CHEM 201" autoCapitalize="characters" />}
            </Field>
          </div>
          <Field label="Instructor">
            {(p) => <Input {...p} {...register("instructor")} placeholder="Prof. Santos" autoComplete="off" />}
          </Field>
          <Controller control={control} name="color" render={({ field }) => (
            <fieldset>
              <legend className="mb-2 text-sm font-medium">Colour label</legend>
              <div role="radiogroup" aria-label="Colour label" className="flex flex-wrap gap-2">
                {SUBJECT_COLORS.map((c) => {
                  const selected = field.value.toLowerCase() === c.hex.toLowerCase();
                  return (
                    <button
                      key={c.hex} type="button" role="radio" aria-checked={selected} aria-label={c.name}
                      onClick={() => field.onChange(c.hex)}
                      className="flex size-10 items-center justify-center rounded-full ring-offset-2 ring-offset-background transition-transform aria-checked:ring-2 aria-checked:ring-foreground/70 active:scale-95 sm:size-8"
                      style={{ background: c.hex }}
                    >
                      {selected && <Check className="size-4 text-white" aria-hidden />}
                    </button>
                  );
                })}
              </div>
            </fieldset>
          )} />
          <Field label="Notes" hint="Grading breakdown, office hours, links…">
            {(p) => <Textarea {...p} {...register("notes")} rows={4} />}
          </Field>
          <DialogFooter className="sm:justify-between">
            {subject ? <Button type="button" variant="destructive" onClick={onDelete}><Trash2 /> Delete</Button> : <span />}
            <div className="flex flex-col-reverse gap-2 sm:flex-row">
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
              <Button type="submit" disabled={isSubmitting}>{subject ? "Save changes" : "Add subject"}</Button>
            </div>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
