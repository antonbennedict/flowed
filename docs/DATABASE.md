# Local database

## Layers

```
UI components / pages
      │  useLiveQuery(db => db.tasks.list(), [], ["tasks"])
      ▼
Repositories (lib/db/repositories.ts)      ← the only public data API
  • Zod validation, UUIDs, ISO timestamps
  • multi-record transactions (task + checklist, Catch-Up reschedule)
  • change events → live queries refresh, reminders re-sync
      ▼
StorageBackend contract (lib/db/backend.ts)
      ├── SqliteBackend    (Android/iOS)  lib/db/sqlite/
      └── IndexedDbBackend (browser)      lib/db/indexeddb/
```

`getDatabase()` (lib/db/index.ts) decides the backend once:

```ts
if (Capacitor.isNativePlatform() && Capacitor.isPluginAvailable("CapacitorSQLite"))
  → dynamic import("./sqlite/capacitor-driver")  // never loaded in browsers
else
  → IndexedDB
```

The database is created and migrated automatically on first launch. `localStorage` is used only for the running focus-timer snapshot, which is small, non-sensitive UI state.

## Tables / object stores

| Table | Key relations | On parent delete |
|---|---|---|
| `subjects` | none | |
| `tasks` | `subject_id → subjects` | SET NULL |
| `subtasks` | `task_id → tasks` | CASCADE |
| `class_schedules` | `subject_id → subjects` (required) | CASCADE |
| `exams` | `subject_id → subjects` | SET NULL (checklist stored as JSON, `CHECK(json_valid)`) |
| `personal_events` | none | |
| `focus_sessions` | `subject_id → subjects` | SET NULL (history is kept) |
| `user_settings` | single row, `CHECK(id = 'default')` | |
| `weekly_goals` | keyed by `week_start` (yyyy-MM-dd) | |

Conventions: UUID v4 primary keys, ISO 8601 UTC instants (`2026-10-18T09:00:00.000Z`), `HH:mm` for recurring class times, and booleans stored as `0/1` with CHECK constraints. Indexes cover every foreign key plus the date columns used for range scans.

**SQLite** enforces foreign keys (`PRAGMA foreign_keys = ON` on every connection), CHECK constraints and cascades. Every value is passed as a bound parameter. Column names come from a fixed whitelist (`sqlite/columns.ts`) and never from input. Upserts use `ON CONFLICT DO UPDATE`, not `INSERT OR REPLACE`, so that updating a parent never fires a cascade delete.

**IndexedDB** cannot enforce relations, so `indexeddb/backend.ts` mirrors the same rules in code: it checks that a referenced parent exists on insert/update, and applies cascade and set-null on delete, all inside one `readwrite` transaction. A contract test suite (`tests/repositories.test.ts`) runs identically against both backends to keep them in step.

## Errors

Driver errors are converted to `DatabaseError` with a `code` (`VALIDATION`, `CONSTRAINT`, `NOT_FOUND`, `QUOTA_EXCEEDED`, `MIGRATION_FAILED`, ...) and a message that is safe to show the user, for example *"Could not save the task: Task title is required (title)"*. If the database cannot be opened, the app shows a full-screen error with a retry button.

## Migrations

- **SQLite**: `sqlite/migrations.ts`. Each step runs in a transaction and sets `PRAGMA user_version`. The plugin's own upgrade mechanism is not used.
- **IndexedDB**: `indexeddb/migrations.ts`. Steps run inside the atomic `upgradeneeded` transaction.
- Opening data that came from a *newer* schema is refused with a clear message instead of corrupting it.

### Adding a column or table

1. Update the Zod schema in `schema.ts` (with a `.default()` so older backups still validate).
2. Append a SQLite migration, e.g. `{ version: 2, statements: ["ALTER TABLE tasks ADD COLUMN estimate_minutes INTEGER NOT NULL DEFAULT 0"] }`, and add the column mapping in `sqlite/columns.ts`.
3. Append an IndexedDB migration (only needed for new stores or indexes; otherwise backfill values with a cursor).
4. Add the field to `ORDER_BY`/`COMPARATORS` if it affects ordering, and to `INDEXED_FIELDS` if you need lookups on it.
5. Run `npm test`. Both backends must pass.

Never edit a migration that has already shipped.
