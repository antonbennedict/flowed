"use client";

import { useMemo } from "react";
import { useLiveQuery } from "@/components/providers/db-provider";
import type { ClassSchedule, Exam, FocusSession, PersonalEvent, Subject, Subtask, Task } from "@/lib/db/schema";

export interface PlannerData {
  subjects: Subject[];
  tasks: Task[];
  subtasks: Subtask[];
  schedules: ClassSchedule[];
  exams: Exam[];
  events: PersonalEvent[];
  focusSessions: FocusSession[];
}

/**
 * Loads the main collections in one pass and refreshes on any write.
 * A single student's data set is small, so pages derive their views in memory.
 */
export function usePlannerData() {
  const q = useLiveQuery<PlannerData>(
    async (db) => {
      const [subjects, tasks, subtasks, schedules, exams, events, focusSessions] = await Promise.all([
        db.subjects.list(), db.tasks.list(), db.subtasks.list(), db.schedules.list(), db.exams.list(),
        db.events.list(), db.focusSessions.list(),
      ]);
      return { subjects, tasks, subtasks, schedules, exams, events, focusSessions };
    },
    [],
    ["subjects", "tasks", "subtasks", "class_schedules", "exams", "personal_events", "focus_sessions"],
  );
  const lookups = useMemo(() => {
    const d = q.data;
    const subjectById = new Map(d?.subjects.map((s) => [s.id, s]) ?? []);
    const subtasksByTask = new Map<string, Subtask[]>();
    for (const s of d?.subtasks ?? []) subtasksByTask.set(s.taskId, [...(subtasksByTask.get(s.taskId) ?? []), s]);
    return { subjectById, subtasksByTask };
  }, [q.data]);
  return { ...q, ...lookups };
}
