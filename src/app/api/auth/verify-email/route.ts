import { NextResponse } from "next/server";
import { consumeEmailToken } from "@/lib/auth";

export const dynamic = "force-dynamic";

/**
 * GET /api/auth/verify-email?token=... - spend a one-time verification link.
 *
 * It answers HTML, not JSON, because the requester is a person who clicked
 * a link in their inbox - possibly from a phone mail client with no app
 * session open. Signed-in state is irrelevant on purpose: the token itself
 * is the proof that the address is under the reader's control.
 */
export async function GET(req: Request) {
  const token = (new URL(req.url).searchParams.get("token") || "").trim();
  let verified = false;
  try {
    verified = !!(await consumeEmailToken(token));
  } catch (error) {
    console.error("Email verification failed:", error instanceof Error ? error.message : error);
  }
  return new NextResponse(page(verified), {
    status: verified ? 200 : 410,
    headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" },
  });
}

function page(ok: boolean): string {
  const title = ok ? "Email verified" : "That link has expired";
  const body = ok
    ? "Your email address is verified. The daily digest can now reach this inbox. You can close this tab and go back to the app."
    : "This verification link has already been used or is older than 24 hours. Open Settings in Study Planner Pro and ask for a fresh link.";
  return (
    "<!DOCTYPE html><html><head><meta charset=\"utf-8\"/>" +
    '<meta name="viewport" content="width=device-width,initial-scale=1"/>' +
    `<title>${title} - Study Planner Pro</title></head>` +
    '<body style="margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;background:#f6f5fa;font-family:system-ui,-apple-system,sans-serif">' +
    `<main style="max-width:26rem;margin:1rem;padding:1.75rem;background:#fff;border:1px solid #e6e3f0;border-radius:14px;text-align:center">` +
    `<div style="font-size:2rem;line-height:1;margin-bottom:.75rem">${ok ? "✓" : "⏳"}</div>` +
    `<h1 style="margin:0 0 .5rem;font-size:1.25rem;color:#18161f">${title}</h1>` +
    `<p style="margin:0;font-size:.925rem;line-height:1.6;color:#55536a">${body}</p>` +
    `<p style="margin:1rem 0 0"><a href="/" style="color:#5b4bd5;font-weight:600">Back to Study Planner Pro</a></p>` +
    "</main></body></html>"
  );
}
