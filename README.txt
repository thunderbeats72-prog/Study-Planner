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
Use GEMINI_API_KEY, GROQ_API_KEY, and/or OPENROUTER_API_KEY. Never put a secret
in a NEXT_PUBLIC_* variable. Providers fail over inside one bounded request;
if all are unavailable, saved curriculum metadata and the local knowledge tutor
answer instead of leaving chat spinning. GET /api/health reports database status,
configured provider names, and the last sanitised provider result — never keys.
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
