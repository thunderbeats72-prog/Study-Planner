STUDY PLANNER PRO — DEPLOY PACKAGE
==================================

This folder is an exact mirror of the repository's `src/` directory and the
root `tsconfig.json`, prepared for GitHub web uploads.

DEPLOY WITHOUT COMMANDS
-----------------------
1. In GitHub, choose Add file → Upload files.
2. Upload `deploy-package/tsconfig.json` and the `deploy-package/src` folder
   into the repository root, replacing files when GitHub asks.
3. Commit to the tracked app branch, then wait for the deployment to finish.
4. Hard-refresh the browser after the deployment.

IMPORTANT VOICE GUARANTEE
-------------------------
Ava, Emma, and Andrew are identity-locked Microsoft Edge multilingual neural
voices. A selected voice is never silently replaced by Gemini, Chirp, or a
phone/device speaker. If the neural service cannot be reached, the text reply
remains visible and Play retries the same selected persona.

AI CONNECTIVITY
---------------
The chat service needs a working `DATABASE_URL` for account, plan, and chat
history. For full open-ended AI answers, configure at least one server-side
provider key: `OPENROUTER_API_KEY`, `GEMINI_API_KEY`, `GROQ_API_KEY`,
`OPENAI_API_KEY`, or `ANTHROPIC_API_KEY` (Claude is optional). OpenRouter is
tried with paid models first and automatically falls back to free `:free`
models when the account is out of credits, so an existing OpenRouter key keeps
chat working even without adding credits. If every cloud path fails, Shigun
still answers plan, progress, theme, navigation, subject and common study
questions from built-in data in the learner's language instead of showing a
generic "tell me more" line.
