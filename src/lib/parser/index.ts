// Spec decision D1: rules-first parser — chrono-node for date extraction plus
// keyword rules for type/module/title. Deterministic and key-free for v1.
// An LLM may later replace/augment this module behind the same
// POST /api/parse contract ({ text, tz } -> { autoCommit[], needsReview[] }).
//
// Structured pastes (e.g. Moodle deadline exports) are segmented into entries:
// module line -> assignment title -> status noise -> due line. Single-line
// utterances keep the original per-line behaviour.
import { TYPE_COLORS, type DeadlineType } from "../deadlines/types";
import { normalizeText } from "./normalize";
import { isDateLine, resolveDate, type ResolvedDate } from "./dates";

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
const REMINDER_WORDS = /\b(reminders?|reminder|remember|renew|buy|order|book)\b/i;
const DEADLINE_WORDS = /\b(due|deadline|submit|hand[- ]?in|turn[- ]?in|by)\b/i;

const MODULE_RE = /\[?([A-Za-z]{2,4})[ -]?(\d{3,4})\]?/;
const MODULE_START_RE = /^([A-Za-z]{2,4})[ -]?(\d{3,4})(?:\s|$)/;
// "Not submitted", "Awaiting marking", lone "15 CATS", ...
const NOISE_RE =
  /^(?:not submitted|submitted|graded|work in progress|no attempt|in progress|attempted|late|extension requested|awaiting (?:marking|grade)|\d+\s?cats)$/i;

type TypeGuess = { type: DeadlineType; certain: boolean };

function detectType(text: string): TypeGuess {
  if (EXAM_WORDS.test(text)) return { type: "exam", certain: true };
  if (MEETING_WORDS.test(text)) return { type: "meeting", certain: true };
  if (ASSIGNMENT_WORDS.test(text)) return { type: "assignment", certain: true };
  if (PERSONAL_WORDS.test(text)) return { type: "personal", certain: true };
  if (REMINDER_WORDS.test(text)) return { type: "reminder", certain: true };
  if (DEADLINE_WORDS.test(text)) return { type: "assignment", certain: false };
  return { type: "reminder", certain: false };
}

/** Module presence implies coursework when no keyword matched. */
function resolveType(
  text: string,
  hasModule: boolean,
): { type: DeadlineType; certain: boolean } {
  const guess = detectType(text);
  if (!guess.certain && hasModule && guess.type === "reminder") {
    return { type: "assignment", certain: false };
  }
  return guess;
}

function extractModule(line: string): {
  moduleCode: string | null;
  line: string;
} {
  const m = line.match(MODULE_RE);
  if (!m) return { moduleCode: null, line };
  const moduleCode = `${m[1].toUpperCase()}${m[2]}`;
  return { moduleCode, line: line.replace(m[0], " ") };
}

function cleanTitle(line: string, dateTexts: string[]): string {
  let t = line;
  for (const dt of dateTexts) t = t.replace(dt, " ");
  t = t.replace(DEADLINE_WORDS, " ");
  t = t.replace(/\b(on|at|the|a|an|is|will be)\b/gi, " ");
  t = t.replace(/[^a-zA-Z0-9]+/g, " ");
  return t.replace(/\s+/g, " ").trim();
}

/** Gentler cleanup for structured entries: keep the real assignment name. */
function cleanBlockTitle(parts: string[], dateTexts: string[]): string {
  let t = parts.join(" ");
  for (const dt of dateTexts) t = t.replace(dt, " ");
  t = t.replace(/\b\d+\s?CATS\b/gi, " ");
  t = t.replace(/\((?:formative|summative)(?:\s+assignments?)?\)/gi, " ");
  t = t.replace(/^(?:assignment\s+)?due\s*:\s*/i, " ");
  t = t.replace(DEADLINE_WORDS, " ");
  t = t.replace(/\s+/g, " ").trim();
  t = t.replace(/^[-\u2013]+|[-\u2013]+$/g, " ").trim();
  return t || "Untitled deadline";
}

function confidenceFor(input: {
  resolved: ResolvedDate | null;
  title: string;
  hasModule: boolean;
  typeCertain: boolean;
}): number {
  const { resolved, title, hasModule, typeCertain } = input;
  const titled = title !== "Untitled deadline";
  let confidence = 0.4;
  if (resolved?.due) {
    confidence += resolved.certainDate ? 0.4 : 0.2;
    if (resolved.yearCertain) confidence += 0.05;
    if (resolved.certainTime) confidence += 0.05;
  }
  if (titled && title.length >= 3) confidence += 0.08;
  if (hasModule) confidence += 0.02;
  if (typeCertain) confidence += 0.02;
  if (!resolved?.due) confidence = Math.min(confidence, 0.45);
  if (!titled) confidence = Math.min(confidence, 0.84);
  return Math.min(0.99, Math.round(confidence * 100) / 100);
}

function toItem(input: {
  raw: string;
  title: string;
  resolved: ResolvedDate | null;
  type: DeadlineType;
  module: string | null;
}): ParsedItem {
  return {
    raw: input.raw,
    title: input.title,
    due_at: input.resolved?.due ?? null,
    type: input.type,
    module: input.module,
    color: TYPE_COLORS[input.type],
    confidence: confidenceFor({
      resolved: input.resolved,
      title: input.title,
      hasModule: input.module !== null,
      typeCertain: detectType(input.raw).certain,
    }),
  };
}

function parseLine(line: string, tz: string, ref: Date): ParsedItem {
  const resolved = resolveDate(line, tz, ref);
  const { moduleCode, line: withoutModule } = extractModule(line);
  const title = cleanTitle(withoutModule, resolved.dateTexts) || "Untitled deadline";
  const { type } = resolveType(line, moduleCode !== null);
  return toItem({ raw: line, title, resolved, type, module: moduleCode });
}

/** Multi-line entry: module line, title line(s), status noise, due line. */
function parseEntry(lines: string[], tz: string, ref: Date): ParsedItem {
  const raw = lines.join(" | ");
  const dateIdx = lines.findIndex((l) => isDateLine(l, ref, tz));
  const moduleIdx = lines.findIndex((l) => MODULE_START_RE.test(l));

  let resolved: ResolvedDate | null = null;
  let dateLine: string | null = null;
  if (dateIdx >= 0) {
    resolved = resolveDate(lines[dateIdx], tz, ref);
    if (resolved.due) dateLine = lines[dateIdx];
  }

  const candidates = lines.filter((l, i) => {
    if (i === moduleIdx) return false;
    if (dateLine !== null && l === dateLine) return false;
    if (NOISE_RE.test(l)) return false;
    if (dateLine === null && /\bdue\b|\bdeadline\b/i.test(l)) return false;
    return true;
  });

  let moduleCode: string | null = null;
  let titleSrc = candidates;
  if (moduleIdx >= 0) {
    moduleCode = lines[moduleIdx].trim();
  } else {
    const joined = candidates.join(" ");
    const embedded = joined.match(MODULE_RE);
    if (embedded) {
      moduleCode = `${embedded[1].toUpperCase()}${embedded[2]}`;
      titleSrc = candidates.map((l) => l.replace(MODULE_RE, " "));
    }
  }

  const title = cleanBlockTitle(titleSrc, resolved?.dateTexts ?? []);
  const { type } = resolveType(raw, moduleCode !== null);
  return toItem({ raw, title, resolved, type, module: moduleCode });
}

/**
 * Segment normalized text into entries. Blank lines close an entry; a line
 * starting with a module code starts a new one; a due/date line closes the
 * current one. Handles both blank-line separated blocks (Moodle exports) and
 * dense newline-only lists.
 */
function segment(
  lines: string[],
  tz: string,
  ref: Date,
): { lines: string[]; single: boolean }[] {
  const entries: { lines: string[]; single: boolean }[] = [];
  let current: string[] = [];
  let currentSingle = true;
  const flush = () => {
    if (current.length > 0) {
      entries.push({ lines: current, single: currentSingle && current.length === 1 });
      current = [];
      currentSingle = true;
    }
  };

  for (const raw of lines) {
    const line = raw.trim();
    if (!line) {
      flush();
      continue;
    }
    if (MODULE_START_RE.test(line) && current.length > 0) flush();
    if (current.length === 0) currentSingle = true;
    else currentSingle = false;
    current.push(line);
    if (isDateLine(line, ref, tz)) flush();
  }
  flush();
  return entries;
}

/** Parse raw pasted text (structured blocks, lists, or utterances) into items. */
export function parseDeadlines(text: string, tz: string): ParsedItem[] {
  const normalized = normalizeText(text);
  const ref = new Date();
  return segment(normalized.split(/\r?\n/), tz, ref).map((entry) =>
    entry.single ? parseLine(entry.lines[0], tz, ref) : parseEntry(entry.lines, tz, ref),
  );
}
