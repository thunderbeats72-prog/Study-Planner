"use client";

import React, { useCallback, useEffect, useId, useRef, useState } from "react";
import TaskClockButton from "./TaskClockButton";
import type { SubjectRow, TaskRow } from "@/lib/client";

/* ── One open task menu, app-wide ─────────────────────────────────────
   Every row owns its own popover state, so "close the others" has to be
   coordinated outside React. A single module-level slot is enough: the
   row that opens last releases the one before it. No global listeners,
   no context, no chance of two menus fighting over the same screen. */
let activeMenuId: string | null = null;
let activeMenuClose: (() => void) | null = null;

function claimMenu(id: string, close: () => void) {
  if (activeMenuId !== id) activeMenuClose?.();
  activeMenuId = id;
  activeMenuClose = close;
}

function releaseMenu(id: string) {
  if (activeMenuId !== id) return;
  activeMenuId = null;
  activeMenuClose = null;
}

/**
 * The ONE action row every task shares — Overview, Planner, day sheets.
 * Primary flow stays two taps: [Clock in] / [Done]. Everything less
 * frequent (Edit, Skip, Skip subject, Reopen) lives behind a small
 * vertical "⋮" button anchored to the card's top-right corner, so the
 * popover never covers the task title and never moves the row.
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
  const menuId = useId();
  const [menuOpen, setMenuOpen] = useState(false);
  const [ratingOpen, setRatingOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);

  const closeMenu = useCallback(() => {
    releaseMenu(menuId);
    setMenuOpen(false);
  }, [menuId]);

  // A row that unmounts while its menu is open must release the slot, or
  // the next menu opened anywhere would try to close a ghost.
  useEffect(() => () => releaseMenu(menuId), [menuId]);

  // Outside click and Escape, exactly like any other popover. The wrap
  // stops the trigger's own click from immediately closing it again.
  useEffect(() => {
    if (!menuOpen) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.stopPropagation();
      closeMenu();
      triggerRef.current?.focus();
    };
    const close = () => closeMenu();
    window.addEventListener("click", close);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("click", close);
      window.removeEventListener("keydown", onKey);
    };
  }, [menuOpen, closeMenu]);

  const toggleMenu = () => {
    if (menuOpen) { closeMenu(); return; }
    claimMenu(menuId, closeMenu);
    setMenuOpen(true);
  };

  /** Arrow-key navigation inside the menu, wrapping at both ends. */
  const onMenuKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    const keys = ["ArrowDown", "ArrowUp", "Home", "End"];
    if (!keys.includes(event.key)) return;
    event.preventDefault();
    const items = Array.from(
      wrapRef.current?.querySelectorAll<HTMLButtonElement>('.task-menu button[role="menuitem"]') || []
    );
    if (!items.length) return;
    const index = items.indexOf(document.activeElement as HTMLButtonElement);
    const next =
      event.key === "Home" ? 0
        : event.key === "End" ? items.length - 1
          : event.key === "ArrowDown" ? (index + 1 + items.length) % items.length
            : (index - 1 + items.length) % items.length;
    items[next]?.focus();
  };

  // Opening the menu moves focus into it — that is what makes the arrow
  // keys and the Escape-to-trigger behaviour work from the keyboard alone.
  useEffect(() => {
    if (!menuOpen) return;
    const id = window.setTimeout(
      () => wrapRef.current?.querySelector<HTMLButtonElement>('.task-menu button[role="menuitem"]')?.focus(),
      0
    );
    return () => window.clearTimeout(id);
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
        <div className="task-more-wrap" ref={wrapRef} onClick={(event) => event.stopPropagation()}>
          <button
            className="task-more"
            type="button"
            ref={triggerRef}
            aria-label="More task actions"
            aria-haspopup="menu"
            aria-expanded={menuOpen}
            aria-controls={menuOpen ? `${menuId}-menu` : undefined}
            onClick={toggleMenu}
          >
            <span className="task-more-dots" aria-hidden="true"><i /><i /><i /></span>
          </button>
          {menuOpen && (
            <div
              className="task-menu glass-panel"
              id={`${menuId}-menu`}
              role="menu"
              aria-label="More task actions"
              onKeyDown={onMenuKeyDown}
            >
              <button type="button" role="menuitem" onClick={() => { closeMenu(); onEdit(task.id); }}>
                Edit task
              </button>
              {skipped && (
                <button type="button" role="menuitem" onClick={() => { closeMenu(); onTaskStatus(task.id, "pending"); }}>
                  Reopen
                </button>
              )}
              {!done && !skipped && (
                <button type="button" role="menuitem" onClick={() => { closeMenu(); onTaskStatus(task.id, "skipped"); }}>
                  Skip task
                </button>
              )}
              {subject && !skipped && onSkipSubject && (
                <button type="button" role="menuitem" onClick={() => { closeMenu(); onSkipSubject(subject.id, task.date); }}>
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
