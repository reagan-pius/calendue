// Date resolution for the rules-first parser (spec D1). chrono often returns
// multiple partial matches for structured lines like
// "Assignment due: 12 noon  Fri 6th November 2026 - 17 days"
// ("noon Fri" AND "6th November 2026"), so we merge: the date comes from the
// match with the most certain date components, the time-of-day from the first
// match with a certain hour.
import * as chrono from "chrono-node";

export const RELATIVE_UNIT_RE =
  /\b(next|last|this|coming)\s+(week|month|year)\b/i;

// Moodle-style trailing age: " - 17 days", " - 1 month and 7 days"
const RELATIVE_AGE_SUFFIX_RE =
  /\s*[-\u2013]\s*\d+\s*(?:day|week|month|year)s?(?:\s+and\s+\d+\s*(?:day|week|month|year)s?)?\s*$/i;

export interface ResolvedDate {
  /** ISO UTC instant, or null when no date could be resolved. */
  due: string | null;
  certainDate: boolean;
  certainTime: boolean;
  yearCertain: boolean;
  /** Matched substrings to strip out of titles. */
  dateTexts: string[];
}

function chronoOpts(tz: string): chrono.ParsingOption {
  return { forwardDate: true, timezone: tz } as chrono.ParsingOption;
}

function stripAge(line: string): string {
  return line.replace(RELATIVE_AGE_SUFFIX_RE, " ").replace(/\s+/g, " ").trim();
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

export function resolveDate(line: string, tz: string, ref: Date): ResolvedDate {
  const cleaned = stripAge(line);
  const matches = chrono.parse(cleaned, ref, chronoOpts(tz));
  if (matches.length === 0) {
    return {
      due: null,
      certainDate: false,
      certainTime: false,
      yearCertain: false,
      dateTexts: [],
    };
  }

  // Date match: most certain day/month/year components wins.
  let dateMatch = matches[0];
  let bestScore = -1;
  for (const m of matches) {
    const c = m.start;
    const score =
      (c.isCertain("day") ? 4 : 0) +
      (c.isCertain("month") ? 2 : 0) +
      (c.isCertain("year") ? 1 : 0);
    if (score > bestScore) {
      bestScore = score;
      dateMatch = m;
    }
  }

  // Time match: first match with a certain hour (chrono implies minute 0).
  const timeMatch = matches.find((m) => m.start.isCertain("hour")) ?? null;

  const dc = dateMatch.start;
  const y = dc.get("year") ?? ref.getFullYear();
  const mo = dc.get("month") ?? 1;
  const d = dc.get("day") ?? 1;

  // chrono reports unit-relative phrases ("next week") as certain dates;
  // spec says these are ambiguous -> route to review.
  const certainDate =
    dc.isCertain("day") &&
    dc.isCertain("month") &&
    !RELATIVE_UNIT_RE.test(dateMatch.text);
  const yearCertain = dc.isCertain("year");
  const certainTime = timeMatch !== null;

  // spec D4: omitted time -> 23:59:59 local on the parsed date.
  let h = 23;
  let mi = 59;
  let s = 59;
  if (timeMatch) {
    const tc = timeMatch.start;
    h = tc.get("hour") ?? 0;
    mi = tc.get("minute") ?? 0;
    s = 0;
  }

  const due = wallClockToUtc(tz, y, mo, d, h, mi, s).toISOString();
  const dateTexts = [
    ...new Set(
      [dateMatch.text, timeMatch?.text].filter(
        (t): t is string => Boolean(t),
      ),
    ),
  ];
  return { due, certainDate, certainTime, yearCertain, dateTexts };
}

/**
 * Strict date-line detection for entry segmentation. Lines without due/date
 * keywords must show an explicit day+month match so bare numbers in titles
 * ("15 CATS") are never mistaken for dates.
 */
export function isDateLine(line: string, ref: Date, tz: string): boolean {
  const cleaned = stripAge(line);
  const matches = chrono.parse(cleaned, ref, chronoOpts(tz));
  if (matches.length === 0) return false;
  if (/\bdue\b|\bdeadline\b/i.test(line)) return true;
  return matches.some(
    (m) => m.start.isCertain("day") && m.start.isCertain("month"),
  );
}
