# Calendue

Minimalist deadline calendar for uni students: paste messy deadlines in plain
language → they land on the right dates, color-coded and private.

**Design spec:** `docs/superpowers/specs/2026-10-08-calendue-design.md`  
**Implementation plan:** `docs/implementation-plan.md`

## Stack

Next.js (App Router, TypeScript, Tailwind v4) · Supabase (Auth + Postgres,
RLS private-per-user) · rules-first NL parser (`chrono-node` + keyword rules,
LLM slot reserved behind the same `POST /api/parse` contract).

## Develop

```bash
cp .env.example .env.local        # then fill in Supabase values
npm install
npm run dev
```

### Local Supabase (Docker)

```bash
npx supabase start                # boots local auth + db
npx supabase status -o env        # print URL + keys for .env.local
npx supabase db reset             # apply supabase/migrations/*
```

### Verification & calibration

```bash
npm run verify-rls                # two-user RLS isolation test (needs Supabase env)
npm run calibrate                 # parser auto-commit vs review report
```

## Repo rules

- No git unless explicitly asked.
- Light-only UI, monochrome chrome + one accent; type colors on chips only.
- Parser threshold moves only with real-paste calibration evidence.
