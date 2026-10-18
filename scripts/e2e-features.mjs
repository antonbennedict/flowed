/**
 * E2E for: schedule import from a photo (real offline OCR), natural-language
 * quick add, heads-up alerts, text size, and calendar (.ics) export.
 *   npm run build && npm run test:features
 */
import { createServer } from "node:http";
import { mkdir, readFile, stat } from "node:fs/promises";
import path from "node:path";
import { chromium } from "playwright-core";

const ROOT = path.resolve("out");
const SHOTS = path.resolve("test-results/features");
const TYPES = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".png": "image/png", ".woff2": "font/woff2", ".webmanifest": "application/manifest+json", ".txt": "text/plain", ".gz": "application/gzip", ".ico": "image/x-icon" };
const server = createServer(async (req, res) => {
  let file = path.join(ROOT, decodeURIComponent(new URL(req.url, "http://x").pathname));
  try { if ((await stat(file)).isDirectory()) file = path.join(file, "index.html"); } catch { file = path.join(ROOT, "404.html"); }
  try { res.writeHead(200, { "content-type": TYPES[path.extname(file)] ?? "application/octet-stream" }).end(await readFile(file)); }
  catch { res.writeHead(404).end(); }
});
await new Promise((r) => server.listen(4175, r));
const BASE = "http://localhost:4175";
await mkdir(SHOTS, { recursive: true });

const browser = await chromium.launch({ channel: process.env.BROWSER_CHANNEL ?? "msedge" });
const ctx = await browser.newContext({ viewport: { width: 375, height: 740 }, acceptDownloads: true });
await ctx.grantPermissions(["notifications"], { origin: BASE });
await ctx.addInitScript(() => localStorage.setItem("flowed.intro", "off"));
const page = await ctx.newPage();
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
let failed = 0;
const check = (ok, msg) => { console.log(`${ok ? "PASS" : "FAIL"}  ${msg}`); if (!ok) failed++; };
const visible = (loc, timeout = 8000) => loc.first().waitFor({ state: "visible", timeout }).then(() => true, () => false);
const shot = (name) => page.screenshot({ path: `${SHOTS}/${name}.png` });

try {
  // ---------- 0. Opening intro (fresh context with the intro enabled)
  {
    const ictx = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const ip = await ictx.newPage();
    ip.on("pageerror", (e) => errors.push(`[intro] ${e.message}`));
    await ip.goto(`${BASE}/`);
    const intro = ip.locator("#flowed-intro");
    check(await visible(intro, 3000), "opening intro shows on launch");
    await ip.waitForTimeout(1200);
    check(await ip.locator("#flowed-intro canvas").evaluate((c) => c.width > 0 && c.classList.contains("opacity-100")), "three.js scene rendering");
    await ip.getByRole("button", { name: "Skip intro" }).click();
    check(await intro.waitFor({ state: "detached", timeout: 2000 }).then(() => true, () => false), "Skip intro dismisses it");
    check(await visible(ip.getByRole("heading", { level: 1 })), "app is usable after the intro");
    await ip.reload();
    await ip.getByRole("heading", { level: 1 }).waitFor();
    check(!(await ip.locator("#flowed-intro").isVisible()), "intro does not replay on reload in the same session");
    // Turning it off in Settings persists.
    await ip.goto(`${BASE}/settings/`);
    await ip.getByRole("switch", { name: /Opening animation/ }).click();
    check((await ip.evaluate(() => localStorage.getItem("flowed.intro"))) === "off", "intro can be turned off in Settings");
    await ictx.close();
  }

  // ---------- 1. Make a schedule "photo" (a rendered portal screenshot)
  const img = await browser.newPage({ viewport: { width: 900, height: 330 } });
  await img.setContent(`<body style="margin:24px;font:20px Arial;background:#fff;color:#111">
    <h3 style="margin:0 0 12px">Student Schedule - 1st Semester</h3>
    <table cellpadding="8" style="border-collapse:collapse">
      <tr><td>IT 101</td><td>Intro to Computing</td><td>MWF</td><td>8:00-9:00 AM</td><td>Rm 301</td></tr>
      <tr><td>CS 201</td><td>Data Structures</td><td>TTh</td><td>1:00-2:30 PM</td><td>Lab 3</td></tr>
      <tr><td>MATH 11</td><td>Calculus</td><td>TF</td><td>10:00-11:30 AM</td><td>A-204</td></tr>
    </table></body>`);
  const photo = `${SHOTS}/schedule-photo.png`;
  await img.screenshot({ path: photo });
  await img.close();

  // ---------- 2. Import it
  await page.goto(`${BASE}/schedule/`);
  await page.getByRole("button", { name: "Import from photo" }).click();
  await page.getByRole("dialog").locator('input[type="file"]:not([capture])').setInputFiles(photo);
  await page.getByRole("button", { name: "Scan schedule" }).click();
  const importBtn = page.getByRole("button", { name: /^Import \d+ class/ });
  check(await visible(importBtn, 120_000), "photo scanned with offline OCR");
  const names = await page.getByLabel("Subject name").evaluateAll((els) => els.map((e) => e.value));
  check(names.length === 3 && names.includes("Data Structures") && names.includes("Calculus"), `found 3 classes: ${JSON.stringify(names)}`);
  check((await importBtn.textContent()).includes("7"), "MWF + TTh + TF expands to 7 weekly classes");
  await shot("import-review");
  await importBtn.click();
  check(await visible(page.getByText(/Imported 7 classes/)), "classes imported");
  check(await visible(page.getByText("Free time ·")), "free-time finder shown");
  await page.waitForTimeout(500);
  await shot("schedule-mobile");

  // Scan again with no network: engine must come from the cache.
  await page.evaluate(() => navigator.serviceWorker.ready);
  await ctx.setOffline(true);
  await page.reload();
  await page.getByRole("button", { name: "Import schedule from a photo or text" }).click();
  await page.getByRole("dialog").locator('input[type="file"]:not([capture])').setInputFiles(photo);
  await page.getByRole("button", { name: "Scan schedule" }).click();
  check(await visible(page.getByRole("button", { name: /^Import \d+ class/ }), 120_000), "scanning works offline after first use");
  await page.keyboard.press("Escape");
  await ctx.setOffline(false);

  // ---------- 3. Quick add
  await page.goto(`${BASE}/tasks/`);
  const qa = page.getByLabel(/^Quick add task/);
  await qa.fill("Lab report fri 5pm #CS201 !high");
  check(await visible(page.locator("#quick-add-preview").getByText("CS 201")), "quick add recognises #subject");
  await shot("quick-add");
  await qa.press("Enter");
  check(await visible(page.getByText("Task added")), "quick add saved the task");
  await page.getByRole("tab", { name: /All/ }).click();
  check(await visible(page.getByRole("button", { name: "Lab report" })), "task listed with parsed title");

  // ---------- 4. Heads-up for something due in 30 minutes
  const soon = new Date(Date.now() + 30 * 60_000);
  if (soon.getDate() === new Date().getDate()) {
    const hh = `${String(soon.getHours()).padStart(2, "0")}:${String(soon.getMinutes()).padStart(2, "0")}`;
    await qa.fill(`Submit permit form ${hh}`);
    await qa.press("Enter");
    check(await visible(page.getByText(/Due in (29|30) min: Submit permit form/)), "heads-up pops for a task due in 30 min");
    const bell = page.getByRole("button", { name: /^Heads-up: \d+ need/ });
    check(await visible(bell), "bell shows attention count");
    await bell.first().click();
    await page.getByRole("heading", { name: "Heads-up" }).waitFor();
    await page.waitForTimeout(500);
    await shot("heads-up-panel");
    await page.getByRole("dialog").getByRole("button", { name: "Done" }).first().click();
    check(await visible(page.getByText("Marked done")), "task completed from heads-up panel");
    await page.keyboard.press("Escape");
  } else console.log("SKIP  heads-up test (too close to midnight)");

  // ---------- 5. Dashboard + dialog screenshots
  await page.goto(`${BASE}/`);
  await page.getByRole("heading", { level: 1 }).waitFor();
  await page.waitForTimeout(400);
  await shot("dashboard");
  await page.getByRole("button", { name: "Exam" }).first().click();
  await page.waitForTimeout(400);
  await shot("exam-sheet");
  await page.keyboard.press("Escape");

  // ---------- 6. Text size + calendar export
  await page.goto(`${BASE}/settings/`);
  await page.getByRole("radio", { name: "Largest text" }).click();
  await page.waitForTimeout(300);
  check((await page.evaluate(() => document.documentElement.style.fontSize)) === "125%", "text size setting scales the app");
  await page.goto(`${BASE}/`);
  await page.getByRole("heading", { level: 1 }).waitFor();
  await page.waitForTimeout(300);
  await shot("dashboard-largest-text");
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
  check(!overflow, "no horizontal scroll at largest text size");
  await page.goto(`${BASE}/settings/`);
  await page.getByRole("radio", { name: "Default text" }).click();
  const [dl] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: "Add to Calendar" }).click()]);
  const ics = await readFile(await dl.path(), "utf8");
  check(ics.includes("BEGIN:VCALENDAR") && (ics.match(/RRULE:FREQ=WEEKLY/g) ?? []).length === 7 && ics.includes("BEGIN:VALARM"), "calendar export has 7 weekly classes with alarms");

  // ---------- 7. No horizontal overflow on any page at 375px
  for (const r of ["", "tasks", "calendar", "subjects", "schedule", "exams", "focus", "analytics", "review", "settings"]) {
    await page.goto(`${BASE}/${r}${r ? "/" : ""}`);
    await page.getByRole("heading", { level: 1 }).waitFor();
    const wide = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
    if (wide) check(false, `/${r} overflows horizontally`);
  }
  check(true, "layout checked on every page at 375px");
} catch (err) {
  failed++;
  console.error("FAIL  unexpected:", err.message);
  await shot("failure").catch(() => undefined);
} finally {
  await browser.close();
  server.close();
}
check(errors.length === 0, `no page errors${errors.length ? `: ${errors.join("; ")}` : ""}`);
console.log(failed ? `\n${failed} check(s) failed` : "\nAll feature checks passed");
process.exit(failed ? 1 : 0);
