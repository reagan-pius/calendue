// Phase 6 calibration harness (spec validation plan, "before over-building
// the parser"). Runs the real parser over docs/calibration/samples/*.txt and
// reports auto-commit vs review rates at the current threshold.
//
//   npm run calibrate          (or: TZ=Europe/London npx tsx scripts/calibrate.mjs)
//
// Seeded samples are SYNTHETIC placeholders. Replace them with 5-10 real
// deadline pastes from friends; only adjust AUTO_COMMIT_THRESHOLD with
// evidence from those runs.
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import { parseDeadlines } from "../src/lib/parser/index.ts";
import { AUTO_COMMIT_THRESHOLD } from "../src/lib/parser/threshold.ts";

const dir = fileURLToPath(new URL("../docs/calibration/samples/", import.meta.url));
const files = readdirSync(dir)
  .filter((f) => f.endsWith(".txt"))
  .sort();

if (files.length === 0) {
  console.error("No .txt samples in docs/calibration/samples/");
  process.exit(1);
}

const tz = process.env.TZ ?? "Europe/London";
console.log(`Parser calibration · tz=${tz} · threshold=${AUTO_COMMIT_THRESHOLD}\n`);

let totals = { items: 0, auto: 0, noDate: 0 };
const rows = [];

for (const f of files) {
  const text = readFileSync(join(dir, f), "utf8");
  const items = parseDeadlines(text, tz);
  const auto = items.filter((i) => i.confidence >= AUTO_COMMIT_THRESHOLD && i.due_at);
  const noDate = items.filter((i) => !i.due_at);
  totals.items += items.length;
  totals.auto += auto.length;
  totals.noDate += noDate.length;
  rows.push({
    file: f,
    items: items.length,
    auto: auto.length,
    review: items.length - auto.length,
    noDate: noDate.length,
    confs: items.map((i) => i.confidence.toFixed(2)).join(" "),
  });
}

const width = Math.max(...rows.map((r) => r.file.length));
for (const r of rows) {
  console.log(
    `${r.file.padEnd(width)}  items=${String(r.items).padStart(2)}  auto=${String(r.auto).padStart(2)}  review=${String(r.review).padStart(2)}  no-date=${r.noDate}  confs=[${r.confs}]`,
  );
}

const rate = totals.items ? Math.round((100 * totals.auto) / totals.items) : 0;
console.log(
  `\nTOTALS: ${totals.items} items · ${totals.auto} auto-commit (${rate}%) · ${totals.items - totals.auto} review · ${totals.noDate} missing dates`,
);
if (files.every((f) => f.startsWith("synthetic"))) {
  console.log(
    "\nNOTE: all samples are synthetic. Replace with real friend pastes before\nmoving the threshold in src/lib/parser/threshold.ts.",
  );
}
