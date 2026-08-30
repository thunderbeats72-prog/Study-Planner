"use client";

import React from "react";

/**
 * Atmospheric study scene for Zen Focus Mode.
 *
 * Inline SVG so it weighs nothing, scales crisply and never flashes in. The
 * room keeps its darkness in every theme — that is what makes Zen immersive —
 * but its HUE is not fixed: every surface is painted from `--zen-*` custom
 * properties (defined once on `.zen` in study-planner-redesign.css), which are
 * themselves mixes of the active theme's `--accent` / `--success-accent`.
 * Switch to the sunset theme and the books, desk and aura turn warm orange;
 * under mint they turn teal. The lamp stays a warm lamp, and the plant stays
 * a plant, in every room.
 *
 * Motion classes (`zen-scene__*`) are intentionally slow and tiny — a
 * breathing lamp halo and a leaf that barely stirs — and are disabled by the
 * reduced-motion guard in `study-planner-redesign.css`.
 */
export default function ZenScene({ className = "" }: { className?: string }) {
  return (
    <div className={`zen-scene ${className}`.trim()} aria-hidden="true">
      <svg viewBox="0 0 1200 380" preserveAspectRatio="xMidYMax meet" role="presentation">
        <defs>
          {/* Warm lamp core; the fade-out follows the theme accent so the
              light spills in the room's colour. */}
          <linearGradient id="zenLampGlow" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0" stopColor="#ffd9a0" stopOpacity=".85" />
            <stop offset="1" stopColor="var(--zen-lamp-fade)" />
          </linearGradient>
          <radialGradient id="zenAura" cx="50%" cy="30%" r="70%">
            <stop offset="0" stopColor="var(--zen-aura)" stopOpacity=".38" />
            <stop offset="1" stopColor="var(--zen-aura)" stopOpacity="0" />
          </radialGradient>
          <linearGradient id="zenDesk" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0" stopColor="var(--zen-desk-1)" />
            <stop offset="1" stopColor="var(--zen-desk-2)" />
          </linearGradient>
          <linearGradient id="zenShelf" x1="0" x2="1" y1="0" y2="0">
            <stop offset="0" stopColor="var(--zen-shelf-1)" />
            <stop offset=".5" stopColor="var(--zen-shelf-2)" />
            <stop offset="1" stopColor="var(--zen-shelf-1)" />
          </linearGradient>
          <filter id="zenSoft" x="-40%" y="-40%" width="180%" height="180%">
            <feGaussianBlur stdDeviation="14" />
          </filter>
        </defs>

        {/* soft aura sitting behind the timer — the theme's colour */}
        <ellipse cx="600" cy="150" rx="430" ry="160" fill="url(#zenAura)" />

        {/* back wall shelf with a row of book spines */}
        <g opacity=".5">
          <rect x="330" y="118" width="540" height="8" rx="4" fill="url(#zenShelf)" />
          <g>
            <rect x="366" y="66" width="16" height="52" rx="3" fill="var(--zen-book-1)" />
            <rect x="386" y="60" width="14" height="58" rx="3" fill="var(--zen-book-2)" />
            <rect x="404" y="70" width="18" height="48" rx="3" fill="var(--zen-book-3)" />
            <rect x="426" y="62" width="13" height="56" rx="3" fill="var(--zen-book-2)" />
            <rect x="778" y="64" width="15" height="54" rx="3" fill="var(--zen-book-2)" />
            <rect x="797" y="72" width="18" height="46" rx="3" fill="var(--zen-book-3)" />
            <rect x="819" y="60" width="14" height="58" rx="3" fill="var(--zen-book-2)" />
          </g>
        </g>

        {/* desk surface */}
        <path d="M0 300h1200v80H0z" fill="url(#zenDesk)" />
        <path d="M0 298h1200v3H0z" fill="var(--zen-desk-edge)" opacity=".9" />

        {/* stack of books (left) */}
        <g opacity=".92">
          <rect x="70" y="264" width="150" height="14" rx="4" fill="var(--zen-book-1)" />
          <rect x="82" y="248" width="136" height="15" rx="4" fill="var(--zen-book-2)" />
          <rect x="94" y="232" width="118" height="15" rx="4" fill="var(--zen-book-3)" />
          <rect x="106" y="217" width="96" height="14" rx="4" fill="var(--zen-book-4)" />
          <g stroke="#ffffff" strokeOpacity=".13" strokeWidth="2" strokeLinecap="round">
            <path d="M116 239h72M104 255h92M92 271h108" />
          </g>
        </g>

        {/* leaning books (far right): moved outward to make room for the
            little desk clock that completes the shared workspace language. */}
        <g opacity=".85" transform="translate(80 0)">
          <rect x="960" y="260" width="120" height="13" rx="4" fill="var(--zen-book-1)" transform="rotate(-3 1020 266)" />
          <rect x="976" y="245" width="108" height="14" rx="4" fill="var(--zen-book-2)" transform="rotate(-6 1030 252)" />
          <rect x="990" y="231" width="94" height="13" rx="4" fill="var(--zen-book-3)" transform="rotate(-9 1037 237)" />
        </g>

        {/* desk lamp (left of centre) — always a warm lamp */}
        <g>
          <path d="M330 300V150" stroke="var(--zen-metal)" strokeWidth="9" strokeLinecap="round" />
          <path d="M330 152 272 96" stroke="var(--zen-metal)" strokeWidth="9" strokeLinecap="round" />
          <circle cx="330" cy="152" r="7" fill="var(--zen-metal-hi)" />
          <path d="M252 76l44 22-22 34-44-22z" fill="var(--zen-book-3)" />
          <path d="M242 80l46 23" stroke="#ffffff" strokeOpacity=".24" strokeWidth="4" strokeLinecap="round" />
          <ellipse className="zen-scene__glow" cx="274" cy="134" rx="124" ry="94" fill="url(#zenLampGlow)" opacity=".42" />
          <circle cx="274" cy="108" r="7" fill="#ffe9bd" />
        </g>

        {/* mug + open notebook on the desk (centre) */}
        <g opacity=".9">
          <path d="M596 300v-26c0-11 8-19 19-19h34c11 0 19 8 19 19v26Z" fill="var(--zen-mug)" />
          <path d="M668 268c11 0 11 18 0 18" fill="none" stroke="var(--zen-mug)" strokeWidth="6" strokeLinecap="round" />
          <path d="M590 262h84l-4 8h-76Z" fill="var(--zen-mug-rim)" />
          <g stroke="var(--zen-book-4)" strokeOpacity=".35" strokeWidth="3" strokeLinecap="round">
            <path d="M612 240c-6-6 6-10 0-16" />
            <path d="M634 240c-6-6 6-10 0-16" />
          </g>
        </g>
        <g opacity=".8">
          <path d="M700 300l14-30h74l-14 30Z" fill="var(--zen-note)" />
          <path d="M714 270h74" stroke="var(--zen-book-2)" strokeWidth="4" strokeLinecap="round" />
          <path d="M722 282h58" stroke="var(--zen-book-1)" strokeWidth="4" strokeLinecap="round" />
        </g>

        {/* plant (right of centre) — a plant in every theme */}
        <g className="zen-scene__plant">
          <path d="M858 300c0-44 4-70 22-96" stroke="var(--zen-plant-stem)" strokeWidth="6" strokeLinecap="round" />
          <path d="M880 226c-18-10-32-30-23-46 21 3 34 20 23 46z" fill="var(--zen-plant-1)" />
          <path d="M880 218c16-24 37-27 46-11-10 22-26 28-46 11z" fill="var(--zen-plant-2)" />
          <path d="M872 252c-24-2-39-14-39-30 21-6 37 6 39 30z" fill="var(--zen-plant-3)" />
          <path d="M879 243c21-19 42-15 46 2-13 18-30 20-46-2z" fill="var(--zen-plant-4)" />
          <path d="M812 284h82l-9 16h-64z" fill="var(--zen-pot)" />
          <rect x="808" y="280" width="90" height="10" rx="4" fill="var(--zen-pot-rim)" />
        </g>

        {/* Table clock: the focus-room object is now part of Zen too. Its
            rim, face and hands all use live theme tokens instead of a fixed
            colour, so a theme change reaches the room as well as the pages. */}
        <g className="zen-scene__clock" opacity=".93">
          <ellipse cx="966" cy="300" rx="50" ry="7" fill="var(--zen-clock-shadow)" opacity=".42" />
          <path d="M942 282l-10 18M990 282l10 18" stroke="var(--zen-clock-rim)" strokeWidth="7" strokeLinecap="round" />
          <circle cx="966" cy="252" r="35" fill="var(--zen-clock-rim)" />
          <circle cx="966" cy="252" r="28" fill="var(--zen-clock-face)" stroke="var(--zen-clock-mark)" strokeOpacity=".24" strokeWidth="2" />
          <g stroke="var(--zen-clock-mark)" strokeWidth="3" strokeLinecap="round" opacity=".78">
            <path d="M966 230v5M966 269v5M944 252h5M983 252h5" />
            <path d="m950 236 3 3M979 265l3 3M982 236l-3 3M953 265l-3 3" />
          </g>
          <g stroke="var(--zen-clock-hand)" strokeWidth="4" strokeLinecap="round">
            <path d="M966 252v-15" />
            <path d="m966 252 14 9" />
          </g>
          <circle cx="966" cy="252" r="4" fill="var(--zen-clock-mark)" />
          <path d="M936 296h60" stroke="var(--zen-clock-rim)" strokeWidth="7" strokeLinecap="round" />
        </g>

        {/* drifting motes — the only movement that crosses the whole scene */}
        <g className="zen-scene__motes" fill="var(--zen-mote)" opacity=".55">
          <circle cx="470" cy="60" r="2.4" />
          <circle cx="720" cy="42" r="1.8" />
          <circle cx="910" cy="96" r="2.2" />
          <circle cx="180" cy="120" r="1.6" />
          <circle cx="620" cy="90" r="1.5" />
          <path d="m540 110 2 5 5 2-5 2-2 5-2-5-5-2 5-2z" opacity=".8" />
        </g>

        {/* warm pool of lamp light on the desk */}
        <ellipse cx="330" cy="300" rx="210" ry="26" fill="#ffd9a0" opacity=".07" filter="url(#zenSoft)" />
      </svg>
    </div>
  );
}
