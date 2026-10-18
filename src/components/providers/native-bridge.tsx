"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { useTheme } from "next-themes";

/**
 * Native-only integrations (no-ops in the browser):
 *  - Android hardware back: closes an open dialog/sheet, then navigates back,
 *    and only exits the app from the dashboard.
 *  - Splash screen is hidden once the database is ready (this mounts after DbProvider).
 *  - Status bar colours follow the theme.
 *  - Keyboard: keeps the focused field visible when the soft keyboard opens.
 */
export function NativeBridge() {
  const pathname = usePathname();
  const { resolvedTheme } = useTheme();

  useEffect(() => {
    let cleanup: (() => void) | undefined;
    (async () => {
      const { Capacitor } = await import("@capacitor/core");
      if (!Capacitor.isNativePlatform()) return;
      document.documentElement.classList.add("native");
      const [{ App }, { SplashScreen }, { Keyboard }] = await Promise.all([
        import("@capacitor/app"),
        import("@capacitor/splash-screen"),
        import("@capacitor/keyboard"),
      ]);
      SplashScreen.hide().catch(() => undefined);

      const back = await App.addListener("backButton", () => {
        const openLayer = document.querySelector(
          '[data-slot="dialog-content"], [data-slot="alert-dialog-content"], [data-slot="sheet-content"], [data-slot="select-content"], [data-slot="dropdown-menu-content"]',
        );
        if (openLayer) {
          // Base UI layers close on Escape.
          (document.activeElement ?? document.body).dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
          return;
        }
        if (window.location.pathname.replace(/\/$/, "") === "") App.exitApp();
        else window.history.back();
      });
      const kb = await Keyboard.addListener("keyboardDidShow", () => {
        const el = document.activeElement as HTMLElement | null;
        el?.scrollIntoView?.({ block: "center", behavior: "smooth" });
      }).catch(() => null);
      cleanup = () => {
        back.remove();
        kb?.remove();
      };
    })();
    return () => cleanup?.();
  }, []);

  useEffect(() => {
    (async () => {
      const { Capacitor } = await import("@capacitor/core");
      if (!Capacitor.isNativePlatform() || !Capacitor.isPluginAvailable("StatusBar")) return;
      const { StatusBar, Style } = await import("@capacitor/status-bar");
      await StatusBar.setStyle({ style: resolvedTheme === "dark" ? Style.Dark : Style.Light }).catch(() => undefined);
    })();
  }, [resolvedTheme]);

  // Move focus to the main region after navigation for screen-reader users.
  useEffect(() => {
    document.getElementById("main")?.focus({ preventScroll: true });
  }, [pathname]);

  return null;
}
