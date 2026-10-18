"use client";

import { ThemeProvider } from "next-themes";
import { FlowedIntro } from "@/components/brand/flowed-intro";
import { EditorsProvider } from "@/components/editors/editors-provider";
import { FocusProvider } from "@/components/focus/focus-provider";
import { HeadsUpPanel } from "@/components/heads-up/heads-up-panel";
import { HeadsUpProvider } from "@/components/heads-up/heads-up-provider";
import { ConfirmProvider } from "@/components/shared/confirm";
import { AppShell } from "@/components/shell/app-shell";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { DbProvider } from "./db-provider";
import { NativeBridge } from "./native-bridge";
import { OfflineSupport } from "./offline-support";
import { SettingsProvider } from "./settings-provider";

export function AppProviders({ children }: { children: React.ReactNode }) {
  return (
    <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
      <OfflineSupport />
      <FlowedIntro />
      <TooltipProvider>
        <DbProvider>
          <SettingsProvider>
            <ConfirmProvider>
              <EditorsProvider>
                <FocusProvider>
                  <HeadsUpProvider>
                    <NativeBridge />
                    <AppShell>{children}</AppShell>
                    <HeadsUpPanel />
                  </HeadsUpProvider>
                </FocusProvider>
              </EditorsProvider>
            </ConfirmProvider>
          </SettingsProvider>
        </DbProvider>
        <Toaster position="top-center" richColors closeButton />
      </TooltipProvider>
    </ThemeProvider>
  );
}
