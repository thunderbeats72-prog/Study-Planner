import { NextResponse } from "next/server";
import { publicAccount, requireUser } from "@/lib/auth";
import { readJsonObject, validationPayload } from "@/lib/validation";
import { guardResponse, unauthorizedResponse } from "@/lib/routeGuard";
import { prefsFor, saveNotificationPrefs, setEmailUnsubscribed } from "@/lib/notify";
import { mailTransportStatus, mailConfigured } from "@/lib/mailer";

export const dynamic = "force-dynamic";

/**
 * GET   /api/notifications/settings - every toggle the Notifications card
 *         shows, in one snapshot: preferences, the account's email state,
 *         and the deployment's mail-transport status (so a dry run is
 *         explained inside the app, not discovered in spam folders).
 * PATCH - validate and store a partial update. { emailUnsubscribed } is
 *         deliberately part of this same snapshot: the Settings master
 *         switch and the email footer link must agree, always.
 */
function snapshotFor(user: Awaited<ReturnType<typeof requireUser>>, prefs = prefsFor(user)) {
  return {
    prefs,
    account: publicAccount(user),
    mail: { configured: mailConfigured(), status: mailTransportStatus() },
  };
}

export async function GET(req: Request) {
  try {
    const user = await requireUser(req);
    if (!user.username) return unauthorizedResponse();
    return NextResponse.json(snapshotFor(user), { headers: { "cache-control": "no-store" } });
  } catch (error) {
    const guarded = guardResponse(error);
    if (guarded) return guarded;
    console.error("Notification settings failed:", error instanceof Error ? error.message : error);
    return NextResponse.json(
      { error: "Could not load notification settings right now.", code: "NOTIF_SETTINGS_FAILED" },
      { status: 503 },
    );
  }
}

export async function PATCH(req: Request) {
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
    let currentUser = user;
    if (typeof body.emailUnsubscribed === "boolean") {
      await setEmailUnsubscribed(user.id, body.emailUnsubscribed);
      currentUser = { ...user, emailUnsubscribed: body.emailUnsubscribed };
    }
    const prefs = await saveNotificationPrefs(user, body);
    return NextResponse.json(snapshotFor(currentUser, prefs), { headers: { "cache-control": "no-store" } });
  } catch (error) {
    const guarded = guardResponse(error);
    if (guarded) return guarded;
    const status = (error as { status?: number }).status;
    if (status === 400) {
      return NextResponse.json({ error: (error as Error).message, code: "INVALID_PREFS" }, { status: 400 });
    }
    console.error("Notification settings save failed:", error instanceof Error ? error.message : error);
    return NextResponse.json(
      { error: "Could not save notification settings right now.", code: "NOTIF_SETTINGS_FAILED" },
      { status: 503 },
    );
  }
}
