"use client";

import React from "react";
import { cn } from "@/lib/cn";
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
import { IconBook, IconCalendar, IconClock, IconSpark } from "./icons";
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
  /** Planner passes handlers so the full brief can be expanded. */
  briefOpen?: boolean;
  onToggleBrief?: () => void;
  onAskTutor?: (question: string) => void;
  className?: string;
  /* ── action wiring (mirrors TaskActions) ── */
  activeTaskId?: number | null;
  clockSessionActive?: boolean;
  onTaskStatus: (id: number, status: string, rating?: number) => void;
  onFocusTask: (taskId: number) => void;
  onClockOut: () => void;
  onEdit: (taskId: number) => void;
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
  briefOpen,
  onToggleBrief,
  onAskTutor,
  className,
  activeTaskId,
  clockSessionActive,
  onTaskStatus,
  onFocusTask,
  onClockOut,
  onEdit,
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
  const brief =
    topic?.summary || (checkpoint && task.detail ? task.detail : "");
  const hasBriefPanel = !!topic || (!!task.detail && checkpoint);
  const due = dueLabel(task.date);

  return (
    <article
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
            <IconBook size={11} />
            {subject?.name ?? "General"}
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
          <li className="task-meta-item">
            <IconClock size={11} />
            <span>{task.plannedMinutes} min</span>
          </li>
          {topic?.unit && (
            <li className="task-meta-item">
              <span>{topic.unit}</span>
            </li>
          )}
          {topic?.difficulty && (
            <li className="task-meta-item" title="Curriculum difficulty">
              <span>{topic.difficulty}</span>
            </li>
          )}
          {loggedMinutes > 0 && (
            <li className="task-meta-item is-logged">
              <IconCheckInline />
              <span>{Math.round(loggedMinutes)}m logged</span>
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
              title={
                briefOpen
                  ? "Hide the lesson brief"
                  : "Read the lesson brief, prerequisites and key concepts"
              }
            >
              <IconSpark size={13} />
              <span>{briefOpen ? "Hide brief" : "Lesson brief"}</span>
            </button>
          )}
          <TaskActions
            task={task}
            subject={subject}
            activeTaskId={activeTaskId}
            clockSessionActive={clockSessionActive}
            onTaskStatus={onTaskStatus}
            onFocusTask={onFocusTask}
            onClockOut={onClockOut}
            onEdit={onEdit}
            onSkipSubject={onSkipSubject}
          />
        </div>

        {briefOpen && topic && (
          <div className="task-card-brief-panel">
            <p className="task-brief-text">{topic.summary}</p>
            {topic.prerequisites?.length > 0 && (
              <div className="task-brief-block">
                <strong>Prerequisites</strong>
                <ul>
                  {topic.prerequisites.map((pr, i) => (
                    <li key={i}>{pr}</li>
                  ))}
                </ul>
              </div>
            )}
            {topic.keyConcepts?.length > 0 && (
              <ul className="task-brief-concepts">
                {topic.keyConcepts.map((kc, i) => (
                  <li key={i} className="chip chip-kind chip-tight">
                    {kc}
                  </li>
                ))}
              </ul>
            )}
            {onAskTutor && (
              <button
                type="button"
                className="btn btn-xs btn-primary"
                onClick={() =>
                  onAskTutor(
                    `Teach me "${topic.title}" from ${subject?.name || "the syllabus"}. Explain key concepts and give a worked example.`,
                  )
                }
              >
                <IconSpark size={13} />
                <span>Ask Tutor to teach this</span>
              </button>
            )}
          </div>
        )}
      </div>
    </article>
  );
}

function IconCheckInline() {
  return (
    <svg
      viewBox="0 0 24 24"
      width="11"
      height="11"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M20 6 9 17l-5-5" />
    </svg>
  );
}
