/**
 * Turns schedule text (from OCR of a photo/screenshot, or pasted from a
 * registration portal) into class rows. Pure and offline; see
 * tests/schedule-import.test.ts for the formats it understands, e.g.
 *
 *   IT 101  Intro to Computing   MWF   8:00-9:00 AM   Rm 301
 *   CS201 | Data Structures | TTh 1:00 PM - 2:30 PM | Lab 3 | Prof. Reyes
 *   Monday 09:00-10:30 Physics 1 (Room A-204)
 *
 * Rows the parser is unsure about are flagged so the preview can ask the
 * user to fix them; nothing is saved without review.
 */
export interface ParsedClass {
  code: string;
  name: string;
  /** 0 = Sunday … 6 = Saturday. Empty when no day was found. */
  days: number[];
  startTime: string; // HH:mm
  endTime: string;
  room: string;
  instructor: string;
  raw: string;
  issues: string[];
}

const DAY_WORDS: [RegExp, number][] = [
  [/^sun(day)?$/i, 0], [/^mon(day)?$/i, 1], [/^tue(s|sday)?$/i, 2], [/^wed(nesday)?$/i, 3],
  [/^thu(r|rs|rsday)?$/i, 4], [/^fri(day)?$/i, 5], [/^sat(urday)?$/i, 6],
];

/** Compact codes used by registrars: M T W TH F S SU (also R = Thursday). */
function parseDayCode(token: string): number[] | null {
  const t = token.toUpperCase();
  if (!/^(TH|SU|SA|SAT|M|T|W|R|F|S)+$/.test(t) || t.length > 8) return null;
  const out: number[] = [];
  let i = 0;
  while (i < t.length) {
    const rest = t.slice(i);
    const m = /^(SAT|TH|SU|SA|M|T|W|R|F|S)/.exec(rest)!;
    const map: Record<string, number> = { M: 1, T: 2, W: 3, TH: 4, R: 4, F: 5, S: 6, SA: 6, SAT: 6, SU: 0 };
    out.push(map[m[1]]);
    i += m[1].length;
  }
  return [...new Set(out)];
}

function dayTokens(text: string): { days: number[]; matched: string[] } {
  const days: number[] = [];
  const matched: string[] = [];
  // Ranges like "Mon-Fri".
  const range = /\b(mon|tue|wed|thu|fri|sat|sun)[a-z]*\s*-\s*(mon|tue|wed|thu|fri|sat|sun)[a-z]*\b/i.exec(text);
  if (range) {
    const idx = (w: string) => ["sun", "mon", "tue", "wed", "thu", "fri", "sat"].indexOf(w.toLowerCase().slice(0, 3));
    for (let d = idx(range[1]); d <= idx(range[2]); d++) days.push(d);
    matched.push(range[0]);
  }
  for (const tok of text.split(/[\s,/|;()]+/).filter(Boolean)) {
    const word = DAY_WORDS.find(([re]) => re.test(tok));
    if (word) { days.push(word[1]); matched.push(tok); continue; }
    // Compact codes must be in capitals (or the common "TTh"/"Th" mix) to avoid eating words.
    if (/^[A-Z][A-Za-z]{0,7}$/.test(tok) && (tok === tok.toUpperCase() || /^(T?Th|M?W?Th?F?|Su|Sa)$/.test(tok))) {
      const code = parseDayCode(tok);
      if (code) { days.push(...code); matched.push(tok); }
    }
  }
  return { days: [...new Set(days)].sort(), matched };
}

const TIME_RANGE =
  /(\d{1,2})(?:[:.](\d{2}))?\s*(a\.?m\.?|p\.?m\.?|[ap])?\s*(?:-|–|—|to|~)\s*(\d{1,2})(?:[:.](\d{2}))?\s*(a\.?m\.?|p\.?m\.?|[ap])?(?![\w])/gi;

const pad = (n: number) => String(n).padStart(2, "0");
type Meridiem = "am" | "pm";
const mer = (s?: string): Meridiem | undefined => (s ? (s.toLowerCase().startsWith("p") ? "pm" : "am") : undefined);

function to24(h: number, m: number, meridiem?: "am" | "pm"): number {
  if (meridiem === "pm" && h < 12) h += 12;
  if (meridiem === "am" && h === 12) h = 0;
  return h * 60 + m;
}

/** Interprets a matched time range, inferring AM/PM the way a person would. */
function readRange(m: RegExpExecArray): { start: number; end: number } | null {
  const [sh, sm, smer, eh, em, emer] = [Number(m[1]), Number(m[2] ?? 0), mer(m[3]), Number(m[4]), Number(m[5] ?? 0), mer(m[6])];
  // Require minutes or a meridiem so "101-2" (codes, sections) isn't read as a time.
  if (m[2] === undefined && m[5] === undefined && !smer && !emer) return null;
  if (sh > 23 || eh > 23 || sm > 59 || em > 59) return null;
  let start: number, end: number;
  if (sh > 12 || eh > 12) {
    start = sh * 60 + sm; end = eh * 60 + em; // 24-hour clock
  } else {
    const endMer: Meridiem = emer ?? smer ?? (eh >= 7 && eh < 12 ? "am" : "pm");
    end = to24(eh, em, endMer);
    let startMer: Meridiem = smer ?? endMer;
    start = to24(sh, sm, startMer);
    if (!smer && start >= end) { startMer = "am"; start = to24(sh, sm, startMer); }
    // Bare hours like 1-6 with no meridiem are afternoon classes.
    if (!smer && !emer && sh < 7) { start = to24(sh, sm, "pm"); end = to24(eh, em, "pm"); }
  }
  if (end <= start) return null;
  return { start, end };
}

const fmt = (mins: number) => `${pad(Math.floor(mins / 60))}:${pad(mins % 60)}`;

/** Common OCR confusions inside numbers: O→0, l/I→1, and "8 :30" spacing. */
function cleanOcr(line: string): string {
  return line
    .replace(/(?<=\d)[oO](?=\d|\b)/g, "0")
    .replace(/(?<=\d[:.])[oO]/g, "0")
    .replace(/(?<=\b)[lI](?=\d)/g, "1")
    .replace(/(\d)\s+([:.])\s*(\d{2})/g, "$1$2$3")
    .replace(/[‐‑‒–—]/g, "-")
    .replace(/\t+/g, " | ");
}

const CODE = /\b([A-Z]{2,6})[\s-]?(\d{1,4}[A-Z]?)\b/;
const ROOM = /\b(?:rm|room|bldg|building|lab|laboratory|hall|venue)\.?\s*[:#]?\s*([A-Z0-9][\w-]*(?:\s?\d+)?)/i;
const ROOM_SHAPE = /\b([A-Z]{1,3}-?\d{2,4}[A-Z]?)\b/;
const INSTRUCTOR = /\b(?:prof|dr|mr|mrs|ms|engr|atty|sir|ma'?am)\.?\s+[A-Z][\w.'-]*(?:\s+[A-Z][\w.'-]*){0,3}/i;

export function parseScheduleText(text: string): ParsedClass[] {
  const lines = text.split(/\r?\n/).map((l) => cleanOcr(l).trim()).filter(Boolean);
  const out: ParsedClass[] = [];
  let pending: string[] = [];

  for (const line of lines) {
    TIME_RANGE.lastIndex = 0;
    const matches = [...line.matchAll(TIME_RANGE)].filter((m) => readRange(m));
    if (matches.length === 0) {
      // Rows split over two lines by OCR: keep text until a time appears.
      pending.push(line);
      if (pending.length > 2) pending.shift();
      continue;
    }
    // Only glue on a previous line when it carries the course code this line
    // lacks (a row OCR broke in two). Titles/headers never have a code.
    const carry = !CODE.test(line) ? pending.filter((p) => CODE.test(p)).slice(-1) : [];
    const record = [...carry, line].join(" ");
    pending = [];
    const whole = dayTokens(record);
    let cursor = 0;
    let rest = record;
    for (const m of matches) {
      const r = readRange(m)!;
      const at = record.indexOf(m[0], cursor);
      const segmentDays = dayTokens(record.slice(cursor, at));
      cursor = at + m[0].length;
      const days = segmentDays.days.length ? segmentDays.days : whole.days;
      rest = rest.replace(m[0], " ");
      out.push({ code: "", name: "", days, startTime: fmt(r.start), endTime: fmt(r.end), room: "", instructor: "", raw: record, issues: [] });
    }

    // Shared fields for every time range in this record.
    for (const tok of whole.matched) rest = rest.replace(new RegExp(`(^|[\\s,/|;(])${tok.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?=$|[\\s,/|;)])`), "$1 ");
    const instructor = INSTRUCTOR.exec(rest)?.[0].trim() ?? "";
    if (instructor) rest = rest.replace(instructor, " ");
    const roomKw = ROOM.exec(rest);
    let room = "";
    if (roomKw) { room = roomKw[0].trim(); rest = rest.replace(roomKw[0], " "); }
    const codeM = CODE.exec(rest);
    const code = codeM ? `${codeM[1]} ${codeM[2]}` : "";
    if (codeM) rest = rest.replace(codeM[0], " ");
    if (!room) {
      const shaped = ROOM_SHAPE.exec(rest);
      if (shaped) { room = shaped[1]; rest = rest.replace(shaped[0], " "); }
    }
    const name = rest
      .replace(/\b(lec|lecture|lab|sec(tion)?|units?|class|sched(ule)?)\b\.?\s*[\w-]{0,3}\b/gi, " ")
      .replace(/\b\d+(\.\d+)?\s*(units?)?\b/gi, " ")
      .replace(/[|•·_*#]+/g, " ")
      .replace(/\s{2,}/g, " ")
      .replace(/^[\s,:;-]+|[\s,:;-]+$/g, "")
      .trim();

    for (const row of out.slice(out.length - matches.length)) {
      row.code = code;
      row.name = name.length >= 2 ? name : code;
      row.room = room;
      row.instructor = instructor;
      if (!row.days.length) row.issues.push("No day found");
      if (!row.name) row.issues.push("No subject name found");
    }
  }
  return out;
}

/** "CS 201" / "cs201" / "Data Structures" → comparable key. */
export const subjectKey = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
