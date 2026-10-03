/**
 * The one transactional email the app sends outside the digest: "prove that
 * this inbox is yours". Kept tiny and ONE place so its wording, its sender
 * and its dry-run behaviour can never fork between sign-up, Settings and
 * the resend button.
 */

import { sendMail } from "./mailer";
import {
  EMAIL,
  emailAssetBaseFromUrl,
  emailEscape,
  emailFooter,
  emailHeader,
  illustration,
  primaryButton,
  shell,
} from "./emailTheme";

export async function sendVerificationMail(
  to: string,
  verificationUrl: string,
): Promise<{ ok: boolean; dryRun?: boolean; error?: string }> {
  const safeUrl = emailEscape(verificationUrl);
  const assetBase = emailAssetBaseFromUrl(verificationUrl);
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
      `<div style="padding:16px 28px 4px;text-align:center">${illustration("verify", assetBase)}</div>` +
      `<div style="padding:14px 36px 26px;text-align:center">` +
      `<h1 style="margin:0;font-size:34px;line-height:1.14;font-weight:900;letter-spacing:-0.04em;color:#101334">Verify your email for<br/><span style="color:#6253eb">Study Planner Pro</span></h1>` +
      `<p style="${EMAIL.p};font-size:16px;margin-top:18px;color:#4c526f">You added this address to your Study Planner account. Open this link within 24 hours to verify it - one click is enough.</p>` +
      `<div style="height:24px;line-height:24px">&nbsp;</div>` +
      primaryButton(verificationUrl, "Verify my email", "→") +
      `<div style="height:24px;line-height:24px">&nbsp;</div>` +
      `<div style="border-top:1px solid #ebe8fb;margin:0 auto 18px;max-width:420px"></div>` +
      `<p style="${EMAIL.small};font-size:14px;color:#666b88">If you did not add this address, you can ignore this message. Nothing will be sent to it again unless it is verified.</p>` +
      `<p style="${EMAIL.small};margin-top:14px;color:#8a8faa">If the button does not open, copy this link into your browser:<br/><a href="${safeUrl}" style="${EMAIL.link};word-break:break-all">${safeUrl}</a></p>` +
      `</div>` +
      emailFooter("Study Planner Pro sends this one-time verification email only to confirm the inbox on your account.", undefined, assetBase),
  );

  const result = await sendMail({ to, subject: "Verify your Study Planner email", text, html });
  return { ok: result.ok, dryRun: result.dryRun, error: result.error };
}
