/**
 * SQLite schema migrations.
 *
 * Each migration runs inside a transaction and bumps `PRAGMA user_version`.
 * To change the schema: append a new entry (never edit a shipped one), bump
 * nothing else — `SQLITE_SCHEMA_VERSION` is derived from this list. Mirror
 * the change in `indexeddb/migrations.ts` and the Zod schema.
 */
export interface Migration {
  version: number;
  description: string;
  statements: string[];
}

export const migrations: Migration[] = [
  {
    version: 1,
    description: "Initial schema",
    statements: [
      `CREATE TABLE IF NOT EXISTS subjects (
        id          TEXT PRIMARY KEY NOT NULL,
        name        TEXT NOT NULL CHECK (length(name) BETWEEN 1 AND 80),
        code        TEXT NOT NULL DEFAULT '',
        instructor  TEXT NOT NULL DEFAULT '',
        color       TEXT NOT NULL DEFAULT '#4F46E5' CHECK (color GLOB '#[0-9A-Fa-f][0-9A-Fa-f][0-9A-Fa-f][0-9A-Fa-f][0-9A-Fa-f][0-9A-Fa-f]'),
        notes       TEXT NOT NULL DEFAULT '',
        created_at  TEXT NOT NULL,
        updated_at  TEXT NOT NULL
      )`,
      `CREATE INDEX IF NOT EXISTS idx_subjects_name ON subjects(name)`,

      `CREATE TABLE IF NOT EXISTS tasks (
        id            TEXT PRIMARY KEY NOT NULL,
        title         TEXT NOT NULL CHECK (length(title) BETWEEN 1 AND 160),
        description   TEXT NOT NULL DEFAULT '',
        subject_id    TEXT REFERENCES subjects(id) ON DELETE SET NULL,
        due_at        TEXT,
        priority      TEXT NOT NULL DEFAULT 'medium' CHECK (priority IN ('low','medium','high','urgent')),
        category      TEXT NOT NULL DEFAULT 'assignment' CHECK (category IN ('assignment','project','quiz','exam','personal')),
        completed     INTEGER NOT NULL DEFAULT 0 CHECK (completed IN (0,1)),
        completed_at  TEXT,
        created_at    TEXT NOT NULL,
        updated_at    TEXT NOT NULL
      )`,
      `CREATE INDEX IF NOT EXISTS idx_tasks_subject ON tasks(subject_id)`,
      `CREATE INDEX IF NOT EXISTS idx_tasks_due ON tasks(due_at)`,
      `CREATE INDEX IF NOT EXISTS idx_tasks_completed ON tasks(completed, due_at)`,

      `CREATE TABLE IF NOT EXISTS subtasks (
        id          TEXT PRIMARY KEY NOT NULL,
        task_id     TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
        title       TEXT NOT NULL CHECK (length(title) BETWEEN 1 AND 160),
        completed   INTEGER NOT NULL DEFAULT 0 CHECK (completed IN (0,1)),
        position    INTEGER NOT NULL DEFAULT 0,
        created_at  TEXT NOT NULL,
        updated_at  TEXT NOT NULL
      )`,
      `CREATE INDEX IF NOT EXISTS idx_subtasks_task ON subtasks(task_id, position)`,

      `CREATE TABLE IF NOT EXISTS class_schedules (
        id          TEXT PRIMARY KEY NOT NULL,
        subject_id  TEXT NOT NULL REFERENCES subjects(id) ON DELETE CASCADE,
        weekday     INTEGER NOT NULL CHECK (weekday BETWEEN 0 AND 6),
        start_time  TEXT NOT NULL,
        end_time    TEXT NOT NULL,
        room        TEXT NOT NULL DEFAULT '',
        instructor  TEXT NOT NULL DEFAULT '',
        created_at  TEXT NOT NULL,
        updated_at  TEXT NOT NULL,
        CHECK (end_time > start_time)
      )`,
      `CREATE INDEX IF NOT EXISTS idx_schedules_subject ON class_schedules(subject_id)`,
      `CREATE INDEX IF NOT EXISTS idx_schedules_weekday ON class_schedules(weekday, start_time)`,

      `CREATE TABLE IF NOT EXISTS exams (
        id                TEXT PRIMARY KEY NOT NULL,
        title             TEXT NOT NULL CHECK (length(title) BETWEEN 1 AND 160),
        subject_id        TEXT REFERENCES subjects(id) ON DELETE SET NULL,
        exam_at           TEXT NOT NULL,
        duration_minutes  INTEGER NOT NULL DEFAULT 60 CHECK (duration_minutes BETWEEN 5 AND 600),
        venue             TEXT NOT NULL DEFAULT '',
        notes             TEXT NOT NULL DEFAULT '',
        checklist         TEXT NOT NULL DEFAULT '[]' CHECK (json_valid(checklist)),
        completed         INTEGER NOT NULL DEFAULT 0 CHECK (completed IN (0,1)),
        created_at        TEXT NOT NULL,
        updated_at        TEXT NOT NULL
      )`,
      `CREATE INDEX IF NOT EXISTS idx_exams_subject ON exams(subject_id)`,
      `CREATE INDEX IF NOT EXISTS idx_exams_at ON exams(exam_at)`,

      `CREATE TABLE IF NOT EXISTS personal_events (
        id           TEXT PRIMARY KEY NOT NULL,
        title        TEXT NOT NULL CHECK (length(title) BETWEEN 1 AND 160),
        description  TEXT NOT NULL DEFAULT '',
        location     TEXT NOT NULL DEFAULT '',
        start_at     TEXT NOT NULL,
        end_at       TEXT NOT NULL,
        all_day      INTEGER NOT NULL DEFAULT 0 CHECK (all_day IN (0,1)),
        created_at   TEXT NOT NULL,
        updated_at   TEXT NOT NULL,
        CHECK (end_at >= start_at)
      )`,
      `CREATE INDEX IF NOT EXISTS idx_events_start ON personal_events(start_at)`,

      `CREATE TABLE IF NOT EXISTS focus_sessions (
        id                TEXT PRIMARY KEY NOT NULL,
        subject_id        TEXT REFERENCES subjects(id) ON DELETE SET NULL,
        started_at        TEXT NOT NULL,
        ended_at          TEXT NOT NULL,
        duration_minutes  REAL NOT NULL CHECK (duration_minutes >= 0),
        completed         INTEGER NOT NULL DEFAULT 1 CHECK (completed IN (0,1)),
        created_at        TEXT NOT NULL,
        updated_at        TEXT NOT NULL
      )`,
      `CREATE INDEX IF NOT EXISTS idx_focus_subject ON focus_sessions(subject_id)`,
      `CREATE INDEX IF NOT EXISTS idx_focus_started ON focus_sessions(started_at)`,

      `CREATE TABLE IF NOT EXISTS user_settings (
        id                         TEXT PRIMARY KEY NOT NULL CHECK (id = 'default'),
        display_name               TEXT NOT NULL DEFAULT '',
        course                     TEXT NOT NULL DEFAULT '',
        year_level                 TEXT NOT NULL DEFAULT '',
        theme                      TEXT NOT NULL DEFAULT 'system' CHECK (theme IN ('system','light','dark')),
        week_starts_on             INTEGER NOT NULL DEFAULT 1 CHECK (week_starts_on IN (0,1)),
        focus_minutes              INTEGER NOT NULL DEFAULT 25,
        short_break_minutes        INTEGER NOT NULL DEFAULT 5,
        long_break_minutes         INTEGER NOT NULL DEFAULT 15,
        sessions_before_long_break INTEGER NOT NULL DEFAULT 4,
        daily_focus_goal_minutes   INTEGER NOT NULL DEFAULT 120,
        reminders_enabled          INTEGER NOT NULL DEFAULT 1 CHECK (reminders_enabled IN (0,1)),
        task_reminder_minutes      INTEGER NOT NULL DEFAULT 60,
        exam_reminder_minutes      INTEGER NOT NULL DEFAULT 1440,
        focus_end_notification     INTEGER NOT NULL DEFAULT 1 CHECK (focus_end_notification IN (0,1)),
        heavy_day_threshold        INTEGER NOT NULL DEFAULT 4,
        created_at                 TEXT NOT NULL,
        updated_at                 TEXT NOT NULL
      )`,

      `CREATE TABLE IF NOT EXISTS weekly_goals (
        id          TEXT PRIMARY KEY NOT NULL,
        week_start  TEXT NOT NULL,
        title       TEXT NOT NULL CHECK (length(title) BETWEEN 1 AND 160),
        metric      TEXT NOT NULL DEFAULT 'custom' CHECK (metric IN ('tasks_completed','focus_minutes','custom')),
        target      INTEGER NOT NULL DEFAULT 1 CHECK (target >= 1),
        progress    INTEGER NOT NULL DEFAULT 0 CHECK (progress >= 0),
        reflection  TEXT NOT NULL DEFAULT '',
        created_at  TEXT NOT NULL,
        updated_at  TEXT NOT NULL
      )`,
      `CREATE INDEX IF NOT EXISTS idx_goals_week ON weekly_goals(week_start)`,
    ],
  },
  {
    version: 2,
    description: "Text size, class heads-up and live heads-up settings",
    statements: [
      `ALTER TABLE user_settings ADD COLUMN text_scale TEXT NOT NULL DEFAULT 'md' CHECK (text_scale IN ('sm','md','lg','xl'))`,
      `ALTER TABLE user_settings ADD COLUMN class_reminder_minutes INTEGER NOT NULL DEFAULT 15 CHECK (class_reminder_minutes BETWEEN 0 AND 120)`,
      `ALTER TABLE user_settings ADD COLUMN heads_up_enabled INTEGER NOT NULL DEFAULT 1 CHECK (heads_up_enabled IN (0,1))`,
    ],
  },
];

export const SQLITE_SCHEMA_VERSION = migrations[migrations.length - 1].version;
