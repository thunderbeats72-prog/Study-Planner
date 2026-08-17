import { db } from "@/db";
import { subjects, topics, tasks } from "@/db/schema";
import { and, eq, inArray } from "drizzle-orm";
import { aiGenerateTopics } from "./ai";
import { buildPlan, todayStr, diffDays, type PlanSettings, type PlanTopic } from "./planner";
import { learnPace, learnWeekdays, paceFor, weekdayLoadFactor, decayedMastery } from "./ml";

export async function synthesiseTopicsForSubject(
  userId: number,
  subjectId: number,
  name: string,
  units: number,
  difficulty: string,
  level: string,
  courseName: string
) {
  const generated = await aiGenerateTopics(name, units, difficulty, level, courseName);
  const rows = generated.map((g, i) => ({
    userId,
    subjectId,
    unit: g.unit,
    title: g.title,
    summary: g.summary,
    objectives: g.objectives,
    difficulty: g.difficulty,
    estMinutes: g.estMinutes,
    position: i,
  }));
  if (rows.length) await db.insert(topics).values(rows);
  return rows.length;
}

/**
 * Rebuild the schedule. Preserves completed work: only pending topics get
 * re-scheduled, and the plan restarts from today (or the configured start).
 */
export async function regeneratePlan(userId: number, settingsRow: {
  startDate: string; examDate: string; dailyHours: number; subjectsPerDay: number;
  studyDays: string; bufferDays: number; planMode: string; studyStyle: string;
  weakSubject: string; revisionWeeks: number;
}, opts: { fromToday?: boolean } = {}) {
  const subs = await db.select().from(subjects).where(eq(subjects.userId, userId));
  const tps = await db.select().from(topics).where(eq(topics.userId, userId));

  // completed topics stay done
  const doneTaskRows = await db
    .select()
    .from(tasks)
    .where(and(eq(tasks.userId, userId), eq(tasks.status, "done")));
  const doneTopicIds = new Set(doneTaskRows.filter((t) => t.kind === "learn" && t.topicId).map((t) => t.topicId));
  if (doneTopicIds.size) {
    await db
      .update(topics)
      .set({ status: "done", mastery: 60 })
      .where(and(eq(topics.userId, userId), inArray(topics.id, [...doneTopicIds] as number[])));
  }

  const today = todayStr();
  const start =
    opts.fromToday || diffDays(settingsRow.startDate, today) > 0 ? today : settingsRow.startDate;

  // ── ML: learn from this user's complete task history ────────
  // 1. PACE — how long they ACTUALLY take vs planned, per subject.
  // 2. WEEKDAYS — which days of the week they historically complete.
  // 3. DECAY — mastery fades for topics untouched for a long time,
  //    so old "done" work resurfaces in revision with priority.
  const allHistory = await db.select().from(tasks).where(eq(tasks.userId, userId));
  const historyRows = allHistory.map((t) => ({
    subjectId: t.subjectId,
    date: t.date,
    kind: t.kind,
    status: t.status,
    plannedMinutes: t.plannedMinutes,
    actualMinutes: t.actualMinutes,
  }));
  const pace = learnPace(historyRows);
  const weekdays = learnWeekdays(historyRows);

  // Last date each topic was actually worked on (for mastery decay)
  const lastTouch = new Map<number, string>();
  for (const t of allHistory) {
    if (t.topicId && t.status === "done") {
      const prev = lastTouch.get(t.topicId);
      if (!prev || t.date > prev) lastTouch.set(t.topicId, t.date);
    }
  }
  const daysSince = (topicId: number): number => {
    const d = lastTouch.get(topicId);
    return d ? Math.max(0, diffDays(d, today)) : 0;
  };

  const pending: PlanTopic[] = tps
    .filter((t) => !doneTopicIds.has(t.id) && t.status !== "done")
    .sort((a, b) => a.position - b.position)
    .map((t) => ({
      id: t.id,
      subjectId: t.subjectId,
      title: t.title,
      unit: t.unit,
      // ML pace adjustment: schedule the time THIS user actually needs.
      // Neutral (×1.0) until ~5 completed tasks exist for the subject.
      estMinutes: Math.round((t.estMinutes * paceFor(pace, t.subjectId)) / 5) * 5,
      difficulty: t.difficulty,
      // ML decay: long-untouched topics report lower effective mastery,
      // which pushes them up the revision priority queue.
      mastery: decayedMastery(t.mastery, daysSince(t.id)),
    }));

  const ps: PlanSettings = { ...settingsRow, startDate: start };
  const result = buildPlan(
    subs.map((s) => ({ id: s.id, name: s.name, difficulty: s.difficulty, color: s.color })),
    pending,
    ps,
    { dayFactor: (date) => weekdayLoadFactor(weekdays, date) }
  );

  // wipe only future/pending tasks, keep history
  const existing = await db.select().from(tasks).where(eq(tasks.userId, userId));
  const dropIds = existing.filter((t) => t.status === "pending").map((t) => t.id);
  if (dropIds.length) await db.delete(tasks).where(inArray(tasks.id, dropIds));

  if (result.tasks.length) {
    const chunk = 400;
    const rows = result.tasks.map((t) => ({ ...t, userId }));
    for (let i = 0; i < rows.length; i += chunk) {
      await db.insert(tasks).values(rows.slice(i, i + chunk));
    }
  }
  return result.stats;
}
