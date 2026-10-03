import { NextResponse } from "next/server";
import { destroyOtherSessions, listSessions, requireUser, sessionTokenFrom } from "@/lib/auth";
import { guardResponse, unauthorizedResponse } from "@/lib/routeGuard";

export const dynamic = "force-dynamic";

/**
 * The signed-in devices of one account.
 *
 * GET    - list them ("iPhone · Safari, active 2 minutes ago"), so a learner
 *          can see every window that is currently open on their plan.
 * DELETE - sign out of all the others, keeping the device asking. This is
 *          the recovery path for a lost or borrowed phone.
 */
export async function GET(req: Request) {
  try {
    const user = await requireUser(req);
    if (!user.username) return unauthorizedResponse();
    const devices = await listSessions(user.id, sessionTokenFrom(req));
    return NextResponse.json({ devices }, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    const guarded = guardResponse(error);
    if (guarded) return guarded;
    console.error("Device list failed:", error instanceof Error ? error.message : error);
    return NextResponse.json(
      { error: "Could not load your signed-in devices.", code: "DEVICES_FAILED" },
      { status: 503 },
    );
  }
}

export async function DELETE(req: Request) {
  try {
    const user = await requireUser(req);
    if (!user.username) return unauthorizedResponse();
    const signedOut = await destroyOtherSessions(user.id, sessionTokenFrom(req));
    const devices = await listSessions(user.id, sessionTokenFrom(req));
    return NextResponse.json({ ok: true, signedOut, devices }, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    const guarded = guardResponse(error);
    if (guarded) return guarded;
    console.error("Device sign-out failed:", error instanceof Error ? error.message : error);
    return NextResponse.json(
      { error: "Could not sign out the other devices.", code: "DEVICES_FAILED" },
      { status: 503 },
    );
  }
}
