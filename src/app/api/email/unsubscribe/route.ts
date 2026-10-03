import { NextResponse } from "next/server";
import { setEmailUnsubscribed } from "@/lib/notify";
import { verifyUnsubscribe } from "@/lib/notifications";

export const dynamic = "force-dynamic";

/**
 * GET|POST /api/email/unsubscribe - one click, no sign-in.
 *
 * The link at the foot of every digest lands here (GET, a person in their
 * mail client), and Gmail's native "Unsubscribe" button POSTs here straight
 * from the List-Unsubscribe-Post header (RFC 8058). Either way: valid HMAC
 * signature, instant effect, plain confirmation page. An unsigned or forged
 * link changes nothing.
 *
 * The switch is absolute: while it is on, NO email of any kind leaves -
 * digest, weekly, or verification reminders. It can be reversed from
 * Settings (which requires the account itself, as reversal should).
 */
export async function GET(req: Request) {
  const params = new URL(req.url).searchParams;
  const done = await apply(params.get("u"), params.get("k"), params.get("t"));
  return new NextResponse(page(done), {
    status: done ? 200 : 400,
    headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" },
  });
}

export async function POST(req: Request) {
  const params = new URL(req.url).searchParams;
  const done = await apply(params.get("u"), params.get("k"), params.get("t"));
  // RFC 8058: the POST just needs a 2xx; a body is optional.
  return NextResponse.json({ ok: done }, { status: done ? 200 : 400 });
}

async function apply(userRaw: string | null, scope: string | null, signature: string | null): Promise<boolean> {
  const userId = Number(userRaw);
  if (!Number.isInteger(userId) || userId <= 0) return false;
  const kind = (scope || "all").slice(0, 24);
  if (!verifyUnsubscribe(userId, kind, signature || "")) return false;
  try {
    await setEmailUnsubscribed(userId, true);
    return true;
  } catch (error) {
    console.error("Unsubscribe failed:", error instanceof Error ? error.message : error);
    return false;
  }
}

function page(ok: boolean): string {
  const title = ok ? "Unsubscribed" : "This unsubscribe link is not valid";
  const body = ok
    ? "You will not receive any more email from Study Planner Pro. Your account and your plan are untouched. You can switch email back on any time from Settings - Notifications."
    : "The link looks edited, expired because you subscribed again, or truncated by the mail client. Open the same email in Settings again, or unsubscribe there.";
  return (
    "<!DOCTYPE html><html><head><meta charset=\"utf-8\"/>" +
    '<meta name="viewport" content="width=device-width,initial-scale=1"/>' +
    `<title>${title} - Study Planner Pro</title></head>` +
    '<body style="margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;background:#f6f5fa;font-family:system-ui,-apple-system,sans-serif">' +
    `<main style="max-width:26rem;margin:1rem;padding:1.75rem;background:#fff;border:1px solid #e6e3f0;border-radius:14px;text-align:center">` +
    `<h1 style="margin:0 0 .5rem;font-size:1.25rem;color:#18161f">${title}</h1>` +
    `<p style="margin:0;font-size:.925rem;line-height:1.6;color:#55536a">${body}</p>` +
    `<p style="margin:1rem 0 0"><a href="/" style="color:#5b4bd5;font-weight:600">Back to Study Planner Pro</a></p>` +
    "</main></body></html>"
  );
}
