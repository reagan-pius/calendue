# Calendue — Implementation Plan (phased)

**Created:** 2026-10-12
**Source spec:** `docs/superpowers/specs/2026-10-08-calendue-design.md` (Approved)
**Repo rule:** no git unless explicitly asked.

## 0. Decisions pinned at plan time (fixing readiness gaps ①②)

| # | Decision | Value | Rationale |
|---|----------|-------|-----------|
| D1 | Parser approach | **Rules-first: `chrono-node` + keyword rules** in `src/lib/parser/`. An LLM may later replace/augment it **behind the same `POST /api/parse` contract** — no key required for v1, deterministic and testable before calibration. | Spec allows "LLM and/or date-nlp plus rules"; rules-first keeps v1 secret-free and matches validation-before-hardening. |
| D2 | Auto-commit threshold | **`AUTO_COMMIT_THRESHOLD = 0.85`** (single constant in `src/lib/parser/threshold.ts`). Items ≥ threshold auto-commit; < threshold → review table. | Starting value only; recalibrated in Phase 6 against real pastes. |
| D3 | Confidence representation | **float 0–1**, rounded to 2dp, stored in `deadlines.parse_confidence`. | Simple; threshold comparison is a plain `>=`. |
| D4 | Timezone rule (v1) | Store `due_at` as `timestamptz` (UTC). **Interpret all parsed dates in the user's browser IANA timezone** (client sends `tz` with the parse request). Time omitted → **23:59:59 local** on the parsed date. Display in browser-local time. | Spec asked for "browser/local assumption documented" — this is that documentation. |
| D5 | Color storage | `deadlines.color` is **text, `#RRGGBB` hex**. Defaults by type: assignment `#DC2626`, exam `#EA580C`, meeting `#2563EB`, personal `#16A34A`, reminder `#6B7280`. User override allowed per deadline. | Unambiguous for chip renderer; tokens map to hex once at write time. |
| D6 | Auth mode | **Email + password AND magic link**, both via Supabase Auth (spec listed "fields / magic link"). | Cheap to offer both; no extra design surface. |

## 1. Phase status

- [x] **Phase 0** — Settle parser approach + threshold (D1, D2)
- [x] **Phase 1** — Pin timezone / color / confidence details (D3–D6)
- [x] **Phase 2** — Write this phased plan doc
- [x] **Phase 3** — Scaffold Next.js app (App Router, TS, Tailwind) in `/Users/rgnpx/calendue` ✅ builds clean, lint clean
- [x] **Phase 4** — Supabase: schema migration + RLS (`user_id = auth.uid()`), local stack, **two-user RLS verification** ✅ `npm run verify-rls` → 14/14 PASS (local Docker stack)
- [x] **Phase 5** — App surfaces: auth, calendar/list home, capture modal, `/api/parse`, `/api/deadlines` ✅ smoke-tested (`/` → 307 → `/login`; APIs 401 unauthenticated)
- [ ] **Phase 6** — Calibration harness ready (`npm run calibrate`); **blocked on 5–10 real friend pastes** — replace synthetic samples, record numbers, then (and only then) move the threshold

### Phase 5 notes

- Next 16 conventions hit during the build (resolved): route guard lives in
  `src/proxy.ts` (middleware deprecated in 16; server-component `redirect()`
  was swallowed by postponed rendering), and `/` uses `export const instant = false`
  because the scaffold enables `cacheComponents`.
- Auth: email+password and magic link (D6), callback at `/auth/callback`.

### Phase 6 — calibration baseline (synthetic only, 2026-10-12, tz=Europe/London)

| Sample | items | auto | review | notes |
|---|---|---|---|---|
| synthetic-01-clean | 3 | 2 | 1 | "next friday" → review (0.72) |
| synthetic-02-messy | 3 | 1 | 2 | "sometime next week" → review (0.77) after fix |
| synthetic-03-single | 1 | 1 | 0 | spec example "cs coursework 1 due 30th oct" auto-commits (0.90) |
| synthetic-04-exams-meetings | 3 | 3 | 0 | |
| synthetic-05-no-dates | 2 | 0 | 2 | no-date items correctly capped (0.45) |
| **TOTAL** | **12** | **7 (58%)** | **5** | synthetic only — not evidence for D2 |

**Bug found & fixed by the harness:** chrono reports "next week" as a *certain*
date (conf 0.97 → would auto-commit); added `RELATIVE_UNIT_RE` guard so
unit-relative phrases route to review, per the spec's low-confidence example.
**Do not tune `AUTO_COMMIT_THRESHOLD` until real pastes replace the synthetics.**

## 2. Phase details

### Phase 3 — Scaffold
- Next.js (latest, App Router, TypeScript, Tailwind, `src/`, alias `@/*`), npm.
- Deps: `@supabase/supabase-js`, `@supabase/ssr`, `chrono-node`.
- No `.git` directory (per spec rule).

### Phase 4 — Data + RLS
- `supabase/migrations/0001_init.sql`: `profiles`, `deadlines`, `parse_sessions` per spec data model; `updated_at` trigger; RLS on all three with `auth.uid() = user_id`.
- `scripts/verify-rls.mjs`: signs up **user A and user B**, asserts A's rows are invisible and unwritable from B's session, PASS/FAIL per assertion. Run against local Supabase (Docker) stack.

### Phase 5 — Surfaces
| Surface | Notes |
|---|---|
| `/` | Auth-gated. Calendar/List toggle, month nav, chips, day popover (edit/done/delete), empty state, toast. |
| `/login` | Wordmark, email+password, magic-link option, one accent CTA. |
| `POST /api/parse` | Body `{ text, tz }` → `{ autoCommit[], needsReview[] }`; **persists auto-commit items** (`source='paste'`) and a `parse_sessions` row; never persists uncertain items. LLM slot: swap `parseWithRules` for an LLM impl later without contract change. |
| `CRUD /api/deadlines` | GET (`?from&to`), POST, PATCH `[id]`, DELETE `[id]`; session-scoped. |
| UI craft | Per spec: light `oklch(99% 0 0)` canvas, Geist, monochrome chrome + one ~250 accent, hairline borders, radii 6/8/12, type colors on chips only, strikethrough done, motion: hover + modal only, `prefers-reduced-motion` honored. |

### Phase 6 — Calibration (before parser hardening)
- Harness: `scripts/calibrate.mjs` runs the real parser over `docs/calibration/samples/*.txt`.
- Replace seeded **synthetic** samples with 5–10 **real friend pastes**, record auto-commit % and review rate; move D2 threshold only with evidence.
- Do not add parser features (fuzzy scoring, LLM fallback) until calibration numbers exist.

## 3. Decision record — build/ship round (2026-10-12)

Grilled Q1–Q7; all settled as follows. Phase A = local, Phase B = hosted rollout.

| Q | Decision | Trigger / notes |
|---|----------|-----------------|
| Q1 Ship target | **Local-first now; hosted Vercel + Supabase when real friends onboard** | Swap `.env.local` only — app is already portable |
| Q2 Git | **Initialized 2026-10-12 with initial commit of verified state** | No remote until Phase B |
| Q3 Auth/email | Local auto-confirm now; **hosted: email confirm ON + SMTP** (magic link + password reset require it) | Password fallback stays (D6) |
| Q4 Calibration gate | **Soft gate**: friends use it; metrics self-collected from `parse_sessions.results` via `npm run calibrate:db` | Never hand-tune threshold without recorded numbers |
| Q5 Parser scope | **Rules-only for v1**; LLM fallback (same `/api/parse` contract) fires only on evidence | **Trigger: real auto-commit < 60% OR review confirms < 50%** |
| Q6 Mobile sheet | **Verify popover on a real phone before Phase B**; build full-width sheet only if it fails usability | Jumps queue as rollout blocker if unusable |
| Q7 Tests & CI | No unit suite yet (calibration harness is the oracle); **CI = lint + build + verify-rls on first push to a remote** | ~15-line GitHub Actions job |

### Phase B checklist (do when 2–3 friends start using it)

- [ ] Hosted Supabase project + SMTP + email confirm ON
- [ ] Swap `.env.local` → production env vars (Vercel)
- [ ] Push to remote; add CI job: `npm run lint && npm run build && npm run verify-rls` (with a dedicated CI verify user or testcontainers)
- [ ] Phone usability check of day popover → build mobile sheet if it fails
- [ ] Re-run `npm run calibrate:db`; if Q5 trigger fired, enable LLM slot
- [ ] Record threshold change (if any) here with before/after numbers

## 4. Environment assumptions

- Node ≥ 20 (local: v25.9.0), npm registry reachable.
- Local Supabase via Docker (running) using `npx supabase`; production Supabase project + env vars are a later, hosted step.
- Env vars: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` (see `.env.example`).
