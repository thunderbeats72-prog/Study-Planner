"use client";

import React, { useEffect, useMemo, useState } from "react";
import {
  api,
  addDays,
  dayDiff,
  fmtDate,
  prettyDate,
  prettyLong,
  today,
  type AppState,
} from "@/lib/client";
import { CountUp, Marquee, Reveal, Spot } from "@/lib/fx";
import {
  IconBook,
  IconCalendar,
  IconChart,
  IconCheck,
  IconClock,
  IconFlame,
  IconLeaf,
  IconSpark,
  IconTarget,
  IconTrend,
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
    pace: {
      global: number;
      samples: number;
      bySubject: { id: number; name: string; color: string; pace: number }[];
    } | null;
    weekdays: number[] | null;
    peakHour: number | null;
    tomorrowRisk: number;
    readiness: {
      onTrack: boolean;
      loadPct: number;
      likelyDays: number;
      optimisticDays: number;
      pessimisticDays: number;
      samples: number;
      effectiveDailyMinutes?: number;
    };
    effectiveDailyMinutes?: {
      minutes: number;
      activeDays: number;
      samples: number;
    };
    memory: { strong: number; fading: number; atRisk: number; tracked: number };
  } | null>(null);
  const [insights, setInsights] = useState<string>("");
  const [loadingIns, setLoadingIns] = useState(true);

  const t = today();
  const ctx = state.context;

  useEffect(() => {
    let cancelled = false;
    api<typeof intel>("/api/analytics")
      .then((data) => {
        if (!cancelled) setIntel(data);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [state.sessions.length, state.tasks.length]);

  useEffect(() => {
    let cancelled = false;
    api<{ insights: string }>("/api/insights")
      .then((data) => {
        if (!cancelled) setInsights(data.insights);
      })
      .catch(() => {
        if (!cancelled) setInsights("");
      })
      .finally(() => {
        if (!cancelled) setLoadingIns(false);
      });
    return () => {
      cancelled = true;
    };
  }, [state.tasks.length]);

  const totalMin = useMemo(
    () => state.sessions.reduce((a, b) => a + b.minutes, 0),
    [state.sessions],
  );
  const doneTasks = useMemo(
    () => state.tasks.filter((x) => x.status === "done").length,
    [state.tasks],
  );
  const overdueTasks = useMemo(
    () =>
      state.tasks.filter((x) => x.status === "pending" && x.date < t).length,
    [state.tasks, t],
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
        label: new Date(d)
          .toLocaleDateString(undefined, { weekday: "short" })
          .slice(0, 3),
        minutes: mins,
      });
    }
    return arr;
  }, [state.sessions, t]);

  const weekMin = useMemo(
    () => week.reduce((a, b) => a + b.minutes, 0),
    [week],
  );
  const dailyGoalMin = (state.settings.dailyHours || 2) * 60;

  // Subject completion stats
  const subjectStats = useMemo(() => {
    return state.subjects.map((sb) => {
      const topics = state.topics.filter((tp) => tp.subjectId === sb.id);
      const doneTopics = topics.filter((tp) => tp.status === "done").length;
      const tasks = state.tasks.filter((tk) => tk.subjectId === sb.id);
      const doneTasks = tasks.filter((tk) => tk.status === "done").length;
      const pendingMins = tasks
        .filter((tk) => tk.status === "pending")
        .reduce((a, b) => a + b.plannedMinutes, 0);
      const loggedMins = state.sessions
        .filter((sn) => sn.subjectId === sb.id)
        .reduce((a, b) => a + b.minutes, 0);
      const pct = topics.length
        ? Math.round((doneTopics / topics.length) * 100)
        : 0;
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
    const avgLen = focusSessions.length
      ? Math.round(totalMin / focusSessions.length)
      : 0;
    const breakMin = breakSessions.reduce((a, b) => a + b.minutes, 0);
    const focusMin = totalMin;
    const ratio =
      totalMin + breakMin > 0
        ? Math.round((focusMin / (totalMin + breakMin)) * 100)
        : 100;

    const weekdayNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
    let bestDay = "Flexible";
    if (intel?.weekdays && intel.weekdays.length === 7) {
      const maxIdx = intel.weekdays.indexOf(Math.max(...intel.weekdays));
      if (maxIdx >= 0 && intel.weekdays[maxIdx] > 0)
        bestDay = weekdayNames[maxIdx];
    }

    let peakHourStr = "Morning";
    if (intel?.peakHour != null) {
      const h = intel.peakHour;
      peakHourStr =
        h === 0
          ? "12 AM"
          : h < 12
            ? `${h} AM`
            : h === 12
              ? "12 PM"
              : `${h - 12} PM`;
    }

    return {
      avgLen,
      ratio,
      bestDay,
      peakHourStr,
      totalSessions: state.sessions.length,
    };
  }, [state.sessions, totalMin, intel]);

  // Ticker — a clean single-row pill strip: icon + label + aligned value.
  // Every value sits in the same tabular mono face so the strip reads like
  // one instrument panel instead of a wall of uppercase text.
  const tickerItems = useMemo(() => {
    const items: {
      icon: React.ReactNode;
      label: string;
      value: string;
      tone?: string;
    }[] = [
      {
        icon: <IconFlame size={13} />,
        label: "Streak",
        value: `${state.user.streak}d`,
      },
      {
        icon: <IconClock size={13} />,
        label: "This week",
        value: `${Math.round((weekMin / 60) * 10) / 10}h`,
        tone: "is-accent",
      },
      {
        icon: <IconChart size={13} />,
        label: "Total logged",
        value: `${Math.round(totalMin / 60)}h`,
      },
      {
        icon: <IconCheck size={13} />,
        label: "Tasks done",
        value: String(doneTasks),
        tone: "is-good",
      },
      {
        icon: <IconTarget size={13} />,
        label: "Backlog",
        value: String(overdueTasks),
        tone: overdueTasks > 0 ? "is-warn" : "is-good",
      },
      {
        icon: <IconSpark size={13} />,
        label: "Consistency",
        value: `${consistency}%`,
        tone: consistency >= 70 ? "is-good" : "is-accent",
      },
    ];
    for (const sb of subjectStats) {
      items.push({
        icon: <IconBook size={13} />,
        label: sb.name,
        value: `${sb.doneTopics}/${sb.totalTopics || sb.units}`,
      });
    }
    return items;
  }, [
    state.user.streak,
    weekMin,
    totalMin,
    doneTasks,
    overdueTasks,
    consistency,
    subjectStats,
  ]);

  const fmtMin = (m: number) => {
    const r = Math.round(m * 10) / 10;
    return `${Number.isInteger(r) ? r : r.toFixed(1)}m`;
  };

  return (
    <div className="page-stack fade-in">
      <PageHead
        eyebrow="ANALYTICS DASHBOARD"
        title="Where the hours went"
        sub="Deep data, consistency trends, subject mastery, and focus metrics — all mapped from your study sessions."
      />

      {/* Ticker — single-row pill badge strip */}
      <Reveal>
        <div className="glass-panel tilt-card overflow-hidden py-3 px-2">
          <Marquee speed={36}>
            {tickerItems.map((item, i) => (
              <span key={i} className="tick-pill">
                <span className="tick-pill-icon">{item.icon}</span>
                <span className="tick-pill-label">{item.label}</span>
                <span className={cn("tick-pill-value", item.tone)}>
                  {item.value}
                </span>
              </span>
            ))}
          </Marquee>
        </div>
      </Reveal>

      {/* Top row: Weekly Volume + Consistency Ring */}
      <div className="split-2 split-2--wide">
        <Reveal>
          <Spot className="glass-panel tilt-card section-card ana-card">
            <div className="card-head">
              <div>
                <h3 className="card-title section-title">
                  <IconChart size={17} /> Weekly Study Volume
                </h3>
                <p className="card-sub">
                  Daily minutes vs your target goal ({state.settings.dailyHours}
                  h/day)
                </p>
              </div>
              <span className="cycle-chip mono">
                <CountUp to={weekMin / 60} decimals={1} /> h this week
              </span>
            </div>
            <WeekBars days={week} goal={dailyGoalMin} height={170} />
          </Spot>
        </Reveal>

        <Reveal delay={60}>
          <Spot className="glass-panel tilt-card section-card ana-ring-card">
            <div className="card-head card-head--tight">
              <h3 className="card-title section-title">Consistency Ring</h3>
              <span className="cycle-chip mono">14-Day Window</span>
            </div>
            <div className="ring-figure">
              <svg
                viewBox="0 0 80 80"
                className="ring-svg ana-ring"
                aria-hidden="true"
              >
                <circle
                  className="ring-track"
                  cx="40"
                  cy="40"
                  r="34"
                  fill="none"
                  stroke="var(--track)"
                  strokeWidth="7"
                />
                <circle
                  cx="40"
                  cy="40"
                  r="34"
                  fill="none"
                  stroke="var(--accent)"
                  strokeWidth="7"
                  strokeLinecap="round"
                  strokeDasharray={ringCircumference}
                  strokeDashoffset={
                    ringCircumference - (ringCircumference * consistency) / 100
                  }
                  style={{
                    transition:
                      "stroke-dashoffset 1.2s cubic-bezier(.22,1,.36,1)",
                  }}
                />
              </svg>
              <div className="absolute text-center">
                <span className="ring-digits mono">
                  <CountUp to={consistency} suffix="%" />
                </span>
                <span className="ring-state">Active</span>
              </div>
            </div>
            <p className="timer-note">
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
      <div className="split-2 split-2--even">
        {/* Subject Mastery Progress */}
        <Reveal delay={100}>
          <Spot className="glass-panel tilt-card section-card ana-card">
            <div className="card-head card-head--tight">
              <h3 className="card-title section-title">
                <IconBook size={17} /> Subject Mastery &amp; Progress
              </h3>
              <span className="cycle-chip mono">
                {subjectStats.length} subjects
              </span>
            </div>
            <div className="subj-rows">
              {subjectStats.map((sb) => (
                <div key={sb.id} className="subj-row">
                  <div className="subj-row-top">
                    <span className="subj-name">{sb.name}</span>
                    <span
                      className="subj-count mono"
                      style={{ color: sb.color }}
                    >
                      {sb.doneTopics}/{sb.totalTopics || sb.units} lessons (
                      {sb.pct}%)
                    </span>
                  </div>
                  <div className="bar-track">
                    <div
                      className="bar-fill"
                      style={{ width: `${sb.pct}%`, background: sb.color }}
                    />
                  </div>
                  <div className="subj-foot">
                    <span>
                      {Math.round((sb.loggedMins / 60) * 10) / 10}h logged
                    </span>
                    <span>{sb.pendingMins}m pending</span>
                  </div>
                </div>
              ))}
            </div>
          </Spot>
        </Reveal>

        {/* Productivity & Focus Patterns */}
        <Reveal delay={120}>
          <Spot className="glass-panel tilt-card section-card ana-card">
            <div className="card-head card-head--tight">
              <h3 className="card-title section-title">
                <IconTrend size={17} /> Productivity Patterns
              </h3>
              <span className="chip chip-kind">Live AI telemetry</span>
            </div>
            <div className="inset-panel-row">
              <div className="inset-panel">
                <span className="inset-label">Peak Focus Hour</span>
                <p
                  className="inset-value mono"
                  style={{ color: "var(--accent)" }}
                >
                  {productivity.peakHourStr}
                </p>
                <p className="inset-note">Most study time logged</p>
              </div>

              <div className="inset-panel">
                <span className="inset-label">Best Study Day</span>
                <p
                  className="inset-value mono"
                  style={{ color: "var(--good)" }}
                >
                  {productivity.bestDay}
                </p>
                <p className="inset-note">Highest completion rate</p>
              </div>

              <div className="inset-panel">
                <span className="inset-label">Avg Session Block</span>
                <p className="inset-value mono">{productivity.avgLen} min</p>
                <p className="inset-note">Protected deep work</p>
              </div>

              <div className="inset-panel">
                <span className="inset-label">Focus vs Break</span>
                <p
                  className="inset-value mono"
                  style={{ color: "var(--accent)" }}
                >
                  {productivity.ratio}%
                </p>
                <p className="inset-note">Active on-the-clock ratio</p>
              </div>
            </div>

            {/* Memory health snapshot if available */}
            {intel?.memory && (
              <div className="inset-panel">
                <div className="stack-head">
                  <span className="stack-title">
                    Spaced Recall &amp; Memory Health
                  </span>
                  <span className="stack-count mono">
                    {intel.memory.tracked} lessons tracked
                  </span>
                </div>
                <div className="stack-bar">
                  <div
                    title={`${intel.memory.strong} strong`}
                    className="stack-seg is-good"
                    style={{
                      width: `${(intel.memory.strong / Math.max(1, intel.memory.tracked)) * 100}%`,
                    }}
                  />
                  <div
                    title={`${intel.memory.fading} fading`}
                    className="stack-seg is-warn"
                    style={{
                      width: `${(intel.memory.fading / Math.max(1, intel.memory.tracked)) * 100}%`,
                    }}
                  />
                  <div
                    title={`${intel.memory.atRisk} at risk`}
                    className="stack-seg is-bad"
                    style={{
                      width: `${(intel.memory.atRisk / Math.max(1, intel.memory.tracked)) * 100}%`,
                    }}
                  />
                </div>
                <div className="stack-legend">
                  <span className="stack-key">
                    <span className="stack-key-dot is-good" />{" "}
                    {intel.memory.strong} strong
                  </span>
                  <span className="stack-key">
                    <span className="stack-key-dot is-warn" />{" "}
                    {intel.memory.fading} fading
                  </span>
                  <span className="stack-key">
                    <span className="stack-key-dot is-bad" />{" "}
                    {intel.memory.atRisk} at risk
                  </span>
                </div>
              </div>
            )}
          </Spot>
        </Reveal>
      </div>

      {/* Recent Study Session Log */}
      <Reveal delay={140}>
        <Spot className="glass-panel tilt-card section-card overflow-hidden">
          <div className="card-head log-head">
            <div>
              <h3 className="card-title section-title">
                <IconClock size={17} /> Recent Study Sessions Log
              </h3>
              <p className="card-sub">
                Recorded study events and real clocked minutes
              </p>
            </div>
            <span className="cycle-chip mono">
              {state.sessions.length} sessions total
            </span>
          </div>

          <div className="log-list">
            {state.sessions.length === 0 ? (
              <p className="log-empty">
                No study sessions logged yet. Clock into a task to start
                recording!
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
                    <div key={sn.id || idx} className="log-row">
                      <span className="log-date mono">
                        {prettyDate(sn.date)}
                      </span>
                      <div className="log-body">
                        <p className="log-title">
                          {tk ? tk.title : sb ? sb.name : "Open Focus Session"}
                        </p>
                        <p className="log-sub">
                          {sn.mode === "break"
                            ? "Rest Break"
                            : "Deep Study Block"}
                          {sb && ` · ${sb.name}`}
                        </p>
                      </div>
                      <div className="log-bar">
                        <div className="bar-track">
                          <div
                            className="bar-fill"
                            style={{
                              width: `${Math.min(100, (sn.minutes / maxSessionBar) * 100)}%`,
                            }}
                          />
                        </div>
                      </div>
                      <span className="log-min mono">{fmtMin(sn.minutes)}</span>
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
