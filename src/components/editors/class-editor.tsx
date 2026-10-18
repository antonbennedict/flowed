"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { AlertTriangle, Trash2 } from "lucide-react";
import { Controller, useForm, useWatch } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";
import { useDb, useLiveQuery } from "@/components/providers/db-provider";
import { useSettings } from "@/components/providers/settings-provider";
import { useConfirm } from "@/components/shared/confirm";
import { Field, SimpleSelect } from "@/components/shared/primitives";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { formatClock, weekdayNames } from "@/lib/dates";
import type { ClassSchedule, ClassScheduleInput } from "@/lib/db/schema";
import { findOverlaps } from "@/lib/insights";
import { dialogFormClass, reportError, SubjectPicker } from "./common";

const formSchema = z
  .object({
    subjectId: z.string({ message: "Choose a subject" }).min(1, "Choose a subject"),
    weekday: z.string(),
    startTime: z.string().min(1, "Start time is required"),
    endTime: z.string().min(1, "End time is required"),
    room: z.string().trim().max(60),
    instructor: z.string().trim().max(80),
  })
  .refine((v) => v.endTime > v.startTime, { message: "End time must be after start time", path: ["endTime"] });
type FormValues = z.infer<typeof formSchema>;

export function ClassEditor({ open, onOpenChange, schedule, defaults }: {
  open: boolean; onOpenChange: (o: boolean) => void; schedule?: ClassSchedule; defaults?: Partial<ClassScheduleInput>;
}) {
  const db = useDb();
  const confirm = useConfirm();
  const settings = useSettings();
  const { data: all = [] } = useLiveQuery((d) => d.schedules.list(), [], ["class_schedules"]);
  const { data: subjects = [] } = useLiveQuery((d) => d.subjects.list(), [], ["subjects"]);

  const { register, handleSubmit, control, formState: { errors, isSubmitting } } = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      subjectId: schedule?.subjectId ?? defaults?.subjectId ?? "",
      weekday: String(schedule?.weekday ?? defaults?.weekday ?? 1),
      startTime: schedule?.startTime ?? defaults?.startTime ?? "09:00",
      endTime: schedule?.endTime ?? defaults?.endTime ?? "10:30",
      room: schedule?.room ?? "", instructor: schedule?.instructor ?? "",
    },
  });
  const [weekday, startTime, endTime] = useWatch({ control, name: ["weekday", "startTime", "endTime"] });
  const overlaps = startTime && endTime && endTime > startTime
    ? findOverlaps(all, { weekday: Number(weekday), startTime, endTime }, schedule?.id)
    : [];
  const subjectName = (id: string) => subjects.find((s) => s.id === id)?.name ?? "Another class";

  const onSubmit = async (v: FormValues) => {
    const input: ClassScheduleInput = { ...v, weekday: Number(v.weekday) };
    try {
      if (schedule) await db.schedules.update(schedule.id, input);
      else await db.schedules.create(input);
      toast.success(schedule ? "Class updated" : "Class added", overlaps.length ? { description: "Saved with a time overlap." } : undefined);
      onOpenChange(false);
    } catch (err) {
      reportError(err);
    }
  };

  const onDelete = async () => {
    if (!schedule) return;
    if (!(await confirm({ title: "Remove this class?", description: "This weekly time slot will be removed from your timetable.", confirmLabel: "Remove", destructive: true }))) return;
    try {
      await db.schedules.delete(schedule.id);
      toast.success("Class removed");
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
            <DialogTitle>{schedule ? "Edit class" : "Add class"}</DialogTitle>
            <DialogDescription>Repeats every week on the chosen day.</DialogDescription>
          </DialogHeader>
          <Field label="Subject" error={errors.subjectId?.message} hint={subjects.length ? undefined : "Create a subject on the Subjects page first."}>
            {(p) => <Controller control={control} name="subjectId" render={({ field }) => (
              <SubjectPicker {...p} allowNone={false} value={field.value || null} onChange={(v) => field.onChange(v ?? "")} />
            )} />}
          </Field>
          <Field label="Day">
            {(p) => <Controller control={control} name="weekday" render={({ field }) => (
              <SimpleSelect {...p} value={field.value} onChange={field.onChange}
                options={weekdayNames(settings.weekStartsOn, "long").map((d) => ({ value: String(d.weekday), label: d.label }))} />
            )} />}
          </Field>
          <div className="grid grid-cols-2 gap-4">
            <Field label="Starts" error={errors.startTime?.message}>{(p) => <Input {...p} type="time" {...register("startTime")} />}</Field>
            <Field label="Ends" error={errors.endTime?.message}>{(p) => <Input {...p} type="time" {...register("endTime")} />}</Field>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Room">{(p) => <Input {...p} {...register("room")} placeholder="Bldg A, Rm 204" />}</Field>
            <Field label="Instructor" hint="Leave blank to use the subject's instructor">{(p) => <Input {...p} {...register("instructor")} />}</Field>
          </div>
          {overlaps.length > 0 && (
            <Alert className="border-warning/40 bg-warning/10">
              <AlertTriangle className="text-warning" />
              <AlertTitle>Schedule overlap</AlertTitle>
              <AlertDescription>
                {overlaps.map((o) => `${subjectName(o.subjectId)} (${formatClock(o.startTime)}–${formatClock(o.endTime)})`).join(", ")} is at the same time. You can still save.
              </AlertDescription>
            </Alert>
          )}
          <DialogFooter className="sm:justify-between">
            {schedule ? <Button type="button" variant="destructive" onClick={onDelete}><Trash2 /> Remove</Button> : <span />}
            <div className="flex flex-col-reverse gap-2 sm:flex-row">
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
              <Button type="submit" disabled={isSubmitting || subjects.length === 0}>{schedule ? "Save changes" : "Add class"}</Button>
            </div>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
