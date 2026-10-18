import type { Metadata, Viewport } from "next";
import { Plus_Jakarta_Sans } from "next/font/google";
import { introBootScript } from "@/lib/intro";
import { AppProviders } from "@/components/providers/app-providers";
import "./globals.css";

// Downloaded at build time and bundled, so the app needs no network for fonts.
const jakarta = Plus_Jakarta_Sans({
  variable: "--font-jakarta",
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  title: { default: "Flowed", template: "%s · Flowed" },
  description: "Offline-first student planner: tasks, classes, exams, focus timer and analytics — stored on your device.",
  applicationName: "Flowed",
  manifest: "/manifest.webmanifest",
  icons: { icon: "/icons/icon-192.png", apple: "/icons/apple-touch-icon.png" },
  // iPhone "Add to Home Screen": open full-screen like a native app.
  appleWebApp: { capable: true, title: "Flowed", statusBarStyle: "default" },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f7f7fb" },
    { media: "(prefers-color-scheme: dark)", color: "#14131f" },
  ],
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${jakarta.variable} antialiased`} suppressHydrationWarning>
      <head>
        {/* Decides before first paint whether to skip the opening intro. */}
        <script dangerouslySetInnerHTML={{ __html: introBootScript }} />
      </head>
      <body>
        <AppProviders>{children}</AppProviders>
      </body>
    </html>
  );
}
