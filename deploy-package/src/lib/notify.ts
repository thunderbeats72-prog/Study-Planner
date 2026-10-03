/**
 * NOTIFY - the database side of in-app notifications.
 * ────────────────────────────────────────────────────
 * One row per event lives in `notifications`, keyed by (user, dedupKey) -
 * so "one plan-ready notice per morning" or "one exam-14-days notice ever"
 * is enforced by a unique index, not by care. Generation runs lazily when
 * the bell polls (and on server-side events), which means exactly one code
 * path decides what deserves a row, and the laptop and the phone read the
 * same list from the same table.
 *
 * What notifies, when (all per-learner toggles exist in notify_prefs):
 *   plan_ready       a morning with pending lessons, from 06:00 local
 *   overdue          pending tasks dated before today, once per day
 *   streak_risk      a streak on the line, nothing logged after 20:00 local
 *   exam_milestone   30 / 14 / 7 / 3 / 1 days to the exam, once each
 *   session_summary  every newly written session row, with what is next
 *   weekly_summary   Sunday from 18:00 local, once per ISO week
 *
 * Quiet hours NEVER delete a notification - they only mute the toast and
 * the email; the bell still tells the truth.
 */

import { and, desc, eq, gte, isNull, sql as drizzleSql } from "drizzle-orm";
import { db } from "@/db";
import { notifications, sessions, settings, subjects, tasks, users, type User } from "@/db/schema";
import { ensureAuthSchema } from "./auth";
import { backlogFor } from "./recovery";
import { nextAction } from "./prioritization";
import { addDays, diffDays } from "./planner";
import {
  examMilestoneFor,
  isoWeekLabel,
  localTimeAt,
  mergeNotificationPrefs,
  validTimezone,
  inQuietHours,
  NOTIFICATION_KINDS,
  WEEKLY_SUMMARY_HOUR,
  type NotificationKind,
  type NotificationPrefs,
} from "./notifications";

export type PublicNotification = {
  id: number;
  kind: NotificationKind;
  title: string;
  body: string;
  href: string;
  read: boolean;
  createdAt: string;
};

/* ── preferences ───────────────────────────────────────────────────── */

export function prefsFor(user: User): NotificationPrefs {
  return mergeNotificationPrefs(user.notifyPrefs);
}

type PrefsPatch = Partial<{
  digestEnabled: boolean;
  weeklyEmailEnabled: boolean;
  sendHour: number;
  timezone: string;
  quietStart: number;
  quietEnd: number;
  types: Partial<Record<NotificationKind, boolean>>;
}>;

/**
 * Validate and merge a settings patch. Anything invalid is an AuthError the
 * form can show; unknown keys are ignored, so an older client can write a
 * partial patch without knowing about newer options.
 */
export async function saveNotificationPrefs(user: User, patch: Record<string, unknown>): Promise<NotificationPrefs> {
  const current = prefsFor(user);
  const next: NotificationPrefs = { ...current, types: { ...current.types } };
  const p = patch as PrefsPatch & { types?: Record<string, unknown> };

  if ("digestEnabled" in p) next.digestEnabled = p.digestEnabled === true;
  if ("weeklyEmailEnabled" in p) next.weeklyEmailEnabled = p.weeklyEmailEnabled === true;
  if ("sendHour" in p) {
    const hour = Math.floor(Number(p.sendHour));
    if (!Number.isFinite(hour) || hour < 0 || hour > 23) {
      throw prefsError("The send time must be an hour between 0 and 23.");
    }
    next.sendHour = hour;
  }
  if ("timezone" in p) {
    if (!validTimezone(p.timezone)) {
      throw prefsError("That timezone is not one the system recognises.");
    }
    next.timezone = String(p.timezone);
  }
  if ("quietStart" in p || "quietEnd" in p) {
    const start = Math.floor(Number("quietStart" in p ? p.quietStart : current.quietStart));
    const end = Math.floor(Number("quietEnd" in p ? p.quietEnd : current.quietEnd));
    for (const value of [start, end]) {
      if (!Number.isFinite(value) || value < 0 || value > 23) {
        throw prefsError("Quiet hours must be whole hours between 0 and 23.");
      }
    }
    next.quietStart = start;
    next.quietEnd = end;
  }
  if (p.types && typeof p.types === "object") {
    for (const kind of NOTIFICATION_KINDS) {
      if (typeof p.types[kind] === "boolean") next.types[kind] = p.types[kind];
    }
  }

  await ensureAuthSchema();
  await db.update(users).set({ notifyPrefs: next }).where(eq(users.id, user.id));
  return next;
}

/** The master email switch (Settings) and the unsubscribe endpoint share it. */
export async function setEmailUnsubscribed(userId: number, unsubscribed: boolean): Promise<void> {
  await ensureAuthSchema();
  await db.update(users).set({ emailUnsubscribed: unsubscribed }).where(eq(users.id, userId));
}

function prefsError(message: string): Error & { status: number; code: string } {
  return Object.assign(new Error(message), { status: 400, code: "INVALID_PREFS", name: "PrefsError" });
}

/* ── row writes ────────────────────────────────────────────────────── */

type Candidate =
  | {
      kind: NotificationKind;
      title: string;
      body: string;
      href: string;
      dedupKey: string;
    };

/**
 * Insert the row if (user, dedupKey) is new. The unique index settles
 * races between the bell's poll and the cron's sweep; a lost race is a
 * no-op, which is exactly the dedup promise.
 */
async function insertUnique(userId: number, candidate: Candidate): Promise<boolean> {
  const rows = await db
    .insert(notifications)
    .values({
      userId,
      kind: candidate.kind,
      title: candidate.title.slice(0, 140),
      body: candidate.body.slice(0, 500),
      href: candidate.href,
      dedupKey: candidate.dedupKey.slice(0, 80),
    })
    .onConflictDoNothing({ target: [notifications.userId, notifications.dedupKey] })
    .returning({ id: notifications.id });
  return rows.length === 1;
}

/** Plain rows shaped like the client's TaskRow (recovery/prioritization input). */
type TaskLike = typeof tasks.$inferSelect;

/**
 * Look at the plan and raise whatever deserves a row right now.
 * Bounded work (two narrow task/session windows), safe to run on every
 * bell poll - everything inserts at most once thanks to the dedup key.
 */
export async function generateForUser(user: User, nowUtc: Date = new Date()): Promise<void> {
  await ensureAuthSchema();
  const prefs = prefsFor(user);
  const local = localTimeAt(nowUtc, prefs.timezone);
  const today = local.dateStr;

  const [settingsRows, taskRows, subjectRows, recentSessions, todaysSessions] = await Promise.all([
    db.select().from(settings).where(eq(settings.userId, user.id)).limit(1),
    db
      .select()
      .from(tasks)
      .where(and(eq(tasks.userId, user.id), gte(tasks.date, addDays(today, -14))))
      .limit(400),
    db.select({ id: subjects.id, name: subjects.name }).from(subjects).where(eq(subjects.userId, user.id)),
    db
      .select()
      .from(sessions)
      .where(and(eq(sessions.userId, user.id), gte(sessions.createdAt, new Date(nowUtc.getTime() - 90 * 60 * 1000))))
      .orderBy(desc(sessions.createdAt))
      .limit(30),
    db.select().from(sessions).where(and(eq(sessions.userId, user.id), gte(sessions.date, addDays(today, -7)))),
  ]);
  const st = settingsRows[0];
  if (!st) return;
  const all: TaskLike[] = taskRows;
  const candidates: Candidate[] = [];
  const subjectName = (subjectId: number | null) =>
    subjectRows.find((subject) => subject.id === subjectId)?.name || "";

  // 1. The morning "today's plan is ready".
  const todaysPending = all.filter((task) => task.date === today && task.status === "pending");
  if (prefs.types.plan_ready && local.hour >= 6 && todaysPending.length > 0) {
    const minutes = todaysPending.reduce((sum, task) => sum + task.plannedMinutes, 0);
    candidates.push({
      kind: "plan_ready",
      title: "Today's plan is ready",
      body: `${todaysPending.length} lesson${todaysPending.length === 1 ? "" : "s"}, about ${Math.round(minutes)} minutes in total.`,
      href: "dashboard",
      dedupKey: `plan:${today}`,
    });
  }

  // 2. Overdue work - once a day, with the recovery door.
  const backlog = backlogFor(all as never, today);
  if (prefs.types.overdue && backlog.count > 0) {
    candidates.push({
      kind: "overdue",
      title: `${backlog.count} task${backlog.count === 1 ? "" : "s"} overdue`,
      body: `${Math.round(backlog.minutes)} minutes of unfinished work. Spread it across the week or re-plan it here.`,
      href: "dashboard",
      dedupKey: `overdue:${today}`,
    });
  }

  // 3. Streak at risk: evening, streak alive, nothing logged today.
  if (prefs.types.streak_risk && user.streak > 0 && local.hour >= 20) {
    const loggedToday = todaysSessions.some((session) => session.date === today && session.minutes > 0);
    if (!loggedToday) {
      candidates.push({
        kind: "streak_risk",
        title: `Your ${user.streak}-day streak is at risk`,
        body: "Nothing is logged today. Even ten minutes keeps it alive.",
        href: "focus",
        dedupKey: `streak:${today}`,
      });
    }
  }

  // 4. Exam countdown milestones - once per milestone, ever.
  if (prefs.types.exam_milestone && st.examDate) {
    const daysLeft = diffDays(today, st.examDate);
    const milestone = examMilestoneFor(daysLeft);
    if (milestone != null) {
      candidates.push({
        kind: "exam_milestone",
        title: `${milestone} day${milestone === 1 ? "" : "s"} to your exam`,
        body:
          milestone === 1
            ? "Tomorrow is the day. Trust what you have already revised and get some sleep."
            : `${milestone} days left. Small, repeatable days are the whole strategy now.`,
        href: "planner",
        dedupKey: `exam:${milestone}`,
      });
    }
  }

  // 5. Session summary: every fresh clock-out row, with what comes next.
  if (prefs.types.session_summary) {
    for (const session of recentSessions) {
      if (!session.minutes || session.minutes < 0.5) continue;
      const key = session.eventId
        ? `session:${session.eventId.slice(0, 40)}`
        : `session-row:${session.id}`;
      const next = nextAction(all as never, today);
      const title = `${Math.round(session.minutes)} minute${Math.round(session.minutes) === 1 ? "" : "s"} logged`;
      const taskTitle = session.taskId
        ? all.find((task) => task.id === session.taskId)?.title
        : subjectName(session.subjectId);
      const body = next.now
        ? `${taskTitle ? `Nice work on ${taskTitle}. ` : ""}Next up: ${next.now.title}.`
        : `${taskTitle ? `Nice work on ${taskTitle}.` : "Session logged."} Nothing else due right now.`;
      candidates.push({ kind: "session_summary", title, body: body.slice(0, 480), href: "focus", dedupKey: key });
    }
  }

  // 6. Weekly wrap: Sunday evening, once per ISO week.
  if (prefs.types.weekly_summary && local.day === 0 && local.hour >= WEEKLY_SUMMARY_HOUR) {
    const weekStart = addDays(today, -6);
    const weekSessions = todaysSessions.filter((session) => session.date >= weekStart && session.date <= today);
    const minutes = weekSessions.reduce((sum, session) => sum + session.minutes, 0);
    candidates.push({
      kind: "weekly_summary",
      title: "Your week in review",
      body: `${Math.round(minutes)} minutes logged this week over ${new Set(weekSessions.map((s) => s.date)).size} study day${new Set(weekSessions.map((s) => s.date)).size === 1 ? "" : "s"}.`,
      href: "analytics",
      dedupKey: `week:${isoWeekLabel(today)}`,
    });
  }

  for (const candidate of candidates) {
    try {
      await insertUnique(user.id, candidate);
    } catch (error) {
      // One bad candidate must never cost the others - or the bell its answer.
      console.warn("notification insert skipped:", error instanceof Error ? error.message : error);
    }
  }
  // Bound the table: anything older than 90 days has served its purpose.
  try {
    await db
      .delete(notifications)
      .where(and(eq(notifications.userId, user.id), drizzleSql`${notifications.createdAt} < now() - interval '90 days'`));
  } catch {
    /* housekeeping only */
  }
}

/* ── reads ─────────────────────────────────────────────────────────── */

export type NotificationSnapshot = {
  items: PublicNotification[];
  unread: number;
  quietNow: boolean;
  prefs: {
    quietStart: number;
    quietEnd: number;
    timezone: string;
    types: Record<NotificationKind, boolean>;
  };
};

/** What the bell shows: the newest rows plus the count badge. */
export async function notificationSnapshot(user: User, nowUtc: Date = new Date()): Promise<NotificationSnapshot> {
  await ensureAuthSchema();
  const prefs = prefsFor(user);
  const local = localTimeAt(nowUtc, prefs.timezone);
  const rows = await db
    .select()
    .from(notifications)
    .where(eq(notifications.userId, user.id))
    .orderBy(desc(notifications.createdAt), desc(notifications.id))
    .limit(40);
  const items: PublicNotification[] = rows.map((row) => ({
    id: row.id,
    kind: row.kind as NotificationKind,
    title: row.title,
    body: row.body,
    href: row.href,
    read: !!row.readAt,
    createdAt: row.createdAt.toISOString(),
  }));
  return {
    items,
    unread: items.filter((item) => !item.read).length,
    quietNow: inQuietHours(local.hour, prefs.quietStart, prefs.quietEnd),
    prefs: {
      quietStart: prefs.quietStart,
      quietEnd: prefs.quietEnd,
      timezone: prefs.timezone,
      types: prefs.types,
    },
  };
}

/** Mark one row (or every row) read. Only the owner's rows match. */
export async function markNotificationsRead(user: User, id?: number): Promise<number> {
  await ensureAuthSchema();
  const where =
    typeof id === "number"
      ? and(eq(notifications.userId, user.id), eq(notifications.id, id), isNull(notifications.readAt))
      : and(eq(notifications.userId, user.id), isNull(notifications.readAt));
  const rows = await db.update(notifications).set({ readAt: new Date() }).where(where).returning({ id: notifications.id });
  return rows.length;
}
