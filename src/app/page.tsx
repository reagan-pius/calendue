import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import CalendarApp from "@/components/CalendarApp";

// Session-gated home: blocking per-request render (cookies) under cacheComponents.
export const instant = false;

export default async function Home() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  return <CalendarApp email={user.email ?? ""} />;
}
