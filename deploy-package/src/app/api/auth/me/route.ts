import { NextResponse } from "next/server";
import { authenticate, publicAccount, sessionCookie, SESSION_TTL_DAYS } from "@/lib/auth";
import { demoDataEnabled } from "@/lib/demoGate";

export const dynamic = "force-dynamic";

/**
 * GET /api/auth/me - "who is signed in on this device?"
 *
 * The sign-in screen asks this before it paints, so a returning phone goes
 * straight into the plan instead of flashing a login form. It never fails
 * loudly: a database problem answers "nobody is signed in" with a reason,
 * which the screen can show calmly.
 */
export async function GET(req: Request) {
  try {
    const auth = await authenticate(req);
    if (!auth) {
      return NextResponse.json(
        { authenticated: false, account: null, preview: demoDataEnabled(), accountsReady: true },
        { headers: { "cache-control": "no-store" } },
      );
    }
    const headers: Record<string, string> = { "cache-control": "no-store" };
    // A session that slid forward refreshes the browser cookie too, so a
    // learner who uses the app every day is never signed out mid-term.
    if (auth.refreshedToken) {
      headers["set-cookie"] = sessionCookie(req, auth.refreshedToken, SESSION_TTL_DAYS * 86_400);
    }
    return NextResponse.json(
      { authenticated: true, account: publicAccount(auth.user), preview: false, accountsReady: true },
      { headers },
    );
  } catch (error) {
    console.error("Account lookup failed:", error instanceof Error ? error.message : error);
    return NextResponse.json(
      {
        authenticated: false,
        account: null,
        preview: demoDataEnabled(),
        accountsReady: false,
        error: "Accounts are unavailable because the database could not be reached.",
      },
      { headers: { "cache-control": "no-store" } },
    );
  }
}
