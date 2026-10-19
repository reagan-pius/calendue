// Two-user RLS verification for Calendue (spec trust boundary:
// "Every read/write filtered by authenticated user_id").
//
// Usage:
//   npx supabase start            # local stack
//   npx supabase status -o env    # prints env vars
//   SUPABASE_URL=... SUPABASE_ANON_KEY=... node scripts/verify-rls.mjs
//
// Asserts: user B cannot see/edit/delete user A's deadlines or sessions,
// user A can; profile auto-created on signup.
import { createClient } from "@supabase/supabase-js";

const url =
  process.env.NEXT_PUBLIC_SUPABASE_URL ??
  process.env.SUPABASE_URL ??
  process.env.API_URL; // `npx supabase status -o env`
const anon =
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??
  process.env.SUPABASE_ANON_KEY ??
  process.env.ANON_KEY; // `npx supabase status -o env`

if (!url || !anon) {
  console.error(
    "Missing SUPABASE_URL / SUPABASE_ANON_KEY. Run: npx supabase status -o env",
  );
  process.exit(2);
}

let failures = 0;
function check(name, ok, detail = "") {
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
  if (!ok) failures += 1;
}

async function makeUser(tag) {
  const email = `rls-${tag}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}@example.com`;
  const password = `Calendue!${Math.random().toString(36).slice(2)}A1`;
  const client = createClient(url, anon);
  const { data, error } = await client.auth.signUp({ email, password });
  if (error) throw new Error(`signUp(${tag}): ${error.message}`);
  if (!data.session) {
    // Email confirmation not auto-enabled: fall back to password sign-in.
    const { error: inErr } = await client.auth.signInWithPassword({
      email,
      password,
    });
    if (inErr) throw new Error(`signIn(${tag}): ${inErr.message}`);
  }
  const { data: userData } = await client.auth.getUser();
  if (!userData.user) throw new Error(`no session user for ${tag}`);
  return { client, user: userData.user, email };
}

const A = await makeUser("a");
const B = await makeUser("b");
check("both users signed up", Boolean(A.user.id && B.user.id));
check("A and B are distinct users", A.user.id !== B.user.id);

// Profile auto-created by trigger?
{
  const { data } = await A.client
    .from("profiles")
    .select("id, email")
    .eq("id", A.user.id);
  check("A profile auto-created on signup", data?.length === 1);
}

// A creates a deadline.
const { data: created, error: insErr } = await A.client
  .from("deadlines")
  .insert({
    user_id: A.user.id,
    title: "RLS probe deadline",
    due_at: new Date(Date.now() + 86400000).toISOString(),
    type: "assignment",
    color: "#DC2626",
    source: "manual",
  })
  .select("id, user_id")
  .single();
check("A can insert own deadline", !insErr && created?.id != null);

// A creates a parse session.
const { data: session, error: psErr } = await A.client
  .from("parse_sessions")
  .insert({ user_id: A.user.id, raw_text: "probe paste", results: [] })
  .select("id")
  .single();
check("A can insert own parse_session", !psErr && session?.id != null);

// B isolation assertions.
{
  const { data } = await B.client
    .from("deadlines")
    .select("id")
    .eq("user_id", A.user.id);
  check("B cannot select A's deadlines", (data?.length ?? 0) === 0);

  const { data: upd } = await B.client
    .from("deadlines")
    .update({ title: "hijacked" })
    .eq("id", created.id)
    .select("id");
  check("B cannot update A's deadline", (upd?.length ?? 0) === 0);

  const { data: del } = await B.client
    .from("deadlines")
    .delete()
    .eq("id", created.id)
    .select("id");
  check("B cannot delete A's deadline", (del?.length ?? 0) === 0);

  const { data: sessions } = await B.client
    .from("parse_sessions")
    .select("id")
    .eq("user_id", A.user.id);
  check("B cannot select A's parse_sessions", (sessions?.length ?? 0) === 0);

  const { data: profiles } = await B.client
    .from("profiles")
    .select("id")
    .eq("id", A.user.id);
  check("B cannot select A's profile row", (profiles?.length ?? 0) === 0);

  // B's own writes still work.
  const { data: bRow } = await B.client
    .from("deadlines")
    .insert({
      user_id: B.user.id,
      title: "B own deadline",
      due_at: new Date().toISOString(),
      type: "personal",
      color: "#16A34A",
      source: "manual",
    })
    .select("id")
    .single();
  check("B can insert own deadline", bRow?.id != null);
  const { data: bAll } = await B.client.from("deadlines").select("id");
  check(
    "B's select returns only B's rows",
    (bAll ?? []).every((r) => r.id !== created.id) && (bAll?.length ?? 0) >= 1,
  );
}

// A still sees own row, then cleans up.
{
  const { data } = await A.client
    .from("deadlines")
    .select("id")
    .eq("id", created.id);
  check("A can still select own deadline", data?.length === 1);
  const { data: del } = await A.client
    .from("deadlines")
    .delete()
    .eq("id", created.id)
    .select("id");
  check("A can delete own deadline", del?.length === 1);
}

console.log(
  failures === 0
    ? "\nRLS verification: ALL PASS"
    : `\nRLS verification: ${failures} FAILURE(S)`,
);
process.exit(failures === 0 ? 0 : 1);
