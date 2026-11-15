import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { TYPE_COLORS, isDeadlineType } from "@/lib/deadlines/types";
import {
  DEADLINE_COLUMNS,
  DEADLINE_LIST_COLUMNS,
} from "@/lib/deadlines/query";

// GET /api/deadlines — session-scoped via RLS (lean columns for calendar + list).
export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data, error } = await supabase
    .from("deadlines")
    .select(DEADLINE_LIST_COLUMNS)
    .order("due_at", { ascending: true, nullsFirst: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json(data ?? []);
}

function rowFromBody(
  body: Record<string, unknown>,
  userId: string,
): Record<string, unknown> | { error: string } {
  const title = typeof body.title === "string" ? body.title.trim() : "";
  if (!title) return { error: "Title is required" };
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
    ["paste", "manual"].includes(body.source)
      ? body.source
      : "manual";
  return {
    user_id: userId,
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
    parse_session_id:
      typeof body.parse_session_id === "string" && body.parse_session_id
        ? body.parse_session_id
        : null,
  };
}

// POST /api/deadlines — single create, or { items: [...] } batch for review confirm.
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

  if (Array.isArray(body.items)) {
    if (body.items.length === 0) {
      return NextResponse.json([]);
    }
    const rows: Record<string, unknown>[] = [];
    for (const item of body.items) {
      if (!item || typeof item !== "object") {
        return NextResponse.json({ error: "Invalid item" }, { status: 400 });
      }
      const row = rowFromBody(item as Record<string, unknown>, user.id);
      if ("error" in row) {
        return NextResponse.json({ error: row.error }, { status: 400 });
      }
      rows.push(row);
    }
    const { data, error } = await supabase
      .from("deadlines")
      .insert(rows)
      .select(DEADLINE_LIST_COLUMNS);
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    return NextResponse.json(data ?? []);
  }

  const row = rowFromBody(body, user.id);
  if ("error" in row) {
    return NextResponse.json({ error: row.error }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("deadlines")
    .insert(row)
    .select(DEADLINE_COLUMNS)
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json(data);
}
