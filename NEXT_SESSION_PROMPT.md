# NEXT SESSION MASTER PROMPT
## Study Planner Pro — Copy-paste this entire block into the new Arena session

---

## CONTEXT (what was already done in the merged session)

The following changes were made and merged. Do NOT redo them — just verify they are present:

### 1. `src/lib/ai.ts` — Provider Architecture v9
- **ProviderId** is now: `"cerebras" | "mistral" | "sambanova" | "cohere" | "gemini"`
- **Removed**: `groq`, `grok`, `openrouter` — completely gone from the type, PROVIDERS map, and DEFAULT_PROVIDER_ORDER
- **Added**: Full provider specs for Cerebras, Mistral, SambaNova, Cohere (all OpenAI-compatible endpoints)
- **DEFAULT_PROVIDER_ORDER**: `["cerebras", "mistral", "sambanova", "cohere", "gemini"]`
- **SHIGUN system prompt**: Upgraded with AI+ML hybrid identity block (Cerebras WSE-3, Mistral, SambaNova, Cohere, Gemini as safety net + local ML engine described)
- **Fallback message**: No longer references "Settings → AI Connectivity"

### 2. `src/components/SettingsView.tsx` — AI Connectivity section removed
- Entire "AI Connectivity" glass panel (probe UI, connectivity test button, provider status rows) is GONE
- Removed unused imports: `api`, `ApiError`, `IconSignal`
- Removed unused state: `probing`, `probes`, `probeNote`, `runProbe`, `allProbes`, `PROVIDER_ENV`, `FRIENDLY_ERROR`, `Probe` type

### 3. `src/components/ChatPanel.tsx` — Cleaner SHIGUN interface
- Title changed from "Shigun AI Tutor" → "Shigun AI Study Coach"
- Status line: "AI + ML engine active" (when cloud configured) / "ML engine active · add an AI key to unlock cloud tutoring"
- Removed noisy provider list from status chip (no more "Gemini + Groq + Grok live" clutter)
- Default welcome message updated

### 4. `.env.example` — Updated with new provider keys, old providers removed

### 5. `scripts/test-suite.ts` — Test references updated from groq → cerebras

---

## v15 — STUDY CLOCK AUTO-COMPLETE (merged in this session)

Tasks are now marked **done automatically** the moment the minutes logged for
them reach the planned time — no manual "Done" tap required (e.g. a 15-min
recall studied for 28 min completes at the 15-min mark). This was the fix for:
"the recall planned time was given 15min but I logged in for 28mins … if I have
logged above 15 min it should be marked as complete and should notify me that
this is done and after that it should come to next task."

Where the logic lives:
1. `src/lib/completion.ts` (NEW) — pure rule: `shouldAutoComplete(actual,
   planned, status)` (pending + actual ≥ planned) and `nextPendingTask(tasks,
   date, excludeId)` (the task the clock rolls into after a completion).
2. `src/lib/state.ts` — `applyCompletionMastery(tx, updated, today, rating?)`
   extracted from the tasks route (mastery gain + FSRS-lite update), now
   shared by the manual Done flow and the auto-complete flow so they cannot
   drift apart.
3. `src/app/api/sessions/route.ts` — after summing session minutes and
   updating `actualMinutes`, a pending task that has met its plan is flipped
   to `done` via a conditional update (`where status = 'pending'`), so a
   concurrent request can never double-apply mastery. The response includes
   `completedTask: { id, title, plannedMinutes, actualMinutes } | null`.
4. `src/app/page.tsx` — `drainSessionQueue` reads `completedTask`, shows a
   success toast, and if the study clock is STILL running on that task calls
   `clock.clockIn({ taskId: next.id })` to roll forward to the next pending
   task so continued minutes are logged against the right lesson.

Note for future sessions: auto-completion is generic (all task kinds, not just
recalls), never re-marks done/skipped tasks, and works for queued offline
session logs too. Tests live in `scripts/test-suite.ts` under
"5b. Study-Clock Auto-Completion Rule".

---

## IF SOMETHING NEEDS TO BE REDONE OR EXTENDED

### To add a new provider (e.g., Anthropic/Claude):
1. Add `"anthropic"` to the `ProviderId` union in `src/lib/ai.ts`
2. Add a spec inside the `PROVIDERS` Record with endpoint `https://api.anthropic.com/v1/messages`
3. Add `"anthropic"` to `DEFAULT_PROVIDER_ORDER` at the desired position
4. Add `ANTHROPIC_API_KEY=` to `.env.example`

### To change provider priority order:
Edit `DEFAULT_PROVIDER_ORDER` array in `src/lib/ai.ts`. Or set env var:
```
AI_PROVIDER_ORDER=mistral,cerebras,cohere,sambanova,gemini
```

### To add more SHIGUN quick suggestions in ChatPanel:
Edit the `QUICKS` array at the top of `src/components/ChatPanel.tsx`

---

## BOOMER-FRIENDLY API KEY GUIDE
### How to put your keys in (step by step, no jargon)

**WHERE DO I PUT THE KEYS?**

Your Study Planner runs on a hosting platform (Vercel, Railway, Render, etc.).
Every platform has a place called "Environment Variables" or "Secrets". That is where your keys go.
**Never put keys inside any code file. Never share them in chat.**

---

### Step 1 — Get your keys from each provider website

| Provider | Website | Where to find your key |
|---|---|---|
| **Cerebras** | https://cloud.cerebras.ai | Click "API Keys" in the left sidebar → "Create New Key" |
| **Mistral** | https://console.mistral.ai | Click "API Keys" in the left menu → "Create new key" |
| **SambaNova** | https://cloud.sambanova.ai | Top right → your name → "API Authorization" |
| **Cohere** | https://dashboard.cohere.com | Left sidebar → "API Keys" → "New Trial Key" or "New Production Key" |
| **Gemini** | https://aistudio.google.com | Click "Get API Key" → "Create API key" |

Copy the key immediately after creating it — most providers only show it once.
It looks like a long random string, for example: `sk-abc123XYZ789...`

---

### Step 2 — Open your hosting platform's environment variables

**On Vercel:**
1. Go to https://vercel.com → click your project
2. Click "Settings" tab → "Environment Variables" in the left menu
3. You will see a form with two boxes: "Key" and "Value"

**On Railway:**
1. Go to https://railway.app → click your project → click your service
2. Click "Variables" tab

**On Render:**
1. Go to https://dashboard.render.com → click your service
2. Click "Environment" in the left sidebar

---

### Step 3 — Add each key one by one

For each provider you have a key for, add a new environment variable:

| Key name (type exactly as shown) | Value (paste your key here) |
|---|---|
| `CEREBRAS_API_KEY` | paste your Cerebras key |
| `MISTRAL_API_KEY` | paste your Mistral key |
| `SAMBANOVA_API_KEY` | paste your SambaNova key |
| `COHERE_API_KEY` | paste your Cohere key |
| `GEMINI_API_KEY` | paste your Gemini key |

You do NOT need all five. Even one key will work. The app tries them in order:
Cerebras first → Mistral → SambaNova → Cohere → Gemini → local ML engine.

---

### Step 4 — What to do with your OLD keys

You may have old keys for Groq, Grok (XAI), or OpenRouter sitting in your environment variables.

**Those providers have been removed from this app.** You have two choices:
- **Leave them** — they will be silently ignored. No harm done.
- **Delete them** — clean up your environment. Go to your hosting platform's environment variables, find `GROQ_API_KEY`, `XAI_API_KEY`, `OPENROUTER_API_KEY` and delete those rows.

Your `GEMINI_API_KEY` if you already have one: **keep it**. Gemini is still in the app as the safety net.

---

### Step 5 — Redeploy

After adding or changing environment variables, you must redeploy for changes to take effect.

- **Vercel**: Click "Deployments" → "Redeploy" on the latest deployment, OR just push a new commit
- **Railway**: It redeploys automatically when you save variables
- **Render**: Click "Manual Deploy" → "Deploy latest commit"

---

### Step 6 — Verify it worked

Open your Study Planner app → click the Shigun chat button (bottom right).
You should see: **"AI + ML engine active"** in the status line under "Shigun AI Study Coach".

If you see "ML engine active · add an AI key to unlock cloud tutoring" — the key was not picked up. Check:
1. The key name is spelled exactly right (no spaces, correct case)
2. You redeployed after adding the key
3. The key value has no extra spaces or quotes around it

---

## WHAT THE LOCAL ML ENGINE DOES (always active, no key needed)

Even with zero API keys, SHIGUN answers intelligently using:
- **FSRS-lite** spaced repetition: knows when each topic needs review
- **EWMA pace model**: learns how fast YOU actually study each subject
- **Skip-risk model**: predicts which days' plans you might not finish
- **Weekday propensity**: knows your historically strong/weak days
- **Time-of-day focus**: tracks your best study hours
- **Ebbinghaus decay**: estimates memory fade since last review

These run 100% on the server from your own logged data. Adding an AI key makes Shigun smarter at open-ended tutoring and concept explanations — the ML engine handles schedule queries and progress reports either way.

---

## FILES CHANGED IN THIS SESSION (for reference)

Previous session:
```
src/lib/ai.ts                    ← Main AI provider config + SHIGUN system prompt
src/components/SettingsView.tsx  ← AI Connectivity section removed
src/components/ChatPanel.tsx     ← Cleaner SHIGUN interface
src/components/icons.tsx         ← (unchanged)
scripts/test-suite.ts            ← Test refs updated groq→cerebras
.env.example                     ← Updated provider docs
```

v15 session (study-clock auto-complete):
```
src/lib/completion.ts            ← NEW: shouldAutoComplete + nextPendingTask rule
src/lib/state.ts                 ← applyCompletionMastery shared helper
src/app/api/sessions/route.ts    ← auto-complete on log + completedTask in response
src/app/api/tasks/route.ts       ← reuses applyCompletionMastery (no behavior change)
src/app/page.tsx                 ← toast + roll clock to next pending task
scripts/test-suite.ts            ← "5b. Study-Clock Auto-Completion Rule" tests
README.txt                       ← v15 section
```
