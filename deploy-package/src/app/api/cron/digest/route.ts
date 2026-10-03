import { NextResponse } from "next/server";
import { createHash } from "node:crypto";
import { runDigestSweep } from "@/lib/digestRun";
import { originFrom } from "@/lib/google";
import { mailTransportStatus } from "@/lib/mailer";
import { guardResponse } from "@/lib/routeGuard";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * GET /api/cron/digest - the hourly heartbeat.
 *
 * Whoever calls this (the GitHub Actions schedule, one fixed token) must
 * know the CRON_SECRET bearer token: the endpoint does housekeeping over
 * every account, so it is NOT public. Vercel's own daily backstop cron
 * lands here too - Vercel attaches the same bearer automatically when
 * CRON_SECRET is set.
 *
 * Without CRON_SECRET configured the route stays CLOSED (503, not a public
 * door). A missing CRON_SECRET is a misconfiguration, never a bypass.
 */
export async function GET(req: Request) {
  const secret = (process.env.CRON_SECRET || "").trim();
  if (!secret) {
    return NextResponse.json(
      { error: "CRON_SECRET is not configured on this deployment.", code: "CRON_NOT_CONFIGURED" },
      { status: 503 },
    );
  }
  const header = req.headers.get("authorization") || "";
  const presented = header.startsWith("Bearer ") ? header.slice(7).trim() : "";
  if (!presented || presented.length !== secret.length || presented !== secret) {
    // Not timing-critical (the comparison pins length first), but keep the
    // response uniform so the failure mode is indistinguishable.
    createHash("sha256").update(presented || "missing").digest("hex");
    return NextResponse.json({ error: "Unauthorized.", code: "CRON_UNAUTHORIZED" }, { status: 401 });
  }

  try {
    const summary = await runDigestSweep(new Date(), originFrom(req));
    return NextResponse.json(
      { ok: true, ...summary, mail: mailTransportStatus() },
      { headers: { "cache-control": "no-store" } },
    );
  } catch (error) {
    const guarded = guardResponse(error);
    if (guarded) return guarded;
    console.error("Digest sweep failed:", error instanceof Error ? error.message : error);
    return NextResponse.json(
      { error: "The digest could not run right now.", code: "CRON_SWEEP_FAILED" },
      { status: 503 },
    );
  }
}
