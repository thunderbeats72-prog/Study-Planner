/**
 * ACCOUNT RULES - the single source of truth for what a valid username and
 * a valid password are.
 * ─────────────────────────────────────────────────────────────────────────
 * This module is deliberately PURE: no `node:crypto`, no database, no React.
 * The sign-in screen imports it to validate while the learner types, and the
 * API routes import the SAME functions to validate what finally arrives. A
 * rule can therefore never drift between the two sides - the browser never
 * promises something the server then rejects, and nothing that the browser
 * rejected can be smuggled past it with a direct POST.
 */

export const USERNAME_MIN = 3;
export const USERNAME_MAX = 24;
export const PASSWORD_MIN = 8;
export const PASSWORD_MAX = 200;

/** Shape of every rule failure: a sentence a learner can act on. */
export type RuleProblem = string | null;

/**
 * Names that must never become an account: they either read as the app
 * itself or as staff, and a learner seeing "admin" in a shared screenshot
 * should know it is not a real person's account.
 */
const RESERVED_USERNAMES = new Set([
  "admin", "administrator", "root", "system", "sysadmin", "security",
  "moderator", "support", "help", "helpdesk", "staff", "owner",
  "api", "auth", "login", "logout", "signin", "signup", "register",
  "account", "accounts", "session", "sessions", "password",
  "null", "undefined", "anonymous", "guest", "me", "self",
  "studyplanner", "shigun",
]);

/**
 * The handful of passwords that show up in every credential-stuffing list.
 * This is NOT a security control on its own (the real protections are the
 * scrypt hash, the rate limiter and the per-account lockout) - it just keeps
 * a learner from choosing a password that is guessed on the first attempt.
 */
const COMMON_PASSWORDS = new Set([
  "password", "password1", "password123", "passw0rd", "12345678", "123456789",
  "1234567890", "qwerty123", "qwertyuiop", "letmein1", "welcome1", "iloveyou",
  "admin123", "football", "princess", "sunshine", "superman", "trustno1",
  "monkey123", "dragon123", "baseball", "michael1", "shadow12", "master12",
  "abc12345", "test1234", "studyplanner", "changeme", "secret123",
]);

/**
 * The canonical, comparable form of a username: trimmed and lower-cased.
 * Accounts are stored and looked up by this value, so `Sanjay`, `sanjay`
 * and ` SANJAY ` are the SAME account - a learner who types their name with
 * a capital on their phone still lands in the plan they built on the laptop.
 */
export function normalizeUsername(raw: unknown): string {
  if (typeof raw !== "string") return "";
  return raw.trim().toLowerCase();
}

/**
 * Validate a username. Returns a learner-facing sentence, or null when the
 * name is acceptable. Takes the RAW input so it can also complain about
 * characters that normalisation would silently swallow.
 */
export function usernameProblem(raw: unknown): RuleProblem {
  if (typeof raw !== "string" || !raw.trim()) return "Choose a username.";
  const value = normalizeUsername(raw);
  if (value.length < USERNAME_MIN)
    return `Usernames need at least ${USERNAME_MIN} characters.`;
  if (value.length > USERNAME_MAX)
    return `Usernames can be at most ${USERNAME_MAX} characters.`;
  if (/\s/.test(value)) return "Usernames cannot contain spaces.";
  if (!/^[a-z0-9._-]+$/.test(value))
    return "Use letters, numbers, and . _ - only.";
  if (!/^[a-z0-9]/.test(value)) return "Start the username with a letter or number.";
  if (!/[a-z0-9]$/.test(value)) return "End the username with a letter or number.";
  if (/[._-]{2,}/.test(value)) return "Avoid two symbols in a row.";
  if (RESERVED_USERNAMES.has(value)) return "That username is reserved. Pick another one.";
  return null;
}

/** How many distinct character classes a password draws on (0–4). */
function characterClasses(password: string): number {
  let classes = 0;
  if (/[a-z]/.test(password)) classes++;
  if (/[A-Z]/.test(password)) classes++;
  if (/[0-9]/.test(password)) classes++;
  if (/[^A-Za-z0-9]/.test(password)) classes++;
  return classes;
}

/**
 * Validate a password. The bar is deliberately "strong but humane":
 *   • 8–200 characters;
 *   • no leading/trailing spaces (an invisible typo that locks people out);
 *   • either two character classes, or 12+ characters for a passphrase
 *     ("the quiet morning library" is a fine password and should not be
 *     rejected for lacking a digit);
 *   • never a well-known password, and never the username itself.
 */
export function passwordProblem(password: unknown, username?: string): RuleProblem {
  if (typeof password !== "string" || !password) return "Choose a password.";
  if (password.length < PASSWORD_MIN)
    return `Passwords need at least ${PASSWORD_MIN} characters.`;
  if (password.length > PASSWORD_MAX)
    return `Passwords can be at most ${PASSWORD_MAX} characters.`;
  if (password !== password.trim())
    return "Remove the space at the start or end of the password.";
  if (COMMON_PASSWORDS.has(password.toLowerCase()))
    return "That password is too common - pick something less guessable.";
  const user = normalizeUsername(username || "");
  if (user && password.toLowerCase().includes(user))
    return "The password cannot contain your username.";
  if (characterClasses(password) < 2 && password.length < 12)
    return "Mix in a number or a capital - or use 12+ characters.";
  if (/^(.)\1+$/.test(password)) return "That password is a single repeated character.";
  return null;
}

export type PasswordStrength = {
  /** 0 (unusable) … 4 (excellent) - drives the meter on the sign-up form. */
  score: number;
  label: string;
  /** The single most useful next improvement, or null when it is strong. */
  hint: string | null;
};

/**
 * A calm, honest strength read for the sign-up meter. It never blocks -
 * `passwordProblem` is the gate; this is the encouragement next to it.
 */
export function passwordStrength(password: string, username?: string): PasswordStrength {
  if (!password) return { score: 0, label: "Empty", hint: "Choose a password." };
  if (passwordProblem(password, username)) {
    return {
      score: password.length >= PASSWORD_MIN ? 1 : 0,
      label: "Too weak",
      hint: passwordProblem(password, username),
    };
  }
  const classes = characterClasses(password);
  let score = 1;
  if (password.length >= 10) score++;
  if (password.length >= 14) score++;
  if (classes >= 3) score++;
  if (classes >= 4 && password.length >= 12) score++;
  score = Math.min(4, score);
  const labels = ["Too weak", "Weak", "Fair", "Strong", "Excellent"];
  const hint =
    score >= 4
      ? null
      : password.length < 12
        ? "Longer is stronger - aim for 12+ characters."
        : classes < 3
          ? "Add a capital, a number, or a symbol."
          : "Nearly there - a few more characters makes it excellent.";
  return { score, label: labels[score], hint };
}

/**
 * The display form of a username. Accounts are compared in lower case, but
 * the casing the learner typed at sign-up is what the app greets them with.
 */
export function displayUsername(raw: unknown, fallback = ""): string {
  if (typeof raw !== "string" || !raw.trim()) return fallback;
  return raw.trim().slice(0, USERNAME_MAX);
}
