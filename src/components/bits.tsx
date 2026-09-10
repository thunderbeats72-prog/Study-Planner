"use client";

import React, { useEffect, useState } from "react";
import { cn } from "@/lib/cn";
import { KIND_META, type TaskRow as ClientTaskRow } from "@/lib/client";
import {
  IconBook,
  IconCalendar,
  IconCheck,
  IconClock,
  IconFlame,
  IconSpark,
  IconTarget,
} from "./icons";
import { Magnetic, MaskWords, Scramble, useInView } from "@/lib/fx";

/* ── Page head — the editorial block that opens every view (v25).
   It used to be a private pile of inline styles while the design system
   already owned a `.page-header / .page-title / .page-subtitle /
   .page-header-scene` contract (right-hand padding that reserves room for the
   illustration, a stacking-order fix below 860px, per-breakpoint title sizes).
   Adopting the contract is what makes the six headers behave identically from
   320px to 1920px, and it puts heading typography on the shared type scale
   instead of a per-component clamp() — the "different redesigns" feeling came
   mostly from six headers each owning their own numbers. */
export function PageHead({
  eyebrow,
  title,
  sub,
  art,
  actions,
}: {
  eyebrow: string;
  title: string;
  sub: string;
  art?: React.ReactNode;
  actions?: React.ReactNode;
}) {
  return (
    <header className="page-header">
      <div className="page-head-copy">
        <p className="page-head-eyebrow">
          <span className="page-head-tick" aria-hidden="true" />
          <Scramble text={eyebrow} />
        </p>
        <h1 className="page-title">
          <MaskWords text={title} />
        </h1>
        <p className="page-subtitle">{sub}</p>
        {actions ? <div className="page-head-actions">{actions}</div> : null}
      </div>
      {art ? (
        <div className="page-header-scene" aria-hidden="true">
          {art}
        </div>
      ) : null}
    </header>
  );
}

export function StatusChip({ status }: { status: string }) {
  const isDone = status === "done";
  const isSkipped = status === "skipped";
  return (
    <span
      className={cn(
        "status-chip",
        isDone ? "is-done" : isSkipped ? "is-skipped" : "is-pending",
      )}
    >
      {isDone ? "Done" : isSkipped ? "Skipped" : "Pending"}
    </span>
  );
}

/** Distinct glyph per task kind — mirrors the reference planner, where
 *  every row leads with a small tinted icon square next to the subject
 *  dot: Lesson → book, Recall → spark, Practice → flame, Test → target,
 *  Buffer → clock. Unknown kinds fall back to a spark. */
export const KIND_ICON: Record<
  string,
  React.ComponentType<{ size?: number }>
> = {
  learn: IconBook,
  revise: IconSpark,
  revision: IconClock,
  practice: IconFlame,
  mock: IconTarget,
  checkpoint: IconTarget,
  buffer: IconClock,
};

export function KindIcon({
  kind,
  color,
  label,
}: {
  kind: string;
  color?: string;
  label?: string;
}) {
  const meta = KIND_META[kind];
  const Ic = KIND_ICON[kind] || IconSpark;
  return (
    <span
      className="kind-ic"
      title={label || meta?.label || kind}
      style={
        {
          "--kind-c": color || meta?.color || "var(--accent)",
        } as React.CSSProperties
      }
    >
      <Ic size={11} />
    </span>
  );
}

/** Icon + word, never colour alone — and the colour is the same token the
 *  card rail and the calendar dot read, so one kind always looks the same. */
export function KindChip({
  kind,
  color,
  label,
}: {
  kind: string;
  color?: string;
  label?: string;
}) {
  const meta = KIND_META[kind];
  const Ic = KIND_ICON[kind] || IconSpark;
  return (
    <span
      className="kind-chip"
      style={
        {
          "--kind-c": color || meta?.color || "var(--accent)",
        } as React.CSSProperties
      }
    >
      <Ic size={10} />
      {label || meta?.label || kind}
    </span>
  );
}

export function Seg<T extends string>({
  value,
  onChange,
  options,
}: {
  value: T;
  onChange: (v: T) => void;
  options: { v: T; label: string; icon?: React.ReactNode }[];
}) {
  return (
    <div className="seg" role="group">
      {options.map((o) => (
        <button
          key={o.v}
          type="button"
          onClick={() => onChange(o.v)}
          className={cn("seg-btn", value === o.v && "is-on")}
          aria-pressed={value === o.v}
        >
          {o.icon}
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function WeekBars({
  days,
  goal,
  height = 150,
}: {
  days: { key: string; label: string; minutes: number }[];
  goal: number;
  height?: number;
}) {
  const { ref, inView } = useInView<HTMLDivElement>(0.2);
  const [on, setOn] = useState(false);
  useEffect(() => {
    if (inView) {
      const id = setTimeout(() => setOn(true), 50);
      return () => clearTimeout(id);
    }
  }, [inView]);

  const max = Math.max(goal, ...days.map((d) => d.minutes), 30);

  const fmtMin = (m: number) => {
    const h = Math.floor(m / 60);
    const rem = Math.round(m % 60);
    if (!h) return `${rem}m`;
    if (!rem) return `${h}h`;
    return `${h}h ${rem}m`;
  };

  return (
    <div ref={ref} className="weekbars">
      <div className="weekbars-track" style={{ height }}>
        <div
          className="weekbars-goal-line"
          style={{ bottom: `${Math.min(95, (goal / max) * 100)}%` }}
        >
          <span className="weekbars-goal">goal {fmtMin(goal)}</span>
        </div>

        {days.map((d, i) => {
          const isMet = d.minutes >= goal && goal > 0;
          const pct = Math.max(4, (d.minutes / max) * 100);
          return (
            <div key={d.key} className="weekbars-col">
              <div className="weekbars-tip">
                <span className="mono">{fmtMin(d.minutes)}</span>
              </div>
              <div
                className={cn("weekbars-bar", isMet && "is-met")}
                title={`${d.label} · ${fmtMin(d.minutes)} studied`}
                style={
                  {
                    height: on ? `${pct}%` : "4%",
                    "--bar-c": isMet ? "var(--good)" : "var(--accent)",
                    transitionDelay: `${i * 50}ms`,
                  } as React.CSSProperties
                }
              />
            </div>
          );
        })}
      </div>
      <div className="weekbars-axis">
        {days.map((d) => (
          <span key={d.key} className="weekbars-axis-label">
            {d.label}
          </span>
        ))}
      </div>
    </div>
  );
}

export function StartFocusButton({
  label = "Start Focus",
  onStart,
}: {
  label?: string;
  onStart: () => void;
}) {
  return (
    <Magnetic>
      <button type="button" onClick={onStart} className="btn btn-primary">
        <IconSpark size={15} /> {label}
      </button>
    </Magnetic>
  );
}
