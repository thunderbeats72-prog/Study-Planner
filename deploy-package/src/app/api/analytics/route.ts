import { NextResponse } from "next/server";
import { db } from "@/db";
import { tasks, sessions, topics, subjects } from "@/db/schema";
import { eq } from "drizzle-orm";
import { dateFrom, getOrCreateUser, getSettings, keyFrom } from "@/lib/state";
import { diffDays } from "@/lib/planner";
import {
  learnPace, paceFor, learnWeekdays, learnTimeOfDay, skipRisk,
  projectReadiness, retrievability, learnEffectiveDailyMinutes,
} from "@/lib/ml";
import { checkRateLimit } from "@/lib/rateLimit";

export const dynamic = "force-dynamic";

/**
 * GET /api/analytics — the ML models' view of this learner, computed
 * fresh from their history. Powers the Intelligence card on the
 * dashboard. All deterministic TypeScript; no LLM involved.
 */
export async function GET(req: Request) {
  const limit = checkRateLimit(req, "analytics", 30, 60_000);
  if (!limit.allowed) {
    return NextResponse.json(
      { error: "Analytics are refreshing too frequently.", code: "RATE_LIMITED" },
      { status: 429, headers: { "retry-after": String(limit.retryAfterSeconds) } }
    );
  }
  const key = keyFrom(req);
  const user = await getOrCreateUser(key);
  const st = await getSettings(user.id);
  const today = dateFrom(req);

  const [allTasks, allSessions, allTopics, allSubjects] = await Promise.all([
    db.select().from(tasks).where(eq(tasks.userId, user.id)),
    db.select().from(sessions).where(eq(sessions.userId, user.id)),
    db.select().from(topics).where(eq(topics.userId, user.id)),
    db.select().from(subjects).where(eq(subjects.userId, user.id)),
  ]);

  const history = allTasks.map((t) => ({
    subjectId: t.subjectId, topicId: t.topicId, date: t.date, kind: t.kind,
    status: t.status, plannedMinutes: t.plannedMinutes, actualMinutes: t.actualMinutes,
  }));

  // ── Pace: who runs fast/slow vs plan ──
  const pace = learnPace(history);
  const paceBySubject = allSubjects.map((s) => ({
    id: s.id, name: s.name, color: s.color,
    pace: paceFor(pace, s.id),
  })).sort((a, b) => b.pace - a.pace);

  // ── Weekday completion pattern ──
  const weekdays = learnWeekdays(history);

  // ── Focus hours ──
  const focus = learnTimeOfDay(allSessions.map((s) => ({
    createdAt: s.createdAt, minutes: s.minutes, mode: s.mode,
  })));

  // ── Tomorrow's skip risk ──
  const tomorrow = new Date(`${today}T12:00:00`);
  tomorrow.setDate(tomorrow.getDate() + 1);
  const tomorrowStr = `${tomorrow.getFullYear()}-${String(tomorrow.getMonth() + 1).padStart(2, "0")}-${String(tomorrow.getDate()).padStart(2, "0")}`;
  const tomorrowTasks = allTasks.filter((t) => t.date === tomorrowStr && t.status === "pending");
  const recent = allTasks.filter((t) => t.date < today && t.kind !== "buffer");
  const recentDone = recent.filter((t) => t.status === "done").length;
  const risk = tomorrowTasks.length
    ? skipRisk({
        dow: tomorrow.getDay(),
        taskCount: tomorrowTasks.length,
        totalMinutes: tomorrowTasks.reduce((a, t) => a + t.plannedMinutes, 0),
        dailyBudgetMinutes: Math.round(st.dailyHours * 60),
        streak: user.streak,
        recentCompletionRate: recent.length ? recentDone / recent.length : 0.7,
      })
    : 0;

  // ── Readiness projection with uncertainty band ──
  const remainingMin = allTasks
    .filter((t) => t.status === "pending" && t.kind === "learn")
    .reduce((a, t) => a + t.plannedMinutes, 0);
  // The projection is anchored to what the learner actually DOES, not just
  // what their settings claim: observed minutes per active study day.
  const effective = learnEffectiveDailyMinutes(
    allSessions.map((s) => ({ date: s.date, minutes: s.minutes, mode: s.mode })),
    today
  );
  const readiness = projectReadiness(
    history, remainingMin, Math.round(st.dailyHours * 60),
    Math.max(0, diffDays(today, st.examDate)),
    effective.activeDays > 0 ? { minutes: effective.minutes, activeDays: effective.activeDays } : undefined
  );

  // ── Memory health: FSRS recall probabilities across learned topics ──
  const learned = allTopics.filter((t) => t.status === "done");
  let strong = 0, fading = 0, atRisk = 0;
  for (const t of learned) {
    if (t.stability > 0 && t.lastReview) {
      const r = retrievability(t.stability, Math.max(0, diffDays(t.lastReview, today)));
      if (r >= 0.85) strong++;
      else if (r >= 0.65) fading++;
      else atRisk++;
    } else strong++; // recently learned, no review cycle yet
  }

  // ── Up Next prediction: the pending task the learner most likely
  // needs now — today's plan order weighted by peak-hour proximity and
  // subject momentum (recently touched subjects rank higher).
  const nowH = new Date().getHours();
  const pendingToday = allTasks
    .filter((t) => t.date === today && t.status === "pending")
    .sort((a, b) => a.position - b.position);
  const lastTouchBySub = new Map<number, string>();
  for (const t of allTasks) {
    if (t.subjectId && t.status === "done") {
      const prev = lastTouchBySub.get(t.subjectId);
      if (!prev || t.date > prev) lastTouchBySub.set(t.subjectId, t.date);
    }
  }
  const upNext = pendingToday
    .map((t) => {
      let score = 100 - t.position; // plan order is the base signal
      if (focus.peakHour !== null && Math.abs(nowH - focus.peakHour) <= 1) {
        // during peak hours, prefer the hardest pending item
        const topic = allTopics.find((x) => x.id === t.topicId);
        if (topic?.difficulty === "Hard") score += 25;
      }
      const touched = t.subjectId ? lastTouchBySub.get(t.subjectId) : undefined;
      if (touched && diffDays(touched, today) <= 1) score += 10; // momentum
      return { t, score };
    })
    .sort((a, b) => b.score - a.score)[0]?.t || null;

  // ── Focus-window suggestion from the hour profile ──
  const focusSuggestion =
    focus.peakHour !== null
      ? {
          startHour: focus.peakHour,
          endHour: (focus.peakHour + 2) % 24,
          isNow: Math.abs(nowH - focus.peakHour) <= 1,
        }
      : null;

  return NextResponse.json({
    upNext: upNext
      ? { id: upNext.id, title: upNext.title, minutes: upNext.plannedMinutes, kind: upNext.kind, subjectId: upNext.subjectId }
      : null,
    focusSuggestion,
    pace: {
      global: pace.global,
      samples: pace.samples,
      bySubject: paceBySubject,
    },
    weekdays: weekdays.samples >= 14 ? weekdays.rates : null,
    peakHour: focus.peakHour,
    focusSamples: focus.samples,
    tomorrowRisk: risk,
    readiness,
    effectiveDailyMinutes: effective,
    memory: { strong, fading, atRisk, tracked: learned.length },
  });
}
