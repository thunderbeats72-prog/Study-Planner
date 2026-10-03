import { NextResponse } from "next/server";
import { authenticate, clearSessionCookie, destroyOtherSessions, destroySession, sessionTokenFrom } from "@/lib/auth";

export const dynamic = "force-dynamic";

/**
 * POST /api/auth/logout - sign out of this device.
 *
 * `{ "everywhere": true }` also ends every other signed-in device, which is
 * the thing to do from a replacement phone after losing the old one.
 *
 * Signing out never deletes a single lesson, log or message: the plan stays
 * with the account, waiting for the next sign-in.
 */
export async function POST(req: Request) {
  const token = sessionTokenFrom(req);
  let everywhere = false;
  try {
    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    everywhere = body?.everywhere === true;
  } catch {
    /* an empty body is a plain sign-out */
  }

  if (token) {
    try {
      if (everywhere) {
        const auth = await authenticate(req);
        if (auth) await destroyOtherSessions(auth.user.id, null);
      }
      await destroySession(token);
    } catch (error) {
      // The cookie is cleared regardless - a learner pressing "Sign out"
      // must end up signed out of this browser even if the database blinks.
      console.error("Logout cleanup failed:", error instanceof Error ? error.message : error);
    }
  }

  return NextResponse.json(
    { ok: true },
    { headers: { "set-cookie": clearSessionCookie(req), "cache-control": "no-store" } },
  );
}
