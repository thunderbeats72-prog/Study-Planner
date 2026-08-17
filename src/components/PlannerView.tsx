"use client";

import React, { useMemo, useState } from "react";
import { prettyLong, today, type AppState } from "@/lib/client";
import type { TaskPatch } from "./TaskEditor";

interface PlannerViewProps {
  state: AppState;
  onTaskStatus: (id: number, status: string) => Promise<void>;
  onTaskUpdate: (id: number, patch: TaskPatch) => Promise<void>;
  onSkipSubject: (subjectId: number, date: string) => Promise<void>;
  onFocusTask: (taskId: number) => void;
  activeTaskId: number | null;
  activeClockSeconds: number;
  onAskTutor: (q: string) => void;
  replanning: boolean;
  onReplan: () => Promise<void>;
}

type ViewMode = "list" | "calendar" | "kanban";

function prettyDate(dateStr: string): string {
  if (!dateStr) return "";
  try {
    const d = new Date(dateStr + "T00:00:00");
    return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  } catch {
    return dateStr;
  }
}

function addDaysToDate(dateStr: string, days: number): string {
  const d = new Date(dateStr + "T00:00:00");
  d.setDate(d.getDate() + days);
  return d.toISOString().split("T")[0];
}

function getDaysBetween(startStr: string, endStr: string): number {
  const start = new Date(startStr + "T00:00:00");
  const end = new Date(endStr + "T00:00:00");
  const diffTime = end.getTime() - start.getTime();
  return Math.max(1, Math.ceil(diffTime / (1000 * 60 * 60 * 24)));
}

export default function PlannerView({
  state,
  onTaskStatus,
  onTaskUpdate,
  onSkipSubject,
  onFocusTask,
  activeTaskId,
  activeClockSeconds,
  onAskTutor,
  replanning,
  onReplan
}: PlannerViewProps) {
  const [viewMode, setViewMode] = useState<ViewMode>("list");
  const [selectedSubjectId, setSelectedSubjectId] = useState<string>("all");
  const [activeCalMonth, setActiveCalMonth] = useState<Date>(new Date());
  const [selectedDayTasks, setSelectedDayTasks] = useState<{ date: string; tasks: typeof state.tasks } | null>(null);

  const t = today();

  // Pacing calculations
  const pacing = useMemo(() => {
    const totalUnits = state.subjects.reduce((sum, s) => sum + ((s as any).units || 10), 0);
    const minutesPerUnit = 70;
    const totalEstimatedMinutes = totalUnits * minutesPerUnit;
    const dailyMinutesBudget = Math.max(30, Math.round((state.settings.dailyHours || 2) * 60));
    const rawDaysRequired = Math.ceil(totalEstimatedMinutes / dailyMinutesBudget);
    const bufferDays = Math.max(2, Math.round(rawDaysRequired * 0.1));
    const daysRequired = rawDaysRequired + bufferDays;
    const projectedDate = addDaysToDate(t, daysRequired);
    const daysUntilExam = getDaysBetween(t, state.settings.examDate);
    const isFeasible = daysRequired <= daysUntilExam;

    return {
      daysRequired,
      projectedDate,
      bufferDays,
      isFeasible
    };
  }, [state.subjects, state.settings.dailyHours, state.settings.examDate, t]);

  const filteredTasks = useMemo(() => {
    if (selectedSubjectId === "all") return state.tasks;
    const subId = Number(selectedSubjectId);
    return state.tasks.filter((task) => task.subjectId === subId);
  }, [state.tasks, selectedSubjectId]);

  const groupedTasksByDate = useMemo(() => {
    const map = new Map<string, typeof state.tasks>();
    for (const task of filteredTasks) {
      const d = task.date;
      if (!map.has(d)) map.set(d, []);
      map.get(d)!.push(task);
    }
    return Array.from(map.entries()).sort(([a], [b]) => a.localeCompare(b));
  }, [filteredTasks]);

  const calendarDays = useMemo(() => {
    const year = activeCalMonth.getFullYear();
    const month = activeCalMonth.getMonth();
    const firstDayIndex = new Date(year, month, 1).getDay();
    const totalDaysInMonth = new Date(year, month + 1, 0).getDate();

    const days: { dateStr: string; dayNum: number; isCurrentMonth: boolean }[] = [];

    for (let i = 0; i < firstDayIndex; i++) {
      days.push({ dateStr: "", dayNum: 0, isCurrentMonth: false });
    }

    for (let d = 1; d <= totalDaysInMonth; d++) {
      const monthStr = String(month + 1).padStart(2, "0");
      const dayStr = String(d).padStart(2, "0");
      days.push({
        dateStr: `${year}-${monthStr}-${dayStr}`,
        dayNum: d,
        isCurrentMonth: true
      });
    }

    return days;
  }, [activeCalMonth]);

  const monthName = activeCalMonth.toLocaleString("default", { month: "long", year: "numeric" });

  const nextMonth = () => {
    setActiveCalMonth(new Date(activeCalMonth.getFullYear(), activeCalMonth.getMonth() + 1, 1));
  };
  const prevMonth = () => {
    setActiveCalMonth(new Date(activeCalMonth.getFullYear(), activeCalMonth.getMonth() - 1, 1));
  };

  return (
    <div className="planner-container" style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <div className="page-header" style={{ marginBottom: 4 }}>
        <div>
          <h1 className="page-title">Study Planner</h1>
          <p className="page-subtitle">
            Lesson-wise adaptive schedule · {state.tasks.length} total tasks · Projected completion:{" "}
            <strong>{prettyDate(pacing.projectedDate)}</strong>
          </p>
        </div>

        <div className="flex-row gap-sm" style={{ flexWrap: "wrap" }}>
          <div className="vtabs">
            <button className={`vtab${viewMode === "list" ? " active" : ""}`} onClick={() => setViewMode("list")}>
              List
            </button>
            <button className={`vtab${viewMode === "calendar" ? " active" : ""}`} onClick={() => setViewMode("calendar")}>
              Calendar
            </button>
            <button className={`vtab${viewMode === "kanban" ? " active" : ""}`} onClick={() => setViewMode("kanban")}>
              Kanban
            </button>
          </div>

          <select
            className="input-field"
            style={{ width: "auto", minWidth: 160, padding: "8px 12px" }}
            value={selectedSubjectId}
            onChange={(e) => setSelectedSubjectId(e.target.value)}
          >
            <option value="all">All subjects</option>
            {state.subjects.map((sub) => (
              <option key={sub.id} value={sub.id}>
                {sub.name}
              </option>
            ))}
          </select>

          <button className="btn btn-primary btn-sm" onClick={onReplan} disabled={replanning}>
            {replanning ? "Rebalancing..." : "⚡ Re-plan"}
          </button>
        </div>
      </div>

      <div
        className="glass-panel"
        style={{
          padding: "12px 20px",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          flexWrap: "wrap",
          gap: 12,
          borderLeft: `4px solid ${pacing.isFeasible ? "var(--success-accent)" : "var(--warning-accent)"}`
        }}
      >
        <div style={{ fontSize: ".82rem", fontWeight: 650 }}>
          {pacing.isFeasible ? (
            <span>
              🎯 Target On Track: Syllabus completes by <strong>{prettyDate(pacing.projectedDate)}</strong> with{" "}
              <strong>{pacing.bufferDays} buffer days</strong> before your exam on {prettyLong(state.settings.examDate)}.
            </span>
          ) : (
            <span>
              ⚠️ Intensive Load: Requires {pacing.daysRequired} days at current pacing. Increase daily study hours to finish
              before {prettyDate(state.settings.examDate)}.
            </span>
          )}
        </div>
        <span className="chip chip-kind" style={{ background: "var(--accent-glow)", color: "var(--accent)" }}>
          {state.settings.dailyHours || 2}h Daily Target
        </span>
      </div>

      {viewMode === "list" && (
        <div className="task-list-wrap" style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          {groupedTasksByDate.length === 0 ? (
            <div className="glass-panel" style={{ padding: 40, textAlign: "center", color: "var(--text-muted)" }}>
              No tasks found for the selected subject filter.
            </div>
          ) : (
            groupedTasksByDate.map(([dateStr, tasks]) => {
              const isToday = dateStr === t;
              const totalMins = tasks.reduce((sum, task) => sum + ((task as any).duration ?? (task as any).minutes ?? 45), 0);
              const doneCount = tasks.filter((task) => task.status === "done").length;

              return (
                <div
                  key={dateStr}
                  className="day-block glass-panel"
                  style={{
                    border: isToday ? "1.5px solid var(--accent)" : "1px solid var(--glass-border)",
                    boxShadow: isToday ? "0 8px 28px var(--accent-glow)" : undefined
                  }}
                >
                  <div className="day-head">
                    <div className="flex-row gap-sm">
                      <span className="day-date" style={{ color: isToday ? "var(--accent)" : "inherit" }}>
                        {isToday ? "Today, " : ""}
                        {prettyDate(dateStr)}
                      </span>
                      {isToday && (
                        <span className="chip chip-kind" style={{ fontSize: ".65rem" }}>
                          Active
                        </span>
                      )}
                    </div>
                    <span className="day-meta">
                      {tasks.length} tasks · {totalMins} min · {doneCount}/{tasks.length} done
                    </span>
                  </div>

                  <div className="task-items-list" style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                    {tasks.map((task) => {
                      const isClockedIn = activeTaskId === task.id;
                      const sub = state.subjects.find((s) => s.id === task.subjectId);
                      const subColor = sub?.color || "var(--accent)";
                      const durationVal = (task as any).duration ?? (task as any).minutes ?? 45;

                      return (
                        <div
                          key={task.id}
                          className={`task-row ${task.status}${isClockedIn ? " active-clock" : ""}`}
                          style={{ borderLeft: `4px solid ${subColor}` }}
                        >
                          <div className="task-dot" style={{ background: subColor }} />

                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div className="task-title">{task.title}</div>
                            <span className="task-sub">
                              {(task.kind || "lesson").toUpperCase()} · {durationVal} min · {(task as any).difficulty || "Medium"}
                            </span>
                          </div>

                          <div className="task-actions">
                            <span className={`chip chip-${task.status}`}>{task.status}</span>

                            {task.status === "pending" && (
                              <>
                                <button
                                  className={`btn btn-xs ${isClockedIn ? "btn-primary" : "btn-secondary"}`}
                                  onClick={() => onFocusTask(task.id)}
                                >
                                  {isClockedIn ? "Clocked In" : "Clock In"}
                                </button>
                                <button
                                  className="btn btn-xs btn-secondary"
                                  onClick={() => onTaskStatus(task.id, "done")}
                                >
                                  Done
                                </button>
                                <button
                                  className="btn btn-xs btn-danger"
                                  onClick={() => onTaskStatus(task.id, "skipped")}
                                >
                                  Skip
                                </button>
                              </>
                            )}

                            {task.status === "done" && (
                              <button
                                className="btn btn-xs btn-secondary"
                                onClick={() => onTaskStatus(task.id, "pending")}
                              >
                                Undo
                              </button>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })
          )}
        </div>
      )}

      {viewMode === "calendar" && (
        <div className="glass-panel" style={{ padding: 24 }}>
          <div className="flex-row" style={{ justifyContent: "space-between", marginBottom: 18 }}>
            <h3 style={{ margin: 0, fontSize: "1.1rem", fontWeight: 800 }}>{monthName}</h3>
            <div className="flex-row gap-sm">
              <button className="btn btn-secondary btn-xs" onClick={prevMonth}>
                ‹ Prev
              </button>
              <button className="btn btn-secondary btn-xs" onClick={nextMonth}>
                Next ›
              </button>
            </div>
          </div>

          <div className="cal-grid">
            {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((dow) => (
              <div key={dow} className="cal-dow">
                {dow}
              </div>
            ))}

            {calendarDays.map((cell, idx) => {
              if (!cell.isCurrentMonth) {
                return <div key={`empty-${idx}`} className="cal-cell empty" />;
              }

              const dayTasks = state.tasks.filter((task) => task.date === cell.dateStr);
              const isToday = cell.dateStr === t;

              return (
                <div
                  key={cell.dateStr}
                  className={`cal-cell${isToday ? " today" : ""}`}
                  onClick={() => setSelectedDayTasks({ date: cell.dateStr, tasks: dayTasks })}
                >
                  <div className="cal-num" style={{ color: isToday ? "var(--accent)" : "inherit" }}>
                    {cell.dayNum}
                  </div>
                  {dayTasks.slice(0, 3).map((task) => {
                    const sub = state.subjects.find((s) => s.id === task.subjectId);
                    return (
                      <div
                        key={task.id}
                        className="cal-pill"
                        style={{
                          background: sub?.color || "var(--accent)",
                          opacity: task.status === "done" ? 0.5 : 1
                        }}
                      >
                        {task.title}
                      </div>
                    );
                  })}
                  {dayTasks.length > 3 && (
                    <div style={{ fontSize: ".62rem", color: "var(--text-muted)", fontWeight: 700 }}>
                      +{dayTasks.length - 3} more
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {viewMode === "kanban" && (
        <div className="kanban">
          {(["pending", "done", "skipped"] as const).map((colStatus) => {
            const tasksInCol = filteredTasks.filter((task) => task.status === colStatus);

            return (
              <div key={colStatus} className="kan-col glass-panel">
                <div className="kan-title">
                  {colStatus.toUpperCase()} ({tasksInCol.length})
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {tasksInCol.map((task) => {
                    const sub = state.subjects.find((s) => s.id === task.subjectId);
                    const durationVal = (task as any).duration ?? (task as any).minutes ?? 45;

                    return (
                      <div
                        key={task.id}
                        className="task-row"
                        style={{ borderLeft: `3px solid ${sub?.color || "var(--accent)"}` }}
                      >
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div className="task-title" style={{ fontSize: ".82rem" }}>
                            {task.title}
                          </div>
                          <span className="task-sub">
                            {prettyDate(task.date)} · {durationVal} min
                          </span>
                        </div>
                        <div className="task-actions">
                          {colStatus !== "done" && (
                            <button
                              className="btn btn-xs btn-secondary"
                              onClick={() => onTaskStatus(task.id, "done")}
                            >
                              Done
                            </button>
                          )}
                          {colStatus !== "pending" && (
                            <button
                              className="btn btn-xs btn-secondary"
                              onClick={() => onTaskStatus(task.id, "pending")}
                            >
                              Reset
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {selectedDayTasks && (
        <div className="modal-overlay" onClick={() => setSelectedDayTasks(null)}>
          <div className="modal-box glass-panel" onClick={(e) => e.stopPropagation()}>
            <div className="flex-row" style={{ justifyContent: "space-between", marginBottom: 16 }}>
              <h3 style={{ margin: 0, fontSize: "1.1rem" }}>{prettyLong(selectedDayTasks.date)}</h3>
              <button className="btn btn-secondary btn-xs" onClick={() => setSelectedDayTasks(null)}>
                ✕ Close
              </button>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {selectedDayTasks.tasks.length === 0 ? (
                <p style={{ color: "var(--text-muted)" }}>No tasks scheduled for this date.</p>
              ) : (
                selectedDayTasks.tasks.map((task) => {
                  const durationVal = (task as any).duration ?? (task as any).minutes ?? 45;
                  return (
                    <div key={task.id} className="task-row">
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div className="task-title">{task.title}</div>
                        <span className="task-sub">
                          {durationVal} min · {(task.kind || "lesson").toUpperCase()}
                        </span>
                      </div>
                      <div className="task-actions">
                        <button
                          className="btn btn-xs btn-primary"
                          onClick={() => {
                            onFocusTask(task.id);
                            setSelectedDayTasks(null);
                          }}
                        >
                          Clock In
                        </button>
                        <button
                          className="btn btn-xs btn-secondary"
                          onClick={() => onTaskStatus(task.id, "done")}
                        >
                          Done
                        </button>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
