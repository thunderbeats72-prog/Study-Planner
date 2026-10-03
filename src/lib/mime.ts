/**
 * MIME MESSAGE BUILDER
 * ────────────────────
 * Every email the app sends passes through here, so the deliverability
 * contract lives in exactly one place:
 *
 *   • multipart/alternative with a REAL text/plain part beside the HTML
 *     (a missing text alternative is the single biggest self-inflicted
 *     spam-score wound for automated mail);
 *   • an unconditionally consistent From - never a per-message surprise;
 *   • a Message-ID on the sender's own domain, RFC 5322 date, MIME-Version;
 *   • List-Unsubscribe (and RFC 8058 List-Unsubscribe-Post) on every
 *     message that carries an unsubscribe URL;
 *   • no tracking pixels, no remote images, no attachments;
 *   • CRLF line endings and 76-column base64, so any MTA can relay it.
 */

import { randomBytes } from "node:crypto";

export type OutgoingMessage = {
  /** The bare From address; the display name is always "Study Planner Pro". */
  from: string;
  to: string;
  subject: string;
  text: string;
  html: string;
  /** Absolute one-click unsubscribe URL, when the message has one. */
  unsubscribeUrl?: string;
};

export const MAIL_FROM_NAME = "Study Planner Pro";

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "Mon, 05 Oct 2026 09:30:00 +0000" (always emitted in GMT). */
function rfc2822Date(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return (
    `${DAYS[date.getUTCDay()]}, ${pad(date.getUTCDate())} ${MONTHS[date.getUTCMonth()]} ` +
    `${date.getUTCFullYear()} ${pad(date.getUTCHours())}:${pad(date.getUTCMinutes())}:${pad(date.getUTCSeconds())} +0000`
  );
}

/** RFC 2047 encoded word(s) for header values that may carry any language. */
function encodeHeader(value: string): string {
  // ASCII-safe headers pass through untouched (the common case: usernames).
  if (/^[\x20-\x7E]*$/.test(value)) return value;
  const base64 = Buffer.from(value, "utf8").toString("base64");
  const chunks: string[] = [];
  for (let i = 0; i < base64.length; i += 52) chunks.push(base64.slice(i, i + 52));
  return chunks.map((chunk) => `=?UTF-8?B?${chunk}?=`).join("\r\n ");
}

/** Address header: encode the display name, keep the address bare. */
function addressHeader(name: string, address: string): string {
  return `${encodeHeader(name)} <${address}>`;
}

/** Wrap base64 at the RFC-recommended 76 columns. */
function wrapBase64(input: string): string {
  const base64 = Buffer.from(input, "utf8").toString("base64");
  const lines: string[] = [];
  for (let i = 0; i < base64.length; i += 76) lines.push(base64.slice(i, i + 76));
  return lines.join("\r\n");
}

/** Escape ">"/angle brackets in URLs inside angle-bracket headers. */
function angleUrl(url: string): string {
  return url.replace(/[<>\\\s]/g, (char) => encodeURIComponent(char));
}

/**
 * Serialize the outgoing message into a single RFC 5322 string, ready for
 * the DATA phase (SMTP) or the storage folder (dry-run transport).
 */
export function buildMimeMessage(message: OutgoingMessage, sentAt = new Date()): string {
  const boundary = `----spp-boundary-${randomBytes(12).toString("hex")}`;
  const fromDomain = (message.from.split("@")[1] || "localhost").replace(/[^A-Za-z0-9.-]/g, "");
  const messageId = `<${sentAt.getTime()}.${randomBytes(8).toString("hex")}@${fromDomain || "localhost"}>`;

  const headers: string[] = [
    `From: ${addressHeader(MAIL_FROM_NAME, message.from)}`,
    `To: <${message.to}>`,
    `Subject: ${encodeHeader(message.subject)}`,
    `Date: ${rfc2822Date(sentAt)}`,
    `Message-ID: ${messageId}`,
    "MIME-Version: 1.0",
  ];
  if (message.unsubscribeUrl) {
    headers.push(`List-Unsubscribe: <${angleUrl(message.unsubscribeUrl)}>`);
    // RFC 8058: lets Gmail/Apple Mail show the native one-click button.
    headers.push("List-Unsubscribe-Post: List-Unsubscribe=One-Click");
    // Bulk machine mail that behaves itself gets labelled as such, which
    // keeps vacation responders quiet and spam filters calmer.
    headers.push("Precedence: bulk");
    headers.push("X-Auto-Response-Suppress: All");
  }
  headers.push(`Content-Type: multipart/alternative; boundary="${boundary}"`);

  const parts = [
    headers.join("\r\n"),
    "",
    `--${boundary}`,
    'Content-Type: text/plain; charset="utf-8"',
    "Content-Transfer-Encoding: base64",
    "",
    wrapBase64(message.text),
    `--${boundary}`,
    'Content-Type: text/html; charset="utf-8"',
    "Content-Transfer-Encoding: base64",
    "",
    wrapBase64(message.html),
    `--${boundary}--`,
    "",
  ];
  return parts.join("\r\n");
}

/**
 * Dot-stuff a message for the SMTP DATA phase (a line beginning with "."
 * must be doubled) - idempotent per call, applied exactly once by the SMTP
 * client at send time.
 */
export function dotStuff(mime: string): string {
  return mime
    .split("\r\n")
    .map((line) => (line.startsWith(".") ? `.${line}` : line))
    .join("\r\n");
}

/** A printable dry-run artifact: headers plus decoded bodies, for the local
 *  outbox file (what the operator reads while no mail keys exist yet). */
export function dryRunText(message: OutgoingMessage, sentAt = new Date()): string {
  const lines = [
    "# DRY RUN - no mail transport is configured, so this message was NOT sent.",
    `# Written ${sentAt.toISOString()}.`,
    `From: ${MAIL_FROM_NAME} <${message.from}>`,
    `To: ${message.to}`,
    `Subject: ${message.subject}`,
  ];
  if (message.unsubscribeUrl) lines.push(`List-Unsubscribe: <${message.unsubscribeUrl}>`);
  lines.push("", "----- text/plain -----", message.text, "", "----- text/html -----", message.html, "");
  return lines.join("\n");
}
