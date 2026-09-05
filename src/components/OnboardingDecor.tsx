"use client";

import React, { useMemo } from "react";
import type { StaticImageData } from "next/image";
import obLeftDark from "../app/onboarding-left-decor-dark.webp";
import obLeftMint from "../app/onboarding-left-decor-mint.webp";
import obLeftNebula from "../app/onboarding-left-decor-nebula.webp";
import obLeftObsidian from "../app/onboarding-left-decor-obsidian.webp";
import obLeftSilver from "../app/onboarding-left-decor-silver.webp";
import obLeftSunset from "../app/onboarding-left-decor-sunset.webp";
import obRightDark from "../app/onboarding-right-decor-dark.webp";
import obRightMint from "../app/onboarding-right-decor-mint.webp";
import obRightNebula from "../app/onboarding-right-decor-nebula.webp";
import obRightObsidian from "../app/onboarding-right-decor-obsidian.webp";
import obRightSilver from "../app/onboarding-right-decor-silver.webp";
import obRightSunset from "../app/onboarding-right-decor-sunset.webp";

/** Theme-aware still-life pair for the onboarding stage. The silver
 *  composition doubles for the editorial paper theme. Loaded through
 *  next/dynamic so non-bundler runtimes never evaluate binary imports. */
const OB_DECOR: Record<string, { left: StaticImageData; right: StaticImageData }> = {
  dark: { left: obLeftDark, right: obRightDark },
  mint: { left: obLeftMint, right: obRightMint },
  nebula: { left: obLeftNebula, right: obRightNebula },
  obsidian: { left: obLeftObsidian, right: obRightObsidian },
  sunset: { left: obLeftSunset, right: obRightSunset },
  silver: { left: obLeftSilver, right: obRightSilver },
};

export default function OnboardingDecor() {
  const decor = useMemo(() => {
    const cls = typeof document !== "undefined" ? document.body.className : "";
    for (const key of ["dark", "mint", "nebula", "obsidian", "sunset"]) {
      if (cls.includes(`theme-${key}`)) return OB_DECOR[key];
    }
    return OB_DECOR.silver;
  }, []);

  return (
    <>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img className="ob-decor ob-decor--left" src={decor.left.src} alt="" aria-hidden="true" draggable={false} />
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img className="ob-decor ob-decor--right" src={decor.right.src} alt="" aria-hidden="true" draggable={false} />
    </>
  );
}
