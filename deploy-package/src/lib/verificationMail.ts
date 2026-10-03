/**
 * The one transactional email the app sends outside the digest: "prove that
 * this inbox is yours". Kept tiny and ONE place so its wording, its sender
 * and its dry-run behaviour can never fork between sign-up, Settings and
 * the resend button.
 */

import { sendMail } from "./mailer";

export async function sendVerificationMail(
  to: string,
  verificationUrl: string,
): Promise<{ ok: boolean; dryRun?: boolean; error?: string }> {
  const text = [
    "Verify your email for Study Planner Pro",
    "",
    "You added this address to your Study Planner account.",
    "Open this link within 24 hours to verify it - one click is enough:",
    "",
    verificationUrl,
    "",
    "If you did not add this address, you can ignore this message. Nothing will be sent to it again unless it is verified.",
  ].join("\n");
  const html =
    '<!DOCTYPE html><html><head><meta charset="utf-8"/></head>' +
    '<body style="margin:0;padding:24px;font-family:system-ui,-apple-system,sans-serif;font-size:14px;line-height:1.6;color:#2a2733">' +
    "<p><strong>Verify your email for Study Planner Pro</strong></p>" +
    "<p>You added this address to your Study Planner account. Open this link within 24 hours to verify it - one click is enough:</p>" +
    `<p><a href="${verificationUrl}">${verificationUrl}</a></p>` +
    "<p>If you did not add this address, you can ignore this message. Nothing will be sent to it again unless it is verified.</p>" +
    "</body></html>";
  const result = await sendMail({ to, subject: "Verify your Study Planner email", text, html });
  return { ok: result.ok, dryRun: result.dryRun, error: result.error };
}
