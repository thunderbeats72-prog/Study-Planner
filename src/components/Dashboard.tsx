"use client";

import React, { useEffect, useMemo, useState } from "react";
import {
  api,
  addDays,
  dayDiff,
  prettyLong,
  today,
  normalizeCheckpointTitle,
  type AppState,
  type TaskRow,
} from "@/lib/client";
import { mmss } from "@/lib/useTimer";
import {
  IconCalendar,
  IconCheck,
  IconClock,
  IconFlame,
  IconLeaf,
  IconPlay,
  IconRocket,
  IconSpark,
  IconTarget,
  IconTrend,
  IconChart,
  IconBook,
  IconChevron,
} from "./icons";
import TaskEditor, { type TaskPatch } from "./TaskEditor";
import TaskCard from "./TaskCard";
import QuickAdd from "./QuickAdd";
import MiniCalendar from "./MiniCalendar";
import { LampScene } from "./Illustrations";
import { CountUp, Reveal, Spot } from "@/lib/fx";
import { PageHead, WeekBars } from "./bits";
import {
  prioritizeTasks,
  weakestSubjectIds,
  reasonLabel,
} from "@/lib/prioritization";
import {
  backlogFor,
  backlogToDate,
  canFitToday,
  dailyCapacityMinutes,
  pendingOnDate,
  spreadAcrossDays,
  suggestedRecovery,
  todayOverload,
} from "@/lib/recovery";
import type { QuickAddPayload } from "@/lib/quickAdd";
import { cn } from "@/lib/cn";

/* One line per day, deterministic from the date key so a refresh never
   reshuffles the card and two tabs on the same day always agree. `tag` is the
   verb the quote asks for; `who` credits it — an unattributed aphorism reads
   like filler. */
const QUOTES = [
  {
    text: "Small daily gains compound into unlikely outcomes.",
    tag: "Show up again",
    who: "James Clear",
  },
  {
    text: "You don't rise to your goals, you fall to your systems.",
    tag: "Trust the plan",
    who: "James Clear",
  },
  {
    text: "Focus is the art of saying no to a hundred good ideas.",
    tag: "One task at a time",
    who: "Steve Jobs",
  },
  {
    text: "The best time to start was yesterday. The next best is now.",
    tag: "Clock in",
    who: "Proverb",
  },
  {
    text: "Discipline today shapes the freedom of tomorrow.",
    tag: "Keep going",
    who: "Roy T. Bennett",
  },
  {
    text: "Progress, not perfection.",
    tag: "Stay present",
    who: "Ellen Langer",
  },
];

function dailyQuote(dateKey: string) {
  let hash = 0;
  for (let i = 0; i < dateKey.length; i++)
    hash = (hash * 31 + dateKey.charCodeAt(i)) >>> 0;
  return QUOTES[hash % QUOTES.length];
}

function isCheckpointTask(task: TaskRow): boolean {
  return (
    task.title.toLowerCase().includes("checkpoint") ||
    (task.kind === "mock" && !task.subjectId)
  );
}

export default function Dashboard({
  state,
  onTaskStatus,
  onTaskUpdate,
  onSkipSubject,
  onFocusTask,
  activeTaskId,
  activeClockSeconds,
  clockRunning,
  clockSessionActive,
  clockOnBreak,
  onClockOut,
  onPauseOrResume,
  replanning,
  onReplan,
  onStartFocus,
  onAddTask,
  onMoveTasks,
  onNavigate,
  onAskTutor,
}: {
  state: AppState;
  onTaskStatus: (id: number, status: string, rating?: number) => void;
  onTaskUpdate: (id: number, patch: TaskPatch) => void;
  onSkipSubject: (subjectId: number, date: string) => void;
  onFocusTask: (taskId: number) => void;
  activeTaskId?: number | null;
  activeClockSeconds?: number;
  clockRunning?: boolean;
  clockSessionActive?: boolean;
  clockOnBreak?: boolean;
  onClockOut: () => void;
  onPauseOrResume: () => void;
  replanning: boolean;
  onReplan: () => void;
  onStartFocus: () => void;
  onAddTask: (input: QuickAddPayload) => void;
  onMoveTasks: (moves: { id: number; date: string }[], message: string) => void;
  onNavigate?: (page: string) => void;
  onAskTutor?: (question: string) => void;
}) {
  const [editingTaskId, setEditingTaskId] = useState<number | null>(null);
  const [expandedTaskId, setExpandedTaskId] = useState<number | null>(null);
  const t = today();
  const ctx = state.context;
  const quote = dailyQuote(t);

  const todayTasks = useMemo(
    () => state.tasks.filter((x) => x.date === t),
    [state.tasks, t],
  );
  const doneToday = todayTasks.filter((x) => x.status === "done").length;
  const totalPlannedMin = todayTasks.reduce((a, x) => a + x.plannedMinutes, 0);
  const loggedTodayMin = state.sessions
    .filter((s) => s.date === t)
    .reduce((a, s) => a + s.minutes, 0);

  // Weekly study bars
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

  // Consistency (last 14 days active count)
  const consistency = useMemo(() => {
    const perDay = new Map<string, number>();
    for (const s of state.sessions)
      perDay.set(s.date, (perDay.get(s.date) || 0) + s.minutes);
    const days = new Set(
      [...perDay.entries()].filter(([, m]) => m >= 1).map(([d]) => d),
    );
    const span = Math.max(
      7,
      Math.min(30, dayDiff(state.settings.startDate, t) + 1),
    );
    let hit = 0;
    for (let i = 0; i < span; i++) if (days.has(addDays(t, -i))) hit++;
    return Math.round((hit / span) * 100);
  }, [state.sessions, state.settings.startDate, t]);

  // "What should I do now?" - priority ranking
  const capacity = dailyCapacityMinutes(state.settings);
  const backlog = useMemo(() => backlogFor(state.tasks, t), [state.tasks, t]);
  const ranked = useMemo(
    () =>
      prioritizeTasks(state.tasks, t, {
        weakSubjectIds: weakestSubjectIds(ctx.subjects),
        subjectWeights: Object.fromEntries(
          state.subjects.map((subject) => [subject.id, subject.weight]),
        ),
        remainingTodayMinutes: Math.max(
          0,
          capacity - pendingOnDate(state.tasks, t).minutes,
        ),
      }),
    [state.tasks, t, ctx.subjects, state.subjects, capacity],
  );
  const top = ranked[0] || null;
  const second = ranked[1] || null;
  const todayPendingMin = pendingOnDate(state.tasks, t).minutes;
  const overload = todayOverload(state.tasks, t, capacity);
  const canFit = canFitToday(state.tasks, t, capacity);
  const recoveryPace = suggestedRecovery(overload, Math.max(1, ctx.daysLeft));
  const spreadPlan = useMemo(
    () =>
      spreadAcrossDays(state.tasks, t, capacity, {
        lastDate: state.settings.examDate,
      }).assignments,
    [state.tasks, t, capacity, state.settings.examDate],
  );
  const moveToday = useMemo(
    () => backlogToDate(state.tasks, t, t),
    [state.tasks, t],
  );
  const moveTomorrow = useMemo(
    () => backlogToDate(state.tasks, t, addDays(t, 1)),
    [state.tasks, t],
  );

  const heroLive =
    !!clockSessionActive && top != null && activeTaskId === top.id;
  const topSubject = top
    ? state.subjects.find((sb) => sb.id === top.subjectId)
    : undefined;
  const topTitle = top
    ? isCheckpointTask(top)
      ? normalizeCheckpointTitle(top.title)
      : top.title
    : "";

  // Subject breakdown for today
  const perSubjectToday = useMemo(() => {
    return state.subjects.map((sb) => ({
      sb,
      done: todayTasks.filter(
        (tk) => tk.subjectId === sb.id && tk.status === "done",
      ).length,
      total: todayTasks.filter((tk) => tk.subjectId === sb.id).length,
    }));
  }, [state.subjects, todayTasks]);

  const busyDaysThisMonth = useMemo(() => {
    const now = new Date();
    const set = new Set<string>();
    for (const tk of state.tasks) {
      const d = new Date(tk.date);
      if (
        d.getFullYear() === now.getFullYear() &&
        d.getMonth() === now.getMonth()
      )
        set.add(tk.date);
    }
    return set.size;
  }, [state.tasks]);

  const taskLogged = (taskId: number) => {
    const sum = state.sessions
      .filter((x) => x.taskId === taskId)
      .reduce((a, x) => a + x.minutes, 0);
    return Math.round(sum * 100) / 100;
  };
  const fmtMin = (m: number) => {
    const r = Math.round(m * 10) / 10;
    return `${Number.isInteger(r) ? r : r.toFixed(1)}m`;
  };

  const stats = [
    {
      label: "Days Remaining",
      value: ctx.daysLeft,
      decimals: 0,
      suffix: "",
      sub: `Target: ${prettyLong(state.settings.examDate)}`,
      icon: <IconCalendar size={18} />,
      color: "var(--accent)",
    },
    {
      label: "Syllabus Progress",
      value: ctx.progressPct,
      decimals: 0,
      suffix: "%",
      sub: `${ctx.subjects.reduce((a, b) => a + b.done, 0)} of ${ctx.subjects.reduce((a, b) => a + b.total, 0)} lessons done`,
      icon: <IconTarget size={18} />,
      color: "var(--accent)",
      bar: ctx.progressPct,
    },
    {
      label: "Hours This Week",
      value: weekMin / 60,
      decimals: 1,
      suffix: "",
      sub: `Goal: ${state.settings.dailyHours * 7}h · ${fmtMin(loggedTodayMin)} today`,
      icon: <IconClock size={18} />,
      color: "var(--text-main)",
    },
    {
      label: "Consistency",
      value: consistency,
      decimals: 0,
      suffix: "%",
      sub: `${state.user.streak} day streak · ${backlog.count} overdue`,
      icon: <IconTrend size={18} />,
      color: "var(--good)",
    },
  ];

  return (
    <div className="page-stack fade-in">
      <PageHead
        eyebrow="DAILY OVERVIEW"
        title={`Hey ${state.user.name.split(" ")[0]}!`}
        sub={`${ctx.daysLeft} days to ${prettyLong(state.settings.examDate)} · ${state.user.courseName || state.user.course}`}
        art={<LampScene />}
      />

      {/* ── UP NEXT / HERO CARD ── */}
      {top ? (
        <Reveal>
          <Spot className="glass-panel tilt-card section-card dash-hero accent-edge">
            <div className="dash-hero-main">
              <div className="dash-hero-copy">
                <div className="dash-hero-tags">
                  <span className="hero-flag">
                    {top.priorityLabel} · {reasonLabel(top.reason)}
                  </span>
                  {heroLive && (
                    <span className="hero-flag is-live">
                      <span className="h-1.5 w-1.5 rounded-full bg-current pulse-dot" />
                      {clockRunning
                        ? "Clocking study time"
                        : clockOnBreak
                          ? "On break"
                          : "Session paused"}
                    </span>
                  )}
                </div>
                <h2 className="dash-hero-title">{topTitle}</h2>
                <div className="dash-hero-meta">
                  <span className="meta-item">
                    <IconClock size={14} /> {top.plannedMinutes} min
                  </span>
                  {topSubject && (
                    <span className="meta-item">
                      <span
                        className="meta-swatch"
                        style={{ background: topSubject.color }}
                      />
                      {topSubject.name}
                    </span>
                  )}
                  {taskLogged(top.id) > 0 && (
                    <span className="meta-item is-logged mono">
                      {fmtMin(taskLogged(top.id))} already logged
                    </span>
                  )}
                </div>
              </div>

              <div className="dash-hero-actions">
                {heroLive ? (
                  <>
                    <span
                      className="mono text-[length:var(--fs-stat)] font-extrabold mr-2"
                      style={{ color: "var(--accent)" }}
                    >
                      {mmss(activeClockSeconds ?? 0)}
                    </span>
                    {!clockOnBreak && (
                      <button
                        className="btn btn-secondary"
                        onClick={onPauseOrResume}
                      >
                        {clockRunning ? "Pause" : "Resume"}
                      </button>
                    )}
                    <button className="btn btn-danger" onClick={onClockOut}>
                      Clock Out
                    </button>
                  </>
                ) : (
                  <button
                    className="btn btn-primary"
                    onClick={() => onFocusTask(top.id)}
                  >
                    <IconPlay size={14} /> <span>Start focus</span>
                  </button>
                )}
              </div>
            </div>

            {second && !heroLive && (
              <div className="dash-hero-next">
                <span className="dash-hero-next-text">
                  <strong>Next up:</strong> {second.title} (
                  {second.plannedMinutes}m)
                </span>
                <button
                  type="button"
                  className="btn btn-xs btn-secondary"
                  onClick={() => onFocusTask(second.id)}
                  title={`Start a session on “${second.title}”`}
                >
                  <IconPlay size={12} /> <span>Start</span>
                </button>
              </div>
            )}
          </Spot>
        </Reveal>
      ) : (
        <Reveal>
          <Spot className="glass-panel tilt-card section-card dash-hero">
            <h2 className="dash-empty-title">
              All caught up, {state.user.name.split(" ")[0]}!
            </h2>
            <p className="dash-empty-sub">
              No pending tasks right now. Start an open focus session or add a
              new task anytime.
            </p>
            <div className="dash-empty-cta">
              <button className="btn btn-primary" onClick={onStartFocus}>
                <IconPlay size={15} /> <span>Start open focus</span>
              </button>
            </div>
          </Spot>
        </Reveal>
      )}

      {/* ── 4 KPI STAT CARDS — the `.kpi-*` contract owns the grid, so the
            2-up / 4-up behaviour and the value size come from the design
            system instead of four Tailwind breakpoint prefixes. ── */}
      <div className="kpi-grid">
        {stats.map((st, i) => (
          <Reveal key={st.label} delay={i * 60}>
            <Spot className="glass-panel tilt-card section-card kpi-card">
              <div className="kpi-top">
                <p className="kpi-label">{st.label}</p>
                <span className="kpi-icon">{st.icon}</span>
              </div>
              <p className="kpi-value mono" style={{ color: st.color }}>
                <CountUp
                  to={st.value}
                  decimals={st.decimals}
                  suffix={st.suffix}
                />
              </p>
              {st.bar !== undefined && (
                <div className="bar-track">
                  <div
                    className="bar-fill"
                    style={{ width: `${Math.max(0, Math.min(100, st.bar))}%` }}
                  />
                </div>
              )}
              <p className="kpi-sub">{st.sub}</p>
            </Spot>
          </Reveal>
        ))}
      </div>

      {/* ── OVERDUE BACKLOG RECOVERY STRIP ── */}
      {backlog.count > 0 && (
        <Reveal delay={40}>
          <div className="recovery-panel glass-panel section-card accent-edge accent-edge--warning">
            <div className="recovery-row">
              <div className="recovery-copy">
                <h3 className="section-title recovery-title">
                  {backlog.count === 1
                    ? "1 unfinished task"
                    : `${backlog.count} unfinished tasks`}{" "}
                  from earlier days
                </h3>
                <p className="recovery-note">
                  {overload > 0 && recoveryPace
                    ? `Suggested recovery: +${recoveryPace.minutesPerDay} min/day for ${recoveryPace.days} day${recoveryPace.days === 1 ? "" : "s"} keeps today realistic.`
                    : "They still fit today's plan without overloading you."}
                </p>
              </div>
              <div className="recovery-actions">
                <button
                  className="btn btn-xs btn-secondary"
                  type="button"
                  disabled={!canFit}
                  title={
                    canFit ? "Move into today's plan" : "Exceeds daily capacity"
                  }
                  aria-label="Move the unfinished tasks into today's plan"
                  onClick={() =>
                    onMoveTasks(
                      moveToday,
                      `Moved ${moveToday.length} task${moveToday.length === 1 ? "" : "s"} to today.`,
                    )
                  }
                >
                  Do today
                </button>
                <button
                  className="btn btn-xs btn-secondary"
                  type="button"
                  aria-label="Move the unfinished tasks to tomorrow"
                  onClick={() =>
                    onMoveTasks(
                      moveTomorrow,
                      `Moved ${moveTomorrow.length} task${moveTomorrow.length === 1 ? "" : "s"} to tomorrow.`,
                    )
                  }
                >
                  Move tomorrow
                </button>
                <button
                  className="btn btn-xs btn-primary"
                  type="button"
                  aria-label="Spread the unfinished tasks across the week"
                  onClick={() =>
                    onMoveTasks(
                      spreadPlan,
                      `Spread ${spreadPlan.length} task${spreadPlan.length === 1 ? "" : "s"} across the week.`,
                    )
                  }
                >
                  Spread weekly
                </button>
                <button
                  className="btn btn-xs btn-primary"
                  type="button"
                  onClick={onReplan}
                  disabled={replanning}
                  aria-busy={replanning}
                  title="Ask the planner to re-balance the whole schedule"
                >
                  {replanning ? "Re-planning…" : "AI re-plan"}
                </button>
              </div>
            </div>
          </div>
        </Reveal>
      )}

      {/* ── TWO-COLUMN SECTION: TODAY'S PLAN & WEEKLY VOLUME / CALENDAR ── */}
      <div className="dash-cols">
        <div className="page-stack">
          <Reveal delay={60}>
            <Spot className="glass-panel tilt-card section-card">
              <div className="card-head">
                <div>
                  <h3 className="card-title section-title">
                    <IconTarget size={17} /> Today&apos;s Plan
                  </h3>
                  <p className="card-sub">
                    {doneToday}/{todayTasks.length} done · {totalPlannedMin} min
                    planned
                  </p>
                </div>
                <div className="card-head-actions">
                  <QuickAdd state={state} onAdd={onAddTask} />
                  {onNavigate && (
                    <button
                      type="button"
                      className="btn btn-xs btn-secondary"
                      onClick={() => onNavigate("planner")}
                      title="Open the full planner"
                    >
                      View all
                    </button>
                  )}
                </div>
              </div>

              {!todayTasks.length && (
                <div className="empty-state">
                  <p>
                    Nothing planned for today — add a task or let AI re-plan.
                  </p>
                </div>
              )}

              {todayTasks.length > 0 && (
                <div className="plan-list">
                  {todayTasks.map((task) => {
                    const topic = state.topics.find((tp) => tp.id === task.topicId);
                    return (
                      <TaskCard
                        key={task.id}
                        task={task}
                        subject={state.subjects.find(
                          (sb) => sb.id === task.subjectId,
                        )}
                        topic={topic}
                        loggedMinutes={taskLogged(task.id)}
                        live={activeTaskId === task.id}
                        liveSeconds={activeClockSeconds}
                        liveRunning={clockRunning}
                        briefOpen={expandedTaskId === task.id}
                        onToggleBrief={
                          topic || task.detail
                            ? () =>
                                setExpandedTaskId(
                                  expandedTaskId === task.id ? null : task.id,
                                )
                            : undefined
                        }
                        activeTaskId={activeTaskId}
                        clockSessionActive={clockSessionActive}
                        clockRunning={clockRunning}
                        onPauseOrResume={onPauseOrResume}
                        onTaskStatus={onTaskStatus}
                        onFocusTask={onFocusTask}
                        onClockOut={onClockOut}
                        onEdit={setEditingTaskId}
                        onSkipSubject={onSkipSubject}
                        onAskTutor={onAskTutor}
                      />
                    );
                  })}
                </div>
              )}
            </Spot>
          </Reveal>

          <Reveal delay={100}>
            <Spot className="glass-panel tilt-card section-card">
              <div className="card-head">
                <div>
                  <h3 className="card-title section-title">
                    <IconChart size={17} /> Weekly volume
                  </h3>
                  <p className="card-sub">
                    {Math.round((weekMin / 60) * 10) / 10}h studied this week ·
                    goal {(dailyGoalMin * 7) / 60}h
                  </p>
                </div>
                {onNavigate && (
                  <button
                    type="button"
                    className="btn btn-xs btn-secondary"
                    onClick={() => onNavigate("analytics")}
                    title="Minutes, consistency and subject balance"
                  >
                    <span>Deep analytics</span> <IconChevron size={12} />
                  </button>
                )}
              </div>
              <WeekBars days={week} goal={dailyGoalMin} height={140} />
            </Spot>
          </Reveal>
        </div>

        {/* Right column: mastery · calendar glance · the daily line */}
        <div className="page-stack">
          <Reveal delay={80}>
            <Spot className="glass-panel tilt-card section-card">
              <div className="card-head card-head--tight">
                <h3 className="card-title section-title">
                  <IconBook size={17} /> Subject mastery
                </h3>
                {onNavigate && (
                  <button
                    type="button"
                    className="link-btn"
                    onClick={() => onNavigate("subjects")}
                  >
                    View all
                  </button>
                )}
              </div>
              <div className="subj-rows">
                {state.subjects.slice(0, 5).map((sb) => {
                  const topics = state.topics.filter(
                    (tp) => tp.subjectId === sb.id,
                  );
                  const done = topics.filter(
                    (tp) => tp.status === "done",
                  ).length;
                  const pct = topics.length
                    ? Math.round((done / topics.length) * 100)
                    : 0;
                  return (
                    <div key={sb.id} className="subj-row">
                      <div className="subj-row-top">
                        <span className="subj-name">{sb.name}</span>
                        <span
                          className="subj-count mono"
                          style={{ color: sb.color }}
                        >
                          {done}/{topics.length || sb.units} ({pct}%)
                        </span>
                      </div>
                      <div className="bar-track">
                        <div
                          className="bar-fill"
                          style={{ width: `${pct}%`, background: sb.color }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            </Spot>
          </Reveal>

          <Reveal delay={120}>
            <Spot className="glass-panel tilt-card section-card dash-cal-card">
              <div className="card-head card-head--tight">
                <h3 className="card-title section-title">Calendar glance</h3>
                <span className="card-sub">
                  {busyDaysThisMonth} active days
                </span>
              </div>
              <MiniCalendar state={state} />
            </Spot>
          </Reveal>

          <Reveal delay={160}>
            <figure className="glass-panel tilt-card section-card dash-quote-card">
              <span className="quote-mark" aria-hidden="true">
                “
              </span>
              <blockquote className="quote-text">{quote.text}</blockquote>
              <figcaption className="quote-by">
                <span className="quote-verb">
                  <IconLeaf size={13} /> {quote.tag}
                </span>
                <span className="quote-who">— {quote.who}</span>
              </figcaption>
              <span className="quote-halo" aria-hidden="true" />
            </figure>
          </Reveal>
        </div>
      </div>

      {editingTaskId !== null && (
        <TaskEditor
          task={state.tasks.find((t) => t.id === editingTaskId) || null}
          state={state}
          onClose={() => setEditingTaskId(null)}
          onSave={onTaskUpdate}
          onSkipSubject={onSkipSubject}
        />
      )}
    </div>
  );
}
