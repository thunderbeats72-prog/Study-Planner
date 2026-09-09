"use client";

import React, { useEffect, useMemo, useState } from "react";
import {
  api, addDays, dayDiff, prettyLong, today, KIND_META,
  normalizeCheckpointTitle, type AppState, type TaskRow,
} from "@/lib/client";
import { mmss } from "@/lib/useTimer";
import {
  IconCalendar, IconCheck, IconClock, IconFlame, IconLeaf, IconPlay,
  IconRocket, IconSpark, IconTarget, IconTrend, IconChart, IconBook, IconChevron,
} from "./icons";
import TaskEditor, { type TaskPatch } from "./TaskEditor";
import TaskActions from "./TaskActions";
import { TaskLiveBadge } from "./TaskClockButton";
import QuickAdd from "./QuickAdd";
import MiniCalendar from "./MiniCalendar";
import { LampScene } from "./Illustrations";
import { CountUp, Reveal, Spot } from "@/lib/fx";
import { PageHead, WeekBars } from "./bits";
import { prioritizeTasks, weakestSubjectIds, reasonLabel } from "@/lib/prioritization";
import {
  backlogFor, backlogToDate, canFitToday, dailyCapacityMinutes, pendingOnDate,
  spreadAcrossDays, suggestedRecovery, todayOverload,
} from "@/lib/recovery";
import type { QuickAddPayload } from "@/lib/quickAdd";
import { cn } from "@/lib/cn";

const QUOTES = [
  { text: "Small daily gains compound into unlikely outcomes.", tag: "Show up again" },
  { text: "You don't rise to your goals, you fall to your systems.", tag: "Trust the plan" },
  { text: "Focus is the art of saying no to a hundred good ideas.", tag: "One task at a time" },
  { text: "The best time to start was yesterday. The next best is now.", tag: "Clock in" },
  { text: "Discipline today shapes the freedom of tomorrow.", tag: "Keep going" },
  { text: "Progress, not perfection.", tag: "Stay present" },
];

function dailyQuote(dateKey: string) {
  let hash = 0;
  for (let i = 0; i < dateKey.length; i++) hash = (hash * 31 + dateKey.charCodeAt(i)) >>> 0;
  return QUOTES[hash % QUOTES.length];
}

function isCheckpointTask(task: TaskRow): boolean {
  return task.title.toLowerCase().includes("checkpoint") || (task.kind === "mock" && !task.subjectId);
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
}) {
  const [editingTaskId, setEditingTaskId] = useState<number | null>(null);
  const t = today();
  const ctx = state.context;
  const quote = dailyQuote(t);

  const todayTasks = useMemo(() => state.tasks.filter((x) => x.date === t), [state.tasks, t]);
  const doneToday = todayTasks.filter((x) => x.status === "done").length;
  const totalPlannedMin = todayTasks.reduce((a, x) => a + x.plannedMinutes, 0);
  const loggedTodayMin = state.sessions.filter((s) => s.date === t).reduce((a, s) => a + s.minutes, 0);

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
        label: new Date(d).toLocaleDateString(undefined, { weekday: "short" }).slice(0, 3),
        minutes: mins,
      });
    }
    return arr;
  }, [state.sessions, t]);

  const weekMin = useMemo(() => week.reduce((a, b) => a + b.minutes, 0), [week]);
  const dailyGoalMin = (state.settings.dailyHours || 2) * 60;

  // Consistency (last 14 days active count)
  const consistency = useMemo(() => {
    const perDay = new Map<string, number>();
    for (const s of state.sessions) perDay.set(s.date, (perDay.get(s.date) || 0) + s.minutes);
    const days = new Set([...perDay.entries()].filter(([, m]) => m >= 1).map(([d]) => d));
    const span = Math.max(7, Math.min(30, dayDiff(state.settings.startDate, t) + 1));
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
        subjectWeights: Object.fromEntries(state.subjects.map((subject) => [subject.id, subject.weight])),
        remainingTodayMinutes: Math.max(0, capacity - pendingOnDate(state.tasks, t).minutes),
      }),
    [state.tasks, t, ctx.subjects, state.subjects, capacity]
  );
  const top = ranked[0] || null;
  const second = ranked[1] || null;
  const todayPendingMin = pendingOnDate(state.tasks, t).minutes;
  const overload = todayOverload(state.tasks, t, capacity);
  const canFit = canFitToday(state.tasks, t, capacity);
  const recoveryPace = suggestedRecovery(overload, Math.max(1, ctx.daysLeft));
  const spreadPlan = useMemo(
    () => spreadAcrossDays(state.tasks, t, capacity, { lastDate: state.settings.examDate }).assignments,
    [state.tasks, t, capacity, state.settings.examDate]
  );
  const moveToday = useMemo(() => backlogToDate(state.tasks, t, t), [state.tasks, t]);
  const moveTomorrow = useMemo(() => backlogToDate(state.tasks, t, addDays(t, 1)), [state.tasks, t]);

  const heroLive = !!clockSessionActive && top != null && activeTaskId === top.id;
  const topTitle = top ? (isCheckpointTask(top) ? normalizeCheckpointTitle(top.title) : top.title) : "";

  // Subject breakdown for today
  const perSubjectToday = useMemo(() => {
    return state.subjects.map((sb) => ({
      sb,
      done: todayTasks.filter((tk) => tk.subjectId === sb.id && tk.status === "done").length,
      total: todayTasks.filter((tk) => tk.subjectId === sb.id).length,
    }));
  }, [state.subjects, todayTasks]);

  const taskLogged = (taskId: number) => {
    const sum = state.sessions.filter((x) => x.taskId === taskId).reduce((a, x) => a + x.minutes, 0);
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
      color: "var(--accent, #6366f1)",
    },
    {
      label: "Syllabus Progress",
      value: ctx.progressPct,
      decimals: 0,
      suffix: "%",
      sub: `${ctx.subjects.reduce((a, b) => a + b.done, 0)} of ${ctx.subjects.reduce((a, b) => a + b.total, 0)} lessons done`,
      icon: <IconTarget size={18} />,
      color: "var(--accent, #6366f1)",
      bar: ctx.progressPct,
    },
    {
      label: "Hours This Week",
      value: weekMin / 60,
      decimals: 1,
      suffix: "",
      sub: `Goal: ${state.settings.dailyHours * 7}h · ${fmtMin(loggedTodayMin)} today`,
      icon: <IconClock size={18} />,
      color: "var(--text-main, #211a3a)",
    },
    {
      label: "Consistency",
      value: consistency,
      decimals: 0,
      suffix: "%",
      sub: `${state.user.streak} day streak · ${backlog.count} overdue`,
      icon: <IconTrend size={18} />,
      color: "var(--success-accent, #2e9e6d)",
    },
  ];

  return (
    <div className="space-y-6 fade-in">
      <PageHead
        eyebrow="DAILY OVERVIEW"
        title={`Hey ${state.user.name.split(" ")[0]}!`}
        sub={`${ctx.daysLeft} days to ${prettyLong(state.settings.examDate)} · ${state.user.courseName || state.user.course}`}
        art={<LampScene />}
      />

      {/* ── UP NEXT / HERO CARD ── */}
      {top ? (
        <Reveal>
          <Spot className="glass-panel tilt-card section-card p-5 sm:p-6 accent-edge">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div className="min-w-0 flex-1 basis-64">
                <div className="flex flex-wrap items-center gap-2 mb-2">
                  <span className="mono text-[11px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-md bg-[color-mix(in_oklab,var(--accent,#6366f1)_16%,transparent)] text-[var(--accent,#6366f1)]">
                    {top.priorityLabel} · {reasonLabel(top.reason)}
                  </span>
                  {heroLive && (
                    <span className="mono text-[11px] font-bold px-2 py-0.5 rounded-md bg-[color-mix(in_oklab,var(--success-accent,#2e9e6d)_16%,transparent)] text-[var(--success-accent,#2e9e6d)] flex items-center gap-1.5">
                      <span className="h-1.5 w-1.5 rounded-full bg-current pulse-dot" />
                      {clockRunning ? "Clocking study time" : clockOnBreak ? "On break" : "Session paused"}
                    </span>
                  )}
                </div>
                <h2 className="truncate text-[20px] font-extrabold tracking-tight sm:text-[23px]" style={{ color: "var(--text-main, #211a3a)" }}>
                  {topTitle}
                </h2>
                <div className="mt-2 flex flex-wrap items-center gap-3 text-[12.5px] font-semibold" style={{ color: "var(--text-dim, #5f5a7a)" }}>
                  <span className="flex items-center gap-1.5">
                    <IconClock size={14} /> {top.plannedMinutes} min
                  </span>
                  {state.subjects.find((s) => s.id === top.subjectId) && (
                    <span className="flex items-center gap-1.5">
                      <span
                        className="h-2 w-2 rounded-full"
                        style={{ background: state.subjects.find((s) => s.id === top.subjectId)?.color }}
                      />
                      {state.subjects.find((s) => s.id === top.subjectId)?.name}
                    </span>
                  )}
                  {taskLogged(top.id) > 0 && (
                    <span className="mono text-[var(--success-accent,#2e9e6d)] font-bold">
                      {fmtMin(taskLogged(top.id))} already logged
                    </span>
                  )}
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2.5">
                {heroLive ? (
                  <>
                    <span className="mono text-[22px] font-extrabold mr-2" style={{ color: "var(--accent, #6366f1)" }}>
                      {mmss(activeClockSeconds ?? 0)}
                    </span>
                    {!clockOnBreak && (
                      <button className="btn btn-secondary" onClick={onPauseOrResume}>
                        {clockRunning ? "Pause" : "Resume"}
                      </button>
                    )}
                    <button className="btn btn-danger" onClick={onClockOut}>
                      Clock Out
                    </button>
                  </>
                ) : (
                  <button className="btn btn-primary" onClick={() => onFocusTask(top.id)}>
                    <IconPlay size={14} /> Start Focus
                  </button>
                )}
              </div>
            </div>

            {/* Second up next pill */}
            {second && !heroLive && (
              <div className="mt-4 flex items-center justify-between border-t border-[var(--border-subtle,#e4e0f1)] pt-3 text-[12.5px]">
                <span className="truncate text-[var(--text-dim,#5f5a7a)] font-medium">
                  <strong>Next up:</strong> {second.title} ({second.plannedMinutes}m)
                </span>
                <button
                  type="button"
                  className="btn btn-xs btn-secondary shrink-0"
                  onClick={() => onFocusTask(second.id)}
                >
                  Start
                </button>
              </div>
            )}
          </Spot>
        </Reveal>
      ) : (
        <Reveal>
          <Spot className="glass-panel tilt-card section-card p-6">
            <h2 className="text-[22px] font-extrabold" style={{ color: "var(--text-main, #211a3a)" }}>
              All caught up, {state.user.name.split(" ")[0]}! 🎉
            </h2>
            <p className="mt-1 text-[14px] font-medium" style={{ color: "var(--text-dim, #5f5a7a)" }}>
              No pending tasks right now. Start an open focus session or add a new task anytime.
            </p>
            <div className="mt-4">
              <button className="btn btn-primary" onClick={onStartFocus}>
                <IconPlay size={15} /> Start Open Focus
              </button>
            </div>
          </Spot>
        </Reveal>
      )}

      {/* ── 4 KPI STAT CARDS ── */}
      <div className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
        {stats.map((st, i) => (
          <Reveal key={st.label} delay={i * 60}>
            <Spot className="glass-panel tilt-card section-card flex h-full flex-col justify-between p-4 sm:p-5">
              <div>
                <div className="flex items-start justify-between gap-2">
                  <p className="text-[12px] font-extrabold uppercase tracking-wider" style={{ color: "var(--text-dim, #5f5a7a)" }}>
                    {st.label}
                  </p>
                  <span className="grid h-8 w-8 shrink-0 place-items-center rounded-xl bg-[color-mix(in_oklab,var(--accent,#6366f1)_14%,transparent)] text-[var(--accent,#6366f1)]">
                    {st.icon}
                  </span>
                </div>
                <p className="mono mt-1 text-[26px] font-extrabold leading-tight tracking-tight sm:text-[30px]" style={{ color: st.color }}>
                  <CountUp to={st.value} decimals={st.decimals} suffix={st.suffix} />
                </p>
                {st.bar !== undefined && (
                  <div className="mt-2.5 h-1.5 w-full overflow-hidden rounded-full bg-[var(--surface-2,#f4f2fc)]">
                    <div
                      className="h-full rounded-full transition-all duration-1000"
                      style={{
                        width: `${st.bar}%`,
                        background: "linear-gradient(to right, var(--accent, #6366f1), var(--accent2, #8b7cf6))",
                      }}
                    />
                  </div>
                )}
              </div>
              <p className="mt-2 text-[11.5px] font-semibold" style={{ color: "var(--text-dim, #5f5a7a)" }}>
                {st.sub}
              </p>
            </Spot>
          </Reveal>
        ))}
      </div>

      {/* ── OVERDUE BACKLOG RECOVERY STRIP ── */}
      {backlog.count > 0 && (
        <Reveal delay={40}>
          <div className="glass-panel recovery-panel accent-edge accent-edge--warning p-4 sm:p-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h3 className="section-title text-[15px] font-extrabold" style={{ color: "var(--text-main, #211a3a)" }}>
                  {backlog.count === 1 ? "1 unfinished task" : `${backlog.count} unfinished tasks`} from earlier days
                </h3>
                <p className="text-[13px] font-medium" style={{ color: "var(--text-dim, #5f5a7a)" }}>
                  {overload > 0 && recoveryPace
                    ? `Suggested recovery: +${recoveryPace.minutesPerDay} min/day for ${recoveryPace.days} day${recoveryPace.days === 1 ? "" : "s"} keeps today realistic.`
                    : "They still fit today's plan without overloading you."}
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <button
                  className="btn btn-xs btn-secondary"
                  type="button"
                  disabled={!canFit}
                  title={canFit ? "Move into today's plan" : "Exceeds daily capacity"}
                  onClick={() => onMoveTasks(moveToday, `Moved ${moveToday.length} task${moveToday.length === 1 ? "" : "s"} to today.`)}
                >
                  Do today
                </button>
                <button
                  className="btn btn-xs btn-secondary"
                  type="button"
                  onClick={() => onMoveTasks(moveTomorrow, `Moved ${moveTomorrow.length} task${moveTomorrow.length === 1 ? "" : "s"} to tomorrow.`)}
                >
                  Move tomorrow
                </button>
                <button
                  className="btn btn-xs btn-primary"
                  type="button"
                  onClick={() => onMoveTasks(spreadPlan, `Spread ${spreadPlan.length} task${spreadPlan.length === 1 ? "" : "s"} across the week.`)}
                >
                  Spread weekly
                </button>
                <button className="btn btn-xs btn-primary" type="button" onClick={onReplan} disabled={replanning}>
                  {replanning ? "Re-planning…" : "AI Re-plan"}
                </button>
              </div>
            </div>
          </div>
        </Reveal>
      )}

      {/* ── TWO-COLUMN SECTION: TODAY'S PLAN & WEEKLY VOLUME / CALENDAR ── */}
      <div className="grid gap-4 xl:grid-cols-[1.6fr_1fr]">
        {/* Left Column: Today's Plan */}
        <div className="space-y-4">
          <Reveal delay={60}>
            <Spot className="glass-panel tilt-card section-card p-5 sm:p-6">
              <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h3 className="flex items-center gap-2 text-[16px] font-extrabold tracking-tight" style={{ color: "var(--text-main, #211a3a)" }}>
                    <IconTarget size={17} /> Today&apos;s Plan
                  </h3>
                  <p className="mt-0.5 text-[12px] font-semibold" style={{ color: "var(--text-dim, #5f5a7a)" }}>
                    {doneToday}/{todayTasks.length} done · {totalPlannedMin} min planned
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <QuickAdd state={state} onAdd={onAddTask} />
                  {onNavigate && (
                    <button
                      type="button"
                      className="btn btn-xs btn-secondary"
                      onClick={() => onNavigate("planner")}
                    >
                      View All
                    </button>
                  )}
                </div>
              </div>

              {!todayTasks.length && (
                <div className="empty-state py-8 text-center">
                  <p className="text-[13.5px] font-semibold" style={{ color: "var(--text-dim, #5f5a7a)" }}>
                    Nothing planned for today — add a task or let AI re-plan.
                  </p>
                </div>
              )}

              {todayTasks.length > 0 && (
                <div className="divide-y divide-[var(--border-subtle,#e4e0f1)]">
                  {todayTasks.map((task) => {
                    const meta = KIND_META[task.kind] || KIND_META.learn;
                    const subj = state.subjects.find((s) => s.id === task.subjectId);
                    const isCheckpoint = isCheckpointTask(task);
                    const kindLabel = isCheckpoint ? "Checkpoint" : meta.label;
                    const dotColor = subj?.color || (isCheckpoint ? "var(--color-primary)" : meta.color);
                    const formattedTitle = isCheckpoint ? normalizeCheckpointTitle(task.title) : task.title;
                    const isDone = task.status === "done";
                    return (
                      <div
                        key={task.id}
                        className={cn(
                          "flex flex-wrap items-center gap-3 py-3 transition-colors",
                          activeTaskId === task.id && "bg-[color-mix(in_oklab,var(--accent,#6366f1)_8%,transparent)] rounded-xl px-2.5"
                        )}
                      >
                        <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: dotColor }} />
                        <div className="min-w-0 flex-1 basis-48">
                          <p className={cn("truncate text-[13.5px] font-bold", isDone && "line-through opacity-50")} style={{ color: "var(--text-main, #211a3a)" }}>
                            {formattedTitle}
                          </p>
                          <p className="mt-0.5 text-[11px] font-semibold" style={{ color: "var(--text-dim, #5f5a7a)" }}>
                            <span className="chip chip-kind chip-tight mr-1.5">{kindLabel}</span>
                            {task.plannedMinutes} min
                            {subj && ` · ${subj.name}`}
                            {taskLogged(task.id) > 0 && ` · ${fmtMin(taskLogged(task.id))} logged`}
                            {activeTaskId === task.id && <TaskLiveBadge seconds={activeClockSeconds} running={clockRunning} />}
                          </p>
                        </div>
                        <TaskActions
                          task={task}
                          subject={subj}
                          activeTaskId={activeTaskId}
                          clockSessionActive={clockSessionActive}
                          onTaskStatus={onTaskStatus}
                          onFocusTask={onFocusTask}
                          onClockOut={onClockOut}
                          onEdit={setEditingTaskId}
                          onSkipSubject={onSkipSubject}
                        />
                      </div>
                    );
                  })}
                </div>
              )}
            </Spot>
          </Reveal>

          {/* Weekly Volume Preview */}
          <Reveal delay={100}>
            <Spot className="glass-panel tilt-card section-card p-5 sm:p-6">
              <div className="mb-4 flex items-center justify-between">
                <div>
                  <h3 className="flex items-center gap-2 text-[15px] font-extrabold tracking-tight" style={{ color: "var(--text-main, #211a3a)" }}>
                    <IconChart size={17} /> Weekly Volume
                  </h3>
                  <p className="text-[12px] font-semibold" style={{ color: "var(--text-dim, #5f5a7a)" }}>
                    {Math.round(weekMin / 60 * 10) / 10}h studied this week
                  </p>
                </div>
                {onNavigate && (
                  <button
                    type="button"
                    className="btn btn-xs btn-secondary"
                    onClick={() => onNavigate("analytics")}
                  >
                    Deep Analytics <IconChevron size={12} />
                  </button>
                )}
              </div>
              <WeekBars days={week} goal={dailyGoalMin} height={140} />
            </Spot>
          </Reveal>
        </div>

        {/* Right Column: Subject Mastery & Mini Calendar & Quote */}
        <div className="space-y-4">
          <Reveal delay={80}>
            <Spot className="glass-panel tilt-card section-card p-5">
              <div className="mb-3 flex items-center justify-between">
                <h3 className="flex items-center gap-2 text-[15px] font-extrabold tracking-tight" style={{ color: "var(--text-main, #211a3a)" }}>
                  <IconBook size={17} /> Subject Mastery
                </h3>
                {onNavigate && (
                  <button
                    type="button"
                    className="text-[12px] font-extrabold text-[var(--accent,#6366f1)] hover:underline"
                    onClick={() => onNavigate("subjects")}
                  >
                    View all
                  </button>
                )}
              </div>
              <div className="space-y-3">
                {state.subjects.slice(0, 5).map((sb) => {
                  const topics = state.topics.filter((tp) => tp.subjectId === sb.id);
                  const done = topics.filter((tp) => tp.status === "done").length;
                  const pct = topics.length ? Math.round((done / topics.length) * 100) : 0;
                  return (
                    <div key={sb.id} className="space-y-1">
                      <div className="flex items-baseline justify-between text-[12.5px] font-bold">
                        <span className="truncate" style={{ color: "var(--text-main, #211a3a)" }}>
                          {sb.name}
                        </span>
                        <span className="mono text-[11.5px]" style={{ color: sb.color }}>
                          {done}/{topics.length || sb.units} ({pct}%)
                        </span>
                      </div>
                      <div className="h-1.5 w-full overflow-hidden rounded-full bg-[var(--surface-2,#f4f2fc)]">
                        <div
                          className="h-full rounded-full transition-all duration-700"
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
            <Spot className="glass-panel tilt-card section-card p-5">
              <h3 className="mb-3 text-[15px] font-extrabold tracking-tight" style={{ color: "var(--text-main, #211a3a)" }}>
                Calendar Glance
              </h3>
              <MiniCalendar state={state} />
            </Spot>
          </Reveal>

          <Reveal delay={160}>
            <div className="glass-panel tilt-card section-card relative overflow-hidden p-5">
              <div className="pointer-events-none absolute -right-12 -bottom-12 h-32 w-32 rounded-full bg-[color-mix(in_oklab,var(--accent,#6366f1)_12%,transparent)] blur-xl" />
              <div className="quote-mark text-[var(--accent,#6366f1)]" aria-hidden="true">“</div>
              <p className="relative mt-2 text-[14.5px] font-bold italic leading-relaxed" style={{ color: "var(--text-main, #211a3a)" }}>
                {quote.text}
              </p>
              <div className="mt-3 flex items-center gap-1.5 text-[12px] font-bold" style={{ color: "var(--text-dim, #5f5a7a)" }}>
                <IconLeaf size={13} /> {quote.tag}
              </div>
            </div>
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
