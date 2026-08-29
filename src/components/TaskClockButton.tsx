"use client";

import React from "react";
import { mmss } from "@/lib/useTimer";

/**
 * The ONE clock button every task row shares — on the Overview, the
 * Planner and inside day sheets. It always reflects the live clock:
 *
 *  - this task is recording  → red "Clock out" (with a live pulse dot)
 *  - another task records    → "Switch" (banks the open minutes first)
 *  - nothing recording       → "Clock in"
 *
 * Before this existed, the row button kept saying "Clock in" even while
 * that very task was timing, and tapping it again silently restarted the
 * session — which is exactly how "I can start but can't stop" felt.
 */
export default function TaskClockButton({
  taskId, activeTaskId, sessionActive, onFocusTask, onClockOut,
}: {
  taskId: number;
  activeTaskId?: number | null;
  sessionActive?: boolean;
  onFocusTask: (taskId: number) => void;
  onClockOut: () => void;
}) {
  const live = !!sessionActive && activeTaskId === taskId;
  if (live) {
    return (
      <button
        className="btn btn-xs btn-danger task-clock clock-live"
        onClick={onClockOut}
        title="Stop the clock and save your minutes"
      >
        <span className="clock-live-dot" aria-hidden="true" />
        Clock out
      </button>
    );
  }
  if (sessionActive) {
    return (
      <button
        className="btn btn-xs btn-secondary task-clock"
        onClick={() => onFocusTask(taskId)}
        title="Save the current session's minutes and continue with this lesson"
      >
        Switch
      </button>
    );
  }
  return (
    <button className="btn btn-xs btn-secondary task-clock" onClick={() => onFocusTask(taskId)}>
      Clock in
    </button>
  );
}

/**
 * The quiet "this row is being recorded" marker, shown in the task's
 * subtitle line on every surface that lists tasks. Deliberately small —
 * the row's tint and pulsing dot already carry the state, so this only
 * has to confirm it and give the elapsed time somewhere readable to live.
 */
export function TaskLiveBadge({ seconds, running }: { seconds?: number; running?: boolean }) {
  return (
    <span className={`task-live-badge${running ? " is-recording" : ""}`}>
      <span className="task-live-dot" aria-hidden="true" />
      {running ? "Recording" : "Paused"}
      {!!seconds && <span className="mono task-live-time">{mmss(seconds)}</span>}
    </span>
  );
}
