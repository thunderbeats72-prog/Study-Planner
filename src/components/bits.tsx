"use client";

import React, { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/cn";
import { KIND_META, type TaskRow as ClientTaskRow } from "@/lib/client";
import {
  IconBook,
  IconCalendar,
  IconCheck,
  IconChevron,
  IconClock,
  IconFlame,
  IconSpark,
  IconTarget,
  IconWarn,
} from "./icons";
import { Magnetic, MaskWords, Scramble, useInView } from "@/lib/fx";
import { useBackClose } from "@/lib/useBackClose";

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
  artLive = false,
  actions,
}: {
  eyebrow: string;
  title: string;
  sub: string;
  art?: React.ReactNode;
  /** Data-driven scenes keep a compact slot on phones instead of leaving the
   *  header; purely decorative scenes stay hidden below 860px as before. */
  artLive?: boolean;
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
        <div
          className={cn("page-header-scene", artLive && "scene-live")}
          aria-hidden="true"
        >
          {art}
        </div>
      ) : null}
    </header>
  );
}

/* ── ConfirmDialog — the one gate in front of a destructive action ────────
   `window.confirm()` was doing this job on the Subjects page: an OS chrome
   dialog that ignores every theme, cannot be styled, is suppressed in some
   embedded browsers, and gives no room to say what will actually be lost.
   This is the in-app equivalent, built from the same `.modal-overlay /
   .modal-box / .confirm-icon` contract the reset dialog already uses.
   Escape and the hardware Back button both cancel, focus lands on the safe
   answer, and the confirm verb is the one that has to be reached for. */
export function ConfirmDialog({
  title,
  message,
  detail,
  confirmLabel = "Delete",
  cancelLabel = "Keep it",
  onConfirm,
  onCancel,
  busy = false,
}: {
  title: string;
  message: React.ReactNode;
  detail?: React.ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  onConfirm: () => void;
  onCancel: () => void;
  busy?: boolean;
}) {
  const cancelRef = useRef<HTMLButtonElement | null>(null);
  useBackClose(true, onCancel);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.stopPropagation();
      onCancel();
    };
    window.addEventListener("keydown", onKey);
    cancelRef.current?.focus({ preventScroll: true });
    return () => window.removeEventListener("keydown", onKey);
  }, [onCancel]);

  return (
    <div className="modal-overlay" onClick={onCancel}>
      <div
        className="glass-panel modal-box confirm-box confirm-dialog"
        role="alertdialog"
        aria-modal="true"
        aria-label={title}
        onClick={(e) => e.stopPropagation()}
      >
        <span
          className="confirm-icon confirm-icon--danger"
          aria-hidden="true"
        >
          <IconWarn size={21} />
        </span>
        <h3 className="confirm-title">{title}</h3>
        <p className="confirm-msg">{message}</p>
        {detail ? <p className="confirm-detail">{detail}</p> : null}
        <div className="confirm-actions">
          <button
            ref={cancelRef}
            type="button"
            className="btn btn-secondary"
            onClick={onCancel}
            disabled={busy}
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            className="btn btn-danger"
            onClick={onConfirm}
            disabled={busy}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
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

/* ── Select — the one styled listbox every form uses ─────────────────
   Native <select> popups are the OS's, not ours: the blue-row Android
   spinner fought every theme and every font decision. This is a real
   listbox — button trigger, themed popover, arrow-key / Enter / Escape /
   Home / End support, outside-click dismiss — painted from the same
   semantic tokens as the rest of the chrome so it follows all themes. */
export type SelectOption = { value: string; label: string };

export function Select({
  value,
  onChange,
  options,
  ariaLabel,
  id,
  className,
}: {
  value: string;
  onChange: (value: string) => void;
  options: SelectOption[];
  ariaLabel: string;
  id?: string;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const listRef = useRef<HTMLDivElement | null>(null);
  const btnRef = useRef<HTMLButtonElement | null>(null);

  const selectedIndex = Math.max(0, options.findIndex((o) => o.value === value));
  const selected = options[selectedIndex];

  const close = (refocus: boolean) => {
    setOpen(false);
    if (refocus) btnRef.current?.focus();
  };

  useEffect(() => {
    if (!open) return;
    const onDown = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    window.addEventListener("mousedown", onDown);
    /* focus the list so arrows work immediately */
    const t = window.setTimeout(() => listRef.current?.focus(), 0);
    return () => {
      window.removeEventListener("mousedown", onDown);
      window.clearTimeout(t);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    listRef.current
      ?.querySelector<HTMLElement>(".sp-option.is-active")
      ?.scrollIntoView({ block: "nearest" });
  }, [active, open]);

  const pick = (v: string) => {
    onChange(v);
    close(true);
  };

  const onButtonKey = (event: React.KeyboardEvent) => {
    if (["ArrowDown", "ArrowUp"].includes(event.key)) {
      event.preventDefault();
      setActive(selectedIndex);
      setOpen(true);
    }
  };

  const onListKey = (event: React.KeyboardEvent) => {
    switch (event.key) {
      case "ArrowDown":
        event.preventDefault();
        setActive((a) => Math.min(a + 1, options.length - 1));
        break;
      case "ArrowUp":
        event.preventDefault();
        setActive((a) => Math.max(a - 1, 0));
        break;
      case "Home":
        event.preventDefault();
        setActive(0);
        break;
      case "End":
        event.preventDefault();
        setActive(options.length - 1);
        break;
      case "Enter":
      case " ":
        event.preventDefault();
        pick(options[active]?.value ?? value);
        break;
      case "Escape":
        event.preventDefault();
        close(true);
        break;
      case "Tab":
        setOpen(false);
        break;
    }
  };

  return (
    <div className={cn("sp-select", open && "is-open", className)} ref={rootRef}>
      <button
        ref={btnRef}
        type="button"
        id={id}
        className="sp-select-btn"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={ariaLabel}
        onClick={() => {
          if (!open) setActive(selectedIndex);
          setOpen((o) => !o);
        }}
        onKeyDown={onButtonKey}
      >
        <span className="sp-select-value">{selected?.label ?? "Select"}</span>
        <IconChevron size={14} className="sp-select-caret" />
      </button>
      {open && (
        <div
          className="sp-select-pop"
          role="listbox"
          tabIndex={-1}
          aria-label={ariaLabel}
          ref={listRef}
          onKeyDown={onListKey}
        >
          {options.map((option, i) => (
            <button
              type="button"
              key={`${option.value}-${i}`}
              role="option"
              aria-selected={option.value === value}
              className={cn(
                "sp-option",
                i === active && "is-active",
                option.value === value && "is-selected",
              )}
              onMouseEnter={() => setActive(i)}
              onClick={() => pick(option.value)}
            >
              <span className="sp-option-label">{option.label}</span>
              {option.value === value ? <IconCheck size={13} /> : null}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
