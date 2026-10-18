"use client";

import { useState } from "react";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { INTRO_PREF_KEY } from "@/lib/intro";

/** Per-device preference (localStorage): play the Flowed opening animation on launch. */
export function IntroToggle() {
  const [on, setOn] = useState(() => {
    try { return localStorage.getItem(INTRO_PREF_KEY) !== "off"; } catch { return true; }
  });
  const change = (v: boolean) => {
    setOn(v);
    try { if (v) localStorage.removeItem(INTRO_PREF_KEY); else localStorage.setItem(INTRO_PREF_KEY, "off"); } catch { /* blocked */ }
  };
  return (
    <div className="flex items-center justify-between gap-3">
      <Label htmlFor="intro-toggle" className="flex-col items-start gap-0.5">
        Opening animation
        <span className="text-xs font-normal text-muted-foreground">Plays once each time you open Flowed</span>
      </Label>
      <Switch id="intro-toggle" checked={on} onCheckedChange={change} />
    </div>
  );
}
