"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { api, addDays, dayDiff, mdToHtml, prettyLong, today, KIND_META, type AppState } from "@/lib/client";
import { mmss } from "@/lib/useTimer";
import { IconSpark } from "./icons";
import TaskEditor, { type TaskPatch } from "./TaskEditor";
import TaskClockButton from "./TaskClockButton";
import Heatmap from "./Heatmap";

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

export default function Dashboard({
  state, onTaskStatus, onTaskUpdate, onSkipSubject, onFocusTask, activeTaskId, activeClockSeconds,
  clockRunning, clockSessionActive, clockOnBreak, onClockOut, onPauseOrResume, replanning, onReplan,
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
}) {
  const [insights, setInsights] = useState<string>("");
  const [intel, setIntel] = useState<{
    upNext?: { id: number; title: string; minutes: number; kind: string; subjectId: number | null } | null;
    focusSuggestion?: { startHour: number; endHour: number; isNow: boolean } | null;
    pace: { global: number; samples: number; bySubject: { id: number; name: string; color: string; pace: number }[] };
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
  const [moreActionsId, setMoreActionsId] = useState<number | null>(null);
  const t = today();
  const ctx = state.context;

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
  const taskLogged = (taskId: number) => {
    const sum = state.sessions.filter((x) => x.taskId === taskId).reduce((a, x) => a + x.minutes, 0);
    return Math.round(sum * 100) / 100;
  };
  // 13.5 minutes displays as "13.5m" — never rounded to a different number
  const fmtMin = (m: number) => {
    const r = Math.round(m * 10) / 10;
    return `${Number.isInteger(r) ? r : r.toFixed(1)}m`;
  };

  return (
    <div className="fade-in">
      <div className="page-header">
        <div>
          <h1 className="page-title">Hey {state.user.name}</h1>
          <p className="page-subtitle">
            {ctx.daysLeft} days to {prettyLong(state.settings.examDate)} · {state.user.courseName}
          </p>
        </div>
        <button className="btn btn-primary" onClick={onReplan} disabled={replanning}>
          <IconSpark size={15} />{replanning ? "Re-planning…" : "Re-plan with AI"}
        </button>
      </div>

      {intel?.upNext && (() => {
        const next = intel.upNext!;
        // LIVE: the ML-predicted task is the one being timed right now.
        // The same card that started the session stops it — no hunting.
        const live = !!clockSessionActive && activeTaskId === next.id;
        return (
          <div
            className={`glass-panel up-next${live ? " live" : ""}`}
            onClick={() => !live && onFocusTask(next.id)}
            role={live ? "status" : undefined}
          >
            <div className="up-next-glow" />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div className="intel-label" style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                {live ? "Now recording" : "Up next"}
                {live
                  ? <span className="up-next-live-chip">● {clockRunning ? "clock running" : clockOnBreak ? "on break" : "paused"}</span>
                  : intel.focusSuggestion?.isNow && <span className="up-next-now">peak focus window</span>}
              </div>
              <div className="up-next-title">{next.title}</div>
              <div className="up-next-sub">
                {live
                  ? `${mmss(activeClockSeconds ?? 0)} this session · your minutes are being saved`
                  : `${next.minutes} min · one tap to clock in`}
              </div>
            </div>
            {live ? (
              <div className="up-next-actions">
                <div className="mono up-next-timer" aria-label="Session time">{mmss(activeClockSeconds ?? 0)}</div>
                <div className="flex-row gap-sm" style={{ justifyContent: "flex-end" }}>
                  {!clockOnBreak && (
                    <button className="btn btn-xs btn-secondary"
                      onClick={(e) => { e.stopPropagation(); onPauseOrResume(); }}>
                      {clockRunning ? "Pause" : "Resume"}
                    </button>
                  )}
                  <button className="btn btn-sm btn-danger act-out"
                    onClick={(e) => { e.stopPropagation(); onClockOut(); }}>
                    Clock Out
                  </button>
                </div>
              </div>
            ) : clockSessionActive ? (
              <button className="btn btn-primary" title="Save the current session and move to this lesson"
                onClick={(e) => { e.stopPropagation(); onFocusTask(next.id); }}>
                Switch
              </button>
            ) : (
              <button className="btn btn-primary" aria-label="Start this task"
                onClick={(e) => { e.stopPropagation(); onFocusTask(next.id); }}>
                Start
              </button>
            )}
          </div>
        );
      })()}

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
          <div className="kpi-label">Days Remaining</div>
          <div className="kpi-value">{daysLeftAnim}</div>
          <div className="kpi-sub">Target: {prettyLong(state.settings.examDate)}</div>
        </div>
        <div className="glass-panel tilt-card kpi-card">
          <div className="kpi-label">Syllabus Progress</div>
          <div className="kpi-value" style={{ color: "var(--accent)" }}>{progressAnim}%</div>
          <div className="bar-track" style={{ marginTop: 8 }}>
            <div className="bar-fill" style={{ width: `${ctx.progressPct}%` }} />
          </div>
        </div>
        <div className="glass-panel tilt-card kpi-card">
          <div className="kpi-label">Hours This Week</div>
          <div className="kpi-value">{hoursAnim}</div>
          <div className="kpi-sub">Target {Math.round(state.settings.dailyHours * 7)}h · {fmtMin(loggedTodayMin)} today</div>
        </div>
        <div className="glass-panel tilt-card kpi-card">
          <div className="kpi-label">Consistency</div>
          <div className="kpi-value" style={{ color: "var(--success-accent)" }}>{consistencyAnim}%</div>
          <div className="kpi-sub">{state.user.streak} day streak · {ctx.overdue} overdue</div>
        </div>
      </div>

      <div className="dash-grid-2">
        <div className="glass-panel tilt-card dash-card">
          <h3 style={{ fontSize: ".88rem", fontWeight: 800, margin: "0 0 16px" }}>Weekly Study Volume</h3>
          <div style={{ display: "flex", alignItems: "flex-end", gap: 10, height: 150 }}>
            {week.map((w) => (
              <div key={w.date} style={{ flex: 1, textAlign: "center" }}>
                <div style={{ fontSize: ".66rem", fontWeight: 700, color: "var(--text-muted)", marginBottom: 4 }}>
                  {w.hours || ""}
                </div>
                <div style={{
                  height: `${Math.max(4, (w.hours / maxH) * 110)}px`,
                  background: w.date === t ? "var(--accent-gradient)" : "var(--chart-bar)",
                  borderRadius: 8, transition: "height .5s ease",
                }} />
                <div style={{ fontSize: ".67rem", fontWeight: 750, marginTop: 6, color: "var(--text-muted)" }}>{w.label}</div>
              </div>
            ))}
          </div>
        </div>
        <div className="glass-panel tilt-card dash-card" style={{ maxHeight: 260, overflowY: "auto" }}>
          <h3 style={{ fontSize: ".88rem", fontWeight: 800, margin: "0 0 16px" }}>Subject Mastery</h3>
          {ctx.subjects.map((s) => {
            const pct = s.total ? Math.round((s.done / s.total) * 100) : 0;
            const color = state.subjects.find((x) => x.id === s.id)?.color || "var(--accent)";
            return (
              <div key={s.id} style={{ marginBottom: 12 }}>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: ".76rem", fontWeight: 700, marginBottom: 5 }}>
                  <span>{s.name}</span><span style={{ color: "var(--text-muted)" }}>{s.done}/{s.total}</span>
                </div>
                <div className="bar-track"><div className="bar-fill" style={{ width: `${pct}%`, background: color }} /></div>
              </div>
            );
          })}
          {!ctx.subjects.length && <div style={{ fontSize: ".8rem", color: "var(--text-dim)" }}>No subjects yet.</div>}
        </div>
      </div>

      <div style={{ marginBottom: 18 }}>
        <Heatmap state={state} />
      </div>

      <div className="glass-panel tilt-card" style={{ padding: 20, marginBottom: 18, borderLeft: "4px solid var(--accent)" }}>
        <h3 style={{ fontSize: ".88rem", fontWeight: 800, margin: "0 0 10px", display: "flex", alignItems: "center", gap: 8 }}>
          <IconSpark size={15} /> SHIGUN Coaching Insights
        </h3>
        {loadingIns ? (
          <div style={{ fontSize: ".84rem", color: "var(--text-muted)" }}>Analysing your data…</div>
        ) : (
          <div style={{ fontSize: ".85rem", lineHeight: 1.65, color: "var(--text-muted)", fontWeight: 550 }}
            dangerouslySetInnerHTML={{ __html: mdToHtml(insights) }} />
        )}
      </div>

      {intel && intel.readiness && (
        <div className="glass-panel tilt-card intel-card" style={{ padding: 20, marginBottom: 18 }}>
          <div className="day-head" style={{ marginBottom: 12 }}>
            <h3 style={{ fontSize: ".88rem", fontWeight: 800, margin: 0 }}>Intelligence</h3>
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
              {intel.pace.samples >= 3 ? (
                <>
                  <div className="intel-label" style={{ marginBottom: 8 }}>Your pace vs plan (learned from {intel.pace.samples} sessions)</div>
                  {intel.pace.bySubject.slice(0, 6).map((p) => (
                    <div key={p.id} className="intel-pace-row">
                      <span className="task-dot" style={{ background: p.color, position: "static" }} />
                      <span className="intel-pace-name">{p.name}</span>
                      <span className={`intel-pace-val ${p.pace > 1.15 ? "warn-text" : p.pace < 0.9 ? "ok-text" : ""}`}>
                        {p.pace > 1.05 ? `${Math.round((p.pace - 1) * 100)}% slower` : p.pace < 0.95 ? `${Math.round((1 - p.pace) * 100)}% faster` : "on pace"}
                      </span>
                    </div>
                  ))}
                </>
              ) : (
                <div style={{ fontSize: ".8rem", color: "var(--text-dim)" }}>
                  Complete a few more sessions and the pace model will show which subjects run faster or slower for you.
                </div>
              )}
              <div className="intel-label" style={{ margin: "12px 0 4px" }}>Finish-time projection</div>
              <div style={{ fontSize: ".8rem", color: "var(--text-muted)" }}>
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

      <div className="glass-panel tilt-card" style={{ padding: 20 }}>
        <div className="day-head">
          <h3 style={{ fontSize: ".88rem", fontWeight: 800, margin: 0 }}>Today&apos;s Study Load</h3>
          <span className="day-meta">{doneToday}/{todayTasks.length} done · {totalPlannedMin} min planned</span>
        </div>
        {!todayTasks.length && (
          <div className="empty-state">
            <div className="empty-state-icon">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="4" width="18" height="18" rx="3" /><path d="M16 2v4M8 2v4M3 10h18" />
              </svg>
            </div>
            <h4 className="empty-state-title">No sessions scheduled today</h4>
            <p className="empty-state-sub">This may be a rest day, or your plan hasn&apos;t been generated yet. Re-plan to fill your schedule.</p>
            <button className="btn btn-secondary btn-sm" onClick={onReplan} disabled={replanning}>
              {replanning ? "Re-planning…" : "Generate Plan"}
            </button>
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
          return (
            <div key={task.id} className={`task-row${task.status === "done" ? " done" : ""}${activeTaskId === task.id ? " active-clock" : ""}${moreActionsId === task.id ? " expanded-actions" : ""}`}>
              <div className="task-dot" style={{ background: subj?.color || meta.color }} />
              <div className="task-main">
                <div className="task-title">{task.title}</div>
                <div className="task-sub">
                  {meta.label} · {task.plannedMinutes} min{taskLogged(task.id) ? ` · ${fmtMin(taskLogged(task.id))} logged` : task.actualMinutes ? ` · ${task.actualMinutes}m logged` : ""}
                  {activeTaskId === task.id && activeClockSeconds ? ` · live +${Math.floor(activeClockSeconds / 60)}m ${activeClockSeconds % 60}s` : ""}
                </div>
              </div>
              <button className="btn btn-xs btn-secondary" onClick={() => setEditingTaskId(task.id)}>Edit</button>
              {subj && task.status !== "skipped" && (
                <button className="btn btn-xs btn-secondary" onClick={() => onSkipSubject(subj.id, task.date)}>Skip subject</button>
              )}
              <TaskClockButton taskId={task.id} activeTaskId={activeTaskId} sessionActive={clockSessionActive}
                onFocusTask={onFocusTask} onClockOut={onClockOut} />
              <button className="btn btn-xs btn-secondary task-more" aria-label="More actions"
                onClick={() => setMoreActionsId(moreActionsId === task.id ? null : task.id)}>⋯</button>
              <button className={`btn btn-xs task-primary ${task.status === "done" ? "btn-secondary" : "btn-primary"}`}
                onClick={() => onTaskStatus(task.id, task.status === "done" ? "pending" : "done")}>
                {task.status === "done" ? "Undo" : "Done"}
              </button>
              {task.status !== "skipped" && task.status !== "done" && (
                <button className="btn btn-xs btn-secondary" title="Skip"
                  onClick={() => onTaskStatus(task.id, "skipped")}>Skip</button>
              )}
            </div>
          );
        })}
      </div>
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
