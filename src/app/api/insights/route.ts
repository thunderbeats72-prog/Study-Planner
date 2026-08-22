import { NextResponse } from "next/server";
import { buildContext, fullState, keyFrom } from "@/lib/state";
import { callLLM, activeProvider } from "@/lib/ai";
import { diffDays, todayStr } from "@/lib/planner";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(req: Request) {
  const s = await fullState(keyFrom(req));
  const ctx = buildContext(s);
  const today = todayStr();
  const overdue = ctx.overdue;
  const weakest = [...ctx.subjects].sort(
    (a, b) => (a.total ? a.done / a.total : 1) - (b.total ? b.done / b.total : 1)
  )[0];
  const doneToday = s.tasks.filter((t) => t.date === today && t.status === "done").length;
  const totalToday = s.tasks.filter((t) => t.date === today).length;

  if (activeProvider()) {
    const todayTasks = s.tasks.filter((t) => t.date === today);
    const pendingToday = todayTasks
      .filter((t) => t.status === "pending")
      .slice(0, 5)
      .map((t) => `"${t.title}" (${t.plannedMinutes} min)`)
      .join(", ");
    const overdueTitles = s.tasks
      .filter((t) => t.status === "pending" && t.date < today)
      .slice(0, 5)
      .map((t) => `"${t.title}"`)
      .join(", ");
    const weakestPct = weakest?.total ? Math.round((weakest.done / weakest.total) * 100) : 0;
    const dataLine = [
      `Learner: ${ctx.name}`,
      `Course: ${ctx.courseName}`,
      `${ctx.daysLeft} days to exam`,
      `progress ${ctx.progressPct}%`,
      `streak ${ctx.streak} days`,
      `${ctx.hoursThisWeek}h this week vs ${ctx.dailyHours * 7}h target`,
      `${overdue} overdue task(s)`,
      `weakest subject: ${weakest?.name || "none"} at ${weakestPct}%`,
      `today ${doneToday}/${totalToday} tasks done`,
      pendingToday ? `pending today: ${pendingToday}` : "no pending tasks today",
      overdueTitles ? `overdue: ${overdueTitles}` : "",
    ].filter(Boolean).join(". ");

    const txt = await callLLM(
      "You are SHIGUN, a study coach. Reply with 3 short punchy coaching bullets (max 22 words each) in markdown. No preamble. Base every bullet ONLY on the exact learner data below; name the actual course, subject, or task. Never invent data and never give generic advice that ignores this learner.",
      [
        {
          role: "user",
          content: `${dataLine}. Give 3 specific coaching bullets.`,
        },
      ],
      400
    );
    if (txt) return NextResponse.json({ insights: txt, source: activeProvider() });
  }

  const bullets: string[] = [];
  const weekTarget = ctx.dailyHours * 7;
  if (overdue > 5)
    bullets.push(
      `**${overdue} tasks are overdue.** Don't binge-catch-up — hit *Re-plan with AI* and the engine will re-spread them across your remaining ${ctx.daysLeft} days.`
    );
  else if (overdue > 0)
    bullets.push(`**${overdue} task${overdue > 1 ? "s" : ""} slipped.** Clear them today; small debts compound fast.`);
  else bullets.push(`**Zero overdue tasks.** You're on the rails — protect this by never missing two days in a row.`);

  if (ctx.hoursThisWeek < weekTarget * 0.6)
    bullets.push(
      `You've logged **${ctx.hoursThisWeek}h of ${weekTarget}h** this week. Fix the *start*, not the duration: clock in for 10 minutes on the first task and momentum handles the rest.`
    );
  else
    bullets.push(
      `**${ctx.hoursThisWeek}h logged this week** (target ${weekTarget}h). Solid volume — now shift a slice of it from reading to active recall for better retention per hour.`
    );

  if (weakest && weakest.total)
    bullets.push(
      `**${weakest.name}** is your slowest subject at ${Math.round((weakest.done / weakest.total) * 100)}%. The engine already gives it extra weight; front-load it in the morning slot when focus is highest.`
    );

  const pace = ctx.daysLeft > 0 ? Math.round(((100 - ctx.progressPct) / ctx.daysLeft) * 10) / 10 : 0;
  bullets.push(
    `To finish on time you need about **${pace}% of the syllabus per day** for the next ${ctx.daysLeft} days${
      ctx.streak > 2 ? ` — your ${ctx.streak}-day streak says that's realistic.` : "."
    }`
  );

  return NextResponse.json({
    insights: bullets.slice(0, 3).map((b) => `- ${b}`).join("\n"),
    source: "aether-local",
    meta: { overdue, daysLeft: ctx.daysLeft, sinceStart: diffDays(s.settings.startDate, today) },
  });
}
