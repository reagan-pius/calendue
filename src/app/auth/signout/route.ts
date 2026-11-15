import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// POST /auth/signout — clear the session on the server so the calendar shell
// never needs the browser Supabase client.
export async function POST(request: Request) {
  const supabase = await createClient();
  await supabase.auth.signOut();
  return NextResponse.redirect(new URL("/login", request.url), { status: 303 });
}
