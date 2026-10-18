"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { useSettings } from "@/components/providers/settings-provider";
import { usePlannerData } from "@/hooks/use-planner-data";
import { computeHeadsUp, type HeadsUp } from "@/lib/alerts";

interface HeadsUpApi {
  alerts: HeadsUp[];
  /** Critical + warning items not dismissed/snoozed (drives the bell badge). */
  attention: number;
  panelOpen: boolean;
  setPanelOpen(open: boolean): void;
  dismiss(id: string): void;
  snooze(id: string, minutes: number): void;
}

// Small per-device UI state (which alerts were seen/dismissed). Not user data.
const KEY = "uniflow.heads-up.v1";
interface Stored { dismissed: Record<string, number>; notified: string[] }
const load = (): Stored => {
  try {
    return { dismissed: {}, notified: [], ...JSON.parse(localStorage.getItem(KEY) ?? "{}") };
  } catch {
    return { dismissed: {}, notified: [] };
  }
};
const save = (s: Stored) => {
  try {
    localStorage.setItem(KEY, JSON.stringify({ dismissed: s.dismissed, notified: s.notified.slice(-400) }));
  } catch { /* storage blocked */ }
};

const Ctx = createContext<HeadsUpApi | null>(null);
export function useHeadsUp() {
  const c = useContext(Ctx);
  if (!c) throw new Error("useHeadsUp must be used inside <HeadsUpProvider>");
  return c;
}

async function systemNotify(title: string, body: string, tag: string) {
  if (typeof Notification === "undefined" || Notification.permission !== "granted") return;
  const { Capacitor } = await import("@capacitor/core");
  if (Capacitor.isNativePlatform()) return; // native builds use OS-scheduled reminders
  try {
    const reg = await navigator.serviceWorker?.getRegistration();
    // iOS Home Screen apps only allow notifications through the service worker.
    if (reg) await reg.showNotification(title, { body, tag, icon: "/icons/icon-192.png", badge: "/icons/icon-192.png" });
    else new Notification(title, { body, tag, icon: "/icons/icon-192.png" });
  } catch { /* not allowed in this context */ }
}

export function HeadsUpProvider({ children }: { children: React.ReactNode }) {
  const settings = useSettings();
  const { data } = usePlannerData();
  const [now, setNow] = useState(() => new Date());
  const [stored, setStored] = useState<Stored>(() => (typeof window === "undefined" ? { dismissed: {}, notified: [] } : load()));
  const [panelOpen, setPanelOpen] = useState(false);
  // Which heads-ups already popped. Doesn't affect rendering, so it's a ref.
  const notified = useRef<Set<string> | null>(null);

  // Re-evaluate on a 30s clock and when the app comes back to the foreground.
  useEffect(() => {
    const tick = () => setNow(new Date());
    const t = setInterval(tick, 30_000);
    document.addEventListener("visibilitychange", tick);
    return () => { clearInterval(t); document.removeEventListener("visibilitychange", tick); };
  }, []);

  const all = useMemo(() => (data ? computeHeadsUp(data, settings, now) : []), [data, settings, now]);
  const alerts = useMemo(
    () => all.filter((a) => { const until = stored.dismissed[a.id]; return until === undefined || (until > 0 && until < now.getTime()); }),
    [all, stored.dismissed, now],
  );
  const attention = alerts.filter((a) => a.severity !== "info").length;

  // Pop new heads-ups once each.
  useEffect(() => {
    if (!settings.headsUpEnabled) return;
    notified.current ??= new Set(load().notified);
    const seen = notified.current;
    const fresh = alerts.filter((a) => a.notify && !seen.has(a.id));
    if (!fresh.length) return;
    fresh.forEach((a) => seen.add(a.id));
    save({ ...load(), notified: [...seen] });
    if (fresh.length > 2) {
      toast.warning(`${fresh.length} things need your attention`, { description: fresh.slice(0, 3).map((a) => a.title).join(" · "), action: { label: "View", onClick: () => setPanelOpen(true) } });
      systemNotify(`Flowed: ${fresh.length} heads-ups`, fresh.slice(0, 3).map((a) => a.title).join(" · "), "uniflow-summary");
    } else {
      for (const a of fresh) {
        (a.severity === "critical" ? toast.error : toast.warning)(a.title, { description: a.body, action: { label: "View", onClick: () => setPanelOpen(true) } });
        systemNotify(a.title, a.body, a.id);
      }
    }
  }, [alerts, settings.headsUpEnabled]);

  const update = useCallback((fn: (s: Stored) => Stored) => {
    setStored((s) => {
      const n = fn(s);
      save({ ...n, notified: [...(notified.current ?? new Set(load().notified))] });
      return n;
    });
  }, []);

  const api = useMemo<HeadsUpApi>(() => ({
    alerts, attention, panelOpen, setPanelOpen,
    dismiss: (id) => update((s) => ({ ...s, dismissed: { ...s.dismissed, [id]: -1 } })),
    snooze: (id, minutes) => update((s) => ({ ...s, dismissed: { ...s.dismissed, [id]: Date.now() + minutes * 60_000 } })),
  }), [alerts, attention, panelOpen, update]);

  return <Ctx.Provider value={api}>{children}</Ctx.Provider>;
}
