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
Use GEMINI_API_KEY, GROQ_API_KEY, XAI_API_KEY (Grok) and/or OPENROUTER_API_KEY.
Never put a secret in a NEXT_PUBLIC_* variable. Providers fail over inside one
bounded request — Gemini → Groq → Grok → OpenRouter — and each provider now has
a MODEL FALLBACK CHAIN, because model IDs retire (Groq shut down
llama-3.3-70b-versatile and llama-3.1-8b-instant on 2026-08-16, which silently
killed deployments pinned to them; the default is now openai/gpt-oss-120b).
The last provider/model that answered is remembered and tried first.
GET  /api/health   — database status + configured provider names + last result.
GET  /api/ai-status — same snapshot, cache-free.
POST /api/ai-status — LIVE probe: one tiny real request to every configured
                     provider, reporting ok / latency / HTTP status / reason
                     (rejected key, retired model, rate limit, timeout, network
                     block). The same test is available in-app under
                     Settings → AI Connectivity → “Run connectivity test”.
The chat header also shows which providers are live. If every cloud fails, the
local Wikipedia-backed tutor (now with progressive multi-probe search) answers
instead of an apology, and the toast explains exactly which provider failed why.
Optional tuning: AI_TIMEOUT_MS (default 24000) and AI_PROVIDER_ORDER.
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
