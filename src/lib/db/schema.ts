/**
 * Domain model for Flowed.
 *
 * Every entity is defined once here as a Zod schema; TypeScript types are
 * inferred from them. Both storage backends (SQLite and IndexedDB) persist
 * exactly these shapes, and the backup format re-uses them for validation.
 *
 * Conventions
 * - IDs are UUID v4 strings generated on the device.
 * - Instants (createdAt, dueAt, examAt, ...) are ISO 8601 UTC strings.
 * - Wall-clock values that recur (class start/end) are "HH:mm" strings.
 * - Calendar weeks are identified by their local start date "yyyy-MM-dd".
 */
import { z } from "zod";

const isoDateTime = z.iso.datetime({ offset: true, message: "Must be an ISO 8601 date-time" });
const isoDate = z.iso.date({ message: "Must be a yyyy-MM-dd date" });
const id = z.uuid({ message: "Invalid id" });
const hhmm = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Use HH:mm (24-hour) time");
const hexColor = z.string().regex(/^#[0-9a-fA-F]{6}$/, "Use a #RRGGBB colour");
const shortText = (max: number) => z.string().trim().max(max, `Keep this under ${max} characters`);

const timestamps = {
  createdAt: isoDateTime,
  updatedAt: isoDateTime,
};

// ---------------------------------------------------------------- Subjects
export const subjectInputSchema = z.object({
  name: shortText(80).min(1, "Subject name is required"),
  code: shortText(24).default(""),
  instructor: shortText(80).default(""),
  color: hexColor.default("#4F46E5"),
  notes: shortText(4000).default(""),
});
export const subjectSchema = subjectInputSchema.extend({ id, ...timestamps });
export type Subject = z.infer<typeof subjectSchema>;
export type SubjectInput = z.input<typeof subjectInputSchema>;

// ------------------------------------------------------------------- Tasks
export const PRIORITIES = ["low", "medium", "high", "urgent"] as const;
export const CATEGORIES = ["assignment", "project", "quiz", "exam", "personal"] as const;
export type Priority = (typeof PRIORITIES)[number];
export type Category = (typeof CATEGORIES)[number];

export const taskInputSchema = z.object({
  title: shortText(160).min(1, "Task title is required"),
  description: shortText(4000).default(""),
  subjectId: id.nullable().default(null),
  dueAt: isoDateTime.nullable().default(null),
  priority: z.enum(PRIORITIES).default("medium"),
  category: z.enum(CATEGORIES).default("assignment"),
});
export const taskSchema = taskInputSchema.extend({
  id,
  completed: z.boolean(),
  completedAt: isoDateTime.nullable(),
  ...timestamps,
});
export type Task = z.infer<typeof taskSchema>;
export type TaskInput = z.input<typeof taskInputSchema>;

// ---------------------------------------------------------------- Subtasks
export const subtaskInputSchema = z.object({
  taskId: id,
  title: shortText(160).min(1, "Checklist item cannot be empty"),
  completed: z.boolean().default(false),
  position: z.number().int().min(0).default(0),
});
export const subtaskSchema = subtaskInputSchema.extend({ id, ...timestamps });
export type Subtask = z.infer<typeof subtaskSchema>;
export type SubtaskInput = z.input<typeof subtaskInputSchema>;

// --------------------------------------------------------- Class schedules
export const classScheduleInputSchema = z
  .object({
    subjectId: id,
    weekday: z.number().int().min(0).max(6), // 0 = Sunday (date-fns convention)
    startTime: hhmm,
    endTime: hhmm,
    room: shortText(60).default(""),
    instructor: shortText(80).default(""),
  })
  .refine((v) => v.endTime > v.startTime, {
    message: "End time must be after start time",
    path: ["endTime"],
  });
export const classScheduleSchema = z
  .object({
    id,
    subjectId: id,
    weekday: z.number().int().min(0).max(6),
    startTime: hhmm,
    endTime: hhmm,
    room: z.string(),
    instructor: z.string(),
    ...timestamps,
  });
export type ClassSchedule = z.infer<typeof classScheduleSchema>;
export type ClassScheduleInput = z.input<typeof classScheduleInputSchema>;

// ------------------------------------------------------------------- Exams
export const checklistItemSchema = z.object({
  id,
  text: shortText(160).min(1),
  done: z.boolean(),
});
export type ChecklistItem = z.infer<typeof checklistItemSchema>;

export const examInputSchema = z.object({
  title: shortText(160).min(1, "Exam title is required"),
  subjectId: id.nullable().default(null),
  examAt: isoDateTime,
  durationMinutes: z.number().int().min(5).max(600).default(60),
  venue: shortText(120).default(""),
  notes: shortText(4000).default(""),
  checklist: z.array(checklistItemSchema).max(100).default([]),
  completed: z.boolean().default(false),
});
export const examSchema = examInputSchema.extend({ id, ...timestamps });
export type Exam = z.infer<typeof examSchema>;
export type ExamInput = z.input<typeof examInputSchema>;

// --------------------------------------------------------- Personal events
export const personalEventInputSchema = z
  .object({
    title: shortText(160).min(1, "Event title is required"),
    description: shortText(4000).default(""),
    location: shortText(120).default(""),
    startAt: isoDateTime,
    endAt: isoDateTime,
    allDay: z.boolean().default(false),
  })
  .refine((v) => v.endAt >= v.startAt, { message: "End must be after start", path: ["endAt"] });
export const personalEventSchema = z.object({
  id,
  title: z.string(),
  description: z.string(),
  location: z.string(),
  startAt: isoDateTime,
  endAt: isoDateTime,
  allDay: z.boolean(),
  ...timestamps,
});
export type PersonalEvent = z.infer<typeof personalEventSchema>;
export type PersonalEventInput = z.input<typeof personalEventInputSchema>;

// ---------------------------------------------------------- Focus sessions
export const focusSessionInputSchema = z.object({
  subjectId: id.nullable().default(null),
  startedAt: isoDateTime,
  endedAt: isoDateTime,
  durationMinutes: z.number().min(0).max(24 * 60),
  completed: z.boolean().default(true),
});
export const focusSessionSchema = focusSessionInputSchema.extend({ id, createdAt: isoDateTime, updatedAt: isoDateTime });
export type FocusSession = z.infer<typeof focusSessionSchema>;
export type FocusSessionInput = z.input<typeof focusSessionInputSchema>;

// ----------------------------------------------------------- User settings
export const THEMES = ["system", "light", "dark"] as const;
export const TEXT_SCALES = ["sm", "md", "lg", "xl"] as const;
export type TextScale = (typeof TEXT_SCALES)[number];
export const settingsInputSchema = z.object({
  displayName: shortText(60).default(""),
  course: shortText(80).default(""),
  yearLevel: shortText(30).default(""),
  theme: z.enum(THEMES).default("system"),
  weekStartsOn: z.union([z.literal(0), z.literal(1)]).default(1),
  focusMinutes: z.number().int().min(1).max(180).default(25),
  shortBreakMinutes: z.number().int().min(1).max(60).default(5),
  longBreakMinutes: z.number().int().min(1).max(90).default(15),
  sessionsBeforeLongBreak: z.number().int().min(2).max(10).default(4),
  dailyFocusGoalMinutes: z.number().int().min(0).max(960).default(120),
  remindersEnabled: z.boolean().default(true),
  taskReminderMinutes: z.number().int().min(0).max(10080).default(60),
  examReminderMinutes: z.number().int().min(0).max(20160).default(1440),
  focusEndNotification: z.boolean().default(true),
  heavyDayThreshold: z.number().int().min(2).max(20).default(4),
  // v2
  textScale: z.enum(TEXT_SCALES).default("md"),
  classReminderMinutes: z.number().int().min(0).max(120).default(15),
  headsUpEnabled: z.boolean().default(true),
});
export const settingsSchema = settingsInputSchema.extend({
  id: z.literal("default"),
  ...timestamps,
});
export type UserSettings = z.infer<typeof settingsSchema>;
export type UserSettingsInput = z.input<typeof settingsInputSchema>;
export const SETTINGS_ID = "default" as const;

// ------------------------------------------------------------ Weekly goals
export const GOAL_METRICS = ["tasks_completed", "focus_minutes", "custom"] as const;
export type GoalMetric = (typeof GOAL_METRICS)[number];
export const weeklyGoalInputSchema = z.object({
  weekStart: isoDate,
  title: shortText(160).min(1, "Goal title is required"),
  metric: z.enum(GOAL_METRICS).default("custom"),
  target: z.number().int().min(1).max(100000).default(1),
  /** Manual progress, used only for metric = "custom". */
  progress: z.number().int().min(0).max(100000).default(0),
  reflection: shortText(4000).default(""),
});
export const weeklyGoalSchema = weeklyGoalInputSchema.extend({ id, ...timestamps });
export type WeeklyGoal = z.infer<typeof weeklyGoalSchema>;
export type WeeklyGoalInput = z.input<typeof weeklyGoalInputSchema>;

// --------------------------------------------------------- Table registry
export const TABLES = [
  "subjects",
  "tasks",
  "subtasks",
  "class_schedules",
  "exams",
  "personal_events",
  "focus_sessions",
  "user_settings",
  "weekly_goals",
] as const;
export type TableName = (typeof TABLES)[number];

export interface EntityMap {
  subjects: Subject;
  tasks: Task;
  subtasks: Subtask;
  class_schedules: ClassSchedule;
  exams: Exam;
  personal_events: PersonalEvent;
  focus_sessions: FocusSession;
  user_settings: UserSettings;
  weekly_goals: WeeklyGoal;
}

export const entitySchemas: { [K in TableName]: z.ZodType<EntityMap[K]> } = {
  subjects: subjectSchema,
  tasks: taskSchema,
  subtasks: subtaskSchema,
  class_schedules: classScheduleSchema,
  exams: examSchema,
  personal_events: personalEventSchema,
  focus_sessions: focusSessionSchema,
  user_settings: settingsSchema,
  weekly_goals: weeklyGoalSchema,
};

/** Insert order that satisfies foreign keys (parents first). */
export const PARENT_FIRST_ORDER: TableName[] = [
  "user_settings",
  "subjects",
  "tasks",
  "subtasks",
  "class_schedules",
  "exams",
  "personal_events",
  "focus_sessions",
  "weekly_goals",
];
