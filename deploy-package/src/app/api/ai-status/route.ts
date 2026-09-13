import { NextResponse } from "next/server";
import {
  configuredProviders, envConfiguredProviderIds, llmHealthSnapshot,
  probeProviders, activeProvider, parseRuntimeKeys, hasRuntimeKeys, providerCooldowns,
} from "@/lib/ai";
import { checkRateLimit } from "@/lib/rateLimit";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

/**
 * GET  — cheap, cache-free snapshot: which providers the deployment's
 *        environment configured and what the last real tutor request did.
 *        Never returns keys.
 * POST — live connectivity probe (operator tool): one tiny real request to
 *        EVERY configured provider, with per-provider status, latency and a
 *        sanitised reason. Distinguishes a rejected key, a retired model, a
 *        rate limit, a timeout and a network block from each other.
 */
export async function GET(req: Request) {
  const runtimeKeys = parseRuntimeKeys(req.headers.get("x-ai-keys"));
  const providers = configuredProviders(runtimeKeys);
  /* Env-only view: exactly what the DEPLOYMENT configured, which is what
     every learner on it shares. Ids, not labels — the client matches on ids. */
  const serverIds = envConfiguredProviderIds();
  return NextResponse.json({
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
  // Generous: this is the "is the deployment's key working?" check, and an
  // operator fixing a key legitimately tests, edits, and tests again. Only
  // *configured* providers are actually contacted, so the cost stays
  // proportional to the keys present.
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
