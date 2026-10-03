import { NextResponse } from "next/server";
import { sessionCookie, signInWithGoogle } from "@/lib/auth";
import {
  checkOAuthState,
  exchangeCode,
  googleOAuthConfig,
  oauthVerifierFrom,
  originFrom,
  verifyIdToken,
} from "@/lib/google";

export const dynamic = "force-dynamic";

/**
 * GET /api/auth/google/callback - finish Google sign-in.
 *
 * The redirect comes back as a top-level navigation, so success is a
 * redirect to the app with a session cookie - exactly what a fresh
 * browser-tab sign-in would look like. Every failure is a redirect to the
 * sign-in screen with a short?code, because the browser's address bar is
 * where the learner learns what happened. Nothing here ever 500s a person
 * into a JSON blob.
 */
export async function GET(req: Request) {
  const home = (code?: string) =>
    NextResponse.redirect(`${originFrom(req)}/${code ? `?signin=google&reason=${encodeURIComponent(code)}` : ""}`, 302);

  const config = googleOAuthConfig(req);
  if (!config) return home("not_configured");

  const url = new URL(req.url);
  const error = url.searchParams.get("error");
  if (error) return home(error === "access_denied" ? "cancelled" : "google_error");

  const code = url.searchParams.get("code") || "";
  const echoedState = url.searchParams.get("state");
  if (!checkOAuthState(req, echoedState)) {
    /* The single most important check in the flow: an answer that does not
       match THIS browser's state cookie is CSRF, a replay, or a pasted URL,
       and none of them gets a session. */
    return home("state_mismatch");
  }
  const verifier = oauthVerifierFrom(req);
  if (!code || !verifier) return home("expired");

  try {
    const { idToken } = await exchangeCode(config, code, verifier);
    const claims = await verifyIdToken(idToken, config.clientId);
    const { token } = await signInWithGoogle(req, {
      sub: claims.sub,
      email: claims.email,
      emailVerified: claims.emailVerified,
      displayName: claims.displayName,
    });
    const response = home();
    response.headers.set("set-cookie", sessionCookie(req, token));
    return response;
  } catch (failure) {
    const message = failure instanceof Error ? failure.message : String(failure);
    console.error("Google sign-in failed:", message);
    if (/already on another account/i.test(message)) return home("email_taken");
    if (/confirm that you own this email/i.test(message)) return home("email_unverified");
    return home("failed");
  }
}
