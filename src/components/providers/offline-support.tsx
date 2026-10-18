"use client";

import { useEffect } from "react";

/**
 * Registers /sw.js (generated at build time) so the installed web app works
 * with no network. Skipped in development, inside the Capacitor native app
 * (assets are already bundled there), and on insecure origins, where
 * browsers refuse service workers.
 */
export function OfflineSupport() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production" || !("serviceWorker" in navigator) || !window.isSecureContext) return;
    (async () => {
      const { Capacitor } = await import("@capacitor/core");
      if (Capacitor.isNativePlatform()) return;
      navigator.serviceWorker.register("/sw.js").catch((err) => console.warn("Offline support unavailable", err));
    })();
  }, []);
  return null;
}
