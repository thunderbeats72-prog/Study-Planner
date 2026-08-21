DRAG & DROP DEPLOY PACKAGE — Study Planner Pro (v5 · Clock-Out + Multilingual Voice Build)
============================================================================

This folder contains the complete, build-verified source of the app.
Everything in here goes to the SAME location in your repository.

WHAT'S FIXED IN THIS BUILD (v5)
 1. Start → Clock Out in the SAME place: the "Up next" card and every
    task row turn into a live "Clock out" control (with a running
    timer) while that lesson is being timed. No more hunting for a stop
    button after starting.
 2. Tapping Start again can never restart a running session — your
    unlogged minutes are banked first. Switching lessons saves the open
    minutes and continues on the new lesson.
 3. Pause freezes the visible timer (no more resetting to 00:00);
    Resume continues the same session; the tracker bar has a proper
    Paused state; the running clock shows in the browser tab title;
    Zen mode has a Clock Out button.
 4. Voice commands work in Hindi, Marathi, Hinglish, Bengali, Tamil,
    Telugu, Kannada, Malayalam, Gujarati, Punjabi, Odia, Urdu, Arabic,
    French, Spanish — and confirmations answer in YOUR language, aloud.
 5. 🌐 mic language picker with 26 languages (Auto detects from speech;
    a pinned choice is remembered).
 6. Long answers are spoken in full, part by part, with progress
    ("part 2/5"). Tap the mic anytime to stop the voice.
 7. Readiness projection learns the minutes you actually study per day;
    peak-focus hours recency-weight your recent sessions.
 8. More database indexes on every hot query path.
 9. Mobile: while recording, the tracker strip hides its info chips and
    shows big Pause/Break/CLOCK OUT controls; the stats strip swipes
    horizontally instead of stacking.

WHAT WAS FIXED IN v4 (previous)
 1. Sidebar course name ("B.Com (Honours) (Marketing and Banking)")
    now wraps fully — never cut off.
 2. Tracker/header task title ("Principles of Marketing: Introduction
    to Marketing Principles") displays in full (wraps to 2 lines).
 3. Sidebar collapse toggle: a proper 40px round button (top-right of
    the sidebar). Click it and the sidebar smoothly shrinks to an
    icon-only rail; click again to expand. Choice is remembered.
 4. Mic first-tap fix: the microphone permission is pre-warmed before
    SpeechRecognition starts, plus watchdog + silent retry logic —
    no more "2-3 taps before it listens".
 5. Voice accuracy: transcripts now carry a confidence score.
    Confident speech auto-sends; unsure speech is placed in the input
    box for you to review/edit before sending.
 6. Chat is a true full-screen bottom sheet on phones (grab handle,
    safe-area padded input, 44px+ tap targets, no iOS zoom).
 7. Notifications redesigned: structured cards (icon + message +
    close + progress bar). Bottom-right on desktop, bottom-center on
    phones — never an ugly pill at the top of the screen.
 8. Time tracking accuracy: 13.5 minutes now logs and displays as
    exactly 13.5. Sessions are dated with YOUR timezone (the server
    can no longer shift them to another day), and time is banked the
    instant the tab hides, so nothing is lost.
 9. Re-run Setup = hard reset: subjects, lessons, schedule, logged
    minutes, chat history and streak are all wiped (with a clear
    confirmation dialog first). New setup starts from zero.
10. Database optimization: indexes on every hot query path; streak
    computation now aggregates in SQL (one row per day) instead of
    scanning the whole history every minute.
11. Responsive across everything: 320px phones → Galaxy S24 → tablets
    → desktops → 4K TVs, with safe-area and foldable support.
12. Permanent mobile transcript fix: cumulative Android/WebKit result
    batches are overlap-deduplicated and stale sessions cannot submit.
13. One Shigun voice everywhere: replies use fixed Gemini TTS profiles
    instead of unrelated phone/desktop operating-system voices.
14. Advanced curricula: every lesson now carries prerequisites, depth,
    key concepts, higher-order outcomes, applied practice, and curated
    source details/links. Existing plans are enriched without a reset.
15. Chat and replan actions are single-flight: double taps cannot add the
    same turn twice or launch two competing schedule rebuilds.
16. Shigun answers Bengali/Bangla and other supported-language requests
    correctly; mobile chat now has live voice visuals, assistant avatars,
    a cleaner composer, and a smoother full conversation sheet.

DEPLOY STEPS (GitHub web — no git commands needed)
 1. In your repo, open "Add file" → "Upload files".
 2. Drag in:  tsconfig.json  AND the  src  folder (from this package).
 3. GitHub merges them into place, replacing the existing files.
    Commit directly to main.
 4. (One-time tidy-up, optional) Delete the old deploy-package folder
    via the "..." menu. The build passes either way — tsconfig.json
    excludes it.
 5. Vercel auto-deploys. When it's green, hard-refresh the site
    (Ctrl+Shift+R on desktop; close/reopen the tab on your phone).

VERIFIED
 - TypeScript strict: clean (tsc --noEmit passes)
 - Production build: passes (next build)
 - The package mirrors src/ exactly — nothing else is needed.

NOTES
 - For the fastest and most consistent voice, enable Google Cloud
   Text-to-Speech and set `GOOGLE_CLOUD_TTS_API_KEY` in Vercel. Gemini
   remains a pinned-model compatibility path. Named voices never silently
   switch to a different model or operating-system voice.
 - Voice recognition is browser-native (Web Speech API): works best in
   Chrome/Edge on desktop and Android. iOS Safari support depends on
   the OS version. Text chat always works everywhere.
 - If your Vercel DB already has the old tables, the new indexes and
   curriculum metadata columns are created automatically by
   `drizzle-kit push` during the build.
