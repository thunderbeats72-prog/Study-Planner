"use client";

import React from "react";

/**
 * The study room behind Zen Focus Mode (v25: theme-owned).
 *
 * Inline SVG so it weighs nothing, scales crisply and never flashes in. Every
 * colour is a `--zen-*` token and every theme restates that set: Midnight gets
 * a near-black room, Mint a cool green one, Sunset a warm amber one, and the
 * light themes a *light-tinted* room with dark ink (never white text on white
 * walls). That is the difference between "Zen adapts to the theme" and "a dark
 * overlay is pasted on top of the theme" — this scene used to be fixed navy +
 * violet, which is why Zen looked like a different product.
 *
 * Motion classes (`zen-scene__*`) stay intentionally slow and tiny — a
 * breathing lamp halo and a leaf that barely stirs — and are switched off by
 * the `prefers-reduced-motion` guards in `ui-system.css`.
 */
export default function ZenScene({ className = "" }: { className?: string }) {
  return (
    <div className={`zen-scene ${className}`.trim()} aria-hidden="true">
      <svg
        viewBox="0 0 1200 380"
        preserveAspectRatio="xMidYMax meet"
        role="presentation"
      >
        <defs>
          <linearGradient id="zenLampGlow" x1="0" x2="0" y1="0" y2="1">
            <stop
              offset="0"
              stopColor="var(--zen-lamp-glow)"
              stopOpacity=".85"
            />
            <stop
              offset="1"
              stopColor="color-mix(in srgb, var(--zen-accent) 55%, transparent)"
              stopOpacity=".12"
            />
          </linearGradient>
          <radialGradient id="zenAura" cx="50%" cy="30%" r="70%">
            <stop offset="0" stopColor="var(--zen-accent)" stopOpacity=".38" />
            <stop offset="1" stopColor="var(--zen-accent)" stopOpacity="0" />
          </radialGradient>
          <linearGradient id="zenDesk" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0" stopColor="var(--zen-desk)" />
            <stop
              offset="1"
              stopColor="color-mix(in srgb, var(--zen-bg) 82%, #000000)"
            />
          </linearGradient>
          <linearGradient id="zenShelf" x1="0" x2="1" y1="0" y2="0">
            <stop
              offset="0"
              stopColor="color-mix(in srgb, var(--zen-shelf) 84%, #000000)"
            />
            <stop offset=".5" stopColor="var(--zen-shelf)" />
            <stop
              offset="1"
              stopColor="color-mix(in srgb, var(--zen-shelf) 84%, #000000)"
            />
          </linearGradient>
          <filter id="zenSoft" x="-40%" y="-40%" width="180%" height="180%">
            <feGaussianBlur stdDeviation="14" />
          </filter>
        </defs>

        {/* soft violet aura sitting behind the timer */}
        <ellipse cx="600" cy="150" rx="430" ry="160" fill="url(#zenAura)" />

        {/* back wall shelf with a row of book spines */}
        <g opacity=".5">
          <rect
            x="330"
            y="118"
            width="540"
            height="8"
            rx="4"
            fill="url(#zenShelf)"
          />
          <g>
            <rect
              x="366"
              y="66"
              width="16"
              height="52"
              rx="3"
              fill="var(--zen-book-a)"
            />
            <rect
              x="386"
              y="60"
              width="14"
              height="58"
              rx="3"
              fill="var(--zen-book-b)"
            />
            <rect
              x="404"
              y="70"
              width="18"
              height="48"
              rx="3"
              fill="var(--zen-book-c)"
            />
            <rect
              x="426"
              y="62"
              width="13"
              height="56"
              rx="3"
              fill="color-mix(in srgb, var(--zen-book-b) 70%, var(--zen-book-c))"
            />
            <rect
              x="778"
              y="64"
              width="15"
              height="54"
              rx="3"
              fill="var(--zen-book-b)"
            />
            <rect
              x="797"
              y="72"
              width="18"
              height="46"
              rx="3"
              fill="color-mix(in srgb, var(--zen-book-c) 72%, #ffffff)"
            />
            <rect
              x="819"
              y="60"
              width="14"
              height="58"
              rx="3"
              fill="color-mix(in srgb, var(--zen-book-b) 78%, #ffffff)"
            />
          </g>
        </g>

        {/* desk surface */}
        <path d="M0 300h1200v80H0z" fill="url(#zenDesk)" />
        <path d="M0 298h1200v3H0z" fill="var(--zen-paper)" opacity=".9" />

        {/* stack of books (left) */}
        <g opacity=".92">
          <rect
            x="70"
            y="264"
            width="150"
            height="14"
            rx="4"
            fill="var(--zen-book-a)"
          />
          <rect
            x="82"
            y="248"
            width="136"
            height="15"
            rx="4"
            fill="var(--zen-book-b)"
          />
          <rect
            x="94"
            y="232"
            width="118"
            height="15"
            rx="4"
            fill="var(--zen-book-c)"
          />
          <rect
            x="106"
            y="217"
            width="96"
            height="14"
            rx="4"
            fill="color-mix(in srgb, var(--zen-accent) 76%, #ffffff)"
          />
          <g
            stroke="var(--zen-ink)"
            strokeOpacity=".16"
            strokeWidth="2"
            strokeLinecap="round"
          >
            <path d="M116 239h72M104 255h92M92 271h108" />
          </g>
        </g>

        {/* leaning books (right) */}
        <g opacity=".85">
          <rect
            x="960"
            y="260"
            width="120"
            height="13"
            rx="4"
            fill="var(--zen-book-a)"
            transform="rotate(-3 1020 266)"
          />
          <rect
            x="976"
            y="245"
            width="108"
            height="14"
            rx="4"
            fill="color-mix(in srgb, var(--zen-book-b) 70%, var(--zen-book-c))"
            transform="rotate(-6 1030 252)"
          />
          <rect
            x="990"
            y="231"
            width="94"
            height="13"
            rx="4"
            fill="color-mix(in srgb, var(--zen-book-c) 72%, #ffffff)"
            transform="rotate(-9 1037 237)"
          />
        </g>

        {/* desk lamp (left of centre) */}
        <g>
          <path
            d="M330 300V150"
            stroke="color-mix(in srgb, var(--zen-desk) 70%, var(--zen-book-a))"
            strokeWidth="9"
            strokeLinecap="round"
          />
          <path
            d="M330 152 272 96"
            stroke="color-mix(in srgb, var(--zen-desk) 70%, var(--zen-book-a))"
            strokeWidth="9"
            strokeLinecap="round"
          />
          <circle
            cx="330"
            cy="152"
            r="7"
            fill="color-mix(in srgb, var(--zen-accent) 76%, #ffffff)"
          />
          <path d="M252 76l44 22-22 34-44-22z" fill="var(--zen-book-c)" />
          <path
            d="M242 80l46 23"
            stroke="var(--zen-ink)"
            strokeOpacity=".3"
            strokeWidth="4"
            strokeLinecap="round"
          />
          <ellipse
            className="zen-scene__glow"
            cx="274"
            cy="134"
            rx="124"
            ry="94"
            fill="url(#zenLampGlow)"
            opacity=".42"
          />
          <circle cx="274" cy="108" r="7" fill="var(--zen-lamp)" />
        </g>

        {/* mug + open notebook on the desk (centre) */}
        <g opacity=".9">
          <path
            d="M596 300v-26c0-11 8-19 19-19h34c11 0 19 8 19 19v26Z"
            fill="color-mix(in srgb, var(--zen-desk) 55%, var(--zen-paper))"
          />
          <path
            d="M668 268c11 0 11 18 0 18"
            fill="none"
            stroke="color-mix(in srgb, var(--zen-desk) 55%, var(--zen-paper))"
            strokeWidth="6"
            strokeLinecap="round"
          />
          <path
            d="M590 262h84l-4 8h-76Z"
            fill="color-mix(in srgb, var(--zen-paper) 80%, var(--zen-book-a))"
          />
          <g
            stroke="color-mix(in srgb, var(--zen-accent) 76%, #ffffff)"
            strokeOpacity=".35"
            strokeWidth="3"
            strokeLinecap="round"
          >
            <path d="M612 240c-6-6 6-10 0-16" />
            <path d="M634 240c-6-6 6-10 0-16" />
          </g>
        </g>
        <g opacity=".8">
          <path d="M700 300l14-30h74l-14 30Z" fill="var(--zen-paper)" />
          <path
            d="M714 270h74"
            stroke="var(--zen-book-b)"
            strokeWidth="4"
            strokeLinecap="round"
          />
          <path
            d="M722 282h58"
            stroke="var(--zen-book-a)"
            strokeWidth="4"
            strokeLinecap="round"
          />
        </g>

        {/* plant (right of centre) */}
        <g className="zen-scene__plant">
          <path
            d="M858 300c0-44 4-70 22-96"
            stroke="color-mix(in srgb, var(--zen-plant) 55%, #000000)"
            strokeWidth="6"
            strokeLinecap="round"
          />
          <path
            d="M880 226c-18-10-32-30-23-46 21 3 34 20 23 46z"
            fill="var(--zen-plant)"
          />
          <path
            d="M880 218c16-24 37-27 46-11-10 22-26 28-46 11z"
            fill="var(--zen-plant-2)"
          />
          <path
            d="M872 252c-24-2-39-14-39-30 21-6 37 6 39 30z"
            fill="color-mix(in srgb, var(--zen-plant) 60%, var(--zen-plant-2))"
          />
          <path
            d="M879 243c21-19 42-15 46 2-13 18-30 20-46-2z"
            fill="color-mix(in srgb, var(--zen-plant) 82%, #000000)"
          />
          <path
            d="M812 284h82l-9 16h-64z"
            fill="color-mix(in srgb, var(--zen-desk) 70%, var(--zen-book-a))"
          />
          <rect
            x="808"
            y="280"
            width="90"
            height="10"
            rx="4"
            fill="var(--zen-book-a)"
          />
        </g>

        {/* drifting motes — the only movement that crosses the whole scene */}
        <g className="zen-scene__motes" fill="var(--zen-motes)" opacity=".55">
          <circle cx="470" cy="60" r="2.4" />
          <circle cx="720" cy="42" r="1.8" />
          <circle cx="910" cy="96" r="2.2" />
          <circle cx="180" cy="120" r="1.6" />
          <circle cx="620" cy="90" r="1.5" />
          <path d="m540 110 2 5 5 2-5 2-2 5-2-5-5-2 5-2z" opacity=".8" />
        </g>

        {/* warm pool of lamp light on the desk */}
        <ellipse
          cx="330"
          cy="300"
          rx="210"
          ry="26"
          fill="var(--zen-lamp-glow)"
          opacity=".07"
          filter="url(#zenSoft)"
        />
      </svg>
    </div>
  );
}
