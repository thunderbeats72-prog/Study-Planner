"use client";

import React from "react";

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
