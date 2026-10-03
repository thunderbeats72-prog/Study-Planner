import { NextResponse } from "next/server";
import { issueEmailToken, publicAccount, requireUser, setAccountEmail } from "@/lib/auth";
import { originFrom } from "@/lib/google";
import { sendVerificationMail } from "@/lib/verificationMail";
import { checkRateLimit } from "@/lib/rateLimit";
import { readJsonObject, validationPayload } from "@/lib/validation";
import { guardResponse, unauthorizedResponse } from "@/lib/routeGuard";

export const dynamic = "force-dynamic";

/**
 * POST /api/auth/email - add or change the account's email address,
 * then send the verification link to the NEW address.
 * { email: "..." }            set or change
 * { resend: true }            mail a fresh link for the CURRENT, unverified address
 *
 * Either way, nothing about the digest changes until the address is
 * verified: the new address only starts receiving plan mail after its own
 * link has been clicked.
 */
export async function POST(req: Request) {
  const limit = checkRateLimit(req, "auth-email", 8, 60 * 60_000);
  if (!limit.allowed) {
    return NextResponse.json(
      { error: "Too many email changes. Please wait a while and try again.", code: "RATE_LIMITED" },
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

    let email: string;
    let token: string;
    if (body.resend === true) {
      if (!user.email) {
        return NextResponse.json({ error: "Add an email address first.", code: "NO_EMAIL" }, { status: 400 });
      }
      if (user.emailVerifiedAt) {
        return NextResponse.json({ error: "That address is already verified.", code: "ALREADY_VERIFIED" }, { status: 400 });
      }
      email = user.email;
      token = await issueEmailToken(user.id, email);
    } else {
      const set = await setAccountEmail(user, body.email);
      email = set.email;
      token = set.token;
    }

    const verificationUrl = `${originFrom(req)}/api/auth/verify-email?token=${encodeURIComponent(token)}`;
    const sent = await sendVerificationMail(email, verificationUrl);

    return NextResponse.json(
      {
        ok: true,
        email,
        mailSent: sent.ok,
        mailDryRun: sent.dryRun === true,
        mailError: sent.ok ? undefined : sent.error,
        account: publicAccount({ ...user, email, emailVerifiedAt: null }),
      },
      { headers: { "cache-control": "no-store" } },
    );
  } catch (error) {
    const guarded = guardResponse(error);
    if (guarded) return guarded;
    console.error("Email update failed:", error instanceof Error ? error.message : error);
    return NextResponse.json(
      { error: "Could not update the email address right now. Please try again shortly.", code: "EMAIL_FAILED" },
      { status: 503 },
    );
  }
}
