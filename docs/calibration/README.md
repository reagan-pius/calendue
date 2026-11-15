# Calibration samples

- **All seeded `synthetic-*.txt` files are placeholders** — invented to exercise
  the rules-first parser (clean dates, messy/ambiguous lines, single
  utterances, exam/meeting types, missing dates).
- **`real-*.txt` samples are gitignored** — drop real Moodle/friend pastes here
  locally; they must not ship to GitHub.
- Before tuning `src/lib/parser/threshold.ts`, **replace synthetics with 5–10 real
  pastes from friends** (spec validation plan) and record:

  ```
  npm run calibrate
  ```

- Then update the Phase 6 table in `docs/implementation-plan.md` with
  auto-commit % and review rate. Only move `AUTO_COMMIT_THRESHOLD` with
  evidence from real pastes.
