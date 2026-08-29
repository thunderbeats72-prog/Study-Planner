"use client";

import React, { useCallback, useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import TaskClockButton from "./TaskClockButton";
import { isMenuNavKey, nextMenuIndex } from "@/lib/menuNav";
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
  const [menuStyle, setMenuStyle] = useState<React.CSSProperties>({});
  const [menuPlaced, setMenuPlaced] = useState(false);
  const [ratingOpen, setRatingOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const closeMenu = useCallback(() => { releaseMenu(menuId); setMenuOpen(false); setMenuPlaced(false); }, [menuId]);

  const positionMenu = useCallback(() => {
    const trigger = triggerRef.current;
    if (!trigger) return;
    const rect = trigger.getBoundingClientRect();
    const width = 210;
    const gap = 8;
    const margin = 12;
    const menuHeight = Math.min(240, Math.max(120, menuRef.current?.offsetHeight || 180));
    let left = rect.right - width;
    left = Math.max(margin, Math.min(left, window.innerWidth - width - margin));
    const below = rect.bottom + gap;
    const above = rect.top - menuHeight - gap;
    const top = below + menuHeight <= window.innerHeight - margin
      ? below
      : Math.max(margin, above);
    setMenuStyle({ position: "fixed", top, left, right: "auto", width: `min(${width}px, calc(100vw - ${margin * 2}px))` });
    setMenuPlaced(true);
  }, []);

  useEffect(() => () => releaseMenu(menuId), [menuId]);
  useEffect(() => {
    if (!menuOpen) return;
    positionMenu();
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.stopPropagation(); closeMenu(); triggerRef.current?.focus();
    };
    const onClick = (event: MouseEvent) => {
      const target = event.target as Node;
      if (wrapRef.current?.contains(target) || menuRef.current?.contains(target)) return;
      closeMenu();
    };
    const onViewportChange = () => positionMenu();
    window.addEventListener("click", onClick);
    window.addEventListener("keydown", onKey);
    window.addEventListener("resize", onViewportChange);
    window.addEventListener("scroll", onViewportChange, true);
    return () => {
      window.removeEventListener("click", onClick);
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("resize", onViewportChange);
      window.removeEventListener("scroll", onViewportChange, true);
    };
  }, [menuOpen, closeMenu, positionMenu]);

  useEffect(() => {
    if (!menuOpen) return;
    const id = window.setTimeout(() => {
      positionMenu();
      wrapRef.current?.querySelector<HTMLButtonElement>("[role=menuitem]")?.focus();
    }, 0);
    return () => window.clearTimeout(id);
  }, [menuOpen, positionMenu]);

  const toggleMenu = () => {
    if (menuOpen) { closeMenu(); return; }
    claimMenu(menuId, closeMenu);
    setMenuOpen(true);
  };
  const onMenuKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (!isMenuNavKey(event.key)) return;
    event.preventDefault();
    const items = Array.from(wrapRef.current?.querySelectorAll<HTMLButtonElement>("[role=menuitem]") || []);
    const index = items.indexOf(document.activeElement as HTMLButtonElement);
    const next = nextMenuIndex(event.key, index, items.length);
    if (next != null) items[next]?.focus();
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
      {menuOpen && (() => {
        // Portalled to <body> in the browser so no scrollable/filtered ancestor
        // can clip or re-anchor the fixed popover; inline where there is no DOM.
        const node = <div ref={menuRef} id={`${menuId}-menu`} className={`task-menu glass-panel${menuPlaced ? " is-open" : ""}`} style={menuStyle} role="menu" aria-label="More task actions" onKeyDown={onMenuKeyDown}>
        <button type="button" role="menuitem" onClick={() => { closeMenu(); onEdit(task.id); }}>Edit task</button>
        {skipped && <button type="button" role="menuitem" onClick={() => { closeMenu(); onTaskStatus(task.id, "pending"); }}>Reopen</button>}
        {!done && !skipped && <button type="button" role="menuitem" onClick={() => { closeMenu(); onTaskStatus(task.id, "skipped"); }}>Skip task</button>}
        {subject && !skipped && onSkipSubject && <button type="button" role="menuitem" onClick={() => { closeMenu(); onSkipSubject(subject.id, task.date); }}>Skip {subject.name} today</button>}
      </div>;
        const container = typeof document === "undefined" ? null : document.body;
        return container ? createPortal(node, container) : node;
      })()}
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
