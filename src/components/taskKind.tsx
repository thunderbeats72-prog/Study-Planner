"use client";

import React from "react";
import { KIND_META, type TaskRow } from "@/lib/client";
import { IconBookOpen, IconRefresh, IconPencil, IconClipboard, IconCoffee, IconFlag } from "./icons";

/** Cross-subject mock/review tasks — same detection the views already used,
 *  now shared so every task row speaks one visual language. */
export function isCheckpointTask(task: TaskRow): boolean {
  return task.title.toLowerCase().includes("checkpoint") || (task.kind === "mock" && !task.subjectId);
}

export type TaskKindInfo = {
  key: string;
  label: string;
  color: string;
  Icon: (props: { size?: number }) => React.ReactNode;
};

/** One place that answers "what does this task type look like?" — icon tile,
 *  chip label and colour all derive from it. */
export function taskKindInfo(task: TaskRow): TaskKindInfo {
  if (isCheckpointTask(task)) return { key: "checkpoint", label: "Checkpoint", color: "var(--color-primary)", Icon: IconFlag };
  const meta = KIND_META[task.kind] || KIND_META.learn;
  switch (task.kind) {
    case "revise":
      return { key: "revise", label: meta.label, color: meta.color, Icon: IconRefresh };
    case "practice":
      return { key: "practice", label: meta.label, color: meta.color, Icon: IconPencil };
    case "mock":
      return { key: "mock", label: meta.label, color: meta.color, Icon: IconClipboard };
    case "buffer":
      return { key: "buffer", label: meta.label, color: meta.color, Icon: IconCoffee };
    default:
      return { key: "learn", label: meta.label, color: meta.color, Icon: IconBookOpen };
  }
}

/** Tinted icon tile shown at the start of modern task rows. Pass `color`
 *  (e.g. the subject colour) to tint the tile by subject instead — the glyph
 *  still communicates the task type. */
export function TaskKindIcon({ task, size = 26, color }: { task: TaskRow; size?: number; color?: string }) {
  const info = taskKindInfo(task);
  const pickColor = (c?: string) => c && !c.startsWith("var(") ? c : undefined;
  const tint = pickColor(color) ?? pickColor(info.color) ?? "var(--accent)";
  return (
    <span
      className="task-kind-ico"
      role="img"
      aria-label={info.label}
      title={info.label}
      style={
        {
          width: size,
          height: size,
          background: tint.startsWith("#") ? `color-mix(in srgb, ${tint} 15%, transparent)` : "var(--accent-soft)",
          color: tint,
        } as React.CSSProperties
      }
    >
      <info.Icon size={Math.round(size * 0.52)} />
    </span>
  );
}
