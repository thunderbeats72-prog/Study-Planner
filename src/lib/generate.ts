import { db } from "@/db";
import { subjects, topics, tasks } from "@/db/schema";
import { and, eq, inArray } from "drizzle-orm";
import { aiGenerateTopics } from "./ai";
import { buildPlan, todayStr, diffDays, type PlanSettings, type PlanTopic } from "./planner";

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

  const pending: PlanTopic[] = tps
    .filter((t) => !doneTopicIds.has(t.id) && t.status !== "done")
    .sort((a, b) => a.position - b.position)
    .map((t) => ({
      id: t.id,
      subjectId: t.subjectId,
      title: t.title,
      unit: t.unit,
      estMinutes: t.estMinutes,
      difficulty: t.difficulty,
      mastery: t.mastery,
    }));

  const ps: PlanSettings = { ...settingsRow, startDate: start };
  const result = buildPlan(
    subs.map((s) => ({ id: s.id, name: s.name, difficulty: s.difficulty, color: s.color })),
    pending,
    ps
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
