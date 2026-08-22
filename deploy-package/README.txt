DRAG & DROP DEPLOY PACKAGE — Study Planner Pro (v8 · Connectivity + All-Device UX Build)
========================================================================================

This folder is a BYTE-EXACT MIRROR of the repository's `src/` folder.
Everything in here goes to the SAME location in your repository:

  1. Open the repo on GitHub → "Add file" → "Upload files".
  2. Drag in `tsconfig.json` (root of this package) and the whole `src`
     folder from this package.
  3. Commit to main → Vercel auto-deploys.
  4. Hard-refresh (Ctrl+Shift+R; on phones close and reopen the tab).

  IMPORTANT: after uploading, verify in Vercel → Settings → Environment
  Variables that at least one AI key is set for Production:
     GEMINI_API_KEY   (Google AI Studio)
     GROQ_API_KEY     (console.groq.com — default model openai/gpt-oss-120b)
     XAI_API_KEY      (console.x.ai — Grok)
     OPENROUTER_API_KEY
  Then Redeploy so the new variables reach the running app, and open
  Settings → AI Connectivity → "Run connectivity test" to confirm every
  provider answers with a green dot and a latency number.

WHAT'S FIXED IN THIS BUILD (v8)
 A. GROQ IS ALIVE AGAIN. Groq retired llama-3.3-70b-versatile and
    llama-3.1-8b-instant on 2026-08-16; the app was pinned to them, so
    every Groq call failed and chat showed "the cloud tutor was
    unreachable". Groq now defaults to openai/gpt-oss-120b with automatic
    fallbacks (qwen/qwen3.6-27b, openai/gpt-oss-20b).
 B. EVERY PROVIDER (Gemini → Groq → Grok → OpenRouter) has a MODEL
    FALLBACK CHAIN, a sticky "last one that worked" preference, one
    bounded retry for transient network/5xx errors, and quote-stripped
    env keys.
 C. GROK (xAI) support added via XAI_API_KEY. The invalid OpenRouter
    "openrouter/free" slug that could 400 the whole request is gone.
 D. CONNECTIVITY IS DIAGNOSABLE FROM THE APP: POST /api/ai-status probes
    every configured provider live (latency, HTTP status, reason —
    rejected key vs retired model vs rate limit vs timeout vs network
    block), and Settings → AI Connectivity shows it with one tap. The
    chat header shows which providers are live.
 E. KEYLESS FALLBACK UPGRADED: the Wikipedia tutor uses progressive
    multi-probe search and skips disambiguation pages, so general
    questions ("define the ukraine and russia conflict…") now return a
    real structured lesson even with zero AI keys.
 F. UI/UX on all devices: roomier desktop chat (480px, near-full
    height), near-full-screen phone chat sheet + landscape mode,
    auto-growing composer with Shift+Enter, copy-answer buttons, live
    provider status chip, keyboard focus rings, fluid titles,
    prefers-contrast support, comfier mobile dock, full-bleed toasts.

This package was regenerated directly from `src/` — if you ever change
`src/`, re-copy it here before drag-and-drop deploying, or upload `src/`
itself. Deploying a stale copy of this folder is how "I deployed the fix
but nothing changed" happens.
