"use client";

import React, { useEffect, useState } from "react";
import { useNow } from "@/lib/fx";

/* All scenes are pure inline SVG tinted by theme CSS variables (--ill-* and --accent)
   so they re-skin instantly with the active theme. Clock & calendar read real time. */

const Sparkle = ({
  x,
  y,
  s = 1,
  d = 0,
}: {
  x: number;
  y: number;
  s?: number;
  d?: number;
}) => (
  <g transform={`translate(${x} ${y}) scale(${s})`}>
    <path
      d="M0 -9 L2.2 -2.2 L9 0 L2.2 2.2 L0 9 L-2.2 2.2 L-9 0 L-2.2 -2.2 Z"
      fill="var(--ill-glow, var(--accent2))"
      className="anim-twinkle"
      style={{
        animationDelay: `${d}s`,
        transformOrigin: "center",
        transformBox: "fill-box",
      }}
    />
  </g>
);

const Plant = ({ x, y, s = 1 }: { x: number; y: number; s?: number }) => (
  <g transform={`translate(${x} ${y}) scale(${s})`}>
    <g
      className="anim-sway"
      style={{ transformOrigin: "50% 100%", transformBox: "fill-box" }}
    >
      <path
        d="M0 0 C -4 -30 -22 -40 -28 -62 C -8 -52 -2 -30 0 0 Z"
        fill="var(--ill-leaf)"
      />
      <path
        d="M0 0 C 4 -34 22 -44 30 -66 C 10 -54 2 -32 0 0 Z"
        fill="var(--ill-leaf2)"
      />
      <path
        d="M0 0 C -1 -38 -10 -52 -8 -76 C 4 -58 3 -34 0 0 Z"
        fill="var(--ill-leaf)"
        opacity="0.85"
      />
      <path
        d="M0 0 C 1 -24 12 -30 18 -44 C 6 -36 1 -20 0 0 Z"
        fill="var(--ill-leaf2)"
        opacity="0.8"
      />
    </g>
    <path d="M-22 0 h44 l-6 34 h-32 Z" fill="var(--ill-pot)" />
    <rect x="-26" y="-7" width="52" height="10" rx="4" fill="var(--ill-pot2)" />
  </g>
);

const Books = ({ x, y, s = 1 }: { x: number; y: number; s?: number }) => (
  <g transform={`translate(${x} ${y}) scale(${s})`}>
    <rect x="-58" y="-16" width="116" height="16" rx="4" fill="var(--ill-bc)" />
    <rect
      x="50"
      y="-13"
      width="6"
      height="10"
      rx="2"
      fill="var(--ill-paper)"
      opacity="0.75"
    />
    <rect x="-50" y="-31" width="104" height="15" rx="4" fill="var(--ill-bb)" />
    <rect
      x="46"
      y="-28"
      width="6"
      height="9"
      rx="2"
      fill="var(--ill-paper)"
      opacity="0.75"
    />
    <g transform="rotate(-2 0 -40)">
      <rect
        x="-54"
        y="-46"
        width="108"
        height="15"
        rx="4"
        fill="var(--ill-ba)"
      />
      <rect
        x="46"
        y="-43"
        width="6"
        height="9"
        rx="2"
        fill="var(--ill-paper)"
        opacity="0.75"
      />
    </g>
  </g>
);

const Desk = () => (
  <>
    <rect
      x="36"
      y="286"
      width="488"
      height="10"
      rx="5"
      fill="var(--ill-desk)"
    />
    <rect
      x="36"
      y="296"
      width="488"
      height="4"
      rx="2"
      fill="var(--ill-desk)"
      opacity="0.55"
    />
  </>
);

/* ---------- desk lamp scene (dashboard / overview) ---------- */
export function LampScene({
  ambient = 75,
  className,
}: {
  ambient?: number;
  className?: string;
}) {
  const g = 0.2 + (ambient / 100) * 0.8;
  return (
    <svg
      viewBox="0 0 560 340"
      className={className}
      role="img"
      aria-label="Study desk with lamp, books and plant"
    >
      <defs>
        <linearGradient id="lampGlow" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="var(--ill-glow)" stopOpacity="0.6" />
          <stop offset="100%" stopColor="var(--ill-glow)" stopOpacity="0.02" />
        </linearGradient>
        <radialGradient id="lampHalo" cx="50%" cy="50%" r="50%">
          <stop
            offset="0%"
            stopColor="var(--ill-halo, rgba(122, 104, 240, 0.18))"
          />
          <stop
            offset="100%"
            stopColor="var(--ill-halo, rgba(122, 104, 240, 0.18))"
            stopOpacity="0"
          />
        </radialGradient>
      </defs>
      <ellipse cx="330" cy="180" rx="230" ry="140" fill="url(#lampHalo)" />
      <Sparkle x={128} y={84} s={0.9} d={0.4} />
      <Sparkle x={210} y={52} s={0.6} d={1.6} />
      <Sparkle x={86} y={150} s={0.5} d={2.4} />
      <Desk />
      {/* glow cone */}
      <g opacity={g}>
        <polygon
          points="378,136 262,288 468,288"
          fill="url(#lampGlow)"
          className="anim-glow"
        />
      </g>
      <ellipse
        cx="362"
        cy="289"
        rx="108"
        ry="9"
        fill="var(--ill-glow)"
        opacity={0.16 * g + 0.05}
      />
      <Plant x={128} y={252} s={1.05} />
      <Books x={362} y={286} s={1} />
      {/* lamp */}
      <ellipse cx="462" cy="284" rx="34" ry="8" fill="var(--ill-metal2)" />
      <path
        d="M462 282 C 466 240 468 210 472 176"
        stroke="var(--ill-metal)"
        strokeWidth="8"
        strokeLinecap="round"
        fill="none"
      />
      <circle cx="472" cy="176" r="7" fill="var(--ill-metal2)" />
      <path
        d="M472 176 C 450 150 424 126 402 110"
        stroke="var(--ill-metal)"
        strokeWidth="8"
        strokeLinecap="round"
        fill="none"
      />
      <circle cx="402" cy="110" r="6" fill="var(--ill-metal2)" />
      <g transform="translate(402 110) rotate(40)">
        <rect
          x="-9"
          y="-14"
          width="18"
          height="14"
          rx="5"
          fill="var(--ill-metal2)"
        />
        <path d="M-15 0 L15 0 L26 36 L-26 36 Z" fill="var(--ill-shade)" />
        <path d="M-26 36 L26 36 L22 41 L-22 41 Z" fill="var(--ill-metal2)" />
        <g opacity={Math.min(1, g + 0.15)}>
          <circle
            cx="0"
            cy="34"
            r="8"
            fill="var(--ill-glow)"
            className="anim-glow"
          />
        </g>
      </g>
    </svg>
  );
}

/* ---------- desk calendar scene (planner) — shows the REAL month & date ---------- */
export function CalendarScene({ className }: { className?: string }) {
  const d = new Date();
  const month = d.toLocaleDateString("en-US", { month: "long" }).toUpperCase();
  const year = d.getFullYear();
  const date = d.getDate();
  const offset = new Date(year, d.getMonth(), 1).getDay();
  const daysIn = new Date(year, d.getMonth() + 1, 0).getDate();
  const cells = Array.from({ length: 28 }, (_, i) => i - offset + 1);
  return (
    <svg
      viewBox="0 0 560 340"
      className={className}
      role="img"
      aria-label={`Desk calendar open at ${month} ${year}`}
    >
      <defs>
        <radialGradient id="calHalo" cx="50%" cy="50%" r="50%">
          <stop
            offset="0%"
            stopColor="var(--ill-halo, rgba(122, 104, 240, 0.18))"
          />
          <stop
            offset="100%"
            stopColor="var(--ill-halo, rgba(122, 104, 240, 0.18))"
            stopOpacity="0"
          />
        </radialGradient>
      </defs>
      <ellipse cx="280" cy="170" rx="240" ry="140" fill="url(#calHalo)" />
      <Sparkle x={120} y={70} s={0.8} d={0.2} />
      <Sparkle x={452} y={92} s={0.6} d={1.4} />
      <Desk />
      <g transform="rotate(-2 280 190)">
        <rect
          x="150"
          y="96"
          width="262"
          height="182"
          rx="16"
          fill="var(--ill-metal2)"
        />
        <rect
          x="160"
          y="80"
          width="242"
          height="186"
          rx="13"
          fill="var(--ill-paper)"
        />
        <path
          d="M160 93 a13 13 0 0 1 13 -13 h216 a13 13 0 0 1 13 13 v33 h-242 z"
          fill="var(--accent)"
        />
        <text
          x="178"
          y="112"
          fill="var(--accent-ink)"
          fontSize="14"
          fontWeight="700"
          letterSpacing="1.2"
          style={{ fontVariantNumeric: "tabular-nums" }}
        >
          {month} {year}
        </text>
        {[0, 1, 2, 3].map((i) => (
          <rect
            key={i}
            x={192 + i * 58}
            y={66}
            width="9"
            height="28"
            rx="4.5"
            fill="var(--ill-metal)"
          />
        ))}
        {cells.map((n, i) => {
          const col = i % 7;
          const row = Math.floor(i / 7);
          const cx = 182 + col * 33;
          const cy = 148 + row * 29;
          const valid = n >= 1 && n <= daysIn;
          if (n === date)
            return (
              <g key={i}>
                <rect
                  x={cx - 11}
                  y={cy - 11}
                  width="24"
                  height="24"
                  rx="8"
                  fill="var(--accent)"
                />
                <text
                  x={cx + 1}
                  y={cy + 5}
                  textAnchor="middle"
                  fill="var(--accent-ink)"
                  fontSize="11"
                  fontWeight="700"
                  style={{ fontVariantNumeric: "tabular-nums" }}
                >
                  {n}
                </text>
              </g>
            );
          if (valid && n < date && (n % 4 === 0 || n % 5 === 0))
            return (
              <path
                key={i}
                d={`M${cx - 5} ${cy} l4 4 l7 -8`}
                stroke="var(--good)"
                strokeWidth="2.4"
                fill="none"
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeDasharray="20"
                strokeDashoffset="20"
                style={{
                  animation:
                    "drawStroke .8s cubic-bezier(.22,1,.36,1) forwards",
                  animationDelay: `${0.4 + i * 0.03}s`,
                }}
              />
            );
          return (
            <circle
              key={i}
              cx={cx + 1}
              cy={cy}
              r="2.4"
              fill="var(--ill-ink)"
              opacity={valid ? 0.42 : 0.12}
            />
          );
        })}
      </g>
      <Plant x={98} y={252} s={0.95} />
      <Books x={452} y={286} s={0.82} />
    </svg>
  );
}

/* ---------- wall clock scene (focus) — hands show REAL time via CSS sweep ---------- */
export function ClockScene({ className }: { className?: string }) {
  const d = new Date();
  const ms = d.getMilliseconds() / 1000;
  const sec = d.getSeconds() + ms;
  const min = d.getMinutes() + sec / 60;
  const hr = (d.getHours() % 12) + min / 60;
  /* Each hand carries BOTH a static rotate() of the real time (so the
     scene is truthful even with animations off / reduced motion) and the
     `sweep` animation whose negative delay starts exactly there — the
     hands then advance live, one continuous turn per period. */
  const sweep = (dur: number, deg: number) =>
    ({
      transformOrigin: "280px 158px",
      transform: `rotate(${deg}deg)`,
      animation: `sweep ${dur}s linear infinite`,
      animationDelay: `-${(deg / 360) * dur}s`,
    }) as React.CSSProperties;
  return (
    <svg
      viewBox="0 0 560 340"
      className={className}
      role="img"
      aria-label="Wall clock showing the current time"
    >
      <defs>
        <radialGradient id="clkHalo" cx="50%" cy="50%" r="50%">
          <stop
            offset="0%"
            stopColor="var(--ill-halo, rgba(122, 104, 240, 0.18))"
          />
          <stop
            offset="100%"
            stopColor="var(--ill-halo, rgba(122, 104, 240, 0.18))"
            stopOpacity="0"
          />
        </radialGradient>
      </defs>
      <ellipse cx="280" cy="165" rx="230" ry="140" fill="url(#clkHalo)" />
      <Sparkle x={150} y={70} s={0.9} d={0.6} />
      <Sparkle x={120} y={130} s={0.55} d={1.9} />
      <Sparkle x={430} y={64} s={0.6} d={2.6} />
      <Desk />
      <g className="anim-float">
        <circle cx="280" cy="158" r="94" fill="var(--ill-metal)" />
        <circle cx="280" cy="158" r="83" fill="var(--ill-paper)" />
        <circle
          cx="280"
          cy="158"
          r="83"
          fill="none"
          stroke="var(--ill-metal2)"
          strokeWidth="1.5"
          opacity="0.6"
        />
        {Array.from({ length: 12 }, (_, i) => {
          const a = (i * 30 * Math.PI) / 180;
          const q = i % 3 === 0;
          const r1 = q ? 66 : 70;
          const r2 = 76;
          return (
            <line
              key={i}
              x1={280 + Math.sin(a) * r1}
              y1={158 - Math.cos(a) * r1}
              x2={280 + Math.sin(a) * r2}
              y2={158 - Math.cos(a) * r2}
              stroke="var(--ill-ink)"
              strokeWidth={q ? 3.4 : 2}
              strokeLinecap="round"
              opacity={q ? 0.85 : 0.5}
            />
          );
        })}
        <g style={sweep(43200, (hr / 12) * 360)}>
          <rect
            x="276.6"
            y="106"
            width="6.8"
            height="60"
            rx="3.4"
            fill="var(--text-main)"
            opacity="0.9"
          />
        </g>
        <g style={sweep(3600, (min / 60) * 360)}>
          <rect
            x="277.8"
            y="86"
            width="4.6"
            height="80"
            rx="2.3"
            fill="var(--text-main)"
            opacity="0.75"
          />
        </g>
        <g style={sweep(60, (sec / 60) * 360)}>
          <rect
            x="279"
            y="80"
            width="2"
            height="98"
            rx="1"
            fill="var(--accent)"
          />
        </g>
        <circle cx="280" cy="158" r="7" fill="var(--accent)" />
        <circle cx="280" cy="158" r="2.6" fill="var(--ill-paper)" />
        <path
          d="M222 104 A 78 78 0 0 1 316 88"
          stroke="#ffffff"
          strokeOpacity="0.16"
          strokeWidth="10"
          strokeLinecap="round"
          fill="none"
        />
      </g>
      <Plant x={440} y={252} s={1.05} />
    </svg>
  );
}

/* ══════════════════════════════════════════════════════════════════════
   LIVE DATA SCENES — subjects · analytics · settings

   The three scenes below extend the same system as the lamp / calendar /
   clock above: one 560×340 canvas, the shared desk, plant, book stack and
   sparkle helpers, and colours read straight from the `--ill-*` / `--accent`
   tokens so every theme re-skins them for free.

   They differ in one way: they are driven by REAL state, not by decoration.
   Each takes the numbers its page already computes (subject mastery, the
   last seven days of logged minutes, the configured pomodoro and toggles)
   and paints them, so the header visual is a second read-out of the page
   rather than a picture next to it. Motion is deliberately cheap — one
   mount flip plus CSS transitions/keyframes on transform, opacity and
   stroke-dashoffset (compositor-friendly, no per-frame React work), and
   every loop is switched off by the reduced-motion guard in ui-system.css.
   ══════════════════════════════════════════════════════════════════════ */

/** Bars, arcs and rings start at zero and settle on the real value one frame
 *  after mount, so the scene animates in instead of popping. Data changes
 *  afterwards ride the same CSS transition. */
function useSettled(delay = 90) {
  const [on, setOn] = useState(false);
  useEffect(() => {
    const id = window.setTimeout(() => setOn(true), delay);
    return () => window.clearTimeout(id);
  }, [delay]);
  return on;
}

const clampPct = (n: number) => Math.max(0, Math.min(100, Math.round(n || 0)));
const dashFor = (r: number, pct: number, on: boolean) => {
  const c = 2 * Math.PI * r;
  return { c, offset: on ? c * (1 - Math.max(0, Math.min(100, pct)) / 100) : c };
};

/* ---------- curriculum board (subjects) — reads real subject progress ---------- */
export type CurriculumRow = {
  id: number;
  name: string;
  color: string;
  pct: number;
};

export function CurriculumScene({
  subjects = [],
  progress = 0,
  done = 0,
  total = 0,
  className,
}: {
  subjects?: CurriculumRow[];
  progress?: number;
  done?: number;
  total?: number;
  className?: string;
}) {
  const on = useSettled();
  const rows = subjects.slice(0, 4);
  const pct = clampPct(progress);
  const ring = dashFor(34, pct, on);
  const checks =
    total > 0 ? Math.max(0, Math.min(5, Math.round((done / total) * 5))) : 0;
  const shortName = (n: string) => (n.length > 15 ? `${n.slice(0, 14)}…` : n);

  return (
    <svg
      viewBox="0 0 560 340"
      className={className}
      role="img"
      aria-label={`Curriculum board: ${pct}% mastered, ${done} of ${total} lessons done across ${subjects.length} subjects`}
    >
      <defs>
        <radialGradient id="curHalo" cx="50%" cy="50%" r="50%">
          <stop
            offset="0%"
            stopColor="var(--ill-halo, rgba(122, 104, 240, 0.18))"
          />
          <stop
            offset="100%"
            stopColor="var(--ill-halo, rgba(122, 104, 240, 0.18))"
            stopOpacity="0"
          />
        </radialGradient>
        <linearGradient id="curScan" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="var(--accent)" stopOpacity="0" />
          <stop offset="50%" stopColor="var(--accent)" stopOpacity=".14" />
          <stop offset="100%" stopColor="var(--accent)" stopOpacity="0" />
        </linearGradient>
        <clipPath id="curClip">
          <rect x="142" y="66" width="286" height="206" rx="13" />
        </clipPath>
      </defs>

      <ellipse cx="280" cy="170" rx="238" ry="140" fill="url(#curHalo)" />
      <Sparkle x={104} y={76} s={0.85} d={0.3} />
      <Sparkle x={470} y={96} s={0.6} d={1.5} />
      <Sparkle x={82} y={152} s={0.5} d={2.3} />
      <Desk />

      {/* board */}
      <g className="anim-float">
        <ellipse
          cx="285"
          cy="283"
          rx="146"
          ry="9"
          fill="var(--ill-ink)"
          opacity="0.14"
        />
        <rect
          x="150"
          y="78"
          width="272"
          height="196"
          rx="16"
          fill="var(--ill-metal2)"
        />
        <rect
          x="142"
          y="66"
          width="286"
          height="206"
          rx="13"
          fill="var(--ill-paper)"
        />
        {[0, 1].map((i) => (
          <rect
            key={i}
            x={206 + i * 140}
            y="54"
            width="9"
            height="24"
            rx="4.5"
            fill="var(--ill-metal)"
          />
        ))}
        <path
          d="M142 79 a13 13 0 0 1 13 -13 h260 a13 13 0 0 1 13 13 v17 h-286 z"
          fill="var(--accent)"
        />
        <text
          x="160"
          y="89"
          fill="var(--accent-ink)"
          fontSize="11"
          fontWeight="700"
          letterSpacing="1.3"
        >
          CURRICULUM
        </text>
        <text
          x="412"
          y="89"
          textAnchor="end"
          fill="var(--accent-ink)"
          fontSize="10"
          fontWeight="700"
          opacity="0.9"
          style={{ fontVariantNumeric: "tabular-nums" }}
        >
          {subjects.length} SUBJECTS
        </text>

        {/* one row per subject: colour, name, live progress bar, percent */}
        {rows.map((s, i) => {
          const top = 112 + i * 31;
          const w = 112 * (clampPct(s.pct) / 100) * (on ? 1 : 0);
          return (
            <g key={s.id}>
              <circle cx="162" cy={top + 18} r="5" fill={s.color} />
              <text
                x="174"
                y={top + 9}
                fill="var(--ill-ink)"
                fontSize="9"
                fontWeight="650"
                opacity="0.72"
              >
                {shortName(s.name)}
              </text>
              <rect
                x="174"
                y={top + 14}
                width="112"
                height="9"
                rx="4.5"
                fill="var(--ill-ink)"
                opacity="0.13"
              />
              <rect
                className="cur-bar"
                x="174"
                y={top + 14}
                width={Math.max(w, w > 0 ? 9 : 0)}
                height="9"
                rx="4.5"
                fill={s.color}
                style={{ transitionDelay: `${i * 90}ms` }}
              />
              <rect
                x="174"
                y={top + 15}
                width={Math.max(w, w > 0 ? 9 : 0)}
                height="3"
                rx="1.5"
                fill="#ffffff"
                opacity="0.22"
                className="cur-bar"
                style={{ transitionDelay: `${i * 90}ms` }}
              />
              <text
                x="292"
                y={top + 22}
                fill="var(--ill-ink)"
                fontSize="10"
                fontWeight="800"
                opacity="0.8"
                style={{ fontVariantNumeric: "tabular-nums" }}
              >
                {clampPct(s.pct)}%
              </text>
            </g>
          );
        })}
        {rows.length === 0 && (
          <text
            x="174"
            y="140"
            fill="var(--ill-ink)"
            fontSize="10"
            fontWeight="650"
            opacity="0.6"
          >
            Add a subject to map the syllabus
          </text>
        )}

        {/* mastery dial — the same number the page headline shows */}
        <g>
          <circle
            className="cur-spin"
            cx="372"
            cy="160"
            r="44"
            fill="none"
            stroke="var(--accent)"
            strokeOpacity="0.28"
            strokeWidth="1.5"
            strokeDasharray="3 8"
            strokeLinecap="round"
            style={{ transformOrigin: "372px 160px" }}
          />
          <circle
            cx="372"
            cy="160"
            r="34"
            fill="none"
            stroke="var(--ill-ink)"
            strokeOpacity="0.16"
            strokeWidth="9"
          />
          <circle
            className="cur-arc"
            cx="372"
            cy="160"
            r="34"
            fill="none"
            stroke="var(--accent)"
            strokeWidth="9"
            strokeLinecap="round"
            strokeDasharray={ring.c}
            strokeDashoffset={ring.offset}
            transform="rotate(-90 372 160)"
          />
          <text
            x="372"
            y="166"
            textAnchor="middle"
            fill="var(--text-main)"
            fontSize="17"
            fontWeight="800"
            style={{ fontVariantNumeric: "tabular-nums" }}
          >
            {pct}%
          </text>
          <text
            x="372"
            y="214"
            textAnchor="middle"
            fill="var(--ill-ink)"
            fontSize="8.5"
            fontWeight="700"
            letterSpacing="1.1"
            opacity="0.62"
          >
            MASTERY
          </text>
        </g>

        {/* mastered-lesson ticks, drawn in as the count grows */}
        <g>
          <text
            x="174"
            y="244"
            fill="var(--ill-ink)"
            fontSize="8"
            fontWeight="700"
            letterSpacing="1"
            opacity="0.55"
          >
            LESSONS MASTERED
          </text>
          {[0, 1, 2, 3, 4].map((i) => {
            const x = 178 + i * 24;
            const lit = i < checks;
            return lit ? (
              <path
                key={i}
                d={`M${x - 6} 258 l5 5 l9 -11`}
                stroke="var(--good)"
                strokeWidth="2.8"
                fill="none"
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeDasharray="22"
                strokeDashoffset="22"
                style={{
                  animation: "drawStroke .7s cubic-bezier(.22,1,.36,1) forwards",
                  animationDelay: `${0.5 + i * 0.12}s`,
                }}
              />
            ) : (
              <circle
                key={i}
                cx={x}
                cy={257}
                r="4.6"
                fill="none"
                stroke="var(--ill-ink)"
                strokeOpacity="0.28"
                strokeWidth="2"
              />
            );
          })}
          <text
            x="292"
            y="262"
            fill="var(--ill-ink)"
            fontSize="10"
            fontWeight="800"
            opacity="0.72"
            style={{ fontVariantNumeric: "tabular-nums" }}
          >
            {done}/{total || 0}
          </text>
        </g>

        {/* slow scan down the board — the only looping motion here */}
        <g clipPath="url(#curClip)">
          <rect
            className="cur-scan"
            x="142"
            y="100"
            width="286"
            height="36"
            fill="url(#curScan)"
          />
        </g>
      </g>

      <Plant x={92} y={252} s={0.95} />
      <Books x={486} y={286} s={0.78} />
    </svg>
  );
}

/* ---------- insights monitor (analytics) — the real last 7 days ---------- */
export function InsightsScene({
  week = [],
  goal = 120,
  consistency = 0,
  streak = 0,
  totalHours = 0,
  className,
}: {
  /** Last 7 days of logged minutes, oldest → today. */
  week?: number[];
  /** Daily goal in minutes — drawn as the dashed target line. */
  goal?: number;
  consistency?: number;
  streak?: number;
  totalHours?: number;
  className?: string;
}) {
  const on = useSettled();
  /* The header clock is the only ticking element; 30s is plenty for a
     minute-resolution read-out and costs one render every half minute. */
  const now = useNow(30_000);
  const days = week.slice(-7);
  while (days.length < 7) days.unshift(0);
  const max = Math.max(goal || 0, ...days, 30);
  const top = 104;
  const base = 214;
  const span = base - top;
  const h = (m: number) => Math.max(m > 0 ? 6 : 2, (m / max) * span);
  const cx = (i: number) => 142 + i * 32 + 11;
  const goalY = base - Math.min(span, ((goal || 0) / max) * span);
  const ring = dashFor(20, clampPct(consistency), on);
  const trend = days
    .map((m, i) => `${i === 0 ? "M" : "L"}${cx(i)} ${base - (on ? h(m) : 2)}`)
    .join(" ");
  const clock = `${String(now.getHours()).padStart(2, "0")}:${String(
    now.getMinutes(),
  ).padStart(2, "0")}`;

  return (
    <svg
      viewBox="0 0 560 340"
      className={className}
      role="img"
      aria-label={`Insights monitor: last 7 days of study time, ${clampPct(
        consistency,
      )}% consistency, ${streak} day streak`}
    >
      <defs>
        <radialGradient id="insHalo" cx="50%" cy="50%" r="50%">
          <stop
            offset="0%"
            stopColor="var(--ill-halo, rgba(122, 104, 240, 0.18))"
          />
          <stop
            offset="100%"
            stopColor="var(--ill-halo, rgba(122, 104, 240, 0.18))"
            stopOpacity="0"
          />
        </radialGradient>
        <linearGradient id="insScan" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="var(--accent)" stopOpacity="0" />
          <stop offset="50%" stopColor="var(--accent)" stopOpacity=".13" />
          <stop offset="100%" stopColor="var(--accent)" stopOpacity="0" />
        </linearGradient>
        <clipPath id="insClip">
          <rect x="128" y="64" width="304" height="174" rx="11" />
        </clipPath>
      </defs>

      <ellipse cx="280" cy="168" rx="240" ry="140" fill="url(#insHalo)" />
      <Sparkle x={96} y={72} s={0.8} d={0.5} />
      <Sparkle x={478} y={88} s={0.6} d={1.7} />
      <Desk />

      <g className="anim-float">
        <ellipse
          cx="280"
          cy="285"
          rx="150"
          ry="9"
          fill="var(--ill-ink)"
          opacity="0.14"
        />
        <path
          d="M256 252 h48 l12 26 h-72 z"
          fill="var(--ill-metal2)"
        />
        <rect
          x="228"
          y="276"
          width="104"
          height="10"
          rx="5"
          fill="var(--ill-metal)"
        />
        <rect
          x="118"
          y="54"
          width="324"
          height="200"
          rx="18"
          fill="var(--ill-metal2)"
        />
        <rect
          x="128"
          y="64"
          width="304"
          height="174"
          rx="11"
          fill="var(--ill-paper)"
        />

        {/* screen chrome: live dot + title + real clock */}
        <circle
          cx="144"
          cy="78"
          r="3.6"
          fill="var(--good)"
          className="anim-glow"
        />
        <text
          x="156"
          y="82"
          fill="var(--ill-ink)"
          fontSize="9.5"
          fontWeight="700"
          letterSpacing="1.2"
          opacity="0.75"
        >
          LIVE INSIGHTS
        </text>
        <text
          x="418"
          y="82"
          textAnchor="end"
          fill="var(--ill-ink)"
          fontSize="10"
          fontWeight="700"
          opacity="0.7"
          style={{ fontVariantNumeric: "tabular-nums" }}
        >
          {clock}
        </text>

        {/* goal line */}
        <line
          x1="138"
          y1={goalY}
          x2="362"
          y2={goalY}
          stroke="var(--ill-ink)"
          strokeOpacity="0.38"
          strokeWidth="1.6"
          strokeDasharray="4 5"
          strokeLinecap="round"
        />
        <text
          x="362"
          y={goalY - 5}
          textAnchor="end"
          fill="var(--ill-ink)"
          fontSize="7.5"
          fontWeight="700"
          letterSpacing="0.8"
          opacity="0.6"
        >
          GOAL {Math.round(goal || 0)}M
        </text>

        {/* the real week, one bar per day; today carries the pulse */}
        {days.map((m, i) => {
          const isToday = i === days.length - 1;
          const barH = on ? h(m) : 2;
          const met = m >= (goal || 0) && (goal || 0) > 0;
          const fill = isToday
            ? "var(--accent)"
            : met
              ? "var(--good)"
              : "var(--ill-metal2)";
          return (
            <g key={i}>
              <rect
                x={142 + i * 32}
                y={base - 110}
                width="22"
                height="110"
                rx="5"
                fill="var(--ill-ink)"
                opacity="0.07"
              />
              <rect
                className="ins-bar"
                x={142 + i * 32}
                y={base - barH}
                width="22"
                height={barH}
                rx="5"
                fill={fill}
                opacity={isToday ? 0.95 : 0.78}
                style={{
                  transform: `scaleY(${on ? 1 : 0.02})`,
                  transitionDelay: `${i * 60}ms`,
                }}
              />
              <circle
                cx={cx(i)}
                cy="224"
                r={isToday ? 3 : 2.1}
                fill={isToday ? "var(--accent)" : "var(--ill-ink)"}
                opacity={isToday ? 0.9 : 0.32}
              />
            </g>
          );
        })}

        {/* trend line drawn over the bar tops */}
        <path
          className="ins-trend"
          d={trend}
          pathLength={1}
          fill="none"
          stroke="var(--ill-glow)"
          strokeWidth="2.4"
          strokeLinecap="round"
          strokeLinejoin="round"
          opacity="0.9"
        />
        <circle
          className="ins-ping"
          cx={cx(days.length - 1)}
          cy={base - (on ? h(days[days.length - 1]) : 2)}
          r="4"
          fill="none"
          stroke="var(--accent)"
          strokeWidth="2"
        />
        <circle
          cx={cx(days.length - 1)}
          cy={base - (on ? h(days[days.length - 1]) : 2)}
          r="3.4"
          fill="var(--accent)"
        />

        {/* consistency dial + the two headline numbers */}
        <g>
          <circle
            cx="396"
            cy="130"
            r="20"
            fill="none"
            stroke="var(--ill-ink)"
            strokeOpacity="0.16"
            strokeWidth="6"
          />
          <circle
            className="ins-arc"
            cx="396"
            cy="130"
            r="20"
            fill="none"
            stroke={clampPct(consistency) >= 70 ? "var(--good)" : "var(--accent)"}
            strokeWidth="6"
            strokeLinecap="round"
            strokeDasharray={ring.c}
            strokeDashoffset={ring.offset}
            transform="rotate(-90 396 130)"
          />
          <text
            x="396"
            y="134"
            textAnchor="middle"
            fill="var(--text-main)"
            fontSize="11"
            fontWeight="800"
            style={{ fontVariantNumeric: "tabular-nums" }}
          >
            {clampPct(consistency)}%
          </text>
          <text
            x="396"
            y="164"
            textAnchor="middle"
            fill="var(--ill-ink)"
            fontSize="7"
            fontWeight="700"
            letterSpacing="0.7"
            opacity="0.6"
          >
            CONSISTENCY
          </text>
          <text
            x="396"
            y="186"
            textAnchor="middle"
            fill="var(--text-main)"
            fontSize="11"
            fontWeight="800"
            style={{ fontVariantNumeric: "tabular-nums" }}
          >
            {Math.round(totalHours || 0)}h
          </text>
          <text
            x="396"
            y="198"
            textAnchor="middle"
            fill="var(--ill-ink)"
            fontSize="7.5"
            fontWeight="700"
            letterSpacing="0.9"
            opacity="0.6"
          >
            LOGGED
          </text>
          <text
            x="396"
            y="216"
            textAnchor="middle"
            fill="var(--text-main)"
            fontSize="10"
            fontWeight="800"
            style={{ fontVariantNumeric: "tabular-nums" }}
          >
            {streak}D
          </text>
          <text
            x="396"
            y="228"
            textAnchor="middle"
            fill="var(--ill-ink)"
            fontSize="7.5"
            fontWeight="700"
            letterSpacing="0.9"
            opacity="0.6"
          >
            STREAK
          </text>
        </g>

        <g clipPath="url(#insClip)">
          <rect
            className="ins-scan"
            x="128"
            y="64"
            width="46"
            height="174"
            fill="url(#insScan)"
          />
        </g>
      </g>

      <Plant x={84} y={252} s={0.85} />
      <Books x={496} y={286} s={0.72} />
    </svg>
  );
}

/* ---------- studio console (settings) — mirrors the live app state ---------- */
const THEME_DOTS = [
  { id: "default", c: "#6C5CE7" },
  { id: "silver-lavender", c: "#6f63d8" },
  { id: "mint", c: "#0FA37F" },
  { id: "sunset", c: "#E1620F" },
  { id: "dark", c: "#8A8AF4" },
  { id: "obsidian", c: "#38BDF8" },
  { id: "nebula", c: "#A855F7" },
];

function Gear({
  cx,
  cy,
  r,
  teeth = 8,
  reverse = false,
}: {
  cx: number;
  cy: number;
  r: number;
  teeth?: number;
  reverse?: boolean;
}) {
  return (
    <g
      className={reverse ? "studio-gear studio-gear--rev" : "studio-gear"}
      style={{ transformOrigin: `${cx}px ${cy}px` }}
    >
      {Array.from({ length: teeth }, (_, i) => (
        <rect
          key={i}
          x={cx - r * 0.16}
          y={cy - r - r * 0.22}
          width={r * 0.32}
          height={r * 0.34}
          rx={r * 0.1}
          fill="var(--ill-metal)"
          transform={`rotate(${(i * 360) / teeth} ${cx} ${cy})`}
        />
      ))}
      <circle cx={cx} cy={cy} r={r} fill="var(--ill-metal2)" />
      <circle cx={cx} cy={cy} r={r * 0.62} fill="var(--ill-paper)" />
      <circle
        cx={cx}
        cy={cy}
        r={r * 0.24}
        fill="var(--accent)"
        opacity="0.85"
      />
      {[0, 1, 2, 3].map((i) => (
        <rect
          key={i}
          x={cx - r * 0.09}
          y={cy - r * 0.52}
          width={r * 0.18}
          height={r * 0.3}
          rx={r * 0.09}
          fill="var(--ill-metal)"
          opacity="0.55"
          transform={`rotate(${i * 90 + 45} ${cx} ${cy})`}
        />
      ))}
    </g>
  );
}

function ConsoleToggle({
  y,
  label,
  on: enabled,
}: {
  y: number;
  label: string;
  on: boolean;
}) {
  return (
  <g>
    <text
      x="296"
      y={y + 6}
      fill="var(--ill-ink)"
      fontSize="9"
      fontWeight="700"
      letterSpacing="0.9"
      opacity="0.72"
    >
      {label}
    </text>
    <rect
      className="studio-track"
      x="360"
      y={y - 9}
      width="44"
      height="19"
      rx="9.5"
      fill={enabled ? "var(--accent)" : "var(--ill-ink)"}
      opacity={enabled ? 0.92 : 0.2}
    />
    <circle
      className="studio-knob"
      cx="369"
      cy={y + 0.5}
      r="7"
      fill="var(--ill-paper)"
      stroke="var(--ill-metal)"
      strokeWidth="1"
      style={{ transform: enabled ? "translateX(26px)" : "translateX(0)" }}
    />
  </g>
);
}

export function StudioScene({
  theme = "default",
  sounds = true,
  confetti = true,
  pomodoro = 25,
  dailyHours = 2,
  daysLeft = 0,
  busy = false,
  className,
}: {
  theme?: string;
  sounds?: boolean;
  confetti?: boolean;
  pomodoro?: number;
  dailyHours?: number;
  daysLeft?: number;
  busy?: boolean;
  className?: string;
}) {
  const on = useSettled();
  /* More daily hours → a quicker machine; a running save/replan doubles it.
     The value is a custom property so the desktop hover rule can override it
     without touching an inline animation shorthand. */
  const base = Math.max(7, Math.min(26, 30 - (dailyHours || 2) * 2.6));
  const dur = busy ? base * 0.45 : base;
  const themeIndex = Math.max(
    0,
    THEME_DOTS.findIndex((t) => t.id === theme),
  );
  const pomoPct = Math.max(0, Math.min(100, ((pomodoro || 25) / 60) * 100));
  const ring = dashFor(22, pomoPct, on);


  return (
    <svg
      viewBox="0 0 560 340"
      className={className}
      role="img"
      aria-label={`Studio console: ${theme} theme, ${pomodoro} minute focus blocks, sound ${
        sounds ? "on" : "off"
      }, celebrations ${confetti ? "on" : "off"}`}
      style={{ ["--gear-dur" as string]: `${dur}s` }}
    >
      <defs>
        <radialGradient id="setHalo" cx="50%" cy="50%" r="50%">
          <stop
            offset="0%"
            stopColor="var(--ill-halo, rgba(122, 104, 240, 0.18))"
          />
          <stop
            offset="100%"
            stopColor="var(--ill-halo, rgba(122, 104, 240, 0.18))"
            stopOpacity="0"
          />
        </radialGradient>
      </defs>

      <ellipse cx="280" cy="168" rx="238" ry="140" fill="url(#setHalo)" />
      <Sparkle x={112} y={80} s={0.8} d={0.4} />
      <Sparkle x={462} y={70} s={0.6} d={1.6} />
      <Sparkle x={492} y={140} s={0.5} d={2.5} />
      <Desk />

      <g className="anim-float">
        <ellipse
          cx="280"
          cy="283"
          rx="146"
          ry="9"
          fill="var(--ill-ink)"
          opacity="0.14"
        />
        <rect
          x="136"
          y="70"
          width="288"
          height="196"
          rx="20"
          fill="var(--ill-paper)"
        />
        <rect
          x="136"
          y="70"
          width="288"
          height="196"
          rx="20"
          fill="none"
          stroke="var(--ill-metal2)"
          strokeWidth="2"
          opacity="0.55"
        />
        <path
          d="M136 90 a20 20 0 0 1 20 -20 h248 a20 20 0 0 1 20 20 v10 h-288 z"
          fill="var(--accent)"
        />
        <text
          x="154"
          y="95"
          fill="var(--accent-ink)"
          fontSize="10.5"
          fontWeight="700"
          letterSpacing="1.3"
        >
          STUDIO SYSTEM
        </text>
        {/* status LED — pulses faster while a save or re-plan is running */}
        <circle
          className={busy ? "anim-glow studio-led--busy" : "anim-glow"}
          cx="404"
          cy="90"
          r="4.6"
          fill={busy ? "var(--warn)" : "var(--accent-ink)"}
        />
        {sounds && (
          <g
            className="studio-wave"
            fill="none"
            stroke="var(--accent-ink)"
            strokeOpacity="0.55"
            strokeWidth="1.6"
            strokeLinecap="round"
          >
            <path d="M386 84 a8 8 0 0 1 0 12" style={{ animationDelay: "0s" }} />
            <path
              d="M380 80 a14 14 0 0 1 0 20"
              style={{ animationDelay: ".28s" }}
            />
          </g>
        )}

        {/* gears — speed follows the configured daily hours */}
        <Gear cx={196} cy={168} r={32} teeth={9} />
        <Gear cx={250} cy={132} r={18} teeth={7} reverse />
        <text
          x="412"
          y="126"
          textAnchor="end"
          fill="var(--ill-ink)"
          fontSize="9"
          fontWeight="700"
          opacity="0.66"
          style={{ fontVariantNumeric: "tabular-nums" }}
        >
          {(dailyHours || 0).toFixed(1)}h/day · {daysLeft}d left
        </text>

        {/* real toggles: the state the switches on this page write */}
        <ConsoleToggle y={152} label="SOUND" on={!!sounds} />
        <ConsoleToggle y={182} label="CONFETTI" on={!!confetti} />

        {/* focus-block dial */}
        <g>
          <circle
            cx="316"
            cy="222"
            r="22"
            fill="none"
            stroke="var(--ill-ink)"
            strokeOpacity="0.16"
            strokeWidth="6"
          />
          <circle
            className="studio-arc"
            cx="316"
            cy="222"
            r="22"
            fill="none"
            stroke="var(--accent)"
            strokeWidth="6"
            strokeLinecap="round"
            strokeDasharray={ring.c}
            strokeDashoffset={ring.offset}
            transform="rotate(-90 316 222)"
          />
          <text
            x="316"
            y="226"
            textAnchor="middle"
            fill="var(--text-main)"
            fontSize="12"
            fontWeight="800"
            style={{ fontVariantNumeric: "tabular-nums" }}
          >
            {Math.round(pomodoro || 0)}
          </text>
          <text
            x="316"
            y="254"
            textAnchor="middle"
            fill="var(--ill-ink)"
            fontSize="7.5"
            fontWeight="700"
            letterSpacing="0.7"
            opacity="0.6"
          >
            MINUTE FOCUS BLOCK
          </text>
        </g>

        {/* theme strip — the active theme is lifted and ringed */}
        <text
          x="160"
          y="222"
          fill="var(--ill-ink)"
          fontSize="8"
          fontWeight="700"
          letterSpacing="1"
          opacity="0.55"
        >
          THEME
        </text>
        {THEME_DOTS.map((t, i) => (
          <g key={t.id}>
            <circle
              className={
                i === themeIndex ? "studio-swatch is-active" : "studio-swatch"
              }
              cx={160 + i * 18}
              cy="240"
              r="6.4"
              fill={t.c}
              opacity={i === themeIndex ? 1 : 0.42}
            />
            {i === themeIndex && (
              <circle
                cx={160 + i * 18}
                cy="240"
                r="9.6"
                fill="none"
                stroke="var(--text-main)"
                strokeOpacity="0.45"
                strokeWidth="1.6"
              />
            )}
          </g>
        ))}
      </g>

      <Books x={88} y={286} s={0.8} />
      <Plant x={470} y={252} s={0.95} />
    </svg>
  );
}
