"use client";

import React, { useEffect, useRef, useState } from "react";
import TaskClockButton from "./TaskClockButton";
import type { SubjectRow, TaskRow } from "@/lib/client";

/**
 * The ONE action row every task shares — Overview, Planner, day sheets.
 * Primary flow stays two taps: [Done] / [Start]. Everything less frequent
 * (Edit, Skip, Skip subject, Reopen) lives behind a small "⋯" menu, and
 * revision tasks ask for their spaced-recall rating right where they are
 * completed — the same flow on every surface.
 */
export default function TaskActions({
  task,
  subject,
  activeTaskId,
  clockSessionActive,
  onTaskStatus,
  onFocusTask,
  onClockOut,
  onEdit,
  onSkipSubject,
}: {
  task: TaskRow;
  subject?: SubjectRow | null;
  activeTaskId?: number | null;
  clockSessionActive?: boolean;
  onTaskStatus: (id: number, status: string, rating?: number) => void;
  onFocusTask: (taskId: number) => void;
  onClockOut: () => void;
  onEdit: (taskId: number) => void;
  onSkipSubject?: (subjectId: number, date: string) => void;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [ratingOpen, setRatingOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);

  // The menu closes like a popover: outside click or Escape. The wrap
  // stops the toggle's own click from immediately closing it again.
  useEffect(() => {
    if (!menuOpen) return;
    const close = () => setMenuOpen(false);
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setMenuOpen(false);
        menuRef.current?.querySelector<HTMLButtonElement>("button")?.focus();
      }
    };
    window.addEventListener("click", close);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("click", close);
      window.removeEventListener("keydown", onKey);
    };
  }, [menuOpen]);

  const done = task.status === "done";
  const skipped = task.status === "skipped";

  const handleDone = () => {
    if (done) {
      onTaskStatus(task.id, "pending");
      return;
    }
    // Recall tasks train the spaced-repetition model with one extra tap —
    // the same behaviour on the Overview and in the Planner.
    if (task.kind === "revise" && task.topicId) {
      setRatingOpen((value) => !value);
      return;
    }
    onTaskStatus(task.id, "done");
  };

  return (
    <>
      <div className="task-row-actions">
        <div className="task-more-wrap" ref={menuRef} onClick={(event) => event.stopPropagation()}>
          <button
            className="btn btn-xs btn-secondary task-more"
            type="button"
            aria-label="More task actions"
            aria-haspopup="menu"
            aria-expanded={menuOpen}
            onClick={() => setMenuOpen((value) => !value)}
          >
            ⋯
          </button>
          {menuOpen && (
            <div className="task-menu glass-panel" role="menu" aria-label="More task actions">
              <button type="button" role="menuitem" onClick={() => { setMenuOpen(false); onEdit(task.id); }}>
                Edit task
              </button>
              {skipped && (
                <button type="button" role="menuitem" onClick={() => { setMenuOpen(false); onTaskStatus(task.id, "pending"); }}>
                  Reopen
                </button>
              )}
              {!done && !skipped && (
                <button type="button" role="menuitem" onClick={() => { setMenuOpen(false); onTaskStatus(task.id, "skipped"); }}>
                  Skip task
                </button>
              )}
              {subject && !skipped && onSkipSubject && (
                <button type="button" role="menuitem" onClick={() => { setMenuOpen(false); onSkipSubject(subject.id, task.date); }}>
                  Skip {subject.name} today
                </button>
              )}
            </div>
          )}
        </div>
        <TaskClockButton
          taskId={task.id}
          activeTaskId={activeTaskId}
          sessionActive={clockSessionActive}
          onFocusTask={onFocusTask}
          onClockOut={onClockOut}
        />
        <button
          type="button"
          className={`btn btn-xs task-primary ${done ? "btn-secondary" : "btn-primary"}`}
          aria-expanded={ratingOpen || undefined}
          onClick={handleDone}
        >
          {done ? "Undo" : "Done"}
        </button>
      </div>
      {ratingOpen && !done && (
        <div className="rating-strip glass-panel slide-in" role="group" aria-label="How well did you recall it?">
          <span className="rating-q">How well did you recall it?</span>
          <div className="rating-btns">
            <button type="button" className="rate-btn rate-again" onClick={() => { setRatingOpen(false); onTaskStatus(task.id, "done", 1); }}>Again</button>
            <button type="button" className="rate-btn rate-hard" onClick={() => { setRatingOpen(false); onTaskStatus(task.id, "done", 2); }}>Hard</button>
            <button type="button" className="rate-btn rate-good" onClick={() => { setRatingOpen(false); onTaskStatus(task.id, "done", 3); }}>Good</button>
            <button type="button" className="rate-btn rate-easy" onClick={() => { setRatingOpen(false); onTaskStatus(task.id, "done", 4); }}>Easy</button>
          </div>
        </div>
      )}
    </>
  );
}
