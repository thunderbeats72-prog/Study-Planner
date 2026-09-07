"use client";

import React, { useCallback, useEffect, useId, useRef, useState } from "react";
import TaskClockButton from "./TaskClockButton";
import type { SubjectRow, TaskRow } from "@/lib/client";

let activeMenuId: string | null = null;
let activeMenuClose: (() => void) | null = null;
function claimMenu(id: string, close: () => void) { if (activeMenuId !== id) activeMenuClose?.(); activeMenuId = id; activeMenuClose = close; }
function releaseMenu(id: string) { if (activeMenuId !== id) return; activeMenuId = null; activeMenuClose = null; }

export default function TaskActions({ task, subject, activeTaskId, clockSessionActive, onTaskStatus, onFocusTask, onClockOut, onEdit, onSkipSubject }: {
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
  const closeMenu = useCallback(() => { releaseMenu(menuId); setMenuOpen(false); }, [menuId]);
  useEffect(() => () => releaseMenu(menuId), [menuId]);
  useEffect(() => {
    if (!menuOpen) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.stopPropagation(); closeMenu(); triggerRef.current?.focus();
    };
    const onClick = (event: MouseEvent) => {
      if (wrapRef.current?.contains(event.target as Node)) return;
      closeMenu();
    };
    window.addEventListener("click", onClick);
    window.addEventListener("keydown", onKey);
    return () => { window.removeEventListener("click", onClick); window.removeEventListener("keydown", onKey); };
  }, [menuOpen, closeMenu]);
  useEffect(() => {
    if (!menuOpen) return;
    const id = window.setTimeout(() => wrapRef.current?.querySelector<HTMLButtonElement>("[role=menuitem]")?.focus(), 0);
    return () => window.clearTimeout(id);
  }, [menuOpen]);

  const toggleMenu = () => {
    if (menuOpen) { closeMenu(); return; }
    claimMenu(menuId, closeMenu); setMenuOpen(true);
  };
  const onMenuKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) return;
    event.preventDefault();
    const items = Array.from(wrapRef.current?.querySelectorAll<HTMLButtonElement>("[role=menuitem]") || []);
    const index = items.indexOf(document.activeElement as HTMLButtonElement);
    const next = event.key === "Home" ? 0 : event.key === "End" ? items.length - 1 : event.key === "ArrowDown" ? (index + 1 + items.length) % items.length : (index - 1 + items.length) % items.length;
    items[next]?.focus();
  };

  const done = task.status === "done";
  const skipped = task.status === "skipped";
  const handleDone = () => {
    if (done) { onTaskStatus(task.id, "pending"); return; }
    if (task.kind === "revise" && task.topicId) { setRatingOpen((value) => !value); return; }
    onTaskStatus(task.id, "done");
  };

  return <>
    <div className="task-more-wrap" ref={wrapRef}>
      <button ref={triggerRef} type="button" className="task-more" aria-label="More task actions" aria-haspopup="menu" aria-expanded={menuOpen} aria-controls={menuOpen ? `${menuId}-menu` : undefined} onClick={toggleMenu}>
        <span className="task-more-dots" aria-hidden="true"><i /><i /><i /></span>
      </button>
      {menuOpen && <div id={`${menuId}-menu`} className="task-menu glass-panel" role="menu" aria-label="More task actions" onKeyDown={onMenuKeyDown}>
        <button type="button" role="menuitem" onClick={() => { closeMenu(); onEdit(task.id); }}>Edit task</button>
        {skipped && <button type="button" role="menuitem" onClick={() => { closeMenu(); onTaskStatus(task.id, "pending"); }}>Reopen</button>}
        {!done && !skipped && <button type="button" role="menuitem" onClick={() => { closeMenu(); onTaskStatus(task.id, "skipped"); }}>Skip task</button>}
        {subject && !skipped && onSkipSubject && <button type="button" role="menuitem" onClick={() => { closeMenu(); onSkipSubject(subject.id, task.date); }}>Skip {subject.name} today</button>}
      </div>}
    </div>

    <div className="task-row-actions">
      <TaskClockButton taskId={task.id} activeTaskId={activeTaskId} sessionActive={clockSessionActive} onFocusTask={onFocusTask} onClockOut={onClockOut} />
      <button type="button" className={`btn btn-xs task-primary ${done ? "btn-secondary" : "btn-primary"}`} aria-expanded={ratingOpen || undefined} onClick={handleDone}>{done ? "Undo" : "Done"}</button>
    </div>
    {ratingOpen && !done && <div className="rating-strip glass-panel slide-in" role="group" aria-label="How well did you recall it?">
      <span className="rating-q">How well did you recall it?</span>
      <div className="rating-btns">
        <button type="button" className="rate-btn rate-again" onClick={() => { setRatingOpen(false); onTaskStatus(task.id, "done", 1); }}>Again</button>
        <button type="button" className="rate-btn rate-hard" onClick={() => { setRatingOpen(false); onTaskStatus(task.id, "done", 2); }}>Hard</button>
        <button type="button" className="rate-btn rate-good" onClick={() => { setRatingOpen(false); onTaskStatus(task.id, "done", 3); }}>Good</button>
        <button type="button" className="rate-btn rate-easy" onClick={() => { setRatingOpen(false); onTaskStatus(task.id, "done", 4); }}>Easy</button>
      </div>
    </div>}
  </>;
}
