/**
 * End-to-end smoke test against the static export in `out/`.
 * Uses the locally installed Microsoft Edge (or Chrome) through
 * playwright-core, so no browser download is needed.
 *
 *   npm run build && npm run test:e2e
 *
 * Covers: first launch, creating a subject/class/task (with checklist) via
 * the UI, completion, persistence across a full reload (IndexedDB), every
 * route rendering without console errors, and screenshots for review.
 */
import { createServer } from "node:http";
import { readFile, stat, mkdir } from "node:fs/promises";
import path from "node:path";
import { chromium } from "playwright-core";

const ROOT = path.resolve("out");
const SHOTS = path.resolve(process.env.SHOTS_DIR ?? "test-results/screens");
const TYPES = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".png": "image/png", ".woff2": "font/woff2", ".json": "application/json", ".webmanifest": "application/manifest+json", ".ico": "image/x-icon", ".txt": "text/plain" };

const server = createServer(async (req, res) => {
  let p = decodeURIComponent(new URL(req.url, "http://x").pathname);
  let file = path.join(ROOT, p);
  try {
    if ((await stat(file)).isDirectory()) file = path.join(file, "index.html");
  } catch {
    file = path.join(ROOT, "404.html");
  }
  try {
    const body = await readFile(file);
    res.writeHead(200, { "content-type": TYPES[path.extname(file)] ?? "application/octet-stream" });
    res.end(body);
  } catch {
    res.writeHead(404).end("not found");
  }
});
await new Promise((r) => server.listen(4173, r));
const BASE = "http://localhost:4173";

const channel = process.env.BROWSER_CHANNEL ?? "msedge";
const browser = await chromium.launch({ channel });
await mkdir(SHOTS, { recursive: true });
const errors = [];
let failed = 0;
/** Waits (up to 5s) for a locator to become visible instead of sampling once. */
const visible = (loc) => loc.first().waitFor({ state: "visible", timeout: 5000 }).then(() => true, () => false);
const check = (cond, msg) => {
  console.log(`${cond ? "PASS" : "FAIL"}  ${msg}`);
  if (!cond) failed++;
};

async function run(viewport, tag) {
  const ctx = await browser.newContext({ viewport, deviceScaleFactor: 1, colorScheme: tag.includes("dark") ? "dark" : "light" });
  await ctx.addInitScript(() => localStorage.setItem("flowed.intro", "off")); // intro has its own test
  const page = await ctx.newPage();
  page.on("console", (m) => m.type() === "error" && errors.push(`[${tag}] ${m.text()}`));
  page.on("pageerror", (e) => errors.push(`[${tag}] ${e.message}`));
  return { ctx, page };
}

try {
  // ---------- Mobile flow
  const { ctx, page } = await run({ width: 390, height: 844 }, "mobile");
  await page.goto(`${BASE}/`);
  await page.getByRole("heading", { level: 1 }).waitFor();
  check(await visible(page.getByText("Set up your semester")), "first launch shows onboarding empty state");

  // Subject
  await page.getByRole("button", { name: "Add first subject" }).click();
  await page.getByLabel("Name").fill("Data Structures");
  await page.getByLabel("Code").fill("CS 201");
  await page.getByLabel("Instructor").fill("Prof. Reyes");
  await page.getByRole("radio", { name: "Violet" }).click();
  await page.getByRole("button", { name: "Add subject" }).click();
  await page.getByText("Subject added").waitFor();
  check(true, "subject created via dialog");

  // Class for today, plus an overlapping one to trigger the warning
  const today = new Date().getDay();
  for (const [s, e] of [["08:00", "09:30"], ["09:00", "10:00"]]) {
    await page.goto(`${BASE}/schedule/`);
    await page.getByRole("button", { name: "Add class" }).first().click();
    await page.getByRole("dialog").getByLabel("Subject").click();
    await page.getByRole("option", { name: /Data Structures/ }).click();
    await page.getByRole("dialog").getByLabel("Day").click();
    await page.getByRole("option", { name: ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"][today] }).click();
    await page.getByLabel("Starts").fill(s);
    await page.getByLabel("Ends").fill(e);
    await page.getByLabel("Room").fill("Lab 3");
    await page.getByRole("dialog").getByRole("button", { name: "Add class" }).click();
    await page.getByRole("dialog").waitFor({ state: "detached" });
  }
  check(await visible(page.getByText("2 classes overlap")), "overlap warning shown on timetable");
  await page.screenshot({ path: `${SHOTS}/mobile-schedule.png`, fullPage: true });

  // Task with checklist, due today
  await page.goto(`${BASE}/tasks/`);
  await page.getByRole("button", { name: "New task" }).click();
  await page.getByLabel("Title").fill("Linked list assignment");
  const d = new Date();
  const iso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  await page.getByLabel("Due date").fill(iso);
  await page.getByLabel("Due time").fill("23:30");
  await page.getByRole("radio", { name: "high" }).click();
  await page.getByLabel("New checklist item").fill("Implement insert");
  await page.getByRole("button", { name: "Add checklist item" }).click();
  await page.getByLabel("New checklist item").fill("Write tests");
  await page.getByRole("button", { name: "Add task" }).click();
  await page.getByText("Task added").waitFor();
  check(await visible(page.getByRole("button", { name: "Linked list assignment" })), "task appears in Today view");
  check(await visible(page.getByText("Priority suggestions")), "priority suggestion offered for task due within 24h");
  check(await visible(page.getByText("0/2")), "checklist progress shown");

  // Overdue task for Catch-Up mode
  await page.getByRole("button", { name: "New task" }).click();
  await page.getByLabel("Title").fill("Reading reflection");
  const y = new Date(Date.now() - 2 * 86400000);
  await page.getByLabel("Due date").fill(`${y.getFullYear()}-${String(y.getMonth() + 1).padStart(2, "0")}-${String(y.getDate()).padStart(2, "0")}`);
  await page.getByRole("button", { name: "Add task" }).click();
  await page.getByRole("dialog").waitFor({ state: "detached" });
  await page.getByRole("tab", { name: /Overdue/ }).click();
  check(await visible(page.getByText("Catch-Up mode")), "Catch-Up plan offered for overdue tasks");
  await page.screenshot({ path: `${SHOTS}/mobile-tasks-overdue.png`, fullPage: true });

  // Exam
  await page.goto(`${BASE}/exams/`);
  await page.getByRole("button", { name: "New exam" }).click();
  await page.getByLabel("Title").fill("Midterm");
  const x = new Date(Date.now() + 5 * 86400000);
  await page.getByLabel("Date").fill(`${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, "0")}-${String(x.getDate()).padStart(2, "0")}`);
  await page.getByLabel("Venue").fill("Hall B");
  await page.getByLabel("New checklist item").fill("Review trees");
  await page.getByRole("button", { name: "Add exam" }).click();
  await page.getByText("Exam added").waitFor();
  check(true, "exam created");

  // Complete the today task from the dashboard
  await page.goto(`${BASE}/`);
  await page.getByRole("checkbox", { name: 'Complete "Linked list assignment"' }).click();
  await page.getByText("Task completed").waitFor();
  check(true, "task completed from dashboard");

  // ---- Persistence: full reload
  await page.reload();
  await page.getByRole("heading", { level: 1 }).waitFor();
  await page.getByText("Today's classes").waitFor();
  check(await visible(page.getByText("1/1")), "completion persisted after reload (IndexedDB)");
  check(await visible(page.getByText("Midterm")), "exam persisted after reload");
  await page.screenshot({ path: `${SHOTS}/mobile-dashboard.png`, fullPage: true });

  // Bottom nav "More" sheet
  await page.getByRole("button", { name: "More" }).click();
  await page.getByRole("link", { name: "Analytics" }).click();
  await page.getByRole("heading", { name: "Analytics" }).waitFor();
  check(true, "bottom-nav More sheet navigates");

  // Settings: export + reset guard
  await page.goto(`${BASE}/settings/`);
  const [download] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: /Export backup/ }).click()]);
  const backupPath = path.join(SHOTS, "backup.json");
  await download.saveAs(backupPath);
  const backup = JSON.parse(await readFile(backupPath, "utf8"));
  check(backup.app === "flowed" && backup.data.tasks.length === 2 && backup.data.subtasks.length === 2, "JSON backup exported with all records");

  await page.getByRole("button", { name: "Clear all data" }).click();
  check(await page.getByRole("button", { name: "Delete everything" }).isDisabled(), "reset requires typing DELETE");
  await page.getByLabel("Type DELETE to confirm").fill("DELETE");
  await page.getByRole("button", { name: "Delete everything" }).click();
  await page.getByText("All data deleted").waitFor();

  // Import the backup back (merge into empty)
  await page.locator("#import-file").setInputFiles(backupPath);
  await page.getByText("Import backup").waitFor();
  await page.getByRole("button", { name: /Import \d+ records/ }).click();
  await page.getByText("Backup imported").waitFor();
  await page.goto(`${BASE}/tasks/?view=all`);
  check(await visible(page.getByRole("button", { name: "Linked list assignment" })), "data restored from backup");

  // Every route renders
  for (const r of ["", "tasks", "calendar", "subjects", "schedule", "exams", "focus", "analytics", "review", "settings"]) {
    await page.goto(`${BASE}/${r}${r ? "/" : ""}`);
    await page.getByRole("heading", { level: 1 }).waitFor();
  }
  check(true, "all routes render");
  await page.goto(`${BASE}/calendar/`);
  await page.screenshot({ path: `${SHOTS}/mobile-calendar.png`, fullPage: true });
  await page.goto(`${BASE}/focus/`);
  await page.screenshot({ path: `${SHOTS}/mobile-focus.png`, fullPage: true });
  const backupState = await ctx.storageState();
  await ctx.close();

  // ---------- Desktop (light + dark) with the same data
  for (const tag of ["desktop", "desktop-dark"]) {
    const dctx = await browser.newContext({ viewport: { width: 1366, height: 900 }, colorScheme: tag.endsWith("dark") ? "dark" : "light", storageState: backupState });
    await dctx.addInitScript(() => localStorage.setItem("flowed.intro", "off"));
    const p = await dctx.newPage();
    p.on("pageerror", (e) => errors.push(`[${tag}] ${e.message}`));
    // Re-import, since IndexedDB isn't part of storageState.
    await p.goto(`${BASE}/settings/`);
    await p.locator("#import-file").setInputFiles(backupPath);
    await p.getByRole("button", { name: /Import \d+ records/ }).click();
    await p.getByText("Backup imported").waitFor();
    for (const r of ["", "calendar", "schedule", "analytics"]) {
      await p.goto(`${BASE}/${r}${r ? "/" : ""}`);
      await p.getByRole("heading", { level: 1 }).waitFor();
      await p.waitForTimeout(300);
      await p.screenshot({ path: `${SHOTS}/${tag}-${r || "dashboard"}.png`, fullPage: true });
    }
    await dctx.close();
  }
} catch (err) {
  failed++;
  console.error("FAIL  unexpected error:", err.message);
} finally {
  await browser.close();
  server.close();
}

const relevant = errors.filter((e) => !/favicon|Download the React DevTools/.test(e));
check(relevant.length === 0, `no console/page errors${relevant.length ? `:\n  ${relevant.join("\n  ")}` : ""}`);
console.log(failed ? `\n${failed} check(s) failed` : "\nAll E2E checks passed");
process.exit(failed ? 1 : 0);
