import { NextResponse } from "next/server";
import {
  configuredProviders, envConfiguredProviderIds, freeBridgeAllowed, llmHealthSnapshot,
  probeProviders, activeProvider, parseRuntimeKeys, hasRuntimeKeys, providerCooldowns,
} from "@/lib/ai";
import { checkRateLimit } from "@/lib/rateLimit";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

/**
 * GET  — cheap, cache-free snapshot: which providers are configured and what
 *        the last real tutor request did. Never returns keys.
 * POST — live connectivity probe: one tiny real request to EVERY configured
 *        provider, with per-provider status, latency and a sanitised reason.
 *        Distinguishes a rejected key, a retired model, a rate limit,
 *        a timeout and a network block from each other.
 */
export async function GET(req: Request) {
  // Include any bring-your-own keys the browser sent, so Settings reflects
  // exactly what this learner's tutor will actually use.
  const runtimeKeys = parseRuntimeKeys(req.headers.get("x-ai-keys"));
  const providers = configuredProviders(runtimeKeys);
  /* Env-only view, ignoring the caller's bring-your-own keys. The browser
     bridge (lib/chatClient.ts) reads `serverProviderIds` to decide who makes
     the model call: if the deployment has its own key the server keeps the
     call; if it has none, the learner's browser asks the model directly —
     which is also the only route that works when the host has no outbound
     network at all (sandboxed previews). Ids, not labels: the client matches
     on ids and a label mismatch reads as "not connected". */
  const serverIds = envConfiguredProviderIds();
  /* Operator kill-switch for the free community relays the browser bridge can
     use (AI_FREE_BRIDGE=off). Reported here so every client obeys it without
     a rebuild, and so the Settings card can say why the switch is stuck. */
  return NextResponse.json({
    freeBridgeAllowed: freeBridgeAllowed(),
    mode: providers.length ? "cloud-with-local-fallback" : "local-only",
    activeProvider: activeProvider(runtimeKeys),
    configuredProviders: providers,
    serverProviderIds: serverIds,
    serverProviders: configuredProviders(),
    lastRequest: llmHealthSnapshot(),
    /** Providers/models the failure memory is currently skipping, with the
     *  reason and when they will be retried. Empty = nothing is benched. */
    cooldowns: providerCooldowns(runtimeKeys),
    checkedAt: new Date().toISOString(),
  }, { headers: { "cache-control": "no-store" } });
}

export async function POST(req: Request) {
  // Generous: this is the "is my key working?" button in Settings → AI
  // coach, and someone connecting a key for the first time legitimately
  // tests, fixes a paste, and tests again. Only *configured* providers are
  // actually contacted, so the cost stays proportional to the keys present.
  const limit = checkRateLimit(req, "ai-status", 20, 60_000);
  if (!limit.allowed) {
    return NextResponse.json(
      { error: "Too many connectivity tests. Wait a moment and try again.", code: "RATE_LIMITED" },
      { status: 429, headers: { "retry-after": String(limit.retryAfterSeconds) } }
    );
  }
  const runtimeKeys = parseRuntimeKeys(req.headers.get("x-ai-keys"));
  try {
    const probes = await probeProviders(runtimeKeys);
    const anyOk = probes.some((probe) => probe.ok);
    // Keep the shared health snapshot honest for /api/health consumers.
    return NextResponse.json({
      ok: anyOk,
      probes,
      cooldowns: providerCooldowns(runtimeKeys),
      usingOwnKey: hasRuntimeKeys(runtimeKeys),
      checkedAt: new Date().toISOString(),
    }, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    console.error("AI status probe failed:", error instanceof Error ? error.message : error);
    return NextResponse.json(
      { error: "The connectivity test itself failed. Try again shortly.", code: "PROBE_FAILED" },
      { status: 502 }
    );
  }
}
