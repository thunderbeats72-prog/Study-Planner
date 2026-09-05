"use client";

import React, { useId } from "react";

/**
 * Study Orbit — the signature visual language of Study Planner.
 *
 * Subjects → topics → tasks → sessions are drawn as bodies in quiet orbit
 * around the learner: hairline orbital paths, a few weighted points and one
 * accent body. It is deliberately organic (tilted ellipses, uneven spacing,
 * slow drift) rather than a technical node graph.
 *
 * The motion is pure CSS (see editorial.css) and collapses to a still
 * composition under `prefers-reduced-motion`.
 */
export default function StudyOrbit({
  className = "",
  density = "full",
}: {
  className?: string;
  /** "full" shows all four orbits; "quiet" only the outer two (for headers). */
  density?: "full" | "quiet";
}) {
  return (
    <svg
      className={`orbit ${density === "quiet" ? "orbit--quiet" : ""} ${className}`.trim()}
      viewBox="0 0 480 480"
      fill="none"
      aria-hidden="true"
    >
      {/* core — the learner */}
      <circle cx="240" cy="240" r="5" className="orbit-core" />
      <circle cx="240" cy="240" r="14" className="orbit-halo" />

      <g className="orbit-spin orbit-spin--a">
        <ellipse cx="240" cy="240" rx="86" ry="70" transform="rotate(-14 240 240)" className="orbit-path" />
        <circle cx="322" cy="222" r="4.5" className="orbit-body orbit-body--accent" />
      </g>

      <g className="orbit-spin orbit-spin--b">
        <ellipse cx="240" cy="240" rx="140" ry="112" transform="rotate(9 240 240)" className="orbit-path" />
        <circle cx="112" cy="286" r="3.5" className="orbit-body" />
        <circle cx="356" cy="182" r="2.5" className="orbit-body orbit-body--dim" />
      </g>

      {density === "full" && (
        <g className="orbit-spin orbit-spin--c">
          <ellipse cx="240" cy="240" rx="196" ry="158" transform="rotate(-6 240 240)" className="orbit-path orbit-path--faint" />
          <circle cx="88" cy="152" r="3" className="orbit-body orbit-body--dim" />
          <circle cx="404" cy="318" r="4" className="orbit-body" />
        </g>
      )}

      {density === "full" && (
        <g className="orbit-spin orbit-spin--d">
          <ellipse cx="240" cy="240" rx="232" ry="196" transform="rotate(16 240 240)" className="orbit-path orbit-path--ghost" />
          <circle cx="240" cy="44" r="2.5" className="orbit-body orbit-body--dim" />
        </g>
      )}
    </svg>
  );
}

/**
 * A single subject's progress drawn as an orbit: one open path that closes
 * itself as mastery grows, with a small body parked at the current position.
 */
export function OrbitProgress({
  pct,
  color,
  size = 44,
}: {
  pct: number;
  color?: string;
  size?: number;
}) {
  const id = useId().replace(/[^a-zA-Z0-9_-]/g, "");
  const clamped = Math.max(0, Math.min(100, pct));
  const r = 20;
  const circ = 2 * Math.PI * r;
  const angle = (clamped / 100) * 2 * Math.PI - Math.PI / 2;
  const bx = 24 + r * Math.cos(angle);
  const by = 24 + r * Math.sin(angle);
  return (
    <svg
      className="orbit-progress"
      width={size}
      height={size}
      viewBox="0 0 48 48"
      fill="none"
      aria-hidden="true"
    >
      <circle cx="24" cy="24" r={r} className="orbit-progress-track" />
      <circle
        cx="24"
        cy="24"
        r={r}
        className="orbit-progress-fill"
        stroke={color || undefined}
        strokeDasharray={circ}
        strokeDashoffset={circ * (1 - clamped / 100)}
        strokeLinecap="round"
        transform="rotate(-90 24 24)"
        style={{ transition: "stroke-dashoffset .8s cubic-bezier(.22,1,.36,1)" }}
      />
      <circle cx={bx} cy={by} r="3" fill={color || "var(--accent)"} className="orbit-progress-body" id={`opb-${id}`} />
      <circle cx="24" cy="24" r="2.2" className="orbit-core" />
    </svg>
  );
}
