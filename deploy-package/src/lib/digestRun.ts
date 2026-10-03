/**
 * THE DIGEST SWEEP - turn "hourly cron pings" into "one email, on time".
 * ───────────────────────────────────────────────────────────────────────
 * An hourly caller (GitHub Actions, with the Vercel daily cron as backstop)
 * triggers this. For every account that could receive mail it asks the pure
 * selectors in src/lib/notifications.ts whether a message is DUE, then:
 *
 *   1. RESERVES the (user, kind, local-date) slot in notifications_sent
 *      first, so two overlapping runs can never both send (the unique index
 *      returns nothing for the loser, and it walks away);
 *   2. builds the content from the plan's own logic (src/lib/digest.ts);
 *   3. sends it (or writes the dry-run artifact when no keys exist yet);
 *   4. RELEASES the reservation only when the send failed, so a transient
 *      mail hiccup is retried by the next hourly run instead of being lost.
 *
 * House rule: an unchanged clock between 22:00 and 07:00 (the learner's
 * quiet hours) silences everything. Nothing leaves during quiet hours.
 */

import { and, desc, eq, gte, isNotNull, sql as drizzleSql } from "drizzle-orm";
import { db } from "@/db";
import { notificationsSent, sessions, settings, subjects, tasks, users, type User } from "@/db/schema";
import { ensureAuthSchema } from "./auth";
import { addDays } from "./planner";
import {
  digestDue,
  localTimeAt,
  mergeNotificationPrefs,
  unsubscribeUrlFor,
  weeklyDue,
  type NotificationPrefs,
} from "./notifications";
import {
  digestHtml,
  digestSubject,
  digestText,
  weekdayName,
  weeklyHtml,
  weeklySubject,
  weeklyText,
  type DigestInput,
} from "./digest";
import { mailOutboxDir, resolveMailTransport, sendMail, type MailResult } from "./mailer";
import type { OutgoingMessage } from "./mime";

/** A safety cap so an hourly run always finishes inside the function's time
 *  budget. Anything past the cap is simply next hour's work. */
const SWEEP_USER_CAP = 60;

type Ledger = Set<string>;

async function sentLedgerFor(userId: number): Promise<Ledger> {
  const rows = await db
    .select({ kind: notificationsSent.kind, date: notificationsSent.date })
    .from(notificationsSent)
    .where(eq(notificationsSent.userId, userId));
  return new Set(rows.map((row) => `${row.kind}:${row.date}`));
}

/** Reserve the send slot. True = we are the sender; false = already done. */
async function reserveSend(userId: number, kind: string, date: string): Promise<boolean> {
  const rows = await db
    .insert(notificationsSent)
    .values({ userId, kind, date })
    .onConflictDoNothing({ target: [notificationsSent.userId, notificationsSent.kind, notificationsSent.date] })
    .returning({ id: notificationsSent.id });
  return rows.length === 1;
}

/** Give the slot back when the send failed, so the next run retries. */
async function releaseSend(userId: number, kind: string, date: string): Promise<void> {
  try {
    await db
      .delete(notificationsSent)
      .where(
        and(
          eq(notificationsSent.userId, userId),
          eq(notificationsSent.kind, kind),
          eq(notificationsSent.date, date),
        ),
      );
  } catch {
    /* losing this race just means the digest is a day late, never twice */
  }
}

/** Load everything a digest says, in the shape the pure renderer wants. */
async function digestData(user: User, prefs: NotificationPrefs, localDate: string, baseUrl: string): Promise<DigestInput> {
  const [settingsRows, taskRows, subjectRows, sessionRows] = await Promise.all([
    db.select().from(settings).where(eq(settings.userId, user.id)).limit(1),
    db
      .select()
      .from(tasks)
      .where(and(eq(tasks.userId, user.id), gte(tasks.date, addDays(localDate, -14))))
      .limit(600),
    db.select({ id: subjects.id, name: subjects.name }).from(subjects).where(eq(subjects.userId, user.id)),
    db
      .select()
      .from(sessions)
      .where(and(eq(sessions.userId, user.id), gte(sessions.date, addDays(localDate, -9))))
      .orderBy(desc(sessions.createdAt))
      .limit(300),
  ]);
  const st = settingsRows[0];
  return {
    name: user.name || "there",
    today: localDate,
    weekday: weekdayName(localDate),
    tasks: taskRows as never,
    subjects: subjectRows,
    sessions: sessionRows.map((row) => ({ date: row.date, minutes: row.minutes })),
    dailyHours: st?.dailyHours ?? 2,
    examDate: st?.examDate || null,
    streak: user.streak,
    appUrl: baseUrl,
    unsubscribeUrl: unsubscribeUrlFor(baseUrl, user.id, "all"),
  };
}

/** Build the digest message for a learner as it must look RIGHT NOW. */
export async function buildDigestMessage(
  user: User,
  localDate: string,
  baseUrl: string,
): Promise<Omit<OutgoingMessage, "from">> {
  const prefs = mergeNotificationPrefs(user.notifyPrefs);
  const input = await digestData(user, prefs, localDate, baseUrl);
  return {
    to: user.email!,
    subject: digestSubject(input),
    text: digestText(input),
    html: digestHtml(input),
    unsubscribeUrl: unsubscribeUrlFor(baseUrl, user.id, "all"),
  };
}

/** Build the Sunday-evening weekly summary message. */
export async function buildWeeklyMessage(
  user: User,
  localDate: string,
  baseUrl: string,
): Promise<Omit<OutgoingMessage, "from"> & { weekStart: string; weekEnd: string }> {
  const prefs = mergeNotificationPrefs(user.notifyPrefs);
  const input = await digestData(user, prefs, localDate, baseUrl);
  const weekStart = addDays(localDate, -6);
  const weekEnd = localDate;
  const weekSessions = input.sessions.filter((session) => session.date >= weekStart && session.date <= weekEnd);
  const weeklyInput = { ...input, weekStart, weekEnd, weekSessions };
  return {
    to: user.email!,
    subject: weeklySubject(weeklyInput),
    text: weeklyText(weeklyInput),
    html: weeklyHtml(weeklyInput),
    unsubscribeUrl: unsubscribeUrlFor(baseUrl, user.id, "all"),
    weekStart,
    weekEnd,
  };
}

export type SweepSummary = {
  examined: number;
  sent: number;
  dryRun: number;
  skipped: Record<string, number>;
  errors: { user: number; error: string }[];
};

/**
 * One full pass over every deliverable account. Deterministic inputs,
 * bounded size, per-learner isolation (one learner's broken transport
 * response never costs another learner their email).
 */
export async function runDigestSweep(nowUtc: Date, baseUrl: string): Promise<SweepSummary> {
  await ensureAuthSchema();
  const transport = resolveMailTransport();
  const candidates = await db
    .select()
    .from(users)
    .where(and(isNotNull(users.email), isNotNull(users.emailVerifiedAt), eq(users.emailUnsubscribed, false)))
    .limit(SWEEP_USER_CAP);

  const summary: SweepSummary = { examined: 0, sent: 0, dryRun: 0, skipped: {}, errors: [] };
  const skip = (reason: string) => {
    summary.skipped[reason] = (summary.skipped[reason] || 0) + 1;
  };

  for (const candidate of candidates) {
    summary.examined += 1;
    try {
      const prefs = mergeNotificationPrefs(candidate.notifyPrefs);
      const ledger = await sentLedgerFor(candidate.id);
      const local = localTimeAt(nowUtc, prefs.timezone);

      // At most ONE email per learner per run: the daily digest wins the
      // slot; the weekly wrap rides the Sunday that has no digest due yet.
      const digest = digestDue(
        { hasEmail: true, emailVerified: true, emailUnsubscribed: false },
        prefs,
        nowUtc,
        (date) => ledger.has(`digest:${date}`),
      );
      const weekly = weeklyDue(
        { hasEmail: true, emailVerified: true, emailUnsubscribed: false },
        prefs,
        nowUtc,
        (date) => ledger.has(`weekly:${date}`),
      );

      type Job = { kind: "digest" | "weekly"; localDate: string };
      const job: Job | null = digest.send
        ? { kind: "digest", localDate: digest.localDate }
        : weekly.send
          ? { kind: "weekly", localDate: weekly.localDate }
          : null;
      if (!job) {
        skip(digest.send ? "" : digest.reason || (weekly.send ? "" : weekly.reason));
        continue;
      }

      if (!(await reserveSend(candidate.id, job.kind, job.localDate))) {
        skip("already_sent");
        continue;
      }

      const message =
        job.kind === "digest"
          ? await buildDigestMessage(candidate, job.localDate, baseUrl)
          : await buildWeeklyMessage(candidate, job.localDate, baseUrl);
      const result = await sendMail(message, { transport, outboxDir: mailOutboxDir() });
      if (!result.ok) {
        await releaseSend(candidate.id, job.kind, job.localDate);
        summary.errors.push({ user: candidate.id, error: result.error || "send failed" });
        continue;
      }
      if (result.dryRun) summary.dryRun += 1;
      summary.sent += 1;
    } catch (error) {
      summary.errors.push({ user: candidate.id, error: error instanceof Error ? error.message : String(error) });
    }
  }

  // Keep the ledger meaningful but small.
  try {
    await db.delete(notificationsSent).where(drizzleSql`${notificationsSent.createdAt} < now() - interval '120 days'`);
  } catch {
    /* housekeeping only */
  }

  return summary;
}

/**
 * "Send me a test digest now": the REAL renderer, addressed to the caller,
 * sent immediately regardless of the schedule (the button IS the schedule).
 * Kind `test` never touches the daily ledger, so the real digest still
 * arrives tonight even after ten test presses.
 */
export async function sendTestDigest(user: User, nowUtc: Date, baseUrl: string): Promise<{
  result: MailResult;
  preview: { subject: string; text: string; html: string };
  localDate: string;
}> {
  await ensureAuthSchema();
  if (!user.email) {
    throw new Error("Add an email address first - there is nowhere to send the test.");
  }
  const prefs = mergeNotificationPrefs(user.notifyPrefs);
  const localDate = localTimeAt(nowUtc, prefs.timezone).dateStr;
  const message = await buildDigestMessage(user, localDate, baseUrl);
  const result = await sendMail(message);
  return { result, preview: { subject: message.subject, text: message.text, html: message.html }, localDate };
}
