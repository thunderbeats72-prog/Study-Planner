import { NextResponse } from "next/server";
import { buildContext, dateFrom, fullState } from "@/lib/state";
import { activeProvider } from "@/lib/ai";
import { publicAccount, requireUser, sessionCookie, SESSION_TTL_DAYS, authenticate } from "@/lib/auth";
import { guardResponse } from "@/lib/routeGuard";

export const dynamic = "force-dynamic";

/**
 * GET /api/state - everything the app paints, for the SIGNED-IN account.
 *
 * This is the boot call, so it is also where a session quietly renews: an
 * account used every day keeps sliding its expiry forward and never meets a
 * surprise sign-out mid-term. Without a session it answers 401 and the app
 * shows the sign-in screen rather than an error.
 */
export async function GET(req: Request) {
  try {
    const auth = await authenticate(req);
    // `requireUser` also covers the database-less preview learner, so the
    // sandbox preview still renders when there is nowhere to keep accounts.
    const user = auth?.user ?? (await requireUser(req));
    const state = await fullState(user.userKey);
    const headers: Record<string, string> = { "cache-control": "no-store" };
    if (auth?.refreshedToken) {
      headers["set-cookie"] = sessionCookie(req, auth.refreshedToken, SESSION_TTL_DAYS * 86_400);
    }
    return NextResponse.json(
      {
        ...state,
        context: buildContext(state, dateFrom(req)),
        aiProvider: activeProvider(),
        account: publicAccount(user),
      },
      { headers },
    );
  } catch (error) {
    const guarded = guardResponse(error);
    if (guarded) return guarded;
    const message = error instanceof Error && /DATABASE_URL/.test(error.message)
      ? "The database is not configured. Add DATABASE_URL (see .env.example) and redeploy."
      : "The study planner database is temporarily unavailable. Please try again shortly.";
    console.error("State route failed:", error instanceof Error ? error.message : error);
    return NextResponse.json({ error: message, code: "DATABASE_UNAVAILABLE" }, { status: 503 });
  }
}
