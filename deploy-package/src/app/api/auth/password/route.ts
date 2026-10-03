import { NextResponse } from "next/server";
import { changePassword, publicAccount, requireUser } from "@/lib/auth";
import { checkRateLimit } from "@/lib/rateLimit";
import { readJsonObject, validationPayload } from "@/lib/validation";
import { guardResponse, unauthorizedResponse } from "@/lib/routeGuard";

export const dynamic = "force-dynamic";

/**
 * POST /api/auth/password - change the password of the signed-in account.
 *
 * Succeeding here signs out every OTHER device: changing a password is how
 * a learner takes access back, so the old password must stop working
 * everywhere, immediately.
 */
export async function POST(req: Request) {
  const limit = checkRateLimit(req, "auth-password", 10, 60 * 60_000);
  if (!limit.allowed) {
    return NextResponse.json(
      { error: "Too many password changes. Please wait a while and try again.", code: "RATE_LIMITED" },
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
    if (!user.username || !user.passwordHash) return unauthorizedResponse();
    const { signedOutDevices } = await changePassword(req, user, {
      currentPassword: body.currentPassword,
      newPassword: body.newPassword,
    });
    return NextResponse.json(
      { ok: true, signedOutDevices, account: publicAccount(user) },
      { headers: { "cache-control": "no-store" } },
    );
  } catch (error) {
    const guarded = guardResponse(error);
    if (guarded) return guarded;
    console.error("Password change failed:", error instanceof Error ? error.message : error);
    return NextResponse.json(
      { error: "Could not change the password right now. Please try again shortly.", code: "PASSWORD_FAILED" },
      { status: 503 },
    );
  }
}
