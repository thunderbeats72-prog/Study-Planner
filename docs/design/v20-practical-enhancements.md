# v20 — Practical Real-World Enhancement Pass

Design note for the "make it a daily tool" pass. Cause → fix, tables, and
the shared decision utilities that now feed the Dashboard, the AI tutor and
the command palette.

## The problem

The Overview answered "here are your statistics" before it answered "what
should I do now?" — the hero was a greeting, the only next-action card was
ML-dependent (blank when analytics was unavailable), overdue work was a
notification row suggesting failure, and task rows carried six buttons.

## The principle

One deterministic answer to "what now?" computed by ONE utility, surfaced
with calm language everywhere: `Start here` → study → done → next.

## Changes

### 1. `src/lib/prioritization.ts` — the single priority decision

- Input: task rows + today + optional weak-subject ids / subject weights /
  remaining-today minutes. Output: ranked pending tasks with `reason` and a
  friendly `priorityLabel` (`Start here`, `Continue with this` for partially
  logged tasks, `Best next step`, `Then`). Scores are internal — never shown.
- Order of dominance: overdue (older first, gently) → due today → revision
  (time-sensitive recall) → weak subject → due soon → upcoming → later.
  Boosts: kind (revise 110 > learn 60 > practice 45 > mock 40 > buffer 0),
  weak subject +80, subject weight ≤ +24, earlier schedule position ≤ +24,
  fits-remaining-time +10, shorter tasks ≤ +10, partially started +6.
- Deterministic tie-break: score ↓, date ↑, position ↑, id ↑ — identical
  inputs always produce identical order (pinned by tests).
- `nextAction()` exposes the NOW/NEXT pair; `weakestSubjectIds()` finds the
  lowest-completion subjects. `daysFrom()`/`reasonLabel()` round it out.
- Reused by: Dashboard hero, `state.buildContext` (AI context ordering),
  command palette "Start next pending lesson". The AI tutor now recommends
  the same task the hero shows.

### 2. `src/lib/recovery.ts` — backlog without cramming

- `backlogFor` (pending past-dated work only), `pendingOnDate`,
  `dailyCapacityMinutes`, `todayOverload`, `canFitToday`.
- `suggestedRecovery`: never more than `GENTLE_EXTRA_PER_DAY` (30) minutes
  per day on top of a full plan, spread over as many days as needed —
  the "2h today · 3h backlog → +30 min/day for 6 days" behaviour.
- `spreadAcrossDays`: oldest task first, each placed on the earliest day
  that can hold it within capacity; if no day can, it goes to the lightest
  day (a task is never silently dropped). Deterministic.
- `backlogToDate`: the "move everything to one date" option.

### 3. Bulk moves API — `PATCH /api/tasks { moves }`

`moves: [{id, date}]` (1–60 entries, validated; `INVALID_MOVES` on bad
shape). One call re-dates many tasks — no per-task round-trips for "spread
across the week". Mirrored in the in-memory demo layer.

### 4. Dashboard hero — NOW / NEXT / TODAY / RECOVERY

- Top card: `priorityLabel · reason`, the task title, meta line, Start /
  Start Focus. While that task records, the card becomes the live session
  control (pause / clock out + running time). Below it: the NEXT task line,
  then "Today: x/y done · z min left" (+ backlog note).
- All-caught-up state: friendly, suggests adding a task or resting — no
  false urgency.
- Recovery panel (only when overdue exists): the four options, "Do today"
  disabled with an explanation when it would exceed daily capacity, plus
  the gentle pace suggestion.
- Order of sections: hero → recovery → Today's Plan (with Quick Add) →
  momentum → KPIs → charts → heatmap → coaching → intelligence. Stats
  became supporting information.
- The old ML "Up next" card was removed: its live-control job moved into
  the hero, and the hero no longer depends on the analytics endpoint being
  reachable. Peak-focus / readiness data still lives in the Intelligence
  card.

### 5. Quick Add — `src/components/QuickAdd.tsx` + `src/lib/quickAdd.ts`

Toggle button opens an inline tray: title, duration chips (15–60 + custom),
optional subject, Today/Tomorrow, type. Client validation mirrors the
server (title ≤ 300, whole minutes 1–720, valid date, known kind; buffer
tasks are scheduler-internal and excluded). Submits to `POST /api/tasks`
and lands in the plan immediately. Lives on the Overview Today card and
the Planner header.

### 6. Task rows — `src/components/TaskActions.tsx`

The one action row every surface shares: primary `Done` / clock `Start`,
secondary actions (Edit, Skip, Skip subject, Reopen) behind a real "⋯"
popover menu (outside-click + Escape close, ARIA menu semantics). Revision
tasks ask for their recall rating right in the row — identical behaviour on
Overview and Planner (previously Overview skipped the rating). Replaced the
old mobile-only `expanded-actions` CSS toggle and the desktop dead "⋯".

### 7. Planner

- Kanban view removed (duplicated list statuses; pure visual noise).
- Workload glance strip: today remaining · tomorrow planned · this week.
- Quick Add in the header; rows use the shared actions; the existing
  overdue strip and re-balance control are unchanged.

### 8. AI tutor

- `buildContext` now orders `today` with `prioritizeTasks` (done tasks
  after pending) and attaches each item's `reason`; the system prompt
  explains the list is pre-ordered and recommends the first pending item.
- System prompt gains an explicit ACTION SAFETY rule: questions about
  actions are answered, never executed; tags require clear imperatives.
  Vague requests ("make my workload lighter") get advice, not a re-plan.
- Instant reply for "what should I study today?" ends with "Start with the
  first one" — the same task the hero shows.

### 9. Copy + notifications

- Overdue notifications reframed as recovery ("N unfinished tasks — let's
  recover them"), streak copy softened ("progress is still here, even on
  days you miss"). No "streak lost" messaging existed; none was added.

### 10. `src/app/practical-enhancements.css`

Additive layer only: hero additions, recovery panel, Quick Add tray,
task menu, workload strip, phone breakpoints, coarse-pointer 44px targets
(`var(--tap)`), `prefers-contrast` and `prefers-reduced-motion` guards.
Fluid sizing via `clamp()` / `minmax()` / `auto-fit`; no new animations.

## Intentionally left unchanged

- Study clock architecture (paused/break time already excluded), focus
  timer, Zen, themes, study scenes, onboarding (already the minimal 8-step
  wizard), subjects, calendar, heatmap, settings, AI provider chain, local
  ML engine, demo fallback, offline session queue.
- The AI regex command layer was already question-safe; only tests and the
  LLM prompt were hardened.

## Validation

- `npm run check` (typecheck + eslint 0 warnings + 180 tests) and
  `npm run build` green.
- Live demo-mode smoke test: state loads, quick add → plan, Done →
  complete, bulk moves → re-dated, invalid payloads → 400, chat answers
  "what should I study today?" with the priority-ordered plan.
