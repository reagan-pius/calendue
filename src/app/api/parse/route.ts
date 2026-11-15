import { after, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { parseDeadlines } from "@/lib/parser";
import { AUTO_COMMIT_THRESHOLD } from "@/lib/parser/threshold";
import { DEADLINE_LIST_COLUMNS } from "@/lib/deadlines/query";

// POST /api/parse — { text, tz } -> { autoCommit[], needsReview[] }.
// Trust rules (spec): auto-commit only at confidence >= threshold; uncertain
// items are NEVER persisted without explicit confirm; a parse_sessions row is
// recorded for debugging. tz is the browser IANA zone (spec D4).
export async function POST(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: { text?: unknown; tz?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const text = typeof body.text === "string" ? body.text.trim() : "";
  if (!text) {
    return NextResponse.json({ error: "No text provided" }, { status: 400 });
  }

  let tz = typeof body.tz === "string" && body.tz ? body.tz : "UTC";
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
  } catch {
    tz = "UTC";
  }

  const items = parseDeadlines(text, tz);
  const auto = items.filter(
    (i) => i.confidence >= AUTO_COMMIT_THRESHOLD && i.due_at !== null,
  );
  const review = items.filter(
    (i) => !(i.confidence >= AUTO_COMMIT_THRESHOLD && i.due_at !== null),
  );

  // Session first so auto-commits can carry parse_session_id in one insert
  // (avoids a follow-up UPDATE on the critical path).
  const { data: parseSession, error: sessionError } = await supabase
    .from("parse_sessions")
    .insert({
      user_id: user.id,
      raw_text: text,
      results: [
        ...auto.map((i) => ({ ...i, auto_committed: true })),
        ...review.map((i) => ({ ...i, auto_committed: false })),
      ],
    })
    .select("id")
    .single();

  if (sessionError) {
    return NextResponse.json({ error: sessionError.message }, { status: 500 });
  }

  let saved: Record<string, unknown>[] = [];
  if (auto.length > 0) {
    const { data, error } = await supabase
      .from("deadlines")
      .insert(
        auto.map((i) => ({
          user_id: user.id,
          title: i.title,
          due_at: i.due_at,
          type: i.type,
          module: i.module,
          color: i.color,
          source: "paste",
          parse_confidence: i.confidence,
          parse_session_id: parseSession.id,
        })),
      )
      .select(DEADLINE_LIST_COLUMNS);
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    saved = data ?? [];
  }

  // Enrich session results with deadline ids off the response path.
  if (saved.length > 0 && parseSession?.id) {
    const results = [
      ...saved.map((row, idx) => ({
        ...auto[idx],
        deadline_id: row.id,
        auto_committed: true,
      })),
      ...review.map((i) => ({ ...i, auto_committed: false })),
    ];
    after(async () => {
      await supabase
        .from("parse_sessions")
        .update({ results })
        .eq("id", parseSession.id);
    });
  }

  return NextResponse.json({
    autoCommit: saved,
    needsReview: review.map(({ raw, title, due_at, type, module }) => ({
      raw,
      title,
      due_at,
      type,
      module,
    })),
    parseSessionId: parseSession?.id ?? null,
  });
}
