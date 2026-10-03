/**
 * The one transactional email the app sends outside the digest: "prove that
 * this inbox is yours". Kept tiny and ONE place so its wording, its sender
 * and its dry-run behaviour can never fork between sign-up, Settings and
 * the resend button.
 */

import { sendMail } from "./mailer";

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export async function sendVerificationMail(
  to: string,
  verificationUrl: string,
): Promise<{ ok: boolean; dryRun?: boolean; error?: string }> {
  const safeUrl = escapeHtml(verificationUrl);
  const text = [
    "Verify your email for Study Planner Pro",
    "",
    "You added this address to your Study Planner account.",
    "Open this link within 24 hours to verify it - one click is enough:",
    "",
    verificationUrl,
    "",
    "If you did not add this address, you can ignore this message. Nothing will be sent to it again unless it is verified.",
    "",
    "Study Planner Pro sends this one-time verification email only to confirm the inbox on your account.",
  ].join("\n");
  const html =
    '<!DOCTYPE html><html><head><meta charset="utf-8"/></head>' +
    '<body style="margin:0;padding:0;background:#f6f5fa;font-family:system-ui,-apple-system,BlinkMacSystemFont,Segoe UI,sans-serif;color:#2a2733">' +
    '<div style="max-width:560px;margin:0 auto;padding:24px 16px">' +
    '<div style="background:#ffffff;border:1px solid #e6e3f0;border-radius:12px;padding:22px">' +
    '<p style="margin:0 0 12px;font-size:16px;line-height:1.4"><strong>Verify your email for Study Planner Pro</strong></p>' +
    '<p style="margin:0 0 16px;font-size:14px;line-height:1.6">You added this address to your Study Planner account. Open this link within 24 hours to verify it.</p>' +
    `<p style="margin:0 0 18px"><a href="${safeUrl}" style="display:inline-block;background:#5b4bd5;color:#ffffff;text-decoration:none;border-radius:10px;padding:10px 14px;font-weight:700">Verify email address</a></p>` +
    `<p style="margin:0 0 16px;font-size:12px;line-height:1.6;color:#6d6a7c">If the button does not open, copy this link into your browser:<br/><a href="${safeUrl}" style="color:#5b4bd5">${safeUrl}</a></p>` +
    '<p style="margin:0;font-size:12px;line-height:1.6;color:#8a8796">If you did not add this address, you can ignore this message. Study Planner Pro sends this one-time verification email only to confirm the inbox on your account.</p>' +
    "</div></div></body></html>";
  const result = await sendMail({ to, subject: "Verify your Study Planner email", text, html });
  return { ok: result.ok, dryRun: result.dryRun, error: result.error };
}
