import { createHash, randomBytes } from "node:crypto";

/**
 * DEVICE KEYS (legacy identity) vs ACCOUNTS (current identity)
 * ───────────────────────────────────────────────────────────
 * Before accounts existed, a learner WAS their browser: the client minted a
 * random `u_…` key, stored it in localStorage, and every row in the database
 * hung off it. That is why the laptop and the phone used to show two
 * different plans - they were, quite literally, two different learners.
 *
 * Identity now comes from the signed-in account (see `src/lib/auth.ts`), and
 * `users.user_key` survives for two jobs only:
 *
 *   1. it stays the stable internal handle every existing query already
 *      joins on, so creating an account did not require rewriting the data
 *      model (a new account simply gets a freshly minted key); and
 *   2. it lets a brand-new account CLAIM the plan this device built while it
 *      was anonymous, instead of throwing that work away.
 *
 * This module has no database imports on purpose, so both `state.ts` and
 * `auth.ts` can use it without an import cycle.
 */

export const USER_KEY_RE = /^u_[A-Za-z0-9_-]{12,120}$/;

/** A fresh, unguessable internal handle for a newly created account. */
export function newUserKey(): string {
  return `u_${randomBytes(18).toString("base64url")}`;
}

/**
 * The device key a request carries, if any.
 *
 * Used for the sign-up "claim my existing plan" path and for rate-limit
 * fingerprinting - NEVER on its own to decide whose data to serve. A
 * header-less client gets a bounded one-way fingerprint rather than being
 * dropped into one shared account.
 */
export function keyFrom(req: Request): string {
  const supplied = req.headers.get("x-user-key")?.trim() || "";
  if (USER_KEY_RE.test(supplied)) return supplied;

  const forwarded = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  const agent = req.headers.get("user-agent")?.slice(0, 300) || "unknown";
  const seed = `${supplied}\0${forwarded}\0${agent}`;
  return `u_fallback_${createHash("sha256").update(seed).digest("hex").slice(0, 32)}`;
}

/** True when the request carries a real browser-minted device key. */
export function hasDeviceKey(req: Request): boolean {
  return USER_KEY_RE.test(req.headers.get("x-user-key")?.trim() || "");
}

/**
 * A short, human label for a sign-in ("iPhone · Safari"), shown in the
 * device list in Settings so a learner can recognise - and revoke - the
 * places their account is signed in. Derived from the User-Agent only: no
 * IP address, no fingerprinting, nothing that outlives the session row.
 */
export function deviceLabel(userAgent: string | null | undefined): string {
  const ua = (userAgent || "").slice(0, 400);
  if (!ua) return "Unknown device";

  const platform =
    /iPhone/i.test(ua) ? "iPhone"
    : /iPad/i.test(ua) ? "iPad"
    : /Android/i.test(ua) ? "Android"
    : /Windows/i.test(ua) ? "Windows"
    : /Macintosh|Mac OS X/i.test(ua) ? "Mac"
    : /CrOS/i.test(ua) ? "Chromebook"
    : /Linux/i.test(ua) ? "Linux"
    : "Device";

  // Order matters: Edge and Chrome both claim "Chrome", Chrome claims
  // "Safari", and Safari claims neither of the two before it.
  const browser =
    /Edg\//i.test(ua) ? "Edge"
    : /OPR\//i.test(ua) ? "Opera"
    : /SamsungBrowser/i.test(ua) ? "Samsung Internet"
    : /Firefox\//i.test(ua) ? "Firefox"
    : /Chrome\//i.test(ua) ? "Chrome"
    : /Safari\//i.test(ua) ? "Safari"
    : "Browser";

  return `${platform} · ${browser}`;
}
