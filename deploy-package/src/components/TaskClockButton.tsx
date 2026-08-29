"use client";

import React from "react";
import { mmss } from "@/lib/useTimer";

/**
 * The ONE clock button every task row shares — on the Overview, the
 * Planner and inside day sheets. It always reflects the live clock.
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

  const handleClockOut = (event: React.MouseEvent<HTMLButtonElement>) => {
    event.preventDefault();
    event.stopPropagation();
    onClockOut();
  };

  const handleFocusTask = (event: React.MouseEvent<HTMLButtonElement>) => {
    event.preventDefault();
    event.stopPropagation();
    onFocusTask(taskId);
  };

  if (live) {
    return (
      <button
        type="button"
        className="btn btn-xs btn-danger task-clock clock-live"
        onClick={handleClockOut}
        title="Stop the clock and save your minutes"
        aria-label="Clock out of this task"
      >
        <span className="clock-live-dot" aria-hidden="true" />
        Clock out
      </button>
    );
  }

  if (sessionActive) {
    return (
      <button
        type="button"
        className="btn btn-xs btn-secondary task-clock"
        onClick={handleFocusTask}
        title="Save the current session's minutes and continue with this lesson"
      >
        Switch
      </button>
    );
  }

  return (
    <button type="button" className="btn btn-xs btn-secondary task-clock" onClick={handleFocusTask}>
      Clock in
    </button>
  );
}

export function TaskLiveBadge({ seconds, running }: { seconds?: number; running?: boolean }) {
  return (
    <span className={`task-live-badge${running ? " is-recording" : ""}`}>
      <span className="task-live-dot" aria-hidden="true" />
      {running ? (
        <>
          Recording
          <span className="mono task-live-time">{mmss(seconds ?? 0)}</span>
        </>
      ) : (
        "Paused"
      )}
    </span>
  );
}
