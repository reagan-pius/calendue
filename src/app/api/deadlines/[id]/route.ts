import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { TYPE_COLORS, isDeadlineType } from "@/lib/deadlines/types";
import { DEADLINE_COLUMNS } from "@/lib/deadlines/query";

type Params = { params: Promise<{ id: string }> };

// PATCH /api/deadlines/[id] — partial update; RLS scopes to the session user.
export async function PATCH(req: Request, { params }: Params) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { id } = await params;

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const patch: Record<string, unknown> = {};
  if (typeof body.title === "string" && body.title.trim()) {
    patch.title = body.title.trim();
  }
  if ("description" in body) {
    patch.description =
      typeof body.description === "string" && body.description
        ? body.description
        : null;
  }
  if ("due_at" in body) {
    patch.due_at =
      typeof body.due_at === "string" && body.due_at ? body.due_at : null;
  }
  if (typeof body.type === "string" && isDeadlineType(body.type)) {
    patch.type = body.type;
  }
  if ("module" in body) {
    patch.module =
      typeof body.module === "string" && body.module ? body.module : null;
  }
  if (typeof body.color === "string" && body.color) {
    patch.color = body.color;
  } else if (typeof body.type === "string" && isDeadlineType(body.type)) {
    patch.color = TYPE_COLORS[body.type];
  }
  if (typeof body.done === "boolean") {
    patch.done = body.done;
  }
  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: "No fields" }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("deadlines")
    .update(patch)
    .eq("id", id)
    .select(DEADLINE_COLUMNS);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  if (!data || data.length === 0) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  return NextResponse.json(data[0]);
}

// DELETE /api/deadlines/[id]
export async function DELETE(_req: Request, { params }: Params) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { id } = await params;

  const { data, error } = await supabase
    .from("deadlines")
    .delete()
    .eq("id", id)
    .select("id");
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  if (!data || data.length === 0) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  return NextResponse.json({ ok: true });
}
