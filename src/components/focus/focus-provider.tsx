"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { useDb } from "@/components/providers/db-provider";
import { useSettings } from "@/components/providers/settings-provider";
import { cancelFocusEnd, scheduleFocusEnd, showWebNotification } from "@/lib/notifications";

export type Phase = "focus" | "short" | "long";
export type Status = "idle" | "running" | "paused";

interface TimerState {
  phase: Phase;
  status: Status;
  /** Epoch ms when the running phase ends (only while running). */
  endsAt: number | null;
  /** Remaining ms when paused/idle. */
  remaining: number;
  /** Total length of the current phase, ms. */
  total: number;
  /** When the current focus phase first started (ISO). */
  startedAt: string | null;
  /** Focus time actually elapsed in this phase, ms (excludes pauses). */
  elapsedBeforePause: number;
  completedFocus: number;
  subjectId: string | null;
}

interface FocusApi extends TimerState {
  remainingMs: number;
  start(): void;
  pause(): void;
  reset(): Promise<{ elapsedMinutes: number }>;
  savePartial(minutes: number): Promise<void>;
  skip(): void;
  setPhase(p: Phase): void;
  setSubject(id: string | null): void;
}

// Small, non-sensitive UI state: lets a running timer survive a reload.
const STORAGE_KEY = "uniflow.focus-timer";
const FocusContext = createContext<FocusApi | null>(null);

export function useFocusTimer() {
  const ctx = useContext(FocusContext);
  if (!ctx) throw new Error("useFocusTimer must be used inside <FocusProvider>");
  return ctx;
}

function chime() {
  try {
    const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const ctx = new Ctx();
    [0, 0.25].forEach((t, i) => {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.frequency.value = i ? 880 : 660;
      g.gain.setValueAtTime(0.0001, ctx.currentTime + t);
      g.gain.exponentialRampToValueAtTime(0.2, ctx.currentTime + t + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + t + 0.4);
      o.connect(g).connect(ctx.destination);
      o.start(ctx.currentTime + t);
      o.stop(ctx.currentTime + t + 0.45);
    });
  } catch {
    /* audio unavailable */
  }
}

export function FocusProvider({ children }: { children: React.ReactNode }) {
  const db = useDb();
  const settings = useSettings();
  const lengthOf = useCallback(
    (p: Phase) => (p === "focus" ? settings.focusMinutes : p === "short" ? settings.shortBreakMinutes : settings.longBreakMinutes) * 60_000,
    [settings.focusMinutes, settings.shortBreakMinutes, settings.longBreakMinutes],
  );

  const [state, setState] = useState<TimerState>(() => {
    const total = settings.focusMinutes * 60_000;
    const base: TimerState = { phase: "focus", status: "idle", endsAt: null, remaining: total, total, startedAt: null, elapsedBeforePause: 0, completedFocus: 0, subjectId: null };
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "null") as TimerState | null;
      if (saved && saved.phase) return saved;
    } catch { /* ignore */ }
    return base;
  });
  const [now, setNow] = useState(() => Date.now());
  const completing = useRef(false);

  useEffect(() => {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch { /* storage blocked */ }
  }, [state]);

  useEffect(() => {
    if (state.status !== "running") return;
    const t = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(t);
  }, [state.status]);

  // An idle timer always reflects the current duration settings.
  const total = state.status === "idle" ? lengthOf(state.phase) : state.total;
  const remainingMs =
    state.status === "running" && state.endsAt ? Math.max(0, state.endsAt - now) : state.status === "idle" ? total : state.remaining;

  const saveSession = useCallback(
    async (minutes: number, completed: boolean, startedAt: string | null, subjectId: string | null) => {
      if (minutes < 1) return;
      await db.focusSessions.create({
        startedAt: startedAt ?? new Date(Date.now() - minutes * 60_000).toISOString(),
        endedAt: new Date().toISOString(),
        durationMinutes: minutes,
        completed,
        subjectId,
      });
    },
    [db],
  );

  // Phase completion.
  useEffect(() => {
    if (state.status !== "running" || remainingMs > 0 || completing.current) return;
    completing.current = true;
    (async () => {
      const s = state;
      try {
        if (s.phase === "focus") {
          await saveSession(s.total / 60_000, true, s.startedAt, s.subjectId);
          const completedFocus = s.completedFocus + 1;
          const next: Phase = completedFocus % settings.sessionsBeforeLongBreak === 0 ? "long" : "short";
          setState({ ...s, phase: next, status: "idle", endsAt: null, total: lengthOf(next), remaining: lengthOf(next), startedAt: null, elapsedBeforePause: 0, completedFocus });
          toast.success("Focus session complete", { description: `Saved ${Math.round(s.total / 60_000)} minutes. Time for a ${next === "long" ? "long" : "short"} break.` });
          if (settings.focusEndNotification) showWebNotification("Focus session complete", "Time for a break.");
        } else {
          setState({ ...s, phase: "focus", status: "idle", endsAt: null, total: lengthOf("focus"), remaining: lengthOf("focus"), startedAt: null, elapsedBeforePause: 0 });
          toast("Break's over", { description: "Ready for the next focus session?" });
          if (settings.focusEndNotification) showWebNotification("Break's over", "Ready for the next focus session?");
        }
        chime();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Could not save the session");
      } finally {
        completing.current = false;
      }
    })();
  }, [remainingMs, state, saveSession, lengthOf, settings.sessionsBeforeLongBreak, settings.focusEndNotification]);

  const api = useMemo<FocusApi>(() => ({
    ...state,
    total,
    remainingMs,
    start() {
      const endsAt = Date.now() + remainingMs;
      setNow(Date.now());
      setState((s) => ({ ...s, status: "running", endsAt, total, remaining: remainingMs, startedAt: s.startedAt ?? new Date().toISOString() }));
      if (settings.focusEndNotification) {
        const focus = state.phase === "focus";
        scheduleFocusEnd(new Date(endsAt), focus ? "Focus session complete" : "Break's over", focus ? "Nice work — take a break." : "Ready for the next focus session?").catch(() => undefined);
      }
    },
    pause() {
      cancelFocusEnd();
      setState((s) => {
        const remaining = s.endsAt ? Math.max(0, s.endsAt - Date.now()) : s.remaining;
        return { ...s, status: "paused", endsAt: null, remaining, elapsedBeforePause: s.total - remaining };
      });
    },
    async reset() {
      cancelFocusEnd();
      const elapsed = state.phase === "focus" ? total - remainingMs : 0;
      setState((s) => ({ ...s, status: "idle", endsAt: null, remaining: s.total, startedAt: null, elapsedBeforePause: 0 }));
      return { elapsedMinutes: Math.floor(elapsed / 60_000) };
    },
    async savePartial(minutes) {
      await saveSession(minutes, false, state.startedAt, state.subjectId);
    },
    skip() {
      cancelFocusEnd();
      setState((s) => {
        const next: Phase = s.phase === "focus" ? "short" : "focus";
        return { ...s, phase: next, status: "idle", endsAt: null, total: lengthOf(next), remaining: lengthOf(next), startedAt: null, elapsedBeforePause: 0 };
      });
    },
    setPhase(p) {
      cancelFocusEnd();
      setState((s) => ({ ...s, phase: p, status: "idle", endsAt: null, total: lengthOf(p), remaining: lengthOf(p), startedAt: null, elapsedBeforePause: 0 }));
    },
    setSubject(id) {
      setState((s) => ({ ...s, subjectId: id }));
    },
  }), [state, total, remainingMs, lengthOf, saveSession, settings.focusEndNotification]);

  return <FocusContext.Provider value={api}>{children}</FocusContext.Provider>;
}

export const formatClockMs = (ms: number) => {
  const total = Math.ceil(ms / 1000);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
};
