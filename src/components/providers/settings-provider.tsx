"use client";

import { createContext, useContext, useEffect } from "react";
import { useTheme } from "next-themes";
import type { UserSettings } from "@/lib/db/schema";
import { syncReminders } from "@/lib/notifications";
import { useDb, useLiveQuery } from "./db-provider";

const SettingsContext = createContext<UserSettings | null>(null);

export function useSettings(): UserSettings {
  const s = useContext(SettingsContext);
  if (!s) throw new Error("useSettings must be used inside <SettingsProvider>");
  return s;
}

/** Loads the settings row, applies the theme, and keeps OS reminders in sync. */
export function SettingsProvider({ children }: { children: React.ReactNode }) {
  const db = useDb();
  const { data: settings } = useLiveQuery((d) => d.settings.get(), [], ["user_settings"]);
  const { setTheme } = useTheme();

  useEffect(() => {
    if (settings) setTheme(settings.theme);
  }, [settings, setTheme]);

  // Text size: scales every rem-based size in the app (respects the browser/OS base size).
  useEffect(() => {
    if (!settings) return;
    document.documentElement.style.fontSize = { sm: "93.75%", md: "100%", lg: "112.5%", xl: "125%" }[settings.textScale];
  }, [settings]);

  // Reconcile scheduled reminders after any change to tasks, exams or settings.
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const schedule = () => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        syncReminders(db).catch((err) => console.warn("Reminder sync failed", err));
      }, 600);
    };
    schedule();
    const off = db.onChange((tables) => {
      if (tables.some((t) => t === "tasks" || t === "exams" || t === "user_settings")) schedule();
    });
    return () => {
      clearTimeout(timer);
      off();
    };
  }, [db]);

  if (!settings) return null;
  return <SettingsContext.Provider value={settings}>{children}</SettingsContext.Provider>;
}
