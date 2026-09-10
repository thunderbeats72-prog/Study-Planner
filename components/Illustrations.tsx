"use client";

import React from "react";

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
