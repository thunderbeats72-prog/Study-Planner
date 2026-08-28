"use client";

import React from "react";

/**
 * Dark, atmospheric study scene for Zen Focus Mode.
 * Inline SVG so it weighs nothing, scales crisply, and adopts the
 * Zen palette (deep navy + soft violet + warm lamp) in every theme.
 */
export default function ZenScene({ className = "" }: { className?: string }) {
  return (
    <div className={`zen-scene ${className}`.trim()} aria-hidden="true">
      <svg viewBox="0 0 1200 340" preserveAspectRatio="xMidYMax meet" role="presentation">
        <defs>
          <linearGradient id="zenLampGlow" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0" stopColor="#ffd9a0" stopOpacity=".9" />
            <stop offset="1" stopColor="#b79cf5" stopOpacity=".15" />
          </linearGradient>
          <radialGradient id="zenAura" cx="50%" cy="30%" r="70%">
            <stop offset="0" stopColor="#7c6cf6" stopOpacity=".5" />
            <stop offset="1" stopColor="#7c6cf6" stopOpacity="0" />
          </radialGradient>
        </defs>

        {/* soft purple aura behind the timer */}
        <ellipse cx="600" cy="120" rx="420" ry="150" fill="url(#zenAura)" />

        {/* shelf silhouette */}
        <path d="M0 300h1200v2H0z" fill="#0d1026" />

        {/* stack of books (left) */}
        <g opacity=".92">
          <rect x="70" y="262" width="150" height="14" rx="4" fill="#3b3567" />
          <rect x="82" y="246" width="136" height="15" rx="4" fill="#4c4391" />
          <rect x="94" y="230" width="118" height="15" rx="4" fill="#6b5dc4" />
          <rect x="106" y="215" width="96" height="14" rx="4" fill="#8b7cf0" />
          <path d="M116 237h72M104 253h92M92 269h108" stroke="#ffffff" strokeOpacity=".14" strokeWidth="2" strokeLinecap="round" />
        </g>

        {/* leaning books (right) */}
        <g opacity=".85">
          <rect x="960" y="258" width="120" height="13" rx="4" fill="#3b3567" transform="rotate(-3 1020 264)" />
          <rect x="976" y="243" width="108" height="14" rx="4" fill="#54469e" transform="rotate(-6 1030 250)" />
          <rect x="990" y="229" width="94" height="13" rx="4" fill="#7a68d8" transform="rotate(-9 1037 235)" />
        </g>

        {/* desk lamp (left of center) */}
        <g>
          <path d="M330 300V150" stroke="#2c2a52" strokeWidth="9" strokeLinecap="round" />
          <path d="M330 152 272 96" stroke="#2c2a52" strokeWidth="9" strokeLinecap="round" />
          <circle cx="330" cy="152" r="7" fill="#8b7cf0" />
          <path d="M252 76l44 22-22 34-44-22z" fill="#6b5dc4" />
          <path d="M242 80l46 23" stroke="#ffffff" strokeOpacity=".25" strokeWidth="4" strokeLinecap="round" />
          <ellipse cx="274" cy="132" rx="120" ry="90" fill="url(#zenLampGlow)" opacity=".5" />
          <circle cx="274" cy="108" r="7" fill="#ffe9bd" />
        </g>

        {/* plant (right of center) */}
        <g>
          <path d="M858 300c0-44 4-70 22-96" stroke="#2e6b52" strokeWidth="6" strokeLinecap="round" />
          <path d="M880 226c-18-10-32-30-23-46 21 3 34 20 23 46z" fill="#3fae7f" />
          <path d="M880 218c16-24 37-27 46-11-10 22-26 28-46 11z" fill="#55c797" />
          <path d="M872 252c-24-2-39-14-39-30 21-6 37 6 39 30z" fill="#46b788" />
          <path d="M879 243c21-19 42-15 46 2-13 18-30 20-46-2z" fill="#3aa578" />
          <path d="M812 284h82l-9 16h-64z" fill="#2c2a52" />
          <rect x="808" y="280" width="90" height="10" rx="4" fill="#3b3567" />
        </g>

        {/* drifting stars/sparkles */}
        <g fill="#b9adf7" opacity=".7">
          <circle cx="470" cy="60" r="2.4" />
          <circle cx="720" cy="42" r="1.8" />
          <circle cx="910" cy="96" r="2.2" />
          <circle cx="180" cy="120" r="1.6" />
          <circle cx="620" cy="90" r="1.5" />
          <path d="m540 110 2 5 5 2-5 2-2 5-2-5-5-2 5-2z" opacity=".8" />
        </g>
      </svg>
    </div>
  );
}
