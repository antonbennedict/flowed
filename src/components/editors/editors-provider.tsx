"use client";

import { createContext, useCallback, useContext, useMemo, useState } from "react";
import type { ClassSchedule, ClassScheduleInput, Exam, ExamInput, PersonalEvent, PersonalEventInput, Subject, Task, TaskInput } from "@/lib/db/schema";
import { ClassEditor } from "./class-editor";
import { EventEditor } from "./event-editor";
import { ExamEditor } from "./exam-editor";
import { SubjectEditor } from "./subject-editor";
import { TaskEditor } from "./task-editor";

type EditorState =
  | { type: "task"; task?: Task; defaults?: Partial<TaskInput> }
  | { type: "subject"; subject?: Subject }
  | { type: "class"; schedule?: ClassSchedule; defaults?: Partial<ClassScheduleInput> }
  | { type: "exam"; exam?: Exam; defaults?: Partial<ExamInput> }
  | { type: "event"; event?: PersonalEvent; defaults?: Partial<PersonalEventInput> };

interface Editors {
  openTask(task?: Task, defaults?: Partial<TaskInput>): void;
  openSubject(subject?: Subject): void;
  openClass(schedule?: ClassSchedule, defaults?: Partial<ClassScheduleInput>): void;
  openExam(exam?: Exam, defaults?: Partial<ExamInput>): void;
  openEvent(event?: PersonalEvent, defaults?: Partial<PersonalEventInput>): void;
}

const EditorsContext = createContext<Editors | null>(null);

/** Opens the create/edit dialogs from anywhere (dashboard quick-add, calendar, lists). */
export function useEditors(): Editors {
  const ctx = useContext(EditorsContext);
  if (!ctx) throw new Error("useEditors must be used inside <EditorsProvider>");
  return ctx;
}

export function EditorsProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<EditorState | null>(null);
  const [open, setOpen] = useState(false);
  // Bumped on every open so each dialog instance starts with fresh form state.
  const [nonce, setNonce] = useState(0);

  const show = useCallback((s: EditorState) => {
    setState(s);
    setNonce((n) => n + 1);
    setOpen(true);
  }, []);

  const api = useMemo<Editors>(() => ({
    openTask: (task, defaults) => show({ type: "task", task, defaults }),
    openSubject: (subject) => show({ type: "subject", subject }),
    openClass: (schedule, defaults) => show({ type: "class", schedule, defaults }),
    openExam: (exam, defaults) => show({ type: "exam", exam, defaults }),
    openEvent: (event, defaults) => show({ type: "event", event, defaults }),
  }), [show]);

  const props = { open, onOpenChange: setOpen };
  return (
    <EditorsContext.Provider value={api}>
      {children}
      {state?.type === "task" && <TaskEditor {...props} key={nonce} task={state.task} defaults={state.defaults} />}
      {state?.type === "subject" && <SubjectEditor {...props} key={nonce} subject={state.subject} />}
      {state?.type === "class" && <ClassEditor {...props} key={nonce} schedule={state.schedule} defaults={state.defaults} />}
      {state?.type === "exam" && <ExamEditor {...props} key={nonce} exam={state.exam} defaults={state.defaults} />}
      {state?.type === "event" && <EventEditor {...props} key={nonce} event={state.event} defaults={state.defaults} />}
    </EditorsContext.Provider>
  );
}
