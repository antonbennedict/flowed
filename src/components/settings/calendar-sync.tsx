"use client";

import { CalendarPlus, Share2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { reportError } from "@/components/editors/common";
import { useDb } from "@/components/providers/db-provider";
import { useSettings } from "@/components/providers/settings-provider";
import { Field, SectionCard, SimpleSelect } from "@/components/shared/primitives";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { buildIcs } from "@/lib/ics";
import { saveTextFile } from "@/lib/files";
import { markCalendarSynced } from "@/components/onboarding/getting-started";

/**
 * Exports classes/tasks/exams as an .ics file with alarms. On iPhone this is
 * how reminders fire while Flowed is closed: the Calendar app owns them.
 */
export function CalendarSync() {
  const db = useDb();
  const settings = useSettings();
  const [opts, setOpts] = useState({ includeClasses: true, includeTasks: true, includeExams: true, includeEvents: true, weeks: 16 });
  const canShareFiles = typeof navigator !== "undefined" && !!navigator.canShare && navigator.canShare({ files: [new File([""], "x.ics", { type: "text/calendar" })] });

  const build = async () => {
    const snap = await db.exportSnapshot();
    return buildIcs({ tasks: snap.tasks, exams: snap.exams, schedules: snap.class_schedules, subjects: snap.subjects, events: snap.personal_events }, settings, opts);
  };

  const exportFile = async () => {
    try {
      const { ics, count } = await build();
      if (!count) return toast.info("Nothing to add yet", { description: "Add classes, upcoming tasks or exams first." });
      toast.success(await saveTextFile("flowed-calendar.ics", ics, "text/calendar"), { description: `${count} event${count === 1 ? "" : "s"} with reminders` });
      markCalendarSynced();
    } catch (err) { reportError(err); }
  };

  const share = async () => {
    try {
      const { ics, count } = await build();
      if (!count) return toast.info("Nothing to add yet");
      await navigator.share({ files: [new File([ics], "flowed-calendar.ics", { type: "text/calendar" })], title: "Flowed calendar" });
      markCalendarSynced();
    } catch (err) {
      if ((err as Error).name !== "AbortError") reportError(err);
    }
  };

  const toggle = (k: "includeClasses" | "includeTasks" | "includeExams" | "includeEvents", label: string) => (
    <label className="flex min-h-11 cursor-pointer items-center gap-3 rounded-xl border px-3 text-sm">
      <Checkbox checked={opts[k]} onCheckedChange={(v) => setOpts((o) => ({ ...o, [k]: !!v }))} /> {label}
    </label>
  );

  return (
    <SectionCard title="Calendar sync (reminders when Flowed is closed)" icon={CalendarPlus} className="scroll-mt-20" >
      <div id="calendar-sync" className="grid gap-4 md:grid-cols-2">
        <div className="grid gap-2">
          {toggle("includeClasses", "Weekly classes")}
          {toggle("includeTasks", "Upcoming task deadlines")}
          {toggle("includeExams", "Upcoming exams")}
          {toggle("includeEvents", "Personal events")}
          <Field label="Repeat classes for">
            {(p) => <SimpleSelect {...p} value={String(opts.weeks)} onChange={(v) => setOpts((o) => ({ ...o, weeks: Number(v) }))}
              options={[8, 12, 16, 18, 20].map((w) => ({ value: String(w), label: `${w} weeks` }))} />}
          </Field>
        </div>
        <div className="space-y-3 text-sm">
          <ol className="list-decimal space-y-1 pl-5 text-muted-foreground">
            <li>Tap <b className="text-foreground">Add to Calendar</b>. On iPhone, choose <b className="text-foreground">Add All</b> (tip: create a &ldquo;Flowed&rdquo; calendar first and pick it).</li>
            <li>Your phone&apos;s Calendar alerts you using your reminder times: tasks {settings.taskReminderMinutes} min, exams {Math.round(settings.examReminderMinutes / 60)} h, classes {settings.classReminderMinutes} min before.</li>
            <li>After big changes, delete the Flowed calendar and add it again to avoid duplicates.</li>
          </ol>
          <div className="flex flex-wrap gap-2">
            <Button onClick={exportFile}><CalendarPlus /> Add to Calendar</Button>
            {canShareFiles && <Button variant="outline" onClick={share}><Share2 /> Share file</Button>}
          </div>
        </div>
      </div>
    </SectionCard>
  );
}
