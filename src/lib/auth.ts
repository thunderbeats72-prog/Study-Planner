import { createHash, randomBytes, randomUUID, scrypt as scryptCb, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import { and, eq, isNull, lt, ne, sql } from "drizzle-orm";
import { db } from "@/db";
import { authSessions, settings, users, type User } from "@/db/schema";
import { demoDataEnabled } from "./demoGate";
import { deviceLabel, keyFrom, newUserKey, USER_KEY_RE } from "./identity";
import { normalizeUsername, passwordProblem, usernameProblem, displayUsername } from "./authRules";
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
  input: { username: unknown; password: unknown; name?: unknown },
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

  const taken = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.username, username))
    .limit(1);
  if (taken.length) {
    throw new AuthError("That username is already taken. Try another one.", "USERNAME_TAKEN", 409);
  }

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
      const updated = await db
        .update(users)
        .set({ ...credentials, name: candidate.onboarded ? candidate.name : name })
        .where(and(eq(users.id, candidate.id), isNull(users.username)))
        .returning();
      claimed = updated[0] || null;
    }
  }

  let user = claimed;
  if (!user) {
    const inserted = await db
      .insert(users)
      .values({ userKey: newUserKey(), name, ...credentials })
      .returning();
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

  const username = normalizeUsername(input.username);
  const password = typeof input.password === "string" ? input.password : "";
  const generic = new AuthError("Incorrect username or password.", "INVALID_CREDENTIALS", 401);
  if (!username || !password) throw generic;

  const rows = await db.select().from(users).where(eq(users.username, username)).limit(1);
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
  };
}

/** A stable id for logging a sign-in attempt without storing the username. */
export function attemptFingerprint(username: string): string {
  return createHash("sha256").update(`attempt:${normalizeUsername(username)}`).digest("hex").slice(0, 16);
}

/** Exposed for tests: a random, URL-safe id of the same shape tokens use. */
export function randomId(): string {
  return randomUUID().replace(/-/g, "");
}
