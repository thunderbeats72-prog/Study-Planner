"use client";

import React from "react";

/**
 * Page illustrations for Study Planner Pro — v26 studio still-life pass.
 *
 * The dashboard / planner / focus scenes were rebuilt to mirror the soft-3D
 * reference renders (desk lamp + book stack, spiral desk calendar, analog
 * clock + mug) instead of the older flat line-art. Every material paints
 * itself from the `--scene-*` custom properties (declared per theme in
 * `study-planner-refresh.css`), so the whole still life re-mixes when the
 * theme changes — Midnight, Obsidian, Nebula, Mint and Sunset each get their
 * own believable materials. Shading is done with fixed white/black overlays
 * on top of the themed base colours, which is what keeps the soft-3D read
 * intact across palettes.
 *
 * Variants:
 *   dashboard → dome desk lamp · 4-book stack · potted plant · pencil
 *   planner   → spiral desk calendar · succulent · two tabbed books
 *   focus     → analog desk clock · mug · potted plant
 *   subjects  → open notebook · book stack · pencil
 *   settings  → subtle stationery
 *
 * Every scene shares the same 360×200 canvas and the same ground line, so one
 * set of CSS sizing rules fits all of them, and all of them are `aria-hidden`
 * decoration.
 */

export type SceneVariant = "dashboard" | "planner" | "focus" | "subjects" | "settings";

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
      <linearGradient id={`${id}-lav`} x1="0" x2="0" y1="0" y2="1">
        <stop offset="0" stopColor="var(--scene-book-lav)" />
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
      <linearGradient id={`${id}-metal`} x1="0" x2="0" y1="0" y2="1">
        <stop offset="0" stopColor="#eef0f5" />
        <stop offset="1" stopColor="var(--scene-metal)" />
      </linearGradient>
      <radialGradient id={`${id}-warm`} cx=".5" cy=".15" r=".95">
        <stop offset="0" stopColor="var(--scene-warm-light)" stopOpacity=".85" />
        <stop offset="1" stopColor="var(--scene-warm-light)" stopOpacity="0" />
      </radialGradient>
      <filter id={`${id}-blur`} x="-40%" y="-40%" width="180%" height="180%">
        <feGaussianBlur stdDeviation="8" />
      </filter>
      <filter id={`${id}-blur-s`} x="-60%" y="-60%" width="220%" height="220%">
        <feGaussianBlur stdDeviation="3.2" />
      </filter>
    </defs>
  );
}

/* Soft contact shadow — the still-life objects sit on these. */
function Contact({ id, cx, cy, rx, o = 0.22 }: { id: string; cx: number; cy: number; rx: number; o?: number }) {
  return <ellipse cx={cx} cy={cy} rx={rx} ry={rx * 0.16} fill="var(--scene-shadow)" opacity={o} filter={`url(#${id}-blur-s)`} />;
}

/* Rounded book slab with page block + top light, matching the reference
   soft-3D books. `fill` is the cover colour token. */
function Book({ x, y, w, h, fill, pages = true }: { x: number; y: number; w: number; h: number; fill: string; pages?: boolean }) {
  return (
    <g>
      <rect x={x} y={y} width={w} height={h} rx={h / 2.4} fill={fill} />
      {pages && <rect x={x + w - 13} y={y + 3} width={9.5} height={h - 6} rx={3} fill="var(--scene-pages)" opacity=".95" />}
      <rect x={x + 5} y={y + 2} width={w - 16} height={h / 3.2} rx={h / 6.4} fill="#ffffff" opacity=".2" />
      <rect x={x + 3} y={y + h - 3.4} width={w - 6} height={2.6} rx={1.3} fill="#000000" opacity=".06" />
    </g>
  );
}

/* ── Dashboard: dome desk lamp · 4-book stack · plant · pencil ─────────── */
function DashboardScene() {
  return (
    <svg viewBox="0 0 360 200" role="presentation">
      <SceneDefs id="dash" />

      {/* studio wash + ground */}
      <ellipse cx="205" cy="96" rx="152" ry="74" fill="var(--scene-bg)" opacity=".55" filter="url(#dash-blur)" />
      <ellipse cx="198" cy="171" rx="148" ry="9" fill="var(--scene-shadow)" opacity=".26" filter="url(#dash-blur)" />

      {/* book stack — lavender / pink / cream / blue, like the reference */}
      <Contact id="dash" cx={148} cy={166} rx={72} />
      <Book x={85} y={147} w={126} h={17} fill="var(--scene-book-blue)" />
      <Book x={90} y={131} w={116} h={16} fill="var(--scene-book-cream)" />
      <Book x={95} y={116} w={106} h={15} fill="var(--scene-book-pink)" />
      <Book x={100} y={101} w={96} h={15} fill="var(--scene-book-lav)" />

      {/* pencil lying in front, tip to the left */}
      <Contact id="dash" cx={170} cy={182} rx={46} o={0.16} />
      <g transform="rotate(-1.5 170 179)">
        <rect x="136" y="176" width="80" height="6" rx="3" fill="var(--scene-book-lav)" />
        <rect x="136" y="176.8" width="76" height="1.8" rx=".9" fill="#ffffff" opacity=".3" />
        <path d="M136 176l-11 3 11 3Z" fill="var(--scene-book-cream)" />
        <path d="M128.6 178l-3.6 1 3.6 1Z" fill="var(--scene-ink)" opacity=".8" />
      </g>

      {/* potted plant */}
      <Contact id="dash" cx={251} cy={169} rx={30} />
      <g>
        <path d="M251 140c0-17 2-29 8-41" stroke="var(--scene-plant-stem)" strokeWidth="3.4" strokeLinecap="round" fill="none" />
        <ellipse cx="242" cy="108" rx="14" ry="7" fill="var(--scene-plant-1)" transform="rotate(-38 242 108)" />
        <ellipse cx="263" cy="101" rx="15" ry="7.5" fill="var(--scene-plant-2)" transform="rotate(28 263 101)" />
        <ellipse cx="247" cy="93" rx="13" ry="7" fill="var(--scene-plant-2)" transform="rotate(-64 247 93)" />
        <ellipse cx="266" cy="117" rx="13" ry="6.5" fill="var(--scene-plant-1)" transform="rotate(48 266 117)" />
        <ellipse cx="237" cy="121" rx="12" ry="6" fill="var(--scene-plant-2)" transform="rotate(-52 237 121)" />
        <ellipse cx="257" cy="85" rx="11" ry="6" fill="var(--scene-plant-1)" transform="rotate(-8 257 85)" />
      </g>
      <path d="M229 144h46l-5.5 23c-.5 2-2.3 3.4-4.4 3.4h-26.2c-2.1 0-3.9-1.4-4.4-3.4Z" fill="var(--scene-pot-cream)" />
      <rect x="226" y="138" width="52" height="9" rx="4.5" fill="var(--scene-pot-cream)" />
      <rect x="226" y="144.6" width="52" height="2.4" rx="1.2" fill="#000000" opacity=".06" />

      {/* desk lamp — round base, jointed arm, dome head tilted over the books */}
      <Contact id="dash" cx={305} cy={168} rx={26} />
      <g className="study-scene__lamp">
        <path d="M305 158 316 112" stroke="var(--scene-book-lav)" strokeWidth="7" strokeLinecap="round" />
        <path d="M316 112 305 34" stroke="var(--scene-book-lav)" strokeWidth="7" strokeLinecap="round" />
        <circle cx="316" cy="112" r="5" fill="url(#dash-metal)" />
        <path d="M287 166c0-6.5 8-10 18-10s18 3.5 18 10v1.5h-36Z" fill="var(--scene-book-lav)" />
        <rect x="291" y="160.5" width="28" height="2.6" rx="1.3" fill="#ffffff" opacity=".28" />
        {/* warm cone cast toward the books */}
        <path d="M278 66 226 150h84Z" fill="url(#dash-warm)" opacity=".38" filter="url(#dash-blur)" />
        <g transform="rotate(24 292 58)">
          <path d="M260 58a32 32 0 0 1 64 0Z" fill="url(#dash-lav)" />
          <ellipse cx="292" cy="58" rx="32" ry="7.5" fill="var(--scene-dial)" />
          <ellipse cx="292" cy="58.5" rx="23" ry="4.6" fill="var(--scene-warm-light)" />
          <path d="M268 40a26 26 0 0 1 15-9" stroke="#ffffff" strokeWidth="3.4" strokeLinecap="round" opacity=".4" fill="none" />
          <circle cx="292" cy="27" r="4.5" fill="url(#dash-metal)" />
        </g>
      </g>

      {/* tiny floating sparkles */}
      <g fill="var(--scene-accent)" opacity=".5">
        <path d="m120 44 3 7 7 3-7 3-3 7-3-7-7-3 7-3Z" />
        <path d="m166 26 2 5 5 2-5 2-2 5-2-5-5-2 5-2Z" />
        <circle cx="322" cy="92" r="3" />
      </g>
    </svg>
  );
}

/* ── Planner: spiral desk calendar · succulent · two tabbed books ──────── */
function PlannerScene() {
  const ringXs = [164, 186, 208, 230, 252];
  const cols = [155, 176, 197, 218, 239];
  const rows = [78, 96, 114, 132];
  return (
    <svg viewBox="0 0 360 200" role="presentation">
      <SceneDefs id="plan" />

      <ellipse cx="196" cy="100" rx="150" ry="72" fill="var(--scene-bg)" opacity=".55" filter="url(#plan-blur)" />
      <ellipse cx="196" cy="170" rx="146" ry="9" fill="var(--scene-shadow)" opacity=".26" filter="url(#plan-blur)" />

      {/* succulent in a cream pot (left) */}
      <Contact id="plan" cx={75} cy={167} rx={26} />
      <g>
        <ellipse cx="66" cy="126" rx="11" ry="6.5" fill="var(--scene-plant-1)" transform="rotate(-50 66 126)" />
        <ellipse cx="85" cy="124" rx="11" ry="6.5" fill="var(--scene-plant-2)" transform="rotate(45 85 124)" />
        <ellipse cx="75" cy="115" rx="10" ry="6" fill="var(--scene-plant-2)" transform="rotate(-90 75 115)" />
        <ellipse cx="62" cy="134" rx="9" ry="5.5" fill="var(--scene-plant-2)" transform="rotate(-20 62 134)" />
        <ellipse cx="89" cy="134" rx="9" ry="5.5" fill="var(--scene-plant-1)" transform="rotate(20 89 134)" />
        <ellipse cx="75" cy="126" rx="8" ry="5.5" fill="var(--scene-plant-1)" />
      </g>
      <path d="M57 143h38l-4.5 21c-.4 1.9-2 3.2-3.9 3.2h-21.2c-1.9 0-3.5-1.3-3.9-3.2Z" fill="var(--scene-pot-cream)" />
      <rect x="54" y="137.5" width="44" height="8" rx="4" fill="var(--scene-pot-cream)" />
      <rect x="54" y="143.4" width="44" height="2.2" rx="1.1" fill="#000000" opacity=".06" />

      {/* spiral desk calendar (centre) */}
      <Contact id="plan" cx={203} cy={166} rx={66} />
      <path d="M250 62 277 152h-48Z" fill="var(--scene-accent)" opacity=".8" />
      <path d="M250 62 277 152h-10L244 66Z" fill="#000000" opacity=".08" />
      <rect x="148" y="54" width="108" height="98" rx="10" fill="var(--scene-pages)" />
      <rect x="148" y="54" width="108" height="98" rx="10" fill="none" stroke="var(--scene-shade)" strokeOpacity=".35" />
      {rows.map((y, ri) =>
        cols.map((x, ci) => (
          <rect
            key={`${x}-${y}`}
            x={x}
            y={y}
            width="16"
            height="13"
            rx="4"
            fill={ri === 1 && ci === 2 ? "var(--scene-accent)" : "var(--scene-surface-2)"}
            opacity={ri === 1 && ci === 2 ? ".8" : ".5"}
          />
        ))
      )}
      {ringXs.map((x) => (
        <path key={x} d={`M${x} 60v-9a7 7 0 0 1 14 0v9`} stroke="var(--scene-book-lav)" strokeWidth="5" fill="none" strokeLinecap="round" />
      ))}

      {/* two tabbed books (right) */}
      <Contact id="plan" cx={310} cy={167} rx={48} />
      <Book x={266} y={139} w={88} h={18} fill="var(--scene-book-coral)" />
      <rect x="317" y="148" width="9" height="14" rx="3" fill="var(--scene-book-coral)" />
      <rect x="317" y="148" width="9" height="14" rx="3" fill="#000000" opacity=".12" />
      <Book x={270} y={122} w={80} h={17} fill="var(--scene-book-lav)" />
      <rect x="323" y="130" width="8" height="14" rx="3" fill="var(--scene-book-lav)" />
      <rect x="323" y="130" width="8" height="14" rx="3" fill="#000000" opacity=".12" />

      <g fill="var(--scene-accent)" opacity=".5">
        <path d="m120 60 3 7 7 3-7 3-3 7-3-7-7-3 7-3Z" />
        <circle cx="104" cy="98" r="2.6" />
      </g>
    </svg>
  );
}

/* ── Focus: analog desk clock · mug · potted plant ─────────────────────── */
function FocusScene() {
  const ticks = Array.from({ length: 12 }, (_, i) => (i * 30 * Math.PI) / 180);
  return (
    <svg viewBox="0 0 360 200" role="presentation">
      <SceneDefs id="foc" />

      <ellipse cx="196" cy="98" rx="150" ry="72" fill="var(--scene-bg)" opacity=".55" filter="url(#foc-blur)" />
      <ellipse cx="196" cy="170" rx="146" ry="9" fill="var(--scene-shadow)" opacity=".26" filter="url(#foc-blur)" />

      {/* potted plant (left) in a rounded lavender pot, like the reference */}
      <Contact id="foc" cx={84} cy={167} rx={30} />
      <g>
        <path d="M84 138c0-14 2-24 7-34" stroke="var(--scene-plant-stem)" strokeWidth="3" strokeLinecap="round" fill="none" />
        <ellipse cx="70" cy="112" rx="13" ry="7" fill="var(--scene-plant-1)" transform="rotate(-40 70 112)" />
        <ellipse cx="94" cy="106" rx="14" ry="7.5" fill="var(--scene-plant-2)" transform="rotate(30 94 106)" />
        <ellipse cx="78" cy="96" rx="12" ry="7" fill="var(--scene-plant-2)" transform="rotate(-70 78 96)" />
        <ellipse cx="98" cy="122" rx="12" ry="6" fill="var(--scene-plant-1)" transform="rotate(55 98 122)" />
        <ellipse cx="64" cy="124" rx="11" ry="6" fill="var(--scene-plant-2)" transform="rotate(-55 64 124)" />
        <ellipse cx="86" cy="88" rx="10" ry="6" fill="var(--scene-plant-1)" transform="rotate(-6 86 88)" />
      </g>
      <path d="M61 137c0-3 2.2-5 5.2-5h35.6c3 0 5.2 2 5.2 5 0 17-9.4 28-23 28s-23-11-23-28Z" fill="var(--scene-book-lav)" />
      <ellipse cx="84" cy="136" rx="21" ry="4.4" fill="var(--scene-soil)" />
      <path d="M66 141c1 10 5 17 10 20" stroke="#ffffff" strokeWidth="3" strokeLinecap="round" opacity=".22" fill="none" />

      {/* analog desk clock (centre) */}
      <Contact id="foc" cx={210} cy={168} rx={58} />
      <rect x="177" y="140" width="10" height="27" rx="5" fill="url(#foc-metal)" transform="rotate(16 182 142)" />
      <rect x="233" y="140" width="10" height="27" rx="5" fill="url(#foc-metal)" transform="rotate(-16 238 142)" />
      <circle cx="210" cy="92" r="60" fill="url(#foc-lav)" />
      <path d="M163 66a56 56 0 0 1 34-26" stroke="#ffffff" strokeWidth="5" strokeLinecap="round" opacity=".3" fill="none" />
      <circle cx="210" cy="92" r="47" fill="var(--scene-dial)" />
      <circle cx="210" cy="92" r="47" fill="none" stroke="var(--scene-shade)" strokeOpacity=".3" strokeWidth="1.6" />
      <g stroke="var(--scene-book-lav)" strokeWidth="4.4" strokeLinecap="round">
        {ticks.map((a, i) => (
          <path
            key={i}
            d={`M${210 + Math.sin(a) * 40} ${92 - Math.cos(a) * 40} L${210 + Math.sin(a) * (i % 3 === 0 ? 32 : 35)} ${92 - Math.cos(a) * (i % 3 === 0 ? 32 : 35)}`}
          />
        ))}
      </g>
      <path d="M210 92 191 79" stroke="var(--scene-book-lav)" strokeWidth="6.5" strokeLinecap="round" />
      <path d="M210 92 237 71" stroke="var(--scene-book-lav)" strokeWidth="5" strokeLinecap="round" />
      <circle cx="210" cy="92" r="5.5" fill="var(--scene-accent)" />
      <circle cx="208.4" cy="90.4" r="1.8" fill="#ffffff" opacity=".55" />

      {/* mug (right) */}
      <Contact id="foc" cx={308} cy={167} rx={26} />
      <path d="M286 137h44l-3.6 24c-.5 3.2-3.1 5.5-6.3 5.5h-24.2c-3.2 0-5.8-2.3-6.3-5.5Z" fill="var(--scene-pot-cream)" />
      <ellipse cx="308" cy="137" rx="22" ry="5" fill="var(--scene-pages)" />
      <ellipse cx="308" cy="137.6" rx="17.5" ry="3.4" fill="var(--scene-shade)" opacity=".35" />
      <path d="M291 143c.6 8 2.6 14 5.4 17.6" stroke="#ffffff" strokeWidth="3" strokeLinecap="round" opacity=".3" fill="none" />

      <g fill="var(--scene-accent)" opacity=".45">
        <circle cx="146" cy="58" r="3" />
        <path d="m136 84 2 5 5 2-5 2-2 5-2-5-5-2 5-2Z" />
      </g>
    </svg>
  );
}

/* ── Subjects: open notebook · book stack · pencil ────────────────────── */
function SubjectsScene() {
  return (
    <svg viewBox="0 0 360 200" role="presentation">
      <SceneDefs id="sub" />

      <ellipse cx="190" cy="100" rx="150" ry="72" fill="var(--scene-bg)" opacity=".5" filter="url(#sub-blur)" />
      <ellipse cx="182" cy="170" rx="140" ry="9" fill="var(--scene-shadow)" opacity=".25" filter="url(#sub-blur)" />

      {/* book stack (left) */}
      <Contact id="sub" cx={76} cy={167} rx={50} />
      <Book x={30} y={151} w={88} h={15} fill="var(--scene-book-blue)" />
      <Book x={36} y={137} w={80} h={14} fill="var(--scene-book-pink)" />
      <Book x={42} y={124} w={68} h={13} fill="var(--scene-book-lav)" />

      {/* open notebook (centre) */}
      <Contact id="sub" cx={180} cy={168} rx={78} />
      <g>
        <path d="M104 88 174 78v84l-70 8Z" fill="var(--scene-pages)" />
        <path d="M174 78 252 88l4 82-82-8Z" fill="var(--scene-pages)" />
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
        <rect x="278" y="72" width="17" height="88" rx="6" fill="var(--scene-book-lav)" />
        <rect x="278" y="72" width="17" height="18" rx="6" fill="var(--scene-book-pink)" />
        <path d="M278 160h17l-8.5 16Z" fill="var(--scene-book-cream)" />
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
function SettingsScene() {
  return (
    <svg viewBox="0 0 360 200" role="presentation">
      <SceneDefs id="set" />

      <ellipse cx="180" cy="100" rx="150" ry="72" fill="var(--scene-bg)" opacity=".5" filter="url(#set-blur)" />
      <ellipse cx="182" cy="170" rx="140" ry="9" fill="var(--scene-shadow)" opacity=".25" filter="url(#set-blur)" />

      {/* sheet of notes */}
      <g>
        <rect x="104" y="40" width="132" height="106" rx="10" fill="var(--scene-pages)" />
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
        <rect x="280" y="58" width="16" height="94" rx="6" fill="var(--scene-book-lav)" />
        <path d="M280 152h16l-8 18Z" fill="var(--scene-book-cream)" />
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

const SCENES: Record<SceneVariant, () => React.JSX.Element> = {
  dashboard: DashboardScene,
  planner: PlannerScene,
  focus: FocusScene,
  subjects: SubjectsScene,
  settings: SettingsScene,
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
