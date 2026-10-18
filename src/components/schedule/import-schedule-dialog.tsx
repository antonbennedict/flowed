"use client";

import { AlertTriangle, Camera, ClipboardPaste, ImageUp, Loader2, Plus, RotateCcw, ScanLine, Trash2 } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";
import { toast } from "sonner";
import { reportError } from "@/components/editors/common";
import { useDb } from "@/components/providers/db-provider";
import { useSettings } from "@/components/providers/settings-provider";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { weekdayNames } from "@/lib/dates";
import { parseScheduleText, type ParsedClass } from "@/lib/schedule-import";
import { cn } from "@/lib/utils";

interface Row extends ParsedClass { key: string; include: boolean }
type Step = "source" | "review";

/** Grayscale, upscale and stretch contrast: big accuracy win for phone photos and small screenshots. */
async function prepareImage(file: File): Promise<HTMLCanvasElement> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(3, Math.max(1, 2000 / bitmap.width));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  const ctx = canvas.getContext("2d", { willReadFrequently: true })!;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const d = img.data;
  let min = 255, max = 0;
  for (let i = 0; i < d.length; i += 4) {
    const g = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
    d[i] = g;
    if (g < min) min = g;
    if (g > max) max = g;
  }
  const range = Math.max(1, max - min);
  // Dark-mode screenshots: invert so text is dark on light.
  let sum = 0;
  for (let i = 0; i < d.length; i += 4) sum += d[i];
  const invert = sum / (d.length / 4) < 110;
  for (let i = 0; i < d.length; i += 4) {
    let v = ((d[i] - min) / range) * 255;
    if (invert) v = 255 - v;
    d[i] = d[i + 1] = d[i + 2] = v;
  }
  ctx.putImageData(img, 0, 0);
  return canvas;
}

async function recognise(canvas: HTMLCanvasElement, onProgress: (p: number, label: string) => void): Promise<string> {
  const { createWorker, PSM } = await import("tesseract.js");
  // Engine, WASM and the English model are served from /ocr/ (copied at build
  // time) and cached by the service worker, so scanning works offline.
  const worker = await createWorker("eng", 1, {
    workerPath: "/ocr/worker.min.js",
    corePath: "/ocr/",
    langPath: "/ocr/lang",
    workerBlobURL: false,
    logger: (m: { status: string; progress: number }) => {
      const label = m.status.startsWith("recognizing") ? "Reading text" : m.status.includes("load") ? "Loading scanner" : "Preparing";
      onProgress(m.status.startsWith("recognizing") ? 0.3 + m.progress * 0.7 : m.progress * 0.3, label);
    },
  });
  try {
    await worker.setParameters({ tessedit_pageseg_mode: PSM.SINGLE_BLOCK, preserve_interword_spaces: "1" });
    const { data } = await worker.recognize(canvas);
    return data.text;
  } finally {
    await worker.terminate();
  }
}

const toRows = (parsed: ParsedClass[]): Row[] =>
  parsed.map((p, i) => ({ ...p, key: `${Date.now()}-${i}`, include: p.days.length > 0 && !!p.name }));

export function ImportScheduleDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const db = useDb();
  const settings = useSettings();
  const days = weekdayNames(settings.weekStartsOn, "short");
  const fileRef = useRef<HTMLInputElement>(null);
  const cameraRef = useRef<HTMLInputElement>(null);
  const [source, setSource] = useState<"photo" | "text">("photo");
  const [step, setStep] = useState<Step>("source");
  const [preview, setPreview] = useState<string | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [text, setText] = useState("");
  const [progress, setProgress] = useState<{ value: number; label: string } | null>(null);
  const [rows, setRows] = useState<Row[]>([]);
  const [saving, setSaving] = useState(false);
  const ids = useId();

  useEffect(() => () => { if (preview) URL.revokeObjectURL(preview); }, [preview]);

  const reset = () => { setStep("source"); setRows([]); setFile(null); setPreview(null); setProgress(null); };
  const pick = (f: File | undefined) => {
    if (!f) return;
    if (!f.type.startsWith("image/")) return toast.error("Choose an image (photo or screenshot).");
    setFile(f);
    setPreview(URL.createObjectURL(f));
  };

  const parse = (t: string) => {
    const parsed = parseScheduleText(t);
    setRows(toRows(parsed));
    setStep("review");
    if (!parsed.length) toast.warning("No class times found", { description: "Check the recognised text below, fix it, and parse again." });
  };

  const scan = async () => {
    if (!file) return;
    setProgress({ value: 0, label: "Preparing image" });
    try {
      const canvas = await prepareImage(file);
      const out = await recognise(canvas, (value, label) => setProgress({ value, label }));
      setText(out);
      parse(out);
    } catch (err) {
      console.error(err);
      toast.error("Couldn't read that image", {
        description: navigator.onLine ? "Try a sharper, straight-on photo, or paste the text instead." : "The scanner downloads once (about 6 MB). Connect to the internet the first time you scan.",
      });
    } finally {
      setProgress(null);
    }
  };

  const update = (key: string, patch: Partial<Row>) => setRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  const chosen = rows.filter((r) => r.include);
  const invalid = chosen.filter((r) => !r.days.length || !r.name.trim() || !(r.endTime > r.startTime));
  const classCount = chosen.reduce((n, r) => n + r.days.length, 0);

  const save = async () => {
    setSaving(true);
    try {
      const res = await db.schedules.importMany(chosen.flatMap((r) => r.days.map((weekday) => ({
        subject: { name: r.name.trim(), code: r.code.trim(), instructor: r.instructor.trim() },
        weekday, startTime: r.startTime, endTime: r.endTime, room: r.room.trim(),
      }))));
      toast.success(`Imported ${res.classesCreated} class${res.classesCreated === 1 ? "" : "es"}`, {
        description: [res.subjectsCreated && `${res.subjectsCreated} new subject${res.subjectsCreated === 1 ? "" : "s"}`, res.skipped && `${res.skipped} already in your timetable`].filter(Boolean).join(" · ") || undefined,
      });
      onOpenChange(false);
      reset();
    } catch (err) {
      reportError(err);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { onOpenChange(o); if (!o) reset(); }}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><ScanLine className="size-5 text-primary" aria-hidden /> Import schedule</DialogTitle>
          <DialogDescription>
            {step === "source" ? "Use a photo or screenshot of your class schedule (or paste the text). It's read on this device." : "Check each class before importing. Nothing is saved yet."}
          </DialogDescription>
        </DialogHeader>

        {step === "source" && (
          <div className="grid gap-4">
            <Tabs value={source} onValueChange={(v) => setSource(v as typeof source)}>
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="photo"><Camera /> Photo</TabsTrigger>
                <TabsTrigger value="text"><ClipboardPaste /> Paste text</TabsTrigger>
              </TabsList>
            </Tabs>
            {source === "photo" ? (
              <>
                <input ref={fileRef} type="file" accept="image/*" className="sr-only" tabIndex={-1} aria-hidden onChange={(e) => pick(e.target.files?.[0])} />
                <input ref={cameraRef} type="file" accept="image/*" capture="environment" className="sr-only" tabIndex={-1} aria-hidden onChange={(e) => pick(e.target.files?.[0])} />
                {preview ? (
                  <figure className="overflow-hidden rounded-2xl border bg-muted">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={preview} alt="Selected schedule" className="max-h-72 w-full object-contain" />
                  </figure>
                ) : (
                  <div className="grid gap-2 sm:grid-cols-2">
                    <button type="button" onClick={() => cameraRef.current?.click()} className="flex min-h-28 flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed p-4 text-sm font-medium transition-colors hover:border-primary/50 hover:bg-muted/50 focus-visible:ring-3 focus-visible:ring-ring/50 outline-none">
                      <Camera className="size-6 text-primary" aria-hidden /> Take a photo
                    </button>
                    <button type="button" onClick={() => fileRef.current?.click()} className="flex min-h-28 flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed p-4 text-sm font-medium transition-colors hover:border-primary/50 hover:bg-muted/50 focus-visible:ring-3 focus-visible:ring-ring/50 outline-none">
                      <ImageUp className="size-6 text-primary" aria-hidden /> Choose screenshot
                    </button>
                  </div>
                )}
                {progress && (
                  <div aria-live="polite">
                    <div className="mb-1.5 flex justify-between text-xs"><span>{progress.label}…</span><span className="tabular">{Math.round(progress.value * 100)}%</span></div>
                    <Progress value={progress.value * 100} aria-label="Scan progress" />
                  </div>
                )}
                <ul className="list-disc space-y-0.5 pl-5 text-xs text-muted-foreground">
                  <li>Best: a screenshot of your schedule from the student portal.</li>
                  <li>For paper: hold the phone straight above it, in good light, filling the frame.</li>
                </ul>
              </>
            ) : (
              <div className="grid gap-1.5">
                <label htmlFor={`${ids}-text`} className="text-sm font-medium">Schedule text</label>
                <Textarea id={`${ids}-text`} value={text} onChange={(e) => setText(e.target.value)} rows={8} className="font-mono text-sm"
                  placeholder={"IT 101  Intro to Computing  MWF  8:00-9:00 AM  Rm 301\nCS 201  Data Structures  TTh  1:00-2:30 PM  Lab 3"} />
                <p className="text-xs text-muted-foreground">One class per line. Days like MWF, TTh, Mon; times like 8:00-9:30 AM.</p>
              </div>
            )}
          </div>
        )}

        {step === "review" && (
          <div className="grid gap-3">
            {rows.length === 0 && (
              <Alert><AlertTriangle /><AlertTitle>No classes found</AlertTitle><AlertDescription>Fix the text below and parse again, or add rows manually.</AlertDescription></Alert>
            )}
            <ul className="grid gap-2" aria-label="Classes found">
              {rows.map((r, idx) => {
                const bad = r.include && (!r.days.length || !r.name.trim() || !(r.endTime > r.startTime));
                return (
                  <li key={r.key} className={cn("rounded-2xl border bg-card p-3", !r.include && "opacity-60", bad && "border-warning/60")}>
                    <div className="flex items-center gap-2">
                      <Checkbox checked={r.include} onCheckedChange={(c) => update(r.key, { include: !!c })} aria-label={`Include class ${idx + 1}`} />
                      <Input value={r.code} onChange={(e) => update(r.key, { code: e.target.value })} aria-label="Subject code" placeholder="Code" className="w-24 shrink-0" />
                      <Input value={r.name} onChange={(e) => update(r.key, { name: e.target.value })} aria-label="Subject name" placeholder="Subject name" aria-invalid={r.include && !r.name.trim()} />
                      <Button variant="ghost" size="icon-sm" aria-label={`Remove class ${idx + 1}`} onClick={() => setRows((rs) => rs.filter((x) => x.key !== r.key))}><Trash2 /></Button>
                    </div>
                    <div className="mt-2 flex flex-wrap items-center gap-2">
                      <div role="group" aria-label="Days" className="flex gap-1">
                        {days.map((d) => {
                          const on = r.days.includes(d.weekday);
                          return (
                            <button key={d.weekday} type="button" aria-pressed={on}
                              onClick={() => update(r.key, { days: on ? r.days.filter((x) => x !== d.weekday) : [...r.days, d.weekday].sort() })}
                              className="h-9 w-9 rounded-lg border text-xs font-semibold transition-colors aria-pressed:border-primary aria-pressed:bg-primary aria-pressed:text-primary-foreground sm:h-8 sm:w-8">
                              {d.label.slice(0, 2)}
                            </button>
                          );
                        })}
                      </div>
                      <div className="flex items-center gap-1.5">
                        <Input type="time" value={r.startTime} onChange={(e) => update(r.key, { startTime: e.target.value })} aria-label="Starts" className="w-32" />
                        <span aria-hidden className="text-muted-foreground">–</span>
                        <Input type="time" value={r.endTime} onChange={(e) => update(r.key, { endTime: e.target.value })} aria-label="Ends" className="w-32" aria-invalid={!(r.endTime > r.startTime)} />
                      </div>
                      <Input value={r.room} onChange={(e) => update(r.key, { room: e.target.value })} aria-label="Room" placeholder="Room" className="w-28 flex-1" />
                    </div>
                    {bad && <p className="mt-1.5 text-xs font-medium text-warning" role="alert">{!r.days.length ? "Pick at least one day." : !r.name.trim() ? "Add a subject name." : "End time must be after start time."}</p>}
                  </li>
                );
              })}
            </ul>
            <Button variant="outline" className="justify-self-start" onClick={() => setRows((rs) => [...rs, { key: `${Date.now()}`, include: true, code: "", name: "", days: [], startTime: "08:00", endTime: "09:00", room: "", instructor: "", raw: "", issues: [] }])}>
              <Plus /> Add a class
            </Button>
            <details className="rounded-2xl border p-3">
              <summary className="cursor-pointer text-sm font-medium">Recognised text {source === "photo" ? "(edit and re-parse if something was misread)" : ""}</summary>
              <Textarea value={text} onChange={(e) => setText(e.target.value)} rows={6} className="mt-2 font-mono text-xs" aria-label="Recognised text" />
              <Button size="sm" variant="secondary" className="mt-2" onClick={() => parse(text)}><RotateCcw /> Parse again</Button>
            </details>
          </div>
        )}

        <DialogFooter>
          {step === "source" ? (
            <>
              {preview && <Button variant="outline" onClick={() => { setFile(null); setPreview(null); }} disabled={!!progress}>Choose another</Button>}
              {source === "photo" ? (
                <Button onClick={scan} disabled={!file || !!progress}>{progress ? <Loader2 className="animate-spin" /> : <ScanLine />} {progress ? "Scanning…" : "Scan schedule"}</Button>
              ) : (
                <Button onClick={() => parse(text)} disabled={!text.trim()}><ScanLine /> Find classes</Button>
              )}
            </>
          ) : (
            <>
              <Button variant="outline" onClick={() => setStep("source")}>Back</Button>
              <Button onClick={save} disabled={saving || classCount === 0 || invalid.length > 0}>
                {saving ? "Importing…" : `Import ${classCount} class${classCount === 1 ? "" : "es"}`}
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
