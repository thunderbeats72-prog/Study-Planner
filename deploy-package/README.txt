DRAG & DROP DEPLOY PACKAGE — Study Planner Pro (v3 · All-Fixes Build)
======================================================================

This folder contains the complete, build-verified source of the app.
Everything in here goes to the SAME location in your repository.

WHAT'S FIXED IN THIS BUILD
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
 - Voice recognition is browser-native (Web Speech API): works best in
   Chrome/Edge on desktop and Android. iOS Safari support depends on
   the OS version. Text chat always works everywhere.
 - If your Vercel DB already has the old tables, the new indexes are
   created automatically by `drizzle-kit push` during the build.
