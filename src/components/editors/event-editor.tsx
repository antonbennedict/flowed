"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Trash2 } from "lucide-react";
import { Controller, useForm, useWatch } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";
import { useDb } from "@/components/providers/db-provider";
import { useConfirm } from "@/components/shared/confirm";
import { Field } from "@/components/shared/primitives";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { combineDateTime, splitDateTime } from "@/lib/dates";
import type { PersonalEvent, PersonalEventInput } from "@/lib/db/schema";
import { dialogFormClass, reportError } from "./common";

const formSchema = z
  .object({
    title: z.string().trim().min(1, "Event title is required").max(160),
    location: z.string().trim().max(120),
    description: z.string().max(4000),
    allDay: z.boolean(),
    startDate: z.string().min(1, "Pick a start date"),
    startTime: z.string(),
    endDate: z.string().min(1, "Pick an end date"),
    endTime: z.string(),
  })
  .refine((v) => (v.allDay ? v.endDate >= v.startDate : `${v.endDate}T${v.endTime || "00:00"}` >= `${v.startDate}T${v.startTime || "00:00"}`), {
    message: "End must be after start", path: ["endDate"],
  });
type FormValues = z.infer<typeof formSchema>;

export function EventEditor({ open, onOpenChange, event, defaults }: {
  open: boolean; onOpenChange: (o: boolean) => void; event?: PersonalEvent; defaults?: Partial<PersonalEventInput>;
}) {
  const db = useDb();
  const confirm = useConfirm();
  const s = splitDateTime(event?.startAt ?? defaults?.startAt);
  const e = splitDateTime(event?.endAt ?? defaults?.endAt ?? defaults?.startAt);
  const { register, handleSubmit, control, formState: { errors, isSubmitting } } = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      title: event?.title ?? "", location: event?.location ?? "", description: event?.description ?? "",
      allDay: event?.allDay ?? false, startDate: s.date, startTime: s.time || "18:00", endDate: e.date || s.date, endTime: e.time || "19:00",
    },
  });
  const allDay = useWatch({ control, name: "allDay" });

  const onSubmit = async (v: FormValues) => {
    const input: PersonalEventInput = {
      title: v.title, location: v.location, description: v.description, allDay: v.allDay,
      startAt: combineDateTime(v.startDate, v.allDay ? "00:00" : v.startTime || "00:00"),
      endAt: combineDateTime(v.endDate, v.allDay ? "23:59" : v.endTime || "23:59"),
    };
    try {
      if (event) await db.events.update(event.id, input);
      else await db.events.create(input);
      toast.success(event ? "Event updated" : "Event added");
      onOpenChange(false);
    } catch (err) {
      reportError(err);
    }
  };

  const onDelete = async () => {
    if (!event) return;
    if (!(await confirm({ title: "Delete this event?", confirmLabel: "Delete", destructive: true }))) return;
    try {
      await db.events.delete(event.id);
      toast.success("Event deleted");
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
            <DialogTitle>{event ? "Edit event" : "New personal event"}</DialogTitle>
            <DialogDescription>Club meetings, shifts, appointments — anything outside class.</DialogDescription>
          </DialogHeader>
          <Field label="Title" error={errors.title?.message}>{(p) => <Input {...p} {...register("title")} autoFocus={!event} />}</Field>
          <Controller control={control} name="allDay" render={({ field }) => (
            <div className="flex items-center justify-between rounded-xl border px-3 py-2.5">
              <Label htmlFor="event-allday">All-day</Label>
              <Switch id="event-allday" checked={field.value} onCheckedChange={field.onChange} />
            </div>
          )} />
          <div className="grid grid-cols-2 gap-4">
            <Field label="Starts">{(p) => <Input {...p} type="date" {...register("startDate")} />}</Field>
            {!allDay && <Field label="Start time">{(p) => <Input {...p} type="time" {...register("startTime")} />}</Field>}
            <Field label="Ends" error={errors.endDate?.message}>{(p) => <Input {...p} type="date" {...register("endDate")} />}</Field>
            {!allDay && <Field label="End time">{(p) => <Input {...p} type="time" {...register("endTime")} />}</Field>}
          </div>
          <Field label="Location">{(p) => <Input {...p} {...register("location")} />}</Field>
          <Field label="Notes">{(p) => <Textarea {...p} {...register("description")} rows={3} />}</Field>
          <DialogFooter className="sm:justify-between">
            {event ? <Button type="button" variant="destructive" onClick={onDelete}><Trash2 /> Delete</Button> : <span />}
            <div className="flex flex-col-reverse gap-2 sm:flex-row">
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
              <Button type="submit" disabled={isSubmitting}>{event ? "Save changes" : "Add event"}</Button>
            </div>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
