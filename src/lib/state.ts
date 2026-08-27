import { db } from "@/db";
import { users, settings, subjects, topics, tasks, sessions, messages } from "@/db/schema";
import { and, eq, desc, asc, sql } from "drizzle-orm";
import { createHash } from "node:crypto";
import { addDays, diffDays, todayStr } from "./planner";
import type { TutorContext } from "./ai";
import { advancedTopicMetadata } from "./curriculum";
import { dateDistanceDays, isIsoDate } from "./validation";
import { fsrsInit, fsrsReview, masteryDelta, type ReviewRating } from "./ml";

/** Transaction handle type as produced by `db.transaction(cb)`. */
export type DbTx = Parameters<Parameters<typeof db.transaction>[0]>[0];

const USER_KEY_RE = /^u_[A-Za-z0-9_-]{12,120}$/;

export function keyFrom(req: Request): string {
  const supplied = req.headers.get("x-user-key")?.trim() || "";
  if (USER_KEY_RE.test(supplied)) return supplied;

  // Never put every header-less request into one shared "anon-default"
  // account. A bounded one-way fingerprint provides isolation for legacy or
  // non-browser clients without storing raw IP/User-Agent data.
  const forwarded = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  const agent = req.headers.get("user-agent")?.slice(0, 300) || "unknown";
  const seed = `${supplied}\0${forwarded}\0${agent}`;
  return `u_fallback_${createHash("sha256").update(seed).digest("hex").slice(0, 32)}`;
}

export function dateFrom(req: Request): string {
  const serverDate = todayStr();
  const supplied = req.headers.get("x-local-date");
  return isIsoDate(supplied) && Math.abs(dateDistanceDays(serverDate, supplied)) <= 2
    ? supplied
    : serverDate;
}

export async function getOrCreateUser(userKey: string) {
  const found = await db.select().from(users).where(eq(users.userKey, userKey)).limit(1);
  if (found.length) return found[0];

  // Two API calls can be the first request from a new browser. The unique
  // user_key constraint plus ON CONFLICT makes that race harmless.
  const inserted = await db
    .insert(users)
    .values({ userKey })
    .onConflictDoNothing({ target: users.userKey })
    .returning();
  const user = inserted[0] || (await db.select().from(users).where(eq(users.userKey, userKey)).limit(1))[0];
  if (!user) throw new Error("Could not initialise learner account.");
  await db
    .insert(settings)
    .values({ userId: user.id, startDate: todayStr(), examDate: addDays(todayStr(), 90) })
    .onConflictDoNothing({ target: settings.userId });
  return user;
}

export async function getSettings(userId: number) {
  const rows = await db.select().from(settings).where(eq(settings.userId, userId)).limit(1);
  if (rows.length) return rows[0];
  const inserted = await db
    .insert(settings)
    .values({ userId, startDate: todayStr(), examDate: addDays(todayStr(), 90) })
    .onConflictDoNothing({ target: settings.userId })
    .returning();
  const row = inserted[0] || (await db.select().from(settings).where(eq(settings.userId, userId)).limit(1))[0];
  if (!row) throw new Error("Could not initialise learner settings.");
  return row;
}

async function latestMessages(userId: number, limit = 120) {
  const newestFirst = await db
    .select()
    .from(messages)
    .where(eq(messages.userId, userId))
    .orderBy(desc(messages.id))
    .limit(limit);
  return newestFirst.reverse();
}

export async function loadState(userId: number) {
  const [st, subs, tps, tsk, ses, msgs] = await Promise.all([
    getSettings(userId),
    db.select().from(subjects).where(eq(subjects.userId, userId)).orderBy(asc(subjects.position)),
    db.select().from(topics).where(eq(topics.userId, userId)).orderBy(asc(topics.position)),
    db.select().from(tasks).where(eq(tasks.userId, userId)).orderBy(asc(tasks.date), asc(tasks.position)),
    db.select().from(sessions).where(eq(sessions.userId, userId)).orderBy(desc(sessions.createdAt)).limit(400),
    latestMessages(userId, 120),
  ]);
  return { settings: st, subjects: subs, topics: tps, tasks: tsk, sessions: ses, messages: msgs };
}

export function defaultFallbackState(userKey: string) {
  const today = todayStr();
  // Shape must match the AppState the client renders. A mismatched fallback
  // (missing pomodoro / studyDays / course) used to crash Settings and wipe
  // the chat after a successful tutor reply.
  return {
    user: {
      id: 0,
      userKey,
      name: "Learner",
      level: "ug",
      course: "custom",
      courseName: "General Curriculum",
      year: "1",
      onboarded: true,
      streak: 1,
      lastStudyDate: null,
      createdAt: new Date(),
    },
    settings: {
      id: 0,
      userId: 0,
      startDate: today,
      examDate: addDays(today, 90),
      dailyHours: 3,
      subjectsPerDay: 2,
      studyDays: "all",
      bufferDays: 5,
      planMode: "syllabus",
      studyStyle: "balanced",
      weakSubject: "none",
      revisionWeeks: 1,
      theme: "default",
      pomodoro: 25,
      shortBreak: 5,
      longBreak: 15,
      confetti: true,
      sounds: true,
    },
    subjects: [],
    topics: [],
    tasks: [],
    sessions: [],
    messages: [],
  };
}

export async function fullState(userKey: string) {
  try {
    const user = await getOrCreateUser(userKey);
    const rest = await loadState(user.id);

    // Existing plans created before advanced curriculum metadata was added get
    // a deterministic, non-destructive response upgrade immediately. New plans
    // persist these fields in PostgreSQL; old titles/mastery/timing stay intact.
    const subjectById = new Map(rest.subjects.map((subject) => [subject.id, subject]));
    const topicLists = new Map<number, typeof rest.topics>();
    for (const topic of rest.topics) {
      const list = topicLists.get(topic.subjectId) || [];
      list.push(topic);
      topicLists.set(topic.subjectId, list);
    }
    for (const list of topicLists.values()) list.sort((a, b) => a.position - b.position);

    const enrichedTopics = rest.topics.map((topic) => {
      const hasAdvancedData = !!(
        topic.keyConcepts?.length && topic.prerequisites?.length
        && topic.practice && topic.sources?.length
      );
      if (hasAdvancedData) return topic;
      const subject = subjectById.get(topic.subjectId);
      if (!subject) return topic;
      const list = topicLists.get(topic.subjectId) || [topic];
      const index = Math.max(0, list.findIndex((item) => item.id === topic.id));
      const metadata = advancedTopicMetadata({
        title: topic.title,
        subjectName: subject.name,
        index,
        total: list.length,
        difficulty: subject.difficulty,
        level: user.level,
        courseName: user.courseName,
        previousTitle: list[index - 1]?.title,
      });
      return {
        ...topic,
        summary: topic.summary || metadata.summary,
        objectives: topic.objectives?.length ? topic.objectives : metadata.objectives,
        prerequisites: topic.prerequisites?.length ? topic.prerequisites : metadata.prerequisites,
        keyConcepts: topic.keyConcepts?.length ? topic.keyConcepts : metadata.keyConcepts,
        practice: topic.practice || metadata.practice,
        depth: metadata.depth,
        sources: topic.sources?.length ? topic.sources : metadata.sources,
      };
    });

    return { user, ...rest, topics: enrichedTopics };
  } catch (error) {
    console.warn("DB unavailable during fullState; using fallback state:", error instanceof Error ? error.message : error);
    return defaultFallbackState(userKey);
  }
}

type St = Awaited<ReturnType<typeof fullState>>;

export function buildContext(s: St, today = todayStr()): TutorContext {
  const doneTopicIds = new Set(
    s.tasks.filter((t) => t.kind === "learn" && t.status === "done" && t.topicId).map((t) => t.topicId)
  );
  const subs = s.subjects.map((sub) => {
    const list = s.topics.filter((t) => t.subjectId === sub.id);
    return {
      id: sub.id,
      name: sub.name,
      difficulty: sub.difficulty,
      done: list.filter((t) => doneTopicIds.has(t.id) || t.status === "done").length,
      total: list.length,
    };
  });
  const totalTopics = s.topics.length || 1;
  const doneCount = subs.reduce((a, x) => a + x.done, 0);
  const weekAgo = addDays(today, -7);
  const hoursRaw = s.sessions
    .filter((x) => diffDays(weekAgo, x.date) >= 0 && diffDays(x.date, today) >= 0)
    .reduce((a, x) => a + x.minutes, 0) / 60;
  const hoursThisWeek = Math.round(hoursRaw * 100) / 100;
  return {
    name: s.user.name,
    courseName: s.user.courseName,
    level: s.user.level,
    examDate: s.settings.examDate,
    daysLeft: Math.max(0, diffDays(today, s.settings.examDate)),
    dailyHours: s.settings.dailyHours,
    subjects: subs,
    today: s.tasks
      .filter((t) => t.date === today)
      .map((t) => ({ title: t.title, kind: t.kind, minutes: t.plannedMinutes, status: t.status })),
    progressPct: Math.round((doneCount / totalTopics) * 100),
    streak: s.user.streak,
    hoursThisWeek,
    overdue: s.tasks.filter((t) => t.status === "pending" && diffDays(t.date, today) > 0).length,
  };
}

/**
 * Recompute the study streak. Aggregated in SQL (one row per day, via
 * db.execute — no result-mapper involved) and windowed to the last
 * ~2.7 years, so the every-minute clock flush stays cheap no matter how
 * large the user's session history grows.
 */
export async function recomputeStreak(userId: number, asOf = todayStr()) {
  const cutoff = addDays(asOf, -1000);
  const res = await db.execute(sql`
    select date, sum(minutes)::float as m
    from sessions
    where user_id = ${userId} and date >= ${cutoff}
    group by date
  `);
  const rows = res.rows as { date: string; m: number }[];
  // A visible clock-in should count. One real minute is enough to update
  // streak/consistency; shorter accidental taps are ignored by the API.
  const days = new Set(rows.filter((r) => Number(r.m) >= 1).map((r) => r.date));
  let streak = 0;
  let cursor = asOf;
  if (!days.has(cursor)) cursor = addDays(cursor, -1);
  while (days.has(cursor) && streak < 999) {
    streak++;
    cursor = addDays(cursor, -1);
  }
  const lastStudyDate = [...days].sort().at(-1) || null;
  await db.update(users).set({ streak, lastStudyDate }).where(eq(users.id, userId));
  return streak;
}

/**
 * Shared "task became done" bookkeeping: apply the mastery gain (and, when a
 * memory rating is supplied, the FSRS-lite stability update) to the task's
 * linked topic. Used both by the manual Done flow (PATCH /api/tasks) and by
 * the study clock's time-based auto-completion (POST /api/sessions), so the
 * two paths never drift apart.
 */
export async function applyCompletionMastery(
  tx: DbTx,
  updated: { id: number; userId: number; topicId: number | null; kind: string },
  today: string,
  rating: ReviewRating | 0 = 0
): Promise<void> {
  if (!updated.topicId) return;
  const topic = (await tx
    .select()
    .from(topics)
    .where(and(eq(topics.id, updated.topicId), eq(topics.userId, updated.userId)))
    .limit(1))[0];
  if (!topic) return;

  const gain = updated.kind === "learn" ? 55 : 20;
  const topicPatch: Record<string, unknown> = {
    mastery: Math.min(100, topic.mastery + gain),
    status: updated.kind === "learn" ? "done" : topic.status,
  };
  if (rating) {
    const elapsed = topic.lastReview
      ? Math.max(0, Math.round((Date.parse(today) - Date.parse(topic.lastReview)) / 86_400_000))
      : 0;
    const next = topic.stability > 0
      ? fsrsReview(topic.stability, topic.difficulty, elapsed, rating)
      : { stability: fsrsInit(rating, topic.difficulty), intervalDays: 0 };
    topicPatch.stability = next.stability;
    topicPatch.lastReview = today;
    topicPatch.mastery = rating === 1
      ? Math.max(0, topic.mastery + masteryDelta(rating))
      : Math.min(100, topic.mastery + gain + masteryDelta(rating));
  }
  await tx
    .update(topics)
    .set(topicPatch)
    .where(and(eq(topics.id, topic.id), eq(topics.userId, topic.userId)));
}

export async function clearPlan(userId: number) {
  await db.delete(tasks).where(eq(tasks.userId, userId));
}

export async function markTopicsDoneFromTasks(userId: number) {
  const rows = await db
    .select()
    .from(tasks)
    .where(and(eq(tasks.userId, userId), eq(tasks.status, "done")));
  const ids = rows.filter((r) => r.kind === "learn" && r.topicId).map((r) => r.topicId as number);
  for (const id of ids) {
    await db.update(topics).set({ status: "done" }).where(and(eq(topics.id, id), eq(topics.userId, userId)));
  }
}
