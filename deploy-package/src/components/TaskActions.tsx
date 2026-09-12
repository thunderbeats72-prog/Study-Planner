"use client";

import React, {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import TaskClockButton from "./TaskClockButton";
import { ConfirmDialog } from "./bits";
import {
  IconBook,
  IconCheck,
  IconClose,
  IconEdit,
  IconTrash,
  IconUndo,
} from "./icons";
import type { SubjectRow, TaskRow } from "@/lib/client";

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

/* ══════════════════════════════════════════════════════════════════════
   The ⋯ menu renders in a PORTAL pinned with position:fixed.

   Why: the old in-flow absolute dropdown was silently clipped to nothing —
   `.day-block` carries `overflow: hidden` (for its rounded corners) and the
   day sheet's list is a scroll container, so opening the menu on the last
   task of a day painted it outside the visible box. A portal anchored to
   the trigger's live bounding rect can never be clipped by an ancestor.

   Placement rules: right-aligned under the trigger, flipped ABOVE when the
   viewport bottom is too close, clamped to a 10px margin on both sides
   (320px screens included), and re-anchored on every scroll/resize while
   open (capture-phase scroll catches the day sheet's own scroll container).
   ══════════════════════════════════════════════════════════════════════ */
type MenuPlacement = { top: number; left: number; above: boolean };

export default function TaskActions({
  task,
  subject,
  activeTaskId,
  clockSessionActive,
  clockRunning,
  onPauseOrResume,
  onTaskStatus,
  onFocusTask,
  onClockOut,
  onEdit,
  onDelete,
  onSkipSubject,
}: {
  task: TaskRow;
  subject?: SubjectRow | null;
  activeTaskId?: number | null;
  clockSessionActive?: boolean;
  clockRunning?: boolean;
  onPauseOrResume?: () => void;
  onTaskStatus: (id: number, status: string, rating?: number) => void;
  onFocusTask: (taskId: number) => void;
  onClockOut: () => void;
  onEdit: (taskId: number) => void;
  /** Present once the page can really remove a task; the verb is only
   *  rendered when the handler exists, so nothing ever offers a dead action. */
  onDelete?: (taskId: number) => void;
  onSkipSubject?: (subjectId: number, date: string) => void;
}) {
  const menuId = useId();
  const [menuOpen, setMenuOpen] = useState(false);
  const [menuPos, setMenuPos] = useState<MenuPlacement | null>(null);
  const [ratingOpen, setRatingOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const closeMenu = useCallback(() => {
    releaseMenu(menuId);
    setMenuOpen(false);
  }, [menuId]);
  useEffect(() => () => releaseMenu(menuId), [menuId]);

  /** Anchor the portal menu to the trigger's current rect, viewport-aware.
   *  The result is always fully inside the viewport: clamped to a 10px
   *  margin on every side, flipped above the trigger when there is not
   *  enough room below, and never taller than the screen (it scrolls
   *  internally instead of running off the top or under the dock). */
  const placeMenu = useCallback(() => {
    const trigger = triggerRef.current;
    if (!trigger) return;
    const rect = trigger.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const width = menuRef.current?.offsetWidth || 210;
    const rawHeight = menuRef.current?.offsetHeight || 0;
    const margin = 10;
    const height = Math.min(rawHeight || 180, vh - margin * 2);
    const left = Math.max(
      margin,
      Math.min(rect.right - width, vw - width - margin),
    );
    const spaceBelow = vh - rect.bottom;
    // Flip above only when below genuinely doesn't fit AND above fits better.
    const above = spaceBelow < height + 12 && rect.top > spaceBelow;
    const top = above
      ? Math.max(margin, rect.top - height - 6)
      : Math.min(rect.bottom + 6, vh - height - margin);
    setMenuPos({
      top: Math.round(Math.max(margin, top)),
      left: Math.round(Math.max(margin, left)),
      above,
    });
  }, []);

  useLayoutEffect(() => {
    if (!menuOpen) return;
    placeMenu();
    /* One more pass on the next frame: the first measurement can happen
       before the portal's entry animation and fonts have settled, which
       used to leave the menu anchored a few pixels off — or, on a cold
       open, still parked off-screen. */
    /* Guarded: react-test-renderer (the suite) has no rAF on `window`. */
    const raf =
      typeof window.requestAnimationFrame === "function"
        ? window.requestAnimationFrame(placeMenu)
        : null;
    // Capture phase: also catches scrolling inside .day-sheet-list & co.
    const reanchor = () => placeMenu();
    window.addEventListener("resize", reanchor);
    window.addEventListener("scroll", reanchor, true);
    return () => {
      if (raf != null) window.cancelAnimationFrame(raf);
      window.removeEventListener("resize", reanchor);
      window.removeEventListener("scroll", reanchor, true);
    };
  }, [menuOpen, placeMenu]);

  useEffect(() => {
    if (!menuOpen) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.stopPropagation();
      closeMenu();
      triggerRef.current?.focus();
    };
    const onClick = (event: MouseEvent) => {
      const target = event.target as Node | null;
      if (wrapRef.current?.contains(target)) return;
      // Clicks inside the portalled menu are "inside" too — their own
      // handlers decide whether the menu closes.
      if (menuRef.current?.contains(target)) return;
      closeMenu();
    };
    window.addEventListener("click", onClick);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("click", onClick);
      window.removeEventListener("keydown", onKey);
    };
  }, [menuOpen, closeMenu]);
  useEffect(() => {
    if (!menuOpen) return;
    const id = window.setTimeout(
      () =>
        menuRef.current
          ?.querySelector<HTMLButtonElement>("[role=menuitem]")
          ?.focus({ preventScroll: true }),
      0,
    );
    return () => window.clearTimeout(id);
  }, [menuOpen]);

  /* `stopPropagation` matters: the window click listener that closes the menu
     is registered on the very same click in some browsers, and without it the
     open tap could be read as an outside tap and close the menu again in the
     same tick — the "⋮ does nothing" symptom. */
  const toggleMenu = (event?: React.MouseEvent<HTMLButtonElement>) => {
    event?.preventDefault();
    event?.stopPropagation();
    if (menuOpen) {
      closeMenu();
      return;
    }
    claimMenu(menuId, closeMenu);
    setMenuOpen(true);
  };
  const onMenuKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) return;
    event.preventDefault();
    const items = Array.from(
      menuRef.current?.querySelectorAll<HTMLButtonElement>("[role=menuitem]") ||
        [],
    );
    const index = items.indexOf(document.activeElement as HTMLButtonElement);
    const next =
      event.key === "Home"
        ? 0
        : event.key === "End"
          ? items.length - 1
          : event.key === "ArrowDown"
            ? (index + 1 + items.length) % items.length
            : (index - 1 + items.length) % items.length;
    items[next]?.focus({ preventScroll: true });
  };

  const done = task.status === "done";
  const skipped = task.status === "skipped";

  const handleDone = () => {
    if (done) {
      onTaskStatus(task.id, "pending");
      return;
    }
    if (task.kind === "revise" && task.topicId) {
      setRatingOpen((value) => !value);
      return;
    }
    onTaskStatus(task.id, "done");
  };

  /* The menu node. In a real browser it is portalled to document.body so no
     ancestor (`overflow: hidden` day blocks, scrollable day sheets) can clip
     it; where there is no DOM (the react-test-renderer suite) it renders
     inline so the same logic stays fully testable. */
  const portalTarget =
    typeof document !== "undefined" && document.body ? document.body : null;
  const menuNode = (
    <div
      ref={menuRef}
      id={`${menuId}-menu`}
      className="task-menu glass-panel"
      role="menu"
      aria-label="More task actions"
      onKeyDown={onMenuKeyDown}
      style={
        portalTarget
          ? ({
              position: "fixed",
              top: menuPos ? `${menuPos.top}px` : "0px",
              left: menuPos ? `${menuPos.left}px` : "0px",
              right: "auto",
              /* Parked off-screen until the first measurement lands, so the
                 menu never flashes at the top-left corner of the viewport. */
              visibility: menuPos ? "visible" : "hidden",
              /* Above the dock (150), the chat sheet (201) and modals (300);
                 only toasts (400+) and the day sheet sit over it. */
              zIndex: 400,
              transformOrigin: menuPos?.above ? "bottom right" : "top right",
            } as React.CSSProperties)
          : undefined
      }
    >
      <button
        type="button"
        role="menuitem"
        className="task-menu-item"
        onClick={() => {
          closeMenu();
          onEdit(task.id);
        }}
      >
        <span className="task-menu-ic" aria-hidden="true">
          <IconEdit size={14} />
        </span>
        <span className="task-menu-tx">Edit task</span>
      </button>
      {skipped && (
        <button
          type="button"
          role="menuitem"
          className="task-menu-item"
          onClick={() => {
            closeMenu();
            onTaskStatus(task.id, "pending");
          }}
        >
          <span className="task-menu-ic" aria-hidden="true">
            <IconUndo size={14} />
          </span>
          <span className="task-menu-tx">Reopen</span>
        </button>
      )}
      {!done && !skipped && (
        <button
          type="button"
          role="menuitem"
          className="task-menu-item"
          onClick={() => {
            closeMenu();
            onTaskStatus(task.id, "skipped");
          }}
        >
          <span className="task-menu-ic" aria-hidden="true">
            <IconClose size={14} />
          </span>
          <span className="task-menu-tx">Skip task</span>
        </button>
      )}
      {subject && !skipped && onSkipSubject && (
        <button
          type="button"
          role="menuitem"
          className="task-menu-item"
          onClick={() => {
            closeMenu();
            onSkipSubject(subject.id, task.date);
          }}
        >
          <span className="task-menu-ic" aria-hidden="true">
            <IconBook size={14} />
          </span>
          <span className="task-menu-tx">Skip {subject.name} today</span>
        </button>
      )}
      {onDelete && (
        <>
          <div className="task-menu-sep" role="separator" />
          <button
            type="button"
            role="menuitem"
            className="task-menu-item is-danger"
            onClick={() => {
              closeMenu();
              setConfirmDelete(true);
            }}
          >
            <span className="task-menu-ic" aria-hidden="true">
              <IconTrash size={14} />
            </span>
            <span className="task-menu-tx">Delete task</span>
          </button>
        </>
      )}
    </div>
  );

  const renderedMenu = menuOpen ? (
    portalTarget ? (
      createPortal(menuNode, portalTarget)
    ) : (
      menuNode
    )
  ) : null;

  return (
    <>
      <div className="task-btns" role="group" aria-label="Task actions">
        <TaskClockButton
          taskId={task.id}
          activeTaskId={activeTaskId}
          sessionActive={clockSessionActive}
          clockRunning={clockRunning}
          onFocusTask={onFocusTask}
          onClockOut={onClockOut}
          onPauseOrResume={onPauseOrResume}
        />

        <button
          type="button"
          className={`btn btn-xs task-primary ${done ? "btn-secondary" : "btn-primary"}`}
          aria-expanded={ratingOpen || undefined}
          aria-label={
            done ? "Mark this task as not done" : "Mark this task as done"
          }
          title={done ? "Undo — put it back on tomorrow's plan" : "Mark done"}
          onClick={handleDone}
        >
          {done ? <IconUndo size={13} /> : <IconCheck size={13} />}
          <span>{done ? "Undo" : "Done"}</span>
        </button>

        <div className="task-more-wrap" ref={wrapRef}>
          <button
            ref={triggerRef}
            type="button"
            className="task-more"
            aria-label="More task actions"
            title="More actions"
            aria-haspopup="menu"
            aria-expanded={menuOpen}
            aria-controls={menuOpen ? `${menuId}-menu` : undefined}
            onClick={toggleMenu}
          >
            <span className="task-more-dots" aria-hidden="true">
              <i />
              <i />
              <i />
            </span>
          </button>
        </div>
      </div>
      {renderedMenu}
      {confirmDelete && onDelete && (
        <ConfirmDialog
          title="Delete this task?"
          message={
            <>
              <strong>{task.title}</strong> will be removed from{" "}
              {task.date} along with the minutes planned for it.
            </>
          }
          detail="Your curriculum lesson stays in the syllabus — use Re-plan to reschedule it, or Skip if you only want it off today."
          confirmLabel="Delete task"
          cancelLabel="Keep it"
          onCancel={() => setConfirmDelete(false)}
          onConfirm={() => {
            setConfirmDelete(false);
            onDelete(task.id);
          }}
        />
      )}
      {ratingOpen && !done && (
        <div
          className="rating-strip glass-panel slide-in"
          role="group"
          aria-label="How well did you recall it?"
        >
          <span className="rating-q">How well did you recall it?</span>
          <div className="rating-btns">
            <button
              type="button"
              className="rate-btn rate-again"
              onClick={() => {
                setRatingOpen(false);
                onTaskStatus(task.id, "done", 1);
              }}
            >
              Again
            </button>
            <button
              type="button"
              className="rate-btn rate-hard"
              onClick={() => {
                setRatingOpen(false);
                onTaskStatus(task.id, "done", 2);
              }}
            >
              Hard
            </button>
            <button
              type="button"
              className="rate-btn rate-good"
              onClick={() => {
                setRatingOpen(false);
                onTaskStatus(task.id, "done", 3);
              }}
            >
              Good
            </button>
            <button
              type="button"
              className="rate-btn rate-easy"
              onClick={() => {
                setRatingOpen(false);
                onTaskStatus(task.id, "done", 4);
              }}
            >
              Easy
            </button>
          </div>
        </div>
      )}
    </>
  );
}
