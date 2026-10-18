/**
 * Local reminders (no push, no server).
 *
 * Native (Android/iOS): @capacitor/local-notifications schedules OS alarms
 * that fire even when the app is closed.
 * Browser: scheduled reminders are not reliable once the tab is closed, so
 * only the focus-timer "session finished" alert is shown, via the
 * Notification API while the page is open.
 *
 * Reminder ids are derived deterministically from the record id, so
 * re-scheduling the same task replaces (never duplicates) its reminder.
 */
import { parseISO, subMinutes } from "date-fns";
import type { Database } from "./db";
import { friendlyDateTime } from "./dates";

export type NotificationStatus = "unsupported" | "granted" | "denied" | "prompt";

const FOCUS_NOTIFICATION_ID = 1;
const KIND_TASK = "task-reminder";
const KIND_EXAM = "exam-reminder";
/** Android/iOS cap pending local notifications (iOS: 64). Keep the soonest. */
const MAX_PENDING = 60;

async function native() {
  const { Capacitor } = await import("@capacitor/core");
  if (!Capacitor.isNativePlatform() || !Capacitor.isPluginAvailable("LocalNotifications")) return null;
  const { LocalNotifications } = await import("@capacitor/local-notifications");
  return LocalNotifications;
}

/** Stable positive 31-bit id from a string (FNV-1a), never colliding with the focus id. */
export function notificationId(key: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < key.length; i++) {
    h ^= key.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  const id = (h >>> 1) & 0x7fffffff;
  return id <= FOCUS_NOTIFICATION_ID ? id + 2 : id;
}

export async function getNotificationStatus(): Promise<NotificationStatus> {
  const ln = await native();
  if (ln) {
    const { display } = await ln.checkPermissions();
    return display === "granted" ? "granted" : display === "denied" ? "denied" : "prompt";
  }
  if (typeof Notification === "undefined") return "unsupported";
  return Notification.permission === "granted" ? "granted" : Notification.permission === "denied" ? "denied" : "prompt";
}

export async function requestNotificationPermission(): Promise<NotificationStatus> {
  const ln = await native();
  if (ln) {
    const { display } = await ln.requestPermissions();
    return display === "granted" ? "granted" : display === "denied" ? "denied" : "prompt";
  }
  if (typeof Notification === "undefined") return "unsupported";
  const res = await Notification.requestPermission();
  return res === "granted" ? "granted" : res === "denied" ? "denied" : "prompt";
}

export async function isNativeNotifications(): Promise<boolean> {
  return (await native()) !== null;
}

export interface ReminderSpec {
  id: number;
  title: string;
  body: string;
  at: Date;
  kind: typeof KIND_TASK | typeof KIND_EXAM;
  refId: string;
}

/** Pure: which reminders *should* exist right now. Exported for tests. */
export function desiredReminders(
  data: Awaited<ReturnType<Database["exportSnapshot"]>>,
  now = new Date(),
): ReminderSpec[] {
  const settings = data.user_settings[0];
  if (settings && !settings.remindersEnabled) return [];
  const taskLead = settings?.taskReminderMinutes ?? 60;
  const examLead = settings?.examReminderMinutes ?? 1440;
  const out: ReminderSpec[] = [];
  for (const t of data.tasks) {
    if (t.completed || !t.dueAt) continue;
    const at = subMinutes(parseISO(t.dueAt), taskLead);
    if (at <= now) continue;
    out.push({ id: notificationId(`task:${t.id}`), kind: KIND_TASK, refId: t.id, at, title: `Due soon: ${t.title}`, body: `Due ${friendlyDateTime(t.dueAt)}` });
  }
  for (const e of data.exams) {
    if (e.completed) continue;
    const at = subMinutes(parseISO(e.examAt), examLead);
    if (at <= now) continue;
    out.push({
      id: notificationId(`exam:${e.id}`), kind: KIND_EXAM, refId: e.id, at, title: `Exam: ${e.title}`,
      body: `${friendlyDateTime(e.examAt)}${e.venue ? ` · ${e.venue}` : ""}`,
    });
  }
  return out.sort((a, b) => a.at.getTime() - b.at.getTime()).slice(0, MAX_PENDING);
}

/**
 * Reconciles OS-scheduled reminders with the database: cancels reminders for
 * deleted/completed/re-dated records and schedules the current set. Safe to
 * call repeatedly. Returns the number of scheduled reminders, or null when
 * not available on this platform / not permitted.
 */
export async function syncReminders(db: Database): Promise<number | null> {
  const ln = await native();
  if (!ln) return null;
  if ((await ln.checkPermissions()).display !== "granted") return null;

  const desired = desiredReminders(await db.exportSnapshot());
  const pending = await ln.getPending();
  const ours = pending.notifications.filter((n) => n.extra?.kind === KIND_TASK || n.extra?.kind === KIND_EXAM);
  if (ours.length) await ln.cancel({ notifications: ours.map((n) => ({ id: n.id })) });
  if (desired.length) {
    await ln.schedule({
      notifications: desired.map((r) => ({
        id: r.id,
        title: r.title,
        body: r.body,
        schedule: { at: r.at, allowWhileIdle: true },
        extra: { kind: r.kind, refId: r.refId },
      })),
    });
  }
  return desired.length;
}

/** Schedules the "focus session finished" alert for when the timer will end. */
export async function scheduleFocusEnd(at: Date, title: string, body: string): Promise<void> {
  const ln = await native();
  if (!ln || (await ln.checkPermissions()).display !== "granted") return;
  await ln.cancel({ notifications: [{ id: FOCUS_NOTIFICATION_ID }] }).catch(() => undefined);
  await ln.schedule({ notifications: [{ id: FOCUS_NOTIFICATION_ID, title, body, schedule: { at, allowWhileIdle: true }, extra: { kind: "focus" } }] });
}

export async function cancelFocusEnd(): Promise<void> {
  const ln = await native();
  if (ln) await ln.cancel({ notifications: [{ id: FOCUS_NOTIFICATION_ID }] }).catch(() => undefined);
}

/** Browser-only immediate alert used when a focus session completes in the open tab. */
export function showWebNotification(title: string, body: string) {
  if (typeof Notification !== "undefined" && Notification.permission === "granted") {
    try {
      new Notification(title, { body, icon: "/icons/icon-192.png" });
    } catch {
      /* Some mobile browsers only allow notifications from a service worker. */
    }
  }
}
