import { describe, expect, it } from "vitest";
import { parseScheduleText } from "@/lib/schedule-import";

const one = (line: string) => {
  const r = parseScheduleText(line);
  expect(r).toHaveLength(1);
  return r[0];
};

describe("schedule text parser", () => {
  it("reads a typical registrar row", () => {
    const r = one("IT 101  Intro to Computing   MWF   8:00-9:00 AM   Rm 301");
    expect(r).toMatchObject({ code: "IT 101", name: "Intro to Computing", days: [1, 3, 5], startTime: "08:00", endTime: "09:00", issues: [] });
    expect(r.room).toMatch(/301/);
  });

  it("handles pipes, TTh, PM on both ends and instructors", () => {
    const r = one("CS201 | Data Structures | TTh | 1:00 PM - 2:30 PM | Lab 3 | Prof. Reyes");
    expect(r).toMatchObject({ code: "CS 201", name: "Data Structures", days: [2, 4], startTime: "13:00", endTime: "14:30", instructor: "Prof. Reyes" });
    expect(r.room).toBe("Lab 3");
  });

  it("infers meridiem across noon and from the end time", () => {
    expect(one("MATH 11 Calculus TF 11:30-1:00pm").startTime).toBe("11:30");
    expect(one("MATH 11 Calculus TF 11:30-1:00pm").endTime).toBe("13:00");
    expect(one("PE 2 Dance S 7-10am").startTime).toBe("07:00");
    expect(one("GE 5 Ethics W 2:30-4:00").startTime).toBe("14:30"); // bare afternoon hours
  });

  it("supports full day names, 24-hour times and ranges", () => {
    const r = one("Monday 09:00-10:30 Physics 1 (Room A-204)");
    expect(r).toMatchObject({ days: [1], startTime: "09:00", endTime: "10:30" });
    expect(r.name).toContain("Physics");
    expect(one("Mon-Fri 13:00 - 14:00 NSTP").days).toEqual([1, 2, 3, 4, 5]);
  });

  it("splits one row with two meeting times", () => {
    const r = parseScheduleText("CHEM 1 General Chemistry MW 8:00-9:30AM F 1:00-4:00PM");
    expect(r.map((x) => [x.days, x.startTime])).toEqual([[[1, 3], "08:00"], [[5], "13:00"]]);
  });

  it("joins rows that OCR split across lines and fixes digit confusions", () => {
    const r = parseScheduleText("ENG 102 Purposive\nCommunication  TTH  1O:3O-12:00");
    expect(r).toHaveLength(1);
    expect(r[0]).toMatchObject({ code: "ENG 102", days: [2, 4], startTime: "10:30", endTime: "12:00" });
    expect(r[0].name).toContain("Communication");
  });

  it("ignores headers and does not read course numbers as times", () => {
    const r = parseScheduleText("Schedule of Classes — 1st Semester 2026-2027\nCode Description Days Time Room\nIT 101-2 Lab  M 3:00-6:00 PM");
    expect(r).toHaveLength(1);
    expect(r[0].startTime).toBe("15:00");
  });

  it("does not merge titles above the first row", () => {
    const r = parseScheduleText("Student Schedule - 1st Semester\nIT 101 Intro to Computing MWF 8:00-9:00 AM Rm 301");
    expect(r[0].name).toBe("Intro to Computing");
  });

  it("flags rows that need review", () => {
    expect(one("Thesis Writing 3:00-5:00 PM").issues).toContain("No day found");
  });
});
