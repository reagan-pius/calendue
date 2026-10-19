// Real-data calibration metrics (Q4: soft gate — the app measures itself).
// Aggregates parse_sessions.results + linked deadlines from the running
// Supabase instance using the SERVICE ROLE key (bypasses RLS; dev-only tool).
//
//   npx supabase status -o env   # then export API_URL and SERVICE_ROLE_KEY
//   npm run calibrate:db
import { readFileSync } from "node:fs";

// Reuse `supabase status -o env` output if a file is passed, else process env.
function loadEnv() {
  const file = process.argv[2];
  if (!file) return;
  for (const line of readFileSync(file, "utf8").split("\n")) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
  }
}

loadEnv();

const url =
  process.env.NEXT_PUBLIC_SUPABASE_URL ??
  process.env.SUPABASE_URL ??
  process.env.API_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SERVICE_ROLE_KEY;

if (!url || !serviceKey) {
  console.error(
    "Missing API_URL and/or SERVICE_ROLE_KEY. Run: npx supabase status -o env [file]",
  );
  process.exit(2);
}

const headers = {
  apikey: serviceKey,
  Authorization: `Bearer ${serviceKey}`,
};

async function rest(path) {
  const res = await fetch(`${url}/rest/v1/${path}`, { headers });
  if (!res.ok) throw new Error(`${path}: HTTP ${res.status} ${await res.text()}`);
  return res.json();
}

const sessions = await rest("parse_sessions?select=id,raw_text,results,created_at");
const linkedDeadlines = await rest(
  "deadlines?select=id,source,parse_session_id,parse_confidence,created_at&source=eq.paste",
);

let items = 0;
let auto = 0;
let review = 0;
let noDate = 0;
const autoConfs = [];

for (const s of sessions) {
  for (const r of s.results ?? []) {
    items += 1;
    if (r.auto_committed) {
      auto += 1;
      if (typeof r.confidence === "number") autoConfs.push(r.confidence);
    } else {
      review += 1;
      if (!r.due_at) noDate += 1;
    }
  }
}

const confirmedReview = linkedDeadlines.filter(
  (d) => d.parse_session_id && d.parse_confidence == null,
).length;
const linkedSessionIds = new Set(
  linkedDeadlines.filter((d) => d.parse_session_id).map((d) => d.parse_session_id),
);

const pct = (n, d) => (d ? Math.round((1000 * n) / d) / 10 : 0);

console.log("Calendue — real-data calibration (parse_sessions)");
console.log(`  sessions:            ${sessions.length}`);
console.log(`  pasted items:        ${items}`);
console.log(`  auto-committed:      ${auto} (${pct(auto, items)}%)`);
console.log(`  sent to review:      ${review} (${pct(review, items)}%)  · no-date: ${noDate}`);
console.log(`  review rows confirmed: ${confirmedReview} (${pct(confirmedReview, review)}% of review rows)`);
console.log(`  sessions w/ any saved paste deadline: ${linkedSessionIds.size}/${sessions.length}`);
if (autoConfs.length) {
  const sorted = [...autoConfs].sort((a, b) => a - b);
  console.log(
    `  auto confidence range: ${sorted[0].toFixed(2)}–${sorted[sorted.length - 1].toFixed(2)} (median ${sorted[Math.floor(sorted.length / 2)].toFixed(2)})`,
  );
}
console.log(
  "\nTrigger check (Q5): LLM fallback if real auto-commit < 60% or review confirms < 50%.",
);
