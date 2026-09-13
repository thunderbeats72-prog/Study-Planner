import { NextResponse } from "next/server";
import {
  activeProvider, configuredProviders, llmHealthSnapshot,
  parseRuntimeKeys, providerCooldowns, resetAiCooldowns, type RuntimeProviderKeys,
} from "@/lib/ai";
import { checkRateLimit, clearRateLimit } from "@/lib/rateLimit";
import {
  getShigunUsage, resetShigunUsage, SHIGUN_DAILY_LIMIT,
} from "@/lib/shigunUsage";
import { getOrCreateUser, keyFrom } from "@/lib/state";
import { withDbGuard } from "@/lib/routeGuard";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

/**
 * SHIGUN credit meter — one endpoint, two verbs.
 *
 * GET  — the learner's allowance for today (used/limit/remaining), plus the
 *        live provider/relay quota state the tutor is actually working with:
 *        which legs are on cooldown (rate-limited providers with seconds
 *        left), the last real request's health, and whether the free relay
 *        is allowed. No keys, no raw provider internals.
 * POST — `{ action: "reset" }` refills the allowance, forgets remembered
 *        provider failures and clears the per-minute rate-limit bucket, so a
 *        learner whose credit is exhausted can resume tutoring immediately.
 */
export const GET = withDbGuard(async function get(req: Request) {
  const user = await getOrCreateUser(keyFrom(req));
  const usage = await getShigunUsage(user.id);
  const keys = parseRuntimeKeys(req.headers.get("x-ai-keys"));
  return NextResponse.json(payload(usage, keys), { headers: { "cache-control": "no-store" } });
});

export const POST = withDbGuard(async function post(req: Request) {
  const limit = checkRateLimit(req, "shigun-usage", 10, 60_000);
  if (!limit.allowed) {
    return NextResponse.json(
      { error: "Too many resets. Wait a moment and try again.", code: "RATE_LIMITED" },
      { status: 429, headers: { "retry-after": String(limit.retryAfterSeconds) } },
    );
  }

  let body: Record<string, unknown> = {};
  try { body = (await req.json().catch(() => ({}))) as Record<string, unknown>; } catch { /* no body */ }
  if (body.action !== "reset") {
    return NextResponse.json(
      { error: "action must be \"reset\".", code: "INVALID_ACTION" },
      { status: 400 },
    );
  }

  const user = await getOrCreateUser(keyFrom(req));
  const usage = await resetShigunUsage(user.id);
  resetAiCooldowns();
  clearRateLimit(req, "chat");
  clearRateLimit(req, "shigun-usage");
  const keys = parseRuntimeKeys(req.headers.get("x-ai-keys"));
  return NextResponse.json(
    { ...payload(usage, keys), reset: true, resetAt: new Date().toISOString() },
    { headers: { "cache-control": "no-store" } },
  );
});

function payload(usage: Awaited<ReturnType<typeof getShigunUsage>>, keys: RuntimeProviderKeys) {
  return {
    usage,
    dailyLimit: SHIGUN_DAILY_LIMIT,
    mode: configuredProviders(keys).length ? "cloud-with-local-fallback" : "local-only",
    activeProvider: activeProvider(keys),
    lastRequest: llmHealthSnapshot(),
    cooldowns: providerCooldowns(keys),
    checkedAt: new Date().toISOString(),
  };
}
