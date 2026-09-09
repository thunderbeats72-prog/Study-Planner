"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  dayDiff, fmtDate, KIND_META, normalizeCheckpointTitle,
  prettyLong, today, type AppState, type TaskRow,
} from "@/lib/client";
import {
  IconCalendar, IconCheck, IconChevron, IconClose, IconEdit,
  IconList, IconRefresh, IconSpark,
} from "./icons";
import TaskEditor, { type TaskPatch } from "./TaskEditor";
import TaskActions from "./TaskActions";
import { TaskLiveBadge } from "./TaskClockButton";
import QuickAdd from "./QuickAdd";
import { CalendarScene } from "./Illustrations";
import { PageHead, Seg, StatusChip, KindChip, KindIcon } from "./bits";
import { Reveal } from "@/lib/fx";
import { useBackClose } from "@/lib/useBackClose";
import type { QuickAddPayload } from "@/lib/quickAdd";
import { cn } from "@/lib/cn";

/* Two focused views — the Kanban board was retired in favour of the
   List + Calendar pair; kind is now communicated by icon, not column. */
type View = "list" | "calendar";

function isCheckpointTask(task: TaskRow): boolean {
  return task.kind === "checkpoint" || (!!task.title && task.title.toLowerCase().startsWith("checkpoint:"));
}

export default function PlannerView({
  state,
  onTaskStatus,
  onTaskUpdate,
  onSkipSubject,
  onFocusTask,
  activeTaskId,
  activeClockSeconds,
  clockRunning,
  clockSessionActive,
  onClockOut,
  onAskTutor,
  replanning,
  onReplan,
  onAddTask,
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
  const [monthOff, setMonthOff] = useState(0);

  const t = today();
  useBackClose(!!openDay, () => setOpenDay(null));

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

  const topicFor = (task: TaskRow) => state.topics.find((x) => x.id === task.topicId);
  const subjFor = (task: TaskRow) => state.subjects.find((s) => s.id === task.subjectId);
  const taskLogged = (taskId: number) => {
    const sum = state.sessions.filter((x) => x.taskId === taskId).reduce((a, x) => a + x.minutes, 0);
    return Math.round(sum * 100) / 100;
  };
  const fmtMin = (m: number) => {
    const r = Math.round(m * 10) / 10;
    return `${Number.isInteger(r) ? r : r.toFixed(1)}m`;
  };

  /* Calendar calculations */
  const baseDate = new Date();
  const mDate = new Date(baseDate.getFullYear(), baseDate.getMonth() + monthOff, 1);
  const firstDow = mDate.getDay();
  const daysInMonth = new Date(mDate.getFullYear(), mDate.getMonth() + 1, 0).getDate();

  /* Chronological day headers read like the reference: a relative flag
     (Today · Tomorrow · Unfinished · In n days) beside the date, so the
     list always tells you where you are in the week at a glance. */
  const dayFlag = (dateKey: string, dayTasks: TaskRow[]) => {
    const diff = dayDiff(today(), dateKey);
    if (diff === 0) return { label: "Today", cls: "" };
    if (diff === 1) return { label: "Tomorrow", cls: "day-flag--future" };
    if (diff < 0) {
      const open = dayTasks.some((tk) => tk.status === "pending");
      return open
        ? { label: "Unfinished", cls: "day-flag--warn" }
        : null; // fully handled past days need no flag — the ✓ chip speaks
    }
    if (diff <= 7) return { label: `In ${diff} days`, cls: "day-flag--future" };
    return null;
  };

  return (
    <div className="space-y-6 fade-in">
      <PageHead
        eyebrow="STUDY PLANNER"
        title="Adaptive Schedule"
        sub={`Lesson-wise intelligent schedule · ${state.tasks.length} total tasks · ${state.topics.length} curriculum lessons mapped`}
        art={<CalendarScene />}
      />

      {/* ── CONTROLS ROW ── */}
      <Reveal>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-3">
            <Seg
              value={view}
              onChange={setView}
              options={[
                { v: "list", label: "List", icon: <IconList size={15} /> },
                { v: "calendar", label: "Calendar", icon: <IconCalendar size={15} /> },
              ]}
            />
            <select
              className="input-field w-auto min-w-[170px]"
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              aria-label="Filter by subject"
            >
              <option value="all">All subjects ({state.subjects.length})</option>
              {state.subjects.map((sb) => (
                <option key={sb.id} value={String(sb.id)}>
                  {sb.name}
                </option>
              ))}
            </select>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <QuickAdd state={state} onAdd={onAddTask} />
            <button
              type="button"
              className="btn btn-secondary"
              onClick={onReplan}
              disabled={replanning}
              aria-busy={replanning}
            >
              <IconRefresh size={15} className={replanning ? "anim-spin" : ""} />
              <span>{replanning ? "Re-planning…" : "Rebalance Schedule"}</span>
            </button>
          </div>
        </div>
      </Reveal>

      {/* ── 1. LIST VIEW ── */}
      {view === "list" && (
        <div className="space-y-4">
          {grouped.length === 0 && (
            <div className="glass-panel tilt-card section-card p-8 text-center">
              <p className="text-[14px] font-semibold" style={{ color: "var(--text-dim, #5f5a7a)" }}>
                No tasks match the active filter.
              </p>
            </div>
          )}

          {grouped.map(([dateKey, tasksForDay], i) => {
            const isToday = dateKey === t;
            const dayMins = tasksForDay.reduce((a, b) => a + b.plannedMinutes, 0);
            const doneCount = tasksForDay.filter((tk) => tk.status === "done").length;
            const allDone = doneCount === tasksForDay.length && tasksForDay.length > 0;
            const flag = dayFlag(dateKey, tasksForDay);

            return (
              <Reveal key={dateKey} delay={Math.min(i, 6) * 45}>
                <div
                  className={cn(
                    "glass-panel tilt-card section-card overflow-hidden",
                    isToday && "accent-edge accent-edge--primary"
                  )}
                >
                  <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--border-subtle,#e4e0f1)] bg-[var(--surface-2,#f4f2fc)] px-4 py-3 sm:px-5">
                    <div className="flex items-center gap-2.5">
                      <span className="grid h-8 w-8 shrink-0 place-items-center rounded-xl bg-[color-mix(in_oklab,var(--accent,#6366f1)_14%,transparent)] text-[var(--accent,#6366f1)]">
                        <IconCalendar size={15} />
                      </span>
                      <div>
                        <span className="flex flex-wrap items-center text-[14.5px] font-extrabold tracking-tight" style={{ color: "var(--text-main, #211a3a)" }}>
                          {prettyLong(dateKey)}
                          {flag && <span className={cn("day-flag", flag.cls)}>{flag.label}</span>}
                        </span>
                        <span className="mono ml-3 text-[12px] font-semibold" style={{ color: "var(--text-dim, #5f5a7a)" }}>
                          {tasksForDay.length} tasks · {dayMins} min · {doneCount} done
                        </span>
                      </div>
                    </div>
                    {allDone && (
                      <span className="flex items-center gap-1 text-[12px] font-bold text-[var(--success-accent,#2e9e6d)]">
                        <IconCheck size={14} /> Completed
                      </span>
                    )}
                  </div>

                  <div className="divide-y divide-[var(--border-subtle,#e4e0f1)]">
                    {tasksForDay.map((task) => {
                      const meta = KIND_META[task.kind] || KIND_META.learn;
                      const subj = subjFor(task);
                      const topic = topicFor(task);
                      const isCheckpoint = isCheckpointTask(task);
                      const kindLabel = isCheckpoint ? "Checkpoint" : meta.label;
                      const dotColor = subj?.color || (isCheckpoint ? "var(--color-primary)" : meta.color);
                      const formattedTitle = isCheckpoint ? normalizeCheckpointTitle(task.title) : task.title;
                      const isDone = task.status === "done";
                      const canExpand = !!topic || (isCheckpoint && !!task.detail);
                      const isOpen = canExpand && expanded === task.id;

                      return (
                        <div key={task.id} className="transition-colors">
                          <div
                            className={cn(
                              "flex flex-wrap items-center gap-3 px-4 py-3.5 sm:px-5",
                              activeTaskId === task.id && "bg-[color-mix(in_oklab,var(--accent,#6366f1)_8%,transparent)]"
                            )}
                          >
                            <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: dotColor }} />
                            <KindIcon kind={task.kind} color={dotColor} />
                            <div className="min-w-0 flex-1 basis-56">
                              <p className={cn("truncate text-[14px] font-bold", isDone && "line-through opacity-50")} style={{ color: "var(--text-main, #211a3a)" }}>
                                {formattedTitle}
                              </p>
                              <p className="mt-0.5 flex flex-wrap items-center gap-2 text-[11.5px] font-semibold" style={{ color: "var(--text-dim, #5f5a7a)" }}>
                                <KindChip kind={task.kind} color={dotColor} />
                                <span className="mono">
                                  {task.plannedMinutes} min
                                  {topic?.unit && ` · ${topic.unit}`}
                                  {topic?.difficulty && ` · ${topic.difficulty}`}
                                </span>
                                {taskLogged(task.id) > 0 && (
                                  <span className="mono font-bold text-[var(--success-accent,#2e9e6d)]">
                                    {fmtMin(taskLogged(task.id))} logged
                                  </span>
                                )}
                                {activeTaskId === task.id && (
                                  <TaskLiveBadge seconds={activeClockSeconds} running={clockRunning} />
                                )}
                              </p>
                            </div>

                            <div className="flex items-center gap-2">
                              {canExpand && (
                                <button
                                  type="button"
                                  className="btn btn-xs btn-ghost"
                                  onClick={() => setExpanded(isOpen ? null : task.id)}
                                >
                                  {isOpen ? "Hide brief" : "Lesson brief"}
                                </button>
                              )}
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
                          </div>

                          {/* Expandable lesson brief */}
                          {isOpen && (
                            <div ref={briefRef} className="border-t border-[var(--border-subtle,#e4e0f1)] bg-[var(--surface-2,#f4f2fc)] p-4 sm:p-5 slide-in">
                              {topic && (
                                <div className="space-y-3">
                                  <p className="text-[13.5px] font-medium leading-relaxed" style={{ color: "var(--text-main, #211a3a)" }}>
                                    {topic.summary}
                                  </p>
                                  {topic.prerequisites?.length > 0 && (
                                    <div className="text-[12px]">
                                      <strong className="block mb-1 text-[var(--text-dim,#5f5a7a)]">Prerequisites:</strong>
                                      <ul className="list-disc pl-4 space-y-0.5" style={{ color: "var(--text-main, #211a3a)" }}>
                                        {topic.prerequisites.map((pr, pi) => <li key={pi}>{pr}</li>)}
                                      </ul>
                                    </div>
                                  )}
                                  {topic.keyConcepts?.length > 0 && (
                                    <div className="flex flex-wrap items-center gap-1.5 pt-1">
                                      {topic.keyConcepts.map((kc, ki) => (
                                        <span key={ki} className="chip chip-kind chip-tight">{kc}</span>
                                      ))}
                                    </div>
                                  )}
                                  <div className="flex justify-end pt-2">
                                    <button
                                      type="button"
                                      className="btn btn-xs btn-primary"
                                      onClick={() => onAskTutor(`Teach me "${topic.title}" from ${subj?.name || "the syllabus"}. Explain key concepts and give a worked example.`)}
                                    >
                                      <IconSpark size={13} /> Ask Tutor to Teach This
                                    </button>
                                  </div>
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              </Reveal>
            );
          })}
        </div>
      )}

      {/* ── 2. CALENDAR VIEW ── */}
      {view === "calendar" && (
        <Reveal>
          <div className="glass-panel tilt-card section-card overflow-hidden">
            <div className="flex items-center justify-between border-b border-[var(--border-subtle,#e4e0f1)] bg-[var(--surface-2,#f4f2fc)] px-5 py-3.5">
              <button
                type="button"
                className="btn btn-xs btn-ghost btn-icon"
                aria-label="Previous month"
                onClick={() => setMonthOff((m) => m - 1)}
              >
                <IconChevron size={14} style={{ transform: "rotate(90deg)" }} />
              </button>
              <h3 className="text-[16px] font-extrabold tracking-tight" style={{ color: "var(--text-main, #211a3a)" }}>
                {mDate.toLocaleDateString(undefined, { month: "long", year: "numeric" })}
              </h3>
              <button
                type="button"
                className="btn btn-xs btn-ghost btn-icon"
                aria-label="Next month"
                onClick={() => setMonthOff((m) => m + 1)}
              >
                <IconChevron size={14} style={{ transform: "rotate(-90deg)" }} />
              </button>
            </div>

            <div className="grid grid-cols-7 border-b border-[var(--border-subtle,#e4e0f1)] bg-[var(--surface-2,#f4f2fc)]">
              {["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"].map((d) => (
                <span key={d} className="mono py-2 text-center text-[11px] font-extrabold tracking-wider" style={{ color: "var(--text-dim, #5f5a7a)" }}>
                  {d}
                </span>
              ))}
            </div>

            <div className="grid grid-cols-7">
              {Array.from({ length: firstDow }, (_, i) => (
                <div key={`empty-${i}`} className="min-h-20 border-b border-r border-[var(--border-subtle,#e4e0f1)] bg-[var(--surface-2,#f4f2fc)]/40 sm:min-h-24" />
              ))}

              {Array.from({ length: daysInMonth }, (_, i) => {
                const dateKey = fmtDate(new Date(mDate.getFullYear(), mDate.getMonth(), i + 1));
                const dayTasks = filtered.filter((tk) => tk.date === dateKey);
                const isToday = dateKey === t;

                return (
                  <button
                    key={dateKey}
                    type="button"
                    onClick={() => dayTasks.length > 0 && setOpenDay(dateKey)}
                    className={cn(
                      "min-h-20 border-b border-r border-[var(--border-subtle,#e4e0f1)] p-2 text-left align-top transition-colors hover:bg-[var(--surface-2,#f4f2fc)] sm:min-h-24",
                      dayTasks.length === 0 && "cursor-default"
                    )}
                  >
                    <span
                      className={cn(
                        "mono mb-1 grid h-6 w-6 place-items-center rounded-full text-[11px] font-bold",
                        isToday ? "bg-[var(--accent,#6366f1)] text-[var(--accent-ink,#ffffff)]" : "text-[var(--text-main,#211a3a)]"
                      )}
                    >
                      {i + 1}
                    </span>
                    <div className="hidden sm:flex flex-col gap-1">
                      {dayTasks.slice(0, 3).map((tk) => {
                        const sb = subjFor(tk);
                        const isDone = tk.status === "done";
                        return (
                          <span
                            key={tk.id}
                            className={cn(
                              "truncate rounded px-1.5 py-0.5 text-[10px] font-bold",
                              isDone && "line-through opacity-45"
                            )}
                            style={{
                              background: `color-mix(in oklab, ${sb?.color || "var(--accent,#6366f1)"} 16%, transparent)`,
                              color: sb?.color || "var(--accent,#6366f1)",
                            }}
                          >
                            {tk.title}
                          </span>
                        );
                      })}
                      {dayTasks.length > 3 && (
                        <span className="mono text-[10px] font-bold text-[var(--text-dim,#5f5a7a)]">
                          +{dayTasks.length - 3} more
                        </span>
                      )}
                    </div>
                    <span className="mono text-[10.5px] font-bold text-[var(--accent,#6366f1)] sm:hidden">
                      {dayTasks.length > 0 && `${dayTasks.length} tasks`}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        </Reveal>
      )}

      {/* Task Editor Modal */}
      {editingTaskId !== null && (
        <TaskEditor
          task={state.tasks.find((t) => t.id === editingTaskId) || null}
          state={state}
          onClose={() => setEditingTaskId(null)}
          onSave={onTaskUpdate}
          onSkipSubject={onSkipSubject}
        />
      )}

      {/* Calendar Day Inspection Sheet / Modal */}
      {openDay && (
        <div className="modal-overlay" onClick={() => setOpenDay(null)}>
          <div
            className="glass-panel modal-box max-w-xl max-h-[85vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-[var(--border-subtle,#e4e0f1)] pb-3 mb-4">
              <div>
                <h3 className="text-[17px] font-extrabold" style={{ color: "var(--text-main, #211a3a)" }}>
                  {prettyLong(openDay)}
                </h3>
                <span className="text-[12px] font-medium" style={{ color: "var(--text-dim, #5f5a7a)" }}>
                  {filtered.filter((tk) => tk.date === openDay).length} tasks scheduled
                </span>
              </div>
              <button
                type="button"
                className="btn btn-ghost btn-icon"
                onClick={() => setOpenDay(null)}
                aria-label="Close"
              >
                <IconClose size={16} />
              </button>
            </div>

            <div className="space-y-2.5">
              {filtered.filter((tk) => tk.date === openDay).map((tk) => {
                const sb = subjFor(tk);
                return (
                  <div
                    key={tk.id}
                    className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[var(--border-subtle,#e4e0f1)] bg-[var(--surface-2,#f4f2fc)] p-3"
                  >
                    <div className="min-w-0 flex-1 basis-48">
                      <p className="flex items-center gap-2 truncate text-[13.5px] font-bold" style={{ color: "var(--text-main, #211a3a)" }}>
                        <KindIcon kind={tk.kind} color={sb?.color || "var(--accent,#6366f1)"} />
                        <span className="truncate">{tk.title}</span>
                      </p>
                      <p className="text-[11.5px] font-semibold" style={{ color: "var(--text-dim, #5f5a7a)" }}>
                        {sb?.name} · {tk.plannedMinutes} min · <StatusChip status={tk.status} />
                      </p>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        className="btn btn-xs btn-secondary"
                        onClick={() => {
                          setOpenDay(null);
                          setEditingTaskId(tk.id);
                        }}
                      >
                        <IconEdit size={12} /> Edit
                      </button>
                      <button
                        type="button"
                        className="btn btn-xs btn-primary"
                        onClick={() => {
                          setOpenDay(null);
                          onFocusTask(tk.id);
                        }}
                      >
                        Clock In
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
