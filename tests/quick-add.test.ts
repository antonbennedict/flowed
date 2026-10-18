import { describe, expect, it } from "vitest";
import { format } from "date-fns";
import { parseQuickAdd } from "@/lib/quick-add";
import type { Subject } from "@/lib/db/schema";

const NOW = new Date(2026, 9, 14, 10, 0); // Wednesday 14 Oct 2026, 10:00
const subj = (name: string, code: string): Subject => ({ id: `00000000-0000-4000-8000-00000000000${code.length}`, name, code, instructor: "", color: "#4F46E5", notes: "", createdAt: "", updatedAt: "" });
const subjects = [subj("Data Structures", "CS 201"), subj("Calculus", "MATH 11")];
const at = (r: ReturnType<typeof parseQuickAdd>) => (r.dueAt ? format(r.dueAt, "EEE yyyy-MM-dd HH:mm") : null);

describe("quick add parser", () => {
  it("parses weekday, time, subject and priority", () => {
    const r = parseQuickAdd("Lab report due fri 5pm #CS201 !high", subjects, NOW);
    expect(r.title).toBe("Lab report");
    expect(at(r)).toBe("Fri 2026-10-16 17:00");
    expect(r.subject?.code).toBe("CS 201");
    expect(r.priority).toBe("high");
  });

  it("understands tomorrow, category words and subject name prefixes", () => {
    const r = parseQuickAdd("Quiz 3 tomorrow 8am #calc", subjects, NOW);
    expect(r).toMatchObject({ title: "Quiz 3", category: "quiz" });
    expect(r.subject?.name).toBe("Calculus");
    expect(at(r)).toBe("Thu 2026-10-15 08:00");
  });

  it("defaults to end of day and supports relative and month dates", () => {
    expect(at(parseQuickAdd("Read ch 4 in 3 days", [], NOW))).toBe("Sat 2026-10-17 23:59");
    expect(at(parseQuickAdd("Essay oct 25 !!", [], NOW))).toBe("Sun 2026-10-25 23:59");
    expect(at(parseQuickAdd("Form 3/1", [], NOW))).toBe("Mon 2027-03-01 23:59"); // past date → next year
    expect(parseQuickAdd("Essay oct 25 !!", [], NOW).priority).toBe("high");
  });

  it("handles next weekday, noon, tonight and a lone time", () => {
    expect(at(parseQuickAdd("Meeting next fri noon", [], NOW))).toBe("Fri 2026-10-23 12:00");
    expect(at(parseQuickAdd("Review tonight", [], NOW))).toBe("Wed 2026-10-14 21:00");
    expect(at(parseQuickAdd("Call 9am", [], NOW))).toBe("Thu 2026-10-15 09:00"); // already past today
    expect(at(parseQuickAdd("Submit at 5", [], NOW))).toBe("Wed 2026-10-14 17:00");
  });

  it("leaves plain text alone", () => {
    const r = parseQuickAdd("Buy notebook", subjects, NOW);
    expect(r).toMatchObject({ title: "Buy notebook", dueAt: null, priority: null, subject: null, category: null });
    expect(parseQuickAdd("Finish #unknown thing", subjects, NOW).title).toBe("Finish #unknown thing");
  });
});
