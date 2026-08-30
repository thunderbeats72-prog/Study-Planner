"use client";

import React from "react";

/**
 * Step illustrations for the onboarding wizard.
 *
 * The platform's page illustrations (StudyScene / ZenScene) are themed
 * inline SVGs — these mini-scenes follow the same idea: one component, eight
 * variants, drawn with `currentColor` strokes over an accent-tinted tile, so
 * every step gets a small "image" that follows the active theme for free.
 * All variants are `aria-hidden` decoration.
 *
 *   you      → desk lamp (echoes the dashboard study-lamp scene)
 *   level    → graduation cap
 *   course   → open book under a magnifier
 *   details  → clipboard with a pencil
 *   syllabus → stack of books with a bookmark
 *   style    → lightbulb (learning style)
 *   rhythm   → alarm clock (study hours)
 *   review   → checklist with a flag
 */

export type OnboardingArtVariant =
  | "you"
  | "level"
  | "course"
  | "details"
  | "syllabus"
  | "style"
  | "rhythm"
  | "review";

export default function OnboardingArt({ variant }: { variant: OnboardingArtVariant }) {
  return (
    <span className="ob-step-art" aria-hidden="true">
      <svg width="56" height="44" viewBox="0 0 64 48" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
        {variant === "you" && (
          <>
            {/* desk lamp with a soft glow */}
            <path d="M20 9h24l-4 10H24L20 9z" />
            <path d="M32 19v10" />
            <path d="M24 32h16" />
            <path d="M20 36h24" />
            <circle cx="32" cy="23" r="2.6" fill="var(--accent)" stroke="none" opacity=".9" />
            <path d="M27 21l-4.5 6M37 21l4.5 6" opacity=".55" />
          </>
        )}
        {variant === "level" && (
          <>
            {/* graduation cap */}
            <path d="M32 8L6 21l26 13 26-13-26-13z" />
            <path d="M14 27v10c0 3 8 5.5 18 5.5s18-2.5 18-5.5V27" opacity=".9" />
            <path d="M58 21v9" />
          </>
        )}
        {variant === "course" && (
          <>
            {/* open book under a magnifier */}
            <path d="M32 16c-4.5-3.5-9.5-3.5-14-2v19c4.5-1.5 9.5-1.5 14 2 4.5-3.5 9.5-3.5 14-2V14c-4.5-1.5-9.5-1.5-14 2z" />
            <path d="M32 16v19" />
            <circle cx="45" cy="30" r="8.5" />
            <path d="M51.5 36.5L60 45" />
          </>
        )}
        {variant === "details" && (
          <>
            {/* clipboard with a pencil */}
            <rect x="12" y="8" width="26" height="36" rx="4" />
            <rect x="20" y="4" width="10" height="8" rx="3" />
            <path d="M18 22h14M18 28h14M18 34h8" opacity=".75" />
            <path d="M40 42l14-14 5 5-14 14-6 1 1-6z" />
          </>
        )}
        {variant === "syllabus" && (
          <>
            {/* stack of books with a bookmark */}
            <path d="M14 36h36" />
            <path d="M17 28h30v8H17z" />
            <path d="M20 20h24v8H20z" />
            <path d="M23 12h18v8H23z" />
            <path d="M23 12v8" opacity=".6" />
            <path d="M34 12v10l-3-2.4-3 2.4" fill="var(--accent)" stroke="none" opacity=".85" />
          </>
        )}
        {variant === "style" && (
          <>
            {/* lightbulb */}
            <path d="M24 18a8 8 0 1 1 10 6.5V29H22v-4.5A8 8 0 0 1 24 18z" />
            <path d="M22 33h12M24 38h8" />
            <path d="M12 20H8M56 20h-4M32 6v-4" opacity=".6" />
          </>
        )}
        {variant === "rhythm" && (
          <>
            {/* alarm clock */}
            <circle cx="30" cy="26" r="14" />
            <path d="M30 19v7l5 3.5" />
            <path d="M30 9v-3M30 46v-3M13 26h-3M50 26h-3" opacity=".6" />
            <path d="M24 13l-3-5M36 13l3-5" opacity=".9" />
          </>
        )}
        {variant === "review" && (
          <>
            {/* checklist with a flag */}
            <rect x="8" y="10" width="34" height="34" rx="4" />
            <path d="M14 22l4 4 8-9M14 33l4 4 8-9" opacity=".9" />
            <path d="M48 8v36" />
            <path d="M48 8c4 3.5 8 3.5 12 0-3.2 6.5-8 6.5-12 0z" fill="var(--accent)" stroke="none" opacity=".85" />
          </>
        )}
      </svg>
    </span>
  );
}
