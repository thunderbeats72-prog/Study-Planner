import { db } from "@/db";
import { users, settings, subjects, topics, tasks, sessions, messages } from "@/db/schema";
import { and, eq, desc, asc, sql } from "drizzle-orm";
import { createHash } from "node:crypto";
import { addDays, diffDays, todayStr } from "./planner";
import type { TutorContext } from "./ai";
import { advancedTopicMetadata } from "./curriculum";
import { dateDistanceDays, isIsoDate } from "./validation";

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
  return {
    user: {
      id: 0,
      userKey,
      name: "Learner",
      courseName: "General Curriculum",
      level: "Intermediate",
      streak: 1,
      onboarded: true,
      createdAt: new Date().toISOString(),
    },
    settings: {
      id: 0,
      userId: 0,
      startDate: today,
      examDate: addDays(today, 90),
      dailyHours: 3,
      enabledDays: [true, true, true, true, true, false, false],
      preferredTime: "morning" as const,
      revisionMode: "spaced" as const,
      theme: "silver-lavender",
      aiProvider: "local",
      aiApiKey: null,
      customModel: null,
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
