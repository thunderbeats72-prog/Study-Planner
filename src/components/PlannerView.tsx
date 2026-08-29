"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import StudyScene from "./StudyScene";
import {
  addDays, dayDiff, fmtDate, KIND_META, normalizeCheckpointTitle, parseDate, prettyDate, prettyLong, today, type AppState, type TaskRow,
} from "@/lib/client";
import { IconSpark, IconClose, IconChevron } from "./icons";
import TaskEditor, { type TaskPatch } from "./TaskEditor";
import TaskActions from "./TaskActions";
import { TaskLiveBadge } from "./TaskClockButton";
import QuickAdd from "./QuickAdd";
import { useBackClose } from "@/lib/useBackClose";
import { taskStudiedSuffix } from "@/lib/studyTime";
import type { QuickAddPayload } from "@/lib/quickAdd";

type View = "list" | "calendar";
type RenderTaskOptions = { showLessonBrief?: boolean; lastRow?: boolean };

export default function PlannerView({
  state, onTaskStatus, onTaskUpdate, onSkipSubject, onFocusTask, activeTaskId, activeClockSeconds,
  clockRunning, clockSessionActive, onClockOut, onAskTutor, replanning, onReplan, onAddTask,
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
  onClockOut: () => void;
  onAskTutor: (q: string) => void;
  replanning: boolean;
  onReplan: () => void;
  onAddTask: (input: QuickAddPayload) => void;
}) {
  const [view, setView] = useState<View>("list");
  const [filter, setFilter] = useState("all");
  const [openDay, setOpenDay] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<number | null>(null);
  const [editingTaskId, setEditingTaskId] = useState<number | null>(null);
  const [month, setMonth] = useState(() => {
    const d = new Date(); return { y: d.getFullYear(), m: d.getMonth() };
  });
  const [calDir, setCalDir] = useState<1 | -1 | 0>(0);
  const t = today();
  useBackClose(!!openDay, () => setOpenDay(null));

  // When a lesson brief opens, bring it into view. Inside the calendar's
  // day sheet the brief expands *below* the tapped task, which is usually
  // past the bottom edge of the sheet — without this, users tapped a task
  // and saw empty space and assumed the lesson/brief was missing.
  const briefRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (expanded == null) return;
    const timer = window.setTimeout(() => {
      const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
      briefRef.current?.scrollIntoView({ block: "nearest", behavior: reduce ? "auto" : "smooth" });
    }, 80);
    return () => window.clearTimeout(timer);
  }, [expanded]);

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

  // Workload glance — today's remaining work, tomorrow's plan, this week's total.
  const weekEnd = addDays(t, 6);
  const todayRemaining = state.tasks
    .filter((x) => x.date === t && x.status === "pending")
    .reduce((sum, x) => sum + x.plannedMinutes, 0);
  const todayPendingCount = state.tasks.filter((x) => x.date === t && x.status === "pending").length;
  const tomorrowPlanned = state.tasks
    .filter((x) => x.date === addDays(t, 1))
    .reduce((sum, x) => sum + x.plannedMinutes, 0);
  const weekList = state.tasks.filter((x) => x.date >= t && x.date <= weekEnd && x.status !== "skipped");
  const weekPlanned = weekList.reduce((sum, x) => sum + x.plannedMinutes, 0);
  const weekTaskCount = weekList.length;

  const topicFor = (task: TaskRow) => state.topics.find((x) => x.id === task.topicId);
  const subjFor = (task: TaskRow) => state.subjects.find((s) => s.id === task.subjectId);
  // The minute figures in the workload glance strip stay local to this view;
  // the per-task studied total is shared through lib/studyTime so Planner and
  // Dashboard word it identically.
  const fmtMin = (m: number) => {
    const r = Math.round(m * 10) / 10;
    return `${Number.isInteger(r) ? r : r.toFixed(1)}m`;
  };

  const renderTask = (task: TaskRow, options: RenderTaskOptions = {}) => {
    const meta = KIND_META[task.kind] || KIND_META.learn;
    const subj = subjFor(task);
    const topic = topicFor(task);
    const isCheckpoint = task.title.toLowerCase().includes("checkpoint") || (task.kind === "mock" && !task.subjectId);
    const kindLabel = isCheckpoint ? "Checkpoint" : meta.label;
    const dotColor = subj?.color || (isCheckpoint ? "var(--color-primary)" : meta.color);

    // Normalize any legacy "#0" or unspaced checkpoint titles (shared helper)
    const formattedTitle = isCheckpoint ? normalizeCheckpointTitle(task.title) : task.title;

    const showLessonBrief = options.showLessonBrief !== false;
    const canExpandLessonBrief = showLessonBrief && (!!topic || (isCheckpoint && !!task.detail));
    const open = canExpandLessonBrief && expanded === task.id;
    // Live state only while a session is actually open — Clock Out clears it
    // immediately and the row returns to rest with its studied minutes visible.
    const rowLive = !!clockSessionActive && activeTaskId === task.id;
    const studiedLabel = taskStudiedSuffix(state.sessions, task);
    return (
      <div key={task.id}>
        <div className={`task-row${task.status === "done" ? " done" : ""}${rowLive ? " active-clock" : ""}${options.lastRow ? " last-row" : ""}`}>
          <div className="task-dot" style={{ background: dotColor }} />
          <div className={`task-main${canExpandLessonBrief ? " is-expandable" : ""}`}
            role={canExpandLessonBrief ? "button" : undefined}
            tabIndex={canExpandLessonBrief ? 0 : undefined}
            aria-expanded={canExpandLessonBrief ? open : undefined}
            aria-label={canExpandLessonBrief ? `${open ? "Hide" : "Show"} lesson brief: ${formattedTitle}` : undefined}
            onClick={() => canExpandLessonBrief && setExpanded(open ? null : task.id)}
            onKeyDown={(e) => {
              if (canExpandLessonBrief && (e.key === "Enter" || e.key === " ")) {
                e.preventDefault();
                setExpanded(open ? null : task.id);
              }
            }}>
            <div className="task-title">
              {formattedTitle}
              {canExpandLessonBrief && (
                <span className={`brief-chev${open ? " open" : ""}`} aria-hidden="true"
                  title={open ? "Hide lesson brief" : "Show lesson brief"}>
                  <IconChevron size={12} />
                </span>
              )}
            </div>
            <div className="task-sub">
              <span className="chip chip-kind chip-tight">{kindLabel}</span>
              {` ${task.plannedMinutes} min`}
              {topic
                ? ` · ${topic.unit} · ${topic.difficulty}`
                : isCheckpoint
                ? ` · All Subjects · Comprehensive Review`
                : task.detail
                ? ` · ${task.detail}`
                : ""}
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
        {canExpandLessonBrief && open && topic && (
          <div ref={briefRef} className="glass-panel slide-in planner-lesson-brief accent-edge" style={{ "--edge": subj?.color || "var(--accent)" } as React.CSSProperties}>
            <div className="lesson-brief-heading">
              Lesson brief · {topic.unit} · {topic.depth || "Core"}
            </div>
            <div className="lesson-brief-title">{topic.title}</div>
            <div className="lesson-brief-meta">
              {subj && <span className="chip chip-kind">{subj.name}</span>}
              <span>{topic.difficulty} difficulty</span>
              <span>~{topic.estMinutes} min lesson</span>
              <span>Mastery {topic.mastery}%</span>
            </div>
            <div className="lesson-summary">{topic.summary}</div>
            {!!topic.prerequisites?.length && (
              <div className="lesson-detail-block compact">
                <strong>Before you start</strong>
                <span>{topic.prerequisites.join(" · ")}</span>
              </div>
            )}
            {!!topic.keyConcepts?.length && (
              <div className="lesson-concepts">
                {topic.keyConcepts.map((concept, i) => <span className="chip chip-kind" key={i}>{concept}</span>)}
              </div>
            )}
            {!!topic.objectives?.length && (
              <ul className="lesson-outcomes">
                {topic.objectives.map((o, i) => <li key={i}>{o}</li>)}
              </ul>
            )}
            {topic.practice && <div className="lesson-practice"><strong>Applied practice</strong><span>{topic.practice}</span></div>}
            {!!topic.sources?.length && (
              <div className="lesson-source-list compact" aria-label="Lesson sources">
                {topic.sources.map((source, i) => (
                  <div className="lesson-source" key={`${source.publisher}-${i}`}>
                    <span>{source.type}</span>
                    <div>
                      {source.url ? <a href={source.url} target="_blank" rel="noreferrer">{source.title}</a> : <b>{source.title}</b>}
                      <small>{source.publisher}{source.section ? ` · ${source.section}` : ""}</small>
                    </div>
                  </div>
                ))}
              </div>
            )}
            <div className="flex-row gap-sm lesson-brief-actions">
              <button className="btn btn-xs btn-primary" onClick={() => onAskTutor(`Explain "${topic.title}" from ${subj?.name || "my course"} step by step with an example. Address these outcomes: ${(topic.objectives || []).join("; ")}. Use the listed curriculum sources.`)}>
                <IconSpark size={12} /> Teach me this
              </button>
              <button className="btn btn-xs btn-secondary" onClick={() => onAskTutor(`Create a graded practice set for "${topic.title}" based on this requirement: ${topic.practice || "5 practice questions with answers"}.`)}>
                Practice questions
              </button>
            </div>
          </div>
        )}
        {canExpandLessonBrief && open && !topic && task.detail && (
          <div ref={briefRef} className="glass-panel slide-in planner-lesson-brief accent-edge" style={{ "--edge": "var(--accent)" } as React.CSSProperties}>
            <div className="lesson-brief-heading">
              Checkpoint brief · All Subjects · Comprehensive Review
            </div>
            <div className="lesson-brief-title">{formattedTitle}</div>
            <div className="lesson-brief-meta">
              <span className="chip chip-kind">All Subjects</span>
              <span className="chip chip-kind chip-tight">Checkpoint</span>
              <span>{task.plannedMinutes} min</span>
            </div>
            <div className="lesson-summary">{task.detail}</div>
            <div className="flex-row gap-sm lesson-brief-actions">
              <button className="btn btn-xs btn-primary" onClick={() => onAskTutor(`Generate a 5-question weekly checkpoint quiz covering all my subjects from the past week, with answers and explanations.`)}>
                <IconSpark size={12} /> Generate Checkpoint Quiz
              </button>
            </div>
          </div>
        )}
      </div>
    );
  };

  // calendar grid — six rows always, so switching between 5-row and 6-row
  // months never nudges the page height. `calDir` carries the direction of the
  // last month change so the CSS transition slides the grid the honest way.
  const first = new Date(month.y, month.m, 1);
  const startPad = first.getDay();
  const daysInMonth = new Date(month.y, month.m + 1, 0).getDate();
  const cells: (string | null)[] = [
    ...Array(startPad).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => fmtDate(new Date(month.y, month.m, i + 1))),
  ];
  while (cells.length < 42) cells.push(null);

  const isCurrentMonth = month.y === new Date(t).getFullYear() && month.m === new Date(t).getMonth();
  const goMonth = (delta: number) => {
    setCalDir(delta > 0 ? 1 : -1);
    setMonth((mm) => (mm.m === 0 && delta < 0 ? { y: mm.y - 1, m: 11 } : mm.m === 11 && delta > 0 ? { y: mm.y + 1, m: 0 } : { ...mm, m: mm.m + delta }));
  };
  const backToThisMonth = () => {
    const d = new Date();
    setCalDir(d.getFullYear() * 12 + d.getMonth() > month.y * 12 + month.m ? -1 : 1);
    setMonth({ y: d.getFullYear(), m: d.getMonth() });
  };

  const dayTasks = (d: string) => filtered.filter((x) => x.date === d);

  return (
    <div className="fade-in">
      <div className="page-header">
        <StudyScene variant="planner" className="page-header-scene" />
        <div>
          <h1 className="page-title">Study Planner</h1>
          <p className="page-subtitle">
            {state.tasks.length} tasks · {state.topics.length} lessons mapped · your plan rebalances automatically
          </p>
        </div>
        <div className="flex-row gap-md planner-tools">
          <div className="vtabs">
            {(["list", "calendar"] as View[]).map((v) => (
              <div key={v} className={`vtab${view === v ? " active" : ""}`} onClick={() => setView(v)}>
                {v[0].toUpperCase() + v.slice(1)}
              </div>
            ))}
          </div>
          <select className="input-field filter-select" value={filter} onChange={(e) => setFilter(e.target.value)}>
            <option value="all">All subjects</option>
            {state.subjects.map((s) => <option key={s.id} value={String(s.id)}>{s.name}</option>)}
          </select>
          <button className="btn btn-primary" onClick={onReplan} disabled={replanning} aria-busy={replanning}>
            <span className={replanning ? "replanning-spark" : ""}><IconSpark size={14} /></span>
            {replanning ? "Rebalancing schedule…" : "Rebalance schedule"}
          </button>
        </div>
      </div>

      {/* One-line workload glance: what remains today, tomorrow, this week. */}
      <div className="workload-strip glass-panel">
        <span className="workload-item">Today <strong>{fmtMin(todayRemaining)}</strong> to go · {todayPendingCount} left</span>
        <span className="workload-sep" aria-hidden="true" />
        <span className="workload-item">Tomorrow <strong>{fmtMin(tomorrowPlanned)}</strong> planned</span>
        <span className="workload-sep" aria-hidden="true" />
        <span className="workload-item">This week <strong>{fmtMin(weekPlanned)}</strong> planned · {weekTaskCount} tasks</span>
      </div>

      <div className="planner-quickadd-row">
        <QuickAdd state={state} onAdd={onAddTask} />
      </div>

      {overdue.length > 0 && (
        <div className="glass-panel section-card accent-edge accent-edge--warning overdue-strip">
          <div className="overdue-title">
            {overdue.length} task{overdue.length > 1 ? "s" : ""} from earlier days are still pending.
          </div>
          <div className="panel-lead">
            Don&apos;t cram them into today — let the engine redistribute them across your remaining days.
          </div>
          <button className="btn btn-sm btn-primary" onClick={onReplan} disabled={replanning} aria-busy={replanning}>
            {replanning && <span className="replanning-spark"><IconSpark size={12} /></span>}
            {replanning ? "Moving overdue work…" : "Rebalance my schedule"}
          </button>
        </div>
      )}

      {view === "list" && (
        <div className="planner-list">
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
          <div className="planner-days">
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
                  <div className="bar-track daybar">
                    <div className="bar-fill" style={{ width: `${list.length ? (done / list.length) * 100 : 0}%` }} />
                  </div>
                </div>
                {list.map((task, index) => renderTask(task, { lastRow: index === list.length - 1 }))}
              </div>
            );
          })}
          </div>
        </div>
      )}

      {view === "calendar" && (
        <div className="glass-panel section-card cal-panel">
          <div className="day-head cal-nav-row">
            <div className="day-date">{first.toLocaleDateString(undefined, { month: "long", year: "numeric" })}</div>
            <div className="cal-nav-group">
              {!isCurrentMonth && (
                <button type="button" className="btn btn-xs btn-secondary cal-today-btn" onClick={backToThisMonth}>Today</button>
              )}
              <button type="button" className="cal-nav-btn" aria-label="Previous month" onClick={() => goMonth(-1)}>
                <span className="cal-nav-ico cal-nav-ico--prev" aria-hidden="true"><IconChevron size={13} /></span>
              </button>
              <button type="button" className="cal-nav-btn" aria-label="Next month" onClick={() => goMonth(1)}>
                <span className="cal-nav-ico cal-nav-ico--next" aria-hidden="true"><IconChevron size={13} /></span>
              </button>
            </div>
          </div>
          <div
            key={`${month.y}-${month.m}`}
            className={`cal-grid${calDir > 0 ? " cal-slide-next" : calDir < 0 ? " cal-slide-prev" : ""}`}
          >
            {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d) => <div className="cal-dow" key={d}>{d}</div>)}
            {cells.map((d, i) => {
              if (!d) return <div className="cal-cell empty" key={`e${i}`} aria-hidden="true" />;
              const list = dayTasks(d);
              // Soft per-day tint from the first task's subject colour, so a
              // glance at the month shows where the load is — on phones too.
              const tint = list.length
                ? subjFor(list[0])?.color || (KIND_META[list[0].kind] || KIND_META.learn).color
                : null;
              return (
                <div key={d} className={`cal-cell${d === t ? " today" : ""}${list.length ? " has-tasks" : ""}${openDay === d ? " is-selected" : ""}`}
                  role={list.length ? "button" : undefined}
                  tabIndex={list.length ? 0 : undefined}
                  aria-label={list.length ? `${prettyDate(d)} — ${list.length} task${list.length > 1 ? "s" : ""} planned` : undefined}
                  style={tint ? ({ "--cell-tint": tint } as React.CSSProperties) : undefined}
                  onClick={() => list.length && setOpenDay(d)}
                  onKeyDown={(e) => { if (list.length && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); setOpenDay(d); } }}>
                  <div className="cal-num">{parseDate(d).getDate()}</div>
                  {list.slice(0, 3).map((task) => {
                    const c = subjFor(task)?.color || (KIND_META[task.kind] || KIND_META.learn).color;
                    return <div key={task.id} className="cal-pill" style={{ background: c, opacity: task.status === "done" ? 0.45 : 1 }}>{task.title}</div>;
                  })}
                  {list.length > 3 && <div className="cal-more">+{list.length - 3} more</div>}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {openDay && (
        <div className="modal-overlay" onClick={() => setOpenDay(null)}>
          <div className="glass-panel modal-box day-modal" onClick={(e) => e.stopPropagation()}>
            <div className="day-head">
              <div>
                <div className="day-date">{prettyLong(openDay)}</div>
                <div className="day-meta">{dayTasks(openDay).length} tasks scheduled</div>
              </div>
              <button className="btn btn-xs btn-secondary" onClick={() => setOpenDay(null)}><IconClose size={13} /></button>
            </div>
            {dayTasks(openDay).map((task) => renderTask(task, { showLessonBrief: false }))}
            <button className="btn btn-secondary w-full mt-md" onClick={() => setOpenDay(null)}>Close</button>
          </div>
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
