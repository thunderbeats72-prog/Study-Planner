"use client";

import React, { useEffect, useMemo, useState } from "react";
import {
  api, addDays, dayDiff, fmtDate, prettyDate, prettyLong, today, type AppState,
} from "@/lib/client";
import { CountUp, Marquee, Reveal, Spot } from "@/lib/fx";
import {
  IconBook, IconCalendar, IconChart, IconCheck, IconClock, IconFlame,
  IconLeaf, IconSpark, IconTarget, IconTrend,
} from "./icons";
import { PageHead, WeekBars } from "./bits";
import Heatmap from "./Heatmap";
import { cn } from "@/lib/cn";

export default function AnalyticsView({
  state,
  onAskTutor,
  onStartFocus,
}: {
  state: AppState;
  onAskTutor?: (q: string) => void;
  onStartFocus?: () => void;
}) {
  const [intel, setIntel] = useState<{
    pace: { global: number; samples: number; bySubject: { id: number; name: string; color: string; pace: number }[] } | null;
    weekdays: number[] | null;
    peakHour: number | null;
    tomorrowRisk: number;
    readiness: { onTrack: boolean; loadPct: number; likelyDays: number; optimisticDays: number; pessimisticDays: number; samples: number; effectiveDailyMinutes?: number };
    effectiveDailyMinutes?: { minutes: number; activeDays: number; samples: number };
    memory: { strong: number; fading: number; atRisk: number; tracked: number };
  } | null>(null);
  const [insights, setInsights] = useState<string>("");
  const [loadingIns, setLoadingIns] = useState(true);

  const t = today();
  const ctx = state.context;

  useEffect(() => {
    let cancelled = false;
    api<typeof intel>("/api/analytics")
      .then((data) => { if (!cancelled) setIntel(data); })
      .catch(() => undefined);
    return () => { cancelled = true; };
  }, [state.sessions.length, state.tasks.length]);

  useEffect(() => {
    let cancelled = false;
    api<{ insights: string }>("/api/insights")
      .then((data) => { if (!cancelled) setInsights(data.insights); })
      .catch(() => { if (!cancelled) setInsights(""); })
      .finally(() => { if (!cancelled) setLoadingIns(false); });
    return () => { cancelled = true; };
  }, [state.tasks.length]);

  const totalMin = useMemo(
    () => state.sessions.reduce((a, b) => a + b.minutes, 0),
    [state.sessions]
  );
  const doneTasks = useMemo(
    () => state.tasks.filter((x) => x.status === "done").length,
    [state.tasks]
  );
  const overdueTasks = useMemo(
    () => state.tasks.filter((x) => x.status === "pending" && x.date < t).length,
    [state.tasks, t]
  );

  // Active days in last 14 days
  const active14 = useMemo(() => {
    const dates = new Set(state.sessions.map((s) => s.date));
    let count = 0;
    for (let i = 0; i < 14; i++) {
      if (dates.has(addDays(t, -i))) count++;
    }
    return count;
  }, [state.sessions, t]);

  const consistency = Math.round((active14 / 14) * 100);
  const ringCircumference = 2 * Math.PI * 34;

  // Week study bars
  const week = useMemo(() => {
    const arr: { key: string; label: string; minutes: number }[] = [];
    for (let i = 6; i >= 0; i--) {
      const d = addDays(t, -i);
      const mins = state.sessions
        .filter((s) => s.date === d)
        .reduce((a, s) => a + s.minutes, 0);
      arr.push({
        key: d,
        label: new Date(d).toLocaleDateString(undefined, { weekday: "short" }).slice(0, 3),
        minutes: mins,
      });
    }
    return arr;
  }, [state.sessions, t]);

  const weekMin = useMemo(() => week.reduce((a, b) => a + b.minutes, 0), [week]);
  const dailyGoalMin = (state.settings.dailyHours || 2) * 60;

  // Subject completion stats
  const subjectStats = useMemo(() => {
    return state.subjects.map((sb) => {
      const topics = state.topics.filter((tp) => tp.subjectId === sb.id);
      const doneTopics = topics.filter((tp) => tp.status === "done").length;
      const tasks = state.tasks.filter((tk) => tk.subjectId === sb.id);
      const doneTasks = tasks.filter((tk) => tk.status === "done").length;
      const pendingMins = tasks.filter((tk) => tk.status === "pending").reduce((a, b) => a + b.plannedMinutes, 0);
      const loggedMins = state.sessions.filter((sn) => sn.subjectId === sb.id).reduce((a, b) => a + b.minutes, 0);
      const pct = topics.length ? Math.round((doneTopics / topics.length) * 100) : 0;
      return {
        ...sb,
        totalTopics: topics.length,
        doneTopics,
        doneTasks,
        pendingMins,
        loggedMins,
        pct,
      };
    });
  }, [state.subjects, state.topics, state.tasks, state.sessions]);

  // Productivity metrics
  const productivity = useMemo(() => {
    const focusSessions = state.sessions.filter((s) => s.mode !== "break");
    const breakSessions = state.sessions.filter((s) => s.mode === "break");
    const avgLen = focusSessions.length ? Math.round(totalMin / focusSessions.length) : 0;
    const breakMin = breakSessions.reduce((a, b) => a + b.minutes, 0);
    const focusMin = totalMin;
    const ratio = totalMin + breakMin > 0 ? Math.round((focusMin / (totalMin + breakMin)) * 100) : 100;

    const weekdayNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
    let bestDay = "Flexible";
    if (intel?.weekdays && intel.weekdays.length === 7) {
      const maxIdx = intel.weekdays.indexOf(Math.max(...intel.weekdays));
      if (maxIdx >= 0 && intel.weekdays[maxIdx] > 0) bestDay = weekdayNames[maxIdx];
    }

    let peakHourStr = "Morning";
    if (intel?.peakHour != null) {
      const h = intel.peakHour;
      peakHourStr = h === 0 ? "12 AM" : h < 12 ? `${h} AM` : h === 12 ? "12 PM" : `${h - 12} PM`;
    }

    return { avgLen, ratio, bestDay, peakHourStr, totalSessions: state.sessions.length };
  }, [state.sessions, totalMin, intel]);

  // Ticker items
  const ticker = useMemo(() => [
    `STREAK ${state.user.streak}D`,
    `WEEK ${Math.round((weekMin / 60) * 10) / 10}H`,
    `TOTAL ${Math.round(totalMin / 60)}H`,
    `TASKS DONE ${doneTasks}`,
    `OVERDUE ${overdueTasks}`,
    `CONSISTENCY ${consistency}%`,
    ...subjectStats.map((sb) => `${sb.name.toUpperCase()} ${sb.doneTopics}/${sb.totalTopics || sb.units}`),
  ], [state.user.streak, weekMin, totalMin, doneTasks, overdueTasks, consistency, subjectStats]);

  const fmtMin = (m: number) => {
    const r = Math.round(m * 10) / 10;
    return `${Number.isInteger(r) ? r : r.toFixed(1)}m`;
  };

  return (
    <div className="space-y-6 fade-in">
      <PageHead
        eyebrow="ANALYTICS DASHBOARD"
        title="Where the hours went"
        sub="Deep data, consistency trends, subject mastery, and focus metrics — all mapped from your study sessions."
      />

      {/* Ticker marquee */}
      <Reveal>
        <div className="glass-panel tilt-card overflow-hidden py-3 px-2">
          <Marquee speed={36}>
            {ticker.map((tText, i) => (
              <span
                key={i}
                className="mono mx-4 inline-flex items-center gap-3 text-[12px] font-bold tracking-wider"
                style={{ color: "var(--text-dim, #5f5a7a)" }}
              >
                {tText}
                <span
                  className="h-1.5 w-1.5 rounded-full"
                  style={{ background: "var(--accent, var(--color-primary, #6366f1))" }}
                />
              </span>
            ))}
          </Marquee>
        </div>
      </Reveal>

      {/* Top row: Weekly Volume + Consistency Ring */}
      <div className="grid gap-4 lg:grid-cols-[1.5fr_1fr]">
        <Reveal>
          <Spot className="glass-panel tilt-card section-card h-full p-5 sm:p-6">
            <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
              <div>
                <h3 className="flex items-center gap-2 text-[16px] font-extrabold tracking-tight" style={{ color: "var(--text-main, #211a3a)" }}>
                  <IconChart size={17} /> Weekly Study Volume
                </h3>
                <p className="mt-1 text-[12.5px] font-medium" style={{ color: "var(--text-dim, #5f5a7a)" }}>
                  Daily minutes vs your target goal ({state.settings.dailyHours}h/day)
                </p>
              </div>
              <span className="mono rounded-xl border border-[var(--border-subtle,#e4e0f1)] bg-[var(--surface-2,#f4f2fc)] px-3 py-1.5 text-[12px] font-bold" style={{ color: "var(--text-main, #211a3a)" }}>
                <CountUp to={weekMin / 60} decimals={1} /> h this week
              </span>
            </div>
            <WeekBars days={week} goal={dailyGoalMin} height={170} />
          </Spot>
        </Reveal>

        <Reveal delay={60}>
          <Spot className="glass-panel tilt-card section-card flex h-full flex-col items-center justify-center gap-4 p-6">
            <div className="flex w-full items-center justify-between">
              <h3 className="text-[16px] font-extrabold tracking-tight" style={{ color: "var(--text-main, #211a3a)" }}>
                Consistency Ring
              </h3>
              <span className="mono text-[12px] font-bold" style={{ color: "var(--accent, #6366f1)" }}>
                14-Day Window
              </span>
            </div>
            <div className="relative grid place-items-center my-2">
              <svg viewBox="0 0 80 80" className="h-40 w-40 -rotate-90">
                <circle
                  cx="40"
                  cy="40"
                  r="34"
                  fill="none"
                  stroke="var(--border-subtle, #e4e0f1)"
                  strokeWidth="7"
                />
                <circle
                  cx="40"
                  cy="40"
                  r="34"
                  fill="none"
                  stroke="var(--accent, var(--color-primary, #6366f1))"
                  strokeWidth="7"
                  strokeLinecap="round"
                  strokeDasharray={ringCircumference}
                  strokeDashoffset={ringCircumference - (ringCircumference * consistency) / 100}
                  style={{ transition: "stroke-dashoffset 1.2s cubic-bezier(.22,1,.36,1)" }}
                />
              </svg>
              <div className="absolute text-center">
                <span className="mono text-[30px] font-extrabold tracking-tight" style={{ color: "var(--text-main, #211a3a)" }}>
                  <CountUp to={consistency} suffix="%" />
                </span>
                <span className="block text-[11px] font-bold uppercase tracking-wider" style={{ color: "var(--text-dim, #5f5a7a)" }}>
                  Active
                </span>
              </div>
            </div>
            <p className="text-center text-[13px] font-semibold" style={{ color: "var(--text-dim, #5f5a7a)" }}>
              {active14} of last 14 days active · {state.user.streak} day streak
            </p>
          </Spot>
        </Reveal>
      </div>

      {/* 12-Week Study Heatmap */}
      <Reveal delay={80}>
        <Heatmap state={state} />
      </Reveal>

      {/* Subject Mastery & Productivity Analytics */}
      <div className="grid gap-4 lg:grid-cols-2">
        {/* Subject Mastery Progress */}
        <Reveal delay={100}>
          <Spot className="glass-panel tilt-card section-card p-5 sm:p-6">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="flex items-center gap-2 text-[16px] font-extrabold tracking-tight" style={{ color: "var(--text-main, #211a3a)" }}>
                <IconBook size={17} /> Subject Mastery &amp; Progress
              </h3>
              <span className="mono text-[12px] font-bold" style={{ color: "var(--text-dim, #5f5a7a)" }}>
                {subjectStats.length} subjects
              </span>
            </div>
            <div className="space-y-4">
              {subjectStats.map((sb) => (
                <div key={sb.id} className="space-y-1.5">
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="truncate text-[13.5px] font-bold" style={{ color: "var(--text-main, #211a3a)" }}>
                      {sb.name}
                    </span>
                    <span className="mono text-[12px] font-bold" style={{ color: sb.color }}>
                      {sb.doneTopics}/{sb.totalTopics || sb.units} lessons ({sb.pct}%)
                    </span>
                  </div>
                  <div className="h-2 w-full overflow-hidden rounded-full bg-[var(--surface-2,#f4f2fc)]">
                    <div
                      className="h-full rounded-full transition-all duration-1000"
                      style={{ width: `${sb.pct}%`, background: sb.color }}
                    />
                  </div>
                  <div className="flex items-center justify-between text-[11px] font-semibold" style={{ color: "var(--text-dim, #5f5a7a)" }}>
                    <span>{Math.round(sb.loggedMins / 60 * 10) / 10}h logged</span>
                    <span>{sb.pendingMins}m pending</span>
                  </div>
                </div>
              ))}
            </div>
          </Spot>
        </Reveal>

        {/* Productivity & Focus Patterns */}
        <Reveal delay={120}>
          <Spot className="glass-panel tilt-card section-card p-5 sm:p-6">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="flex items-center gap-2 text-[16px] font-extrabold tracking-tight" style={{ color: "var(--text-main, #211a3a)" }}>
                <IconTrend size={17} /> Productivity Patterns
              </h3>
              <span className="chip chip-kind">Live AI telemetry</span>
            </div>
            <div className="grid grid-cols-2 gap-3.5 sm:grid-cols-2">
              <div className="rounded-xl border border-[var(--border-subtle,#e4e0f1)] bg-[var(--surface-2,#f4f2fc)] p-3.5">
                <span className="text-[11.5px] font-bold uppercase tracking-wider" style={{ color: "var(--text-dim, #5f5a7a)" }}>
                  Peak Focus Hour
                </span>
                <p className="mono mt-1 text-[20px] font-extrabold" style={{ color: "var(--accent, #6366f1)" }}>
                  {productivity.peakHourStr}
                </p>
                <p className="mt-1 text-[11.5px] font-medium" style={{ color: "var(--text-dim, #5f5a7a)" }}>
                  Most study time logged
                </p>
              </div>

              <div className="rounded-xl border border-[var(--border-subtle,#e4e0f1)] bg-[var(--surface-2,#f4f2fc)] p-3.5">
                <span className="text-[11.5px] font-bold uppercase tracking-wider" style={{ color: "var(--text-dim, #5f5a7a)" }}>
                  Best Study Day
                </span>
                <p className="mono mt-1 text-[20px] font-extrabold" style={{ color: "var(--success-accent, #2e9e6d)" }}>
                  {productivity.bestDay}
                </p>
                <p className="mt-1 text-[11.5px] font-medium" style={{ color: "var(--text-dim, #5f5a7a)" }}>
                  Highest completion rate
                </p>
              </div>

              <div className="rounded-xl border border-[var(--border-subtle,#e4e0f1)] bg-[var(--surface-2,#f4f2fc)] p-3.5">
                <span className="text-[11.5px] font-bold uppercase tracking-wider" style={{ color: "var(--text-dim, #5f5a7a)" }}>
                  Avg Session Block
                </span>
                <p className="mono mt-1 text-[20px] font-extrabold" style={{ color: "var(--text-main, #211a3a)" }}>
                  {productivity.avgLen} min
                </p>
                <p className="mt-1 text-[11.5px] font-medium" style={{ color: "var(--text-dim, #5f5a7a)" }}>
                  Protected deep work
                </p>
              </div>

              <div className="rounded-xl border border-[var(--border-subtle,#e4e0f1)] bg-[var(--surface-2,#f4f2fc)] p-3.5">
                <span className="text-[11.5px] font-bold uppercase tracking-wider" style={{ color: "var(--text-dim, #5f5a7a)" }}>
                  Focus vs Break
                </span>
                <p className="mono mt-1 text-[20px] font-extrabold" style={{ color: "var(--accent, #6366f1)" }}>
                  {productivity.ratio}%
                </p>
                <p className="mt-1 text-[11.5px] font-medium" style={{ color: "var(--text-dim, #5f5a7a)" }}>
                  Active on-the-clock ratio
                </p>
              </div>
            </div>

            {/* Memory health snapshot if available */}
            {intel?.memory && (
              <div className="mt-4 rounded-xl border border-[var(--border-subtle,#e4e0f1)] bg-[var(--surface-2,#f4f2fc)] p-3.5">
                <div className="flex items-center justify-between text-[12px] font-bold mb-2">
                  <span style={{ color: "var(--text-main, #211a3a)" }}>Spaced Recall &amp; Memory Health</span>
                  <span className="mono" style={{ color: "var(--accent, #6366f1)" }}>{intel.memory.tracked} lessons tracked</span>
                </div>
                <div className="flex h-2.5 w-full overflow-hidden rounded-full bg-[var(--border-subtle,#e4e0f1)]">
                  <div
                    title={`${intel.memory.strong} strong`}
                    className="h-full bg-[var(--success-accent,#2e9e6d)]"
                    style={{ width: `${(intel.memory.strong / Math.max(1, intel.memory.tracked)) * 100}%` }}
                  />
                  <div
                    title={`${intel.memory.fading} fading`}
                    className="h-full bg-[var(--warning-accent,#c07a10)]"
                    style={{ width: `${(intel.memory.fading / Math.max(1, intel.memory.tracked)) * 100}%` }}
                  />
                  <div
                    title={`${intel.memory.atRisk} at risk`}
                    className="h-full bg-[var(--danger-accent,#ef4444)]"
                    style={{ width: `${(intel.memory.atRisk / Math.max(1, intel.memory.tracked)) * 100}%` }}
                  />
                </div>
                <div className="mt-2 flex items-center justify-between text-[11px] font-semibold" style={{ color: "var(--text-dim, #5f5a7a)" }}>
                  <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-[var(--success-accent,#2e9e6d)]" /> {intel.memory.strong} strong</span>
                  <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-[var(--warning-accent,#c07a10)]" /> {intel.memory.fading} fading</span>
                  <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-[var(--danger-accent,#ef4444)]" /> {intel.memory.atRisk} at risk</span>
                </div>
              </div>
            )}
          </Spot>
        </Reveal>
      </div>

      {/* Recent Study Session Log */}
      <Reveal delay={140}>
        <Spot className="glass-panel tilt-card section-card overflow-hidden">
          <div className="flex items-center justify-between border-b border-[var(--border-subtle,#e4e0f1)] p-5">
            <div>
              <h3 className="flex items-center gap-2 text-[16px] font-extrabold tracking-tight" style={{ color: "var(--text-main, #211a3a)" }}>
                <IconClock size={17} /> Recent Study Sessions Log
              </h3>
              <p className="mt-1 text-[12px] font-medium" style={{ color: "var(--text-dim, #5f5a7a)" }}>
                Recorded study events and real clocked minutes
              </p>
            </div>
            <span className="mono text-[12px] font-bold" style={{ color: "var(--text-dim, #5f5a7a)" }}>
              {state.sessions.length} sessions total
            </span>
          </div>

          <div className="divide-y divide-[var(--border-subtle,#e4e0f1)]">
            {state.sessions.length === 0 ? (
              <p className="p-8 text-center text-[13.5px] font-medium" style={{ color: "var(--text-dim, #5f5a7a)" }}>
                No study sessions logged yet. Clock into a task to start recording!
              </p>
            ) : (
              state.sessions
                .slice(-10)
                .reverse()
                .map((sn, idx) => {
                  const sb = state.subjects.find((s) => s.id === sn.subjectId);
                  const tk = state.tasks.find((t) => t.id === sn.taskId);
                  const maxSessionBar = Math.max(60, dailyGoalMin);
                  return (
                    <div key={sn.id || idx} className="flex flex-wrap items-center gap-3 px-5 py-3">
                      <span className="mono w-24 text-[12px] font-bold" style={{ color: "var(--text-dim, #5f5a7a)" }}>
                        {prettyDate(sn.date)}
                      </span>
                      <div className="min-w-0 flex-1 basis-48">
                        <p className="truncate text-[13.5px] font-bold" style={{ color: "var(--text-main, #211a3a)" }}>
                          {tk ? tk.title : sb ? sb.name : "Open Focus Session"}
                        </p>
                        <p className="text-[11.5px] font-medium" style={{ color: "var(--text-dim, #5f5a7a)" }}>
                          {sn.mode === "break" ? "Rest Break" : "Deep Study Block"}
                          {sb && ` · ${sb.name}`}
                        </p>
                      </div>
                      <div className="hidden sm:block w-32">
                        <div className="h-1.5 w-full overflow-hidden rounded-full bg-[var(--surface-2,#f4f2fc)]">
                          <div
                            className="h-full rounded-full bg-[var(--accent,#6366f1)]"
                            style={{ width: `${Math.min(100, (sn.minutes / maxSessionBar) * 100)}%` }}
                          />
                        </div>
                      </div>
                      <span className="mono text-right text-[13px] font-extrabold" style={{ color: "var(--accent, #6366f1)" }}>
                        {fmtMin(sn.minutes)}
                      </span>
                    </div>
                  );
                })
            )}
          </div>
        </Spot>
      </Reveal>
    </div>
  );
}
