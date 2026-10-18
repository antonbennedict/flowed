import type { NextConfig } from "next";

/**
 * Flowed is an offline-first client application. It is built as a fully
 * static export (`out/`) so the same bundle runs in the browser and inside
 * the Capacitor Android/iOS WebView. No server-only Next.js features
 * (Server Actions, route handlers, rewrites, image optimisation) are used.
 */
const nextConfig: NextConfig = {
  output: "export",
  // Emit /tasks/index.html so Capacitor's static file server resolves routes.
  trailingSlash: true,
  images: { unoptimized: true },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
