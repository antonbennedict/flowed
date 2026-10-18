"use client";

import { format } from "date-fns";
import {
  Bell, BellOff, Database as DatabaseIcon, Download, FileJson, FileSpreadsheet, Info, Monitor, Moon, Palette, Sun, Timer,
  Trash2, Upload, User,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { reportError } from "@/components/editors/common";
import { useDb } from "@/components/providers/db-provider";
import { useSettings } from "@/components/providers/settings-provider";
import { Field, PageHeader, SectionCard, SimpleSelect } from "@/components/shared/primitives";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  applyImport, BackupValidationError, createBackup, focusCsv, parseBackup, planImport, TABLE_LABELS, tasksCsv,
  type ImportMode, type ImportPlan,
} from "@/lib/backup";
import type { UserSettingsInput } from "@/lib/db/schema";
import { saveTextFile } from "@/lib/files";
import { getNotificationStatus, isNativeNotifications, requestNotificationPermission, syncReminders, type NotificationStatus } from "@/lib/notifications";
import { cn } from "@/lib/utils";
import { CalendarSync } from "@/components/settings/calendar-sync";
import { IntroToggle } from "@/components/settings/intro-toggle";

const LEADS = [
  { value: "0", label: "At the due time" }, { value: "15", label: "15 minutes before" }, { value: "30", label: "30 minutes before" },
  { value: "60", label: "1 hour before" }, { value: "180", label: "3 hours before" }, { value: "720", label: "12 hours before" },
  { value: "1440", label: "1 day before" }, { value: "2880", label: "2 days before" }, { value: "10080", label: "1 week before" },
];

/** Text input that saves on blur. Callers pass key={value} so it resets when the stored value changes. */
function SavedInput({ label, value, onSave, placeholder, maxLength }: { label: string; value: string; onSave: (v: string) => void; placeholder?: string; maxLength: number }) {
  const [v, setV] = useState(value);
  return (
    <Field label={label}>
      {(p) => <Input {...p} value={v} maxLength={maxLength} placeholder={placeholder} onChange={(e) => setV(e.target.value)} onBlur={() => v !== value && onSave(v)} onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()} />}
    </Field>
  );
}

function NumberSetting({ label, value, min, max, onSave, hint }: { label: string; value: number; min: number; max: number; onSave: (n: number) => void; hint?: string }) {
  const [v, setV] = useState(String(value));
  const n = Number(v);
  const bad = !Number.isInteger(n) || n < min || n > max;
  return (
    <Field label={label} error={bad ? `Enter ${min}–${max}` : undefined} hint={hint}>
      {(p) => <Input {...p} type="number" inputMode="numeric" min={min} max={max} value={v} onChange={(e) => setV(e.target.value)} onBlur={() => (bad ? setV(String(value)) : n !== value && onSave(n))} />}
    </Field>
  );
}

export default function SettingsPage() {
  const db = useDb();
  const s = useSettings();
  const save = (patch: Partial<UserSettingsInput>, msg?: string) =>
    db.settings.update(patch).then(() => msg && toast.success(msg)).catch(reportError);

  // ---- Notifications
  const [notif, setNotif] = useState<NotificationStatus>("prompt");
  const [native, setNative] = useState(false);
  useEffect(() => {
    getNotificationStatus().then(setNotif);
    isNativeNotifications().then(setNative);
  }, []);
  const askPermission = async () => {
    const r = await requestNotificationPermission();
    setNotif(r);
    if (r === "granted") {
      const n = await syncReminders(db);
      toast.success("Notifications enabled", { description: n !== null ? `${n} reminder${n === 1 ? "" : "s"} scheduled.` : undefined });
    } else if (r === "denied") toast.error("Notifications are blocked", { description: "Enable them in your device or browser settings." });
  };

  // ---- Backup
  const fileRef = useRef<HTMLInputElement>(null);
  const [plan, setPlan] = useState<ImportPlan | null>(null);
  const [importText, setImportText] = useState<string | null>(null);
  const [mode, setMode] = useState<ImportMode>("merge");
  const [importError, setImportError] = useState<{ message: string; problems: string[] } | null>(null);
  const [busy, setBusy] = useState(false);
  const stamp = () => format(new Date(), "yyyy-MM-dd-HHmm");

  const exportJson = async () => {
    try {
      const backup = await createBackup(db);
      toast.success(await saveTextFile(`flowed-backup-${stamp()}.json`, JSON.stringify(backup, null, 2), "application/json"));
    } catch (err) { reportError(err); }
  };
  const exportCsv = async (kind: "tasks" | "focus") => {
    try {
      const snap = await db.exportSnapshot();
      const csv = kind === "tasks" ? tasksCsv(snap) : focusCsv(snap);
      toast.success(await saveTextFile(`flowed-${kind}-${stamp()}.csv`, `﻿${csv}`, "text/csv"));
    } catch (err) { reportError(err); }
  };

  const buildPlan = async (text: string, m: ImportMode) => {
    setImportError(null);
    try {
      setPlan(await planImport(db, parseBackup(text), m));
    } catch (err) {
      setPlan(null);
      if (err instanceof BackupValidationError) setImportError({ message: err.message, problems: err.problems });
      else setImportError({ message: err instanceof Error ? err.message : String(err), problems: [] });
    }
  };
  const onFile = async (f: File | undefined) => {
    if (!f) return;
    if (f.size > 25 * 1024 * 1024) return toast.error("That file is too large to be a Flowed backup.");
    const text = await f.text();
    setImportText(text);
    setMode("merge");
    await buildPlan(text, "merge");
    if (fileRef.current) fileRef.current.value = "";
  };
  const confirmImport = async () => {
    if (!plan) return;
    setBusy(true);
    try {
      await applyImport(db, plan);
      toast.success("Backup imported", { description: plan.mode === "replace" ? "Your data was replaced with the backup." : "New and newer records were merged." });
      setImportText(null);
      setPlan(null);
    } catch (err) { reportError(err); } finally { setBusy(false); }
  };

  // ---- Reset
  const [resetOpen, setResetOpen] = useState(false);
  const [resetText, setResetText] = useState("");
  const doReset = async () => {
    setBusy(true);
    try {
      await db.clearAll();
      await syncReminders(db).catch(() => undefined);
      toast.success("All data deleted");
      setResetOpen(false);
      setResetText("");
    } catch (err) { reportError(err); } finally { setBusy(false); }
  };

  const themeBtn = (value: typeof s.theme, label: string, Icon: typeof Sun) => (
    <button type="button" role="radio" aria-checked={s.theme === value} onClick={() => save({ theme: value })}
      className="flex h-16 flex-col items-center justify-center gap-1 rounded-xl border text-xs font-medium transition-colors hover:bg-muted aria-checked:border-primary aria-checked:bg-secondary aria-checked:text-secondary-foreground">
      <Icon className="size-5" aria-hidden /> {label}
    </button>
  );

  const totalImport = plan?.summary.reduce((a, r) => a + r.added + r.updated, 0) ?? 0;

  return (
    <div className="animate-rise space-y-4">
      <PageHeader title="Settings" description="Everything is stored only on this device." />

      <div className="grid gap-4 lg:grid-cols-2">
        <SectionCard title="Profile" icon={User}>
          <div className="grid gap-3">
            <SavedInput key={s.displayName} label="Display name" value={s.displayName} maxLength={60} placeholder="What should we call you?" onSave={(v) => save({ displayName: v }, "Name saved")} />
            <div className="grid grid-cols-[1fr_8rem] gap-3">
              <SavedInput key={s.course} label="Course / program" value={s.course} maxLength={80} placeholder="BS Computer Science" onSave={(v) => save({ course: v }, "Course saved")} />
              <SavedInput key={s.yearLevel} label="Year level" value={s.yearLevel} maxLength={30} placeholder="2nd year" onSave={(v) => save({ yearLevel: v }, "Year saved")} />
            </div>
          </div>
        </SectionCard>

        <SectionCard title="Appearance & calendar" icon={Palette}>
          <div className="grid gap-4">
            <div>
              <p className="mb-2 text-sm font-medium" id="theme-label">Theme</p>
              <div role="radiogroup" aria-labelledby="theme-label" className="grid grid-cols-3 gap-2">
                {themeBtn("light", "Light", Sun)}{themeBtn("dark", "Dark", Moon)}{themeBtn("system", "System", Monitor)}
              </div>
            </div>
            <div>
              <p className="mb-2 text-sm font-medium" id="text-size-label">Text size</p>
              <div role="radiogroup" aria-labelledby="text-size-label" className="grid grid-cols-4 gap-2">
                {([["sm", "Small", "text-sm"], ["md", "Default", "text-base"], ["lg", "Large", "text-lg"], ["xl", "Largest", "text-xl"]] as const).map(([v, label, size]) => (
                  <button key={v} type="button" role="radio" aria-checked={s.textScale === v} aria-label={`${label} text`} onClick={() => save({ textScale: v })}
                    className="flex h-16 flex-col items-center justify-center gap-0.5 rounded-xl border font-semibold transition-colors hover:bg-muted aria-checked:border-primary aria-checked:bg-secondary aria-checked:text-secondary-foreground">
                    <span className={size} aria-hidden>Aa</span>
                    <span className="text-2xs font-medium">{label}</span>
                  </button>
                ))}
              </div>
              <p className="mt-1.5 text-xs text-muted-foreground">Also follows your phone&apos;s text size.</p>
            </div>
            <IntroToggle />
            <Field label="Week starts on">
              {(p) => <SimpleSelect {...p} value={String(s.weekStartsOn)} onChange={(v) => save({ weekStartsOn: Number(v) as 0 | 1 })}
                options={[{ value: "1", label: "Monday" }, { value: "0", label: "Sunday" }]} />}
            </Field>
            <NumberSetting key={s.heavyDayThreshold} label="Heavy-day warning threshold" value={s.heavyDayThreshold} min={2} max={20} onSave={(n) => save({ heavyDayThreshold: n })}
              hint="Warn when a day has this many tasks due (exams count as 2)." />
          </div>
        </SectionCard>

        <SectionCard title="Focus defaults" icon={Timer}>
          <div className="grid grid-cols-2 gap-3">
            <NumberSetting key={s.focusMinutes} label="Focus (min)" value={s.focusMinutes} min={1} max={180} onSave={(n) => save({ focusMinutes: n })} />
            <NumberSetting key={s.shortBreakMinutes} label="Short break (min)" value={s.shortBreakMinutes} min={1} max={60} onSave={(n) => save({ shortBreakMinutes: n })} />
            <NumberSetting key={s.longBreakMinutes} label="Long break (min)" value={s.longBreakMinutes} min={1} max={90} onSave={(n) => save({ longBreakMinutes: n })} />
            <NumberSetting key={s.sessionsBeforeLongBreak} label="Sessions per long break" value={s.sessionsBeforeLongBreak} min={2} max={10} onSave={(n) => save({ sessionsBeforeLongBreak: n })} />
            <NumberSetting key={s.dailyFocusGoalMinutes} label="Daily focus goal (min)" value={s.dailyFocusGoalMinutes} min={0} max={960} onSave={(n) => save({ dailyFocusGoalMinutes: n })} />
          </div>
        </SectionCard>

        <SectionCard title="Reminders & heads-up" icon={Bell}>
          <div className="grid gap-4">
            {notif === "unsupported" ? (
              <Alert><Info /><AlertTitle>Notifications aren&apos;t available here</AlertTitle>
                <AlertDescription>This browser doesn&apos;t support notifications. Install the Android or iOS app for reminders.</AlertDescription></Alert>
            ) : notif === "denied" ? (
              <Alert className="border-destructive/30 bg-destructive/5"><BellOff className="text-destructive" /><AlertTitle>Notifications are turned off</AlertTitle>
                <AlertDescription>Flowed can&apos;t remind you about deadlines. Allow notifications for Flowed in your {native ? "phone's Settings → Apps → Flowed → Notifications" : "browser's site settings"}, then return here.</AlertDescription></Alert>
            ) : notif === "prompt" ? (
              <Alert><Bell /><AlertTitle>Allow notifications</AlertTitle>
                <AlertDescription className="flex flex-col items-start gap-2">
                  Reminders need your permission. Nothing is sent over the internet.
                  <Button size="sm" onClick={askPermission}>Allow notifications</Button>
                </AlertDescription></Alert>
            ) : !native ? (
              <Alert><Info /><AlertTitle>Web app</AlertTitle>
                <AlertDescription>Heads-up alerts pop up while Flowed is open. For reminders when it&apos;s closed, use <a href="#calendar-sync" className="font-medium text-primary underline">Calendar sync</a> below.</AlertDescription></Alert>
            ) : null}
            <div className="flex items-center justify-between gap-3">
              <Label htmlFor="rem-on" className="flex-col items-start gap-0.5">Task &amp; exam reminders<span className="text-xs font-normal text-muted-foreground">Scheduled locally on the device</span></Label>
              <Switch id="rem-on" checked={s.remindersEnabled} onCheckedChange={(v) => save({ remindersEnabled: v })} />
            </div>
            <div className={cn("grid gap-3 sm:grid-cols-2", !s.remindersEnabled && "pointer-events-none opacity-50")} aria-disabled={!s.remindersEnabled}>
              <Field label="Remind me about tasks">
                {(p) => <SimpleSelect {...p} value={String(s.taskReminderMinutes)} onChange={(v) => save({ taskReminderMinutes: Number(v) })} options={LEADS} />}
              </Field>
              <Field label="Remind me about exams">
                {(p) => <SimpleSelect {...p} value={String(s.examReminderMinutes)} onChange={(v) => save({ examReminderMinutes: Number(v) })} options={LEADS} />}
              </Field>
            </div>
            <div className="flex items-center justify-between gap-3">
              <Label htmlFor="heads-up-on" className="flex-col items-start gap-0.5">Pop-up heads-up<span className="text-xs font-normal text-muted-foreground">Toast + notification when something becomes due</span></Label>
              <Switch id="heads-up-on" checked={s.headsUpEnabled} onCheckedChange={(v) => save({ headsUpEnabled: v })} />
            </div>
            <Field label="Heads-up before class">
              {(p) => <SimpleSelect {...p} value={String(s.classReminderMinutes)} onChange={(v) => save({ classReminderMinutes: Number(v) })}
                options={[{ value: "0", label: "Off" }, ...[5, 10, 15, 30, 60].map((m) => ({ value: String(m), label: `${m} minutes before` }))]} />}
            </Field>
            <div className="flex items-center justify-between gap-3">
              <Label htmlFor="focus-notif">Notify when a focus session ends</Label>
              <Switch id="focus-notif" checked={s.focusEndNotification} onCheckedChange={(v) => save({ focusEndNotification: v })} />
            </div>
          </div>
        </SectionCard>
      </div>

      <CalendarSync />

      <SectionCard title="Backup & restore" icon={DatabaseIcon}>
        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-2">
            <p className="text-sm text-muted-foreground">Export a full backup to move to another device or keep a safe copy.</p>
            <div className="flex flex-wrap gap-2">
              <Button onClick={exportJson}><FileJson /> Export backup (.json)</Button>
              <Button variant="outline" onClick={() => exportCsv("tasks")}><FileSpreadsheet /> Tasks CSV</Button>
              <Button variant="outline" onClick={() => exportCsv("focus")}><FileSpreadsheet /> Focus CSV</Button>
            </div>
          </div>
          <div className="space-y-2">
            <p className="text-sm text-muted-foreground">Import a Flowed backup. You&apos;ll see a preview before anything changes.</p>
            <input ref={fileRef} type="file" accept="application/json,.json" className="sr-only" id="import-file" onChange={(e) => onFile(e.target.files?.[0])} />
            <Button variant="outline" onClick={() => fileRef.current?.click()}><Upload /> Choose backup file…</Button>
          </div>
        </div>
      </SectionCard>

      <SectionCard title="Danger zone" icon={Trash2} className="border-destructive/30">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="max-w-lg text-sm text-muted-foreground">Permanently delete every subject, task, class, exam, event, focus session, goal and setting on this device. Export a backup first if you might need it.</p>
          <Button variant="danger" onClick={() => setResetOpen(true)}><Trash2 /> Clear all data</Button>
        </div>
      </SectionCard>

      <p className="flex items-center gap-1.5 px-1 text-xs text-muted-foreground">
        <Info className="size-3.5" aria-hidden />
        Storage: {db.kind === "sqlite" ? "SQLite (on-device)" : "IndexedDB (this browser)"} · schema v{db.schemaVersion} · works offline
      </p>

      {/* Import preview */}
      <Dialog open={importText !== null} onOpenChange={(o) => { if (!o) { setImportText(null); setPlan(null); setImportError(null); } }}>
        <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Import backup</DialogTitle>
            <DialogDescription>
              {plan ? `Exported ${format(new Date(plan.backup.exportedAt), "PPp")} · format v${plan.backup.formatVersion}` : "Checking the file…"}
            </DialogDescription>
          </DialogHeader>
          {importError ? (
            <Alert className="border-destructive/30 bg-destructive/5">
              <Info className="text-destructive" />
              <AlertTitle>This file can&apos;t be imported</AlertTitle>
              <AlertDescription>
                <p>{importError.message}</p>
                {importError.problems.length > 0 && (
                  <ul className="mt-2 list-disc space-y-0.5 pl-4 text-xs">{importError.problems.map((p) => <li key={p}>{p}</li>)}</ul>
                )}
              </AlertDescription>
            </Alert>
          ) : plan ? (
            <>
              <div role="radiogroup" aria-label="Import mode" className="grid gap-2 sm:grid-cols-2">
                {([
                  ["merge", "Merge", "Adds new records and updates ones that are newer in the backup. Nothing is deleted; importing the same file twice changes nothing."],
                  ["replace", "Replace", "Deletes all current data on this device, then restores the backup exactly."],
                ] as const).map(([m, label, desc]) => (
                  <button key={m} type="button" role="radio" aria-checked={mode === m}
                    onClick={() => { setMode(m); buildPlan(importText!, m); }}
                    className="rounded-xl border p-3 text-left transition-colors hover:bg-muted aria-checked:border-primary aria-checked:bg-secondary/60">
                    <span className="block text-sm font-semibold">{label}</span>
                    <span className="mt-0.5 block text-xs text-muted-foreground">{desc}</span>
                  </button>
                ))}
              </div>
              <table className="w-full text-sm">
                <caption className="sr-only">Import preview</caption>
                <thead><tr className="text-left text-xs text-muted-foreground"><th scope="col" className="pb-1 font-medium">Data</th><th scope="col" className="pb-1 text-right font-medium">New</th><th scope="col" className="pb-1 text-right font-medium">Updated</th><th scope="col" className="pb-1 text-right font-medium">Skipped</th></tr></thead>
                <tbody className="divide-y">
                  {plan.summary.filter((r) => r.incoming > 0).map((r) => (
                    <tr key={r.table}><th scope="row" className="py-1.5 text-left font-medium">{TABLE_LABELS[r.table]}</th>
                      <td className="text-right tabular">{r.added}</td><td className="text-right tabular">{r.updated}</td><td className="text-right text-muted-foreground tabular">{r.skipped}</td></tr>
                  ))}
                </tbody>
              </table>
              {plan.mode === "replace" && plan.willDelete > 0 && (
                <Alert className="border-destructive/30 bg-destructive/5"><Trash2 className="text-destructive" /><AlertTitle>{plan.willDelete} existing records will be deleted</AlertTitle>
                  <AlertDescription>Export a backup of your current data first if you may need it.</AlertDescription></Alert>
              )}
              {plan.mode === "merge" && totalImport === 0 && <p className="text-sm text-muted-foreground">Everything in this file is already on this device.</p>}
            </>
          ) : null}
          <DialogFooter>
            <Button variant="outline" onClick={() => setImportText(null)}>Cancel</Button>
            {plan && !importError && (
              <Button variant={plan.mode === "replace" ? "danger" : "default"} disabled={busy || (plan.mode === "merge" && totalImport === 0)} onClick={confirmImport}>
                <Download /> {busy ? "Importing…" : plan.mode === "replace" ? "Replace my data" : `Import ${totalImport} record${totalImport === 1 ? "" : "s"}`}
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Reset confirmation with typed safeguard */}
      <Dialog open={resetOpen} onOpenChange={(o) => { setResetOpen(o); if (!o) setResetText(""); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete all data?</DialogTitle>
            <DialogDescription>This cannot be undone. Type <strong className="text-foreground">DELETE</strong> to confirm.</DialogDescription>
          </DialogHeader>
          <Input value={resetText} onChange={(e) => setResetText(e.target.value)} aria-label="Type DELETE to confirm" autoComplete="off" autoCapitalize="characters" />
          <DialogFooter>
            <Button variant="outline" onClick={() => setResetOpen(false)}>Cancel</Button>
            <Button variant="danger" disabled={resetText !== "DELETE" || busy} onClick={doReset}><Trash2 /> Delete everything</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
