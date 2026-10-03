import { NextResponse } from "next/server";
import { publicAccount, sessionCookie, signIn } from "@/lib/auth";
import { buildContext, dateFrom, fullState } from "@/lib/state";
import { checkRateLimit } from "@/lib/rateLimit";
import { readJsonObject, validationPayload } from "@/lib/validation";
import { guardResponse } from "@/lib/routeGuard";
import { demoDataEnabled } from "@/lib/demoGate";

export const dynamic = "force-dynamic";

/**
 * POST /api/auth/login - sign in on this device.
 *
 * On success the learner's whole plan comes back with the response: the
 * phone that just signed in paints the same dashboard the laptop shows,
 * in one request.
 */
export async function POST(req: Request) {
  // Brute force is bounded in two places: here (per device/IP) and on the
  // account itself (see MAX_FAILED_LOGINS in src/lib/auth.ts).
  const limit = checkRateLimit(req, "auth-login", 15, 10 * 60_000);
  if (!limit.allowed) {
    return NextResponse.json(
      { error: "Too many sign-in attempts. Please wait a few minutes and try again.", code: "RATE_LIMITED" },
      { status: 429, headers: { "retry-after": String(limit.retryAfterSeconds) } },
    );
  }

  let body: Record<string, unknown>;
  try {
    body = await readJsonObject(req, 8_000);
  } catch (error) {
    const payload = validationPayload(error);
    return NextResponse.json({ error: payload.error, code: payload.code }, { status: payload.status });
  }

  if (demoDataEnabled()) {
    return NextResponse.json(
      {
        error: "This preview has no database, so there are no accounts to sign in to.",
        code: "DATABASE_UNAVAILABLE",
      },
      { status: 503 },
    );
  }

  try {
    const { user, token } = await signIn(req, { username: body.username, password: body.password });
    const state = await fullState(user.userKey);
    return NextResponse.json(
      { ...state, context: buildContext(state, dateFrom(req)), account: publicAccount(user) },
      { headers: { "set-cookie": sessionCookie(req, token), "cache-control": "no-store" } },
    );
  } catch (error) {
    const guarded = guardResponse(error);
    if (guarded) return guarded;
    console.error("Login failed:", error instanceof Error ? error.message : error);
    return NextResponse.json(
      { error: "Could not sign in right now. Please try again shortly.", code: "LOGIN_FAILED" },
      { status: 503 },
    );
  }
}
