import { NextResponse } from "next/server";
import { changeUsername, publicAccount, requireUser } from "@/lib/auth";
import { checkRateLimit } from "@/lib/rateLimit";
import { readJsonObject, validationPayload } from "@/lib/validation";
import { guardResponse, unauthorizedResponse } from "@/lib/routeGuard";

export const dynamic = "force-dynamic";

/**
 * POST /api/auth/username - rename the account.
 *
 * Exists primarily so a Google-created account can replace its suggested
 * username ("priya.nair91+3") with something chosen, but it is open to
 * every account. Sessions key on the user id, so nothing signs out.
 */
export async function POST(req: Request) {
  const limit = checkRateLimit(req, "auth-username", 10, 60 * 60_000);
  if (!limit.allowed) {
    return NextResponse.json(
      { error: "Too many username changes. Please wait a while and try again.", code: "RATE_LIMITED" },
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

  try {
    const user = await requireUser(req);
    if (!user.username) return unauthorizedResponse();
    const updated = await changeUsername(user, body.username);
    return NextResponse.json(
      { ok: true, account: publicAccount(updated) },
      { headers: { "cache-control": "no-store" } },
    );
  } catch (error) {
    const guarded = guardResponse(error);
    if (guarded) return guarded;
    console.error("Username change failed:", error instanceof Error ? error.message : error);
    return NextResponse.json(
      { error: "Could not change the username right now. Please try again shortly.", code: "USERNAME_FAILED" },
      { status: 503 },
    );
  }
}
