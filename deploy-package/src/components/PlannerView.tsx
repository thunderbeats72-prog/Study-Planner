"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  dayDiff,
  fmtDate,
  KIND_META,
  parseDate,
  prettyLong,
  today,
  type AppState,
  type TaskRow,
} from "@/lib/client";
import {
  IconArrowLeft,
  IconArrowRight,
  IconCalendar,
  IconCheck,
  IconClock,
  IconClose,
  IconFilter,
  IconList,
  IconRefresh,
  IconTarget,
} from "./icons";
import TaskEditor, { type TaskPatch } from "./TaskEditor";
import QuickAdd from "./QuickAdd";
import { CalendarScene } from "./Illustrations";
import { PageHead, Seg, Select, StatusChip, KindIcon } from "./bits";
import TaskCard from "./TaskCard";
import { Reveal } from "@/lib/fx";
import { useBackClose } from "@/lib/useBackClose";
import type { QuickAddPayload } from "@/lib/quickAdd";
import { cn } from "@/lib/cn";

/* Two focused views — the Kanban board was retired in favour of the
   List + Calendar pair; kind is now communicated by icon, not column. */
type View = "list" | "calendar";

const KIND_ORDER = ["learn", "revise", "practice", "mock", "buffer"] as const;

function isCheckpointTask(task: TaskRow): boolean {
  return (
    task.kind === "checkpoint" ||
    (!!task.title && task.title.toLowerCase().startsWith("checkpoint:"))
  );
}

/* ══════════════════════════════════════════════════════════════════════
   Planner (v25)

   • The calendar is ONE component that is designed for both ends of the
     range instead of a desktop grid that gets squeezed: below 900px a day
     cell carries its number, up to four kind dots and a count (indicators
     live INSIDE the cell — nothing overflows the grid); from 900px up the
     cells grow, gain title chips and a "+N more" tail, and the header swaps
     its stacked label for an inline month title with a kind legend.
   • Rows are the shared TaskCard, so the Planner list and the Overview's
     Today's Plan are the same object with the same padding, wrapping and
     action row.
   • Page rhythm comes from `.page-stack` + the shared spacing scale rather
     than `space-y-*` on a wrapper.
   ══════════════════════════════════════════════════════════════════════ */
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
  onPauseOrResume,
  onClockOut,
  onAskTutor,
  replanning,
  onReplan,
  onAddTask,
  onDeleteTask,
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
  onPauseOrResume?: () => void;
  onClockOut: () => void;
  onAskTutor: (q: string) => void;
  replanning: boolean;
  onReplan: () => void;
  onAddTask: (input: QuickAddPayload) => void;
  onDeleteTask?: (id: number) => void;
}) {
  const [view, setView] = useState<View>("list");
  const [filter, setFilter] = useState("all");
  const [openDay, setOpenDay] = useState<string | null>(null);
  /* The day block just landed on from the calendar — flashed so the
     list/calendar switch is legible instead of a jump into a wall of days. */
  const [pickedDay, setPickedDay] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<number | null>(null);
  const [editingTaskId, setEditingTaskId] = useState<number | null>(null);
  /* Delete closes an editor that is still open on the same task before the
     row disappears, so the modal can never be left pointing at nothing. */
  const deleteTask = onDeleteTask
    ? (id: number) => {
        setEditingTaskId((current) => (current === id ? null : current));
        onDeleteTask(id);
      }
    : undefined;
  const [monthOff, setMonthOff] = useState(0);
  const [selDay, setSelDay] = useState<string>(today());
  const pickedTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      if (pickedTimer.current) clearTimeout(pickedTimer.current);
    },
    [],
  );

  const t = today();
  useBackClose(!!openDay, () => setOpenDay(null));

  const dayRefs = useRef<Record<string, HTMLElement | null>>({});
  const briefRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (expanded == null) return;
    const timer = window.setTimeout(() => {
      const reduce = window.matchMedia?.(
        "(prefers-reduced-motion: reduce)",
      ).matches;
      briefRef.current?.scrollIntoView({
        block: "nearest",
        behavior: reduce ? "auto" : "smooth",
      });
    }, 80);
    return () => window.clearTimeout(timer);
  }, [expanded]);

  const filtered = useMemo(() => {
    if (filter === "all") return state.tasks;
    return state.tasks.filter((x) => String(x.subjectId) === filter);
  }, [state.tasks, filter]);

  const grouped = useMemo(() => {
    const map = new Map<string, TaskRow[]>();
    for (const task of filtered) {
      if (!map.has(task.date)) map.set(task.date, []);
      map.get(task.date)!.push(task);
    }
    return [...map.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [filtered]);

  const topicFor = (task: TaskRow) =>
    state.topics.find((x) => x.id === task.topicId);
  const subjFor = (task: TaskRow) =>
    state.subjects.find((s) => s.id === task.subjectId);
  const taskLogged = (taskId: number) => {
    const sum = state.sessions
      .filter((x) => x.taskId === taskId)
      .reduce((a, x) => a + x.minutes, 0);
    return Math.round(sum * 100) / 100;
  };
  /* ── Calendar geometry: the real month, always 7 columns ───────────── */
  const anchor = new Date();
  const mDate = new Date(anchor.getFullYear(), anchor.getMonth() + monthOff, 1);
  const year = mDate.getFullYear();
  const month = mDate.getMonth();
  const firstDow = mDate.getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  const tasksByDate = useMemo(() => {
    const map = new Map<string, TaskRow[]>();
    for (const tk of filtered) {
      if (!map.has(tk.date)) map.set(tk.date, []);
      map.get(tk.date)!.push(tk);
    }
    return map;
  }, [filtered]);

  /* Week rows are built as complete 7-cell lines (leading and trailing blanks
     included) so the grid never depends on a browser's implicit placement, and
     a month that starts on Sunday is not a 6-row surprise. Kept as plain
     derivation — 42 cells is cheaper to rebuild than to memoise. */
  const weeks: (string | null)[][] = [];
  {
    let row: (string | null)[] = Array(firstDow).fill(null);
    for (let d = 1; d <= daysInMonth; d++) {
      row.push(fmtDate(new Date(year, month, d)));
      if (row.length === 7) {
        weeks.push(row);
        row = [];
      }
    }
    if (row.length) {
      while (row.length < 7) row.push(null);
      weeks.push(row);
    }
  }

  let dueThisMonth = 0;
  let doneThisMonth = 0;
  let busyDays = 0;
  for (const [dateKey, list] of tasksByDate) {
    const d = parseDate(dateKey);
    if (d.getFullYear() !== year || d.getMonth() !== month) continue;
    dueThisMonth += list.length;
    doneThisMonth += list.filter((x) => x.status === "done").length;
    if (list.length) busyDays += 1;
  }

  const dayFlag = (dateKey: string, dayTasks: TaskRow[]) => {
    const diff = dayDiff(today(), dateKey);
    if (diff === 0) return { label: "Today", cls: "" };
    if (diff === 1) return { label: "Tomorrow", cls: "day-flag--future" };
    if (diff < 0) {
      const open = dayTasks.some((tk) => tk.status === "pending");
      return open ? { label: "Unfinished", cls: "day-flag--warn" } : null;
    }
    if (diff <= 7) return { label: `In ${diff} days`, cls: "day-flag--future" };
    return null;
  };

  const goToday = () => {
    setMonthOff(0);
    setSelDay(today());
  };

  /** Bring the picked day's block into view. Uses rAF + retries to survive
   *  the React commit that mounts the list after a view switch. */
  const scrollToDayBlock = useCallback((dateKey: string) => {
    let attempt = 0;
    const tryScroll = () => {
      const node = dayRefs.current[dateKey];
      if (!node) {
        if (attempt < 14) {
          attempt++;
          if (attempt === 1) {
            window.requestAnimationFrame(() =>
              window.requestAnimationFrame(tryScroll),
            );
          } else {
            window.setTimeout(tryScroll, 60);
          }
        }
        return;
      }
      const reduce = window.matchMedia?.(
        "(prefers-reduced-motion: reduce)",
      ).matches;
      node.scrollIntoView({
        block: "start",
        behavior: reduce ? "auto" : "smooth",
      });
    };
    tryScroll();
  }, []);

  useEffect(() => {
    if (!pickedDay) return;
    if (view !== "list") return;
    const id = window.setTimeout(() => scrollToDayBlock(pickedDay), 80);
    return () => window.clearTimeout(id);
  }, [pickedDay, view, grouped, scrollToDayBlock]);

  const pickDay = (dateKey: string) => {
    setSelDay(dateKey);
    if (view !== "calendar") {
      const exists = grouped.some(([k]) => k === dateKey);
      if (!exists) {
        setOpenDay(dateKey);
        return;
      }
      setPickedDay(dateKey);
      if (pickedTimer.current) clearTimeout(pickedTimer.current);
      pickedTimer.current = window.setTimeout(
        () => setPickedDay(null),
        2400,
      ) as unknown as ReturnType<typeof setTimeout>;
      window.setTimeout(() => scrollToDayBlock(dateKey), 60);
      return;
    }
    const dayTasks = tasksByDate.get(dateKey) || [];
    if (
      window.matchMedia?.("(max-width: 900px)").matches ||
      dayTasks.length === 0
    ) {
      setOpenDay(dateKey);
      return;
    }
    setView("list");
    setPickedDay(dateKey);
    if (pickedTimer.current) clearTimeout(pickedTimer.current);
    pickedTimer.current = window.setTimeout(
      () => setPickedDay(null),
      2400,
    ) as unknown as ReturnType<typeof setTimeout>;
  };

  return (
    <div className="planner-view page-stack fade-in">
      <PageHead
        eyebrow="PLANNER"
        title="Your month, mapped."
        sub={`${state.tasks.length} scheduled tasks · ${state.topics.length} curriculum lessons mapped · drag nothing, decide everything`}
        art={<CalendarScene />}
        actions={
          <>
            <QuickAdd state={state} onAdd={onAddTask} />
            <button
              type="button"
              className="btn btn-secondary"
              onClick={onReplan}
              disabled={replanning}
              aria-busy={replanning}
              title="Re-balance the schedule around your logged minutes"
            >
              <IconRefresh
                size={15}
                className={replanning ? "anim-spin" : ""}
              />
              <span>{replanning ? "Re-planning…" : "Rebalance schedule"}</span>
            </button>
          </>
        }
      />

      <Reveal>
        <div className="planner-toolbar">
          <Seg
            value={view}
            onChange={setView}
            options={[
              { v: "list", label: "List", icon: <IconList size={15} /> },
              {
                v: "calendar",
                label: "Calendar",
                icon: <IconCalendar size={15} />,
              },
            ]}
          />
          <label className="planner-filter">
            <span className="planner-filter-label">
              <IconFilter size={11} aria-hidden="true" />
              Subject
            </span>
            <Select
              ariaLabel="Filter tasks by subject"
              value={filter}
              onChange={setFilter}
              options={[
                { value: "all", label: `All subjects (${state.subjects.length})` },
                ...state.subjects.map((sb) => ({
                  value: String(sb.id),
                  label: sb.name,
                })),
              ]}
            />
          </label>
        </div>
      </Reveal>

      {/* ── 1 · CALENDAR — the full month, built for every width ─────── */}
      {view === "calendar" && (
        <Reveal>
          <section
            className="planner-cal glass-panel section-card"
            aria-label="Study calendar"
          >
            <div className="cal-bar">
              <div className="cal-nav">
                <button
                  type="button"
                  className="btn btn-ghost btn-icon cal-arrow"
                  onClick={() => setMonthOff((m) => m - 1)}
                  aria-label="Previous month"
                  title="Previous month"
                >
                  <IconArrowLeft size={15} />
                </button>
                <button
                  type="button"
                  className="btn btn-secondary btn-xs cal-today"
                  onClick={goToday}
                  title="Jump to the current month"
                >
                  Today
                </button>
                <button
                  type="button"
                  className="btn btn-ghost btn-icon cal-arrow"
                  onClick={() => setMonthOff((m) => m + 1)}
                  aria-label="Next month"
                  title="Next month"
                >
                  <IconArrowRight size={15} />
                </button>
              </div>
              <h2 className="cal-label">
                {mDate.toLocaleDateString(undefined, { month: "long" })}{" "}
                <span className="cal-label-year">
                  {mDate.toLocaleDateString(undefined, { year: "numeric" })}
                </span>
              </h2>
              <p className="cal-summary">
                <span className="mono">{dueThisMonth}</span> due
                <span className="cal-dot-sep" aria-hidden="true" />
                <span className="mono">{doneThisMonth}</span> done
                <span className="cal-dot-sep" aria-hidden="true" />
                <span className="mono">{busyDays}</span> active days
              </p>
            </div>

            <div className="cal-legend" aria-hidden="true">
              {KIND_ORDER.map((k) => (
                <span className="cal-legend-item" key={k}>
                  <span
                    className="cal-legend-dot"
                    style={{ background: KIND_META[k]?.color }}
                  />
                  {KIND_META[k]?.label ?? k}
                </span>
              ))}
            </div>

            <div
              className="cal-grid"
              role="grid"
              aria-label={`${mDate.toLocaleDateString(undefined, { month: "long", year: "numeric" })} study plan`}
            >
              <div className="cal-row cal-row-head" role="row">
                {[
                  "Sunday",
                  "Monday",
                  "Tuesday",
                  "Wednesday",
                  "Thursday",
                  "Friday",
                  "Saturday",
                ].map((d, i) => (
                  <span
                    key={d}
                    className="cal-dow"
                    role="columnheader"
                    aria-label={d}
                  >
                    <span className="cal-dow-min" aria-hidden="true">
                      {["S", "M", "T", "W", "T", "F", "S"][i]}
                    </span>
                    <span className="cal-dow-full" aria-hidden="true">
                      {d.slice(0, 3)}
                    </span>
                  </span>
                ))}
              </div>

              {weeks.map((week, wi) => (
                <div className="cal-row" role="row" key={`w-${wi}`}>
                  {week.map((dateKey, di) => {
                    if (!dateKey)
                      return (
                        <span
                          className="cal-cell is-empty"
                          key={`v-${wi}-${di}`}
                          role="gridcell"
                          aria-hidden="true"
                        />
                      );
                    const dayTasks = tasksByDate.get(dateKey) || [];
                    const dom = parseDate(dateKey).getDate();
                    const isToday = dateKey === t;
                    const isSel = dateKey === selDay;
                    const open = dayTasks.filter(
                      (x) => x.status !== "done",
                    ).length;
                    const overdueDay =
                      open > 0 && dayDiff(today(), dateKey) < 0;
                    const dots = dayTasks.slice(0, 4);
                    const extra = dayTasks.length - dots.length;
                    return (
                      <button
                        type="button"
                        role="gridcell"
                        key={dateKey}
                        onClick={() => pickDay(dateKey)}
                        aria-selected={isSel}
                        aria-label={`${prettyLong(dateKey)} — ${dayTasks.length === 0 ? "no tasks" : `${dayTasks.length} task${dayTasks.length > 1 ? "s" : ""}${open ? `, ${open} open` : ""}`} ${isToday ? "(today)" : ""}`}
                        className={cn(
                          "cal-cell",
                          dayTasks.length === 0 && "is-empty",
                          isToday && "is-today",
                          isSel && "is-sel",
                          overdueDay && "is-overdue",
                        )}
                      >
                        <span className="cal-daynum mono">{dom}</span>

                        {/* mobile + tablet: dots and a count, all inside the cell */}
                        <span className="cal-dots">
                          {dots.map((tk) => (
                            <span
                              key={tk.id}
                              className="cal-dot"
                              style={{
                                background:
                                  tk.status === "done"
                                    ? "transparent"
                                    : subjFor(tk)?.color ||
                                      KIND_META[tk.kind]?.color ||
                                      "var(--accent)",
                                borderColor:
                                  tk.status === "done"
                                    ? "var(--good)"
                                    : "transparent",
                              }}
                            />
                          ))}
                        </span>
                        {dayTasks.length > 0 && (
                          <span className="cal-count mono">
                            {dayTasks.length - open === 0
                              ? `${dayTasks.length}`
                              : `${open}/${dayTasks.length}`}
                          </span>
                        )}
                        {extra > 0 && (
                          <span className="cal-extra mono">+{extra}</span>
                        )}

                        {/* ≥900px: the same tasks as readable chips */}
                        <span className="cal-chips">
                          {dayTasks.slice(0, 3).map((tk) => {
                            const done = tk.status === "done";
                            const color =
                              subjFor(tk)?.color ||
                              KIND_META[tk.kind]?.color ||
                              "var(--accent)";
                            return (
                              <span
                                key={tk.id}
                                className={cn("cal-chip", done && "is-done")}
                                style={
                                  { "--chip-c": color } as React.CSSProperties
                                }
                              >
                                {isCheckpointTask(tk)
                                  ? "Weekly Checkpoint"
                                  : tk.title}
                              </span>
                            );
                          })}
                          {dayTasks.length > 3 && (
                            <span className="cal-chip cal-chip--more">
                              +{dayTasks.length - 3} more
                            </span>
                          )}
                        </span>
                      </button>
                    );
                  })}
                </div>
              ))}
            </div>

            <p className="cal-hint">
              <IconTarget size={12} /> Tap any day to open its plan
            </p>
          </section>
        </Reveal>
      )}

      {/* ── 2 · LIST — day groups of shared TaskCards ─────────────────── */}
      {view === "list" && (
        <div className="planner-list">
          {grouped.length === 0 && (
            <div className="glass-panel section-card planner-empty">
              <IconCalendar size={22} />
              <p>No tasks match the active filter.</p>
              <QuickAdd state={state} onAdd={onAddTask} />
            </div>
          )}

          {grouped.map(([dateKey, dayTasks], i) => {
            const isToday = dateKey === t;
            const dayMins = dayTasks.reduce((a, b) => a + b.plannedMinutes, 0);
            const doneCount = dayTasks.filter(
              (tk) => tk.status === "done",
            ).length;
            const allDone =
              doneCount === dayTasks.length && dayTasks.length > 0;
            const flag = dayFlag(dateKey, dayTasks);

            return (
              <Reveal key={dateKey} delay={Math.min(i, 6) * 45}>
                <section
                  ref={(node) => {
                    dayRefs.current[dateKey] = node;
                  }}
                  className={cn(
                    "day-block planner-day glass-panel tilt-card section-card",
                    isToday && "is-today",
                    pickedDay === dateKey && "is-selected",
                  )}
                  aria-labelledby={`day-${dateKey}`}
                >
                  <header className="day-head">
                    <span className="planner-day-badge" aria-hidden="true">
                      <IconCalendar size={14} />
                    </span>
                    <div className="day-id">
                      <h2 id={`day-${dateKey}`} className="day-date">
                        {prettyLong(dateKey)}
                        {flag && (
                          <span className={cn("day-flag", flag.cls)}>
                            {flag.label}
                          </span>
                        )}
                      </h2>
                      {/* Same three numbers as before — now each carries the
                          icon that says what it is, so the row is scannable
                          at a glance instead of a run of bare digits. */}
                      <p className="day-meta">
                        <span className="day-meta-item">
                          <IconList size={11} aria-hidden="true" />
                          {dayTasks.length} task{dayTasks.length === 1 ? "" : "s"}
                        </span>
                        <span className="day-meta-sep" aria-hidden="true" />
                        <span className="day-meta-item">
                          <IconClock size={11} aria-hidden="true" />
                          <span className="mono">{dayMins}</span> min
                        </span>
                        <span className="day-meta-sep" aria-hidden="true" />
                        <span
                          className={cn(
                            "day-meta-item",
                            allDone && "is-done",
                          )}
                        >
                          <IconCheck size={11} aria-hidden="true" />
                          <span className="mono">{doneCount}</span> done
                        </span>
                      </p>
                    </div>
                    {allDone && (
                      <span className="day-flag day-flag--done">
                        <IconCheck size={13} /> Completed
                      </span>
                    )}
                  </header>

                  <div className="planner-day-list">
                    {dayTasks.map((task) => {
                      const topic = topicFor(task);
                      return (
                        <TaskCard
                          key={task.id}
                          task={task}
                          subject={subjFor(task)}
                          topic={topic}
                          loggedMinutes={taskLogged(task.id)}
                          live={activeTaskId === task.id}
                          liveSeconds={activeClockSeconds}
                          liveRunning={clockRunning}
                          briefRef={expanded === task.id ? briefRef : undefined}
                          briefOpen={expanded === task.id}
                          onToggleBrief={
                            topic || task.detail
                              ? () =>
                                  setExpanded(
                                    expanded === task.id ? null : task.id,
                                  )
                              : undefined
                          }
                          onAskTutor={onAskTutor}
                          activeTaskId={activeTaskId}
                          clockSessionActive={clockSessionActive}
                          clockRunning={clockRunning}
                          onPauseOrResume={onPauseOrResume}
                          onTaskStatus={onTaskStatus}
                          onFocusTask={onFocusTask}
                          onClockOut={onClockOut}
                          onEdit={setEditingTaskId}
                          onDelete={deleteTask}
                          onSkipSubject={onSkipSubject}
                        />
                      );
                    })}
                  </div>
                </section>
              </Reveal>
            );
          })}
        </div>
      )}

      {/* Task editor */}
      {editingTaskId !== null && (
        <TaskEditor
          task={state.tasks.find((x) => x.id === editingTaskId) || null}
          state={state}
          onClose={() => setEditingTaskId(null)}
          onSave={onTaskUpdate}
          onSkipSubject={onSkipSubject}
        />
      )}

      {/* Day sheet (calendar → tap a day) */}
      {openDay && (
        <div className="modal-overlay" onClick={() => setOpenDay(null)}>
          <div
            className="glass-panel modal-box day-sheet"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-label={`${prettyLong(openDay)} plan`}
          >
            <header className="day-sheet-head">
              <div>
                <h3 className="day-sheet-title">{prettyLong(openDay)}</h3>
                <p className="day-sheet-sub mono">
                  {(tasksByDate.get(openDay) || []).length} tasks scheduled
                </p>
              </div>
              <button
                type="button"
                className="btn btn-ghost btn-icon"
                onClick={() => setOpenDay(null)}
                aria-label="Close day plan"
                title="Close"
              >
                <IconClose size={16} />
              </button>
            </header>
            <div className="day-sheet-list">
              {(tasksByDate.get(openDay) || []).map((tk) => {
                const sb = subjFor(tk);
                return (
                  <TaskCard
                    key={tk.id}
                    className="in-sheet"
                    task={tk}
                    subject={sb}
                    topic={topicFor(tk)}
                    loggedMinutes={taskLogged(tk.id)}
                    live={activeTaskId === tk.id}
                    liveSeconds={activeClockSeconds}
                    liveRunning={clockRunning}
                    briefOpen={expanded === tk.id}
                    onToggleBrief={
                      topicFor(tk) || tk.detail
                        ? () =>
                            setExpanded(expanded === tk.id ? null : tk.id)
                        : undefined
                    }
                    onAskTutor={onAskTutor}
                    activeTaskId={activeTaskId}
                    clockSessionActive={clockSessionActive}
                    clockRunning={clockRunning}
                    onPauseOrResume={onPauseOrResume}
                    onTaskStatus={(id, status, rating) => {
                      onTaskStatus(id, status, rating);
                    }}
                    onFocusTask={(id) => {
                      setOpenDay(null);
                      onFocusTask(id);
                    }}
                    onClockOut={onClockOut}
                    onEdit={(id) => {
                      setOpenDay(null);
                      setEditingTaskId(id);
                    }}
                    onDelete={deleteTask}
                    onSkipSubject={onSkipSubject}
                  />
                );
              })}
              {(tasksByDate.get(openDay) || []).length === 0 && (
                <p className="day-sheet-empty">
                  Nothing scheduled — a quiet day is allowed.
                </p>
              )}
            </div>
            <footer className="day-sheet-foot">
              <span className="day-sheet-legend">
                {["learn", "revise", "practice", "mock"].map((k) => (
                  <span key={k} className="day-sheet-legend-item">
                    <KindIcon kind={k} />
                    {KIND_META[k]?.label ?? k}
                  </span>
                ))}
              </span>
              <StatusChip
                status={
                  (tasksByDate.get(openDay) || []).every(
                    (x) => x.status === "done",
                  )
                    ? "done"
                    : "pending"
                }
              />
            </footer>
          </div>
        </div>
      )}
    </div>
  );
}
