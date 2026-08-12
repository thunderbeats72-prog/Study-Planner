import { db } from "@/db";
import { users, settings, subjects, topics, tasks, sessions, messages } from "@/db/schema";
import { and, eq, desc, asc } from "drizzle-orm";
import { addDays, diffDays, todayStr } from "./planner";
import type { TutorContext } from "./ai";

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
  return { user, ...rest };
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

export async function recomputeStreak(userId: number) {
  const rows = await db.select().from(sessions).where(eq(sessions.userId, userId));
  const perDay = new Map<string, number>();
  for (const r of rows) perDay.set(r.date, (perDay.get(r.date) || 0) + r.minutes);
  // A visible clock-in should count. One real minute is enough to update
  // streak/consistency; shorter accidental taps are ignored by the API.
  const days = new Set([...perDay.entries()].filter(([, m]) => m >= 1).map(([d]) => d));
  let streak = 0;
  let cursor = todayStr();
  if (!days.has(cursor)) cursor = addDays(cursor, -1);
  while (days.has(cursor) && streak < 999) {
    streak++;
    cursor = addDays(cursor, -1);
  }
  await db.update(users).set({ streak, lastStudyDate: todayStr() }).where(eq(users.id, userId));
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
