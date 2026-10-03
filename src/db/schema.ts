import { sql } from "drizzle-orm";
import {
  pgTable,
  serial,
  text,
  integer,
  timestamp,
  boolean,
  jsonb,
  real,
  index,
  uniqueIndex,
} from "drizzle-orm/pg-core";

/**
 * A learner. `userKey` is the internal handle every other table joins on;
 * `username` + `passwordHash` are the credentials the learner actually signs
 * in with, on any number of devices.
 *
 * Both credential columns are NULLABLE on purpose: rows created before
 * accounts existed (one per browser) keep working untouched, and the first
 * time such a device signs up it ADOPTS its own row - the laptop's plan
 * becomes the new account's plan instead of being orphaned.
 *
 * `username` always stores the lower-cased, comparable form (so `Sanjay`
 * and `sanjay` are one account) while `usernameDisplay` keeps the casing
 * the learner typed, which is what the app greets them with.
 */
export const users = pgTable(
  "users",
  {
    id: serial("id").primaryKey(),
    userKey: text("user_key").notNull().unique(),
    username: text("username"),
    usernameDisplay: text("username_display"),
    passwordHash: text("password_hash"),
    passwordUpdatedAt: timestamp("password_updated_at"),
    lastLoginAt: timestamp("last_login_at"),
    failedLogins: integer("failed_logins").notNull().default(0),
    lockedUntil: timestamp("locked_until"),
    /** The account email, lower-cased on write (EMAIL RULES, src/lib/emailRules.ts).
     *  NULL until the learner adds one - pre-email accounts keep working with
     *  zero friction, they just receive no mail. */
    email: text("email"),
    /** When the CURRENT address was proven. Any mail about the plan goes out
     *  only while this is set; changing the address clears it. */
    emailVerifiedAt: timestamp("email_verified_at"),
    /** The stable subject id Google returned for this person's account.
     *  Presence is what makes "Continue with Google" a sign-in, not a sign-up. */
    googleSub: text("google_sub"),
    /** True after the one-click unsubscribe link is used (or the Settings
     *  master switch). No email of any kind is sent while it is set. */
    emailUnsubscribed: boolean("email_unsubscribed").notNull().default(false),
    /** Notification preferences (digest schedule, timezone, quiet hours,
     *  per-type toggles). Defaults live in src/lib/notifications.ts and are
     *  merged onto whatever is stored, so old rows keep their meaning as new
     *  options appear. */
    notifyPrefs: jsonb("notify_prefs").$type<Record<string, unknown>>(),
    name: text("name").notNull().default("Learner"),
    level: text("level").notNull().default("ug"),
    course: text("course").notNull().default("custom"),
    courseName: text("course_name").notNull().default("Custom Course"),
    year: text("year").notNull().default("1"),
    onboarded: boolean("onboarded").notNull().default(false),
    streak: integer("streak").notNull().default(0),
    lastStudyDate: text("last_study_date"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("users_username_unique").on(t.username),
    // One address, one account. NULLs (accounts without mail yet) do not
    // take part in uniqueness, so the index stays cheap and correct.
    uniqueIndex("users_email_unique").on(t.email).where(sql`${t.email} is not null`),
    uniqueIndex("users_google_sub_unique").on(t.googleSub).where(sql`${t.googleSub} is not null`),
  ]
);

/**
 * One live verification link per email change. The browser only ever sees
 * the raw 256-bit token in the email itself; the database stores its
 * SHA-256, so a table dump cannot be used to "verify" someone else's
 * address. A row is deleted the moment it is spent, so a used link is dead
 * forever, and a new request replaces the old one.
 */
export const authEmailTokens = pgTable(
  "auth_email_tokens",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id").notNull(),
    /** The address this token proves. Verification writes THIS value back to
     *  users.email, so a click always confirms the address it was mailed to. */
    email: text("email").notNull(),
    tokenHash: text("token_hash").notNull(),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    expiresAt: timestamp("expires_at").notNull(),
  },
  (t) => [
    uniqueIndex("auth_email_tokens_token_hash_unique").on(t.tokenHash),
    index("auth_email_tokens_user_id_idx").on(t.userId),
  ]
);

/**
 * An in-app notification: one row per event, stored against the account so
 * the bell shows the SAME list on the phone and the laptop. `dedupKey`
 * (e.g. "overdue:2026-10-03") is what makes "one plan-ready notice per
 * morning" a database fact rather than a polite intention.
 */
export const notifications = pgTable(
  "notifications",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id").notNull(),
    kind: text("kind").notNull(),
    title: text("title").notNull(),
    body: text("body").notNull().default(""),
    /** The page the notification is about ("dashboard", "planner", ...), so
     *  tapping it lands the learner exactly where the problem lives. */
    href: text("href").notNull().default("dashboard"),
    readAt: timestamp("read_at"),
    dedupKey: text("dedup_key").notNull(),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("notifications_user_dedup_unique").on(t.userId, t.dedupKey),
    index("notifications_user_id_idx").on(t.userId, t.createdAt),
  ]
);

/**
 * The email idempotency ledger: (user, kind, local-date) is unique, so a
 * retried cron run, a double GitHub Actions trigger or a Vercel + GitHub
 * overlap can never produce the same digest twice in one day.
 */
export const notificationsSent = pgTable(
  "notifications_sent",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id").notNull(),
    kind: text("kind").notNull(),
    /** The date IN THE LEARNER'S TIMEZONE the email belongs to, not the
     *  send timestamp - two servers in different zones must still agree on
     *  whether "Monday's digest" went out. */
    date: text("date").notNull(),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => [uniqueIndex("notifications_sent_user_kind_date_unique").on(t.userId, t.kind, t.date)]
);

/**
 * One row per signed-in device. The browser only ever holds the raw token
 * (in an HttpOnly cookie it cannot read); the database stores its SHA-256,
 * so a leaked database dump cannot be replayed as a login.
 *
 * Because the row - not the browser - is the session, "sign out of all other
 * devices" is a single DELETE, and a stolen phone can be cut off from the
 * laptop in two taps.
 */
export const authSessions = pgTable(
  "auth_sessions",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id").notNull(),
    tokenHash: text("token_hash").notNull(),
    device: text("device").notNull().default("Unknown device"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    lastSeenAt: timestamp("last_seen_at").notNull().defaultNow(),
    expiresAt: timestamp("expires_at").notNull(),
  },
  (t) => [
    uniqueIndex("auth_sessions_token_hash_unique").on(t.tokenHash),
    index("auth_sessions_user_id_idx").on(t.userId),
    index("auth_sessions_expires_at_idx").on(t.expiresAt),
  ]
);

export const settings = pgTable(
  "settings",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id").notNull(),
  startDate: text("start_date").notNull(),
  examDate: text("exam_date").notNull(),
  dailyHours: real("daily_hours").notNull().default(2),
  subjectsPerDay: integer("subjects_per_day").notNull().default(2),
  studyDays: text("study_days").notNull().default("all"),
  bufferDays: integer("buffer_days").notNull().default(5),
  planMode: text("plan_mode").notNull().default("syllabus"),
  studyStyle: text("study_style").notNull().default("balanced"),
  weakSubject: text("weak_subject").notNull().default("none"),
  revisionWeeks: integer("revision_weeks").notNull().default(1),
  theme: text("theme").notNull().default("default"),
  pomodoro: integer("pomodoro").notNull().default(25),
  shortBreak: integer("short_break").notNull().default(5),
  longBreak: integer("long_break").notNull().default(15),
  confetti: boolean("confetti").notNull().default(true),
    sounds: boolean("sounds").notNull().default(true),
  },
  (t) => [uniqueIndex("settings_user_id_unique").on(t.userId)]
);

export const subjects = pgTable(
  "subjects",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id").notNull(),
    name: text("name").notNull(),
    color: text("color").notNull().default("#6366f1"),
    difficulty: text("difficulty").notNull().default("Medium"),
    units: integer("units").notNull().default(6),
    weight: real("weight").notNull().default(1),
    position: integer("position").notNull().default(0),
  },
  (t) => [index("subjects_user_id_idx").on(t.userId)]
);

export const topics = pgTable(
  "topics",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id").notNull(),
    subjectId: integer("subject_id").notNull(),
  unit: text("unit").notNull().default("Unit 1"),
  title: text("title").notNull(),
  summary: text("summary").notNull().default(""),
  objectives: jsonb("objectives").$type<string[]>().notNull().default([]),
  prerequisites: jsonb("prerequisites").$type<string[]>().notNull().default([]),
  keyConcepts: jsonb("key_concepts").$type<string[]>().notNull().default([]),
  practice: text("practice").notNull().default(""),
  depth: text("depth").notNull().default("Core"),
  sources: jsonb("source_details").$type<Array<{
    title: string;
    publisher: string;
    type: "Official syllabus" | "Primary text" | "Reference";
    url?: string;
    note?: string;
    section?: string;
  }>>().notNull().default([]),
  difficulty: text("difficulty").notNull().default("Medium"),
  estMinutes: integer("est_minutes").notNull().default(45),
  position: integer("position").notNull().default(0),
  mastery: integer("mastery").notNull().default(0),
  status: text("status").notNull().default("pending"),
  // FSRS-lite spaced-repetition state
    stability: real("stability").notNull().default(0),
    lastReview: text("last_review").notNull().default(""),
  },
  (t) => [
    index("topics_user_id_idx").on(t.userId),
    index("topics_subject_id_idx").on(t.subjectId),
    // State loader orders a subject's topics by position - this composite
    // serves the filter AND the sort from one index.
    index("topics_subject_pos_idx").on(t.subjectId, t.position),
  ]
);

export const tasks = pgTable(
  "tasks",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id").notNull(),
    date: text("date").notNull(),
  subjectId: integer("subject_id"),
  topicId: integer("topic_id"),
  kind: text("kind").notNull().default("learn"),
  title: text("title").notNull(),
  detail: text("detail").notNull().default(""),
  plannedMinutes: integer("planned_minutes").notNull().default(45),
  actualMinutes: integer("actual_minutes").notNull().default(0),
    status: text("status").notNull().default("pending"),
    position: integer("position").notNull().default(0),
  },
  (t) => [
    index("tasks_user_id_idx").on(t.userId),
    index("tasks_date_idx").on(t.date),
    index("tasks_subject_id_idx").on(t.subjectId),
    index("tasks_topic_id_idx").on(t.topicId),
    index("tasks_user_date_idx").on(t.userId, t.date),
    // The planner's default listing is "my tasks by date then position" -
    // one composite index covers it end to end.
    index("tasks_user_date_pos_idx").on(t.userId, t.date, t.position),
  ]
);

export const sessions = pgTable(
  "sessions",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id").notNull(),
    subjectId: integer("subject_id"),
    taskId: integer("task_id"),
    date: text("date").notNull(),
    minutes: real("minutes").notNull().default(0),
    mode: text("mode").notNull().default("focus"),
    eventId: text("event_id"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => [
    index("sessions_user_id_idx").on(t.userId),
    index("sessions_date_idx").on(t.date),
    index("sessions_task_id_idx").on(t.taskId),
    index("sessions_user_created_idx").on(t.userId, t.createdAt),
    index("sessions_user_date_idx").on(t.userId, t.date),
    uniqueIndex("sessions_user_event_unique").on(t.userId, t.eventId),
  ]
);

/**
 * Coverage telemetry: every course-suggestion query is logged with the
 * resolution source, so we know exactly which courses users search for
 * that only get generic/LLM fallbacks - a ranked to-do list for adding
 * verified catalog entries where they matter most.
 */
export const courseQueries = pgTable("course_queries", {
  id: serial("id").primaryKey(),
  query: text("query").notNull(),
  level: text("level").notNull().default(""),
  source: text("source").notNull().default("unknown"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const messages = pgTable(
  "messages",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id").notNull(),
    role: text("role").notNull(),
    content: text("content").notNull(),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => [
    index("messages_user_id_idx").on(t.userId),
    // Chat history is fetched ordered by id per user - composite keeps the
    // hot path index-only as histories grow.
    index("messages_user_id_id_idx").on(t.userId, t.id),
  ]
);

/**
 * SHIGUN credit meter - per learner, per day. One "credit" is one tutor
 * question answered (a `full` or `finalise` chat turn). The period rolls over
 * automatically each day; Settings shows the used/limit bar and offers a
 * manual reset that refills the counter and clears provider cooldowns, so a
 * learner who burns through a day's allowance is never locked out for good.
 */
export const shigunUsage = pgTable(
  "shigun_usage",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id").notNull(),
    periodStart: text("period_start").notNull(),
    used: integer("used").notNull().default(0),
    limit: integer("limit").notNull().default(100),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (t) => [uniqueIndex("shigun_usage_user_id_unique").on(t.userId)]
);

export type User = typeof users.$inferSelect;
export type AuthSession = typeof authSessions.$inferSelect;
export type AuthEmailToken = typeof authEmailTokens.$inferSelect;
export type AppNotification = typeof notifications.$inferSelect;
export type NotificationSent = typeof notificationsSent.$inferSelect;
export type Settings = typeof settings.$inferSelect;
export type Subject = typeof subjects.$inferSelect;
export type Topic = typeof topics.$inferSelect;
export type Task = typeof tasks.$inferSelect;
export type StudySession = typeof sessions.$inferSelect;
export type Message = typeof messages.$inferSelect;
export type ShigunUsage = typeof shigunUsage.$inferSelect;
