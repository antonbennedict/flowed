# Backup & restore

Open **Settings → Backup & restore**.

## Export

- **Export backup (.json)**: every table, versioned. In a browser it downloads; in the app it is saved to Documents and the share sheet opens so you can keep it in Files, Drive and so on.
- **Tasks CSV / Focus CSV**: human-readable reports for spreadsheets. They are UTF-8 with a BOM so Excel opens them correctly, and cells starting with `= + - @` are neutralised to prevent formula injection. CSV files can't be imported back.

### File format

```json
{
  "app": "flowed",
  "formatVersion": 1,
  "schemaVersion": 1,
  "exportedAt": "2026-10-18T09:00:00.000Z",
  "data": {
    "subjects": [], "tasks": [], "subtasks": [], "class_schedules": [], "exams": [],
    "personal_events": [], "focus_sessions": [], "user_settings": [], "weekly_goals": []
  }
}
```

Records use the same camelCase shapes as `src/lib/db/schema.ts`.

## Import

1. **Choose backup file…** The file is parsed and validated without changing anything:
   - it must be JSON with `"app": "flowed"` (files from before the rename, with `"uniflow"`, are accepted too)
   - a `formatVersion` newer than this app is rejected with "update the app"
   - every record is validated against its schema, and duplicate ids are rejected
   - links between records (a task's subject, a checklist's task, ...) must resolve
   - any problem rejects the **whole file** and lists up to 20 issues
2. A **preview** shows, per data type, how many records are new, updated or skipped.
3. Choose a mode:
   - **Merge (default)**: records with ids that aren't on this device are added. If an id exists, the backup copy replaces it **only if its `updatedAt` is newer**. Nothing is deleted. Importing the same file twice is a no-op, which prevents accidental duplicates.
   - **Replace**: deletes all current data, then restores the backup exactly. The preview states how many existing records will be deleted.
4. Confirm. All writes happen in **one transaction** (SQLite `BEGIN…COMMIT`, or a single IndexedDB `readwrite` transaction). If anything fails, nothing is applied.

After an import, reminders are rescheduled automatically.

## Clear all data

**Settings → Danger zone → Clear all data**. You must type `DELETE` to confirm. This removes every record in a single transaction and cancels pending reminders. It can't be undone, so export first.
