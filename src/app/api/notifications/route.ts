import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { readJsonObject, validationPayload } from "@/lib/validation";
import { guardResponse, unauthorizedResponse } from "@/lib/routeGuard";
import { generateForUser, markNotificationsRead, notificationSnapshot } from "@/lib/notify";

export const dynamic = "force-dynamic";

/**
 * GET  /api/notifications - what the bell shows.
 *
 * Every poll first lets the generator look at the plan (morning plan-ready,
 * backlog, streak risk, exam milestones, fresh clock-outs, Sunday wrap) and
 * raise rows - all dedup-keyed, so a poll can run every minute forever and
 * still create each notice exactly once. The answer carries the unread
 * count and the quiet-hours state so the client can mute its own toasts.
 *
 * POST /api/notifications - mark read: { id } for one row, {} for all.
 */
export async function GET(req: Request) {
  try {
    const user = await requireUser(req);
    if (!user.username) return unauthorizedResponse();
    try {
      await generateForUser(user);
    } catch (error) {
      // A generation hiccup must never blank the bell: serve what is stored.
      console.warn("Notification generation skipped:", error instanceof Error ? error.message : error);
    }
    const snapshot = await notificationSnapshot(user);
    return NextResponse.json(snapshot, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    const guarded = guardResponse(error);
    if (guarded) return guarded;
    console.error("Notifications failed:", error instanceof Error ? error.message : error);
    return NextResponse.json(
      { error: "Could not load notifications right now.", code: "NOTIFICATIONS_FAILED" },
      { status: 503 },
    );
  }
}

export async function POST(req: Request) {
  let body: Record<string, unknown>;
  try {
    body = await readJsonObject(req, 4_000);
  } catch (error) {
    const payload = validationPayload(error);
    return NextResponse.json({ error: payload.error, code: payload.code }, { status: payload.status });
  }
  try {
    const user = await requireUser(req);
    if (!user.username) return unauthorizedResponse();
    const id = typeof body.id === "number" && Number.isInteger(body.id) ? body.id : undefined;
    const marked = await markNotificationsRead(user, id);
    const snapshot = await notificationSnapshot(user);
    return NextResponse.json({ ok: true, marked, ...snapshot }, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    const guarded = guardResponse(error);
    if (guarded) return guarded;
    console.error("Notification read state failed:", error instanceof Error ? error.message : error);
    return NextResponse.json(
      { error: "Could not update notifications right now.", code: "NOTIFICATIONS_FAILED" },
      { status: 503 },
    );
  }
}
