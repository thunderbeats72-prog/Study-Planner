import { db } from "@/db";
import { subjects, topics, tasks } from "@/db/schema";
import { and, eq, inArray, sql } from "drizzle-orm";
import { aiGenerateTopics } from "./ai";
import { buildPlan, todayStr, diffDays, type PlanSettings, type PlanTopic } from "./planner";
import {
  learnPace, learnWeekdays, paceFor, weekdayLoadFactor, decayedMastery,
  learnClusterPace, topicPace, retrievability,
} from "./ml";

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
    prerequisites: g.prerequisites,
    keyConcepts: g.keyConcepts,
    practice: g.practice,
    depth: g.depth,
    sources: g.sources,
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
}, opts: { fromToday?: boolean; today?: string } = {}) {
  const subs = await db.select().from(subjects).where(eq(subjects.userId, userId));
  const tps = await db.select().from(topics).where(eq(topics.userId, userId));

  // completed topics stay done
  const doneTaskRows = await db
    .select()
    .from(tasks)
    .where(and(eq(tasks.userId, userId), eq(tasks.status, "done")));
  const doneTopicIds = new Set(doneTaskRows.filter((t) => t.kind === "learn" && t.topicId).map((t) => t.topicId));
  const today = opts.today || todayStr();
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
    topicId: t.topicId,
    date: t.date,
    kind: t.kind,
    status: t.status,
    plannedMinutes: t.plannedMinutes,
    actualMinutes: t.actualMinutes,
  }));
  const pace = learnPace(historyRows);
  const weekdays = learnWeekdays(historyRows);
  // Cluster-level pace: needs topic titles to group related units
  const titleById = new Map(tps.map((t) => [t.id, t.title]));
  const clusters = learnClusterPace(historyRows, titleById);

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
    .filter((t) => settingsRow.planMode === "revision" || (!doneTopicIds.has(t.id) && t.status !== "done"))
    .sort((a, b) => a.position - b.position)
    .map((t) => ({
      id: t.id,
      subjectId: t.subjectId,
      title: t.title,
      unit: t.unit,
      // ML pace adjustment: subject-level pace refined by topic-cluster
      // evidence ("Testing of Hypothesis" may be slower for this user
      // than the rest of Quant Methods). Neutral ×1.0 until data exists.
      estMinutes:
        Math.round((t.estMinutes * topicPace(paceFor(pace, t.subjectId), clusters, t.title)) / 5) * 5,
      difficulty: t.difficulty,
      // FSRS-aware mastery: topics with review history report their
      // current recall probability; others fall back to Ebbinghaus decay.
      // Low effective mastery pushes a topic up the revision queue.
      mastery:
        t.stability > 0 && t.lastReview
          ? Math.round(t.mastery * retrievability(t.stability, Math.max(0, diffDays(t.lastReview, today))))
          : decayedMastery(t.mastery, daysSince(t.id)),
    }));

  const ps: PlanSettings = { ...settingsRow, startDate: start };
  const result = buildPlan(
    subs.map((s) => ({ id: s.id, name: s.name, difficulty: s.difficulty, color: s.color })),
    pending,
    ps,
    { dayFactor: (date) => weekdayLoadFactor(weekdays, date) }
  );

  // Replace unfinished cards atomically. If one insert fails, PostgreSQL
  // rolls the deletion back, so a re-plan can never leave a blank calendar.
  // The advisory lock serialises two server/API requests for this learner.
  await db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(7321, ${userId})`);

    if (doneTopicIds.size) {
      // Re-planning must not reduce a learner's 80/100 mastery back to 60.
      await tx
        .update(topics)
        .set({ status: "done" })
        .where(and(eq(topics.userId, userId), inArray(topics.id, [...doneTopicIds] as number[])));
    }

    const existing = await tx.select().from(tasks).where(eq(tasks.userId, userId));
    const dropIds = existing.filter((task) => task.status !== "done").map((task) => task.id);
    if (dropIds.length) {
      await tx.delete(tasks).where(and(eq(tasks.userId, userId), inArray(tasks.id, dropIds)));
    }

    if (result.tasks.length) {
      const chunk = 400;
      const rows = result.tasks.map((task) => ({ ...task, userId }));
      for (let index = 0; index < rows.length; index += chunk) {
        await tx.insert(tasks).values(rows.slice(index, index + chunk));
      }
    }
  });
  return result.stats;
}
