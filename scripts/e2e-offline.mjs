/**
 * Offline test: load the app once online, cut the network, then reload and
 * navigate. Every page and the local data must still work.
 *   npm run build && npm run test:offline
 */
import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import { chromium } from "playwright-core";

const ROOT = path.resolve("out");
const TYPES = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".png": "image/png", ".woff2": "font/woff2", ".webmanifest": "application/manifest+json", ".txt": "text/plain", ".ico": "image/x-icon" };
const server = createServer(async (req, res) => {
  let file = path.join(ROOT, decodeURIComponent(new URL(req.url, "http://x").pathname));
  try { if ((await stat(file)).isDirectory()) file = path.join(file, "index.html"); } catch { file = path.join(ROOT, "404.html"); }
  try { res.writeHead(200, { "content-type": TYPES[path.extname(file)] ?? "application/octet-stream" }).end(await readFile(file)); }
  catch { res.writeHead(404).end(); }
});
await new Promise((r) => server.listen(4174, r));
const BASE = "http://localhost:4174"; // localhost counts as a secure context

const browser = await chromium.launch({ channel: process.env.BROWSER_CHANNEL ?? "msedge" });
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
await ctx.addInitScript(() => localStorage.setItem("flowed.intro", "off"));
const page = await ctx.newPage();
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
let failed = 0;
const check = (ok, msg) => { console.log(`${ok ? "PASS" : "FAIL"}  ${msg}`); if (!ok) failed++; };
const visible = (loc) => loc.first().waitFor({ state: "visible", timeout: 8000 }).then(() => true, () => false);

try {
  await page.goto(`${BASE}/`);
  await page.getByRole("heading", { level: 1 }).waitFor();
  const cached = await page.evaluate(async () => {
    const reg = await navigator.serviceWorker.ready;
    if (!navigator.serviceWorker.controller) await new Promise((r) => navigator.serviceWorker.addEventListener("controllerchange", r, { once: true }));
    const keys = await caches.keys();
    const cache = await caches.open(keys.find((k) => k.startsWith("uniflow-")));
    return { active: !!reg.active, count: (await cache.keys()).length };
  });
  check(cached.active && cached.count > 100, `service worker active, ${cached.count} files cached`);

  // Add data while online.
  await page.goto(`${BASE}/tasks/`);
  await page.getByRole("button", { name: "New task" }).click();
  await page.getByLabel("Title").fill("Offline essay");
  await page.getByRole("button", { name: "Add task" }).click();
  await page.getByText("Task added").waitFor();

  // ---- Go offline
  await ctx.setOffline(true);
  await page.reload();
  check(await visible(page.getByRole("heading", { name: "Tasks" })), "page reloads with no network");
  await page.getByRole("tab", { name: /All/ }).click();
  check(await visible(page.getByRole("button", { name: "Offline essay" })), "local data available offline");

  for (const r of ["calendar", "subjects", "schedule", "exams", "focus", "analytics", "review", "settings", ""]) {
    await page.goto(`${BASE}/${r}${r ? "/" : ""}`);
    if (!(await visible(page.getByRole("heading", { level: 1 })))) check(false, `/${r} offline`);
  }
  check(true, "every route opens offline (direct load)");

  await page.getByRole("link", { name: "Tasks" }).first().click();
  check(await visible(page.getByRole("heading", { name: "Tasks" })), "in-app navigation works offline");

  await page.getByRole("button", { name: "New task" }).click();
  await page.getByLabel("Title").fill("Written while offline");
  await page.getByRole("button", { name: "Add task" }).click();
  check(await visible(page.getByText("Task added")), "can save new data offline");
  await page.reload();
  await page.getByRole("tab", { name: /All/ }).click();
  check(await visible(page.getByRole("button", { name: "Written while offline" })), "offline edit persists after reload");
} catch (err) {
  failed++;
  console.error("FAIL  unexpected:", err.message);
} finally {
  await browser.close();
  server.close();
}
check(errors.length === 0, `no page errors${errors.length ? `: ${errors.join("; ")}` : ""}`);
console.log(failed ? `\n${failed} check(s) failed` : "\nAll offline checks passed");
process.exit(failed ? 1 : 0);
