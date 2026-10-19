# Calendue — Design Spec

**Date:** 2026-10-08  
**Status:** Approved (product/architecture + UI craft)  
**Approach:** Paste-wedge web app (Approach 1)

## Intent

Calendue is a minimalist calendar for university students. The core promise: paste or type messy deadlines in plain language, and they land on the right dates—color-coded, private per user, easy to scan as a calendar or list.

**Audience (v1):** a small circle of uni friends (multi-user accounts), each with a fully private calendar.

**Primary pain:** deadlines are scattered across Moodle/Canvas, email, slides, chats, and notes. Students do not want to hand-build calendar events one by one.

**Selling point:** fast deadline capture → clean calendar. Integrations (email, GitHub, agents) are designed for later; they are not the v1 product.

## Goals & success

- A friend can paste a real list of upcoming uni deadlines and get a usable calendar in under a minute.
- Assignment deadlines are immediately recognizable (red by default).
- High-confidence parses require no friction; uncertain ones are corrected before save.
- Overdue items feel urgent (hard once-due / penalty risk), without a mitigating-circumstances workflow in v1.

## Non-goals (v1)

- Email inbox scanning / OAuth mail connect
- GitHub issue import or bots
- Public agent API / API keys
- Google/Outlook/Apple calendar sync
- Sharing, groups, or collaborative module boards
- Recurring deadlines
- Mitigating circumstances (MC) flow
- Email or push reminder delivery

## Product scope (MVP)

### In

- Signup / login (Supabase Auth)
- Paste or type natural language deadlines (single line or multi-line list)
- Hybrid parse commit:
  - High confidence → write to calendar immediately
  - Uncertain → editable review table → confirm
- Clean month calendar as home view
- Toggle to list view (secondary)
- Deadline types with full color palette; assignments default red; user can override color
- Manual create / edit / delete after save
- In-app due-soon and overdue highlighting only
- One-off deadlines only
- Schema fields reserved for future `source` values and sharing/API (unused in UI)

### Out

Listed under Non-goals.

## UX flow

1. Signed-in home: clean month calendar. Empty state prompts “Add deadlines.”
2. User opens a large paste/type surface; enters e.g. `cs coursework 1 due 30th oct` or a pasted list.
3. Server parses into structured items (title, due date/time, type, module) with per-item confidence.
4. Hybrid commit:
   - Auto-add high-confidence items; toast confirms count.
   - Present uncertain items in a review table (edit title/date/time/type/module, drop rows) → confirm.
5. Calendar shows color-coded chips; click day/chip for detail/edit.
6. Toggle Calendar ↔ List. List: upcoming first, then overdue.
7. Due signals: overdue visually harsh; due soon ≈ next 7 days; in-app only.
8. Maintain: edit fields/type/color; delete; no recurrence UI.

## Data model

### User

Managed primarily by Supabase Auth. App profile row if needed:

| Field | Notes |
|-------|--------|
| id | UUID, matches auth user |
| email | |
| display_name | optional |
| created_at | |

### Deadline

| Field | Notes |
|-------|--------|
| id | UUID |
| user_id | FK; all queries scoped to session user |
| title | required |
| description | optional |
| due_at | timestamptz; if time omitted at parse, default end-of-day in user timezone (v1: browser/local assumption documented) |
| type | `assignment \| exam \| meeting \| personal \| reminder` |
| module | optional string (no Module table in v1) |
| color | hex/token; default from type; user override |
| done | boolean (default false). `due_soon` / `overdue` / `upcoming` derived from `due_at` + `done`. In UI, done items use strikethrough, muted treatment, and sort below upcoming |
| source | `paste \| manual` in v1; reserved later: `email \| github \| agent` |
| parse_confidence | optional float/enum for debugging |
| parse_session_id | optional FK |
| created_at / updated_at | |

**Default colors (v1):**

- assignment → red
- exam → orange
- meeting → blue
- personal → green
- reminder → gray

### ParseSession

| Field | Notes |
|-------|--------|
| id | UUID |
| user_id | FK |
| raw_text | original paste |
| created_at | |
| results | JSONB array of parsed rows with confidence, auto_committed flag, and optional `deadline_id` once saved |

### Reserved (not built in v1)

Share/Group, Integration, ReminderDelivery, ApiKey. Design only: keep `source` and stable private REST shapes so these can land later without a rewrite.

## Architecture

### Stack

- **Framework:** Next.js (App Router) in `/Users/rgnpx/calendue`
- **Auth + DB:** Supabase (Auth + Postgres)
- **Data access:** Supabase JS client (`@supabase/ssr` + `@supabase/supabase-js`) against Postgres; RLS policies enforce `user_id = auth.uid()`
- **Calendar UI:** custom minimal month grid preferred; thin library only if it stays visually clean
- **Parsing:** Next.js Route Handler — NL → structured items + confidence
- **Hosting (later):** Vercel + Supabase

### Surfaces

| Surface | Role |
|---------|------|
| `/` (app home) | Calendar + add deadlines + list toggle |
| Auth routes / Supabase session | Signup, login, logout |
| `POST /api/parse` | `{ text }` → `{ autoCommit[], needsReview[] }` |
| `CRUD /api/deadlines` | Authenticated, `user_id`-scoped only |

No public API keys, webhooks, or third-party OAuth beyond Supabase Auth in v1.

### Trust boundaries

- Every read/write filtered by authenticated `user_id`
- Parser does not persist uncertain items without explicit confirm
- Auto-commit only when confidence ≥ threshold (tunable constant)
- No mailbox or GitHub token storage in v1

### Parsing behavior

- Accept multi-line lists and single utterances
- Extract: title, due date, optional time, type (default `assignment` when coursework/essay/deadline language appears), optional module code/name
- Confidence heuristic examples:
  - High: explicit calendar date + clear title (`cs coursework 1 due 30th oct`)
  - Low: relative-only with ambiguity (`sometime next week`), missing date, multiple possible dates
- Implementation may use LLM structured output and/or date-nlp (e.g. chrono) plus rules; confidence gate is mandatory either way

## Future (explicitly post-MVP)

1. Optional sharing for group work (still default-private)
2. Email connect for deadline hints
3. Calendar export/sync
4. GitHub due-date import
5. Authenticated public/agent API
6. MC status / adjusted due dates
7. Simple recurrence
8. Email/push reminder delivery aligned with hard once-due semantics

## Validation plan

Before over-building the parser:

1. Collect 5–10 real deadline pastes from friends
2. Measure auto-commit accuracy vs review rate
3. Confirm weekly willingness to use vs Google Calendar / Notion / nothing
4. Observe whether calendar or list gets more use after the first week

**Product hypothesis:** automatic cleanup of messy deadlines is the value; the calendar is the interface.

## UI craft (ui-craft-minimal)

**Knobs (locked):** CRAFT=8 · MOTION=3 · DENSITY=2

### Visual system

- **Surface:** light only (`oklch(99% 0 0)` canvas)
- **Type:** near-black primary / muted secondary; Geist for body + UI (no display face)
- **Accent:** one cool ink (~oklch hue 250) — reserved for primary CTA, active Calendar/List toggle, focus rings
- **Borders:** hairline only; no decorative gradients, glass, or colored chrome borders
- **Radius:** 6px inputs, 8px cards (if any), 12px modals
- **Motion:** hover + modal/popover/sheet enter-exit only; honor `prefers-reduced-motion`

### Type colors vs chrome

Deadline type colors (assignment red, exam orange, meeting blue, personal green, reminder gray) appear **only** as calendar/list chips or dots. App chrome stays monochrome + one accent. User may override chip color per deadline.

### App shell

- **No marketing landing in v1** — auth → calendar
- **Top bar:** wordmark `Calendue` · Calendar/List text toggle (accent underline or weight 500; no pills) · `Add deadlines` · account menu
- **Month navigation:** inside calendar header — `October 2026`, ‹ ›, optional Today
- **Calendar:** hairline month grid; quiet day numbers; type-colored chips; no cell fills
- **Day/chip click:** popover with that day’s deadlines + edit; on mobile → full-width sheet
- **List view:** single-line rows — color dot · title · module · due date/time · overdue label when needed
- **Overdue / due-soon:** stronger chip urgency + list label; do not paint the whole shell red
- **Done:** checkbox in popover/list; completed items show **strikethrough**, muted styling, sorted below upcoming
- **Empty state:** quiet centered line + Add deadlines CTA; no illustration; no sample-paste block in v1
- **Auth:** bare white canvas, wordmark, Supabase auth fields / magic link, one accent CTA
- **Toasts:** elevated/hairline toast after hybrid commit, e.g. `3 added · 1 needs review`

### Capture modal

1. Large textarea for paste/type  
2. If any uncertain items → same modal step 2: editable review table → confirm  
3. High-confidence items auto-commit; toast reports counts  

### UI non-goals (v1)

Pill toggles, dense multi-column tables as home, card grids, dark mode, marketing shell, onboarding carousel, ghost sample deadlines, scroll/page transition choreography.

## Open decisions (resolved)

| Topic | Decision |
|-------|----------|
| Audience | Friends circle, multi-user |
| Privacy | Private first; sharing later |
| Capture | Paste/type NL |
| Home UI | Clean calendar; list toggle secondary |
| Integrations | Design-ready only in v1 |
| Reminders | In-app due-soon/overdue only |
| MC | Design awareness only |
| Post-parse | Hybrid auto + review |
| Colors | Full type palette on chips only; assignments red; chrome monochrome + one accent |
| Recurrence | None in v1 |
| Backend | Supabase Auth + Postgres + Supabase JS client (RLS) |
| UI craft | ui-craft-minimal (see section above) |
| Font | Geist |
| Accent | Cool ink (~250) |
| Surface | Light only |
| Add flow | Modal (parse → optional review) |
| Done UI | Checkbox + strikethrough |

## Implementation note

Product, architecture, and UI craft are approved. Next step when requested: write a local implementation plan (phased tasks) under `calendue/docs/` — no git unless asked.
