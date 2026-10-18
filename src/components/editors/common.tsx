"use client";

import { toast } from "sonner";
import { useLiveQuery } from "@/components/providers/db-provider";
import { SimpleSelect, SubjectDot } from "@/components/shared/primitives";

export const NO_SUBJECT = "__none__";

export function SubjectPicker({ value, onChange, allowNone = true, ...rest }: {
  value: string | null; onChange: (v: string | null) => void; allowNone?: boolean; id?: string;
  "aria-invalid"?: boolean; "aria-describedby"?: string;
}) {
  const { data: subjects = [] } = useLiveQuery((db) => db.subjects.list(), [], ["subjects"]);
  const options = [
    ...(allowNone ? [{ value: NO_SUBJECT, label: <span className="text-muted-foreground">No subject</span> }] : []),
    ...subjects.map((s) => ({
      value: s.id,
      label: (
        <span className="flex items-center gap-2">
          <SubjectDot color={s.color} /> {s.name}
          {s.code && <span className="text-muted-foreground">{s.code}</span>}
        </span>
      ),
    })),
  ];
  return (
    <SimpleSelect
      {...rest}
      value={value ?? (allowNone ? NO_SUBJECT : "")}
      onChange={(v) => onChange(v === NO_SUBJECT || v === "" ? null : v)}
      options={options}
      placeholder={subjects.length ? "Choose a subject" : "Add a subject first"}
    />
  );
}

export function reportError(err: unknown) {
  toast.error(err instanceof Error ? err.message : "Something went wrong.");
}

export const dialogFormClass = "sm:max-w-lg";
