"use client";

import React, { useEffect, useRef, useState } from "react";

/* Shared studio atoms — CountUp digits, tinted icon tiles, and the
   tint map used across Analytics, Subjects and the new stat rows. */

/** Animated numeric readout. Animates from the previous value each time it
 *  changes; renders integers cleanly, keeps one decimal when needed. */
export function CountUp({
  to,
  suffix = "",
  decimals,
  duration = 900,
  className,
}: {
  to: number;
  suffix?: string;
  decimals?: number;
  duration?: number;
  className?: string;
}) {
  const [display, setDisplay] = useState(0);
  const prev = useRef(0);
  useEffect(() => {
    const from = prev.current;
    prev.current = to;
    const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    if (from === to || reduce) {
      const id = window.setTimeout(() => setDisplay(to), 0);
      return () => window.clearTimeout(id);
    }
    const t0 = performance.now();
    let raf = 0;
    const step = (now: number) => {
      const p = Math.min(1, (now - t0) / duration);
      const eased = 1 - Math.pow(1 - p, 3);
      setDisplay(from + (to - from) * eased);
      if (p < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [to, duration]);
  const places = decimals ?? (Number.isInteger(to) ? 0 : 1);
  return (
    <span className={className}>
      {display.toFixed(places)}
      {suffix}
    </span>
  );
}

export type Tone = "accent" | "mint" | "orange" | "rose" | "blue" | "violet" | "slate";

const TONE_BG: Record<Tone, string> = {
  accent: "var(--accent-glow)",
  mint: "color-mix(in srgb, var(--status-done-text) 14%, transparent)",
  orange: "color-mix(in srgb, #e59a24 15%, transparent)",
  rose: "color-mix(in srgb, #e05252 13%, transparent)",
  blue: "color-mix(in srgb, #38bdf8 14%, transparent)",
  violet: "color-mix(in srgb, #8b5cf6 14%, transparent)",
  slate: "var(--row-bg)",
};
const TONE_FG: Record<Tone, string> = {
  accent: "var(--accent)",
  mint: "var(--status-done-text)",
  orange: "#c07a10",
  rose: "var(--status-skipped-text)",
  blue: "#2f9ae0",
  violet: "#8b5cf6",
  slate: "var(--text-muted)",
};

/** Small tinted icon chip — the studio's recurring section/kind indicator. */
export function IconTile({
  tone = "accent",
  size = 34,
  radius = 11,
  children,
  className,
}: {
  tone?: Tone;
  size?: number;
  radius?: number;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <span
      className={className}
      aria-hidden="true"
      style={{
        display: "inline-grid",
        placeItems: "center",
        width: size,
        height: size,
        borderRadius: radius,
        flexShrink: 0,
        background: TONE_BG[tone],
        color: TONE_FG[tone],
      }}
    >
      {children}
    </span>
  );
}

/** minutes → "3.5h" / "45m" compact label. */
export function fmtHoursMin(minutes: number): string {
  if (minutes < 60) {
    const m = Math.round(minutes * 10) / 10;
    return `${Number.isInteger(m) ? m : m.toFixed(1)}m`;
  }
  const h = Math.round((minutes / 60) * 10) / 10;
  return `${Number.isInteger(h) ? h : h.toFixed(1)}h`;
}
