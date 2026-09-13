STUDY PLANNER PRO — Repository Guide
====================================

THE SOURCE OF TRUTH IS THE `src/` FOLDER
----------------------------------------
Everything the app actually runs lives in `src/`:

  src/app/page.tsx            app shell: sidebar, tracker bar, toasts
  src/app/layout.tsx          viewport / safe-area config
  src/app/globals.css         tokens, base type, themes, shell
  src/app/ui-system.css       the ONE refinement layer (component
                              contracts; loaded after globals)
  src/components/*.tsx        Dashboard, Planner, Focus, Subjects,
                              Settings, Onboarding, ChatPanel, etc.
  src/lib/voice.ts            mic listening + spoken replies
  src/lib/useTimer.ts         study clock + focus timer (accurate to
                              the second, fractional-minute logging)
  src/lib/ml.ts               on-device ML (pace, weekdays, FSRS-lite,
                              decay, skip-risk, focus hours)
  src/lib/planner.ts          the mathematical scheduler
  src/lib/ai.ts               Gemini/Groq/OpenRouter chain + local engine
  src/db/schema.ts            tables + performance indexes
  src/app/api/**              every API route

Root-level config files (package.json, tsconfig.json, next.config.ts,
postcss.config.mjs, eslint.config.mjs, drizzle.config.ts) are real and
used by the build.

DEPLOYMENT
----------
Vercel auto-deploys `main` straight from this repository. The deploy path is
therefore just: land the change on `main` (merge the pull request).

  npm run check      # typecheck + zero-warning lint + tests + ui-audit budget
  npm run build      # production Next.js build
  → merge to main    # Vercel builds it and deploys Production

DO NOT drag-and-drop files onto the repository through the GitHub website.
`deploy-package/` is a byte-exact mirror of `src/` kept only so that a manual
upload stays possible; it is never the thing that gets deployed. Uploading it
has broken production twice:

  * Dropping the CONTENTS of `deploy-package/src/` at the repository root
    (commit 93d2780, 73 files) put an `api/` folder at the root. Root `api/`
    is Vercel's zero-config Serverless Functions directory, so it collided
    with the Next.js routes the build emits under
    `.vercel/output/functions/api/*`. The build stayed green and every
    deployment then died at "Deploying outputs..." for two days.
  * A stale mirror silently ships old behaviour, because `src/` keeps moving
    while the copy does not.

`npm test` fails if `deploy-package/src` is not a byte-exact mirror of `src/`,
if `deploy-package/tsconfig.json` differs from the root one, or if any copy of
the app tree reappears at the repository root.

After any deploy, hard-refresh (Ctrl+Shift+R; on phones close and
reopen the tab) so the new CSS/JS is picked up.

LOCAL DEVELOPMENT
-----------------
  cp .env.example .env.local
  # Fill DATABASE_URL and at least one server-side AI key.
  npm install
  npm run dev

  npm run check       # strict TypeScript + zero-warning lint + 34+ tests
  npm run build       # applies the Drizzle schema, then builds Next.js
  npm run build:app   # app-only production build (does not touch a database)

AI CONFIGURATION & DIAGNOSTICS
------------------------------
SERVER KEYS (shared by every learner). Use any of CEREBRAS_API_KEY,
GROQ_API_KEY, MISTRAL_API_KEY, SAMBANOVA_API_KEY, COHERE_API_KEY,
GEMINI_API_KEY (alias GOOGLE_API_KEY) and/or OPENROUTER_API_KEY. Never put a
secret in a NEXT_PUBLIC_* variable. You do NOT need all seven — one key works.
Providers fail over inside one bounded request in priority order Cerebras →
Groq → Mistral → SambaNova → Cohere → Gemini → OpenRouter, each with its own
MODEL FALLBACK CHAIN because model IDs retire. The last provider/model that
answered is remembered and tried first, and failures are benched (rejected key
10 min, retired model 30 min, rate limit ~45 s, stall ~60 s) so the next
message skips the broken leg.
BROWSER KEYS (one learner, no redeploy). Settings → AI coach accepts the same
seven providers. The key stays in that browser's localStorage, travels on the
`x-ai-keys` header, and is used for that request only — never stored, never
logged. Since v34 the browser also calls the provider DIRECTLY when the server
cannot (see below), which is why "Save & test" now runs two tests.
NO KEYS AT ALL. The browser bridge falls back to free community relays
(OVHcloud AI Endpoints → Kilo Gateway → Pollinations, all anonymous and
per-IP rate limited). Set AI_FREE_BRIDGE=off to forbid them deployment-wide;
the learner can also switch them off in Settings → AI coach.
The local ML engine (FSRS-lite, pace models, skip-risk, weekday propensity,
focus hours, Ebbinghaus decay) answers plan/progress questions even with zero
keys and zero network.
GET  /api/health    — database status + provider names + `serverProviderIds`
                      + `freeBridgeAllowed` + last result.
GET  /api/ai-status — same snapshot, cache-free, and it counts the caller's
                      browser keys as well as the deployment's.
POST /api/ai-status — LIVE SERVER-SIDE probe: one tiny real request to every
                      configured provider, reporting ok / latency / HTTP
                      status / reason (rejected key, retired model, rate
                      limit, timeout, network block). On a host with no
                      outbound network every leg reports `network` — that is
                      the host, not the key, which is what the browser-side
                      "Test from this browser" button in Settings is for.
The chat header shows Cloud AI · connected when a model answered, Cloud AI ·
free endpoint when a public relay did, Cloud busy · local engine answered when
the cloud failed, and Local mode only when nothing is configured and the free
relays are off. If every cloud leg fails, the local Wikipedia-backed tutor
answers instead of an apology, and the notice explains what to do next.
Optional tuning: AI_TIMEOUT_MS (default 24000), AI_PROVIDER_ORDER (a
comma-separated subset or reorder of the seven providers), AI_FREE_BRIDGE
(off forbids the free relays). Per-provider model pins: CEREBRAS_MODEL,
GROQ_MODEL, MISTRAL_MODEL, SAMBANOVA_MODEL, COHERE_MODEL, GEMINI_MODEL,
OPENROUTER_MODEL.
Gemini 3.1 TTS uses Google's current Interactions API and automatically falls
back to the device voice under a shared timeout.

Course-search telemetry is now OFF by default for privacy. It can be enabled
explicitly with ENABLE_COURSE_TELEMETRY=true; its report requires a bearer token
from COURSE_REPORT_TOKEN.

DATABASE
--------
`npm run build` runs `drizzle-kit push` first, so schema changes
(including advanced lesson metadata and source details) are applied
automatically on deploy. Existing plans are enriched non-destructively
when state is loaded; rebuilding is not required.

Re-running the Setup Wizard performs a HARD RESET of course data
(subjects, lessons, schedule, sessions, chat) — always behind a
confirmation dialog in the UI.

CONSISTENT SHIGUN VOICE
-----------------------
For the fastest and most identity-stable production voice, enable Google
Cloud Text-to-Speech and set `GOOGLE_CLOUD_TTS_API_KEY` in Vercel. Shigun
then uses deterministic Chirp 3 HD Kore, Aoede, or Charon voices in the
reply's language. Warm-server and client audio caches make repeated app
confirmations immediate.

`GEMINI_API_KEY` / `GOOGLE_API_KEY` remains a compatibility path. If a
configured Gemini TTS model has been retired or is unavailable, Shigun tries
an ordered compatible TTS model list immediately. If a studio request cannot
start promptly, the answer continues in the closest available device voice
instead of stopping on a “voice model unavailable” error; the chat shows a
clear non-error notice. One failed long-answer part switches the remaining
parts to that local voice, so every later part keeps flowing.

v34 BROWSER-DIRECT AI BRIDGE — "AI IS NOT CONNECTED", FIXED (this build)
------------------------------------------------------------------------
The complaint survived two server-side rewrites (v9's seven-provider chain,
v10's failure memory and hedging) because neither could fix the two situations
that actually produce it:

  1. THE DEPLOYMENT HAS NO KEY. A fresh Vercel deploy, a fork, a preview. No
     server-side code can invent one, so every open-ended question fell
     through to the on-device engine and the chat said "Full AI chat isn't
     connected yet".
  2. THE HOST HAS NO OUTBOUND NETWORK. Sandboxed previews (Arena/e2b, CI)
     allowlist egress: `api.groq.com`, `generativelanguage.googleapis.com`,
     `text.pollinations.ai` do not resolve at all. Every leg returned
     `network`, so EVEN A VALID KEY looked broken — and the Settings
     "Save & test" button agreed, because it probed from the server.

The learner's browser has neither problem: it is on the open internet, it is
the machine that holds the pasted key, and every provider used here accepts a
cross-origin POST. So the model call moved to the browser, while everything
that must stay server-side stayed there.

  src/lib/aiBridge.ts      NEW. The browser-side chain: seven own-key legs
                           (same hosts and current model ids as ai.ts) plus
                           three anonymous free relays — OVHcloud AI
                           Endpoints (2 req/min/IP/model, EU, documents that
                           it stores no user data), Kilo Gateway (~200
                           req/hr/IP, `:free` routes) and Pollinations
                           (1 req/15 s/IP, ships a React client so CORS is
                           guaranteed). Own keys are always tried first; a
                           free relay never receives a key. Per-tab failure
                           memory benches a CORS-blocked or offline host for
                           15 min, a rejected key for 10 min, a rate limit
                           for 60 s, so one dead relay costs one request.
                           `probeBridge()` is the honest connectivity test:
                           one tiny real request per leg, from this device.
  src/lib/chatClient.ts    NEW. One function decides the route:
                           deployment keys → server chain; else the browser
                           bridge (own key → free relay); else the on-device
                           engine. If the server chain fails mid-conversation
                           the browser retries the same question and the
                           better answer REPLACES the fallback in the
                           history, so one question never shows two answers.
  src/app/api/chat/route.ts  One route, three modes. `prepare:true` returns
                           the grounded prompt (identity, live ML signals,
                           curriculum grounding, bounded history — never a
                           key) after answering commands/greetings/status
                           itself, so nothing needless is bridged.
                           `directReply` finalises: same action extraction,
                           replanning, persistence and state refresh as a
                           server answer, with `replaceLast` overwriting the
                           fallback row. Rate limit 18 → 36/min because one
                           question now costs two calls.
  src/lib/ai.ts            `envConfiguredProviderIds()` (ids, not labels —
                           "Gemini" vs "Google Gemini" made a configured
                           deployment read as unconfigured),
                           `freeBridgeAllowed()` for AI_FREE_BRIDGE=off, and
                           self-status/local-fallback wording that now knows
                           whether the BROWSER can reach a model: "your key,
                           called from this device" / "a free community
                           endpoint" / "no AI is connected", instead of one
                           misleading sentence for all three.
  src/app/api/ai-status,   `serverProviderIds`, `serverProviders` and
  src/app/api/health       `freeBridgeAllowed` so the client can decide
                           without guessing.
  src/components/ChatPanel.tsx  The header says "Cloud AI · free endpoint"
                           when a public relay answered, and the strip below
                           the messages is either the old "Connect AI"
                           warning (nothing configured, relays off) or a
                           plain statement that a free relay is answering
                           with an "Add my key" button. A learner never
                           discovers by accident that a public relay saw
                           their question.
  src/components/AiKeyCard.tsx  Settings → AI coach: "Test from this browser"
                           beside the server-side test, a per-leg result list
                           with latency and reason, the free-relay switch
                           (Seg On/Off) with the privacy trade-off spelled
                           out next to it, and a stuck-off state when the
                           deployment banned the relays.
  src/app/globals.css      `.ai-connect-free` — the informational variant of
                           the existing connect strip (accent edge, dimmer
                           copy), so it never reads as the error it replaces.
  scripts/test-suite.ts    27 new checks (section 4d): route priority, own
                           keys before free relays, no key ever sent to a
                           relay, CORS-blocked legs benched and skipped,
                           rejected key costs one request, the switch and the
                           operator ban honoured with no reload, and the
                           prepare/finalise contract. 365 checks total.

Nothing here changes what a deployment WITH a key does: the server chain stays
first, and the bridge only runs when the server cannot answer.

v25 CSS + RESPONSIVE UI SYSTEM (this build)
--------------------------------------------
 - ONE PAIR OF STYLESHEETS: the ten patch sheets that had accumulated
   (study-planner-refresh, pastel-ui-system, study-planner-redesign,
   practical-enhancements, ui-polish, ui-polish-pass, ui-polish-landing,
   final-ui-fixes, task-actions-final, v24-theme-alignment) are merged into
   `src/app/ui-system.css`, imported once after `globals.css`. Every visual
   question now has one documented owner instead of "whoever wrote the last
   file", and the cascade result is preserved.
 - DEAD CSS GONE: 738 rules (441 fewer rules, ~82 KB) whose classes no
   longer existed in any component — old `.task-row` lists, `.planner-days`,
   kanban, voice panels, mini-timer stages and five superseded generations of
   the ⋮ popover — plus the empty `@media` shells they left behind.
 - ONE TYPE SCALE, NO OVERRIDE WAR: `.page-title` carried 13 font-size
   declarations and `.section-title` 6 across the sheets, four of them
   `!important`. Headings now read from the fluid `--fs-*` ramp
   (`--fs-h1/h2/h3`, `--fs-kpi`, `--fs-micro`), so no breakpoint needs a
   correction and the mobile-only clamps are deleted. Tracking is optical
   (-.022em) with `word-spacing` and `text-wrap:balance` rather than a
   blanket squeeze; the young/focused reading modes scale off the same token.
 - ONE SPACING SCALE: `--gap-page` for page stacks, `--pad-card` for card
   padding, `--pad-tight` inside heads, `--gap-cluster` for control groups.
   `.section-card` also declares `container: card / inline-size`, so a card
   responds to the width it actually got instead of the viewport.
 - THE CALENDAR IS DELIBERATELY RESPONSIVE, not a squeezed desktop grid:
   one month component (`.planner-cal`) shows a full month with subject-tinted
   chips on a wide card and a dots-only strip inside a narrow one
   (`@container card`), and phones get the month list with a tap-to-open day
   sheet. 320 / 375 / 390 / 414 / 480 / 768 / 1024 / 1280 / 1440 / 1920 all
   have a defined layout; 71 of the media queries use the shared breakpoints.
 - MOBILE TASK CARDS: height comes from content (no `min-height`), the lesson
   brief is visible and expandable instead of hidden, long titles wrap, and
   the kind rail, chip and dot all read `--task-lesson|recall|review|checkpoint`
   so a card cannot disagree with itself.
 - ONE ICON SET, ONE ACTION ROW: icon buttons carry `aria-label` + `title`;
   `[Clock in] [Done]` live in one labelled group outside the ⋮ popover, which
   keeps only Edit / Skip / restore — the primary verbs are no longer buried.
 - ZEN FOLLOWS THE THEME: the room, desk, lamp and ring are painted from
   `--zen-*` tokens derived from each theme's `--illustration-*` bridge, so
   light themes get a lit-paper room and dark themes a night one; the controls
   shrank to medium and use the same tokens. The daily quote rotates by date
   and is attributed.
 - DE-BLUR, PROPERLY: blur is now a material for FLOATING layers only (dock,
   top bar, modals, ⌘K, day sheet) — no in-flow surface that carries body
   text is frosted, half-pixel hover transforms were snapped to whole pixels,
   and stacked opacity layers were removed. That, not a contrast bump, is
   what cleared the smeared type.
 - FUNCTIONALITY PRESERVED: the real seconds-accurate Study Clock, calendar
   interactivity, working task buttons and theme switching all still run; the
   onboarding Back/Continue buttons are centred on their own labels with the
   step titles and `aria-busy` on the async action.
 - `!important` fell from 1107 to 803 declarations. The suite grew a v25
   contract block (242 checks total) that fails if a second `.page-title`
   size, a `var(--x, #hex)` fallback, a frosted text surface, a half-pixel
   transform or an undefined `--token` reference comes back.

v20 PRACTICAL REAL-WORLD ENHANCEMENT (this build)
--------------------------------------------------
 - "WHAT SHOULD I DO NOW?" IS THE HERO: the Overview opens with one clear
   answer — the single best next task (overdue → revision → today → weak
   subject → soon), its reason, a Start button, the NEXT task behind it,
   and how much of today remains. Live session controls (pause / clock out)
   sit on that same card while it records. Statistics (KPIs, charts, heatmap,
   coaching, intelligence) moved BELOW the plan so they support instead of
   dominate. One deterministic priority order (src/lib/prioritization.ts) is
   shared by the hero, the AI tutor's live context, and the command palette —
   the AI now recommends exactly what the hero shows.
 - BACKLOG RECOVERY, NOT GUILT: overdue work is framed as "N unfinished
   tasks — let's recover them". Four options: Do today (disabled when it
   would exceed daily capacity), Move to tomorrow, Spread across the week
   (per-day capacity-aware, oldest first, never crammed), or Let AI re-plan.
   A gentle pace suggestion (+30 min/day for N days) comes from
   src/lib/recovery.ts. Bulk re-dating happens in ONE API call
   (PATCH /api/tasks `moves`) — valid in demo and real DB modes.
 - QUICK ADD: capture a task in one breath — title, duration chips, optional
   subject, Today/Tomorrow, type — from the Overview's Today card or the
   Planner. Shared client-side validation (src/lib/quickAdd.ts) mirrors the
   server limits; the task lands in the plan immediately.
 - CLEANER TASK ROWS: every row is now [Done] / [Start] with everything else
   (Edit, Skip, Skip subject, Reopen) inside a real "⋯" menu — the old
   dead toggle on desktop is gone. Revision rating works identically on the
   Overview and Planner (one shared TaskActions component). Planner's kanban
   view was removed (duplicated the list's statuses; added visual noise).
 - AI SAFETY: the tutor's system prompt now states plainly that QUESTIONS
   about actions ("how do I re-plan?", "what is dark mode?") are answered,
   never executed; action tags require a clear imperative request. The regex
   command layer was already question-safe and is now pinned by tests.
 - MOBILE + ACCESSIBILITY: new surfaces use fluid sizing (clamp/minmax/
   auto-fit), the shared 44px --tap token on coarse pointers, safe-area-aware
   existing chrome, prefers-reduced-motion and prefers-contrast guards.
 - TESTS: suite grew 131 → 180. New sections: prioritization (overdue first,
   today > future, revision, weak subject, exclusions, determinism), quick
   add validation, backlog recovery maths (capacity-aware spread, gentle
   pace), timer lesson-switch banking, AI question-safety cases, and static
   responsive/accessibility CSS checks. `npm run check` and `npm run build`
   are green.

v19 COLLAPSED-RAIL + MOBILE BAR FIXES (this build)
--------------------------------------------------
 - ONE HIGHLIGHT IN THE COLLAPSED SIDEBAR: the brand tile used to be painted
   with the very same --accent-gradient the active nav pill uses (plus a
   spinning conic halo), so in the 78px icon rail it read as a second selected
   tab stacked above the real one. Collapsed, the mark is now quiet — neutral
   surface, muted glyph, hairline rim, no glow, halo off — riding the same
   --rail-dur curve as the labels. Expanded, it keeps the gradient tile,
   because there the wordmark sits beside it and it reads as branding. Only
   the active route is highlighted now.
 - ⌘K HINT NO LONGER CROPS OR OVERFLOWS: "Press ⌘K / Ctrl-K for commands"
   was a position:fixed strip pinned to the viewport corner, as wide as its
   text — the rail shrank to 78px and the hint did not, so it hung out over
   the workspace with words cut in half. It is now an ordinary row at the foot
   of the sidebar (width:100%, min-width:0, overflow:hidden), so the rail's
   own width IS the hint's width. Narrow sidebar → the sentence wraps onto a
   second line instead of being chopped; collapsed → the sentence clips away
   and a compact key chip takes its place, centred. The chip names the real
   modifier (⌘ on Apple keyboards, ⌃ elsewhere) via useSyncExternalStore, so
   there is no hydration mismatch; the sentence stays in the DOM for screen
   readers. Phones (the sidebar is the dock there) and installed windows keep
   hiding it, as before.
 - MOBILE TOP BAR: FLEX CONTRACT, NOT LEFTOVER CASCADE: the bar used to take
   its layout from whichever of four older @media(max-width:860px) blocks
   happened to win (padding flip-flopped 10/12/14px, display:flex came from a
   rule that also had to avoid resurrecting it on landscape phones, and the
   streak chip was unbounded against the page title). It now states the whole
   contract in one place: display:flex + space-between + align-items:center on
   the container, logo and page title as ONE group (.mh-brand) on a 12px gap,
   the 26px logo tile and the streak chip hard-bounded (flex:0 0 …, max-width/
   max-height, min-height:26px, nowrap) so neither stretches nor squashes on
   narrow viewports, and padding: 0 16px raised to the safe area on notched
   devices. The landscape-phone "no bar" rule is restated after it, since the
   layer now owns display.
 - Design notes: docs/design/v19-rail-hint-appbar.md. deploy-package/ re-synced
   to a byte-exact mirror of src/ as usual.

v18 FIXES
---------
 - DEPLOY-PACKAGE RESYNCED AGAIN: the drag-and-drop deploy folder had
   drifted far behind src/ (it predated the study-clock auto-completion,
   the one-per-row planner list, the sidebar rail, the rebuilt mobile
   top bar and the DB-less route guard). Deploying it shipped months of
   stale behaviour — exactly the "I reported this and it's still not
   fixed" symptom. It is again a byte-exact mirror of src/, and the
   bundle README now matches the live app.
 - WEEKLY CHECKPOINT TITLES NEVER SHOW "#0": checkpoint-title
   normalisation is now one shared helper (src/lib/client.ts →
   normalizeCheckpointTitle) used by both the Overview and the Planner.
   Every legacy form — "Weekly Checkpoint Test #0", "Weekly Checkpoint
   · Test #0", unspaced later numbers — renders as the canonical
   "Weekly Checkpoint · Test #N" (1-based). Covered by test-suite
   section 5c.
 - README AI DOCS MATCH THE APP: the guide no longer sends you to set
   GROQ/XAI/OpenRouter keys or a removed Settings → AI Connectivity
   panel. It documents the real five-provider chain (Cerebras →
   Mistral → SambaNova → Cohere → Gemini), the local ML engine, and
   the health endpoints that actually exist.
 - PREVIEW MODE IS FULLY INTERACTIVE: with SPP_DEMO_DATA=1 and no
   database, every API surface (study clock sessions with the same
   auto-completion rule, task Done/Skip/Edit/Add/Delete, settings,
   subjects, replan, setup wizard) now answers through an in-memory
   demo layer instead of erroring — a preview visitor can exercise the
   real flows end to end without PostgreSQL. Covered by test-suite
   section 5d.

v16 UI POLISH (this build)
--------------------------
 - TRUE LIST VIEWS: Planner day blocks and the Overview's "Today's Study
   Load" are real lists again — rows span the panel edge to edge, divided
   by clean hairlines instead of each row wearing its own card border,
   shadow and rounded corners.
 - ALIGNED ROW CONTROLS: every task row's buttons share one height, the
   clock button keeps a stable width so the CTA column never jumps, and
   Done owns the right edge. On phones the visible actions (Done · Clock
   in/out · ⋯) form one even, full-width 3-column bar, with Edit / Skip
   subject / Skip revealed by ⋯ wrapping into tidy rows underneath.
 - CALENDAR COLOUR EVERYWHERE: each calendar day with tasks is softly
   tinted with its first subject's colour, and on phones the coloured
   topic pills are visible again (they used to be hidden entirely, which
   left a plain number grid) — the month now reads at a glance on any
   device, and tapping a day still opens the full task sheet.
 - FOCUS + CLOCK IN ONE TAP: "Start Focus" now also starts the study
   clock (attaching the first pending task of the day when possible), and
   Zen mode's primary button is "Start Focus + Clock" — no more juggling
   two timers. Breaks (short/long) never touch the clock; Pause and
   Clock Out stay independent.
 - BRANDED FAVICON: the browser tab now shows the Study Planner Pro
   logo (the layered chevron mark on the gradient tile) instead of the
   default globe — `src/app/icon.svg`, served automatically by Next.js.

v15 STUDY CLOCK AUTO-COMPLETE (this build)
------------------------------------------
 - DONE WITHOUT THE DONE BUTTON: the study clock watches every task's
   planned minutes. The moment your logged time reaches the plan — a
   15-minute recall after 15+ minutes, a 45-minute lesson after 45+ — the
   task is marked complete automatically. No more studying for 28 minutes
   on a 15-minute recall and still seeing it "pending".
 - NOTIFIED, THEN NEXT: completion fires a success toast ("…complete —
   28m logged ≥ 15m planned") and, while the clock is still running on
   that task, the clock rolls itself forward to the next pending task, so
   every minute you keep studying lands on the right lesson. If the task
   was the last of the day, it says so. Nothing is re-marked once a task
   is done or skipped, and the mastery/memory-model bookkeeping is shared
   with the manual Done flow, so both paths behave identically.
 - WORKS OFFLINE TOO: the same logic lives in the server's session-log
   route, so auto-completion applies to every minute that syncs from the
   device queue, not just live ticks.

v14 LIQUID GLASS DELUXE (this build)
------------------------------------
 - MATERIAL TIERS, NOT BLUR EVERYWHERE: cards (tier 1) paint their glass as
   background LAYERS — pointer specular → gloss → gradient accent edge →
   corner wash → tint body — at a 90%/84% tint floor (88%/80% on dark
   themes) so text never loses contrast. Only genuinely floating layers
   (tracker bar, command palette, toasts, chat sheet, sidebar dock) get the
   refractive rim: a masked, blurred ring inside the edge that bends the
   content sliding underneath it. Phones thin the rim to 7px and drop every
   float to a single 14px blur budget; the docked desktop sidebar skips it.
 - ONE POINTER LIGHT: a single delegated rAF listener feeds --spec-x/-y into
   whatever panel the cursor is over (and --px/--py into a button), so the
   specular pool and the press glow are one lighting system instead of five
   hover gradients. Coarse pointers never pay for it.
 - LIQUID NAV: the active-destination pill is measured in JS and travels and
   resizes between items (spring on transform/width/height) instead of five
   backgrounds blinking; it follows the collapsed rail, the phone dock,
   rotation and font scaling. `.lg-nav-ready` is only set after a real box
   was measured, so if the effect never runs the previous look is untouched.
 - SCROLL-AWARE CHROME: the sticky bar is opaque at the top of the page and
   frosts to ~86% tint + 20px blur over the first 76px of scroll
   (animation-timeline: scroll — zero JS, zero scroll listeners); below-fold
   panels reveal themselves on their own view timeline; the canvas mesh
   parallaxes one cell behind the page.
 - GRADIENT LANGUAGE: the accent edge is now one class
   (`accent-edge` + `--edge`) replacing four different inline borderLeft
   recipes; washes (`--wash-accent|ai|success`) replace flat tint fills;
   gradient hairlines under section titles, day heads and the phone header
   draw a real 1px contact instead of a solid rgba line.
 - ALIGNMENT + PADDING: one card rhythm everywhere via `.section-card`,
   `.section-head`, `.section-title`, `.panel-lead`, `.stat-big` and the
   `--sp-1..5` scale; ~60 inline style declarations across the six views
   became semantic classes (only genuinely data-driven values — a colour, a
   bar width, a chevron angle — are still inline).
 - RESPONSIVE FOR ALL DEVICES: KPI/subject/kanban grids are intrinsically
   sized (`auto-fit` + `min(…, 100%)`), cards answer their OWN width through
   `container: card / inline-size` (2-up KPI and a wider progress bar inside
   a narrow sheet, 3-up on wide panels), the 861–1180px band restores the
   two-column dash when the rail is collapsed, the Planner goes 2-up at
   ≥1120px and 3-up at ≥1600px, heat cells and the day progress bar scale per
   breakpoint, and touch gets `min-height:var(--tap)` controls with the press
   glow, sheen, specular pool and hover lift switched off.
 - RESPONSIVE FINISH: safe-area padding for notched phones in landscape,
   `100dvh`, `overscroll-behavior` and `touch-action:manipulation`, an
   `env()`-aware PWA dock height, hover-only affordances (chevrons, row
   actions) permanently shown on touch, and a 2-up KPI row at ≤479px that
   goes 1-up below 340px.
 - GUARDED AS ALWAYS: every modern feature sits behind `@supports`
   (mask-composite, animation-timeline, interpolate-size, backdrop-filter),
   `@media (hover:hover)` or `@media (prefers-reduced-motion: no-preference)`;
   `prefers-reduced-motion`, `prefers-reduced-transparency`,
   `prefers-contrast`, `forced-colors` and print all get explicit exits.
   All seven themes and both `mode-focused` / `mode-young` densities keep
   working — the whole layer is appended CSS, no earlier rule was edited and
   no data, scheduling or AI behaviour changed (101/101 logic tests pass).

v10 FIXES (this build)
----------------------
 - FULL UI RESTYLE ("ditto" of the Task Manager Pro design language):
   new light design tokens (warm #F6F5FA canvas, violet-iris accent,
   layered soft shadows, larger 8/12/16/22 radii), refined sidebar,
   tracker bar, buttons (gradient + glow), inputs, cards and toasts.
 - ONBOARDING REBUILT: the dot progress bar is now a labeled step rail
   (You · Level · Course · Details · Syllabus · Style · Rhythm · Review)
   with connectors and checkmarks; step 1 is a warm hero ("Set up a
   study workspace that fits your day") with the three feature bullets
   (Clear priorities / A realistic week / Private local data) and a
   privacy footer line; buttons are Back / Continue.
 - All six themes keep working; the rail and hero are token-driven, so
   they adapt to every theme automatically.

v11 POLISH (this build)
-----------------------
 - STUDY-HOURS SLIDER REBUILT: 18px track with a smooth animated accent
   gradient fill (registered @property --ob-range-fill, spring-ish
   cubic-bezier fill transition) and a 26px gradient orb thumb with a
   surface ring, layered glow, hover grow, active press halo and a clear
   focus ring. The slider finally takes priority over the generic field
   input styles (specificity fix), so the custom track actually renders.
 - PRESET CHIPS: the active chip is now a filled accent gradient pill
   with white text and a soft glow; hover lifts and tints chips with
   the accent.
 - ALL-THEME ONBOARDING: white-mix gradients replaced with token-driven
   mixes (course list, subject grid, note panel), theme-safe shadows,
   feature-row hover lift, and dark/obsidian/nebula overrides for card
   borders, feature rows, rail connectors and labels. Verified by a
   7-theme headless sweep: contrast, rail, chips and slider render
   correctly in every theme (light, silver-lavender, mint, sunset,
   dark, obsidian, nebula).

v8 FIXES (this build)
---------------------
 - GROQ CONNECTIVITY RESTORED. Groq retired llama-3.3-70b-versatile and
   llama-3.1-8b-instant on 2026-08-16; the app was pinned to them, so every
   Groq call died with "model not found" and chat fell to the unreachable-
   cloud message. Groq now defaults to openai/gpt-oss-120b with automatic
   fallbacks (qwen/qwen3.6-27b, gpt-oss-20b).
 - EVERY PROVIDER HAS A MODEL FALLBACK CHAIN + sticky success (the last
   working provider/model is retried first), one bounded retry for transient
   network/5xx errors, and quote-stripped env keys (a pasted `"key"` used to
   look exactly like an invalid key).
 - GROK (xAI) IS NOW A FIRST-CLASS PROVIDER via XAI_API_KEY alongside Gemini,
   Groq and OpenRouter. The invalid OpenRouter "openrouter/free" slug (which
   could 400 the whole request) was replaced with real fallback models.
 - CONNECTIVITY IS DIAGNOSABLE FROM THE APP: POST /api/ai-status probes every
   configured provider live (latency, HTTP status, reason), and Settings →
   AI Connectivity shows it with a one-tap test. Chat degraded toasts now say
   WHICH provider failed and WHY instead of a generic timeout line.
 - KEYLESS ANSWERS UPGRADED: the Wikipedia tutor uses progressive multi-probe
   search (full question → leading keywords), skips disambiguation pages, and
   strips conversational filler, so questions like "define the ukraine and
   russia conflict and how it will solve" now return a real structured lesson
   even with zero AI keys.
 - DEPLOY-PACKAGE RESYNCED: the drag-and-drop deploy folder had drifted from
   src/ (missing voice pieces, older chat/health/AI files) — deploying it
   shipped stale behaviour. It is now a byte-exact mirror of src/.
 - UI/UX (all devices): roomier desktop chat panel (480px, near-full height),
   near-full-screen phone sheet with landscape mode, auto-growing composer
   with Shift+Enter, copy-answer buttons, live provider status chip in the
   chat header, keyboard focus rings everywhere, fluid page titles, stronger
   contrast mode, comfier mobile dock targets, and full-bleed toasts.

v7 FIXES (this build)
---------------------
 - SHIGUN ALWAYS SHOWS A REPLY. The chat UI used to replace the conversation
   with whatever /api/chat returned in `state.messages`. If the database was
   down, unconfigured, or the second state reload fell back to an empty
   guest account, the reply was generated but never painted — it looked like
   Shigun was ignoring you. The API now always attaches the user+assistant
   turn to the returned state, and the client treats `reply` as source of
   truth. A real onboarded plan is never overwritten by the empty fallback.
 - ENGLISH LOCAL LESSONS NO LONGER CRASH. teachFromKnowledge looked up
   HEADERS.en, which did not exist, so every English (and Marathi/Nepali)
   Wikipedia-backed answer threw. That 500'd the chat route on keyless
   deployments. English headers are in place; other missing languages fall
   back instead of throwing.
 - Fallback learner state now matches the AppState the UI actually renders
   (pomodoro, studyDays, course, …), so a degraded chat response cannot
   crash Settings or wipe the tracker.

v6 FIXES (this build)
---------------------
 - QUESTIONS ARE NEVER MISTAKEN FOR COMMANDS. "how do I replan?", "should I
   replan?", "what is the dark theme?", "how do I stop the timer?" and other
   questions were being EXECUTED by the regex command layer (an unintended
   replan, theme change, or timer stop) instead of answered. The command
   parser now recognises question phrasing in English and Indic scripts and
   only executes clear imperative commands ("start timer", "open planner").
   "Can you open the planner?" still navigates — it is harmless and explicit.
 - OFF-TOPIC QUESTIONS NO LONGER GET RANDOM LESSONS. "what is the capital of
   France?" used to be answered with whatever lesson was next in the plan.
   The curriculum fallback now only answers when the question is genuinely
   about the learner's own plan ("today's lesson", "give me practice
   questions", "explain my weakest topic"); everything else goes to the
   Wikipedia-backed tutor or the cloud model.
 - "CAN YOU SPEAK X?" WORKS IN YOUR OWN SCRIPT. A Hindi learner asking
   "क्या तुम हिंदी बोल सकती हो?" (or Bengali, Urdu, Marathi, ...) now gets
   the deterministic same-language capability reply instead of falling
   through to English. Thai and English capability replies were added.
 - BARE PAGE NAMES NAVIGATE. Saying "planner", "home", "subjects" alone now
   opens that page; previously only slash-prefixed forms worked.
 - CLEAR "LOCAL MODE" MESSAGES. When no AI key is configured (or the cloud
   tutor is down), the tutor now explains exactly that and lists what it CAN
   still do, instead of an unexplained generic line.
 - THE APP BUILDS AND BOOTS WITHOUT DATABASE_URL. A missing DATABASE_URL no
   longer crashes `next build` or every API route at import time: the app
   loads, /api/health reports "database: unavailable", and routes return a
   clear 503 JSON with setup guidance until the variable is added.
 - VOICE QUALITY FALLBACKS: Nepali was missing from the TTS language
   directions; the Gemini TTS Interactions request now sends the current
   Api-Revision header; native device-voice preferences were added for
   Marathi, Bengali, Tamil, Telugu, Kannada, Malayalam, Gujarati, Punjabi,
   Odia, Urdu and Arabic so the offline fallback picks a matching voice.
 - MULTILINGUAL LOCAL TUTORING (no AI key needed): "आज क्या पढ़ना है?",
   "মেরা প্রগ্রেস কেমন?" and their equivalents in Bengali, Tamil, Telugu,
   Kannada, Malayalam, Gujarati, Punjabi, Odia, Urdu and Arabic now get
   INSTANT data-driven answers (today's plan, progress, weakest subject,
   overdue count) in the learner's own language. Concept questions are
   looked up on that language's Wikipedia (hi/bn/ta/te/kn/ml/gu/pa/or/ur/ar
   and more, with an English fallback), and the lesson structure headers
   switch to the learner's language. Indic question words ("क्या है",
   "সমঝাও", ...) are stripped from search queries so results stay precise.

v5 FIXES (this build)
---------------------
 - START NOW BECOMES CLOCK OUT, IN THE SAME PLACE. The "Up next" card on
   the Overview shows a live timer with Pause/Resume and a red Clock Out
   button while that lesson is being timed. Every task row (Overview +
   Planner) does the same: "Clock in" becomes a pulsing red "Clock out"
   for the running lesson, and "Switch" for other lessons (banking the
   open minutes first). Re-tapping Start can never silently restart — or
   eat unlogged minutes of — a running session anymore.
 - Pause no longer resets the visible timer: the clock freezes, minutes
   are banked, and Resume continues the same visible session. The
   tracker bar gained a proper "Paused" state with Resume + Clock Out,
   and hides its info chips while recording so the stop control owns the
   row on phones.
 - The running session also shows in the browser tab title (⏱ 12:34 ·
   lesson name) and Zen mode now has a Clock Out button.
 - Multilingual voice: the mic understands start/stop/pause/resume/break/
   navigation commands in Hindi, Marathi, Hinglish, Bengali, Tamil, Telugu,
   Kannada, Malayalam, Gujarati, Punjabi, Odia, Urdu, Arabic, French and
   Spanish — and CONFIRMS them in the same language, spoken aloud. There is
   NO language picker: Shigun assesses the language from your speech itself
   and answers in that same language automatically.
 - Voice-aware grammar: replies follow the selected voice. Pick a female
   voice and Shigun uses feminine forms ("कर सकती हूँ"); pick the male
   voice and it uses masculine forms ("कर सकता हूँ") — in Hindi, Urdu,
   Marathi, Punjabi and every language the tutor writes.
 - Long answers read in full and FLOW: replies are split only when they are
   genuinely too long for one TTS request (never after every "."), and the
   next three parts are warmed while the current one plays. A studio outage
   switches the rest of that answer to local speech with no repeated timeout.
   The header remembers a 1×, 1.15×, 1.3×, or 1.45× playback speed. Tapping
   the mic while Shigun speaks stops the voice instantly.
 - ML: the exam-readiness projection is now anchored to the minutes you
   ACTUALLY study per active day (trimmed mean over 28 days, shrunk
   toward your target until 10 active days of evidence), and the
   peak-focus model recency-weights sessions (30-day half-life) so it
   follows your current habits, not last semester's.
 - Database: composite indexes added for the hot paths (tasks by
   user+date+position, topics by subject+position, chat history by
   user+id).

v4 FIXES (this build)
---------------------
 - Mobile voice transcripts use overlap-aware deduplication and
   single-utterance recognition; cumulative Android/WebKit result
   batches can no longer repeat words or submit stale sessions
 - Shigun uses fixed Gemini voice profiles (Kore, Aoede, Charon) on
   every platform, with Web Audio pre-authorized from the mic gesture
 - Playback has cancellation generation guards, preventing cancelled
   native utterances from restarting through late onerror callbacks
 - Curriculum lessons now include prerequisites, key concepts, depth,
   measurable higher-order outcomes, applied practice, and curated
   official/primary/reference source details with links
 - Verified catalog unit counts remain locked; cloud curricula are
   filled to the canonical count if a provider stops early
 - Older saved plans receive advanced metadata without losing titles,
   mastery, completion history, or timing
 - Duplicate chat submission and replan races are blocked synchronously;
   a spoken message or rebalance action can execute only once at a time
 - Shigun now answers language-capability requests deterministically in
   Bengali, Hindi, Marathi, Tamil, Telugu, Kannada, Gujarati, Punjabi,
   and Arabic instead of incorrectly claiming English/Hindi-only support
 - Mobile chat is a header-anchored conversation sheet with a scrim,
   activity states, assistant avatars, live voice waveform, improved
   composer, horizontal prompts, and reduced-motion accessibility
 - Voice identity is locked across short commands and long explanations;
   synthesis preparation is shown separately from actual playback
 - Common plan/progress questions bypass the LLM and answer instantly from
   live data; cloud provider retries share one bounded 15-second budget
 - Lesson questions inject the matching curriculum summary, concepts,
   outcomes, practice task, and approved sources into the tutor context,
   reducing generic answers and invented citations
 - The scheduler no longer fills spare time with endless “Mastery Cycle”
   cards: applied practice stays inside each lesson, extra practice cards are
   reserved for practice/mock-heavy plans, and second recall cards target only
   hard or explicitly weak material

v3 FIXES
--------
 - Full course name + tracker task title never truncate
 - 40px sidebar collapse toggle with smooth icon-rail animation
 - Mic pre-warm + watchdog + confidence-scored transcripts (review
   before send when unsure) — no more multi-tap retries
 - Full-screen mobile chat sheet; redesigned bottom-anchored toasts
 - Time tracking accurate to the minute with client-timezone dates
 - Re-run Setup wipes ALL previous data (zero carryover)
 - DB indexes + SQL-aggregated streak for scale without lag
