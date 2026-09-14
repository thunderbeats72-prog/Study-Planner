# NEXT SESSION MASTER PROMPT
## Study Planner Pro — Copy-paste this entire block into the new Arena session

---

## v36 — THE CHAIN MUST NOT COLLAPSE TO ONE LEG, + THE ML ENGINE TAKES OVER (this session)

**The complaint.** "The cloud engine keeps disconnecting… majority of the time it
falls back to the local engine. If Gemini is not working it should fall to another
AI. The fallback mechanism needs to be strong — and the ML should take over and be
responsible when AI is not there."

### 1. Chain persistence: benched legs get a bounded second chance (`src/lib/ai.ts`)

**The diagnosis.** `callLLMDetailed` built its provider queue with `skipCooled`:
when EVERY configured leg sat on a cooldown (a bad minute of free-tier 429s does
exactly this), the request was handed **one** leg — the soonest to expire — and
when that leg was still throttled the whole request collapsed to the local engine.
One 429-storm and every message afterwards read "Cloud busy · local engine
answered", even with seven keys configured.

**The fix.**
- `chainOrder()` replaces `skipCooled` at the provider level: healthy legs first
  (priority order, unchanged), then **every** transiently-benched leg
  (rate_limit / timeout / network / provider) in soonest-expiry order. Legs
  benched for a DETERMINISTIC reason (auth, relay-notice "empty") are skipped for
  the whole request — retrying a rejected key seconds later fails identically, so
  the request returns fast and the ML engine answers instead of burning the budget.
- Each benched leg gets `recoveryWait()` before its retry: it sleeps until the
  bench expires, capped by `AI_RECOVERY_MS` (default 12 s, override in env, 0
  disables) and always by the shared deadline minus 1.2 s for the attempt itself.
  Free-tier windows roll over per minute, so a few seconds of patience routinely
  converts "local fallback" back into a cloud answer. Healthy legs never wait.
  GOTCHA pinned by §4f pass 2b: `Number(envValue(...))` is 0 — not NaN — when the
  knob is unset, so the default branch must test the raw string for null FIRST.
  A silent zero collapses the whole second chance (every benched request retries
  instantly and the chain "keeps disconnecting"). Never write
  `Number.isFinite(Number(env)) ? ... : default` for a knob where 0 is meaningful.
- Default `AI_TIMEOUT_MS` raised 24 s → 30 s so one full walk plus one bounded
  recovery fits inside the budget (client still waits 60 s).
- `assistantStatusReply()` slow-branch copy updated to describe the second chance
  (vendor-neutral — the "never name a vendor" check still passes).

**Pinned by** `scripts/test-suite.ts` §4f: a rate-limited lone leg still ends
request 1 locally, then request 2 waits inside the `AI_RECOVERY_MS` cap and gets
the cloud answer; two rejected keys produce zero wasted follow-up calls and an
instant local handoff. The §4/4b/4c/4e contracts (Gemini-first, sticky success,
hedging, 200-gate) all still pass unchanged.

### 2. The ML engine takes over — a deterministic study strategist (`src/lib/ai.ts`)

The local fallback used to be: greeting/instant/percent replies, the encyclopedia,
and otherwise "couldn't find that". Strategy questions ("am I ready for the exam?",
"what should I revise?", "I can't focus", "how many hours should I study?") fell
through to a generic apology whenever the cloud was down — exactly when the coach
matters most.

**The fix.** `mlStrategistReply()` — a deterministic strategist answering the whole
strategy family from the learner's OWN logged signals (readiness projection, FSRS
due reviews, pace EWMA, skip-risk, focus-hour profile, weekday rates, observed
minutes). It is wired into the tail of `instantTutorReply()`, so it answers both
when the cloud is healthy (these are live-data questions — instant beats a model
round-trip) and, fully responsible, when every cloud leg is down. Every number
quoted is real; with no history yet it says so instead of inventing. Concept
questions ("explain photosynthesis") never match its patterns.

### 3. The syllabus teaches verb-less concept questions (`src/app/api/chat/route.ts`)

`localCurriculumReply` now teaches when the question NAMES a lesson strongly
(full title +20, ≥4 shared significant tokens, or the subject itself +4) even
without "explain/teach" — "dual aspect concept" no longer needs the magic word
when the learner's own plan has that lesson. The weak fallback pick (score 2)
still requires an explicit verb, so "capital of France" can never be answered
with a random plan card. Pinned in §16c.

**Files changed:** `src/lib/ai.ts` (chainOrder, recoveryWait, mlStrategistReply,
deadline default, status copy), `src/app/api/chat/route.ts` (curriculum gate),
`src/app/page.tsx` (timeout comment), `scripts/test-suite.ts` (+15 checks: §4f,
§16c), `.env.example` (AI_RECOVERY_MS + new defaults), `deploy-package/src/**`
(byte-exact re-sync — rule unchanged).

**Gate:** `npm run check` — typecheck, zero-warning lint, 439 tests, ui-audit
budget: ALL GREEN.

---

## v35 — A 200 STATUS IS NOT AN ANSWER, + THE SYLLABUS STEP WAS NEVER WIRED UP

Two unrelated bugs produced one complaint each. Both are now pinned by tests.

### 1. The relay's own error notice was shown as SHIGUN's reply

**The symptom.** Every answer came back as *"The API key used for this request
has reached its budget. Please ++[raise the key budget](…)++, then try again…
🌸 **Ad** 🌸 Powered by Pollinations.AI free text APIs."* — under the header
`Shigun · Cloud AI · free endpoint`. The learner could not hold a conversation.

**The diagnosis.** Every leg of every chain was judged by its HTTP status. Free
relays (Pollinations above all) answer **200 with a valid OpenAI-shaped body
whose `content` is their own billing notice**. `openAiExtract` saw non-empty
content and reported SUCCESS, so:

1. the notice was rendered as the tutor's answer;
2. `setStickyLeg` / `__studyPlannerPreferred` recorded the broken relay as the
   leg that "worked" and **promoted it to first place**, so every later message
   paid it again before the healthy legs behind it;
3. because a "cloud answer" existed, `degraded` stayed `false` and the on-device
   ML engine — the one thing that always works — **never ran**.

**The fix.** `src/lib/aiAnswer.ts` — one shared judge of a 200 body, imported by
the server chain (`ai.ts`), the browser bridge (`aiBridge.ts`) and `/api/chat`'s
`finalise` path (the last gate, for a browser still running a cached bundle).
A provider notice is treated as a FAILURE: the leg/model is benched with the
right reason (`auth` / `rate_limit` / `provider`), the sticky slot is dropped,
and the chain keeps walking until something real answers or the local engine
takes over. Advertising stapled under a *good* answer is trimmed, not fatal.

**Do not loosen the detector.** False positives are the real danger here: this
planner is used by accounting students, and "the department **has reached its
budget** ceiling" / "import **quota exhausted**" / "the **credit** balance
**exceeded** the limit" are *teaching*. `HARD_NOISE` holds relay-specific strings
no lesson contains; `CONTEXT_NOISE` is only believed when the answer ALSO names
AI plumbing (`AI_PLUMBING` — deliberately excludes budget/quota/credit/balance)
or addresses the app's user (`ADDRESSES_USER`), and never inside something
`looksLikeLesson()` (a heading, a 3+ item list, 4+ sentences or 900+ chars).
Section 4e of `scripts/test-suite.ts` pins both halves — the lesson cases are as
load-bearing as the relay cases.

**Also changed:** `DEFAULT_PROVIDER_ORDER` is now
`cerebras → gemini → groq → mistral → sambanova → cohere → openrouter` (Gemini is
the free key learners actually add, so it is tried second rather than held back
as the last leg), and `OWN_KEY_LEGS` in the bridge was reordered to match, so a
pasted key walks the same chain the deployment would have. `usableLegs()` no
longer promotes a sticky leg that is currently benched.

### 2. The syllabus step: every AI assessment 400'd, and edits got overwritten

**`/api/course-suggest` validated `body.courseName`; the wizard posted `query`.**
So the "AI: Assess & Build Subjects" button, the automatic assessment on the
details step and "↻ Re-assess subjects with AI" **all** failed with
`400 "Course name is required."` The subject list never changed and an error
banner was the only feedback — which reads exactly as "clicking does nothing".
The endpoint now accepts `courseName ?? query ?? course ?? name`, and the wizard
sends both spellings.

**The details step re-assessed on every change**, silently replacing the syllabus
of the course the learner had just picked (or hand-edited) with a fresh AI guess.
It now only assesses when `!subs.length` — when there is nothing to lose. The
explicit button is the only way to rebuild a list that exists, and it asks once
(`confirmReassess`) when `subsEdited` is true.

**The rows themselves were unreadable as inputs:** `.ob-sub-row input[type=text]`
was `background:transparent; border:none; outline:none` with no padding and no
`:focus` rule anywhere — visually identical to a static label. Now
`.ob-sub-name` / `.ob-sub-units` are real fields with hover + focus rings and a
`:focus-within` highlight on the row, plus a caption row that says
*"Subject — click any field to edit"*.

**Also fixed while in there:** rows were `key={i}`, so deleting a row made React
hand row N+1's DOM node to row N's data and the field being typed in jumped
subject; keys are now a client-only `uid` (stripped before the payload, so
`/api/onboard` still sees exactly `{name, units, difficulty, color}`). The
"weakest subject" choice is stored by uid and resolved to an index at launch, so
deleting a row above it can no longer re-point the setting. Units clamp on blur
instead of on every keystroke (live clamping is what made "select all, type 1"
produce 10). Duplicate and blank names are caught in the wizard with a sentence
instead of failing the whole plan at the last step.

`scripts/test-suite.ts` §16b renders the real wizard, walks it 1→5 and drives
every one of these interactions.

## v34 — BROWSER-DIRECT AI BRIDGE: "AI IS NOT CONNECTED" FIXED AT THE ROOT (this session)

Read this before touching anything AI-shaped: it explains why two server-side
rewrites did not fix the complaint, and where the model call lives now.

**The diagnosis.** `src/lib/ai.ts` walks Cerebras → Groq → Mistral → SambaNova →
Cohere → Gemini → OpenRouter **from the server**, with v10's failure memory,
hedging and sticky success. That is all still true and still first in line. But
"AI is not connected" has two causes no server-side code can fix:

1. **The deployment has no key** — a fresh Vercel deploy, a fork, a preview.
   Nothing can be invented server-side, so every open-ended question fell to the
   on-device engine and the chat strip said "Full AI chat isn't connected yet".
2. **The host has no outbound network** — Arena/e2b sandboxes and CI allowlist
   egress. Verified in this sandbox: `registry.npmjs.org` and `api.github.com`
   answer, while `api.groq.com`, `generativelanguage.googleapis.com`,
   `text.pollinations.ai` and even `www.google.com` fail at TLS
   (`SSL_ERROR_SYSCALL`). So **a perfectly valid key still produced `network`
   on every leg**, and Settings → "Save & test" agreed with the learner because
   it probed from the server too.

**The fix.** The learner's browser is on the open internet, holds the pasted
key, and every provider here accepts a cross-origin POST. So the model call
moved to the browser; grounding, action extraction, replanning and persistence
stayed on the server.

| Route | When | Who calls the model |
| --- | --- | --- |
| deployment env key | `serverProviderIds.length > 0` | server (`ai.ts` chain, unchanged) |
| learner's own key | BYOK in localStorage, no env key | **browser** (`aiBridge.ts`) |
| free community relay | nothing configured, relays allowed | **browser** (`aiBridge.ts`) |
| on-device engine | everything above failed | server (`localTutor`, `ml.ts`) |

**Files changed:**
```
src/lib/aiBridge.ts        NEW — browser-side chain: 7 own-key legs (same hosts
                           + current model ids as ai.ts) then 3 anonymous free
                           relays (OVHcloud AI Endpoints → Kilo Gateway →
                           Pollinations). Per-tab failure memory (CORS/offline
                           15 min, auth 10 min, rate limit 60 s, model 30 min),
                           sticky winner in sessionStorage, `probeBridge()` for
                           the honest browser-side connectivity test,
                           `setFreeBridgeAllowedByOperator()` for the
                           AI_FREE_BRIDGE=off kill-switch. A free leg is never
                           given a key — enforced by a test.
src/lib/chatClient.ts      NEW — `askTutorMessage()`: picks the route, runs
                           prepare → bridge → finalise, and upgrades a degraded
                           server answer from the browser. `serverAiStatus()`
                           caches /api/ai-status for 45 s.
src/app/api/chat/route.ts  ONE route, THREE modes: `full` (unchanged), `prepare`
                           (returns the grounded prompt after answering
                           commands/greetings/status itself), `finalise`
                           (`directReply` → same extractLlmAction / replan /
                           persist / fresh-state path). `prepared:true` stops a
                           duplicate user row, `replaceLast:true` overwrites the
                           fallback answer so one question never shows two.
                           Rate limit 18 → 36/min (one question = two calls).
                           `buildTutorPrompt()` is now the ONE prompt builder.
src/lib/ai.ts              `envConfiguredProviderIds()` (ids, not labels —
                           "Gemini" ≠ "Google Gemini" made a configured
                           deployment read as unconfigured),
                           `freeBridgeAllowed()`, `assistantStatusReply()` and
                           `localTutor()` accept `browserBridge` so "are you
                           connected?" and the no-answer fallback describe the
                           route that actually exists.
src/app/api/ai-status,     `serverProviderIds`, `serverProviders`,
src/app/api/health         `freeBridgeAllowed`.
src/app/page.tsx           `askTutorMessage()` replaces the raw /api/chat call;
                           `lastReplyVia` ("own-key" | "free") feeds the panel.
src/components/ChatPanel.tsx  "Cloud AI · free endpoint" / "Free AI endpoint ·
                           ready" statuses, and the strip is either the old
                           "Connect AI" warning or a plain "a free community
                           endpoint is answering — add my key" note.
src/components/AiKeyCard.tsx  "Test from this browser" + per-leg results with
                           latency and reason, the free-relay Seg switch with
                           the privacy trade-off beside it, stuck-off state
                           when the operator banned relays, server providers
                           matched by ID.
src/app/globals.css        `.ai-connect-free` (accent edge + dimmer copy) next
                           to the `.ai-connect` rules it variants — no new
                           owner, no restated component.
scripts/test-suite.ts      +27 checks (section 4d), 365 total.
.env.example               three routes explained, AI_FREE_BRIDGE documented.
README.txt                 AI CONFIGURATION rewritten (it still claimed Groq and
                           OpenRouter were removed) + v34 section.
docs/design/v34-browser-ai-bridge.md   NEW design note.
deploy-package/**          byte-exact re-sync from src/ (rule below).
```

**Verification tricks that work here — keep using them:**
1. The sandbox has no AI egress, so test the bridge the way the suite does:
   stub `globalThis.window` (localStorage/sessionStorage/setTimeout/
   dispatchEvent) and `globalThis.fetch`, then assert WHICH url was fetched and
   with which `authorization` header. That is how "a saved key is never handed
   to a free relay" is proven without a network.
2. Route-level checks with curl against `npm run dev` (SPP_DEMO_DATA=1, no DB):
   `POST /api/chat {"message":"…","prepare":true}` must return `needsCloud` +
   `prompt.system`; `POST /api/chat {"message":"…","directReply":"…",
   "prepared":true,"replaceLast":true}` must return `ai.source === "direct"`.
3. Free-relay liveness/model lists can be read from the sandbox even though the
   APIs cannot be called: `curl -H "Accept: application/vnd.github.raw"
   https://api.github.com/repos/<owner>/<repo>/contents/<path>` and the
   `fetch_page` tool both work. That is how the OVH, Kilo and Pollinations
   model ids here were checked against live `/models` listings.
4. `npm run check` is still the gate: typecheck, zero-warning lint, 365 tests,
   ui-audit budget. `deploy-package/src` must stay a byte-exact mirror of
   `src/` or the suite fails.

**Open decisions for the next session:** the free relays default to ON when
nothing else can answer (a learner can switch them off, an operator can ban
them with `AI_FREE_BRIDGE=off`). If the owner would rather they were opt-IN,
flip the default in `freeBridgePreference()` and update the AiKeyCard copy and
the `4d` checks that assert the default.

---

## v25 — CSS CONSOLIDATION · ONE TYPE SCALE · RESPONSIVE CALENDAR · DE-BLUR (this session)

Read this block first: it changes the rules for every later UI pass.

**Twelve sheets became two.** `src/app/globals.css` (tokens, base type, themes,
shell) and `src/app/ui-system.css` — the ten patch sheets concatenated in their
original import order, then re-authored into numbered sections; `§25.x` is this
pass. `layout.tsx` imports exactly those two, and `§25` is the last word in the
last file. **Never add another stylesheet, and never restate a component in
`globals.css`** — extend the owning `§25` section instead, and delete the copy
you are replacing.

**One fluid ramp owns type.** `--fs-micro/xs/sm/md/lg/h1/h2/h3/kpi/timer` are
`clamp()` ranges in `:root`; `.page-title`, `.card-title`, `.section-title`,
`.kpi-value` read from them. This pass deleted 13 competing `.page-title`
font-size declarations (4 `!important`) and 6 for `.section-title`, so:
no `font-size` on a heading inside any `@media`, no second clamp, no blanket
negative tracking (H1 is `-.022em` + `word-spacing:.012em` + `text-wrap:balance`),
and one numeral family (`--font-num`, tabular) — `JetBrains Mono` and the
`--font-ibm-plex-mono` alias are gone.

**Four tokens own space.** `--gap-page` (page stacks) · `--pad-card` (cards) ·
`--pad-tight` (inside heads) · `--gap-cluster` (control groups). Sibling
margins between cards were deleted; a container gap is one owner, an `* + *`
margin is N. `.section-card` carries `container: card / inline-size` — that is
what makes the calendar and card heads responsive *to the card*.

**Colour comes from tokens, never from a fallback.** `var(--x, #hex)` is banned:
0 left in components. Task kinds use `--task-lesson|recall|review|checkpoint`
(rail, chip and dot all read `KIND_META`); Zen and the illustrations read
`--zen-*`, which derives from each theme's `--ill-*` bridge (`--illustration-*`
is the alias layer). A light-theme hex fallback inside `var()` *is* a dark-theme
bug — the theme owns the token.

**Blur is a material for floating layers only**: `.mobile-bottom-nav`,
`.mobile-header`, `.tracker-bar`, `.sidebar`, `.modal-*`, `.cmdk`, `.toast`,
`.ai-panel`, scrims, `.day-sheet`. No in-flow text surface is frosted; hover
lifts use `translate3d(0, var(--reveal-y), 0)` with whole-pixel values (a
`.5px` translate under a blur is what made type look smeared — do not fix
legibility by raising contrast).

**Files changed:**
```
src/app/globals.css      ← type ramp + `--fs-h2/h3`, spacing tokens, `--task-*`,
                           `--zen-*`, `@property --mask-reveal` first, 625+60 dead
                           rules deleted, 35 competing `.page-title`/`backdrop-filter`
                           patches removed, empty `@media` shells removed
src/app/ui-system.css    ← the merged sheet: 10 old files concatenated, §25.1-25.12
                           authored (page rhythm, card head, planner calendar,
                           task card, focus studio, zen, analytics insets + support
                           classes), 141+53 dead rules deleted, `!important` 1107→803
src/components/*.tsx     ← TaskCard, TaskActions, TaskClockButton, PlannerView,
                           Dashboard, FocusView, AnalyticsView, ZenScene,
                           Illustrations, Onboarding, SettingsView, SubjectsView:
                           semantic classes instead of inline styles, `aria-label`
                           + `title` on every icon button, zero hex fallbacks
src/lib/fx.tsx           ← MaskWords: overlay-only animation, never font changes
scripts/test-suite.ts    ← retargeted at the two sheets + a v25 contract block
                           (242 checks; fails on a 2nd size owner, a hex fallback,
                           a frosted text surface, a half-pixel transform, an
                           undefined `--token`, or `!important` climbing back)
docs/design/v25-responsive-ui-system.md   ← NEW design note (cause → fix, tables)
README.txt               ← “v25 CSS + RESPONSIVE UI SYSTEM (this build)”
deploy-package/**        ← byte-exact re-sync from src/ (rule below)
```

**Verification tricks that replaced a browser here — keep using them:**
1. Winner of the cascade: `grep -o '\.page-title{[^}]*}' .next/static/chunks/*.css`
   after `npm run build:app` — the last line wins, and after v25 there is exactly
   one with a `font-size` (plus the two `body.mode-*` variants).
2. Undefined tokens (the silent kind — `var()` falls back to inherit): diff every
   `var(--x` used in `src/**` against every `--x:` defined in the two sheets. This
   caught `--surface-1`, `--success`, `--gap-row`, `--dur-2` invented by a design
   system that was never this repo's.
3. Dead-rule audit: for each top-level rule, if *every* class in its selectors is
   absent from **comment-stripped** `src/**`, delete it — and re-run the audit
   after deleting, since ghosts reference other ghosts. Strip `/* */` first or a
   prose mention of `.task-row` will keep 125 dead rules alive.
4. Render smoke without a browser: a temp `scripts/_smoke.tsx` + `react-test-renderer`
   (it must live in the repo to get `node_modules` and the `@/*` paths) — render each
   view, `act()` a tab click, then count nodes by `className.startsWith('cal-grid')`
   etc. Delete the script afterwards.
5. Batch regex edits on JSX must be followed immediately by `npx tsc --noEmit`
   **and** `npx prettier --write`; a `rep()` helper that prints `MISS` when
   `count != expected` saved this pass twice (one stray `<span>`, one swallowed
   `<TaskClockButton/>` that only the suite caught).

All checks green at hand-off: `npm run typecheck`, `npm run lint` (0 warnings),
`npm test` (242/242), `npm run build:app` (18 routes, both sheets compile).

---

## v19 — COLLAPSED RAIL: ONE HIGHLIGHT · SIDEBAR-SIZED ⌘K HINT · MOBILE APP BAR CONTRACT (this session)

Three visual bugs, all styling/structure (no behaviour, data or routing changes):

1. **Collapsed rail showed two “active” states.** `.brand-logo-icon` is painted
   with the same `--accent-gradient` the active nav pill uses (plus a spinning
   conic halo via `::before`), so in the 78px icon rail the brand tile read as a
   second selected tab above the real one. New v19 CSS: inside
   `.app-wrapper.sb-collapsed` the mark becomes neutral (`--row-bg` fill,
   `--text-muted` glyph, 1px `--glass-border` rim, no glow, halo off),
   transitioning on the rail’s own `--rail-dur`/`--rail-ease` so it fades with
   the labels. A reserved `border:1px solid transparent` on the base rule means
   the rim never nudges the glyph. Expanded view keeps the gradient tile
   (branding, next to the wordmark). Both brand marks are now
   `aria-hidden="true"` — they are presentational; the clipped `.brand-text`
   carries the accessible name.
2. **The ⌘K hint cropped and overflowed the rail.** It was
   `position:fixed;bottom:14px;left:14px` *outside* `.app-wrapper`, sized by its
   own text (~183px), so it ignored the 78px rail and hung over the workspace.
   Markup moved it to the last row inside `<aside class="sidebar">`
   (`.cmdk-tip` → `<kbd class="cmdk-tip-key">` + `<span class="cmdk-tip-text">`),
   so the rail’s width IS the hint’s width and `.sidebar{overflow:hidden}`
   guarantees containment. The sentence wraps (`white-space:normal;
   overflow-wrap:anywhere`) instead of chopping in narrow sidebars; in the rail
   it clips away (`max-width:190px→0`, fade, `translateX`) and the compact key
   chip centres. The chip shows the real modifier for the platform —
   `useAppleKeyboard()` via `useSyncExternalStore` (⌘ on the server snapshot,
   ⌃ on non-Apple clients) because `react-hooks/set-state-in-effect` forbids
   `setState` in an effect and a lazy `useState` would mismatch hydration. The
   sentence stays in the DOM for AT. This layer owns `display`, so the
   `max-width:860px` and `display-mode:standalone` hides are restated (Zen’s
   `display:none !important` still wins).
3. **Mobile top bar had no contract of its own.** Its layout was whatever won
   among eight older `.mobile-header` blocks (padding flip-flopping
   10/12/14/16px, `display:flex` borrowed from a rule that also had to avoid
   resurrecting the bar on landscape phones, unbounded streak chip). v19 states
   it in one block at `max-width:860px`: `display:flex` +
   `justify-content:space-between` + `align-items:center` + `gap:12px` +
   `box-sizing:border-box`, `.mh-brand{display:flex;align-items:center;gap:12px;
   flex:1 1 auto;min-width:0}` wrapping logo + `.mh-titles`, hard bounds on both
   ends (`flex:0 0 26px` + `max-width/max-height:26px` for the logo tile;
   `flex:0 0 auto`, `min-height:26px`, `max-width:44vw`, `white-space:nowrap`,
   `line-height:1` for the streak chip), and
   `padding:env(safe-area-inset-top) max(16px,env(safe-area-inset-right)) 0
   max(16px,env(safe-area-inset-left))`. The landscape-phone `display:none`
   exception is restated *after* the block, since this layer now owns display.

Files changed:
```
src/app/globals.css    ← appended “v19” layer (§1 rail brand mark, §2 ⌘K hint,
                          §3 mobile app bar, §4 reduced-motion / forced-colors /
                          prefers-contrast guards)
src/app/page.tsx       ← .cmdk-tip moved inside the sidebar (kbd + text spans),
                          useAppleKeyboard()/cmdGlyph helper, aria-hidden on both
                          decorative brand marks
docs/design/v19-rail-hint-appbar.md   ← NEW design note (cause → fix, tables)
README.txt             ← “v19 COLLAPSED-RAIL + MOBILE BAR FIXES (this build)”
deploy-package/**      ← byte-exact re-sync from src/ (see rule below)
```

**Verification trick worth reusing:** with no browser in the sandbox, the cascade
was checked by parsing `globals.css` (media-query evaluation + specificity + source
order) and by grepping the *production* CSS bundle (`.next/static/chunks/*.css`) to
confirm the v19 declarations win against every earlier layer. Keep doing that for
style-only changes: `grep -o '\.mobile-header{[^}]*}' .next/static/chunks/*.css`
prints the whole cascade in order, so the winner is the last line.

All checks green: `npm run typecheck`, `npm run lint` (0 warnings), `npm test`
(131/131), `npm run build:app`.

---

## v18 — DEPLOY BUNDLE RESYNC + CHECKPOINT NORMALIZATION + README TRUTH

Root cause found for "I mentioned this before and it's still not resolved":
the drag-and-drop deploy bundle had drifted far behind `src/`.

1. **`deploy-package/` resynced** — it was pre-v15 (missing `completion.ts`,
   `routeGuard.ts`, `demoState.ts`, `icon.svg`, all v15–v18 UI/API fixes).
   Deploying it shipped stale behaviour. It is now a byte-exact mirror of
   `src/` (`diff -rq src deploy-package/src` is empty), and
   `deploy-package/README.txt` is a copy of the root README. After every
   future session that touches `src/`, re-sync the bundle.
2. **Checkpoint titles never show "#0"** — new shared helper
   `normalizeCheckpointTitle()` in `src/lib/client.ts` (handles
   `Weekly Checkpoint Test #0`, `Weekly Checkpoint · Test #0`, unspaced
   later numbers → canonical `Weekly Checkpoint · Test #N`, 1-based).
   Dashboard.tsx and PlannerView.tsx both use it (duplicated regexes
   removed). Tests: test-suite section "5c. Weekly Checkpoint Title
   Normalization" (124/124 pass).
3. **README AI docs now match the app** — root README.txt no longer tells
   users to set GROQ/XAI/OpenRouter keys or use the removed Settings →
   AI Connectivity panel; it documents the real 5-provider chain
   (Cerebras → Mistral → SambaNova → Cohere → Gemini), local ML engine,
   and the live health endpoints. Added a "v18 FIXES" section.
4. **Latent bug fixed** — `applyCompletionMastery` in `src/lib/state.ts`
   updated topics with `eq(topics.userId, topic.userId)` (column compared
   to itself) instead of the task's userId.
5. **`.env.example`** now documents the preview-only `SPP_DEMO_DATA=1` flag.
6. **Preview mode made fully interactive** (v18b, same session): previously
   `SPP_DEMO_DATA=1` only served the sample plan; every interactive route
   (sessions, tasks, settings, subjects, replan, onboard) 500/503'd in the
   preview, which is what the user's screenshots caught. `demoState.ts` now
   keeps an in-memory mutation layer (task overrides, added/deleted tasks,
   live session logs, settings/user/subject overrides) and every route has a
   demo branch: POST /api/sessions runs the SAME auto-completion rule
   (verified live: a 45-min learn task auto-completed at 45 logged minutes
   with `completedTask` in the response), PATCH/POST/DELETE /api/tasks,
   PATCH /api/settings, subjects POST/PATCH/DELETE, replan and onboard all
   round-trip through the demo state. GET /api/analytics computes the real
   ML intel from demo rows. Never import demoState into production paths —
   every branch is gated by `demoDataEnabled()`.

Note: no PostgreSQL is available in the sandbox; the app was exercised in
`SPP_DEMO_DATA=1` demo mode (dev server, port 3000). All checks green:
typecheck, lint (0 warnings), 131/131 tests, `npm run build:app`.
Caveat: `.env.local` must NOT contain the placeholder DATABASE_URL from
`.env.example` — with it set, the app attempts real pg connections and the
preview 500s (the bug found in the server logs).

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

## v16 — UI POLISH: TRUE LISTS, ALIGNED BUTTONS, CALENDAR COLOUR, FOCUS+CLOCK LINK (this session)

Four UX gaps were fixed together:

1. **List view is a list again** — `src/app/globals.css` (appended "v16" section):
   - Planner day blocks: `.planner-days .day-block` padding moved to the day
     head; `.planner-days .task-row` rows are edge-to-edge with hairline
     separators (`last-row` class removes the final divider — set from
     `PlannerView.tsx` via `renderTask(task, { lastRow })`).
   - Dashboard "Today's Study Load": `.task-row.clean-list` is horizontal
     again (was a stack of bordered cards with a dashed divider).
2. **Aligned row controls** — `.task-row-actions` uniform 30px buttons, fixed
   clock-button width (`min-width:88px`), Done pinned right; on ≤640px the
   action bar is a 3-column grid (Done · Clock · ⋯) with `order:-2/-1` and
   expanded actions wrapping below.
3. **Calendar colour** — `PlannerView.tsx` sets `--cell-tint` per cell from
   the first task's subject colour; CSS tints `.cal-cell.has-tasks`; the
   ≤640px rule that hid `.cal-pill` is overridden so phones show coloured
   topic pills too.
4. **Focus ↔ clock link** — `FocusView.tsx` `toggleTimerLinked()`: starting a
   focus block also starts the study clock (attaches the first pending task
   of the day), breaks never touch the clock, new `onClockLink` prop surfaces
   a toast. `page.tsx` Zen mode: primary button is now "Start Focus + Clock"
   (`startFocusWithClock`), with the redundant standalone Clock In removed
   and a `.zen-hint` explaining the combined action.
5. **Branded favicon** — new `src/app/icon.svg` (gradient tile + layered
   chevrons matching `IconLogo`); Next.js serves it as the tab icon.

Files changed:
```
src/app/globals.css            ← appended v16 section (list rows, buttons, calendar, zen hint)
src/components/PlannerView.tsx ← last-row flag + calendar --cell-tint
src/components/Dashboard.tsx   ← (no change; .clean-list restyled via CSS)
src/components/FocusView.tsx   ← toggleTimerLinked + onClockLink prop + copy
src/app/page.tsx               ← startFocusWithClock, Zen restructure, onClockLink wiring
src/app/icon.svg               ← NEW branded favicon
README.txt                     ← v16 section
```

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

v18 session (deploy resync + checkpoint normalization + docs):
```
deploy-package/src/**             ← byte-exact re-sync from src/ (was stale pre-v15)
deploy-package/README.txt         ← copy of root README
src/lib/client.ts                 ← NEW normalizeCheckpointTitle helper
src/components/Dashboard.tsx      ← uses shared checkpoint normalizer
src/components/PlannerView.tsx    ← uses shared checkpoint normalizer
src/lib/state.ts                  ← applyCompletionMastery userId fix
scripts/test-suite.ts             ← "5c. Weekly Checkpoint Title Normalization"
README.txt                        ← AI config section corrected + v18 section
.env.example                      ← SPP_DEMO_DATA documented
```

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
