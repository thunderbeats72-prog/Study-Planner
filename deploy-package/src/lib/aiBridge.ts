/* ============================================================
   BROWSER-DIRECT AI BRIDGE  (client-side cloud tutoring)
   ────────────────────────────────────────────────────────
   WHY THIS EXISTS
   `src/lib/ai.ts` walks a 7-provider cloud chain **from the server**.
   That works on a normal deployment, and it is still the first choice
   whenever the deployment has its own keys. But it fails completely in
   two real situations, and in both the learner saw the same dead end —
   "Full AI chat isn't connected yet":

     1. The deployment has no API key at all (a fresh Vercel deploy, a
        preview, a fork). Nothing can be done server-side without one.
     2. The server has no outbound network. Sandboxed previews (Arena,
        e2b, CI) allowlist egress: `api.groq.com`, `generativelanguage
        .googleapis.com` and friends simply do not resolve, so *even a
        perfectly valid key* produced `network` errors on every leg and
        the tutor fell back to the on-device engine forever.

   The learner's BROWSER has neither problem. It is on the open
   internet, it is the machine that already holds the pasted key, and
   every provider below accepts a cross-origin POST. So this module
   performs the cloud call in the browser and hands the finished answer
   back to the server (`/api/chat` with `directReply`), which still owns
   grounding, action extraction, replanning and persistence.

   PRIORITY (highest first):
     deployment env keys   → server chain in ai.ts      (operator's choice)
     learner's own key     → this bridge, "own-key" leg (private, fastest)
     free community legs   → this bridge, "free" leg    (zero setup, opt-out)
     on-device ML engine   → localTutor in ai.ts        (always available)

   PRIVACY: a free leg is an anonymous public relay — the question and
   the plan context leave the browser for a third party. That is why the
   free legs are (a) only used when nothing else can answer, (b) clearly
   labelled in the chat header while they are answering, and (c) one tap
   away from being switched off in Settings → AI coach.
============================================================ */

import { BYOK_PROVIDERS, getByokKeys, type ByokProviderId } from "./byok";

export type BridgeMsg = { role: "user" | "assistant"; content: string };

/** What the server hands the browser to send upstream (`/api/chat` prepare). */
export type BridgePrompt = {
  system: string;
  messages: BridgeMsg[];
  maxTokens?: number;
  temperature?: number;
};

export type BridgeError =
  | "timeout"
  | "auth"
  | "rate_limit"
  | "model"
  | "blocked"
  | "empty"
  | "network"
  | "provider";

export type BridgeLegKind = "own-key" | "free";

export type BridgeAttempt = {
  leg: string;
  model: string;
  status: number | null;
  error: BridgeError | null;
  ms: number;
};

export type BridgeResult = {
  text: string | null;
  leg: string | null;
  label: string | null;
  kind: BridgeLegKind | null;
  model: string | null;
  attempts: BridgeAttempt[];
};

export type BridgeProbe = {
  id: string;
  label: string;
  kind: BridgeLegKind;
  ok: boolean;
  model: string | null;
  latencyMs: number;
  error: BridgeError | null;
  detail: string;
};

type LegSpec = {
  id: string;
  label: string;
  kind: BridgeLegKind;
  url: (model: string) => string;
  models: string[];
  /** Present only for own-key legs; free legs return null and are public. */
  key?: () => string | null;
  headers: (key: string | null) => Record<string, string>;
  body: (model: string, prompt: BridgePrompt, key: string | null) => unknown;
  extract: (json: any) => { text: string | null; blocked: boolean };
};

/* ── response parsing ──────────────────────────────────────── */

/** Hosts that return `<think>…</think>` inline. Never shown to a learner. */
function stripThinking(text: string): string {
  return text
    .replace(/<think>[\s\S]*?<\/think>/gi, "")
    .replace(/^<think>[\s\S]*$/i, "")
    .trim();
}

function openAiExtract(json: any): { text: string | null; blocked: boolean } {
  const message = json?.choices?.[0]?.message;
  if (message?.refusal) return { text: null, blocked: true };
  let raw: string | null = null;
  if (typeof message?.content === "string") raw = message.content;
  else if (Array.isArray(message?.content)) {
    raw = message.content
      .map((part: { text?: string }) => (typeof part?.text === "string" ? part.text : ""))
      .join("");
  }
  const text = raw ? stripThinking(raw) : "";
  return { text: text || null, blocked: false };
}

function geminiExtract(json: any): { text: string | null; blocked: boolean } {
  const candidate = json?.candidates?.[0];
  const finish = String(candidate?.finishReason || "").toUpperCase();
  const blocked = Boolean(json?.promptFeedback?.blockReason)
    || ["SAFETY", "BLOCKLIST", "PROHIBITED_CONTENT", "RECITATION"].includes(finish);
  const text = candidate?.content?.parts
    ?.filter((part: { thought?: boolean }) => !part.thought)
    .map((part: { text?: string }) => part.text || "")
    .join("") ?? null;
  return { text: text && text.trim() ? stripThinking(text) : null, blocked };
}

function jsonHeaders(key: string | null): Record<string, string> {
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (key) headers.authorization = `Bearer ${key}`;
  return headers;
}

function openAiBody(model: string, prompt: BridgePrompt, extra: Record<string, unknown> = {}) {
  return {
    model,
    max_tokens: prompt.maxTokens ?? 1200,
    temperature: prompt.temperature ?? 0.5,
    messages: [
      { role: "system", content: prompt.system },
      ...prompt.messages.map((message) => ({ role: message.role, content: message.content })),
    ],
    ...extra,
  };
}

/** Reasoning models burn a tutoring-sized budget on hidden thinking tokens
 *  and then return an EMPTY answer. Ask for the lowest effort everywhere. */
function lowEffort(model: string): Record<string, unknown> {
  const id = model.toLowerCase();
  if (/gpt-oss/.test(id)) return { reasoning_effort: "low" };
  if (/qwen3/.test(id)) return { reasoning_effort: "none" };
  return {};
}

/* ── leg catalogue ───────────────────────────────────────────
   Own-key legs mirror the server catalogue in `ai.ts` (same hosts,
   same current model ids) so a key pasted in Settings behaves the
   same whichever side of the wire it is used on. */
function byokKey(id: ByokProviderId): () => string | null {
  return () => getByokKeys()[id] || null;
}

const OWN_KEY_LEGS: LegSpec[] = [
  {
    id: "gemini",
    label: "Google Gemini",
    kind: "own-key",
    url: (model) =>
      `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`,
    models: ["gemini-flash-latest", "gemini-2.5-flash", "gemini-flash-lite-latest"],
    key: byokKey("gemini"),
    headers: (key) => ({ "content-type": "application/json", "x-goog-api-key": key || "" }),
    body: (model, prompt) => ({
      systemInstruction: { parts: [{ text: prompt.system }] },
      contents: prompt.messages.map((message) => ({
        role: message.role === "assistant" ? "model" : "user",
        parts: [{ text: message.content }],
      })),
      generationConfig: {
        maxOutputTokens: prompt.maxTokens ?? 1200,
        temperature: prompt.temperature ?? 0.5,
        // 2.5/3.x Flash "think" first and the thoughts are billed against
        // maxOutputTokens — without this the answer comes back empty.
        thinkingConfig: /gemini-2\.5/.test(model) ? { thinkingBudget: 0 } : { thinkingLevel: "low" },
      },
    }),
    extract: geminiExtract,
  },
  {
    id: "groq",
    label: "Groq",
    kind: "own-key",
    url: () => "https://api.groq.com/openai/v1/chat/completions",
    models: ["openai/gpt-oss-120b", "openai/gpt-oss-20b", "llama-3.3-70b-versatile", "llama-3.1-8b-instant"],
    key: byokKey("groq"),
    headers: jsonHeaders,
    body: (model, prompt) => openAiBody(model, prompt, lowEffort(model)),
    extract: openAiExtract,
  },
  {
    id: "cerebras",
    label: "Cerebras",
    kind: "own-key",
    url: () => "https://api.cerebras.ai/v1/chat/completions",
    models: ["gpt-oss-120b", "qwen-3.8-27b", "llama-3.3-70b"],
    key: byokKey("cerebras"),
    headers: jsonHeaders,
    body: (model, prompt) => openAiBody(model, prompt, lowEffort(model)),
    extract: openAiExtract,
  },
  {
    id: "openrouter",
    label: "OpenRouter",
    kind: "own-key",
    url: () => "https://openrouter.ai/api/v1/chat/completions",
    models: ["openai/gpt-oss-120b", "meta-llama/llama-3.3-70b-instruct", "google/gemini-2.5-flash"],
    key: byokKey("openrouter"),
    headers: (key) => ({
      ...jsonHeaders(key),
      // Optional attribution OpenRouter asks browser clients for.
      "x-title": "Study Planner Pro",
    }),
    body: (model, prompt) => openAiBody(model, prompt, lowEffort(model)),
    extract: openAiExtract,
  },
  {
    id: "mistral",
    label: "Mistral",
    kind: "own-key",
    url: () => "https://api.mistral.ai/v1/chat/completions",
    models: ["mistral-small-latest", "mistral-medium-latest", "ministral-8b-latest"],
    key: byokKey("mistral"),
    headers: jsonHeaders,
    body: (model, prompt) => openAiBody(model, prompt),
    extract: openAiExtract,
  },
  {
    id: "sambanova",
    label: "SambaNova",
    kind: "own-key",
    url: () => "https://api.sambanova.ai/v1/chat/completions",
    models: ["Meta-Llama-3.3-70B-Instruct", "gpt-oss-120b"],
    key: byokKey("sambanova"),
    headers: jsonHeaders,
    body: (model, prompt) => openAiBody(model, prompt, lowEffort(model)),
    extract: openAiExtract,
  },
  {
    id: "cohere",
    label: "Cohere",
    kind: "own-key",
    url: () => "https://api.cohere.com/v2/chat",
    models: ["command-a-03-2025", "command-r-plus-08-2024", "command-r-08-2024"],
    key: byokKey("cohere"),
    headers: jsonHeaders,
    body: (model, prompt) => openAiBody(model, prompt),
    extract: (json) => {
      const fromChoices = openAiExtract(json);
      if (fromChoices.text) return fromChoices;
      const text = typeof json?.text === "string" ? json.text : null;
      return { text: text && text.trim() ? text : null, blocked: false };
    },
  },
];

/* ── free community legs (no key, no signup) ─────────────────
   Used ONLY when neither the deployment nor the learner has a key, or
   when every keyed leg failed. All three are OpenAI-compatible,
   anonymous and per-IP rate limited, which is exactly right for one
   learner chatting from their own device (and wrong for a shared
   server IP — another reason this runs in the browser).

   • OVHcloud AI Endpoints — anonymous tier, 2 requests/min per IP per
     model, EU-hosted, documents that it does not store user data, and
     serves the strongest open models of the three.
   • Kilo Gateway — anonymous aggregator of `:free` routes, about 200
     requests/hour per IP. Upstream providers may log prompts.
   • Pollinations — anonymous tier, one request per 15 s per IP, the
     most browser-friendly of the three (they ship a React client).

   Model lists were checked against each vendor's live /models listing
   in September 2026. A retired id costs one fast 404 and the chain
   moves on, exactly like the server catalogue in ai.ts. */
const FREE_LEGS: LegSpec[] = [
  {
    id: "ovh",
    label: "OVHcloud AI Endpoints (free)",
    kind: "free",
    url: () => "https://oai.endpoints.kepler.ai.cloud.ovh.net/v1/chat/completions",
    models: [
      "gpt-oss-120b",
      "Qwen3.5-397B-A17B",
      "Meta-Llama-3_3-70B-Instruct",
      "Qwen3.6-27B",
      "Mistral-Small-3.2-24B-Instruct-2506",
      "gpt-oss-20b",
    ],
    headers: jsonHeaders,
    body: (model, prompt) => openAiBody(model, prompt, lowEffort(model)),
    extract: openAiExtract,
  },
  {
    id: "kilo",
    label: "Kilo Gateway (free)",
    kind: "free",
    url: () => "https://api.kilo.ai/api/gateway/chat/completions",
    models: [
      "kilo-auto/free",
      "nex-agi/nex-n2.5-pro:free",
      "inclusionai/ling-3.0-flash-vl:free",
      "poolside/laguna-s-2.1:free",
      "nvidia/nemotron-3-ultra-550b-a55b:free",
    ],
    headers: jsonHeaders,
    body: (model, prompt) => openAiBody(model, prompt, { include_reasoning: false }),
    extract: openAiExtract,
  },
  {
    id: "pollinations",
    label: "Pollinations (free)",
    kind: "free",
    url: () => "https://text.pollinations.ai/openai",
    models: ["openai-fast", "openai", "gpt-oss"],
    headers: jsonHeaders,
    body: (model, prompt) =>
      openAiBody(model, prompt, {
        ...lowEffort(model),
        // Identifies the app to the free tier and keeps the exchange out
        // of the public feed.
        referrer: "study-planner-pro",
        private: true,
      }),
    extract: openAiExtract,
  },
];

const ALL_LEGS: LegSpec[] = [...OWN_KEY_LEGS, ...FREE_LEGS];
const LEG_BY_ID = new Map(ALL_LEGS.map((leg) => [leg.id, leg]));

/* ── free-bridge preference ────────────────────────────────── */

const PREF_KEY = "spp.ai.freeBridge.v1";
const FAILURE_KEY = "spp.ai.bridge.failures.v1";
const STICKY_KEY = "spp.ai.bridge.sticky.v1";
const CHANGED_EVENT = "spp-ai-bridge-changed";

export type FreeBridgePreference = "on" | "off";

/* Operator kill-switch. A deployment owner who does not want their learners'
   questions reaching a public relay sets AI_FREE_BRIDGE=off in the server
   environment; /api/ai-status reports it and the browser obeys it, whatever
   the learner's own preference says. Default: allowed. */
let operatorAllowsFreeBridge = true;

export function setFreeBridgeAllowedByOperator(allowed: boolean | undefined | null): boolean {
  operatorAllowsFreeBridge = allowed !== false;
  return operatorAllowsFreeBridge;
}

export function freeBridgeAllowedByOperator(): boolean {
  return operatorAllowsFreeBridge;
}

function storage(kind: "local" | "session"): Storage | null {
  if (typeof window === "undefined") return null;
  try {
    return kind === "local" ? window.localStorage : window.sessionStorage;
  } catch {
    return null;
  }
}

export function freeBridgePreference(): FreeBridgePreference {
  const stored = storage("local")?.getItem(PREF_KEY);
  return stored === "off" ? "off" : "on";
}

export function setFreeBridgePreference(value: FreeBridgePreference): FreeBridgePreference {
  const local = storage("local");
  try {
    if (value === "on") local?.removeItem(PREF_KEY);
    else local?.setItem(PREF_KEY, "off");
  } catch {
    /* storage blocked — the choice lasts for this tab only */
  }
  if (value === "off") clearBridgeFailures();
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent<FreeBridgePreference>(CHANGED_EVENT, { detail: value }));
  }
  return value;
}

export function freeBridgeEnabled(): boolean {
  return operatorAllowsFreeBridge && freeBridgePreference() === "on";
}

/** Subscribe to free-bridge preference changes (Settings toggle). */
export function onBridgeChange(handler: () => void): () => void {
  if (typeof window === "undefined") return () => {};
  const listener = () => handler();
  window.addEventListener(CHANGED_EVENT, listener);
  window.addEventListener("storage", listener);
  return () => {
    window.removeEventListener(CHANGED_EVENT, listener);
    window.removeEventListener("storage", listener);
  };
}

/** What this browser can reach right now, without any network call. */
export function bridgeAvailability(): {
  ownKeyLegs: { id: string; label: string }[];
  freeLegs: { id: string; label: string }[];
  canBridge: boolean;
  /** False when the deployment switched the free relays off for everyone. */
  freeAllowed: boolean;
} {
  const ownKeyLegs = OWN_KEY_LEGS.filter((leg) => leg.key?.()).map((leg) => ({ id: leg.id, label: leg.label }));
  const freeLegs = freeBridgeEnabled()
    ? FREE_LEGS.map((leg) => ({ id: leg.id, label: leg.label }))
    : [];
  return {
    ownKeyLegs,
    freeLegs,
    canBridge: ownKeyLegs.length + freeLegs.length > 0,
    freeAllowed: operatorAllowsFreeBridge,
  };
}

/* ── failure memory (per tab) ────────────────────────────────
   A leg that cannot be reached from THIS browser — blocked by CORS,
   offline, rejected key — must not be paid for on every message. The
   server keeps the same kind of memory in ai.ts; this is its mirror,
   scoped to the tab so a laptop waking from sleep re-tries quickly. */
const FAILURE_TTL_MS: Record<BridgeError, number> = {
  network: 15 * 60_000, // unreachable / CORS-blocked host
  timeout: 5 * 60_000,
  auth: 10 * 60_000,
  rate_limit: 60_000,
  model: 30 * 60_000,
  empty: 5 * 60_000,
  blocked: 30 * 60_000,
  provider: 2 * 60_000,
};

type FailureMap = Record<string, { until: number; reason: BridgeError }>;

function readFailures(): FailureMap {
  const raw = storage("session")?.getItem(FAILURE_KEY);
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw) as FailureMap;
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function writeFailures(map: FailureMap) {
  try {
    storage("session")?.setItem(FAILURE_KEY, JSON.stringify(map));
  } catch {
    /* storage blocked — memory lasts for this call only */
  }
}

export function clearBridgeFailures() {
  try {
    storage("session")?.removeItem(FAILURE_KEY);
    storage("session")?.removeItem(STICKY_KEY);
  } catch {
    /* nothing to clear */
  }
}

function benched(id: string): BridgeError | null {
  const entry = readFailures()[id];
  if (!entry) return null;
  if (entry.until <= Date.now()) return null;
  return entry.reason;
}

function bench(id: string, reason: BridgeError) {
  const map = readFailures();
  map[id] = { until: Date.now() + (FAILURE_TTL_MS[reason] ?? 60_000), reason };
  writeFailures(map);
}

function unbench(prefix: string) {
  const map = readFailures();
  let changed = false;
  for (const id of Object.keys(map)) {
    if (id === prefix || id.startsWith(`${prefix}:`)) {
      delete map[id];
      changed = true;
    }
  }
  if (changed) writeFailures(map);
}

/** Providers/models currently skipped, for the Settings diagnostics row. */
export function bridgeCooldowns(): { leg: string; model: string | null; reason: BridgeError; secondsLeft: number }[] {
  const now = Date.now();
  return Object.entries(readFailures())
    .filter(([, entry]) => entry.until > now)
    .map(([id, entry]) => {
      const [leg, model = null] = id.split(":");
      return { leg, model, reason: entry.reason, secondsLeft: Math.ceil((entry.until - now) / 1000) };
    });
}

function stickyLeg(): string | null {
  const id = storage("session")?.getItem(STICKY_KEY) || null;
  return id && LEG_BY_ID.has(id) ? id : null;
}

function setStickyLeg(id: string) {
  try {
    storage("session")?.setItem(STICKY_KEY, id);
  } catch {
    /* non-fatal */
  }
}

/** Legs this browser may use, own keys first, sticky winner promoted. */
function usableLegs(options: { includeFree?: boolean } = {}): LegSpec[] {
  const includeFree = operatorAllowsFreeBridge && (options.includeFree ?? freeBridgeEnabled());
  const legs = ALL_LEGS.filter((leg) => (leg.kind === "free" ? includeFree : !!leg.key?.()));
  const sticky = stickyLeg();
  if (!sticky) return legs;
  const winner = legs.find((leg) => leg.id === sticky);
  return winner ? [winner, ...legs.filter((leg) => leg.id !== sticky)] : legs;
}

function classify(status: number, detail: string): BridgeError {
  if (status === 401 || status === 403) return "auth";
  if (status === 429) return "rate_limit";
  if (status === 404 || status === 400 || status === 422) {
    return /model|not found|unsupported|invalid/i.test(detail) ? "model" : "provider";
  }
  if (status >= 500) return "provider";
  return "provider";
}

async function postLeg(
  leg: LegSpec,
  model: string,
  prompt: BridgePrompt,
  timeoutMs: number,
  signal?: AbortSignal
): Promise<{ status: number; json: any; detail: string }> {
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(new DOMException("Timeout", "TimeoutError")), timeoutMs);
  const onOuterAbort = () => controller.abort(signal?.reason);
  signal?.addEventListener("abort", onOuterAbort, { once: true });
  try {
    const key = leg.key?.() ?? null;
    const response = await fetch(leg.url(model), {
      method: "POST",
      headers: leg.headers(key),
      body: JSON.stringify(leg.body(model, prompt, key)),
      signal: controller.signal,
      // A CORS-blocked host surfaces as a TypeError, not a status code —
      // that is the "this leg cannot run in a browser" signal we bench.
      cache: "no-store",
    });
    const raw = await response.text();
    let json: any = null;
    let detail = raw.slice(0, 400);
    try {
      json = raw ? JSON.parse(raw) : null;
      if (json && typeof json === "object") {
        detail = String(json?.error?.message || json?.message || json?.detail || detail).slice(0, 400);
      }
    } catch {
      /* non-JSON body: `detail` already holds the raw prefix */
    }
    return { status: response.status, json, detail };
  } finally {
    window.clearTimeout(timer);
    signal?.removeEventListener("abort", onOuterAbort);
  }
}

export type CallBridgeOptions = {
  /** Skip the free community legs even if the learner left them on. */
  ownKeysOnly?: boolean;
  /** Total budget across every leg (ms). */
  budgetMs?: number;
  signal?: AbortSignal;
  onAttempt?: (attempt: BridgeAttempt) => void;
};

/**
 * Ask the cloud from the browser. Walks own-key legs first, then the free
 * community legs, skipping anything the failure memory has benched, and
 * returns the first non-empty answer. `text === null` means "nothing could
 * answer from here" — the caller then falls back to the server route, which
 * still has its own provider chain and the on-device engine.
 */
export async function callBridge(prompt: BridgePrompt, options: CallBridgeOptions = {}): Promise<BridgeResult> {
  const attempts: BridgeAttempt[] = [];
  const empty: BridgeResult = { text: null, leg: null, label: null, kind: null, model: null, attempts };
  if (typeof window === "undefined") return empty;

  const budgetMs = Math.max(4_000, Math.min(90_000, options.budgetMs ?? 40_000));
  const deadline = Date.now() + budgetMs;
  const legs = usableLegs({ includeFree: options.ownKeysOnly ? false : undefined });
  if (!legs.length) return empty;

  const safePrompt: BridgePrompt = {
    system: String(prompt.system || "").slice(0, 24_000),
    messages: (prompt.messages || []).slice(-12).map((message) => ({
      role: message.role === "assistant" ? ("assistant" as const) : ("user" as const),
      content: String(message.content || "").slice(0, 8_000),
    })),
    maxTokens: Math.max(64, Math.min(2_048, Math.round(prompt.maxTokens ?? 1_200))),
    temperature: Number.isFinite(prompt.temperature) ? Math.max(0, Math.min(1.4, Number(prompt.temperature))) : 0.5,
  };

  let firstAttempt = true;
  for (const leg of legs) {
    if (Date.now() >= deadline) break;
    if (benched(leg.id) === "auth" || benched(leg.id) === "network") continue;

    for (const model of leg.models) {
      if (Date.now() >= deadline - 400) break;
      if (benched(`${leg.id}:${model}`)) continue;
      const started = Date.now();
      const timeoutMs = Math.min(firstAttempt ? 22_000 : 14_000, deadline - Date.now());
      firstAttempt = false;
      try {
        const { status, json, detail } = await postLeg(leg, model, safePrompt, timeoutMs, options.signal);
        const ms = Date.now() - started;
        if (status >= 200 && status < 300) {
          const { text, blocked } = leg.extract(json);
          if (text) {
            attempts.push({ leg: leg.id, model, status, error: null, ms });
            options.onAttempt?.(attempts[attempts.length - 1]);
            unbench(leg.id);
            setStickyLeg(leg.id);
            return { text, leg: leg.id, label: leg.label, kind: leg.kind, model, attempts };
          }
          attempts.push({ leg: leg.id, model, status, error: blocked ? "blocked" : "empty", ms });
          options.onAttempt?.(attempts[attempts.length - 1]);
          bench(`${leg.id}:${model}`, blocked ? "blocked" : "empty");
          continue;
        }
        const error = classify(status, detail);
        attempts.push({ leg: leg.id, model, status, error, ms });
        options.onAttempt?.(attempts[attempts.length - 1]);
        bench(`${leg.id}:${model}`, error);
        // A rejected key poisons every model on that leg.
        if (error === "auth") bench(leg.id, "auth");
        if (error !== "rate_limit" && error !== "model") break;
      } catch (error) {
        const ms = Date.now() - started;
        const timedOut = error instanceof DOMException && error.name === "TimeoutError";
        const kind: BridgeError = timedOut ? "timeout" : "network";
        attempts.push({ leg: leg.id, model, status: null, error: kind, ms });
        options.onAttempt?.(attempts[attempts.length - 1]);
        // A thrown fetch is either offline or a CORS refusal. Both are
        // properties of the HOST, so bench the whole leg, not the model.
        bench(leg.id, kind);
        break;
      }
    }
  }
  return empty;
}

/**
 * Live connectivity test for Settings → AI coach: one tiny real request per
 * usable leg, from this browser. This is the only test that can tell the
 * learner the truth when the server itself has no outbound network.
 */
export async function probeBridge(options: { ownKeysOnly?: boolean; timeoutMs?: number } = {}): Promise<BridgeProbe[]> {
  if (typeof window === "undefined") return [];
  const legs = usableLegs({ includeFree: options.ownKeysOnly ? false : undefined });
  const probes: BridgeProbe[] = [];
  for (const leg of legs) {
    const started = Date.now();
    const prompt: BridgePrompt = {
      system: "Reply with the single word: OK",
      messages: [{ role: "user", content: "ping" }],
      maxTokens: 8,
      temperature: 0,
    };
    try {
      const model = leg.models[0];
      const { status, json, detail } = await postLeg(leg, model, prompt, options.timeoutMs ?? 15_000);
      const latencyMs = Date.now() - started;
      if (status >= 200 && status < 300) {
        const { text, blocked } = leg.extract(json);
        if (text) {
          unbench(leg.id);
          probes.push({ id: leg.id, label: leg.label, kind: leg.kind, ok: true, model, latencyMs, error: null, detail: `${leg.label} answered from this browser.` });
          continue;
        }
        probes.push({ id: leg.id, label: leg.label, kind: leg.kind, ok: false, model, latencyMs, error: blocked ? "blocked" : "empty", detail: blocked ? "The request was blocked by the provider." : "The provider answered with an empty message." });
        continue;
      }
      const error = classify(status, detail);
      probes.push({
        id: leg.id, label: leg.label, kind: leg.kind, ok: false, model,
        latencyMs: Date.now() - started, error,
        detail: error === "auth"
          ? "That key was rejected. Check it in the provider's dashboard."
          : error === "rate_limit"
            ? "Rate limited — the free tier allows a request every few seconds."
            : `${status}: ${detail.slice(0, 160)}`,
      });
    } catch {
      probes.push({
        id: leg.id, label: leg.label, kind: leg.kind, ok: false, model: leg.models[0],
        latencyMs: Date.now() - started, error: "network",
        detail: leg.kind === "free"
          ? "This browser could not reach the free endpoint (offline, or the host refuses browser requests)."
          : "This browser could not reach the provider (offline, or the host refuses browser requests). The server will still try it.",
      });
    }
  }
  return probes;
}

/** Short learner-safe wording for what just answered. */
export function bridgeSourceLabel(result: BridgeResult): string | null {
  if (!result.text || !result.kind) return null;
  return result.kind === "own-key" ? "your key" : "free endpoint";
}
