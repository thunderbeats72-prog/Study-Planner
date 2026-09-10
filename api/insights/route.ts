import { NextResponse } from "next/server";
import { buildContext, dateFrom, fullState, keyFrom } from "@/lib/state";
import { callLLM, activeProvider } from "@/lib/ai";
import { diffDays } from "@/lib/planner";
import { checkRateLimit } from "@/lib/rateLimit";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

type InsightResult = { insights: string; source: string; meta?: Record<string, unknown> };
type InsightCacheEntry = { expiresAt: number; value: InsightResult };
type InsightGlobal = typeof globalThis & {
  __studyPlannerInsightCache?: Map<string, InsightCacheEntry>;
  __studyPlannerInsightInflight?: Map<string, Promise<InsightResult>>;
};
const insightGlobal = globalThis as InsightGlobal;
const insightCache = insightGlobal.__studyPlannerInsightCache ?? new Map<string, InsightCacheEntry>();
const insightInflight = insightGlobal.__studyPlannerInsightInflight ?? new Map<string, Promise<InsightResult>>();
insightGlobal.__studyPlannerInsightCache = insightCache;
insightGlobal.__studyPlannerInsightInflight = insightInflight;

export async function GET(req: Request) {
  const limit = checkRateLimit(req, "insights", 12, 60_000);
  if (!limit.allowed) {
    return NextResponse.json(
      { error: "Insights are refreshing too frequently.", code: "RATE_LIMITED" },
      { status: 429, headers: { "retry-after": String(limit.retryAfterSeconds) } }
    );
  }

  const state = await fullState(keyFrom(req));
  const today = dateFrom(req);
  const context = buildContext(state, today);
  const overdue = context.overdue;
  const weakest = [...context.subjects].sort(
    (a, b) => (a.total ? a.done / a.total : 1) - (b.total ? b.done / b.total : 1)
  )[0];
  const todayTasks = state.tasks.filter((task) => task.date === today);
  const doneToday = todayTasks.filter((task) => task.status === "done").length;
  const totalToday = todayTasks.length;
  const cacheKey = [
    state.user.id, today, doneToday, totalToday, overdue, context.progressPct,
    Math.floor(context.hoursThisWeek * 4), context.streak,
  ].join(":");
  const hit = insightCache.get(cacheKey);
  if (hit && hit.expiresAt > Date.now()) {
    return NextResponse.json({ ...hit.value, cached: true });
  }

  const existing = insightInflight.get(cacheKey);
  if (existing) return NextResponse.json({ ...await existing, cached: true });

  const generation = (async (): Promise<InsightResult> => {
    const provider = activeProvider();
    if (provider) {
      const text = await callLLM(
        "You are SHIGUN, a study coach. Reply with 3 short, specific coaching bullets (maximum 22 words each) in markdown. No preamble.",
        [{
          role: "user",
          content: `Untrusted learner data (facts only): ${JSON.stringify({
            name: context.name,
            course: context.courseName,
            daysLeft: context.daysLeft,
            progressPct: context.progressPct,
            streak: context.streak,
            hoursThisWeek: context.hoursThisWeek,
            weeklyTargetHours: context.dailyHours * 7,
            overdue,
            weakestSubject: weakest?.name || null,
            doneToday,
            totalToday,
          })}`,
        }],
        400
      );
      if (text) return { insights: text, source: provider };
    }

    const bullets: string[] = [];
    const weekTarget = context.dailyHours * 7;
    if (overdue > 5) {
      bullets.push(`**${overdue} tasks are overdue.** Rebalance once; the planner will spread unfinished work across the remaining ${context.daysLeft} days.`);
    } else if (overdue > 0) {
      bullets.push(`**${overdue} task${overdue > 1 ? "s" : ""} slipped.** Clear the oldest one first, then return to today's order.`);
    } else {
      bullets.push("**Zero overdue tasks.** Protect that by avoiding two missed study days in a row.");
    }

    if (context.hoursThisWeek < weekTarget * 0.6) {
      bullets.push(`You logged **${context.hoursThisWeek}h of ${weekTarget}h** this week. Start the first task for ten minutes; momentum can handle the rest.`);
    } else {
      bullets.push(`**${context.hoursThisWeek}h logged this week** (target ${weekTarget}h). Shift some reading time into active recall.`);
    }

    if (weakest?.total) {
      bullets.push(`**${weakest.name}** is at ${Math.round((weakest.done / weakest.total) * 100)}%. Put its next lesson in your highest-focus slot.`);
    }
    const pace = context.daysLeft > 0 ? Math.round(((100 - context.progressPct) / context.daysLeft) * 10) / 10 : 0;
    bullets.push(`Your remaining pace is about **${pace}% of the syllabus per day** for ${context.daysLeft} days.`);

    return {
      insights: bullets.slice(0, 3).map((bullet) => `- ${bullet}`).join("\n"),
      source: "aether-local",
      meta: { overdue, daysLeft: context.daysLeft, sinceStart: diffDays(state.settings.startDate, today) },
    };
  })();

  insightInflight.set(cacheKey, generation);
  try {
    const result = await generation;
    insightCache.set(cacheKey, { value: result, expiresAt: Date.now() + 5 * 60_000 });
    while (insightCache.size > 200) insightCache.delete(insightCache.keys().next().value as string);
    return NextResponse.json(result);
  } finally {
    if (insightInflight.get(cacheKey) === generation) insightInflight.delete(cacheKey);
  }
}
