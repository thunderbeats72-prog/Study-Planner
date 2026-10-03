import { NextResponse } from "next/server";
import { googleOAuthConfig, googleStart } from "@/lib/google";
import { checkRateLimit } from "@/lib/rateLimit";

export const dynamic = "force-dynamic";

/**
 * GET /api/auth/google/start - begin Google sign-in.
 *
 * Issues the state + PKCE pair (short-lived HttpOnly cookies, so the
 * callback can prove the redirect it is answering is the one THIS browser
 * started) and sends the learner to Google's consent screen.
 *
 * With the OAuth env vars unset this route simply 404s its reason, and the
 * sign-in screen never renders the button that would reach it: a missing
 * feature must be invisible, never a dead end.
 */
export async function GET(req: Request) {
  const config = googleOAuthConfig(req);
  if (!config) {
    return NextResponse.json(
      {
        error: "Google sign-in is not configured on this deployment. Use your username and password instead.",
        code: "GOOGLE_NOT_CONFIGURED",
      },
      { status: 404 },
    );
  }
  const limit = checkRateLimit(req, "auth-google-start", 30, 10 * 60_000);
  if (!limit.allowed) {
    return NextResponse.json(
      { error: "Too many attempts. Please wait a few minutes and try again.", code: "RATE_LIMITED" },
      { status: 429 },
    );
  }
  const start = googleStart(req, config);
  const headers = new Headers();
  for (const cookie of start.cookies) headers.append("set-cookie", cookie);
  headers.set("location", start.url);
  return new NextResponse(null, { status: 302, headers });
}
