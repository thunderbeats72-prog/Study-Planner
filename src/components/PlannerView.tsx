"use client";

import React, { useMemo, useState } from "react";
import {
  addDays, dayDiff, fmtDate, KIND_META, parseDate, prettyDate, prettyLong, today, type AppState, type TaskRow,
} from "@/lib/client";
import { IconSpark, IconClose } from "./icons";
import TaskEditor, { type TaskPatch } from "./TaskEditor";
import { useBackClose } from "@/lib/useBackClose";

type View = "list" | "calendar" | "kanban";

export default function PlannerView({
  state, onTaskStatus, onTaskUpdate, onSkipSubject, onFocusTask, activeTaskId, activeClockSeconds, onAskTutor, replanning, onReplan,
}: {
  state: AppState;
  onTaskStatus: (id: number, status: string, rating?: number) => void;
  onTaskUpdate: (id: number, patch: TaskPatch) => void;
  onSkipSubject: (subjectId: number, date: string) => void;
  onFocusTask: (taskId: number) => void;
  activeTaskId?: number | null;
  activeClockSeconds?: number;
  onAskTutor: (q: string) => void;
  replanning: boolean;
  onReplan: () => void;
}) {
  const [view, setView] = useState<View>("list");
  const [filter, setFilter] = useState("all");
  const [openDay, setOpenDay] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<number | null>(null);
  const [editingTaskId, setEditingTaskId] = useState<number | null>(null);
  const [ratingTaskId, setRatingTaskId] = useState<number | null>(null);
  const [moreActionsId, setMoreActionsId] = useState<number | null>(null);
  const [month, setMonth] = useState(() => {
    const d = new Date(); return { y: d.getFullYear(), m: d.getMonth() };
  });
  const t = today();
  useBackClose(!!openDay, () => setOpenDay(null));

  const filtered = useMemo(() => {
    let list = state.tasks;
    if (filter !== "all") list = list.filter((x) => String(x.subjectId) === filter);
    return list;
  }, [state.tasks, filter]);

  const grouped = useMemo(() => {
    const map = new Map<string, TaskRow[]>();
    for (const task of filtered) {
      if (!map.has(task.date)) map.set(task.date, []);
      map.get(task.date)!.push(task);
    }
    return [...map.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [filtered]);

  const upcoming = grouped.filter(([d]) => dayDiff(d, t) <= 0);
  const overdue = grouped.filter(([d]) => dayDiff(d, t) > 0 && d !== t).flatMap(([, v]) => v).filter((x) => x.status === "pending");

  const topicFor = (task: TaskRow) => state.topics.find((x) => x.id === task.topicId);
  const subjFor = (task: TaskRow) => state.subjects.find((s) => s.id === task.subjectId);
  const taskLogged = (taskId: number) => {
    const sum = state.sessions.filter((x) => x.taskId === taskId).reduce((a, x) => a + x.minutes, 0);
    return Math.round(sum * 100) / 100;
  };
  // 13.5 minutes displays as "13.5m" — never rounded to a different number
  const fmtMin = (m: number) => {
    const r = Math.round(m * 10) / 10;
    return `${Number.isInteger(r) ? r : r.toFixed(1)}m`;
  };

  const renderTask = (task: TaskRow) => {
    const meta = KIND_META[task.kind] || KIND_META.learn;
    const subj = subjFor(task);
    const topic = topicFor(task);
    const open = expanded === task.id;
    return (
      <div key={task.id}>
        <div className={`task-row${task.status === "done" ? " done" : ""}${activeTaskId === task.id ? " active-clock" : ""}${moreActionsId === task.id ? " expanded-actions" : ""}`}>
          <div className="task-dot" style={{ background: subj?.color || meta.color }} />
          <div className="task-main" style={{ cursor: topic ? "pointer" : "default" }}
            onClick={() => topic && setExpanded(open ? null : task.id)}>
            <div className="task-title">{task.title}</div>
            <div className="task-sub">
              <span className="chip chip-kind" style={{ marginRight: 6 }}>{meta.label}</span>
              {task.plannedMinutes} min
              {topic ? ` · ${topic.unit} · ${topic.difficulty}` : ""}
              {taskLogged(task.id) ? ` · ${fmtMin(taskLogged(task.id))} logged` : task.actualMinutes ? ` · ${task.actualMinutes}m logged` : ""}
              {activeTaskId === task.id && activeClockSeconds ? ` · live +${Math.floor(activeClockSeconds / 60)}m ${activeClockSeconds % 60}s` : ""}
            </div>
          </div>
          <span className={`chip chip-${task.status}`}>{task.status}</span>
          <button className="btn btn-xs btn-secondary" onClick={() => setEditingTaskId(task.id)}>Edit</button>
          {subj && task.status !== "skipped" && (
            <button className="btn btn-xs btn-secondary" title="Skip all tasks for this subject today"
              onClick={() => onSkipSubject(subj.id, task.date)}>Skip subject</button>
          )}
          <button className="btn btn-xs btn-secondary task-clock" onClick={() => onFocusTask(task.id)}>Clock in</button>
          <button className="btn btn-xs btn-secondary task-more" aria-label="More actions"
            onClick={() => setMoreActionsId(moreActionsId === task.id ? null : task.id)}>⋯</button>
          <button className={`btn btn-xs task-primary ${task.status === "done" ? "btn-secondary" : "btn-primary"}`}
            onClick={() => {
              if (task.status === "done") { onTaskStatus(task.id, "pending"); return; }
              // Recall/revision tasks ask for a memory rating — that one tap
              // trains the spaced-repetition model that schedules reviews.
              if (task.kind === "revise" && task.topicId) { setRatingTaskId(ratingTaskId === task.id ? null : task.id); return; }
              onTaskStatus(task.id, "done");
            }}>
            {task.status === "done" ? "Undo" : "Done"}
          </button>
          {task.status !== "skipped" && (
            <button className="btn btn-xs btn-secondary" title="Skip"
              onClick={() => onTaskStatus(task.id, "skipped")}>Skip</button>
          )}
        </div>
        {ratingTaskId === task.id && task.status !== "done" && (
          <div className="rating-strip glass-panel slide-in">
            <span className="rating-q">How well did you recall it?</span>
            <div className="rating-btns">
              <button className="rate-btn rate-again" onClick={() => { setRatingTaskId(null); onTaskStatus(task.id, "done", 1); }}>Again</button>
              <button className="rate-btn rate-hard" onClick={() => { setRatingTaskId(null); onTaskStatus(task.id, "done", 2); }}>Hard</button>
              <button className="rate-btn rate-good" onClick={() => { setRatingTaskId(null); onTaskStatus(task.id, "done", 3); }}>Good</button>
              <button className="rate-btn rate-easy" onClick={() => { setRatingTaskId(null); onTaskStatus(task.id, "done", 4); }}>Easy</button>
            </div>
          </div>
        )}
        {open && topic && (
          <div className="glass-panel slide-in" style={{ padding: 16, margin: "0 0 10px 22px", borderLeft: `3px solid ${subj?.color || "var(--accent)"}` }}>
            <div style={{ fontSize: ".74rem", fontWeight: 800, textTransform: "uppercase", letterSpacing: ".7px", color: "var(--text-muted)", marginBottom: 6 }}>
              Lesson brief · {topic.unit}
            </div>
            <div style={{ fontSize: ".86rem", fontWeight: 650, marginBottom: 10, lineHeight: 1.55 }}>{topic.summary}</div>
            {!!topic.objectives?.length && (
              <ul style={{ margin: "0 0 12px", paddingLeft: 18, fontSize: ".82rem", color: "var(--text-muted)", lineHeight: 1.7, fontWeight: 550 }}>
                {topic.objectives.map((o, i) => <li key={i}>{o}</li>)}
              </ul>
            )}
            <div className="flex-row gap-sm" style={{ flexWrap: "wrap" }}>
              <div className="chip chip-kind">Mastery {topic.mastery}%</div>
              <button className="btn btn-xs btn-primary" onClick={() => onAskTutor(`Explain "${topic.title}" from ${subj?.name || "my course"} step by step with an example.`)}>
                <IconSpark size={12} /> Teach me this
              </button>
              <button className="btn btn-xs btn-secondary" onClick={() => onAskTutor(`Give me 5 practice questions on "${topic.title}" with answers.`)}>
                Practice questions
              </button>
            </div>
          </div>
        )}
      </div>
    );
  };

  // calendar grid
  const first = new Date(month.y, month.m, 1);
  const startPad = first.getDay();
  const daysInMonth = new Date(month.y, month.m + 1, 0).getDate();
  const cells: (string | null)[] = [
    ...Array(startPad).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => fmtDate(new Date(month.y, month.m, i + 1))),
  ];

  const dayTasks = (d: string) => filtered.filter((x) => x.date === d);

  return (
    <div className="fade-in">
      <div className="page-header">
        <div>
          <h1 className="page-title">Study Planner</h1>
          <p className="page-subtitle">
            Lesson-wise adaptive schedule · {state.tasks.length} tasks · {state.topics.length} lessons mapped
          </p>
        </div>
        <div className="flex-row gap-md" style={{ flexWrap: "wrap" }}>
          <div className="vtabs">
            {(["list", "calendar", "kanban"] as View[]).map((v) => (
              <div key={v} className={`vtab${view === v ? " active" : ""}`} onClick={() => setView(v)}>
                {v[0].toUpperCase() + v.slice(1)}
              </div>
            ))}
          </div>
          <select className="input-field" style={{ width: "auto", height: 38 }} value={filter} onChange={(e) => setFilter(e.target.value)}>
            <option value="all">All subjects</option>
            {state.subjects.map((s) => <option key={s.id} value={String(s.id)}>{s.name}</option>)}
          </select>
          <button className="btn btn-primary" onClick={onReplan} disabled={replanning}>
            <IconSpark size={14} />{replanning ? "Re-planning…" : "Re-plan"}
          </button>
        </div>
      </div>

      {overdue.length > 0 && (
        <div className="glass-panel" style={{ padding: 16, marginBottom: 16, borderLeft: "4px solid var(--warning-accent)" }}>
          <div style={{ fontSize: ".85rem", fontWeight: 750 }}>
            {overdue.length} task{overdue.length > 1 ? "s" : ""} from earlier days are still pending.
          </div>
          <div style={{ fontSize: ".78rem", color: "var(--text-muted)", marginTop: 4, marginBottom: 10 }}>
            Don&apos;t cram them into today — let the engine redistribute them across your remaining days.
          </div>
          <button className="btn btn-sm btn-primary" onClick={onReplan} disabled={replanning}>Rebalance my schedule</button>
        </div>
      )}

      {view === "list" && (
        <div>
          {!upcoming.length && (
            <div className="glass-panel">
              <div className="empty-state">
                <div className="empty-state-icon">
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="3" y="4" width="18" height="18" rx="3" /><path d="M16 2v4M8 2v4M3 10h18" />
                  </svg>
                </div>
                <h4 className="empty-state-title">No upcoming sessions</h4>
                <p className="empty-state-sub">Generate the next stretch of your schedule and your daily plan will appear here.</p>
                <button className="btn btn-primary btn-sm" onClick={onReplan} disabled={replanning}>
                  {replanning ? "Re-planning…" : "Generate Plan"}
                </button>
              </div>
            </div>
          )}
          {upcoming.map(([date, list]) => {
            const done = list.filter((x) => x.status === "done").length;
            const mins = list.reduce((a, x) => a + x.plannedMinutes, 0);
            return (
              <div className="glass-panel tilt-card day-block" key={date}>
                <div className="day-head">
                  <div>
                    <div className="day-date">
                      {date === t ? "Today · " : dayDiff(date, t) === -1 ? "Tomorrow · " : ""}{prettyDate(date)}
                    </div>
                    <div className="day-meta">{list.length} tasks · {mins} min · {done} done</div>
                  </div>
                  <div className="bar-track" style={{ width: "min(120px, 30vw)" }}>
                    <div className="bar-fill" style={{ width: `${list.length ? (done / list.length) * 100 : 0}%` }} />
                  </div>
                </div>
                {list.map(renderTask)}
              </div>
            );
          })}
        </div>
      )}

      {view === "calendar" && (
        <div className="glass-panel" style={{ padding: 18 }}>
          <div className="day-head">
            <div className="day-date">{first.toLocaleDateString(undefined, { month: "long", year: "numeric" })}</div>
            <div className="flex-row gap-sm">
              <button className="btn btn-xs btn-secondary" onClick={() => setMonth((mm) => (mm.m === 0 ? { y: mm.y - 1, m: 11 } : { ...mm, m: mm.m - 1 }))}>‹ Prev</button>
              <button className="btn btn-xs btn-secondary" onClick={() => setMonth((mm) => (mm.m === 11 ? { y: mm.y + 1, m: 0 } : { ...mm, m: mm.m + 1 }))}>Next ›</button>
            </div>
          </div>
          <div className="cal-grid" style={{ marginBottom: 6 }}>
            {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d) => <div className="cal-dow" key={d}>{d}</div>)}
          </div>
          <div className="cal-grid">
            {cells.map((d, i) => {
              if (!d) return <div className="cal-cell empty" key={`e${i}`} />;
              const list = dayTasks(d);
              return (
                <div key={d} className={`cal-cell${d === t ? " today" : ""}`} onClick={() => list.length && setOpenDay(d)}>
                  <div className="cal-num">{parseDate(d).getDate()}</div>
                  {list.slice(0, 3).map((task) => {
                    const c = subjFor(task)?.color || (KIND_META[task.kind] || KIND_META.learn).color;
                    return <div key={task.id} className="cal-pill" style={{ background: c, opacity: task.status === "done" ? 0.45 : 1 }}>{task.title}</div>;
                  })}
                  {list.length > 3 && <div style={{ fontSize: ".6rem", fontWeight: 700, color: "var(--text-muted)" }}>+{list.length - 3} more</div>}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {view === "kanban" && (
        <div className="kanban">
          {(["pending", "done", "skipped"] as const).map((col) => {
            const list = filtered.filter((x) => x.status === col && dayDiff(x.date, t) >= -21).slice(0, 40);
            return (
              <div className="glass-panel kan-col" key={col}>
                <div className="kan-title">{col} · {list.length}</div>
                {list.map((task) => {
                  const c = subjFor(task)?.color || (KIND_META[task.kind] || KIND_META.learn).color;
                  return (
                    <div className="task-row" key={task.id} style={{ alignItems: "flex-start" }}>
                      <div className="task-dot" style={{ background: c, marginTop: 5 }} />
                      <div className="task-main">
                        <div className="task-title">{task.title}</div>
                        <div className="task-sub">{prettyDate(task.date)} · {task.plannedMinutes}m</div>
                        <div className="flex-row gap-sm" style={{ marginTop: 6 }}>
                          <button className="btn btn-xs btn-secondary" onClick={() => setEditingTaskId(task.id)}>Edit</button>
                          {col !== "done" && <button className="btn btn-xs btn-primary" onClick={() => onTaskStatus(task.id, "done")}>Done</button>}
                          {col !== "pending" && <button className="btn btn-xs btn-secondary" onClick={() => onTaskStatus(task.id, "pending")}>Reopen</button>}
                        </div>
                      </div>
                    </div>
                  );
                })}
                {!list.length && <div style={{ fontSize: ".78rem", color: "var(--text-dim)" }}>Nothing here.</div>}
              </div>
            );
          })}
        </div>
      )}

      {openDay && (
        <div className="modal-overlay" onClick={() => setOpenDay(null)}>
          <div className="glass-panel modal-box" onClick={(e) => e.stopPropagation()}>
            <div className="day-head">
              <div>
                <div className="day-date">{prettyLong(openDay)}</div>
                <div className="day-meta">{dayTasks(openDay).length} tasks scheduled</div>
              </div>
              <button className="btn btn-xs btn-secondary" onClick={() => setOpenDay(null)}><IconClose size={13} /></button>
            </div>
            {dayTasks(openDay).map(renderTask)}
            <button className="btn btn-secondary w-full mt-md" onClick={() => setOpenDay(null)}>Close</button>
          </div>
        </div>
      )}

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
