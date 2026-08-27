STUDY PLANNER PRO — Repository Guide
====================================

THE SOURCE OF TRUTH IS THE `src/` FOLDER
----------------------------------------
Everything the app actually runs lives in `src/`:

  src/app/page.tsx            app shell: sidebar, tracker bar, toasts
  src/app/layout.tsx          viewport / safe-area config
  src/app/globals.css         ALL styling (themes, responsive, sheets)
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
The easiest deploy path is drag-and-drop through the GitHub website:

  1. Open the repo on GitHub → "Add file" → "Upload files".
  2. Drag in `tsconfig.json` and the `src` folder from
     `deploy-package/` (it mirrors this repo's fixed source).
  3. Commit to main → Vercel auto-deploys.

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
Use CEREBRAS_API_KEY, MISTRAL_API_KEY, SAMBANOVA_API_KEY, COHERE_API_KEY
and/or GEMINI_API_KEY. Never put a secret in a NEXT_PUBLIC_* variable.
You do NOT need all five — even one key works. Providers fail over inside one
bounded request in priority order: Cerebras → Mistral → SambaNova → Cohere →
Gemini — and each provider has its own MODEL FALLBACK CHAIN, because model IDs
retire. The last provider/model that answered is remembered and tried first.
Old GROQ_API_KEY / XAI_API_KEY / OPENROUTER_API_KEY values are ignored — those
providers have been removed from the app (delete them or leave them, it makes
no difference). The local ML engine (FSRS-lite, pace models, skip-risk,
weekday propensity, focus hours, Ebbinghaus decay) answers plan/progress
questions even with zero keys.
GET  /api/health   — database status + configured provider names + last result.
GET  /api/ai-status — same snapshot, cache-free.
POST /api/ai-status — LIVE probe: one tiny real request to every configured
                     provider, reporting ok / latency / HTTP status / reason
                     (rejected key, retired model, rate limit, timeout, network
                     block).
The chat header shows Ready when cloud tutoring is available, Local mode
otherwise. If every cloud fails, the local Wikipedia-backed tutor (now with
progressive multi-probe search) answers instead of an apology, and the toast
explains exactly which provider failed why.
Optional tuning: AI_TIMEOUT_MS (default 24000) and AI_PROVIDER_ORDER (a
comma-separated subset or reorder of the five providers).
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
