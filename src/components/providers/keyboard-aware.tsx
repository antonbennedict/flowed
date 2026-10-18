"use client";

import { useEffect } from "react";

/**
 * iOS Safari doesn't resize the layout when the on-screen keyboard opens, so
 * fixed UI (bottom sheets, the tab bar) ends up hidden behind it. This tracks
 * the *visual* viewport and exposes it to CSS:
 *   --kb   keyboard height in px (0 when closed)
 *   --vvh  visible viewport height in px
 *   html.kb-open while the keyboard is up
 * It also scrolls the focused field into the visible area.
 */
export function KeyboardAware() {
  useEffect(() => {
    const vv = window.visualViewport;
    const root = document.documentElement;
    if (!vv) return;
    let frame = 0;
    const update = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const kb = Math.max(0, Math.round(window.innerHeight - vv.height - vv.offsetTop));
        root.style.setProperty("--kb", `${kb}px`);
        root.style.setProperty("--vvh", `${Math.round(vv.height)}px`);
        root.classList.toggle("kb-open", kb > 120);
      });
    };
    const onFocus = (e: FocusEvent) => {
      const el = e.target as HTMLElement | null;
      if (!el?.matches?.("input, textarea, select, [contenteditable]")) return;
      // Wait for the keyboard animation, then keep the field comfortably visible.
      setTimeout(() => el.scrollIntoView({ block: "center", behavior: "smooth" }), 320);
    };
    update();
    vv.addEventListener("resize", update);
    vv.addEventListener("scroll", update);
    document.addEventListener("focusin", onFocus);
    return () => {
      cancelAnimationFrame(frame);
      vv.removeEventListener("resize", update);
      vv.removeEventListener("scroll", update);
      document.removeEventListener("focusin", onFocus);
      root.classList.remove("kb-open");
    };
  }, []);
  return null;
}
