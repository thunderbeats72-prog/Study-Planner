"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import StudyScene from "./StudyScene";
import MiniCalendar from "./MiniCalendar";
import { api, addDays, dayDiff, mdToHtml, prettyLong, today, KIND_META, normalizeCheckpointTitle, type AppState, type TaskRow } from "@/lib/client";
import { mmss } from "@/lib/useTimer";
import {
  IconSpark, IconCalendar, IconTarget, IconClock, IconFlame, IconPlay, IconLeaf, IconRocket,
} from "./icons";
import TaskEditor, { type TaskPatch } from "./TaskEditor";
import TaskActions from "./TaskActions";
import { TaskLiveBadge } from "./TaskClockButton";
import QuickAdd from "./QuickAdd";
import Heatmap from "./Heatmap";
import { prioritizeTasks, weakestSubjectIds, reasonLabel } from "@/lib/prioritization";
import { taskStudiedSuffix } from "@/lib/studyTime";
import {
  backlogFor, backlogToDate, canFitToday, dailyCapacityMinutes, pendingOnDate,
  spreadAcrossDays, suggestedRecovery, todayOverload,
} from "@/lib/recovery";
import type { QuickAddPayload } from "@/lib/quickAdd";

/** v13 — KPI digits count up to their new value instead of snapping.
 *  Returns a formatted string (integers stay clean, tenths when needed). */
function useCountUp(target: number): string {
  const [display, setDisplay] = useState(target);
  const prev = useRef(target);
  useEffect(() => {
    const from = prev.current;
    prev.current = target;
    if (from === target) return;
    // Reduced motion collapses the duration to a single async frame so no
    // setState ever runs synchronously inside the effect body.
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const t0 = performance.now();
    const dur = reduce ? 0 : 900;
    let raf = 0;
    const step = (now: number) => {
      const p = dur === 0 ? 1 : Math.min(1, (now - t0) / dur);
      const eased = 1 - Math.pow(1 - p, 3);
      setDisplay(from + (target - from) * eased);
      if (p < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [target]);
  const rounded = Math.round(display * 10) / 10;
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
}

const QUOTES = [
  { text: "Small steps every day add up to big results.", tag: "Stay present" },
  { text: "Focus is saying no to a hundred good ideas.", tag: "Protect your focus" },
  { text: "You don't have to be great to start, but you have to start to be great.", tag: "You've got this" },
  { text: "The expert in anything was once a beginner.", tag: "Keep going" },
  { text: "Discipline is choosing between what you want now and what you want most.", tag: "Stay present" },
  { text: "One focused hour beats a distracted day.", tag: "Protect your focus" },
  { text: "Progress, not perfection.", tag: "You've got this" },
];

function dailyQuote(dateKey: string) {
  let hash = 0;
  for (let i = 0; i < dateKey.length; i++) hash = (hash * 31 + dateKey.charCodeAt(i)) >>> 0;
  return QUOTES[hash % QUOTES.length];
}

/** Checkpoints are cross-subject mock tasks rendered without a subject. */
function isCheckpointTask(task: TaskRow): boolean {
  return task.title.toLowerCase().includes("checkpoint") || (task.kind === "mock" && !task.subjectId);
}

export default function Dashboard({
  state, onTaskStatus, onTaskUpdate, onSkipSubject, onFocusTask, activeTaskId, activeClockSeconds,
  clockRunning, clockSessionActive, clockOnBreak, onClockOut, onPauseOrResume, replanning, onReplan,
  onStartFocus, onAddTask, onMoveTasks,
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
}) {
  const [insights, setInsights] = useState<string>("");
  const [intel, setIntel] = useState<{
    upNext?: { id: number; title: string; minutes: number; kind: string; subjectId: number | null } | null;
    focusSuggestion?: { startHour: number; endHour: number; isNow: boolean } | null;
    pace: { global: number; samples: number; bySubject: { id: number; name: string; color: string; pace: number }[] } | null;
    weekdays: number[] | null;
    peakHour: number | null;
    tomorrowRisk: number;
    readiness: { onTrack: boolean; loadPct: number; likelyDays: number; optimisticDays: number; pessimisticDays: number; samples: number; effectiveDailyMinutes?: number };
    effectiveDailyMinutes?: { minutes: number; activeDays: number; samples: number };
    memory: { strong: number; fading: number; atRisk: number; tracked: number };
  } | null>(null);
  const [intelOpen, setIntelOpen] = useState(false);
  const [loadingIns, setLoadingIns] = useState(true);
  const [editingTaskId, setEditingTaskId] = useState<number | null>(null);
  const t = today();
  const ctx = state.context;
  const quote = dailyQuote(t);

  const taskProgressVersion = `${state.tasks.length}:${state.tasks.filter((task) => task.status === "done").length}:${state.tasks.filter((task) => task.status === "skipped").length}`;
  const loggedQuarterHour = Math.floor(
    state.sessions.reduce((total, session) => total + session.minutes, 0) / 15
  );

  // Analytics may change as time is logged, but refreshing on every one-minute
  // clock flush caused a request loop. A 15-minute bucket stays useful without
  // hammering the database. Coaching text refreshes only when task progress
  // changes; the server also caches identical insight snapshots.
  useEffect(() => {
    let cancelled = false;
    api<typeof intel>("/api/analytics")
      .then((data) => { if (!cancelled) setIntel(data); })
      .catch(() => undefined);
    return () => { cancelled = true; };
  }, [taskProgressVersion, loggedQuarterHour]);

  useEffect(() => {
    let cancelled = false;
    api<{ insights: string }>("/api/insights")
      .then((data) => { if (!cancelled) setInsights(data.insights); })
      .catch(() => { if (!cancelled) setInsights(""); })
      .finally(() => { if (!cancelled) setLoadingIns(false); });
    return () => { cancelled = true; };
  }, [taskProgressVersion]);

  const week = useMemo(() => {
    const arr: { label: string; date: string; hours: number }[] = [];
    for (let i = 6; i >= 0; i--) {
      const d = addDays(t, -i);
      const hours =
        state.sessions.filter((s) => s.date === d).reduce((a, s) => a + s.minutes, 0) / 60;
      arr.push({
        label: new Date(d).toLocaleDateString(undefined, { weekday: "short" }).slice(0, 3),
        date: d,
        hours: Math.round(hours * 100) / 100,
      });
    }
    return arr;
  }, [state.sessions, t]);

  const maxH = Math.max(1, ...week.map((w) => w.hours), state.settings.dailyHours);
  const todayTasks = state.tasks.filter((x) => x.date === t);
  const doneToday = todayTasks.filter((x) => x.status === "done").length;
  const consistency = (() => {
    const perDay = new Map<string, number>();
    for (const s of state.sessions) perDay.set(s.date, (perDay.get(s.date) || 0) + s.minutes);
    const days = new Set([...perDay.entries()].filter(([, m]) => m >= 1).map(([d]) => d));
    // Minimum 7-day window: day-one '100%' was technically true but
    // misleading; a week-floor gives an honest early signal.
    const span = Math.max(7, Math.min(30, dayDiff(state.settings.startDate, t) + 1));
    let hit = 0;
    for (let i = 0; i < span; i++) if (days.has(addDays(t, -i))) hit++;
    return Math.round((hit / span) * 100);
  })();
  // v13 — animated KPI readouts
  const daysLeftAnim = useCountUp(ctx.daysLeft);
  const progressAnim = useCountUp(ctx.progressPct);
  const hoursAnim = useCountUp(ctx.hoursThisWeek);
  const consistencyAnim = useCountUp(consistency);

  const totalPlannedMin = todayTasks.reduce((a, x) => a + x.plannedMinutes, 0);
  const loggedTodayMin = state.sessions.filter((s) => s.date === t).reduce((a, s) => a + s.minutes, 0);

  // ── "What should I do now?" — one shared priority order ──────────────
  const capacity = dailyCapacityMinutes(state.settings);
  const backlog = useMemo(() => backlogFor(state.tasks, t), [state.tasks, t]);
  const ranked = useMemo(
    () => prioritizeTasks(state.tasks, t, {
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

  // The hero card doubles as the live session control for the top task.
  const heroLive = !!clockSessionActive && top != null && activeTaskId === top.id;
  const topTitle = top ? (isCheckpointTask(top) ? normalizeCheckpointTitle(top.title) : top.title) : "";

  // Momentum: this-week vs last-week study minutes, avg session length,
  // and completion rate over the past 7 days — small honest trends.
  const momentum = useMemo(() => {
    const dayMs = 86400000;
    const now = new Date(t + "T00:00:00").getTime();
    const inRange = (d: string, from: number, to: number) => {
      const x = new Date(d + "T00:00:00").getTime();
      return x >= from && x < to;
    };
    const thisWk = state.sessions.filter((s) => inRange(s.date, now - 6 * dayMs, now + dayMs));
    const lastWk = state.sessions.filter((s) => inRange(s.date, now - 13 * dayMs, now - 6 * dayMs));
    const thisMin = thisWk.reduce((a, s) => a + s.minutes, 0);
    const lastMin = lastWk.reduce((a, s) => a + s.minutes, 0);
    const delta = lastMin > 0 ? Math.round(((thisMin - lastMin) / lastMin) * 100) : null;
    const focusSessions = thisWk.filter((s) => s.mode !== "break");
    const avgSession = focusSessions.length ? Math.round(thisMin / focusSessions.length) : 0;
    const recent = state.tasks.filter((x) => inRange(x.date, now - 6 * dayMs, now + dayMs) && x.kind !== "buffer");
    const compRate = recent.length ? Math.round((recent.filter((x) => x.status === "done").length / recent.length) * 100) : null;
    return { thisHrs: Math.round((thisMin / 60) * 10) / 10, delta, avgSession, compRate };
  }, [state.sessions, state.tasks, t]);
  // Per-task study totals come from the shared helper so the Overview and
  // the Planner word and aggregate them exactly the same way.
  // 13.5 minutes displays as "13.5m" — never rounded to a different number
  const fmtMin = (m: number) => {
    const r = Math.round(m * 10) / 10;
    return `${Number.isInteger(r) ? r : r.toFixed(1)}m`;
  };

  const hourLabel = new Date().getHours();
  const greeting = hourLabel < 12 ? "Good morning" : hourLabel < 17 ? "Good afternoon" : "Good evening";

  return (
    <div className="fade-in">
      {/* ── HERO: NOW / NEXT / TODAY / RECOVERY — the actionable answer,
             not a stats wall. ── */}
      <section className="dash-hero glass-panel">
        <div className="dash-hero-bg" aria-hidden="true" />
        <div className="dash-hero-copy">
          <div className="dash-hero-eyebrow">
            <span className="streak-badge dash-hero-streak"><IconFlame /> {state.user.streak} day streak</span>
            <span className="sr-only">{greeting}, {state.user.name}.</span>
          </div>

          {top ? (
            <>
              <div className="now-label">
                {top.priorityLabel}
                <span className="now-label-sep" aria-hidden="true">·</span>
                {reasonLabel(top.reason)}
              </div>
              <h1 className="dash-hero-title now-title">{topTitle}</h1>
              <p className="dash-hero-sub">
                {KIND_META[top.kind]?.label || "Task"} · {top.plannedMinutes} min
                {state.subjects.find((subject) => subject.id === top.subjectId)
                  ? ` · ${state.subjects.find((subject) => subject.id === top.subjectId)!.name}`
                  : ""}
                {taskStudiedSuffix(state.sessions, top) ? ` · ${taskStudiedSuffix(state.sessions, top)}` : ""}
              </p>

              {heroLive ? (
                <div className="now-live">
                  <span className={`up-next-live-chip${clockRunning ? " is-recording" : clockOnBreak ? " is-break" : " is-idle"}`}>
                    <span className="task-live-dot" aria-hidden="true" />
                    {clockRunning ? "clock running" : clockOnBreak ? "on break" : "paused"}
                  </span>
                  <span className="mono now-live-timer" aria-label="Session time">{mmss(activeClockSeconds ?? 0)}</span>
                  <div className="flex-row gap-sm">
                    {!clockOnBreak && (
                      <button className="btn btn-sm btn-secondary" onClick={onPauseOrResume}>
                        {clockRunning ? "Pause" : "Resume"}
                      </button>
                    )}
                    <button className="btn btn-sm btn-danger act-out" onClick={onClockOut}>
                      Clock Out
                    </button>
                  </div>
                </div>
              ) : (
                <div className="dash-hero-actions now-actions">
                  <button className="btn btn-primary btn-lg" onClick={() => onFocusTask(top.id)}>
                    <IconPlay size={15} /> {clockSessionActive ? "Switch to this" : "Start"}
                  </button>
                  <button className="btn btn-secondary btn-lg" onClick={onStartFocus}>
                    Start Focus
                  </button>
                </div>
              )}

              {second && !heroLive && (
                <div className="now-next">
                  <span className="now-next-label">Next</span>
                  <span className="now-next-title">{second.title}</span>
                  <span className="now-next-meta">{second.plannedMinutes} min</span>
                  <button
                    className="btn btn-xs btn-secondary now-next-start"
                    type="button"
                    onClick={() => onFocusTask(second.id)}
                  >
                    Start
                  </button>
                </div>
              )}

              <div className="now-planline">
                {todayTasks.length
                  ? `Today: ${doneToday}/${todayTasks.length} done · ${todayPendingMin} min left`
                  : "No plan yet today — add a task or generate one."}
                {backlog.count > 0 && (
                  <span className={canFit ? "now-planline-ok" : "now-planline-warn"}>
                    {canFit ? " · catch-up fits today" : ` · ${backlog.minutes} min backlog`}
                  </span>
                )}
              </div>
            </>
          ) : (
            <>
              <h1 className="dash-hero-title">
                All caught up, {state.user.name.split(" ")[0]}! <span className="wave-emoji" aria-hidden="true">🎉</span>
              </h1>
              <p className="dash-hero-sub">
                Nothing is waiting for you. Pick a weak topic, add a task, or take the rest of the day.
              </p>
              <div className="dash-hero-actions">
                <button className="btn btn-primary btn-lg" onClick={onStartFocus}>
                  <IconPlay size={15} /> Start Focus
                </button>
              </div>
            </>
          )}
        </div>
        <StudyScene variant="dashboard" className="dash-hero-scene" />
      </section>

      {/* ── RECOVERY — overdue work is a decision, never a failure. ── */}
      {backlog.count > 0 && (
        <div className="glass-panel recovery-panel accent-edge accent-edge--warning">
          <div className="recovery-copy">
            <h3 className="section-title recovery-title">
              {backlog.count === 1 ? "1 unfinished task" : `${backlog.count} unfinished tasks`} from earlier days
            </h3>
            <p className="panel-lead">
              Let&apos;s recover {backlog.count === 1 ? "it" : "them"} — no rush, no cramming.{" "}
              {overload > 0 && recoveryPace
                ? `Suggested recovery: +${recoveryPace.minutesPerDay} min/day for ${recoveryPace.days} day${recoveryPace.days === 1 ? "" : "s"} keeps today realistic.`
                : "They still fit today's plan without overloading you."}
            </p>
          </div>
          <div className="recovery-actions">
            <button
              className="btn btn-sm btn-secondary"
              type="button"
              disabled={!canFit}
              title={canFit ? "Move the unfinished work into today's plan" : "More than your daily capacity — spread it instead"}
              onClick={() => onMoveTasks(moveToday, `Moved ${moveToday.length} task${moveToday.length === 1 ? "" : "s"} to today.`)}
            >
              Do today
            </button>
            <button
              className="btn btn-sm btn-secondary"
              type="button"
              onClick={() => onMoveTasks(moveTomorrow, `Moved ${moveTomorrow.length} task${moveTomorrow.length === 1 ? "" : "s"} to tomorrow.`)}
            >
              Move to tomorrow
            </button>
            <button
              className="btn btn-sm btn-primary"
              type="button"
              onClick={() => onMoveTasks(spreadPlan, `Spread ${spreadPlan.length} task${spreadPlan.length === 1 ? "" : "s"} across the week.`)}
            >
              Spread across the week
            </button>
            <button className="btn btn-sm btn-primary" type="button" onClick={onReplan} disabled={replanning} aria-busy={replanning}>
              {replanning && <span className="replanning-spark"><IconSpark size={12} /></span>}
              {replanning ? "Re-planning…" : "Let AI re-plan"}
            </button>
          </div>
        </div>
      )}

      {/* ── TODAY'S PLAN — the working list comes before every statistic. ── */}
      <div className="dash-today-grid">
        <div className="dash-today-col">
          <div className="glass-panel tilt-card section-card dash-today-card">
            <div className="day-head">
              <h3 className="section-title">Today&apos;s Plan</h3>
              <div className="day-head-side">
                <span className="day-meta">{doneToday}/{todayTasks.length} done · {totalPlannedMin} min planned</span>
                <QuickAdd state={state} onAdd={onAddTask} />
              </div>
            </div>
            {!todayTasks.length && (
              <div className="empty-state">
                <div className="empty-state-icon">
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="3" y="4" width="18" height="18" rx="3" /><path d="M16 2v4M8 2v4M3 10h18" />
                  </svg>
                </div>
                <h4 className="empty-state-title">No sessions scheduled today</h4>
                <p className="empty-state-sub">This may be a rest day, or your plan hasn&apos;t been generated yet.</p>
                <div className="flex-row gap-sm">
                  <QuickAdd state={state} onAdd={onAddTask} />
                  <button className="btn btn-secondary btn-sm" onClick={onReplan} disabled={replanning}>
                    {replanning ? "Re-planning…" : "Generate Plan"}
                  </button>
                </div>
              </div>
            )}
            {todayTasks.length > 0 && doneToday === todayTasks.length && (
              <div className="day-complete">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M20 6 9 17l-5-5" />
                </svg>
                All done for today. Well earned — see you tomorrow.
              </div>
            )}
            {todayTasks.map((task) => {
              const meta = KIND_META[task.kind] || KIND_META.learn;
              const subj = state.subjects.find((s) => s.id === task.subjectId);
              const isCheckpoint = isCheckpointTask(task);
              const kindLabel = isCheckpoint ? "Checkpoint" : meta.label;
              const dotColor = subj?.color || (isCheckpoint ? "var(--color-primary)" : meta.color);
              const formattedTitle = isCheckpoint ? normalizeCheckpointTitle(task.title) : task.title;
              // Live state only while a session is actually open: Clock Out
              // clears the row instantly and leaves the studied minutes behind.
              const rowLive = !!clockSessionActive && activeTaskId === task.id;
              const studiedLabel = taskStudiedSuffix(state.sessions, task);
              return (
                <div key={task.id} className={`task-row clean-list${task.status === "done" ? " done" : ""}${rowLive ? " active-clock" : ""}`}>
                  <div className="task-dot" style={{ background: dotColor }} />
                  <div className="task-main">
                    <div className="task-title">{formattedTitle}</div>
                    <div className="task-sub">
                      <span className="chip chip-kind chip-tight">{kindLabel}</span> · {task.plannedMinutes} min
                      {isCheckpoint ? " · All Subjects · Comprehensive Review" : ""}
                      {studiedLabel ? ` · ${studiedLabel}` : ""}
                      {rowLive && <TaskLiveBadge seconds={activeClockSeconds} running={clockRunning} />}
                    </div>
                  </div>
                  <span className={`chip chip-${task.status}`}>{task.status}</span>
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

          {/* The quote sits under the plan so the right rail keeps the shorter,
              fixed-height calendar; the two columns stay fitted end to end. */}
          <div className="glass-panel tilt-card section-card dash-quote-card">
            <div className="quote-mark" aria-hidden="true">“</div>
            <p className="quote-text">{quote.text}</p>
            <div className="quote-tag">
              <span className="quote-tag-icon">{quote.tag === "Stay present" ? <IconLeaf size={12} /> : <IconRocket size={12} />}</span>
              {quote.tag}
            </div>
          </div>
        </div>

        <div className="dash-side-rail">
          <div className="glass-panel tilt-card section-card dash-cal-card">
            <h3 className="section-title">Calendar</h3>
            <MiniCalendar state={state} />
          </div>
        </div>
      </div>

      {/* ── SUPPORTING NUMBERS — progress context, deliberately secondary ── */}
      <div className="momentum-strip">
        <span className="momentum-pill">This week <strong>{momentum.thisHrs}h</strong>
          {momentum.delta !== null && (
            <span className={momentum.delta >= 0 ? "up" : "down"}>
              {momentum.delta >= 0 ? "▲" : "▼"} {Math.abs(momentum.delta)}%
            </span>
          )}
        </span>
        {momentum.avgSession > 0 && <span className="momentum-pill">Avg session <strong>{momentum.avgSession}m</strong></span>}
        {momentum.compRate !== null && <span className="momentum-pill">7-day completion <strong>{momentum.compRate}%</strong></span>}
        {state.user.streak > 1 && <span className="momentum-pill">Streak <strong>{state.user.streak}d</strong></span>}
      </div>

      <div className="kpi-grid">
        <div className="glass-panel tilt-card kpi-card">
          <div className="kpi-icon kpi-icon--violet"><IconCalendar size={17} /></div>
          <div className="kpi-label">Days Remaining</div>
          <div className="kpi-value">{daysLeftAnim}</div>
          <div className="kpi-sub">Target: {prettyLong(state.settings.examDate)}</div>
        </div>
        <div className="glass-panel tilt-card kpi-card">
          <div className="kpi-icon kpi-icon--indigo"><IconTarget size={17} /></div>
          <div className="kpi-label">Syllabus Progress</div>
          <div className="kpi-value tone-accent">{progressAnim}%</div>
          <div className="bar-track">
            <div className="bar-fill" style={{ width: `${ctx.progressPct}%` }} />
          </div>
        </div>
        <div className="glass-panel tilt-card kpi-card">
          <div className="kpi-icon kpi-icon--mint"><IconClock size={17} /></div>
          <div className="kpi-label">Hours This Week</div>
          <div className="kpi-value">{hoursAnim}</div>
          <div className="kpi-sub">Target {Math.round(state.settings.dailyHours * 7)}h · {fmtMin(loggedTodayMin)} today</div>
        </div>
        <div className="glass-panel tilt-card kpi-card">
          <div className="kpi-icon kpi-icon--orange"><IconFlame size={17} /></div>
          <div className="kpi-label">Consistency</div>
          <div className="kpi-value tone-success">{consistencyAnim}%</div>
          <div className="kpi-sub">{state.user.streak} day streak · {ctx.overdue} overdue</div>
        </div>
      </div>

      <div className="dash-grid-2">
        <div className="glass-panel tilt-card dash-card">
          <h3 className="section-title">Weekly Study Volume</h3>
          <div className="wk-chart">
            {week.map((w) => (
              <div key={w.date} className={`wk-col${w.date === t ? " is-today" : ""}`}>
                <div className="wk-val">{w.hours || ""}</div>
                <div className="wk-bar"
                  title={`${w.label} · ${w.hours}h`}
                  style={{ "--pct": String(Math.min(1, (w.hours / maxH) * 0.86)) } as React.CSSProperties} />
                <div className="wk-label">{w.label}</div>
              </div>
            ))}
          </div>
        </div>
        <div className="glass-panel tilt-card dash-card mastery-panel">
          <h3 className="section-title">Subject Mastery</h3>
          <div className="mastery-list">
            {ctx.subjects.map((s) => {
              const pct = s.total ? Math.round((s.done / s.total) * 100) : 0;
              const color = state.subjects.find((x) => x.id === s.id)?.color || "var(--accent)";
              return (
                <div key={s.id} className="mastery-row-wrap">
                  <div className="mastery-row">
                    <span className="mastery-name">{s.name}</span>
                    <span className="mastery-count">{s.done}/{s.total}</span>
                  </div>
                  <div className="bar-track"><div className="bar-fill" style={{ width: `${pct}%`, background: color }} /></div>
                </div>
              );
            })}
          </div>
          {!ctx.subjects.length && <div className="panel-lead">No subjects yet.</div>}
        </div>
      </div>

      <Heatmap state={state} />

      <div className="glass-panel tilt-card coach-card section-card accent-edge">
        <h3 className="section-title section-title--row">
          <IconSpark size={15} /> SHIGUN Coaching Insights
        </h3>
        {loadingIns ? (
          <div className="panel-lead is-busy">Analysing your data…</div>
        ) : (
          <div className="coach-body"
            dangerouslySetInnerHTML={{ __html: mdToHtml(insights) }} />
        )}
      </div>

      {intel && intel.readiness && (
        <div className="glass-panel tilt-card intel-card section-card">
          <div className="day-head">
            <h3 className="section-title">Intelligence</h3>
            <span className="day-meta">learned from your own study data</span>
          </div>

          <div className="intel-grid">
            <div className="intel-stat">
              <span className={`intel-dot ${intel.readiness.onTrack ? "ok" : "warn"}`} />
              <div>
                <div className="intel-label">Exam readiness</div>
                <div className="intel-value">
                  {intel.readiness.onTrack ? "On track" : "Behind pace"}
                  <span className="intel-sub"> · needs ~{intel.readiness.likelyDays}d of your remaining time</span>
                </div>
              </div>
            </div>

            <div className="intel-stat">
              <span className={`intel-dot ${intel.tomorrowRisk < 0.4 ? "ok" : intel.tomorrowRisk < 0.65 ? "mid" : "warn"}`} />
              <div>
                <div className="intel-label">Tomorrow&apos;s plan</div>
                <div className="intel-value">
                  {intel.tomorrowRisk < 0.4 ? "Looks doable" : intel.tomorrowRisk < 0.65 ? "A bit heavy" : "Overloaded"}
                  <span className="intel-sub"> · {Math.round(intel.tomorrowRisk * 100)}% skip risk</span>
                </div>
              </div>
            </div>

            {intel.memory.tracked > 0 && (
              <div className="intel-stat">
                <span className={`intel-dot ${intel.memory.atRisk === 0 ? "ok" : "mid"}`} />
                <div>
                  <div className="intel-label">Memory health</div>
                  <div className="intel-value">
                    {intel.memory.strong} strong
                    {intel.memory.fading > 0 && <span className="intel-sub"> · {intel.memory.fading} fading</span>}
                    {intel.memory.atRisk > 0 && <span className="intel-sub warn-text"> · {intel.memory.atRisk} need review</span>}
                  </div>
                </div>
              </div>
            )}

            {intel.peakHour !== null && (
              <div className="intel-stat">
                <span className="intel-dot ok" />
                <div>
                  <div className="intel-label">Your peak focus</div>
                  <div className="intel-value">{intel.peakHour % 12 || 12}{intel.peakHour < 12 ? "am" : "pm"}–{(intel.peakHour + 2) % 12 || 12}{(intel.peakHour + 2) < 12 || (intel.peakHour + 2) >= 24 ? "am" : "pm"}
                    <span className="intel-sub"> · schedule hard topics here</span>
                  </div>
                </div>
              </div>
            )}
          </div>

          <button className="more-options-toggle" onClick={() => setIntelOpen(!intelOpen)}>
            {intelOpen ? "Hide details" : "More details"}
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"
              style={{ transform: intelOpen ? "rotate(180deg)" : "none", transition: "transform .25s ease" }}>
              <path d="m6 9 6 6 6-6" />
            </svg>
          </button>

          {intelOpen && (
            <div className="intel-details slide-in">
              {intel.pace && intel.pace.samples >= 3 ? (
                <>
                  <div className="intel-label intel-subhead intel-subhead--first">Your pace vs plan (learned from {intel.pace.samples} sessions)</div>
                  {intel.pace.bySubject.slice(0, 6).map((p) => (
                    <div key={p.id} className="intel-pace-row">
                      <span className="task-dot" style={{ background: p.color }} />
                      <span className="intel-pace-name">{p.name}</span>
                      <span className={`intel-pace-val ${p.pace > 1.15 ? "warn-text" : p.pace < 0.9 ? "ok-text" : ""}`}>
                        {p.pace > 1.05 ? `${Math.round((p.pace - 1) * 100)}% slower` : p.pace < 0.95 ? `${Math.round((1 - p.pace) * 100)}% faster` : "on pace"}
                      </span>
                    </div>
                  ))}
                </>
              ) : (
                <div className="panel-lead">
                  Complete a few more sessions and the pace model will show which subjects run faster or slower for you.
                </div>
              )}
              <div className="intel-label intel-subhead">Finish-time projection</div>
              <div className="panel-lead">
                Best case ~{intel.readiness.optimisticDays}d · likely ~{intel.readiness.likelyDays}d · worst case ~{intel.readiness.pessimisticDays}d of study time remaining.
                {intel.effectiveDailyMinutes && intel.effectiveDailyMinutes.activeDays >= 4 && (
                  <>
                    {" "}Based on the <strong>{Math.round(intel.effectiveDailyMinutes.minutes)} min/day</strong> you
                    actually study ({intel.effectiveDailyMinutes.activeDays} active days), not just your target.
                  </>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      <TaskEditor
        key={editingTaskId ?? "closed"}
        state={state}
        task={state.tasks.find((x) => x.id === editingTaskId) || null}
        onClose={() => setEditingTaskId(null)}
        onSave={onTaskUpdate}
        onSkipSubject={onSkipSubject}
      />
    </div>
  );
}
