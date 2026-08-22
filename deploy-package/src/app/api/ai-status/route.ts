import { NextResponse } from "next/server";
import { configuredProviders, llmHealthSnapshot, probeProviders, activeProvider } from "@/lib/ai";
import { checkRateLimit } from "@/lib/rateLimit";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

/**
 * GET  — cheap, cache-free snapshot: which providers are configured and what
 *        the last real tutor request did. Never returns keys.
 * POST — live connectivity probe: one tiny real request to EVERY configured
 *        provider, with per-provider status, latency and a sanitised reason.
 *        This is the "look into the connectivity of Gemini / Groq / Grok /
 *        OpenRouter" endpoint — it distinguishes a rejected key, a retired
 *        model, a rate limit, a timeout and a network block from each other.
 */
export async function GET() {
  const providers = configuredProviders();
  return NextResponse.json({
    mode: providers.length ? "cloud-with-local-fallback" : "local-only",
    activeProvider: activeProvider(),
    configuredProviders: providers,
    lastRequest: llmHealthSnapshot(),
    checkedAt: new Date().toISOString(),
  }, { headers: { "cache-control": "no-store" } });
}

export async function POST(req: Request) {
  const limit = checkRateLimit(req, "ai-status", 6, 60_000);
  if (!limit.allowed) {
    return NextResponse.json(
      { error: "Too many connectivity tests. Wait a moment and try again.", code: "RATE_LIMITED" },
      { status: 429, headers: { "retry-after": String(limit.retryAfterSeconds) } }
    );
  }
  try {
    const probes = await probeProviders();
    const anyOk = probes.some((probe) => probe.ok);
    // Keep the shared health snapshot honest for /api/health consumers.
    return NextResponse.json({
      ok: anyOk,
      probes,
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
