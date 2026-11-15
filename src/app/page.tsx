import { connection } from "next/server";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import CalendarApp from "@/components/CalendarApp";
import { DEADLINE_LIST_COLUMNS } from "@/lib/deadlines/query";
import type { Deadline } from "@/lib/deadlines/types";

// Session-gated home: blocking per-request render (cookies) under cacheComponents.
export const instant = false;

export default async function Home() {
  // Force request-time render so Cache Components does not prerender the
  // client tree against an unstable clock (Date.now / local month cursor).
  await connection();

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  // Fetch deadlines on the server so the first paint skips the client
  // /api/deadlines waterfall (auth already paid for above).
  const { data } = await supabase
    .from("deadlines")
    .select(DEADLINE_LIST_COLUMNS)
    .order("due_at", { ascending: true, nullsFirst: false });

  return (
    <CalendarApp
      email={user.email ?? ""}
      initialDeadlines={(data as Deadline[] | null) ?? []}
    />
  );
}
