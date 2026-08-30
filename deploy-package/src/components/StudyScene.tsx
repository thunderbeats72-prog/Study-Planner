"use client";

import React from "react";

/**
 * Page illustrations for Study Planner Pro.
 *
 * One component, several variants — every scene is an inline SVG that paints
 * itself from the `--scene-*` custom properties (defined once per theme in
 * `study-planner-refresh.css`). That means each illustration automatically
 * follows the active theme (light, dark, obsidian, nebula, mint, sunset), stays
 * crisp on high-DPI screens, needs no network request, and never has to be
 * re-authored per palette.
 *
 * Variants:
 *   dashboard → desk lamp · stack of books · potted plant
 *   planner   → desk calendar · stack of books · potted plant
 *   focus     → desk clock · mug · potted plant
 *   subjects  → open notebook · book stack · pencil
 *   settings  → subtle stationery
 *
 * Every scene shares the same 360×200 canvas and the same ground line, so one
 * set of CSS sizing rules fits all of them, and all of them are `aria-hidden`
 * decoration.
 */

export type SceneVariant =
  | "dashboard"
  | "planner"
  | "focus"
  | "subjects"
  | "settings"
  | "graduation"
  | "course"
  | "details"
  | "syllabus"
  | "style"
  | "review";

/* Shared gradients + soft shadow blur. `id` prefixes every gradient so two
   scenes on the same page can never collide. */
function SceneDefs({ id }: { id: string }) {
  return (
    <defs>
      <linearGradient id={`${id}-desk`} x1="0" x2="1" y1="0" y2="1">
        <stop offset="0" stopColor="var(--scene-surface-2)" />
        <stop offset="1" stopColor="var(--scene-surface-1)" />
      </linearGradient>
      <linearGradient id={`${id}-lamp`} x1="0" x2="1" y1="0" y2="1">
        <stop offset="0" stopColor="var(--scene-accent-soft)" />
        <stop offset="1" stopColor="var(--scene-accent)" />
      </linearGradient>
      <linearGradient id={`${id}-book`} x1="0" x2="1">
        <stop offset="0" stopColor="var(--scene-book-1)" />
        <stop offset="1" stopColor="var(--scene-book-2)" />
      </linearGradient>
      <linearGradient id={`${id}-paper`} x1="0" x2="0" y1="0" y2="1">
        <stop offset="0" stopColor="var(--scene-surface-1)" />
        <stop offset="1" stopColor="var(--scene-surface-2)" />
      </linearGradient>
      <filter id={`${id}-blur`} x="-40%" y="-40%" width="180%" height="180%">
        <feGaussianBlur stdDeviation="8" />
      </filter>
    </defs>
  );
}

/**
 * Contact shadow + desk surface. The slab runs almost the full canvas so wide
 * compositions (books on the left, plant on the right) never hang off the edge,
 * and `y` is the line objects rest on.
 */
function SceneDesk({ id, y = 168 }: { id: string; y?: number }) {
  return (
    <>
      <ellipse cx="182" cy={y + 9} rx="150" ry="11" fill="var(--scene-shadow)" opacity=".28" filter={`url(#${id}-blur)`} />
      <ellipse cx="182" cy={y + 7} rx="138" ry="7" fill="var(--scene-shadow)" opacity=".13" />
      <path d={`M20 ${y}h324c5 0 8 4 5 7H15c-4-1-1-7 5-7Z`} fill={`url(#${id}-desk)`} />
      <rect x="46" y={y + 7} width="9" height="20" rx="4" fill="var(--scene-surface-2)" />
      <rect x="304" y={y + 7} width="9" height="20" rx="4" fill="var(--scene-surface-2)" />
    </>
  );
}

/* ── Dashboard: desk lamp · stack of books · potted plant ─────────────── */
export function DashboardScene() {
  return (
    <svg viewBox="0 0 360 200" role="presentation">
      <SceneDefs id="dash" />

      <ellipse cx="188" cy="168" rx="134" ry="13" fill="var(--scene-shadow)" opacity=".34" filter="url(#dash-blur)" />
      <ellipse cx="188" cy="166" rx="126" ry="9" fill="var(--scene-shadow)" opacity=".16" />

      {/* warm study glow */}
      <ellipse cx="258" cy="67" rx="72" ry="54" fill="var(--scene-glow)" opacity=".35" filter="url(#dash-blur)" />

      {/* books */}
      <g transform="translate(55 117) rotate(-1)">
        <rect x="0" y="31" width="122" height="12" rx="5" fill="var(--scene-book-2)" opacity=".9" />
        <rect x="8" y="18" width="112" height="14" rx="5" fill="url(#dash-book)" />
        <rect x="17" y="5" width="96" height="15" rx="5" fill="var(--scene-book-3)" />
        <path d="M25 8h76" stroke="rgba(255,255,255,.34)" strokeWidth="2" strokeLinecap="round" />
        <path d="M12 22h92" stroke="rgba(255,255,255,.18)" strokeWidth="2" strokeLinecap="round" />
      </g>

      {/* desk */}
      <path d="M28 151h250c5 0 8 4 5 7H22c-4-1-1-7 6-7Z" fill="url(#dash-desk)" />
      <rect x="42" y="158" width="9" height="21" rx="4" fill="var(--scene-surface-2)" />
      <rect x="258" y="158" width="9" height="21" rx="4" fill="var(--scene-surface-2)" />

      {/* lamp */}
      <g className="study-scene__lamp">
        <path d="M277 150V66" stroke="var(--scene-ink)" strokeWidth="6" strokeLinecap="round" />
        <path d="M277 67 225 30" stroke="var(--scene-ink)" strokeWidth="6" strokeLinecap="round" />
        <circle cx="277" cy="67" r="5" fill="var(--scene-accent)" />
        <path d="M210 18 244 35 226 60 193 43Z" fill="url(#dash-lamp)" />
        <path d="M203 20 237 37" stroke="rgba(255,255,255,.42)" strokeWidth="3" strokeLinecap="round" />
        <ellipse cx="219" cy="53" rx="37" ry="20" fill="var(--scene-accent-soft)" opacity=".2" filter="url(#dash-blur)" />
        <circle cx="219" cy="51" r="5" fill="var(--scene-lamp-core)" />
      </g>

      {/* plant */}
      <g className="study-scene__plant">
        <path d="M178 151c0-31 3-48 16-65" stroke="var(--scene-plant-stem)" strokeWidth="4" strokeLinecap="round" />
        <path d="M194 102c-12-7-22-20-16-31 14 2 23 13 16 31Z" fill="var(--scene-plant-1)" />
        <path d="M194 96c11-16 25-18 31-7-7 15-17 19-31 7Z" fill="var(--scene-plant-2)" />
        <path d="M188 119c-16-1-26-9-26-20 14-4 25 4 26 20Z" fill="var(--scene-plant-2)" opacity=".9" />
        <path d="M193 113c14-13 28-10 31 1-9 12-20 14-31-1Z" fill="var(--scene-plant-1)" opacity=".9" />
        <path d="M161 139h53l-6 25h-42Z" fill="var(--scene-pot)" />
        <path d="M158 138h59l-3 7h-53Z" fill="var(--scene-pot-rim)" />
        <ellipse cx="188" cy="137" rx="27" ry="7" fill="var(--scene-soil)" />
      </g>

      {/* tiny floating sparkles */}
      <g fill="var(--scene-accent)" opacity=".58">
        <path d="m123 46 3 7 7 3-7 3-3 7-3-7-7-3 7-3Z" />
        <path d="m164 28 2 5 5 2-5 2-2 5-2-5-5-2 5-2Z" />
        <circle cx="307" cy="94" r="3" />
      </g>
    </svg>
  );
}

/* ── Planner: desk calendar · stack of books · potted plant ───────────── */
export function PlannerScene() {
  // Grid is centred on the page both ways: 4×20px cells + 3×8px gaps = 104px
  // wide (4px page margin either side), and the 53px-tall grid is vertically
  // centred in the 96px body below the header band (21px above / 22px below)
  // so the page reads balanced instead of top-heavy.
  const cols = [154, 182, 210, 238];
  const rows = [95, 115, 135];
  return (
    <svg viewBox="0 0 360 200" role="presentation">
      <SceneDefs id="plan" />
      <SceneDesk id="plan" />

      {/* books (left) */}
      <g>
        <rect x="28" y="158" width="104" height="12" rx="5" fill="var(--scene-book-2)" opacity=".9" />
        <rect x="36" y="146" width="96" height="13" rx="5" fill="url(#plan-book)" />
        <rect x="44" y="134" width="82" height="13" rx="5" fill="var(--scene-book-3)" />
        <path d="M52 138h68" stroke="rgba(255,255,255,.3)" strokeWidth="2" strokeLinecap="round" />
        <path d="M42 151h84" stroke="rgba(255,255,255,.16)" strokeWidth="2" strokeLinecap="round" />
      </g>

      {/* desk calendar (centre) */}
      <g>
        <rect x="150" y="52" width="112" height="118" rx="12" fill="url(#plan-paper)" />
        <path d="M150 64a12 12 0 0 1 12-12h88a12 12 0 0 1 12 12v10H150z" fill="var(--scene-accent-soft)" />
        <g fill="none" stroke="var(--scene-ink)" strokeWidth="3" strokeLinecap="round" opacity=".7">
          <circle cx="182" cy="48" r="5.5" />
          <circle cx="230" cy="48" r="5.5" />
        </g>
        {rows.map((y, ri) =>
          cols.map((x, ci) => (
            <rect
              key={`${x}-${y}`}
              x={x}
              y={y}
              width="20"
              height="13"
              rx="4"
              fill={ri === 1 && ci === 1 ? "var(--scene-accent)" : "var(--scene-surface-2)"}
              opacity={ri === 1 && ci === 1 ? ".85" : ".5"}
            />
          ))
        )}
      </g>

      {/* plant (right) */}
      <g className="study-scene__plant">
        <path d="M317 146c0-20 2-30 8-40" stroke="var(--scene-plant-stem)" strokeWidth="3.6" strokeLinecap="round" />
        <path d="M325 116c-9-5-16-15-12-23 10 1 17 10 12 23Z" fill="var(--scene-plant-1)" />
        <path d="M325 110c8-12 19-13 23-5-5 11-13 14-23 5Z" fill="var(--scene-plant-2)" />
        <path d="M320 129c-12-1-19-7-19-15 10-3 18 3 19 15Z" fill="var(--scene-plant-2)" opacity=".9" />
        <path d="M324 124c10-10 21-8 23 1-7 9-15 10-23-1Z" fill="var(--scene-plant-1)" opacity=".9" />
        <path d="M292 148h50l-6 22h-38Z" fill="var(--scene-pot)" />
        <path d="M289 143h56l-3 8H292Z" fill="var(--scene-pot-rim)" />
        <ellipse cx="317" cy="145" rx="25" ry="6" fill="var(--scene-soil)" />
      </g>

      <g fill="var(--scene-accent)" opacity=".5">
        <path d="m126 60 3 7 7 3-7 3-3 7-3-7-7-3 7-3Z" />
        <circle cx="106" cy="96" r="2.6" />
      </g>
    </svg>
  );
}

/* ── Focus: desk clock · mug · potted plant ───────────────────────────── */
export function FocusScene() {
  return (
    <svg viewBox="0 0 360 200" role="presentation">
      <SceneDefs id="foc" />
      <SceneDesk id="foc" />

      {/* mug (left) */}
      <g>
        <path d="M50 140h34l-4 30H54Z" fill="var(--scene-surface-2)" opacity=".85" />
        <path d="M84 146c9 0 9 14 0 14" fill="none" stroke="var(--scene-surface-2)" strokeWidth="4" strokeLinecap="round" />
        <path d="M46 138h42l-2 6H48Z" fill="var(--scene-accent-soft)" />
        <g stroke="var(--scene-ink)" strokeOpacity=".26" strokeWidth="2.6" strokeLinecap="round" fill="none">
          <path d="M60 128c-4-5 4-8 0-13" />
          <path d="M72 128c-4-5 4-8 0-13" />
        </g>
      </g>

      {/* desk clock (centre) */}
      <g>
        <circle cx="176" cy="104" r="50" fill="url(#foc-paper)" />
        <circle cx="176" cy="104" r="50" fill="none" stroke="var(--scene-ink)" strokeOpacity=".45" strokeWidth="4" />
        <circle cx="176" cy="104" r="41" fill="var(--scene-accent-soft)" opacity=".22" />
        <g stroke="var(--scene-ink)" strokeOpacity=".4" strokeWidth="3" strokeLinecap="round">
          <path d="M176 64v8" />
          <path d="M176 144v-8" />
          <path d="M134 104h8" />
          <path d="M218 104h-8" />
        </g>
        <g stroke="var(--scene-ink)" strokeWidth="4.5" strokeLinecap="round">
          <path d="M176 104V72" />
          <path d="M176 104l22 13" />
        </g>
        <circle cx="176" cy="104" r="5" fill="var(--scene-accent)" />
        <path d="M160 156h32l6 14h-44Z" fill="var(--scene-surface-2)" />
        <rect x="150" y="166" width="52" height="6" rx="3" fill="var(--scene-surface-2)" />
      </g>

      {/* plant (right) */}
      <g className="study-scene__plant">
        <path d="M300 150c0-24 3-36 12-48" stroke="var(--scene-plant-stem)" strokeWidth="3.6" strokeLinecap="round" />
        <path d="M312 116c-10-6-18-17-13-26 12 2 20 12 13 26Z" fill="var(--scene-plant-1)" />
        <path d="M312 109c9-13 21-14 26-6-6 12-15 15-26 6Z" fill="var(--scene-plant-2)" />
        <path d="M306 132c-13-1-21-8-21-17 11-3 20 4 21 17Z" fill="var(--scene-plant-2)" opacity=".9" />
        <path d="M311 126c11-11 23-8 25 1-8 10-16 12-25-1Z" fill="var(--scene-plant-1)" opacity=".9" />
        <path d="M276 152h48l-6 20h-37Z" fill="var(--scene-pot)" />
        <path d="M273 147h54l-3 8h-48Z" fill="var(--scene-pot-rim)" />
        <ellipse cx="300" cy="149" rx="24" ry="6" fill="var(--scene-soil)" />
      </g>

      <g fill="var(--scene-accent)" opacity=".45">
        <circle cx="248" cy="66" r="3" />
        <path d="m238 92 2 5 5 2-5 2-2 5-2-5-5-2 5-2Z" />
      </g>
    </svg>
  );
}

/* ── Subjects: open notebook · book stack · pencil ────────────────────── */
export function SubjectsScene() {
  return (
    <svg viewBox="0 0 360 200" role="presentation">
      <SceneDefs id="sub" />
      <SceneDesk id="sub" />

      {/* book stack (left) */}
      <g>
        <rect x="30" y="156" width="86" height="12" rx="5" fill="var(--scene-book-2)" opacity=".9" />
        <rect x="38" y="144" width="78" height="13" rx="5" fill="url(#sub-book)" />
        <rect x="46" y="132" width="66" height="13" rx="5" fill="var(--scene-book-3)" />
        <path d="M54 136h50" stroke="rgba(255,255,255,.3)" strokeWidth="2" strokeLinecap="round" />
      </g>

      {/* open notebook (centre) */}
      <g>
        <path d="M104 88 174 78v84l-70 8Z" fill="url(#sub-paper)" />
        <path d="M174 78 252 88l4 82-82-8Z" fill="url(#sub-paper)" />
        <path d="M168 80h12v82h-12Z" fill="var(--scene-surface-2)" opacity=".6" />
        <g stroke="var(--scene-ink)" strokeOpacity=".18" strokeWidth="3" strokeLinecap="round">
          <path d="M116 106h48" />
          <path d="M116 120h48" />
          <path d="M116 134h34" />
          <path d="M190 108h50" />
          <path d="M190 122h50" />
          <path d="M190 136h36" />
        </g>
        <rect x="190" y="100" width="42" height="4" rx="2" fill="var(--scene-accent)" opacity=".8" />
        <circle cx="146" cy="148" r="7" fill="var(--scene-accent-soft)" />
      </g>

      {/* pencil leaning against the notebook (right) */}
      <g transform="rotate(28 292 112)">
        <rect x="278" y="72" width="17" height="88" rx="4" fill="var(--scene-book-3)" />
        <rect x="278" y="72" width="17" height="18" rx="4" fill="var(--scene-book-1)" />
        <path d="M278 160h17l-8.5 16Z" fill="var(--scene-surface-2)" />
        <path d="M286.5 176l-4-7 3-1 3 7Z" fill="var(--scene-ink)" opacity=".7" />
        <path d="M282 80h9" stroke="rgba(255,255,255,.35)" strokeWidth="2" strokeLinecap="round" />
      </g>

      <g fill="var(--scene-accent)" opacity=".5">
        <path d="m86 108 3 7 7 3-7 3-3 7-3-7-7-3 7-3Z" />
        <circle cx="112" cy="76" r="2.8" />
      </g>
    </svg>
  );
}

/* ── Settings: subtle stationery on the desk ──────────────────────────── */
export function SettingsScene() {
  return (
    <svg viewBox="0 0 360 200" role="presentation">
      <SceneDefs id="set" />
      <SceneDesk id="set" />

      {/* sheet of notes */}
      <g>
        <rect x="104" y="40" width="132" height="106" rx="10" fill="url(#set-paper)" />
        <g stroke="var(--scene-ink)" strokeOpacity=".16" strokeWidth="3" strokeLinecap="round">
          <path d="M120 66h100" />
          <path d="M120 82h100" />
          <path d="M120 98h72" />
          <path d="M120 114h84" />
        </g>
        <rect x="120" y="54" width="46" height="5" rx="2.5" fill="var(--scene-accent)" opacity=".75" />
        <path d="M120 128l10 10 20-24" fill="none" stroke="var(--scene-accent)" strokeOpacity=".8"
          strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
      </g>

      {/* ruler */}
      <g transform="rotate(-7 180 158)">
        <rect x="72" y="150" width="176" height="16" rx="4" fill="var(--scene-surface-2)" opacity=".85" />
        <g stroke="var(--scene-ink)" strokeOpacity=".3" strokeWidth="2.4" strokeLinecap="round">
          {[0, 1, 2, 3, 4, 5, 6, 7].map((i) => (
            <path key={i} d={`M${86 + i * 22} 150v${i % 2 === 0 ? 7 : 4}`} />
          ))}
        </g>
      </g>

      {/* pen */}
      <g transform="rotate(34 288 108)">
        <rect x="280" y="58" width="16" height="94" rx="6" fill="var(--scene-book-2)" />
        <path d="M280 152h16l-8 18Z" fill="var(--scene-surface-2)" />
        <rect x="280" y="58" width="16" height="18" rx="6" fill="var(--scene-accent)" opacity=".85" />
        <path d="M284 68h8" stroke="rgba(255,255,255,.4)" strokeWidth="2" strokeLinecap="round" />
      </g>

      {/* paper clip resting on the desk */}
      <g fill="none" stroke="var(--scene-ink)" strokeOpacity=".45" strokeWidth="3.4" strokeLinecap="round">
        <path d="M262 150c-9 0-9 14 0 14h20c5 0 5-8 0-8h-18" />
      </g>

      <g fill="var(--scene-accent)" opacity=".45">
        <circle cx="80" cy="86" r="3" />
        <path d="m64 116 2 5 5 2-5 2-2 5-2-5-5-2 5-2Z" />
      </g>
    </svg>
  );
}

/* ── Graduation (onboarding · level): cap · books · plant ─────────────── */
export function GraduationScene() {
  return (
    <svg viewBox="0 0 360 200" role="presentation">
      <SceneDefs id="grad" />
      <SceneDesk id="grad" />
      <ellipse cx="178" cy="72" rx="96" ry="50" fill="var(--scene-glow)" opacity=".22" filter="url(#grad-blur)" />

      {/* books (left) */}
      <g>
        <rect x="34" y="157" width="98" height="12" rx="5" fill="var(--scene-book-2)" opacity=".9" />
        <rect x="42" y="144" width="90" height="13" rx="5" fill="url(#grad-book)" />
        <rect x="50" y="131" width="74" height="13" rx="5" fill="var(--scene-book-3)" />
        <path d="M56 135h60" stroke="rgba(255,255,255,.3)" strokeWidth="2" strokeLinecap="round" />
      </g>

      {/* graduation cap (centre, floating on a soft shadow) */}
      <g>
        <ellipse cx="178" cy="104" rx="52" ry="8" fill="var(--scene-shadow)" opacity=".16" filter="url(#grad-blur)" />
        <path d="M178 40 132 66 178 92 224 66Z" fill="url(#grad-lamp)" />
        <path d="M178 42 135 66 178 90 221 66Z" fill="none" stroke="rgba(255,255,255,.4)" strokeWidth="2.5" strokeLinejoin="round" />
        <path d="M138 74h80v13c0 9-18 15-40 15s-40-6-40-15Z" fill="var(--scene-surface-2)" />
        <circle cx="178" cy="66" r="5" fill="var(--scene-lamp-core)" />
        <path d="M224 66v25" stroke="var(--scene-ink)" strokeWidth="4.5" strokeLinecap="round" />
        <path d="M217 91h14l-7 13Z" fill="var(--scene-accent)" />
      </g>

      {/* plant (right) */}
      <g className="study-scene__plant">
        <path d="M315 147c0-20 2-30 8-40" stroke="var(--scene-plant-stem)" strokeWidth="3.6" strokeLinecap="round" />
        <path d="M323 117c-9-5-16-15-12-23 10 1 17 10 12 23Z" fill="var(--scene-plant-1)" />
        <path d="M323 111c8-12 19-13 23-5-5 11-13 14-23 5Z" fill="var(--scene-plant-2)" />
        <path d="M318 130c-12-1-19-7-19-15 10-3 18 3 19 15Z" fill="var(--scene-plant-2)" opacity=".9" />
        <path d="M322 125c10-10 21-8 23 1-7 9-15 10-23-1Z" fill="var(--scene-plant-1)" opacity=".9" />
        <path d="M290 149h50l-6 21h-38Z" fill="var(--scene-pot)" />
        <path d="M287 144h56l-3 8H290Z" fill="var(--scene-pot-rim)" />
        <ellipse cx="315" cy="146" rx="25" ry="6" fill="var(--scene-soil)" />
      </g>

      <g fill="var(--scene-accent)" opacity=".5">
        <path d="m96 52 3 7 7 3-7 3-3 7-3-7-7-3 7-3Z" />
        <circle cx="266" cy="42" r="3" />
      </g>
    </svg>
  );
}

/* ── Course (onboarding · course): open book · magnifier · pencil ─────── */
export function CourseScene() {
  return (
    <svg viewBox="0 0 360 200" role="presentation">
      <SceneDefs id="crs" />
      <SceneDesk id="crs" />
      <ellipse cx="170" cy="106" rx="104" ry="50" fill="var(--scene-glow)" opacity=".2" filter="url(#crs-blur)" />

      {/* open book (centre-left) */}
      <g>
        <ellipse cx="180" cy="160" rx="112" ry="9" fill="var(--scene-shadow)" opacity=".16" filter="url(#crs-blur)" />
        <path d="M84 100 184 88v64l-100 8Z" fill="url(#crs-paper)" />
        <path d="M184 88 300 98l4 62-104-8Z" fill="url(#crs-paper)" />
        <path d="M176 90h16v60h-16Z" fill="var(--scene-surface-2)" opacity=".6" />
        <g stroke="var(--scene-ink)" strokeOpacity=".16" strokeWidth="3" strokeLinecap="round">
          <path d="M104 116h56M104 130h56M104 144h38" />
          <path d="M210 118h70M210 132h70M210 146h52" />
        </g>
        <rect x="210" y="108" width="52" height="4" rx="2" fill="var(--scene-accent)" opacity=".8" />
      </g>

      {/* magnifier (top-right) */}
      <g>
        <circle cx="286" cy="52" r="24" fill="var(--scene-accent-soft)" opacity=".24" />
        <circle cx="286" cy="52" r="24" fill="none" stroke="var(--scene-ink)" strokeOpacity=".5" strokeWidth="4.5" />
        <path d="M302 68l20 20" stroke="var(--scene-ink)" strokeOpacity=".5" strokeWidth="6" strokeLinecap="round" />
        <path d="M274 42a18 18 0 0 1 11-5" stroke="rgba(255,255,255,.55)" strokeWidth="3" strokeLinecap="round" fill="none" />
      </g>

      {/* pencil (bottom-left) */}
      <g transform="rotate(24 58 96)">
        <rect x="38" y="50" width="13" height="86" rx="4" fill="var(--scene-book-3)" />
        <rect x="38" y="50" width="13" height="15" rx="4" fill="var(--scene-accent)" />
        <path d="M38 136h13l-6.5 12Z" fill="var(--scene-surface-2)" />
        <path d="M42 58h6" stroke="rgba(255,255,255,.4)" strokeWidth="2" strokeLinecap="round" />
      </g>

      <g fill="var(--scene-accent)" opacity=".5">
        <path d="m124 60 3 7 7 3-7 3-3 7-3-7-7-3 7-3Z" />
        <circle cx="52" cy="32" r="2.8" />
      </g>
    </svg>
  );
}

/* ── Details (onboarding · details): clipboard · pencil · plant ───────── */
export function DetailsScene() {
  return (
    <svg viewBox="0 0 360 200" role="presentation">
      <SceneDefs id="dtl" />
      <SceneDesk id="dtl" />
      <ellipse cx="180" cy="96" rx="92" ry="48" fill="var(--scene-glow)" opacity=".2" filter="url(#dtl-blur)" />

      {/* clipboard (centre) */}
      <g>
        <ellipse cx="180" cy="160" rx="70" ry="8" fill="var(--scene-shadow)" opacity=".16" filter="url(#dtl-blur)" />
        <rect x="108" y="48" width="120" height="116" rx="14" fill="url(#dtl-paper)" />
        <rect x="132" y="36" width="72" height="20" rx="7" fill="var(--scene-surface-2)" />
        <rect x="108" y="76" width="120" height="22" fill="var(--scene-accent-soft)" opacity=".5" />
        <g stroke="var(--scene-ink)" strokeOpacity=".16" strokeWidth="3.5" strokeLinecap="round">
          <path d="M130 118h76M130 132h76M130 146h48" />
        </g>
      </g>

      {/* pencil (right) */}
      <g transform="rotate(28 266 120)">
        <rect x="252" y="64" width="15" height="100" rx="5" fill="var(--scene-book-3)" />
        <rect x="252" y="64" width="15" height="18" rx="5" fill="var(--scene-book-1)" />
        <path d="M252 164h15l-7.5 14Z" fill="var(--scene-surface-2)" />
      </g>

      {/* plant (left) */}
      <g className="study-scene__plant">
        <path d="M52 148c0-18 2-28 7-37" stroke="var(--scene-plant-stem)" strokeWidth="3.2" strokeLinecap="round" />
        <path d="M59 120c-8-5-14-14-11-21 9 1 15 9 11 21Z" fill="var(--scene-plant-1)" />
        <path d="M59 114c7-11 17-12 20-4-4 10-11 13-20 4Z" fill="var(--scene-plant-2)" />
        <path d="M33 149h44l-6 19h-32Z" fill="var(--scene-pot)" />
        <path d="M30 145h50l-3 7h-44Z" fill="var(--scene-pot-rim)" />
        <ellipse cx="55" cy="147" rx="22" ry="5" fill="var(--scene-soil)" />
      </g>

      <g fill="var(--scene-accent)" opacity=".5">
        <path d="m70 96 3 7 7 3-7 3-3 7-3-7-7-3 7-3Z" />
      </g>
    </svg>
  );
}

/* ── Syllabus (onboarding · syllabus): book stack · bookmark · plant ──── */
export function SyllabusScene() {
  return (
    <svg viewBox="0 0 360 200" role="presentation">
      <SceneDefs id="syl" />
      <SceneDesk id="syl" />
      <ellipse cx="150" cy="120" rx="96" ry="46" fill="var(--scene-glow)" opacity=".2" filter="url(#syl-blur)" />

      {/* book stack (left) */}
      <g>
        <rect x="36" y="156" width="120" height="12" rx="5" fill="var(--scene-book-2)" opacity=".9" />
        <rect x="44" y="142" width="108" height="14" rx="5" fill="url(#syl-book)" />
        <rect x="52" y="128" width="94" height="14" rx="5" fill="var(--scene-book-3)" />
        <rect x="60" y="114" width="80" height="14" rx="5" fill="var(--scene-book-1)" />
        <path d="M66 118h68" stroke="rgba(255,255,255,.32)" strokeWidth="2.5" strokeLinecap="round" />
        <path d="M50 132h86" stroke="rgba(255,255,255,.2)" strokeWidth="2.5" strokeLinecap="round" />
        <path d="M74 114v36l-8-7-8 7V114Z" fill="var(--scene-accent)" />
      </g>

      {/* plant (right) */}
      <g className="study-scene__plant">
        <path d="M315 147c0-20 2-30 8-40" stroke="var(--scene-plant-stem)" strokeWidth="3.6" strokeLinecap="round" />
        <path d="M323 117c-9-5-16-15-12-23 10 1 17 10 12 23Z" fill="var(--scene-plant-1)" />
        <path d="M323 111c8-12 19-13 23-5-5 11-13 14-23 5Z" fill="var(--scene-plant-2)" />
        <path d="M318 130c-12-1-19-7-19-15 10-3 18 3 19 15Z" fill="var(--scene-plant-2)" opacity=".9" />
        <path d="M322 125c10-10 21-8 23 1-7 9-15 10-23-1Z" fill="var(--scene-plant-1)" opacity=".9" />
        <path d="M290 149h50l-6 21h-38Z" fill="var(--scene-pot)" />
        <path d="M287 144h56l-3 8H290Z" fill="var(--scene-pot-rim)" />
        <ellipse cx="315" cy="146" rx="25" ry="6" fill="var(--scene-soil)" />
      </g>

      <g fill="var(--scene-accent)" opacity=".5">
        <path d="m300 74 3 7 7 3-7 3-3 7-3-7-7-3 7-3Z" />
        <circle cx="252" cy="96" r="2.8" />
      </g>
    </svg>
  );
}

/* ── Style (onboarding · style): glowing bulb · books · rays ──────────── */
export function StyleScene() {
  return (
    <svg viewBox="0 0 360 200" role="presentation">
      <SceneDefs id="sty" />
      <SceneDesk id="sty" />
      <ellipse cx="210" cy="60" rx="88" ry="52" fill="var(--scene-glow)" opacity=".3" filter="url(#sty-blur)" />

      {/* light rays */}
      <g stroke="var(--scene-accent)" strokeOpacity=".4" strokeWidth="4" strokeLinecap="round">
        <path d="M120 40h-24M300 40h24M210 6V2" />
        <path d="M156 18l-12-12M264 18l12-12" />
      </g>

      {/* bulb (centre-right) */}
      <g>
        <ellipse cx="210" cy="112" rx="40" ry="7" fill="var(--scene-shadow)" opacity=".16" filter="url(#sty-blur)" />
        <circle cx="210" cy="52" r="30" fill="url(#sty-lamp)" />
        <path d="M196 44a22 22 0 0 1 8-14" stroke="rgba(255,255,255,.45)" strokeWidth="4" strokeLinecap="round" fill="none" />
        <circle cx="202" cy="58" r="7" fill="var(--scene-lamp-core)" />
        <rect x="196" y="80" width="28" height="16" rx="6" fill="url(#sty-lamp)" />
        <rect x="188" y="96" width="44" height="9" rx="4.5" fill="var(--scene-surface-2)" />
        <rect x="193" y="105" width="34" height="7" rx="3.5" fill="var(--scene-surface-1)" />
      </g>

      {/* books (left) */}
      <g>
        <rect x="30" y="156" width="104" height="12" rx="5" fill="var(--scene-book-2)" opacity=".9" />
        <rect x="38" y="143" width="96" height="13" rx="5" fill="url(#sty-book)" />
        <rect x="46" y="130" width="82" height="13" rx="5" fill="var(--scene-book-3)" />
        <path d="M52 134h68" stroke="rgba(255,255,255,.3)" strokeWidth="2" strokeLinecap="round" />
      </g>

      <g fill="var(--scene-accent)" opacity=".5">
        <path d="m150 108 3 7 7 3-7 3-3 7-3-7-7-3 7-3Z" />
        <circle cx="310" cy="130" r="3" />
      </g>
    </svg>
  );
}

/* ── Review (onboarding · review): checklist board · flag · books ─────── */
export function ReviewScene() {
  return (
    <svg viewBox="0 0 360 200" role="presentation">
      <SceneDefs id="rev" />
      <SceneDesk id="rev" />
      <ellipse cx="190" cy="92" rx="96" ry="48" fill="var(--scene-glow)" opacity=".2" filter="url(#rev-blur)" />

      {/* books (left) */}
      <g>
        <rect x="34" y="157" width="90" height="12" rx="5" fill="var(--scene-book-2)" opacity=".9" />
        <rect x="42" y="144" width="82" height="13" rx="5" fill="url(#rev-book)" />
        <rect x="50" y="131" width="68" height="13" rx="5" fill="var(--scene-book-3)" />
        <path d="M56 135h56" stroke="rgba(255,255,255,.3)" strokeWidth="2" strokeLinecap="round" />
      </g>

      {/* checklist board (centre) */}
      <g>
        <ellipse cx="200" cy="160" rx="66" ry="8" fill="var(--scene-shadow)" opacity=".16" filter="url(#rev-blur)" />
        <rect x="140" y="44" width="120" height="116" rx="16" fill="url(#rev-paper)" />
        <rect x="156" y="58" width="52" height="7" rx="3.5" fill="var(--scene-accent)" opacity=".8" />
        <g stroke="var(--scene-accent)" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" fill="none">
          <path d="M168 96l12 12 20-24" />
          <path d="M168 128l12 12 20-24" />
        </g>
      </g>

      {/* flag (right) */}
      <g>
        <path d="M292 160V60" stroke="var(--scene-ink)" strokeWidth="5" strokeLinecap="round" />
        <path d="M292 60c11 8 22 8 32 0-8 14-21 14-32 0Z" fill="url(#rev-lamp)" />
      </g>

      <g fill="var(--scene-accent)" opacity=".5">
        <path d="m76 96 3 7 7 3-7 3-3 7-3-7-7-3 7-3Z" />
      </g>
    </svg>
  );
}

const SCENES: Record<SceneVariant, () => React.JSX.Element> = {
  dashboard: DashboardScene,
  planner: PlannerScene,
  focus: FocusScene,
  subjects: SubjectsScene,
  settings: SettingsScene,
  graduation: GraduationScene,
  course: CourseScene,
  details: DetailsScene,
  syllabus: SyllabusScene,
  style: StyleScene,
  review: ReviewScene,
};

export default function StudyScene({
  variant = "dashboard",
  compact = false,
  className = "",
}: {
  variant?: SceneVariant;
  compact?: boolean;
  className?: string;
}) {
  const Scene = SCENES[variant] ?? DashboardScene;
  return (
    <div
      className={`study-scene study-scene--${variant}${compact ? " study-scene--compact" : ""} ${className}`.trim()}
      aria-hidden="true"
    >
      <Scene />
    </div>
  );
}
