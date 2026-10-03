import { NextResponse } from "next/server";
import { createAccount, publicAccount } from "@/lib/auth";
import { checkRateLimit } from "@/lib/rateLimit";
import { readJsonObject, validationPayload } from "@/lib/validation";
import { guardResponse } from "@/lib/routeGuard";
import { demoDataEnabled } from "@/lib/demoGate";

export const dynamic = "force-dynamic";

/**
 * POST /api/auth/signup - create the account that owns a study plan.
 *
 * It creates the account and stops: NO session cookie is set. The learner
 * then signs in with the credentials they just chose, which proves they
 * work before any study data depends on them. The answer carries only what
 * the sign-in form needs to greet them and pre-fill the username.
 */
export async function POST(req: Request) {
  const limit = checkRateLimit(req, "auth-signup", 6, 60 * 60_000);
  if (!limit.allowed) {
    return NextResponse.json(
      { error: "Too many accounts created from here. Please wait a while and try again.", code: "RATE_LIMITED" },
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
        error:
          "This preview has no database, so accounts cannot be created here. Add DATABASE_URL and redeploy to sign up.",
        code: "DATABASE_UNAVAILABLE",
      },
      { status: 503 },
    );
  }

  try {
    const { user, claimedExistingPlan } = await createAccount(req, {
      username: body.username,
      password: body.password,
      name: body.name,
    });
    return NextResponse.json(
      {
        created: true,
        account: publicAccount(user),
        claimedExistingPlan,
        /* What the client should do next, said out loud. */
        next: "signin",
      },
      { headers: { "cache-control": "no-store" } },
    );
  } catch (error) {
    const guarded = guardResponse(error);
    if (guarded) return guarded;
    console.error("Signup failed:", error instanceof Error ? error.message : error);
    return NextResponse.json(
      { error: "Could not create the account right now. Please try again shortly.", code: "SIGNUP_FAILED" },
      { status: 503 },
    );
  }
}
