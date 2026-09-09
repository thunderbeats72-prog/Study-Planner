"use client";

import React, { useEffect, useState } from "react";
import { cn } from "@/lib/cn";
import { KIND_META, type TaskRow as ClientTaskRow } from "@/lib/client";
import { IconBook, IconCalendar, IconCheck, IconClock, IconFlame, IconSpark, IconTarget } from "./icons";
import { Magnetic, MaskWords, Scramble, useInView } from "@/lib/fx";

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
    <div className="relative mb-6 grid gap-4 md:mb-8 md:grid-cols-[1fr_auto] md:items-end">
      <div>
        <p className="mb-2 flex items-center gap-2 text-[11px] font-extrabold tracking-[0.14em] uppercase text-accent" style={{ color: "var(--accent, var(--color-primary, #6366f1))" }}>
          <span className="h-1.5 w-1.5 rounded-full" style={{ background: "var(--accent, var(--color-primary, #6366f1))" }} />
          <Scramble text={eyebrow} />
        </p>
        <h1 className="text-[28px] font-extrabold leading-[1.1] tracking-tight sm:text-[36px]" style={{ color: "var(--text-main, #211a3a)" }}>
          <MaskWords text={title} />
        </h1>
        <p className="mt-2 max-w-2xl text-[14px] font-medium leading-relaxed" style={{ color: "var(--text-dim, #5f5a7a)" }}>
          {sub}
        </p>
        {actions && <div className="mt-4 flex flex-wrap items-center gap-2.5">{actions}</div>}
      </div>
      {art && (
        <div className="pointer-events-none relative hidden h-[180px] w-[320px] select-none md:block [&>svg]:h-full [&>svg]:w-full">
          {art}
        </div>
      )}
    </div>
  );
}

export function StatusChip({ status }: { status: string }) {
  const isDone = status === "done";
  const isSkipped = status === "skipped";
  return (
    <span
      className={cn(
        "mono inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[10.5px] font-bold tracking-wider uppercase",
        isDone
          ? "bg-[color-mix(in_oklab,var(--success-accent,#2e9e6d)_16%,transparent)] text-[var(--success-accent,#2e9e6d)]"
          : isSkipped
            ? "bg-[var(--surface-2,#f4f2fc)] text-[var(--text-dim,#8f8aa6)]"
            : "bg-[color-mix(in_oklab,var(--warning-accent,#c07a10)_16%,transparent)] text-[var(--warning-accent,#c07a10)]"
      )}
    >
      {isDone ? "DONE" : isSkipped ? "SKIPPED" : "PENDING"}
    </span>
  );
}

export function KindChip({ kind, color }: { kind: string; color?: string }) {
  const meta = KIND_META[kind] || { label: kind, color: color || "var(--accent, #6366f1)" };
  const c = color || meta.color;
  return (
    <span
      className="mono inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[10.5px] font-bold tracking-wider uppercase"
      style={{
        background: `color-mix(in oklab, ${c} 16%, transparent)`,
        color: c,
      }}
    >
      {meta.label.toUpperCase()}
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
    <div className="inline-flex rounded-xl border border-[var(--border-subtle,#e4e0f1)] bg-[var(--surface-2,#f4f2fc)] p-1">
      {options.map((o) => (
        <button
          key={o.v}
          type="button"
          onClick={() => onChange(o.v)}
          className={cn(
            "flex items-center gap-1.5 rounded-lg px-3.5 py-1.5 text-[13px] font-bold transition-all duration-300",
            value === o.v
              ? "bg-[var(--surface-card,#fcfbff)] shadow-sm"
              : "opacity-60 hover:opacity-100"
          )}
          style={{
            color: value === o.v ? "var(--accent, var(--color-primary, #6366f1))" : "var(--text-main, #211a3a)",
          }}
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
    <div ref={ref} className="w-full">
      <div className="relative flex items-end gap-2 sm:gap-3" style={{ height }}>
        {/* goal dashed line */}
        <div
          className="pointer-events-none absolute inset-x-0 border-t border-dashed"
          style={{
            bottom: `${Math.min(95, (goal / max) * 100)}%`,
            borderColor: "color-mix(in oklab, var(--accent, #6366f1) 50%, transparent)",
          }}
        >
          <span
            className="mono absolute -top-4 right-0 text-[10px] font-bold tracking-wider"
            style={{ color: "var(--accent, #6366f1)" }}
          >
            goal {fmtMin(goal)}
          </span>
        </div>

        {days.map((d, i) => {
          const isMet = d.minutes >= goal && goal > 0;
          const pct = Math.max(4, (d.minutes / max) * 100);
          return (
            <div key={d.key} className="group relative flex h-full flex-1 flex-col justify-end">
              {/* Tooltip on hover */}
              <div
                className="pointer-events-none absolute -top-2 left-1/2 z-20 -translate-x-1/2 -translate-y-full rounded-lg border border-[var(--border-subtle,#e4e0f1)] bg-[var(--surface-card,#fcfbff)] px-2 py-1 text-[11px] font-bold opacity-0 shadow-md transition-opacity duration-200 group-hover:opacity-100"
                style={{ color: "var(--text-main, #211a3a)" }}
              >
                <span className="mono">{fmtMin(d.minutes)}</span>
              </div>
              <div
                className={cn(
                  "w-full rounded-t-lg transition-all duration-700 ease-[cubic-bezier(.22,1,.36,1)]",
                  isMet
                    ? "shadow-[0_-4px_14px_-4px_var(--accent,#6366f1)]"
                    : "opacity-60 group-hover:opacity-100"
                )}
                style={{
                  height: on ? `${pct}%` : "4%",
                  background: isMet
                    ? "linear-gradient(to top, var(--accent, #6366f1), var(--accent2, #8b7cf6))"
                    : "var(--accent, #6366f1)",
                  transitionDelay: `${i * 50}ms`,
                }}
              />
            </div>
          );
        })}
      </div>
      <div className="mt-2.5 flex gap-2 sm:gap-3 border-t border-[var(--border-subtle,#e4e0f1)] pt-2">
        {days.map((d) => (
          <span
            key={d.key}
            className="mono flex-1 text-center text-[11px] font-bold"
            style={{ color: "var(--text-dim, #8f8aa6)" }}
          >
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
      <button
        type="button"
        onClick={onStart}
        className="btn btn-primary"
      >
        <IconSpark size={15} /> {label}
      </button>
    </Magnetic>
  );
}
