import { createHash, randomBytes, randomUUID, scrypt as scryptCb, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import { and, eq, isNull, lt, ne, sql } from "drizzle-orm";
import { db } from "@/db";
import { authEmailTokens, authSessions, settings, users, type User } from "@/db/schema";
import { demoDataEnabled } from "./demoGate";
import { deviceLabel, keyFrom, newUserKey, USER_KEY_RE } from "./identity";
import { normalizeUsername, passwordProblem, usernameProblem, displayUsername } from "./authRules";
import { emailProblem, loginLooksLikeEmail, normalizeEmail } from "./emailRules";
import { addDays, todayStr } from "./planner";

const scrypt = promisify(scryptCb) as (
  password: string | Buffer,
  salt: string | Buffer,
  keylen: number,
  options: { N: number; r: number; p: number; maxmem: number },
) => Promise<Buffer>;

/* ────────────────────────────────────────────────────────────────────────
   WHY THIS MODULE EXISTS
   ─────────────────────
   A study plan is months of work. Before accounts, it lived against the
   browser that made it, so the same learner on a phone met an empty app.
   Everything here exists to make ONE sentence true:

     "Sign in with your username and password on any device and you are
      looking at exactly the same plan, logs, streak and chat history."

   The account is the identity; the device is just a window onto it.
   ──────────────────────────────────────────────────────────────────────── */

/** Name of the HttpOnly cookie carrying the session token. */
export const SESSION_COOKIE = "spp_session";
/** How long a sign-in lasts without any activity (a phone left in a drawer). */
export const SESSION_TTL_DAYS = 180;
const SESSION_TTL_MS = SESSION_TTL_DAYS * 24 * 60 * 60 * 1000;
/** Consecutive wrong passwords before the account pauses sign-in attempts. */
const MAX_FAILED_LOGINS = 8;
const LOCKOUT_MS = 15 * 60 * 1000;
/** scrypt cost. 16 MB of memory per hash: hostile to GPUs, invisible to the learner. */
const SCRYPT = { N: 16_384, r: 8, p: 1, keylen: 64, maxmem: 64 * 1024 * 1024 };

/** Thrown when a request needs an account and does not have one. */
export class AuthRequiredError extends Error {
  readonly status = 401;
  readonly code = "AUTH_REQUIRED";
  constructor(message = "Sign in to continue.") {
    super(message);
    this.name = "AuthRequiredError";
  }
}

/** Thrown for a credential problem the learner can fix (bad password, name taken). */
export class AuthError extends Error {
  readonly status: number;
  readonly code: string;
  constructor(message: string, code = "AUTH_INVALID", status = 400) {
    super(message);
    this.name = "AuthError";
    this.code = code;
    this.status = status;
  }
}

/* ── Passwords ──────────────────────────────────────────────────────── */

/**
 * scrypt with a per-password random salt, stored as a self-describing
 * string: `scrypt$N$r$p$salt$hash`. The parameters travel WITH the hash, so
 * raising the cost later never locks anybody out of their existing password.
 */
export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const derived = await scrypt(password.normalize("NFKC"), salt, SCRYPT.keylen, SCRYPT);
  return [
    "scrypt",
    SCRYPT.N,
    SCRYPT.r,
    SCRYPT.p,
    salt.toString("base64url"),
    derived.toString("base64url"),
  ].join("$");
}

/**
 * Constant-time password check. Returns false (never throws) for malformed
 * or missing hashes, so a corrupted row can't crash the sign-in route.
 */
export async function verifyPassword(password: string, stored: string | null | undefined): Promise<boolean> {
  if (!stored || typeof stored !== "string") return false;
  const parts = stored.split("$");
  if (parts.length !== 6 || parts[0] !== "scrypt") return false;
  const N = Number(parts[1]);
  const r = Number(parts[2]);
  const p = Number(parts[3]);
  if (!Number.isInteger(N) || !Number.isInteger(r) || !Number.isInteger(p)) return false;
  // Refuse absurd parameters from a tampered row rather than allocating GBs.
  if (N < 1024 || N > 1 << 20 || r < 1 || r > 32 || p < 1 || p > 16) return false;
  let salt: Buffer;
  let expected: Buffer;
  try {
    salt = Buffer.from(parts[4], "base64url");
    expected = Buffer.from(parts[5], "base64url");
  } catch {
    return false;
  }
  if (!salt.length || !expected.length) return false;
  try {
    const derived = await scrypt(password.normalize("NFKC"), salt, expected.length, {
      N, r, p, maxmem: Math.max(SCRYPT.maxmem, 128 * N * r * 2),
    });
    return derived.length === expected.length && timingSafeEqual(derived, expected);
  } catch {
    return false;
  }
}

/* ── Session tokens & cookies ───────────────────────────────────────── */

/** 256 bits of randomness: the only secret the browser ever holds. */
function newSessionToken(): string {
  return randomBytes(32).toString("base64url");
}

/** What the database stores. A dump of `auth_sessions` cannot be replayed. */
export function sessionTokenHash(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/**
 * `Secure` must be set in production and must NOT be set on plain-http
 * localhost, or the browser silently drops the cookie and every sign-in
 * "succeeds" while nobody stays signed in. Proxies (Vercel, the preview
 * sandbox) tell us the original scheme in `x-forwarded-proto`.
 */
function isSecureRequest(req: Request): boolean {
  const proto = req.headers.get("x-forwarded-proto")?.split(",")[0]?.trim().toLowerCase();
  if (proto) return proto === "https";
  try {
    return new URL(req.url).protocol === "https:";
  } catch {
    return process.env.NODE_ENV === "production";
  }
}

/**
 * `SameSite` policy for the session cookie.
 *
 * `Lax` is the default and the right answer for a real deployment: the
 * cookie rides along with normal navigation but not with a cross-site POST,
 * which is free CSRF protection.
 *
 * `SPP_COOKIE_SAMESITE=none` exists for ONE situation: the app being shown
 * inside an iframe on another origin (an embedded preview). A Lax cookie is
 * never sent in that context, so sign-in would appear to succeed and then
 * immediately forget itself. `None` always implies `Secure`.
 */
function cookieSameSite(): "Lax" | "None" | "Strict" {
  const raw = (process.env.SPP_COOKIE_SAMESITE || "").trim().toLowerCase();
  if (raw === "none") return "None";
  if (raw === "strict") return "Strict";
  return "Lax";
}

/**
 * The Set-Cookie value for a signed-in browser.
 * HttpOnly (JavaScript - including anything injected into the page - cannot
 * read it), SameSite (see above), Path=/ and a long Max-Age so a phone stays
 * signed in for months rather than days.
 */
export function sessionCookie(req: Request, token: string, maxAgeSeconds = SESSION_TTL_DAYS * 86_400): string {
  const sameSite = cookieSameSite();
  const parts = [
    `${SESSION_COOKIE}=${token}`,
    "Path=/",
    "HttpOnly",
    `SameSite=${sameSite}`,
    `Max-Age=${Math.max(0, Math.floor(maxAgeSeconds))}`,
  ];
  if (isSecureRequest(req) || sameSite === "None") parts.push("Secure");
  return parts.join("; ");
}

/** The Set-Cookie value that removes the session cookie on sign-out. */
export function clearSessionCookie(req: Request): string {
  return sessionCookie(req, "", 0);
}

/** Read the raw session token the browser sent, if any. */
export function sessionTokenFrom(req: Request): string | null {
  const header = req.headers.get("cookie");
  if (!header) return null;
  for (const part of header.split(";")) {
    const index = part.indexOf("=");
    if (index < 0) continue;
    if (part.slice(0, index).trim() !== SESSION_COOKIE) continue;
    const value = decodeURIComponent(part.slice(index + 1).trim());
    return value || null;
  }
  return null;
}

/* ── Schema bootstrap ───────────────────────────────────────────────── */

type SchemaGlobal = typeof globalThis & { __sppAuthSchemaReady?: Promise<void> };
const schemaGlobal = globalThis as SchemaGlobal;

/**
 * Accounts added columns to `users` and a whole new `auth_sessions` table.
 * `npm run db:push` applies them - but a deployment whose build command is
 * plain `next build` would otherwise boot against the old shape and fail
 * every sign-in with a raw SQL error.
 *
 * So the first auth request of each server process runs this idempotent
 * bootstrap: `ADD COLUMN IF NOT EXISTS` / `CREATE TABLE IF NOT EXISTS`. It
 * is safe to run forever, costs one round trip per process, and makes
 * "deploy and sign up" work without a migration step. Each statement is
 * isolated so one failure (e.g. a read-only role) cannot block the rest.
 */
export async function ensureAuthSchema(): Promise<void> {
  if (!schemaGlobal.__sppAuthSchemaReady) {
    schemaGlobal.__sppAuthSchemaReady = (async () => {
      const statements = [
        sql`alter table users add column if not exists username text`,
        sql`alter table users add column if not exists username_display text`,
        sql`alter table users add column if not exists password_hash text`,
        sql`alter table users add column if not exists password_updated_at timestamp`,
        sql`alter table users add column if not exists last_login_at timestamp`,
        sql`alter table users add column if not exists failed_logins integer not null default 0`,
        sql`alter table users add column if not exists locked_until timestamp`,
        sql`create unique index if not exists users_username_unique on users (username)`,
        sql`create table if not exists auth_sessions (
              id serial primary key,
              user_id integer not null,
              token_hash text not null,
              device text not null default 'Unknown device',
              created_at timestamp not null default now(),
              last_seen_at timestamp not null default now(),
              expires_at timestamp not null
            )`,
        sql`create unique index if not exists auth_sessions_token_hash_unique on auth_sessions (token_hash)`,
        sql`create index if not exists auth_sessions_user_id_idx on auth_sessions (user_id)`,
        sql`create index if not exists auth_sessions_expires_at_idx on auth_sessions (expires_at)`,
        /* ── Email, Google sign-in and notifications ── */
        sql`alter table users add column if not exists email text`,
        sql`alter table users add column if not exists email_verified_at timestamp`,
        sql`alter table users add column if not exists google_sub text`,
        sql`alter table users add column if not exists email_unsubscribed boolean not null default false`,
        sql`alter table users add column if not exists notify_prefs jsonb`,
        sql`create unique index if not exists users_email_unique on users (email) where email is not null`,
        sql`create unique index if not exists users_google_sub_unique on users (google_sub) where google_sub is not null`,
        sql`create table if not exists auth_email_tokens (
              id serial primary key,
              user_id integer not null,
              email text not null,
              token_hash text not null,
              created_at timestamp not null default now(),
              expires_at timestamp not null
            )`,
        sql`create unique index if not exists auth_email_tokens_token_hash_unique on auth_email_tokens (token_hash)`,
        sql`create index if not exists auth_email_tokens_user_id_idx on auth_email_tokens (user_id)`,
        sql`create table if not exists notifications (
              id serial primary key,
              user_id integer not null,
              kind text not null,
              title text not null,
              body text not null default '',
              href text not null default 'dashboard',
              read_at timestamp,
              dedup_key text not null,
              created_at timestamp not null default now()
            )`,
        sql`create unique index if not exists notifications_user_dedup_unique on notifications (user_id, dedup_key)`,
        sql`create index if not exists notifications_user_id_idx on notifications (user_id, created_at)`,
        sql`create table if not exists notifications_sent (
              id serial primary key,
              user_id integer not null,
              kind text not null,
              date text not null,
              created_at timestamp not null default now()
            )`,
        sql`create unique index if not exists notifications_sent_user_kind_date_unique on notifications_sent (user_id, kind, date)`,
      ];
      let firstFailure: unknown = null;
      for (const statement of statements) {
        try {
          await db.execute(statement);
        } catch (error) {
          if (!firstFailure) firstFailure = error;
        }
      }
      if (firstFailure) {
        // Reset so a later request retries (a transient outage must not
        // permanently convince this process that the schema is hopeless).
        schemaGlobal.__sppAuthSchemaReady = undefined;
        throw firstFailure;
      }
    })();
  }
  return schemaGlobal.__sppAuthSchemaReady;
}

/* ── Sessions ───────────────────────────────────────────────────────── */

export type AuthContext = {
  user: User;
  /** Set when the session was renewed and the browser should refresh its cookie. */
  refreshedToken?: string;
  /** True for the database-less preview learner (see demoGate). */
  preview?: boolean;
};

/** Open a new session for a signed-in device and return its raw token. */
export async function createSession(userId: number, req: Request): Promise<string> {
  const token = newSessionToken();
  await db.insert(authSessions).values({
    userId,
    tokenHash: sessionTokenHash(token),
    device: deviceLabel(req.headers.get("user-agent")).slice(0, 80),
    expiresAt: new Date(Date.now() + SESSION_TTL_MS),
  });
  // Opportunistic cleanup: expired rows for this learner only, so the table
  // never becomes a graveyard and no cron job is required.
  try {
    await db.delete(authSessions).where(
      and(eq(authSessions.userId, userId), lt(authSessions.expiresAt, new Date()))
    );
  } catch {
    /* housekeeping only */
  }
  return token;
}

/** End one device's session (sign out here). */
export async function destroySession(token: string): Promise<void> {
  await db.delete(authSessions).where(eq(authSessions.tokenHash, sessionTokenHash(token)));
}

/** End every OTHER device's session (sign out everywhere else). */
export async function destroyOtherSessions(userId: number, keepToken: string | null): Promise<number> {
  const rows = keepToken
    ? await db
        .delete(authSessions)
        .where(and(eq(authSessions.userId, userId), ne(authSessions.tokenHash, sessionTokenHash(keepToken))))
        .returning({ id: authSessions.id })
    : await db.delete(authSessions).where(eq(authSessions.userId, userId)).returning({ id: authSessions.id });
  return rows.length;
}

/** The devices currently signed in to this account, newest activity first. */
export async function listSessions(userId: number, currentToken: string | null) {
  const currentHash = currentToken ? sessionTokenHash(currentToken) : "";
  const rows = await db
    .select()
    .from(authSessions)
    .where(eq(authSessions.userId, userId));
  return rows
    .filter((row) => row.expiresAt.getTime() > Date.now())
    .sort((a, b) => b.lastSeenAt.getTime() - a.lastSeenAt.getTime())
    .map((row) => ({
      id: row.id,
      device: row.device,
      createdAt: row.createdAt.toISOString(),
      lastSeenAt: row.lastSeenAt.toISOString(),
      current: row.tokenHash === currentHash,
    }));
}

/**
 * Resolve the signed-in learner for a request, or null.
 *
 * Also keeps the session fresh: an active device's expiry slides forward, so
 * daily use never ends in a surprise sign-out, while a device untouched for
 * SESSION_TTL_DAYS falls out on its own.
 */
export async function authenticate(req: Request): Promise<AuthContext | null> {
  const token = sessionTokenFrom(req);
  if (!token) return null;

  await ensureAuthSchema();
  const now = new Date();
  const rows = await db
    .select({ user: users, session: authSessions })
    .from(authSessions)
    .innerJoin(users, eq(users.id, authSessions.userId))
    .where(eq(authSessions.tokenHash, sessionTokenHash(token)))
    .limit(1);
  const row = rows[0];
  if (!row) return null;

  if (row.session.expiresAt.getTime() <= now.getTime()) {
    try {
      await db.delete(authSessions).where(eq(authSessions.id, row.session.id));
    } catch {
      /* the session is dead either way */
    }
    return null;
  }

  const sinceSeen = now.getTime() - row.session.lastSeenAt.getTime();
  const remaining = row.session.expiresAt.getTime() - now.getTime();
  const shouldSlide = remaining < SESSION_TTL_MS * 0.75;
  if (shouldSlide || sinceSeen > 6 * 60 * 60 * 1000) {
    try {
      await db
        .update(authSessions)
        .set({
          lastSeenAt: now,
          ...(shouldSlide ? { expiresAt: new Date(now.getTime() + SESSION_TTL_MS) } : {}),
        })
        .where(eq(authSessions.id, row.session.id));
    } catch {
      /* a failed touch must never sign anybody out */
    }
  }

  return { user: row.user, refreshedToken: shouldSlide ? token : undefined };
}

/**
 * The learner this request belongs to - or a 401. Every data route starts
 * here, which is what makes a plan private to its account.
 *
 * The one exception is the database-less preview (see `demoGate`): with no
 * database there is nowhere to keep accounts, so the sample plan is served
 * to a preview learner instead of a wall of sign-in walls.
 */
export async function requireUser(req: Request): Promise<User> {
  try {
    const auth = await authenticate(req);
    if (auth) return auth.user;
  } catch (error) {
    if (demoDataEnabled()) return previewUser(req);
    throw error;
  }
  if (demoDataEnabled()) return previewUser(req);
  throw new AuthRequiredError();
}

/** The stand-in learner for a preview with no database behind it. */
async function previewUser(req: Request): Promise<User> {
  const { demoFallbackState } = await import("./demoState");
  const state = await demoFallbackState(keyFrom(req));
  return state.user as User;
}

/* ── Accounts ───────────────────────────────────────────────────────── */

export type AccountResult = { user: User; token: string; claimedExistingPlan: boolean };
/** Sign-up deliberately stops short of a session - see createAccount. */
export type NewAccountResult = { user: User; claimedExistingPlan: boolean };

/** The single friendly 409 for a taken username, checked before every write. */
async function assertUsernameFree(username: string): Promise<void> {
  const rows = await db.select({ id: users.id }).from(users).where(eq(users.username, username)).limit(1);
  if (rows.length) {
    throw new AuthError("That username is already taken. Try another one.", "USERNAME_TAKEN", 409);
  }
}

/** One address, one account - verified or not. */
async function assertEmailFree(email: string): Promise<void> {
  if (!email) return;
  const rows = await db.select({ id: users.id }).from(users).where(eq(users.email, email)).limit(1);
  if (rows.length) {
    throw new AuthError("That email address is already on another account.", "EMAIL_TAKEN", 409);
  }
}

/** Translate a raced unique write (two tabs signing up at once) into the
 *  same friendly 409 the pre-checks produce. */
function rethrowUniqueViolation(error: unknown): never {
  const message = error instanceof Error ? error.message : String(error);
  if (message.includes("users_username_unique")) {
    throw new AuthError("That username is already taken. Try another one.", "USERNAME_TAKEN", 409);
  }
  if (message.includes("users_email_unique")) {
    throw new AuthError("That email address is already on another account.", "EMAIL_TAKEN", 409);
  }
  throw error;
}

/**
 * Create an account - and nothing more.
 *
 * Creating credentials does NOT sign anybody in. The learner types the
 * username and password they just chose into the sign-in form, which both
 * proves the credentials work (a typo in a password manager is caught here,
 * not a week later on their phone) and makes the two acts - "I have an
 * account" and "I am signed in on this device" - visibly separate.
 *
 * If this browser already built a plan anonymously, the new account ADOPTS
 * that row instead of starting empty - months of lessons, logs and streak
 * survive the upgrade, and from that moment the same data is one sign-in
 * away on every other device.
 */
export async function createAccount(
  req: Request,
  input: { username: unknown; password: unknown; name?: unknown; email?: unknown },
): Promise<NewAccountResult> {
  await ensureAuthSchema();

  const usernameIssue = usernameProblem(input.username);
  if (usernameIssue) throw new AuthError(usernameIssue, "INVALID_USERNAME");
  const username = normalizeUsername(input.username);
  const passwordIssue = passwordProblem(input.password, username);
  if (passwordIssue) throw new AuthError(passwordIssue, "WEAK_PASSWORD");
  const password = String(input.password);
  const display = displayUsername(input.username, username);
  const name =
    typeof input.name === "string" && input.name.trim()
      ? input.name.trim().slice(0, 100)
      : display;
  /* Every new account carries an email from day one. It is what makes digest
     mail and password-less recovery possible later; unverified addresses are
     stored (the learner keeps using the app) but receive nothing. */
  const emailIssue = emailProblem(input.email);
  if (emailIssue) throw new AuthError(emailIssue, "INVALID_EMAIL");
  const email = normalizeEmail(input.email);

  await assertUsernameFree(username);
  await assertEmailFree(email);

  const passwordHash = await hashPassword(password);
  const now = new Date();
  const credentials = {
    username,
    usernameDisplay: display,
    passwordHash,
    passwordUpdatedAt: now,
    lastLoginAt: now,
    failedLogins: 0,
    lockedUntil: null,
    email,
    emailVerifiedAt: null,
  };

  // ── Claim the plan this device built while it was anonymous ──────────
  const deviceKey = req.headers.get("x-user-key")?.trim() || "";
  let claimed: User | null = null;
  if (USER_KEY_RE.test(deviceKey)) {
    const existing = await db
      .select()
      .from(users)
      .where(and(eq(users.userKey, deviceKey), isNull(users.username)))
      .limit(1);
    const candidate = existing[0];
    // Only an un-credentialed row can be claimed, and only by the device
    // that holds its key - an account is never silently taken over.
    if (candidate && !candidate.passwordHash) {
      try {
        const updated = await db
          .update(users)
          .set({ ...credentials, name: candidate.onboarded ? candidate.name : name })
          .where(and(eq(users.id, candidate.id), isNull(users.username)))
          .returning();
        claimed = updated[0] || null;
      } catch (error) {
        rethrowUniqueViolation(error);
      }
    }
  }

  let user = claimed;
  if (!user) {
    let inserted: User[];
    try {
      inserted = await db
        .insert(users)
        .values({ userKey: newUserKey(), name, ...credentials })
        .returning();
    } catch (error) {
      rethrowUniqueViolation(error);
    }
    user = inserted[0];
    if (!user) throw new AuthError("Could not create the account. Please try again.", "SIGNUP_FAILED", 500);
    await db
      .insert(settings)
      .values({ userId: user.id, startDate: todayStr(), examDate: addDays(todayStr(), 90) })
      .onConflictDoNothing({ target: settings.userId });
  }

  return { user, claimedExistingPlan: !!claimed && !!claimed.onboarded };
}

/**
 * Sign in. Wrong usernames and wrong passwords return the SAME message, so
 * the form never confirms which usernames exist; repeated failures pause the
 * account briefly instead of letting a script grind through passwords.
 */
export async function signIn(
  req: Request,
  input: { username: unknown; password: unknown },
): Promise<AccountResult> {
  await ensureAuthSchema();

  /* The box on the sign-in form accepts the username OR the email address.
     Usernames cannot contain @ (authRules), so the identifier decides its
     own lookup column unambiguously. The failure message is the same for a
     wrong username, a wrong email and a wrong password, so the form never
     confirms which accounts exist. */
  const identifier = loginLooksLikeEmail(input.username)
    ? normalizeEmail(input.username)
    : normalizeUsername(input.username);
  const password = typeof input.password === "string" ? input.password : "";
  const generic = new AuthError("Incorrect username or password.", "INVALID_CREDENTIALS", 401);
  if (!identifier || !password) throw generic;

  const rows = loginLooksLikeEmail(input.username)
    ? await db.select().from(users).where(eq(users.email, identifier)).limit(1)
    : await db.select().from(users).where(eq(users.username, identifier)).limit(1);
  const user = rows[0];
  if (!user || !user.passwordHash) {
    // Spend a comparable amount of time so a missing account is not
    // detectable by how fast the answer comes back.
    await hashPassword(password);
    throw generic;
  }

  if (user.lockedUntil && user.lockedUntil.getTime() > Date.now()) {
    const minutes = Math.max(1, Math.ceil((user.lockedUntil.getTime() - Date.now()) / 60_000));
    throw new AuthError(
      `Too many failed attempts. Try again in ${minutes} minute${minutes === 1 ? "" : "s"}.`,
      "ACCOUNT_LOCKED",
      429,
    );
  }

  const ok = await verifyPassword(password, user.passwordHash);
  if (!ok) {
    const failed = (user.failedLogins || 0) + 1;
    await db
      .update(users)
      .set({
        failedLogins: failed,
        lockedUntil: failed >= MAX_FAILED_LOGINS ? new Date(Date.now() + LOCKOUT_MS) : null,
      })
      .where(eq(users.id, user.id));
    if (failed >= MAX_FAILED_LOGINS) {
      throw new AuthError(
        "Too many failed attempts. Try again in 15 minutes.",
        "ACCOUNT_LOCKED",
        429,
      );
    }
    throw generic;
  }

  const now = new Date();
  await db
    .update(users)
    .set({ failedLogins: 0, lockedUntil: null, lastLoginAt: now })
    .where(eq(users.id, user.id));
  // Make sure a claimed/legacy account always has a settings row.
  await db
    .insert(settings)
    .values({ userId: user.id, startDate: todayStr(), examDate: addDays(todayStr(), 90) })
    .onConflictDoNothing({ target: settings.userId });

  const token = await createSession(user.id, req);
  return { user: { ...user, lastLoginAt: now }, token, claimedExistingPlan: false };
}

/**
 * Change the password of a signed-in account. Every other device is signed
 * out - the whole point of changing a password is that whoever had the old
 * one loses access.
 */
export async function changePassword(
  req: Request,
  user: User,
  input: { currentPassword: unknown; newPassword: unknown },
): Promise<{ signedOutDevices: number }> {
  await ensureAuthSchema();
  const current = typeof input.currentPassword === "string" ? input.currentPassword : "";
  if (!(await verifyPassword(current, user.passwordHash))) {
    throw new AuthError("That is not your current password.", "INVALID_CREDENTIALS", 403);
  }
  const issue = passwordProblem(input.newPassword, user.username || "");
  if (issue) throw new AuthError(issue, "WEAK_PASSWORD");
  const next = String(input.newPassword);
  if (await verifyPassword(next, user.passwordHash)) {
    throw new AuthError("Choose a password different from the current one.", "PASSWORD_UNCHANGED");
  }

  await db
    .update(users)
    .set({ passwordHash: await hashPassword(next), passwordUpdatedAt: new Date(), failedLogins: 0, lockedUntil: null })
    .where(eq(users.id, user.id));
  const signedOutDevices = await destroyOtherSessions(user.id, sessionTokenFrom(req));
  return { signedOutDevices };
}

/** The account summary the client shows (never the hash, never the token). */
export function publicAccount(user: User) {
  return {
    username: user.usernameDisplay || user.username || "",
    usernameKey: user.username || "",
    name: user.name,
    createdAt: user.createdAt instanceof Date ? user.createdAt.toISOString() : null,
    lastLoginAt: user.lastLoginAt instanceof Date ? user.lastLoginAt.toISOString() : null,
    hasAccount: !!user.username,
    /* The account's own address is private to the learner: it is only ever
       returned over their own authenticated session. */
    email: user.email || null,
    emailVerified: !!user.emailVerifiedAt,
    /* Google-created accounts have no password: Settings offers "Set a
       password" instead of "Change password". */
    hasPassword: !!user.passwordHash,
    googleLinked: !!user.googleSub,
    emailUnsubscribed: !!user.emailUnsubscribed,
  };
}

/* ── Email addresses ───────────────────────────────────────────────── */

/** How long a verification link stays valid (spec: 24 hours). */
export const EMAIL_TOKEN_TTL_MS = 24 * 60 * 60 * 1000;

/** The browser-facing random string inside a verification link. */
function newEmailToken(): string {
  return randomBytes(32).toString("base64url");
}

/** What the database stores about a verification link (never the token). */
export function emailTokenHash(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/**
 * Add the first email, or change the one already there. The new address is
 * stored lower-cased and immediately marked UNVERIFIED, and a fresh single-
 * use token is minted for the mail it triggers. Any older pending tokens are
 * deleted, so a stale link always dies instead of flipping the address back.
 */
export async function setAccountEmail(user: User, input: unknown): Promise<{ email: string; token: string }> {
  await ensureAuthSchema();
  const issue = emailProblem(input);
  if (issue) throw new AuthError(issue, "INVALID_EMAIL");
  const email = normalizeEmail(input);
  if (email === user.email && user.emailVerifiedAt) {
    throw new AuthError("That email address is already verified on this account.", "EMAIL_UNCHANGED");
  }
  const holder = user.email === email ? [] : await db
    .select({ id: users.id })
    .from(users)
    .where(and(eq(users.email, email), ne(users.id, user.id)))
    .limit(1);
  if (holder.length) {
    throw new AuthError("That email address is already on another account.", "EMAIL_TAKEN", 409);
  }
  await db.update(users).set({ email, emailVerifiedAt: null }).where(eq(users.id, user.id));
  return { email, token: await issueEmailToken(user.id, email) };
}

/**
 * Mint a fresh verification token for (user, address): delete the old ones,
 * insert the new hash, hand the RAW token to the mailer - and nowhere else.
 */
export async function issueEmailToken(userId: number, email: string): Promise<string> {
  const token = newEmailToken();
  await db.delete(authEmailTokens).where(eq(authEmailTokens.userId, userId));
  await db.insert(authEmailTokens).values({
    userId,
    email,
    tokenHash: emailTokenHash(token),
    expiresAt: new Date(Date.now() + EMAIL_TOKEN_TTL_MS),
  });
  // Housekeeping on the same round trip: nobody else's expired rows matter,
  // but letting them pile up forever is not an option either.
  try {
    await db.delete(authEmailTokens).where(lt(authEmailTokens.expiresAt, new Date()));
  } catch {
    /* expired rows are harmless if this sweep loses a race */
  }
  return token;
}

/**
 * Spend a verification token. Single-use: the row is deleted the moment it
 * is read, so a double-click of the email link lands on "already used"
 * instead of re-verifying, and a copied link is worthless to anyone else.
 * Returns the now-verified user, or null for an unknown/expired token.
 */
export async function consumeEmailToken(rawToken: string): Promise<User | null> {
  await ensureAuthSchema();
  const token = String(rawToken || "").trim();
  if (!token || token.length > 256) return null;
  const rows = await db
    .select()
    .from(authEmailTokens)
    .where(eq(authEmailTokens.tokenHash, emailTokenHash(token)))
    .limit(1);
  const row = rows[0];
  if (!row) return null;
  await db.delete(authEmailTokens).where(eq(authEmailTokens.id, row.id));
  if (row.expiresAt.getTime() <= Date.now()) return null;
  const updated = await db
    .update(users)
    .set({ email: row.email, emailVerifiedAt: new Date() })
    .where(eq(users.id, row.userId))
    .returning();
  return updated[0] || null;
}

/* ── Username changes (Google accounts get a suggested one first) ──── */

/** Rename an account. Sessions are keyed by user id, so every signed-in
 *  device stays signed in and simply starts greeting the new name. */
export async function changeUsername(user: User, input: unknown): Promise<User> {
  await ensureAuthSchema();
  const issue = usernameProblem(input);
  if (issue) throw new AuthError(issue, "INVALID_USERNAME");
  const username = normalizeUsername(input);
  if (username === user.username) {
    throw new AuthError("That is already your username.", "USERNAME_UNCHANGED");
  }
  await assertUsernameFree(username);
  let updated: User[];
  try {
    updated = await db
      .update(users)
      .set({ username, usernameDisplay: displayUsername(input, username) })
      .where(eq(users.id, user.id))
      .returning();
  } catch (error) {
    rethrowUniqueViolation(error);
  }
  if (!updated[0]) throw new AuthError("Could not change the username. Please try again.", "USERNAME_FAILED", 500);
  return updated[0];
}

/* ── Password-less accounts (created by Google sign-in) ────────────── */

/**
 * Give a password to an account that has none. Only usable while
 * passwordHash is NULL - an account WITH a password goes through
 * changePassword (which demands the current one). Nothing is signed out:
 * the point is to add a second way in, not to revoke the first.
 */
export async function setFirstPassword(user: User, input: unknown): Promise<void> {
  await ensureAuthSchema();
  if (user.passwordHash) {
    throw new AuthError("This account already has a password. Use Change password instead.", "PASSWORD_EXISTS");
  }
  const issue = passwordProblem(input, user.username || "");
  if (issue) throw new AuthError(issue, "WEAK_PASSWORD");
  await db
    .update(users)
    .set({ passwordHash: await hashPassword(String(input)), passwordUpdatedAt: new Date(), failedLogins: 0, lockedUntil: null })
    .where(eq(users.id, user.id));
}

/* ── Google sign-in ────────────────────────────────────────────────── */

export type GoogleIdentity = {
  /** The stable "sub" claim: the one thing that identifies a Google person. */
  sub: string;
  email: string;
  emailVerified: boolean;
  displayName?: string;
};

/**
 * Derive a valid, free username from an email address ("priya.nair91@...
 * becomes "priya.nair91"). Runs through the SAME rules a typed username
 * does; falls back to numbered variants when the first idea is taken.
 */
export async function suggestUsername(email: string): Promise<string> {
  const local = normalizeEmail(email).split("@")[0] || "";
  const base = local
    .replace(/[^a-z0-9._-]+/g, ".")
    .replace(/[._-]{2,}/g, ".")
    .replace(/^[._-]+|[._-]+$/g, "");
  const candidates = [base];
  for (let i = 0; i < 6; i++) {
    candidates.push(`${base}.${100 + Math.floor(Math.random() * 900)}`);
    candidates.push(`${base}${10 + Math.floor(Math.random() * 90)}`);
  }
  for (const candidate of candidates) {
    if (!candidate || usernameProblem(candidate)) continue;
    const rows = await db.select({ id: users.id }).from(users).where(eq(users.username, candidate)).limit(1);
    if (!rows.length) return candidate;
  }
  // A guaranteed-legal, guaranteed-unguessable last resort.
  return `learner${randomBytes(3).toString("hex")}`;
}

/**
 * Sign in with a verified Google identity - or become a new account.
 *
 * Matching order (an account is never duplicated):
 *   1. google_sub  → the same Google person as last time: sign them in.
 *   2. email       → the address is already on an account: Google is itself
 *      vouching for it (email_verified true), so link it, verify it and
 *      sign in. This holds even if the address was never verified locally,
 *      because a Google-verified email is exactly the proof the app asks for.
 *   3. no match   → create a fresh account with a suggested username, the
 *      email already verified, and NO password (Settings can set one later).
 */
export async function signInWithGoogle(
  req: Request,
  identity: GoogleIdentity,
): Promise<{ user: User; token: string; created: boolean }> {
  await ensureAuthSchema();

  const sub = String(identity.sub || "").trim();
  const email = normalizeEmail(identity.email);
  if (!sub) throw new AuthError("Google did not return an account id.", "GOOGLE_IDENTITY", 400);
  const emailIssue = emailProblem(email);
  if (emailIssue) throw new AuthError("Google did not return a usable email address.", "GOOGLE_IDENTITY", 400);
  if (identity.emailVerified !== true) {
    throw new AuthError(
      "Google could not confirm that you own this email address, so it cannot be used to sign in.",
      "GOOGLE_EMAIL_UNVERIFIED",
      403,
    );
  }

  const now = new Date();
  const finish = async (user: User, created: boolean) => {
    await db.update(users).set({ lastLoginAt: now, failedLogins: 0, lockedUntil: null }).where(eq(users.id, user.id));
    await db
      .insert(settings)
      .values({ userId: user.id, startDate: todayStr(), examDate: addDays(todayStr(), 90) })
      .onConflictDoNothing({ target: settings.userId });
    const token = await createSession(user.id, req);
    return { user: { ...user, googleSub: sub }, token, created };
  };

  // 1. The Google person we have seen before.
  const bySub = await db.select().from(users).where(eq(users.googleSub, sub)).limit(1);
  if (bySub[0]) {
    /* Keep local verification fresh if the address changed on Google's side. */
    if (bySub[0].email !== email && !(await db.select({ id: users.id }).from(users).where(and(eq(users.email, email), ne(users.id, bySub[0].id))).limit(1))[0]) {
      await db.update(users).set({ email, emailVerifiedAt: now }).where(eq(users.id, bySub[0].id));
    }
    return finish(bySub[0], false);
  }

  // 2. The email already belongs to an account here.
  const byEmail = await db.select().from(users).where(eq(users.email, email)).limit(1);
  if (byEmail[0]) {
    await db
      .update(users)
      .set({ googleSub: sub, emailVerifiedAt: byEmail[0].emailVerifiedAt || now })
      .where(eq(users.id, byEmail[0].id));
    return finish({ ...byEmail[0], googleSub: sub }, false);
  }

  // 3. A brand new account.
  const username = await suggestUsername(email);
  const name =
    typeof identity.displayName === "string" && identity.displayName.trim()
      ? identity.displayName.trim().slice(0, 100)
      : username;
  let inserted: User[];
  try {
    inserted = await db
      .insert(users)
      .values({
        userKey: newUserKey(),
        username,
        usernameDisplay: username,
        passwordHash: null,
        passwordUpdatedAt: null,
        lastLoginAt: now,
        failedLogins: 0,
        lockedUntil: null,
        email,
        emailVerifiedAt: now,
        googleSub: sub,
        name,
      })
      .returning();
  } catch (error) {
    rethrowUniqueViolation(error);
  }
  const user = inserted[0];
  if (!user) throw new AuthError("Could not create the account. Please try again.", "GOOGLE_SIGNUP_FAILED", 500);
  await db
    .insert(settings)
    .values({ userId: user.id, startDate: todayStr(), examDate: addDays(todayStr(), 90) })
    .onConflictDoNothing({ target: settings.userId });
  return finish(user, true);
}

/** A stable id for logging a sign-in attempt without storing the username. */
export function attemptFingerprint(username: string): string {
  return createHash("sha256").update(`attempt:${normalizeUsername(username)}`).digest("hex").slice(0, 16);
}

/** Exposed for tests: a random, URL-safe id of the same shape tokens use. */
export function randomId(): string {
  return randomUUID().replace(/-/g, "");
}
