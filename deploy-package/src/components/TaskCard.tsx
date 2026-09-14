"use client";

import React from "react";
import { cn } from "@/lib/cn";
import { formatMinutes, remainingMinutes } from "@/lib/studyTime";
import { mmss } from "@/lib/useTimer";
import {
  dayDiff,
  KIND_META,
  prettyDate,
  prettyLong,
  today,
  type SubjectRow,
  type TaskRow,
  type TopicRow,
} from "@/lib/client";
import {
  IconBook,
  IconBookOpen,
  IconCalendar,
  IconCheck,
  IconClock,
  IconSpark,
  IconTarget,
} from "./icons";
import { KindChip } from "./bits";
import TaskActions from "./TaskActions";
import { TaskLiveBadge } from "./TaskClockButton";

/* ══════════════════════════════════════════════════════════════════════
   TaskCard — the single task-row component (v25).

   Before this, the Overview and the Planner each hand-rolled their own row
   out of Tailwind utilities, so the two "same" lists drifted (one truncated
   its title, the other wrapped; one had a dot, the other a kind chip) and
   every later CSS layer chased a geometry that no shared class owned. This
   component is that shared owner:

     • grid-based card: rail · body · actions, so controls can never overlap
       the copy — on phones the action row drops below the body and the card
       grows to fit its content instead of clipping it;
     • title wraps on words (no `truncate`), the lesson brief is always
       visible (2 lines, then "more"), meta is a wrapping chip row;
     • colour comes from ONE semantic source — the task-kind token — used by
       the rail, the chip and the calendar dot, so they can't disagree.
   ══════════════════════════════════════════════════════════════════════ */

export type TaskCardProps = {
  task: TaskRow;
  subject?: SubjectRow | null;
  topic?: TopicRow | null;
  /** Overrides the kind label (checkpoint tasks read "Checkpoint"). */
  kindLabel?: string;
  /** Rail / dot / chip colour. Defaults to the task-kind token. */
  color?: string;
  loggedMinutes?: number;
  /** Row for the task the study clock is currently on. */
  live?: boolean;
  liveSeconds?: number;
  liveRunning?: boolean;
  /** Active seconds of the open session not yet saved to `sessions`.
   *  Added to the logged total while `live`, so the card shows the real
   *  ticking value even before the first whole minute is flushed. */
  livePendingSeconds?: number;
  /** Optional scroll target used when a planner brief opens. */
  briefRef?: React.RefObject<HTMLElement | null>;
  /** Planner passes handlers so the full brief can be expanded. */
  briefOpen?: boolean;
  onToggleBrief?: () => void;
  onAskTutor?: (question: string) => void;
  className?: string;
  /* ── action wiring (mirrors TaskActions) ── */
  activeTaskId?: number | null;
  clockSessionActive?: boolean;
  clockRunning?: boolean;
  onPauseOrResume?: () => void;
  onTaskStatus: (id: number, status: string, rating?: number) => void;
  onFocusTask: (taskId: number) => void;
  onClockOut: () => void;
  onEdit: (taskId: number) => void;
  /** Removes the task for real; the row only offers Delete when it exists. */
  onDelete?: (taskId: number) => void;
  onSkipSubject?: (subjectId: number, date: string) => void;
};

const isCheckpoint = (task: TaskRow) =>
  task.kind === "checkpoint" ||
  (!!task.title && task.title.toLowerCase().startsWith("checkpoint:"));

/** "Today" / "Tomorrow" / "Yesterday" / "in 3 days" — short, so the chip
 *  fits on a 320px screen without wrapping the whole meta row. */
function dueLabel(date: string) {
  const diff = dayDiff(today(), date);
  if (diff === 0) return "Today";
  if (diff === 1) return "Tomorrow";
  if (diff === -1) return "Yesterday";
  if (diff < 0) return `${-diff} days late`;
  if (diff <= 9) return `In ${diff} days`;
  return prettyDate(date);
}

export default function TaskCard({
  task,
  subject,
  topic,
  kindLabel,
  color,
  loggedMinutes = 0,
  live,
  liveSeconds,
  liveRunning,
  livePendingSeconds,
  briefRef,
  briefOpen,
  onToggleBrief,
  onAskTutor,
  className,
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
}: TaskCardProps) {
  const meta = KIND_META[task.kind] || KIND_META.learn;
  const checkpoint = isCheckpoint(task);
  const kindColor =
    color || (checkpoint ? "var(--task-checkpoint)" : meta.color);
  const done = task.status === "done";
  const skipped = task.status === "skipped";
  const overdue = !done && !skipped && dayDiff(today(), task.date) < 0;
  const title = checkpoint
    ? task.title.replace(/^checkpoint:\s*/i, "").trim() || task.title
    : task.title;
  const brief = topic?.summary || task.detail || "";
  const hasBriefPanel = !!topic || !!task.detail;
  const due = dueLabel(task.date);

  /* Actual study time for this task: saved sessions (persisted after clock
     out) PLUS the active seconds of the open session that have not yet been
     flushed to the server. The open session's already-flushed whole minutes
     are already inside `loggedMinutes`, so adding `livePendingSeconds`
     cannot double-count, and the value ticks every second while recording. */
  const liveExtraSeconds = live
    ? Math.max(0, Math.floor(livePendingSeconds ?? 0))
    : 0;
  const persistedLoggedSeconds = Math.round(loggedMinutes * 60);
  const totalLoggedSeconds = persistedLoggedSeconds + liveExtraSeconds;
  const totalLoggedMinutes = totalLoggedSeconds / 60;
  const remaining = remainingMinutes(task.plannedMinutes, totalLoggedMinutes);
  const showLogged = live ? totalLoggedSeconds > 0 : loggedMinutes > 0;

  return (
    <article
      ref={briefRef}
      data-task-card={task.id}
      className={cn(
        "task-card",
        done && "is-done",
        skipped && "is-skipped",
        overdue && "is-overdue",
        live && "is-live",
        className,
      )}
      style={{ "--task-c": kindColor } as React.CSSProperties}
    >
      <span className="task-card-rail" aria-hidden="true" />

      <div className="task-card-body">
        <div className="task-card-top">
          <KindChip
            kind={task.kind}
            label={checkpoint ? "Checkpoint" : meta.label}
            color={kindColor}
          />
          <span className="task-card-subject">
            {/* The subject's own colour, as a dot: the same token the
                calendar chips use, so a row and its day cell agree. */}
            {subject?.color ? (
              <span
                className="task-subject-dot"
                style={{ "--subj-c": subject.color } as React.CSSProperties}
                aria-hidden="true"
              />
            ) : null}
            <IconBook size={11} />
            {/* The name is its own box so a long subject ellipsises instead
                of pushing the icon, the chip or the row out of shape. */}
            <span className="task-subject-name">
              {subject?.name ?? "General"}
            </span>
          </span>
          {live && (
            <TaskLiveBadge seconds={liveSeconds} running={liveRunning} />
          )}
        </div>

        <h3 className="task-card-title">{title}</h3>

        {brief && (
          <p className={cn("task-card-brief", !briefOpen && "clamp-2")}>
            {brief}
          </p>
        )}

        <ul className="task-card-meta">
          <li className="task-meta-item">
            <IconCalendar size={11} />
            <span title={prettyLong(task.date)}>{due}</span>
          </li>
          <li
            className="task-meta-item is-planned"
            title="Planned duration for this task"
          >
            <IconClock size={11} aria-hidden="true" />
            <span>{task.plannedMinutes}m planned</span>
          </li>
          <li
            className="task-meta-item is-remaining"
            title="Planned duration minus actual logged study time"
          >
            <IconTarget size={11} aria-hidden="true" />
            <span>{formatMinutes(remaining)} remaining</span>
          </li>
          {topic?.unit && (
            <li
              className="task-meta-item task-meta-extra"
              title="Curriculum unit"
            >
              <IconBookOpen size={11} aria-hidden="true" />
              <span>{topic.unit}</span>
            </li>
          )}
          {topic?.difficulty && (
            <li
              className="task-meta-item task-meta-extra"
              title="Curriculum difficulty"
            >
              <IconTarget size={11} aria-hidden="true" />
              <span>{topic.difficulty}</span>
            </li>
          )}
          {showLogged && (
            <li
              className={cn(
                "task-meta-item is-logged",
                live && "is-logging",
              )}
              title={
                live
                  ? `Actual study time logged on this task — recording now (${mmss(totalLoggedSeconds)})`
                  : "Actual minutes studied and logged on this task"
              }
            >
              <IconCheck size={11} aria-hidden="true" />
              {live ? (
                <span className="mono task-logged-value">
                  {mmss(totalLoggedSeconds)} logged
                </span>
                ) : (
                <span className="task-logged-value">
                  {formatMinutes(totalLoggedMinutes)} logged
                </span>
              )}
            </li>
          )}
        </ul>

        <div className="task-card-actions">
          {hasBriefPanel && onToggleBrief && (
            <button
              type="button"
              className="btn btn-xs btn-ghost task-brief-btn"
              onClick={onToggleBrief}
              aria-expanded={!!briefOpen}
              aria-controls={`lesson-brief-${task.id}`}
              title={
                briefOpen
                  ? "Hide the lesson brief"
                  : "Read the lesson brief, prerequisites and key concepts"
              }
            >
              <IconBookOpen size={13} />
              <span>{briefOpen ? "Hide brief" : "Lesson brief"}</span>
            </button>
          )}
          <TaskActions
            task={task}
            subject={subject}
            activeTaskId={activeTaskId}
            clockSessionActive={clockSessionActive}
            clockRunning={clockRunning}
            onPauseOrResume={onPauseOrResume}
            onTaskStatus={onTaskStatus}
            onFocusTask={onFocusTask}
            onClockOut={onClockOut}
            onEdit={onEdit}
            onDelete={onDelete}
            onSkipSubject={onSkipSubject}
          />
        </div>

        {briefOpen && (topic || task.detail) && (
          <div
            id={`lesson-brief-${task.id}`}
            className="task-card-brief-panel"
            aria-label="Lesson brief"
          >
            <div className="task-brief-head">
              <span className="task-brief-icon" aria-hidden="true">
                <IconSpark size={14} />
              </span>
              <div>
                <strong className="task-brief-kicker">Lesson brief</strong>
                <span className="task-brief-context">
                  {topic?.title || "Study note"}
                </span>
              </div>
            </div>

            <p className="task-brief-text">
              {topic?.summary || task.detail}
            </p>

            {(topic?.objectives ?? []).length > 0 && (
              <div className="task-brief-block">
                <strong>By the end</strong>
                <ul>
                  {(topic?.objectives ?? []).slice(0, 3).map((objective, i) => (
                    <li key={i}>{objective}</li>
                  ))}
                </ul>
              </div>
            )}
            {(topic?.prerequisites ?? []).length > 0 && (
              <div className="task-brief-block">
                <strong>Prerequisites</strong>
                <ul>
                  {(topic?.prerequisites ?? []).slice(0, 3).map((pr, i) => (
                    <li key={i}>{pr}</li>
                  ))}
                </ul>
              </div>
            )}
            {(topic?.keyConcepts ?? []).length > 0 && (
              <div className="task-brief-block">
                <strong>Key concepts</strong>
                <ul className="task-brief-concepts">
                  {(topic?.keyConcepts ?? []).map((kc, i) => (
                    <li key={i} className="chip chip-kind chip-tight">
                      {kc}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {topic?.practice && (
              <div className="task-brief-practice">
                <span className="task-brief-practice-label">Try this</span>
                <span>{topic.practice}</span>
              </div>
            )}
            {onAskTutor && (
              <div className="task-brief-footer">
                <span className="task-brief-footer-note">Need a worked example?</span>
                <button
                  type="button"
                  className="btn btn-xs btn-primary"
                  onClick={() =>
                    onAskTutor(
                      `Teach me "${topic?.title || task.title}" from ${subject?.name || "the syllabus"}. Explain key concepts and give a worked example.`,
                    )
                  }
                >
                  <IconSpark size={13} />
                  <span>Ask Tutor</span>
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </article>
  );
}

