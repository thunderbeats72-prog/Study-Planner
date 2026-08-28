"use client";

import React from "react";

/**
 * Small inline illustration used as a visual anchor in the reference UI.
 * It intentionally uses CSS custom properties instead of a raster asset so
 * the lamp/books/plant automatically follow every Study Planner theme,
 * remain crisp on high-DPI screens, and never require a network request.
 */
export default function StudyScene({ compact = false, className = "" }: { compact?: boolean; className?: string }) {
  return (
    <div className={`study-scene${compact ? " study-scene--compact" : ""} ${className}`.trim()} aria-hidden="true">
      <svg viewBox="0 0 360 190" role="presentation">
        <defs>
          <linearGradient id="sceneDesk" x1="0" x2="1" y1="0" y2="1">
            <stop offset="0" stopColor="var(--scene-surface-2)" />
            <stop offset="1" stopColor="var(--scene-surface-1)" />
          </linearGradient>
          <linearGradient id="sceneLamp" x1="0" x2="1" y1="0" y2="1">
            <stop offset="0" stopColor="var(--scene-accent-soft)" />
            <stop offset="1" stopColor="var(--scene-accent)" />
          </linearGradient>
          <linearGradient id="sceneBook" x1="0" x2="1">
            <stop offset="0" stopColor="var(--scene-book-1)" />
            <stop offset="1" stopColor="var(--scene-book-2)" />
          </linearGradient>
          <filter id="sceneBlur" x="-30%" y="-30%" width="160%" height="160%">
            <feGaussianBlur stdDeviation="8" />
          </filter>
        </defs>

        <ellipse cx="188" cy="168" rx="134" ry="13" fill="var(--scene-shadow)" opacity=".34" filter="url(#sceneBlur)" />
        <ellipse cx="188" cy="166" rx="126" ry="9" fill="var(--scene-shadow)" opacity=".16" />

        {/* warm study glow */}
        <ellipse cx="258" cy="67" rx="72" ry="54" fill="var(--scene-glow)" opacity=".35" filter="url(#sceneBlur)" />

        {/* books */}
        <g transform="translate(55 117) rotate(-1)">
          <rect x="0" y="31" width="122" height="12" rx="5" fill="var(--scene-book-2)" opacity=".9" />
          <rect x="8" y="18" width="112" height="14" rx="5" fill="url(#sceneBook)" />
          <rect x="17" y="5" width="96" height="15" rx="5" fill="var(--scene-book-3)" />
          <path d="M25 8h76" stroke="rgba(255,255,255,.34)" strokeWidth="2" strokeLinecap="round" />
          <path d="M12 22h92" stroke="rgba(255,255,255,.18)" strokeWidth="2" strokeLinecap="round" />
        </g>

        {/* desk */}
        <path d="M28 151h250c5 0 8 4 5 7H22c-4-1-1-7 6-7Z" fill="url(#sceneDesk)" />
        <rect x="42" y="158" width="9" height="21" rx="4" fill="var(--scene-surface-2)" />
        <rect x="258" y="158" width="9" height="21" rx="4" fill="var(--scene-surface-2)" />

        {/* lamp */}
        <g className="study-scene__lamp">
          <path d="M277 150V66" stroke="var(--scene-ink)" strokeWidth="6" strokeLinecap="round" />
          <path d="M277 67 225 30" stroke="var(--scene-ink)" strokeWidth="6" strokeLinecap="round" />
          <circle cx="277" cy="67" r="5" fill="var(--scene-accent)" />
          <path d="M210 18 244 35 226 60 193 43Z" fill="url(#sceneLamp)" />
          <path d="M203 20 237 37" stroke="rgba(255,255,255,.42)" strokeWidth="3" strokeLinecap="round" />
          <ellipse cx="219" cy="53" rx="37" ry="20" fill="var(--scene-accent-soft)" opacity=".2" filter="url(#sceneBlur)" />
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
    </div>
  );
}
