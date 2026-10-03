/**
 * THE MAILER - one variable switches the transport.
 * ─────────────────────────────────────────────────
 *   MAIL_TRANSPORT=gmail-smtp   GMAIL_ADDRESS + GMAIL_APP_PASSWORD
 *                               (500/day free, no domain, no card; the
 *                               address is the owner's own, so mail lands
 *                               straight in their inbox)
 *   MAIL_TRANSPORT=brevo        BREVO_API_KEY + BREVO_SENDER_EMAIL
 *                               (300/day free, no domain, HTTP API - for
 *                               sending to OTHER people at scale later)
 *   MAIL_TRANSPORT=file  (or simply unset and no creds)
 *                               dry run: the full message is written to
 *                               .spp-mail-outbox/ and reported back, so the
 *                               whole pipeline is verifiable BEFORE any of
 *                               the keys above exist.
 *
 * Every transport failure is a RESULT ({ ok: false, error }), never a
 * thrown surprise: the digest sweep must finish all the other learners
 * even when one send blows up.
 */

import { writeFile, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { buildMimeMessage, dryRunText, MAIL_FROM_NAME, type OutgoingMessage } from "./mime";
import { sendViaSmtp } from "./smtp";

export type MailTransportId = "gmail-smtp" | "brevo" | "file";
export type MailResult = {
  ok: boolean;
  transport: MailTransportId;
  /** True when nothing was delivered because the transport is a dry run. */
  dryRun?: boolean;
  /** Where the dry-run artifact was written (file transport only). */
  file?: string;
  error?: string;
};

type ResolvedTransport = {
  id: MailTransportId;
  /** The From address every message carries (display name is constant). */
  from: string;
  gmail?: { host: string; port: number; user: string; password: string };
  brevoKey?: string;
};

/**
 * Decide how mail leaves this deployment.
 * An explicit MAIL_TRANSPORT wins; otherwise Gmail creds, then Brevo creds,
 * then the honest dry run. Misconfiguration (transport forced but its creds
 * missing) resolves to null with the reason reported by the caller.
 */
export function resolveMailTransport(env: NodeJS.ProcessEnv = process.env): ResolvedTransport | null {
  const forced = (env.MAIL_TRANSPORT || "").trim().toLowerCase();
  const gmailUser = (env.GMAIL_ADDRESS || "").trim();
  const gmailPass = (env.GMAIL_APP_PASSWORD || "").replace(/\s+/g, "").trim();
  const brevoKey = (env.BREVO_API_KEY || "").trim();
  const brevoSender = (env.BREVO_SENDER_EMAIL || "").trim() || gmailUser;

  const gmailReady = !!gmailUser && !!gmailPass;
  const brevoReady = !!brevoKey && !!brevoSender;
  const gmailCreds = {
    host: (env.GMAIL_SMTP_HOST || "smtp.gmail.com").trim(),
    port: Math.max(1, Number(env.GMAIL_SMTP_PORT || 465) || 465),
    user: gmailUser,
    password: gmailPass,
  };

  if (forced === "file" || forced === "dry-run" || forced === "dryrun") {
    return { id: "file", from: gmailUser || brevoSender || "digest@example.com" };
  }
  if (forced === "gmail-smtp" || forced === "gmail") {
    return gmailReady ? { id: "gmail-smtp", from: gmailUser, gmail: gmailCreds } : null;
  }
  if (forced === "brevo") {
    return brevoReady ? { id: "brevo", from: brevoSender, brevoKey } : null;
  }
  if (forced && forced !== "auto") {
    // An unknown value is a typo the operator should see, not silent mail loss.
    return null;
  }
  if (gmailReady) return { id: "gmail-smtp", from: gmailUser, gmail: gmailCreds };
  if (brevoReady) return { id: "brevo", from: brevoSender, brevoKey };
  return { id: "file", from: gmailUser || brevoSender || "digest@example.com" };
}

/** One line of transport status for Settings ("Mail: Gmail SMTP ..." or the
 *  dry-run explanation), safe to show the learner - never contains secrets. */
export function mailTransportStatus(env: NodeJS.ProcessEnv = process.env): string {
  const forced = (env.MAIL_TRANSPORT || "").trim().toLowerCase();
  if ((forced === "gmail-smtp" || forced === "gmail" || forced === "brevo") &&
      resolveMailTransport(env) === null) {
    return "Mail delivery is misconfigured: MAIL_TRANSPORT is set but its credentials are missing.";
  }
  const transport = resolveMailTransport(env);
  if (!transport) return "Mail delivery is misconfigured.";
  if (transport.id === "gmail-smtp") return `Mail sends via Gmail SMTP from ${transport.from}.`;
  if (transport.id === "brevo") return `Mail sends via Brevo from ${transport.from}.`;
  return "No mail keys are configured yet - digests are written to a local file (dry run) instead of being sent.";
}

const OUTBOX_DIR = ".spp-mail-outbox";

/** Where the dry-run transport writes. Local only, gitignored. */
export function mailOutboxDir(): string {
  return join(process.cwd(), OUTBOX_DIR);
}

async function sendViaBrevo(
  key: string,
  message: OutgoingMessage,
  timeoutMs: number,
): Promise<string> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch("https://api.brevo.com/v3/smtp/email", {
      method: "POST",
      headers: { "content-type": "application/json", "api-key": key },
      signal: controller.signal,
      body: JSON.stringify({
        sender: { name: MAIL_FROM_NAME, email: message.from },
        to: [{ email: message.to }],
        subject: message.subject,
        textContent: message.text,
        htmlContent: message.html,
        ...(message.unsubscribeUrl
          ? {
              headers: {
                "List-Unsubscribe": `<${message.unsubscribeUrl}>`,
                "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
              },
            }
          : {}),
      }),
    });
    const body = (await response.json().catch(() => ({}))) as Record<string, unknown>;
    if (!response.ok) {
      const reason = typeof body.message === "string" ? body.message : `HTTP ${response.status}`;
      throw new Error(`Brevo refused the message: ${reason}`);
    }
    return typeof body.messageId === "string" ? body.messageId : "accepted";
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Send one message. `dryRun` folders are created lazily so a production
 * deployment with real creds never touches the disk.
 */
export async function sendMail(
  message: Omit<OutgoingMessage, "from">,
  options: { transport?: ResolvedTransport | null; timeoutMs?: number; outboxDir?: string } = {},
): Promise<MailResult> {
  const transport = options.transport === undefined ? resolveMailTransport() : options.transport;
  if (!transport) {
    return {
      ok: false,
      transport: "file",
      error:
        "MAIL_TRANSPORT names a provider whose credentials are missing. Check GMAIL_ADDRESS + GMAIL_APP_PASSWORD, or BREVO_API_KEY + BREVO_SENDER_EMAIL.",
    };
  }
  const full: OutgoingMessage = { ...message, from: transport.from };
  const timeoutMs = options.timeoutMs ?? 20_000;

  try {
    if (transport.id === "gmail-smtp" && transport.gmail) {
      const mime = buildMimeMessage(full);
      await sendViaSmtp(transport.gmail, { from: transport.from, to: full.to }, mime, { timeoutMs });
      return { ok: true, transport: "gmail-smtp" };
    }
    if (transport.id === "brevo" && transport.brevoKey) {
      await sendViaBrevo(transport.brevoKey, full, timeoutMs);
      return { ok: true, transport: "brevo" };
    }
    // Dry run: the honest "sent" - file on disk, visible in Settings.
    const dir = options.outboxDir || mailOutboxDir();
    await mkdir(dir, { recursive: true });
    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    const file = join(dir, `${stamp}-${full.to.replace(/[^A-Za-z0-9._-]/g, "_")}.eml`);
    await writeFile(file, [dryRunText(full), "", buildMimeMessage(full)].join("\n"), "utf8");
    return { ok: true, transport: "file", dryRun: true, file };
  } catch (error) {
    return {
      ok: false,
      transport: transport.id,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

/** Synchronous, safe-for-anywhere check used by settings pages and health:
 *  would mail actually leave this deployment? */
export function mailConfigured(env: NodeJS.ProcessEnv = process.env): boolean {
  const transport = resolveMailTransport(env);
  return !!transport && transport.id !== "file";
}
