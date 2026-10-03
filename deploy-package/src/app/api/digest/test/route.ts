import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { originFrom } from "@/lib/google";
import { sendTestDigest } from "@/lib/digestRun";
import { checkRateLimit } from "@/lib/rateLimit";
import { guardResponse, unauthorizedResponse } from "@/lib/routeGuard";

export const dynamic = "force-dynamic";

/**
 * POST /api/digest/test - "Send me a test digest now".
 *
 * Runs the REAL pipeline against the caller's own account: same content
 * rules as tonight's scheduled send, addressed to them, immediately. When
 * no mail keys exist yet the message lands in the local dry-run outbox and
 * this answer INCLUDES THE PREVIEW, so the button is useful from day zero -
 * before a single secret is configured.
 */
export const maxDuration = 30;

export async function POST(req: Request) {
  const limit = checkRateLimit(req, "digest-test", 6, 60 * 60_000);
  if (!limit.allowed) {
    return NextResponse.json(
      { error: "Too many test digests. Please wait a while and try again.", code: "RATE_LIMITED" },
      { status: 429, headers: { "retry-after": String(limit.retryAfterSeconds) } },
    );
  }

  try {
    const user = await requireUser(req);
    if (!user.username) return unauthorizedResponse();
    if (!user.email) {
      return NextResponse.json(
        { error: "Add an email address first - there is nowhere to send the test.", code: "NO_EMAIL" },
        { status: 400 },
      );
    }
    if (!user.emailVerifiedAt) {
      return NextResponse.json(
        {
          error:
            "Your email address is not verified yet. Click the verification link first, so the test proves the whole pipeline.",
          code: "EMAIL_UNVERIFIED",
        },
        { status: 400 },
      );
    }
    const { result, preview, localDate } = await sendTestDigest(user, new Date(), originFrom(req));
    return NextResponse.json(
      {
        ok: result.ok,
        transport: result.transport,
        dryRun: result.dryRun === true,
        error: result.error,
        localDate,
        preview,
      },
      { headers: { "cache-control": "no-store" } },
    );
  } catch (error) {
    const guarded = guardResponse(error);
    if (guarded) return guarded;
    console.error("Test digest failed:", error instanceof Error ? error.message : error);
    return NextResponse.json(
      { error: "Could not build or send the test digest right now.", code: "DIGEST_TEST_FAILED" },
      { status: 503 },
    );
  }
}
