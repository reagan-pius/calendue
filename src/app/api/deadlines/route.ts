import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { TYPE_COLORS, isDeadlineType } from "@/lib/deadlines/types";
import { DEADLINE_COLUMNS } from "@/lib/deadlines/query";

// GET /api/deadlines?from=<iso>&to=<iso> — session-scoped via RLS.
export async function GET(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const from = searchParams.get("from");
  const to = searchParams.get("to");

  let query = supabase
    .from("deadlines")
    .select(DEADLINE_COLUMNS)
    .order("due_at", { ascending: true, nullsFirst: false });
  if (from) query = query.gte("due_at", from);
  if (to) query = query.lte("due_at", to);

  const { data, error } = await query;
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json(data ?? []);
}

// POST /api/deadlines — manual create (review-table confirm uses this too).
export async function POST(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const title = typeof body.title === "string" ? body.title.trim() : "";
  if (!title) {
    return NextResponse.json({ error: "Title is required" }, { status: 400 });
  }
  const type =
    typeof body.type === "string" && isDeadlineType(body.type)
      ? body.type
      : "assignment";
  const due_at =
    typeof body.due_at === "string" && body.due_at ? body.due_at : null;
  const color =
    typeof body.color === "string" && body.color
      ? body.color
      : TYPE_COLORS[type];
  const source =
    typeof body.source === "string" &&
    ["paste", "manual", "email", "github", "agent"].includes(body.source)
      ? body.source
      : "manual";

  const { data, error } = await supabase
    .from("deadlines")
    .insert({
      user_id: user.id,
      title,
      description:
        typeof body.description === "string" && body.description
          ? body.description
          : null,
      due_at,
      type,
      module:
        typeof body.module === "string" && body.module ? body.module : null,
      color,
      source,
      parse_confidence:
        typeof body.parse_confidence === "number"
          ? body.parse_confidence
          : null,
      parse_session_id:
        typeof body.parse_session_id === "string" && body.parse_session_id
          ? body.parse_session_id
          : null,
    })
    .select(DEADLINE_COLUMNS)
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json(data);
}
