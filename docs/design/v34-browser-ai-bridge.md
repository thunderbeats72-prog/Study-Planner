# v34 — Browser-direct AI bridge: why "AI is not connected" survived two server rewrites, and where the model call lives now

Design note for the pass that moved the cloud model call into the learner's
browser when the server cannot make it — and for the honest labelling that goes
with it.

## The problem

Two previous passes attacked the same complaint from the server: v9 built the
seven-provider chain with per-provider model fallbacks, v10 added failure
memory, parallel hedging and a self-status intent. Both are still in place and
still first in line. Neither could fix what the learner was actually hitting:

| Symptom | Actual cause |
|---|---|
| "Full AI chat isn't connected yet" on a fresh deploy | The deployment has **no key at all**. `configuredProviders()` returns `[]`, so `activeProvider()` is `null`, the cloud branch never runs, and every open-ended question falls to `localTutor`. No server-side code can invent a key. |
| "AI is not connected" *even after* pasting a valid key in Settings | The host has **no outbound network**. Sandboxed previews (Arena/e2b) and CI allowlist egress. Measured in this repo's sandbox: `registry.npmjs.org` → 200 and `api.github.com` → 200, while `api.groq.com`, `generativelanguage.googleapis.com`, `api.cerebras.ai`, `openrouter.ai`, `text.pollinations.ai` and even `www.google.com` → TLS `SSL_ERROR_SYSCALL`. Every leg returns `network`, so the chain is dead by construction. |
| Settings → "Save & test" said "That key did not work." for a good key | The probe (`POST /api/ai-status`) runs **server-side**, so it measures the host's egress, not the key. On a blocked host it can only report failure, and the learner has no way to tell a bad key from a blocked server. |
| Settings claimed nothing was configured on a deployment that had a key | `configuredProviders()` returns **labels** (`"Gemini"`); `AiKeyCard` compared them with its own **labels** (`"Google Gemini"`) and with ids elsewhere. Label/id mismatches read as "not connected". |
| One question could show two answers | Upgrading a degraded reply naively inserts a second assistant row: the fallback and the real answer. |

## The principle

**The browser is on the open internet even when the server is not.** It is also
the machine that already holds the pasted key. So the model call moved there —
while everything that must stay server-side stayed there:

- the server still builds the prompt (identity, live ML signals, curriculum
  grounding, bounded history) and still owns action extraction, replanning,
  persistence and the state refresh;
- the browser carries **one** request to **one** provider and hands the answer
  back;
- a key never travels to a leg that is not its own provider, and a free
  anonymous relay never receives any key (enforced by a test, not a comment).

Priority is most private first, and it is decided per message, not per deploy:

| # | Route | Condition | Who calls the model |
|---|---|---|---|
| 1 | deployment env key | `serverProviderIds.length > 0` | server — `ai.ts` chain, unchanged |
| 2 | learner's own key | BYOK in localStorage, no env key | **browser** — `aiBridge.ts` |
| 3 | free community relay | nothing configured, relays allowed | **browser** — `aiBridge.ts` |
| 4 | on-device ML engine | all of the above failed | server — `localTutor` + `ml.ts` |

Route 1 keeps the operator's choice authoritative: if a deployment configured
Gemini, the browser bridge stays out of the way unless the server chain fails,
in which case the browser **upgrades** the same question and `replaceLast`
overwrites the fallback row instead of adding a second answer.

## The free relays

Zero-setup means somebody else's compute. Three anonymous, OpenAI-compatible
endpoints are catalogued, in this order, and each was checked against its live
`/models` listing in September 2026:

| Leg | Anonymous limit | Why it is in the chain |
|---|---|---|
| OVHcloud AI Endpoints (`oai.endpoints.kepler.ai.cloud.ovh.net/v1`) | 2 req/min per IP **per model** | EU-hosted, documents that it stores no user data, strongest open models (`gpt-oss-120b`, `Qwen3.5-397B-A17B`, `Llama-3.3-70B`) — and per-model limits mean a busy learner can rotate models instead of stalling |
| Kilo Gateway (`api.kilo.ai/api/gateway`) | ~200 req/hour per IP | Aggregator of `:free` routes, so one leg covers several vendors; upstreams may log prompts |
| Pollinations (`text.pollinations.ai/openai`) | 1 req/15 s per IP | The most browser-friendly of the three (they ship a React client, so CORS is guaranteed); the reliable last leg |

All three run **from the learner's own device**, which is the only place their
per-IP limits make sense: a shared server IP on Vercel would exhaust an
anonymous tier almost immediately, and that is a second reason this is not a
server-side provider list.

The trade-off is stated, not buried:

- the chat strip says a free community endpoint is answering, with an
  "Add my key" button, and the header reads `Cloud AI · free endpoint`;
- Settings spells out what leaves the browser (question + plan summary), names
  the relays, and offers a one-tap Off switch;
- `AI_FREE_BRIDGE=off` forbids them deployment-wide. The flag is reported by
  `GET /api/ai-status`, so the browser obeys it with no rebuild, and the
  Settings switch shows a stuck-off state explaining why.

## What changed

- `src/lib/aiBridge.ts` (new) — the browser-side chain: seven own-key legs
  mirroring `ai.ts` hosts and current model ids, three free legs, per-tab
  failure memory in `sessionStorage` (CORS/offline 15 min, auth 10 min, rate
  limit 60 s, model 30 min), sticky winner, `callBridge()`, `probeBridge()`,
  `bridgeAvailability()`, `bridgeCooldowns()`, the preference switch and the
  operator override.
- `src/lib/chatClient.ts` (new) — `askTutorMessage()` decides the route and
  runs prepare → bridge → finalise; `serverAiStatus()` caches `/api/ai-status`
  for 45 s and publishes `freeBridgeAllowed` to the bridge.
- `src/app/api/chat/route.ts` — one route, three modes (`full`, `prepare`,
  `finalise`), `prepared` / `replaceLast` flags, `bridge` hint from the caller,
  `buildTutorPrompt()` as the single prompt builder, rate limit 18 → 36/min
  because one question now costs two calls.
- `src/lib/ai.ts` — `envConfiguredProviderIds()`, `freeBridgeAllowed()`, and
  `browserBridge` threaded into `assistantStatusReply()` and `localTutor()` so
  "are you connected?" and the no-answer fallback describe the route that
  actually exists instead of always saying "paste a key".
- `src/app/api/ai-status/route.ts`, `src/app/api/health/route.ts` —
  `serverProviderIds`, `serverProviders`, `freeBridgeAllowed`.
- `src/app/page.tsx` — the raw `/api/chat` call replaced by
  `askTutorMessage()`; `lastReplyVia` tells the panel whether the answer came
  from the learner's key or a free relay.
- `src/components/ChatPanel.tsx`, `src/components/AiKeyCard.tsx` — statuses,
  the informational free-relay strip, the browser-side test with per-leg
  latency and reason, the relay switch, id-based matching of deployment
  providers.
- `src/app/globals.css` — `.ai-connect-free`, a variant of the existing
  `.ai-connect` rules sitting next to them (no new owner, no restated
  component).
- `scripts/test-suite.ts` — section `4d`, 27 checks, 365 total.

## Verification without a browser or a network

The sandbox cannot call a provider, so the bridge is tested the way the
provider-failover block tests `ai.ts`: stub `globalThis.window`
(localStorage/sessionStorage/setTimeout/dispatchEvent) and `globalThis.fetch`,
then assert **which URL was fetched and with which `authorization` header**.
That proves the contracts that matter — own keys before free relays, a key
never handed to a relay, a CORS-blocked host benched after one request and
skipped on the next, a rejected key costing one request, the learner switch and
the operator ban honoured with no reload — with zero network.

Route-level checks are plain curl against `npm run dev` with `SPP_DEMO_DATA=1`
and no database: `prepare` must return `needsCloud` + `prompt.system`;
`finalise` must return `ai.source === "direct"` and `ai.via === "browser-free"`
or `"browser-own-key"`.

Free-relay liveness can also be checked from a blocked sandbox, because the
GitHub API is allowlisted and `fetch_page` runs platform-side: that is how the
OVH, Kilo and Pollinations model ids were read from live `/models` responses
rather than from memory.
