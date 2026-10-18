# Testing

## Automated

```bash
npm run test:all   # typecheck → lint → unit/contract → static build → browser E2E
```

| Suite | Covers |
|---|---|
| `tests/repositories.test.ts` | The **same** suite runs on SQLite (the real migrations and SQL, executed by Node's `node:sqlite`) and on IndexedDB (`fake-indexeddb`). It covers default settings, validation messages, FK enforcement, the atomic task + checklist save, transaction rollback, cascade and set-null, ordering, range queries, change events, backup round-trip and merge de-duplication, malformed backups, clear-all, and persistence across reconnects (`user_version` and `foreign_keys` checks). |
| `tests/insights.test.ts` | Priority suggestions, heavy days, streaks, the Catch-Up plan, schedule overlaps, completion rate, reminder ids and lead times. |
| `tests/schedule-import.test.ts` | Schedule text parser: registrar rows, pipes, TTh/MWF/Mon-Fri, AM/PM inference, 24-hour times, split OCR rows, headers, flagged rows. |
| `tests/quick-add.test.ts` | Natural-language dates, times, #subject, !priority and categories. |
| `tests/alerts.test.ts` | Heads-up ordering, thresholds, stable ids, free-time slots, .ics validity (escaping, folding, RRULE, alarms). |
| `scripts/e2e-offline.mjs` | Service-worker offline mode: reload, navigation and saving with no network. |
| `scripts/e2e-features.mjs` | Renders a schedule image, scans it with real OCR, imports 7 classes, rescans **offline**; quick add; a heads-up for a task due in 30 min; text size; .ics export; no horizontal overflow on any page at 375px. Screenshots are saved to `test-results/features/`. |
| `scripts/e2e-responsive.mjs` | iOS auto-zoom guard (every text field ≥16px on touch screens, incl. "Small" text, dialogs, paste box); no sideways overflow from 320px to 1440px incl. landscape phone and tablets; bottom bar / side rail / sidebar per width; simulated keyboard keeps the sheet above it and hides the tab bar. |
| `scripts/e2e-smoke.mjs` | In real Edge/Chrome against `out/`: onboarding, creating a subject/class/task/exam through the UI, overlap warning, Catch-Up, completion, **persistence after a full reload**, bottom-nav "More", JSON export, the typed reset guard, re-import, every route rendering with no console errors. Screenshots are saved to `test-results/screens/`. |

## Manual release checklist (on a device)

Install the debug APK or run from Xcode, then:

**Persistence**
- [ ] First launch shows the empty dashboard with no error (database created).
- [ ] Add a subject, a class, a task with 2 checklist items, an exam and a focus session.
- [ ] **Force-stop** the app (Android: Settings → Apps → Flowed → Force stop; iOS: swipe it away), reopen, and confirm everything is still there.
- [ ] Reboot the device, reopen, and confirm the data is still there.
- [ ] Turn on airplane mode and confirm every screen still works.

**Notifications**
- [ ] Settings → Allow notifications, then accept the system prompt.
- [ ] Set the task reminder to "At the due time", create a task due in 2 minutes, background the app, and confirm the reminder arrives.
- [ ] Edit that task's due date before it fires: only one reminder arrives, at the new time.
- [ ] Complete or delete a task with a pending reminder: no reminder arrives.
- [ ] Start a 1-minute focus session and lock the phone: the "session complete" notification arrives.
- [ ] Deny the permission (or turn it off in system settings): Settings explains how to re-enable it.

**Navigation & input**
- [ ] Android back closes an open dialog, then goes back a page, and exits only from Home.
- [ ] Focusing an input near the bottom of a dialog keeps it above the keyboard.
- [ ] Content isn't hidden by the notch, home indicator or status bar (safe areas).
- [ ] Bottom nav and "More" reach every section; on a tablet or desktop the sidebar shows.

**Data management**
- [ ] Export backup, then Clear all data (requires typing DELETE), then import the file with Merge. Everything is restored.
- [ ] Import the same file again: the preview shows 0 new and the import button is disabled.
- [ ] Import a non-Flowed JSON file: it is rejected with a clear message.
- [ ] Replace mode shows how many records will be deleted before confirming.

**Appearance**
- [ ] Light, dark and system themes; text stays readable in both.
- [ ] Animations are reduced when the OS "Reduce motion" setting is on.
