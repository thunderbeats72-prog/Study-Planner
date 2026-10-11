/**
 * The one transactional email the app sends outside the digest: "prove that
 * this inbox is yours". Kept tiny and ONE place so its wording, its sender
 * and its dry-run behaviour can never fork between sign-up, Settings and
 * the resend button.
 *
 * The renderer is pure and exported on its own (`verificationEmail`), so a
 * preview or a test can build the exact same subject/text/html pair without
 * touching a transport.
 */

import { sendMail } from "./mailer";
import {
  EMAIL,
  EMAIL_CLASS,
  emailAssetBaseFromUrl,
  emailEscape,
  emailFooter,
  emailHeader,
  illustration,
  primaryButton,
  shell,
  spacer,
} from "./emailTheme";

export const VERIFICATION_SUBJECT = "Verify your Study Planner email";

/** The three renderings of the verification mail, from one set of facts. */
export function verificationEmail(
  verificationUrl: string,
  options: { assetBase?: string } = {},
): { subject: string; text: string; html: string } {
  const safeUrl = emailEscape(verificationUrl);
  const assetBase = options.assetBase ?? emailAssetBaseFromUrl(verificationUrl);
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

  const html = shell(
    "Verify your Study Planner email",
    "Confirm this inbox for Study Planner Pro. The link expires in 24 hours.",
    emailHeader(assetBase) +
      `<div class="${EMAIL_CLASS.padX}" style="padding:16px 28px 4px;text-align:center">${illustration("verify", assetBase)}</div>` +
      `<div class="${EMAIL_CLASS.bodyPad}" style="padding:14px 36px 26px;text-align:center">` +
      `<h1 class="${EMAIL_CLASS.h1}" style="margin:0;font-size:34px;line-height:1.14;font-weight:900;letter-spacing:-0.04em;color:#101334">Verify your email for<br/><span style="color:#6253eb">Study Planner Pro</span></h1>` +
      `<p class="${EMAIL_CLASS.copy}" style="${EMAIL.p};font-size:16px;margin-top:18px;color:#4c526f">You added this address to your Study Planner account. Open this link within 24 hours to verify it - one click is enough.</p>` +
      spacer(24) +
      primaryButton(verificationUrl, "Verify my email", "→") +
      spacer(24) +
      `<div style="border-top:1px solid #ebe8fb;margin:0 auto 18px;max-width:420px"></div>` +
      `<p class="${EMAIL_CLASS.small}" style="${EMAIL.small};font-size:14px;color:#666b88">If you did not add this address, you can ignore this message. Nothing will be sent to it again unless it is verified.</p>` +
      `<p class="${EMAIL_CLASS.small}" style="${EMAIL.small};margin-top:14px;color:#8a8faa">If the button does not open, copy this link into your browser:<br/><a class="${EMAIL_CLASS.url}" href="${safeUrl}" style="${EMAIL.link};word-break:break-all">${safeUrl}</a></p>` +
      `</div>` +
      emailFooter("Study Planner Pro sends this one-time verification email only to confirm the inbox on your account.", undefined, assetBase),
  );

  return { subject: VERIFICATION_SUBJECT, text, html };
}

export async function sendVerificationMail(
  to: string,
  verificationUrl: string,
): Promise<{ ok: boolean; dryRun?: boolean; error?: string }> {
  const { subject, text, html } = verificationEmail(verificationUrl);
  const result = await sendMail({ to, subject, text, html });
  return { ok: result.ok, dryRun: result.dryRun, error: result.error };
}
