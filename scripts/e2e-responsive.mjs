/**
 * Responsive + mobile-input regression suite.
 *   npm run build && npm run test:responsive
 * - iOS auto-zoom: every text field is >= 16px on touch screens (also with
 *   the "Small" text size, in dialogs and the schedule paste box)
 * - no sideways overflow on any page from 320px phones to 1920px desktops
 * - landscape phones use the side rail (no bottom bar eating the height)
 * - on-screen keyboard (simulated): bottom sheet sits above it, tab bar hides
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
await new Promise((r) => server.listen(4176, r));
const BASE = "http://localhost:4176";
const PAGES = ["", "tasks", "calendar", "subjects", "schedule", "exams", "focus", "analytics", "review", "settings"];
const browser = await chromium.launch({ channel: process.env.BROWSER_CHANNEL ?? "msedge" });
let failed = 0;
const check = (ok, msg) => { console.log(`${ok ? "PASS" : "FAIL"}  ${msg}`); if (!ok) failed++; };

async function seeded(viewport, touch) {
  const ctx = await browser.newContext({ viewport, isMobile: touch, hasTouch: touch });
  await ctx.addInitScript(() => localStorage.setItem("flowed.intro", "off"));
  const p = await ctx.newPage();
  await p.goto(`${BASE}/`);
  await p.getByRole("heading", { level: 1 }).waitFor();
  // Seed realistic data through the UI's own repositories.
  await p.getByRole("button", { name: "Quick add", exact: true }).click();
  await p.getByRole("menuitem", { name: "Subject" }).click();
  await p.getByRole("dialog").getByLabel("Name").fill("Data Structures and Algorithms with a very long subject name");
  await p.getByRole("dialog").getByLabel("Code").fill("CS 201");
  await p.getByRole("button", { name: "Add subject" }).click();
  await p.getByRole("dialog").waitFor({ state: "detached" });
  const qa = p.getByLabel(/^Quick add task/);
  await qa.fill("A really long assignment title that should truncate instead of overflowing the row fri 5pm #CS201 !high");
  await qa.press("Enter");
  await p.getByText("Task added").first().waitFor();
  return { ctx, p };
}

const smallFields = (p) => p.evaluate(() =>
  [...document.querySelectorAll("input:not([type=checkbox]):not([type=radio]):not([type=file]):not([aria-hidden=true]), textarea, select")]
    .filter((el) => el.offsetParent !== null && parseFloat(getComputedStyle(el).fontSize) < 16)
    .map((el) => `${el.getAttribute("aria-label") || el.id || el.type}=${getComputedStyle(el).fontSize}`));

try {
  // ---- 1. No iOS auto-zoom
  {
    const { ctx, p } = await seeded({ width: 390, height: 844 }, true);
    const bad = [];
    for (const r of PAGES) {
      await p.goto(`${BASE}/${r}${r ? "/" : ""}`);
      await p.getByRole("heading", { level: 1 }).waitFor();
      bad.push(...(await smallFields(p)).map((x) => `/${r} ${x}`));
    }
    await p.goto(`${BASE}/tasks/`);
    await p.getByRole("button", { name: "New task" }).click();
    bad.push(...(await smallFields(p)).map((x) => `task dialog ${x}`));
    await p.keyboard.press("Escape");
    await p.goto(`${BASE}/schedule/`);
    await p.getByRole("button", { name: /Import schedule/ }).click();
    await p.getByRole("tab", { name: /Paste text/ }).click();
    bad.push(...(await smallFields(p)).map((x) => `import ${x}`));
    await p.keyboard.press("Escape");
    await p.goto(`${BASE}/settings/`);
    await p.getByRole("radio", { name: "Small text" }).click();
    await p.goto(`${BASE}/tasks/`);
    await p.getByRole("heading", { level: 1 }).waitFor();
    bad.push(...(await smallFields(p)).map((x) => `small text ${x}`));
    check(bad.length === 0, `all text fields >= 16px on touch screens${bad.length ? `: ${bad.join(", ")}` : ""}`);

    // ---- 4. Simulated on-screen keyboard (iOS doesn't resize the layout)
    await p.goto(`${BASE}/settings/`);
    await p.getByRole("radio", { name: "Default text" }).click();
    await p.goto(`${BASE}/tasks/`);
    await p.getByRole("button", { name: "New task" }).click();
    await p.waitForTimeout(300);
    await p.evaluate(() => {
      const r = document.documentElement;
      r.style.setProperty("--kb", "320px");
      r.style.setProperty("--vvh", `${window.innerHeight - 320}px`);
      r.classList.add("kb-open");
    });
    await p.waitForTimeout(300);
    const geo = await p.evaluate(() => {
      const d = document.querySelector('[data-slot="dialog-content"]').getBoundingClientRect();
      const nav = document.querySelector("[data-bottom-nav]");
      return { bottom: d.bottom, top: d.top, limit: window.innerHeight - 320, navHidden: getComputedStyle(nav).display === "none" };
    });
    check(Math.abs(geo.bottom - geo.limit) <= 2 && geo.top >= 0, `bottom sheet sits above the keyboard (bottom ${Math.round(geo.bottom)} vs ${geo.limit})`);
    check(geo.navHidden, "tab bar hides while the keyboard is open");
    await ctx.close();
  }

  // ---- 2. No sideways overflow, phone → desktop
  const sizes = [[320, 568, true], [360, 740, true], [430, 932, true], [844, 390, true], [768, 1024, true], [1024, 768, true], [1440, 900, false]];
  for (const [w, h, touch] of sizes) {
    const { ctx, p } = await seeded({ width: w, height: h }, touch);
    const bad = [];
    for (const r of PAGES) {
      await p.goto(`${BASE}/${r}${r ? "/" : ""}`);
      await p.getByRole("heading", { level: 1 }).waitFor();
      if (await p.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1)) bad.push(`/${r}`);
    }
    check(bad.length === 0, `${w}x${h}: no sideways scrolling${bad.length ? ` (overflow on ${bad.join(", ")})` : ""}`);
    // ---- 3. Navigation pattern per size
    const nav = await p.evaluate(() => {
      const vis = (el) => el && el.getClientRects().length > 0 && el.getBoundingClientRect().width > 0;
      const navs = [...document.querySelectorAll('nav[aria-label="Main"]')].filter(vis);
      const n = navs[0]?.getBoundingClientRect();
      return n ? (n.height < 120 ? "bottom" : n.width > 200 ? "sidebar" : "rail") : "none";
    });
    const want = w < 640 ? "bottom" : w < 1024 ? "rail" : "sidebar";
    check(nav === want, `${w}x${h}: ${want} navigation (got ${nav})`);
    await ctx.close();
  }
} catch (err) {
  failed++;
  console.error("FAIL  unexpected:", err.message);
} finally {
  await browser.close();
  server.close();
}
console.log(failed ? `\n${failed} check(s) failed` : "\nAll responsive checks passed");
process.exit(failed ? 1 : 0);
