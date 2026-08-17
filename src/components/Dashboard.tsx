"use client";

import React, { useEffect, useMemo, useState } from "react";
import { api, addDays, dayDiff, mdToHtml, prettyLong, today, KIND_META, type AppState } from "@/lib/client";
import { IconSpark } from "./icons";
import TaskEditor, { type TaskPatch } from "./TaskEditor";
import Heatmap from "./Heatmap";

export default function Dashboard({
  state, onTaskStatus, onTaskUpdate, onSkipSubject, onFocusTask, activeTaskId, activeClockSeconds, replanning, onReplan,
}: {
  state: AppState;
  onTaskStatus: (id: number, status: string) => void;
  onTaskUpdate: (id: number, patch: TaskPatch) => void;
  onSkipSubject: (subjectId: number, date: string) => void;
  onFocusTask: (taskId: number) => void;
  activeTaskId?: number | null;
  activeClockSeconds?: number;
  replanning: boolean;
  onReplan: () => void;
}) {
  const [insights, setInsights] = useState<string>("");
  const [loadingIns, setLoadingIns] = useState(true);
  const [editingTaskId, setEditingTaskId] = useState<number | null>(null);
  const t = today();
  const ctx = state.context;

  useEffect(() => {
    setLoadingIns(true);
    api<{ insights: string }>("/api/insights")
      .then((d) => setInsights(d.insights))
      .catch(() => setInsights(""))
      .finally(() => setLoadingIns(false));
  }, [state.tasks.length, state.sessions.length]);

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
    const span = Math.max(1, Math.min(30, dayDiff(state.settings.startDate, t) + 1));
    let hit = 0;
    for (let i = 0; i < span; i++) if (days.has(addDays(t, -i))) hit++;
    return Math.round((hit / span) * 100);
  })();
  const totalPlannedMin = todayTasks.reduce((a, x) => a + x.plannedMinutes, 0);
  const loggedTodayMin = state.sessions.filter((s) => s.date === t).reduce((a, s) => a + s.minutes, 0);
  const taskLogged = (taskId: number) => {
    const sum = state.sessions.filter((x) => x.taskId === taskId).reduce((a, x) => a + x.minutes, 0);
    return Math.round(sum * 100) / 100;
  };
  const fmtMin = (m: number) => Number.isInteger(m) ? `${m}m` : `${m.toFixed(2)}m`;

  return (
    <div className="fade-in">
      <div className="page-header">
        <div>
          <h1 className="page-title">Hey {state.user.name}<span className="wave-emoji">👋</span></h1>
          <p className="page-subtitle">
            {ctx.daysLeft} days to {prettyLong(state.settings.examDate)} · {state.user.courseName}
          </p>
        </div>
        <button className="btn btn-primary" onClick={onReplan} disabled={replanning}>
          <IconSpark size={15} />{replanning ? "Re-planning…" : "Re-plan with AI"}
        </button>
      </div>

      <div className="kpi-grid">
        <div className="glass-panel tilt-card kpi-card">
          <div className="kpi-label">Days Remaining</div>
          <div className="kpi-value">{ctx.daysLeft}</div>
          <div className="kpi-sub">Target: {prettyLong(state.settings.examDate)}</div>
        </div>
        <div className="glass-panel tilt-card kpi-card">
          <div className="kpi-label">Syllabus Progress</div>
          <div className="kpi-value" style={{ color: "var(--accent)" }}>{ctx.progressPct}%</div>
          <div className="bar-track" style={{ marginTop: 8 }}>
            <div className="bar-fill" style={{ width: `${ctx.progressPct}%` }} />
          </div>
        </div>
        <div className="glass-panel tilt-card kpi-card">
          <div className="kpi-label">Hours This Week</div>
          <div className="kpi-value">{ctx.hoursThisWeek}</div>
          <div className="kpi-sub">Target {Math.round(state.settings.dailyHours * 7)}h · {Math.round(loggedTodayMin)}m today</div>
        </div>
        <div className="glass-panel tilt-card kpi-card">
          <div className="kpi-label">Consistency</div>
          <div className="kpi-value" style={{ color: "var(--success-accent)" }}>{consistency}%</div>
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
          <IconSpark size={15} /> AETHER Coaching Insights
        </h3>
        {loadingIns ? (
          <div style={{ fontSize: ".84rem", color: "var(--text-muted)" }}>Analysing your data…</div>
        ) : (
          <div style={{ fontSize: ".85rem", lineHeight: 1.65, color: "var(--text-muted)", fontWeight: 550 }}
            dangerouslySetInnerHTML={{ __html: mdToHtml(insights) }} />
        )}
      </div>

      <div className="glass-panel tilt-card" style={{ padding: 20 }}>
        <div className="day-head">
          <h3 style={{ fontSize: ".88rem", fontWeight: 800, margin: 0 }}>Today&apos;s Study Load</h3>
          <span className="day-meta">{doneToday}/{todayTasks.length} done · {totalPlannedMin} min planned</span>
        </div>
        {!todayTasks.length && (
          <div style={{ fontSize: ".84rem", color: "var(--text-dim)" }}>
            Nothing scheduled today — rest day or plan not generated yet.
          </div>
        )}
        {todayTasks.map((task) => {
          const meta = KIND_META[task.kind] || KIND_META.learn;
          const subj = state.subjects.find((s) => s.id === task.subjectId);
          return (
            <div key={task.id} className={`task-row${task.status === "done" ? " done" : ""}${activeTaskId === task.id ? " active-clock" : ""}`}>
              <div className="task-dot" style={{ background: subj?.color || meta.color }} />
              <div style={{ flex: 1, minWidth: 0 }}>
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
              <button className="btn btn-xs btn-secondary" onClick={() => onFocusTask(task.id)}>Clock in</button>
              <button className={`btn btn-xs ${task.status === "done" ? "btn-secondary" : "btn-primary"}`}
                onClick={() => onTaskStatus(task.id, task.status === "done" ? "pending" : "done")}>
                {task.status === "done" ? "Undo" : "Done"}
              </button>
            </div>
          );
        })}
      </div>
      <TaskEditor
        state={state}
        task={state.tasks.find((x) => x.id === editingTaskId) || null}
        onClose={() => setEditingTaskId(null)}
        onSave={onTaskUpdate}
        onSkipSubject={onSkipSubject}
      />
    </div>
  );
}
