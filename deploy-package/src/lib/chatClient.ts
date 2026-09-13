"use client";

/* ============================================================
   CHAT TRANSPORT — picks the route that can actually answer
   ────────────────────────────────────────────────────────────
   One function owns "how does this message reach a model?". The
   page used to POST /api/chat and hope; when the server had no key
   (or no outbound network at all, as in a sandboxed preview) every
   open-ended question fell through to the on-device engine and the
   learner was told the AI was not connected.

   Order of preference, most private first:
     1. deployment env keys  → the server chain in lib/ai.ts
     2. learner's own key    → the browser bridge (lib/aiBridge.ts)
     3. free community legs  → the browser bridge, opt-out in Settings
     4. on-device ML engine  → the server's local tutor

   The server still owns grounding, action extraction, replanning and
   persistence: the browser only carries the model call.
============================================================ */

import { api } from "./client";
import type { AppState } from "./client";
import {
  bridgeAvailability, callBridge, setFreeBridgeAllowedByOperator, type BridgePrompt,
} from "./aiBridge";

export type ChatAiMeta = {
  source: string;
  model: string | null;
  degraded: boolean;
  /** Learner-safe wording only. */
  notice?: string;
  code?: string;
  retryable?: boolean;
  /** Where the answer came from: "server" | "browser-own-key" | "browser-free". */
  via?: string;
};

export type ChatReply = {
  reply: string;
  action: { type: string; payload?: unknown } | null;
  state: AppState;
  replanned?: boolean;
  ai?: ChatAiMeta;
  /** prepare-mode: the browser is expected to make the model call. */
  needsCloud?: boolean;
  prompt?: BridgePrompt;
};

type StatusLite = {
  mode: string;
  serverProviderIds: string[];
  fetchedAt: number;
};

let statusCache: StatusLite | null = null;
let statusInFlight: Promise<StatusLite> | null = null;

/**
 * Does the DEPLOYMENT have its own AI keys? Cached, and refreshed after a
 * failed answer so a key added mid-session is picked up without a reload.
 */
export async function serverAiStatus(maxAgeMs = 45_000, force = false): Promise<StatusLite> {
  const fresh = statusCache && !force && Date.now() - statusCache.fetchedAt < maxAgeMs;
  if (fresh) return statusCache as StatusLite;
  if (statusInFlight) return statusInFlight;
  statusInFlight = (async () => {
    try {
      const json = await api<{
        mode?: string;
        serverProviderIds?: string[];
        configuredProviders?: string[];
        freeBridgeAllowed?: boolean;
      }>("/api/ai-status", { method: "GET", timeoutMs: 10_000 });
      /* The deployment can forbid the free community relays for everyone
         (AI_FREE_BRIDGE=off). Learn that before deciding the route. */
      setFreeBridgeAllowedByOperator(json?.freeBridgeAllowed);
      statusCache = {
        mode: typeof json?.mode === "string" ? json.mode : "unknown",
        serverProviderIds: Array.isArray(json?.serverProviderIds) ? json.serverProviderIds : [],
        fetchedAt: Date.now(),
      };
    } catch {
      // Unreachable server: assume no deployment keys so the browser bridge
      // gets the chance to answer instead of pre-emptively giving up.
      statusCache = { mode: "unreachable", serverProviderIds: [], fetchedAt: Date.now() };
    } finally {
      statusInFlight = null;
    }
    return statusCache as StatusLite;
  })();
  return statusInFlight;
}

export function invalidateAiStatus() {
  statusCache = null;
}

type AskOptions = {
  timeoutMs?: number;
  signal?: AbortSignal;
  /** Called with a short label while the browser bridge is working. */
  onStage?: (stage: "server" | "bridge" | "finalise") => void;
};

/** What this browser can reach, in the two words the server understands. */
function bridgeHint(): "own-key" | "free" | null {
  const { ownKeyLegs, freeLegs } = bridgeAvailability();
  if (ownKeyLegs.length) return "own-key";
  return freeLegs.length ? "free" : null;
}

function postChat(payload: Record<string, unknown>, timeoutMs: number): Promise<ChatReply> {
  return api<ChatReply>("/api/chat", {
    method: "POST",
    body: JSON.stringify(payload),
    timeoutMs,
  });
}

/** Run the browser bridge against a server-prepared prompt and finalise. */
async function bridgeAndFinalise(
  message: string,
  prompt: BridgePrompt,
  options: AskOptions,
): Promise<ChatReply | null> {
  options.onStage?.("bridge");
  const bridged = await callBridge(prompt, { budgetMs: 42_000, signal: options.signal });
  if (!bridged.text) return null;
  options.onStage?.("finalise");
  return postChat(
    {
      message,
      directReply: bridged.text,
      directLeg: bridged.leg,
      directModel: bridged.model,
      directKind: bridged.kind,
      prepared: true,
      replaceLast: true,
    },
    options.timeoutMs ?? 60_000,
  );
}

/**
 * Send one tutor message and get the best answer this device can produce.
 * Drop-in replacement for `api("/api/chat", …)` in the page.
 */
export async function askTutorMessage(message: string, options: AskOptions = {}): Promise<ChatReply> {
  const timeoutMs = options.timeoutMs ?? 60_000;
  const status = await serverAiStatus(45_000);
  const serverHasCloud = status.serverProviderIds.length > 0;
  const { canBridge } = bridgeAvailability();
  const bridge = bridgeHint();

  /* No deployment key (or a preview with no server egress): let the browser
     ask the model directly. The server prepares the grounded prompt and
     finalises the answer, so persistence and actions stay server-side. */
  if (!serverHasCloud && canBridge) {
    const prepared = await postChat({ message, prepare: true, bridge }, timeoutMs);
    if (!prepared?.needsCloud || !prepared.prompt) return prepared;
    const bridged = await bridgeAndFinalise(message, prepared.prompt, options);
    if (bridged) return bridged;
    // Nothing answered from the browser — the server's on-device engine still
    // owes the learner a reply. `prepared: true` stops a duplicate user row.
    return postChat({ message, prepared: true, bridge }, timeoutMs);
  }

  options.onStage?.("server");
  const reply = await postChat({ message, bridge }, timeoutMs);

  /* The deployment HAS keys but every one of them just failed. If this
     browser can reach a provider itself, upgrade the local answer to a real
     cloud answer — `replaceLast` swaps the stored fallback reply in place so
     the history never shows two answers to one question. */
  if (reply?.ai?.degraded && canBridge) {
    try {
      const prepared = await postChat({ message, prepare: true, prepared: true, bridge }, timeoutMs);
      if (prepared?.needsCloud && prepared.prompt) {
        const upgraded = await bridgeAndFinalise(message, prepared.prompt, options);
        if (upgraded) return upgraded;
      }
    } catch {
      /* keep the server's local answer — it is already on screen */
    }
    void serverAiStatus(0, true);
  }
  return reply;
}
