import { db } from "@/db";
import { users, settings, subjects, topics, tasks, sessions, messages } from "@/db/schema";
import { and, eq, desc, asc, sql } from "drizzle-orm";
import { addDays, diffDays, todayStr } from "./planner";
import type { TutorContext } from "./ai";
import { advancedTopicMetadata } from "./curriculum";

export function keyFrom(req: Request): string {
  const h = req.headers.get("x-user-key");
  return (h && h.trim()) || "anon-default";
}

export async function getOrCreateUser(userKey: string) {
  const found = await db.select().from(users).where(eq(users.userKey, userKey)).limit(1);
  if (found.length) return found[0];
  const inserted = await db.insert(users).values({ userKey }).returning();
  const u = inserted[0];
  await db.insert(settings).values({
    userId: u.id,
    startDate: todayStr(),
    examDate: addDays(todayStr(), 90),
  });
  return u;
}

export async function getSettings(userId: number) {
  const rows = await db.select().from(settings).where(eq(settings.userId, userId)).limit(1);
  if (rows.length) return rows[0];
  const ins = await db
    .insert(settings)
    .values({ userId, startDate: todayStr(), examDate: addDays(todayStr(), 90) })
    .returning();
  return ins[0];
}

export async function loadState(userId: number) {
  const [st, subs, tps, tsk, ses, msgs] = await Promise.all([
    getSettings(userId),
    db.select().from(subjects).where(eq(subjects.userId, userId)).orderBy(asc(subjects.position)),
    db.select().from(topics).where(eq(topics.userId, userId)).orderBy(asc(topics.position)),
    db.select().from(tasks).where(eq(tasks.userId, userId)).orderBy(asc(tasks.date), asc(tasks.position)),
    db.select().from(sessions).where(eq(sessions.userId, userId)).orderBy(desc(sessions.createdAt)).limit(400),
    db.select().from(messages).where(eq(messages.userId, userId)).orderBy(asc(messages.id)).limit(120),
  ]);
  return { settings: st, subjects: subs, topics: tps, tasks: tsk, sessions: ses, messages: msgs };
}

export async function fullState(userKey: string) {
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
}

type St = Awaited<ReturnType<typeof fullState>>;

export function buildContext(s: St): TutorContext {
  const today = todayStr();
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
  const hoursRaw = s.sessions.filter((x) => diffDays(weekAgo, x.date) >= 0).reduce((a, x) => a + x.minutes, 0) / 60;
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
  await db.update(users).set({ streak, lastStudyDate: asOf }).where(eq(users.id, userId));
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
    await db.update(topics).set({ status: "done" }).where(eq(topics.id, id));
  }
}
