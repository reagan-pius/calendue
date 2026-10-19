// Spec decision D1: rules-first parser — chrono-node for date extraction plus
// keyword rules for type/module/title. Deterministic and key-free for v1.
// An LLM may later replace/augment this module behind the same
// POST /api/parse contract ({ text, tz } -> { autoCommit[], needsReview[] }).
import * as chrono from "chrono-node";
import { TYPE_COLORS, type DeadlineType } from "../deadlines/types";

export interface ParsedItem {
  raw: string;
  title: string;
  /** ISO UTC instant, or null when no date could be resolved. */
  due_at: string | null;
  type: DeadlineType;
  module: string | null;
  color: string;
  confidence: number;
}

const EXAM_WORDS = /\b(exams?|midterms?|finals?|revision|quizzes|quiz|test)\b/i;
const MEETING_WORDS =
  /\b(meetings?|tutorials?|supervisions?|stand-?ups?|calls?|syncs?|seminars?)\b/i;
const ASSIGNMENT_WORDS =
  /\b(coursework|essays?|essay|assignments?|assignment|lab reports?|problem sheets?|problem sheet|problem sets?|psets?|homework|dissertations?|dissertation|theses|thesis|portfolio|submissions?|submission|write-?ups?)\b/i;
const PERSONAL_WORDS =
  /\b(birthdays?|birthday|personal|gym|dentist|doctors?|doctor|appointments?|appointment|travel|holidays?|holiday)\b/i;
const REMINDER_WORDS =
  /\b(reminders?|reminder|remember|renew|buy|order|book)\b/i;
const DEADLINE_WORDS =
  /\b(due|deadline|submit|hand[- ]?in|turn[- ]?in|by)\b/i;

const MODULE_RE = /\[?([A-Za-z]{2,4})[ -]?(\d{3,4})\]?/;
const RELATIVE_UNIT_RE = /\b(next|last|this|coming)\s+(week|month|year)\b/i;

function detectType(line: string): { type: DeadlineType; certain: boolean } {
  if (EXAM_WORDS.test(line)) return { type: "exam", certain: true };
  if (MEETING_WORDS.test(line)) return { type: "meeting", certain: true };
  if (ASSIGNMENT_WORDS.test(line)) return { type: "assignment", certain: true };
  if (PERSONAL_WORDS.test(line)) return { type: "personal", certain: true };
  if (REMINDER_WORDS.test(line)) return { type: "reminder", certain: true };
  if (DEADLINE_WORDS.test(line)) return { type: "assignment", certain: false };
  return { type: "reminder", certain: false };
}

function extractModule(line: string): { moduleCode: string | null; line: string } {
  const m = line.match(MODULE_RE);
  if (!m) return { moduleCode: null, line };
  const moduleCode = `${m[1].toUpperCase()}${m[2]}`;
  return { moduleCode, line: line.replace(m[0], " ") };
}

function cleanTitle(line: string, dateText: string | null): string {
  let t = line;
  if (dateText) t = t.replace(dateText, " ");
  t = t.replace(DEADLINE_WORDS, " ");
  t = t.replace(/\b(on|at|the|a|an|is|will be)\b/gi, " ");
  t = t.replace(/[^a-zA-Z0-9]+/g, " ");
  return t.replace(/\s+/g, " ").trim();
}

function tzOffsetMs(tz: string, utcMillis: number): number {
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
  const parts = Object.fromEntries(
    dtf.formatToParts(new Date(utcMillis)).map((p) => [p.type, p.value]),
  );
  const asUtc = Date.UTC(
    Number(parts.year),
    Number(parts.month) - 1,
    Number(parts.day),
    Number(parts.hour) % 24,
    Number(parts.minute),
    Number(parts.second),
  );
  return asUtc - utcMillis;
}

/** Convert a wall-clock reading in `tz` to a UTC instant (2-pass for DST). */
export function wallClockToUtc(
  tz: string,
  y: number,
  mo: number,
  d: number,
  h: number,
  mi: number,
  s: number,
): Date {
  const guess = Date.UTC(y, mo - 1, d, h, mi, s);
  const off1 = tzOffsetMs(tz, guess);
  const off2 = tzOffsetMs(tz, guess - off1);
  return new Date(guess - off2);
}

function parseLine(line: string, tz: string): ParsedItem {
  const ref = new Date();
  // chrono v2.7+ honours `timezone` for relative phrases; absolute dates are
  // resolved as wall-clock numbers and converted below regardless.
  const matches = chrono.parse(line, ref, {
    forwardDate: true,
    timezone: tz,
  } as chrono.ParsingOption);

  let due: string | null = null;
  let dateText: string | null = null;
  let certainDate = false;
  let certainTime = false;
  let yearCertain = false;

  if (matches.length > 0) {
    const m = matches[0];
    const c = m.start;
    const y = c.get("year") ?? ref.getFullYear();
    const mo = c.get("month") ?? 1;
    const d = c.get("day") ?? 1;
    certainDate = c.isCertain("day") && c.isCertain("month");
    // chrono reports unit-relative phrases ("next week") as certain dates;
    // spec says these are ambiguous -> route to review.
    if (RELATIVE_UNIT_RE.test(m.text)) certainDate = false;
    yearCertain = c.isCertain("year");
    certainTime = c.isCertain("hour") && c.isCertain("minute");
    const h = certainTime ? (c.get("hour") ?? 0) : 23;
    const mi = certainTime ? (c.get("minute") ?? 0) : 59;
    const s = certainTime ? 0 : 59; // spec D4: omitted time -> 23:59:59 local
    due = wallClockToUtc(tz, y, mo, d, h, mi, s).toISOString();
    dateText = m.text;
  }

  const { moduleCode, line: withoutModule } = extractModule(line);
  const title = cleanTitle(withoutModule, dateText) || "Untitled deadline";
  const { type, certain: typeCertain } = detectType(line);

  // Confidence heuristic (spec: gate mandatory; examples in "Parsing behavior")
  let confidence = 0.4;
  if (due) {
    confidence += certainDate ? 0.4 : 0.2; // "next week" style ambiguity
    if (yearCertain) confidence += 0.05;
    if (certainTime) confidence += 0.05;
  }
  if (title !== "Untitled deadline" && title.length >= 3) confidence += 0.08;
  if (moduleCode) confidence += 0.02;
  if (typeCertain) confidence += 0.02;
  if (!due) confidence = Math.min(confidence, 0.45);
  confidence = Math.min(0.99, Math.round(confidence * 100) / 100);

  return {
    raw: line,
    title,
    due_at: due,
    type,
    module: moduleCode,
    color: TYPE_COLORS[type],
    confidence,
  };
}

/** Parse raw pasted text (multi-line list or single utterance) into items. */
export function parseDeadlines(text: string, tz: string): ParsedItem[] {
  return text
    .split(/[\n;]+/)
    .map((l) => l.trim())
    .filter(Boolean)
    .map((line) => parseLine(line, tz));
}
