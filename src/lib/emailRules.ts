/**
 * EMAIL RULES - the single source of truth for what a valid email address
 * looks like on this app.
 * ─────────────────────────────────────────────────────────────────────────
 * Deliberately pure (no node, no database, no React) for the same reason
 * authRules.ts is: the sign-up form and the Settings Notifications card
 * validate WHILE the learner types, and the API validates what finally
 * arrives, using the SAME functions - so a rule can never drift between the
 * browser and the server.
 *
 * Comparisons and storage use the lower-cased form only. The local part of
 * an address is technically case-sensitive per RFC 5321, but every provider
 * a learner here will actually use (Gmail, Outlook, Yahoo, iCloud) treats
 * it case-insensitively, and storing the comparable form is what makes
 * "one address, one account" an enforceable promise instead of a hope.
 */

export const EMAIL_MAX = 160;

/**
 * A pragmatic RFC-5322 shape: one @, a non-empty local part of sane
 * characters, a dotted domain with a plausible ending, and no obvious
 * punctuation accidents. It deliberately accepts + tags and every TLD,
 * because rejecting a real address costs a learner far more than accepting
 * a well-formed lie (verification mail is what proves ownership anyway).
 */
const EMAIL_SHAPE =
  /^[A-Za-z0-9][A-Za-z0-9._%+-]{0,63}@[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?(?:\.[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?)+$/;

/** The canonical, comparable (and stored) form of an email address. */
export function normalizeEmail(raw: unknown): string {
  if (typeof raw !== "string") return "";
  return raw.trim().toLowerCase().replace(/\s+/g, "");
}

/**
 * Validate an email address. Returns a learner-facing sentence, or null
 * when the address is acceptable. Takes the RAW input so it can also flag
 * the invisible typos (leading/trailing space) that normalisation hides.
 */
export function emailProblem(raw: unknown): string | null {
  if (typeof raw !== "string" || !raw.trim()) return "Add your email address.";
  const value = String(raw).trim();
  if (value !== value.trim()) return "Remove the space at the start or end of the address.";
  if (/\s/.test(value)) return "An email address cannot contain spaces.";
  const normalized = normalizeEmail(value);
  if (normalized.length > EMAIL_MAX) return "That email address is too long.";
  if ((normalized.match(/@/g) || []).length !== 1) return "An email address needs exactly one @.";
  const [local, domain] = normalized.split("@");
  if (!local || local.replace(/[^A-Za-z0-9]/g, "").length < 1) {
    return "The part before @ looks broken.";
  }
  if (!domain || !domain.includes(".")) {
    return "The part after @ needs a domain, like gmail.com.";
  }
  if (!EMAIL_SHAPE.test(normalized)) return "That email address does not look right.";
  return null;
}

/**
 * True when a sign-in identifier looks like an email address rather than a
 * username. Usernames on this app cannot contain @ (authRules), so a
 * normalised identifier containing @ is unambiguous - and this one branch
 * is the whole of "sign in with either".
 */
export function loginLooksLikeEmail(identifier: unknown): boolean {
  if (typeof identifier !== "string") return false;
  return identifier.trim().includes("@");
}
