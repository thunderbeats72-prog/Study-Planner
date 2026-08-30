"use client";

import React from "react";
import {
  DashboardScene,
  GraduationScene,
  CourseScene,
  DetailsScene,
  SyllabusScene,
  StyleScene,
  FocusScene,
  ReviewScene,
} from "./StudyScene";

/**
 * Step illustrations for the onboarding wizard.
 *
 * These are NOT separate mini-icons — each step renders the exact same
 * StudyScene components that paint the Dashboard / Planner / Focus / Subjects
 * / Settings page headers, so the onboarding art is pixel-identical in style
 * to the platform's own illustrations: the shared 360×200 desk canvas, the
 * theme-aware `--scene-*` gradient tokens, the blurred contact shadows, the
 * ambient glow and the accent sparkles.
 *
 * Because every scene paints from the body-scoped `--scene-*` tokens, each
 * step illustration re-colours automatically with the active theme (mint,
 * sunset, silver-lavender, obsidian, nebula…) — the same way the page headers
 * do.
 *
 * Step → scene:
 *   you      → desk lamp  (Dashboard scene)
 *   level    → graduation cap + books + plant
 *   course   → open book + magnifier + pencil
 *   details  → clipboard + pencil + plant
 *   syllabus → book stack + bookmark + plant
 *   style    → glowing lightbulb + books
 *   rhythm   → desk clock + mug + plant (Focus scene)
 *   review   → checklist board + flag + books
 *
 * All variants are `aria-hidden` decoration; the presentation chrome (glow
 * backdrop, gentle float, responsive size) lives in ui-polish.css.
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
      {variant === "you" && <DashboardScene />}
      {variant === "level" && <GraduationScene />}
      {variant === "course" && <CourseScene />}
      {variant === "details" && <DetailsScene />}
      {variant === "syllabus" && <SyllabusScene />}
      {variant === "style" && <StyleScene />}
      {variant === "rhythm" && <FocusScene />}
      {variant === "review" && <ReviewScene />}
    </span>
  );
}
