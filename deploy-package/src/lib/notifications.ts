/**
 * NOTIFICATIONS - the shared, PURE core.
 * ──────────────────────────────────────
 * Everything that decides WHEN a person should hear from the app lives here
 * as pure functions (no database, no fetch, no clock of its own - `nowUtc`
 * is always passed in), so the test suite can pin timezones, quiet hours
 * and the "exactly once a day" promise without standing anything up.
 *
 *   src/lib/notify.ts    - the database side (rows, dedup, generation)
 *   src/lib/digest.ts     - what the email SAYS (built from real plan logic)
 *   src/lib/digestRun.ts  - the hourly sweep (who is due, send, ledger)
 *
 * Scheduling model, said once: GitHub Actions (and the Vercel backstop cron)
 * call /api/cron/digest HOURLY. A daily digest for a learner is DUE the
 * moment their local wall clock is at or past their chosen hour on a day no
 * send is recorded for yet - so a cron run that lands late (and GitHub's
 * free runners often land late) can delay an email but never skip a day.
 * The notifications_sent ledger, unique on (user, kind, local date), is what
 * makes a retry, a double trigger or an overlapping run send nothing twice.
 */

export const DEFAULT_TIMEZONE = "Asia/Kolkata";

/** The notification kinds the app can raise. Each maps to ONE Settings toggle. */
export const NOTIFICATION_KINDS = [
  "plan_ready",
  "overdue",
  "streak_risk",
  "exam_milestone",
  "session_summary",
  "weekly_summary",
] as const;
export type NotificationKind = (typeof NOTIFICATION_KINDS)[number];

export type NotificationPrefs = {
  /** The daily plan email. Requires a verified email; the Settings toggle is
   *  disabled (with the reason) until one exists. */
  digestEnabled: boolean;
  /** The Sunday-evening wrap-up email - a SECOND, separate opt-in. */
  weeklyEmailEnabled: boolean;
  /** Local hour (0-23) the digest should arrive at. */
  sendHour: number;
  /** IANA timezone the schedule is evaluated in. */
  timezone: string;
  /** Quiet hours: nothing pops, no mail is sent, in [start, end) - wraps midnight. */
  quietStart: number;
  quietEnd: number;
  /** Per-type in-app toggles. */
  types: Record<NotificationKind, boolean>;
};

export function defaultNotificationPrefs(): NotificationPrefs {
  return {
    digestEnabled: true,
    weeklyEmailEnabled: false,
    sendHour: 8,
    timezone: DEFAULT_TIMEZONE,
    quietStart: 22,
    quietEnd: 7,
    types: {
      plan_ready: true,
      overdue: true,
      streak_risk: true,
      exam_milestone: true,
      session_summary: true,
      weekly_summary: true,
    },
  };
}

function clampHour(value: unknown, fallback: number): number {
  const num = Math.floor(Number(value));
  if (!Number.isFinite(num) || num < 0 || num > 23) return fallback;
  return num;
}

/** Merge stored jsonb over the defaults. Unknown keys are dropped, so an
 *  old row can never resurrect a removed option and new options appear for
 *  old accounts with their documented defaults. */
export function mergeNotificationPrefs(stored: unknown): NotificationPrefs {
  const base = defaultNotificationPrefs();
  if (!stored || typeof stored !== "object" || Array.isArray(stored)) return base;
  const raw = stored as Record<string, unknown>;
  const out: NotificationPrefs = {
    digestEnabled: typeof raw.digestEnabled === "boolean" ? raw.digestEnabled : base.digestEnabled,
    weeklyEmailEnabled:
      typeof raw.weeklyEmailEnabled === "boolean" ? raw.weeklyEmailEnabled : base.weeklyEmailEnabled,
    sendHour: clampHour(raw.sendHour, base.sendHour),
    timezone: validTimezone(raw.timezone) ? String(raw.timezone) : base.timezone,
    quietStart: clampHour(raw.quietStart, base.quietStart),
    quietEnd: clampHour(raw.quietEnd, base.quietEnd),
    types: { ...base.types },
  };
  if (raw.types && typeof raw.types === "object" && !Array.isArray(raw.types)) {
    const typesRaw = raw.types as Record<string, unknown>;
    for (const kind of NOTIFICATION_KINDS) {
      if (typeof typesRaw[kind] === "boolean") out.types[kind] = typesRaw[kind];
    }
  }
  return out;
}

/* ── Timezone helpers ──────────────────────────────────────────────── */

/** False for anything Intl cannot format - catches typos at the API edge. */
export function validTimezone(value: unknown): boolean {
  if (typeof value !== "string" || !value || value.length > 64) return false;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: value }).format(new Date());
    return true;
  } catch {
    return false;
  }
}

export type LocalTime = {
  /** 0-23 in the learner's timezone. */
  hour: number;
  minute: number;
  /** 0 = Sunday ... 6 = Saturday, in the learner's timezone. */
  day: number;
  /** The calendar date the learner is living, YYYY-MM-DD, in their zone. */
  dateStr: string;
};

/** Where/when "now" is for a learner in `timezone`. */
export function localTimeAt(nowUtc: Date, timezone: string): LocalTime {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: validTimezone(timezone) ? timezone : DEFAULT_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    weekday: "short",
    hourCycle: "h23",
  }).formatToParts(nowUtc);
  const read = (type: string) => parts.find((part) => part.type === type)?.value || "";
  const dayNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  return {
    hour: Math.min(23, Number(read("hour")) || 0),
    minute: Math.min(59, Number(read("minute")) || 0),
    day: Math.max(0, dayNames.indexOf(read("weekday"))),
    dateStr: `${read("year")}-${read("month")}-${read("day")}`,
  };
}

/**
 * Quiet hours: [quietStart, quietEnd) local, wrapping midnight
 * (22 -> 7 means 22:00-06:59). Equal endpoints mean "no quiet hours at all".
 */
export function inQuietHours(hour: number, quietStart: number, quietEnd: number): boolean {
  if (quietStart === quietEnd) return false;
  if (quietStart < quietEnd) return hour >= quietStart && hour < quietEnd;
  return hour >= quietStart || hour < quietEnd;
}

/* ── Email selection: who is due RIGHT NOW? ────────────────────────── */

export type EmailGate = {
  /** Account facts as stored. */
  hasEmail: boolean;
  emailVerified: boolean;
  emailUnsubscribed: boolean;
};

export type DigestDecision =
  | { send: true; localDate: string; kind: "digest" | "weekly" }
  | { send: false; reason: string; kind: "digest" | "weekly" };

/**
 * Is the DAILY digest due for this person at this instant?
 * Sends are idempotent per local date, so the rule is "at or past the
 * chosen hour, outside quiet hours, not yet sent today" rather than an
 * exact-hour match: a late cron run delays mail, never cancels a day.
 */
export function digestDue(
  gate: EmailGate,
  prefs: NotificationPrefs,
  nowUtc: Date,
  alreadySentFor: (localDate: string) => boolean,
): DigestDecision {
  const local = localTimeAt(nowUtc, prefs.timezone);
  if (!gate.hasEmail) return { send: false, reason: "no_email", kind: "digest" };
  if (!gate.emailVerified) return { send: false, reason: "unverified", kind: "digest" };
  if (gate.emailUnsubscribed) return { send: false, reason: "unsubscribed", kind: "digest" };
  if (!prefs.digestEnabled) return { send: false, reason: "digest_off", kind: "digest" };
  if (inQuietHours(local.hour, prefs.quietStart, prefs.quietEnd)) {
    return { send: false, reason: "quiet_hours", kind: "digest" };
  }
  if (local.hour < prefs.sendHour) {
    return { send: false, reason: "before_send_hour", kind: "digest" };
  }
  if (alreadySentFor(local.dateStr)) {
    return { send: false, reason: "already_sent", kind: "digest" };
  }
  return { send: true, localDate: local.dateStr, kind: "digest" };
}

/**
 * Is the SUNDAY EVENING weekly summary due for this person at this instant?
 * "Evening" = 18:00 local; the catch-up and ledger rules are the digest's.
 */
export const WEEKLY_SUMMARY_HOUR = 18;

export function weeklyDue(
  gate: EmailGate,
  prefs: NotificationPrefs,
  nowUtc: Date,
  alreadySentFor: (localDate: string) => boolean,
): DigestDecision {
  const local = localTimeAt(nowUtc, prefs.timezone);
  if (!gate.hasEmail) return { send: false, reason: "no_email", kind: "weekly" };
  if (!gate.emailVerified) return { send: false, reason: "unverified", kind: "weekly" };
  if (gate.emailUnsubscribed) return { send: false, reason: "unsubscribed", kind: "weekly" };
  if (!prefs.weeklyEmailEnabled) return { send: false, reason: "weekly_off", kind: "weekly" };
  if (local.day !== 0) return { send: false, reason: "not_sunday", kind: "weekly" };
  if (inQuietHours(local.hour, prefs.quietStart, prefs.quietEnd)) {
    return { send: false, reason: "quiet_hours", kind: "weekly" };
  }
  if (local.hour < WEEKLY_SUMMARY_HOUR) return { send: false, reason: "before_evening", kind: "weekly" };
  if (alreadySentFor(local.dateStr)) return { send: false, reason: "already_sent", kind: "weekly" };
  return { send: true, localDate: local.dateStr, kind: "weekly" };
}

/* ── Exam milestones and dedup keys ────────────────────────────────── */

/** The "days to exam" values that earn a spotlight notification. */
export const EXAM_MILESTONES = [30, 14, 7, 3, 1] as const;

export function examMilestoneFor(daysLeft: number): number | null {
  return (EXAM_MILESTONES as readonly number[]).includes(daysLeft) ? daysLeft : null;
}

/** ISO week label ("2026-W40") for weekly dedup keys. */
export function isoWeekLabel(dateStr: string): string {
  const date = new Date(`${dateStr}T12:00:00Z`);
  const thursday = new Date(date);
  thursday.setUTCDate(date.getUTCDate() + ((4 - date.getUTCDay() + 7) % 7));
  const yearStart = new Date(Date.UTC(thursday.getUTCFullYear(), 0, 1));
  const week = Math.floor((thursday.getTime() - yearStart.getTime()) / (7 * 24 * 60 * 60 * 1000)) + 1;
  return `${thursday.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
}

/* ── Unsubscribe signatures ────────────────────────────────────────── */

import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

/** The secret one-click links are signed with. Per-deployment, server-only. */
function unsubscribeSecret(): string {
  const configured = (process.env.MAIL_LINK_SECRET || process.env.CRON_SECRET || "").trim();
  if (configured) return configured;
  // Dry-run deployments (no keys yet) still sign links; they simply stop
  // validating after a restart, which costs a link click, not security.
  const self = globalThis as typeof globalThis & { __sppLinkSecret?: string };
  if (!self.__sppLinkSecret) self.__sppLinkSecret = randomBytes(32).toString("hex");
  return self.__sppLinkSecret;
}

/** HMAC(url-safe hex) of the (user, scope) pair. Truncated, URL-safe. */
export function signUnsubscribe(userId: number, scope: string): string {
  return createHmac("sha256", unsubscribeSecret())
    .update(`unsubscribe:${userId}:${scope}`)
    .digest("hex")
    .slice(0, 40);
}

/** Constant-time check of a link's signature. */
export function verifyUnsubscribe(userId: number, scope: string, signature: string): boolean {
  const expected = signUnsubscribe(userId, scope);
  const a = Buffer.from(expected, "utf8");
  const b = Buffer.from(String(signature || ""), "utf8");
  return a.length === b.length && timingSafeEqual(a, b);
}

/** The absolute one-click URL embedded at the foot of every digest. */
export function unsubscribeUrlFor(baseUrl: string, userId: number, scope = "all"): string {
  const params = new URLSearchParams({ u: String(userId), k: scope, t: signUnsubscribe(userId, scope) });
  return `${baseUrl.replace(/\/+$/, "")}/api/email/unsubscribe?${params.toString()}`;
}
