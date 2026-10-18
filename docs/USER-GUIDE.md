# Flowed user guide

Everything Flowed can do, and how to use it. New here? Start with **[Get Flowed](../README.md#get-flowed)** to install it.

**Getting around:** on a phone, use the bar at the bottom (**Home, Tasks, Calendar, Focus, More**). On a computer, use the sidebar. The **+** button (top right) adds anything from any screen. The **bell** shows your heads-ups.

---

## Dashboard (Home)
Your day at a glance:
- **Heads-up banner:** the most urgent thing right now. Tap it to see them all.
- **Quick add bar:** add a task in one line (see [Quick add](#quick-add)).
- **Exam / Class / Event / Focus** buttons for adding other things.
- Today's progress, overdue count, focus time and tasks done this week.
- **Due today**, **Overdue**, **Today's classes**, **Upcoming exams**, and **Work on next**: Flowed's suggestion of what to do first.

## Tasks
- **Add:** use the quick-add bar, or **New task** for the full form: description, subject, category, due date/time, priority and a checklist of steps.
- **Complete:** tap the circle. Made a mistake? Tap **Undo** on the message.
- **Edit or delete:** tap the task.
- **Views:** Today, Upcoming, Overdue, Done, All. **Search** and **Filters** (subject, priority, category, sort) are below.
- **Priority suggestions:** Flowed suggests raising the priority of work that's due soon. Tap **Make urgent** to accept.
- **Catch-Up mode** (Overdue tab): a realistic plan that spreads overdue tasks over the next few days, at most two a day and avoiding busy days. Tap **Apply plan** to reschedule them all.

### Quick add
Type naturally and press Enter. Chips under the box show what Flowed understood.

| You type | Flowed understands |
|---|---|
| `today`, `tonight`, `tomorrow`, `fri`, `next mon`, `in 3 days`, `oct 25`, `10/25` | Due date |
| `5pm`, `9:30am`, `17:00`, `noon` | Due time (no time = 11:59 PM) |
| `#CS201` or `#calc` | Subject (by code or the start of its name) |
| `!low`, `!high`, `!urgent` (or `!!` / `!!!`) | Priority |
| words like *quiz*, *exam*, *midterm*, *project* | Category |

Example: `Quiz 3 tomorrow 8am #math !high`. Tap **⧉ (Open full task form)** to add more details before saving.

## Subjects
Add each course with its **code**, **instructor**, a **colour**, and notes. Tap a subject to see its classes, tasks, exams, progress and focus time, and to add new ones directly to it. Deleting a subject removes its class times; tasks and exams are kept.

## Class schedule
- **Import from a photo:** tap **Import** (the scan icon).
  1. **Take a photo** or **Choose screenshot** (a screenshot from your student portal works best), or switch to **Paste text**.
  2. Tap **Scan schedule**. The schedule is read on your phone.
  3. Check each class: code, name, days, times and room. Untick anything wrong, fix days with the day buttons, or **Add a class**. If something was misread, open **Recognised text**, correct it and tap **Parse again**.
  4. Tap **Import**. Subjects you already have are reused, and classes already in your timetable are skipped.
  - Tips: shoot straight on, in good light, with the schedule filling the frame. The scanner downloads once (about 6 MB); after that it works offline.
- **Add manually:** **Add** → pick a subject, day, start/end time and room.
- **Overlaps:** classes at the same time are marked with ⚠ and shown side by side.
- **Free time:** pick a day to see the gaps of 30+ minutes between classes, good for study blocks.
- On a phone, pick a day at the top. On a computer you see the whole week.

## Exams
Add the title, subject, date, start time, length, venue and notes, plus a **preparation checklist** (e.g. "Review chapters 1–5"). Each exam shows a countdown and your prep progress. After the exam, tap **Mark as taken** to move it to Completed.

## Calendar
**Month, Week and Day** views show classes, task deadlines, exams and personal events. Each type has its own colour and icon. Tap a day to see its agenda, tap an item to edit it, or use **New event** for personal events (club, work, appointments).

## Heads-up (the bell)
Flowed watches for:
- **Overdue** tasks
- Tasks **due soon** (within your reminder time, at least 1 hour) and due today or tomorrow
- A **class starting** in 15 minutes (you can change this)
- **Exams** within a day, plus any preparation still left
- A **heavy day tomorrow**

For each alert: **Done** (completes the task), **1 hour** (snooze) or **Dismiss**. While Flowed is open, new alerts pop up. Tap **Allow notifications** to also get phone notifications while it's open.

### Reminders when Flowed is closed
**Settings → Calendar sync → Add to Calendar.** Choose what to include (weekly classes, task deadlines, exams) and for how many weeks. On iPhone, choose **Add All**. Tip: create a calendar named "Flowed" first and pick it. Your phone's Calendar then reminds you at your chosen times.
After big changes, delete the Flowed calendar in the Calendar app and add it again, so you don't get duplicates.

## Focus timer
Pick **Focus**, **Short break** or **Long break**, optionally the subject you're studying, then **Start**. **Pause / Resume**, **Reset** (it offers to save the minutes you already did) and **Skip** are available. The timer keeps running while you use other screens; its time shows in the header. Completed sessions count towards your daily goal, your stats and your **study streak**. Change the lengths under **Durations**.

## Analytics
Switch between **7 days** and **30 days** to see tasks completed, overdue, this week's completion rate, focus hours, daily charts, an 8-week trend, and the **workload per subject**.

## Weekly review
Look back at any week: tasks done, focus time, completion rate and highlights. Set **goals**: *tasks completed* and *focus minutes* goals track themselves, and *custom* goals use + / −. Add a short reflection, and **Copy last week** to reuse goals.

## Settings
- **Profile:** name, course, year level
- **Appearance:** light/dark/system theme, **text size** (4 steps), opening animation on/off, week start day, heavy-day threshold
- **Focus defaults:** timer lengths and daily goal
- **Reminders & heads-up:** reminder times for tasks, exams and classes; pop-up heads-up on/off
- **Calendar sync:** reminders even when Flowed is closed
- **Backup & restore:** **Export backup (.json)**, **Tasks / Focus CSV** for spreadsheets, and **Choose backup file…** to restore. **Merge** adds and updates without deleting; **Replace** restores the backup exactly.
- **Danger zone:** **Clear all data** (type DELETE to confirm)

## Keeping your data safe
- Your data is stored **only on this device**.
- **Export a backup** regularly and save it to iCloud Drive or Google Drive.
- On iPhone, **removing the Home Screen icon deletes Flowed's data**. Back up first.
- New phone? Export on the old one, install Flowed on the new one, then **Choose backup file…**.

## Troubleshooting
| Problem | Fix |
|---|---|
| The Home Screen icon is a plain letter | Back up, remove the icon, open the site in Safari, wait for it to load, then Add to Home Screen again, and restore the backup |
| Changes from an update don't show | Open Flowed while online, close it fully, then open it again |
| The scan found nothing | Use a sharper, straight-on photo or a screenshot, or switch to **Paste text** |
| No pop-up alerts | Tap the bell → **Allow notifications**; check that **Pop-up heads-up** is on in Settings |
| No reminders when the app is closed | Set up **Calendar sync** (see above) |
| Text too small or large | **Settings → Appearance → Text size** |
