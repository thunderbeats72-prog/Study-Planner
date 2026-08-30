"use client";

import React, { useId } from "react";

/**
 * Large, theme-aware editorial scenes for the onboarding wizard.
 *
 * These are intentionally decorative only: the existing wizard sequence,
 * fields, controls and validation do not depend on them. Keeping the art
 * inline means it stays crisp at every viewport, follows the selected theme,
 * and avoids a network dependency during setup.
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

type ArtProps = { variant: OnboardingArtVariant };

function Sparkles() {
  return <>
    <path d="M73 46v12M67 52h12M286 38v14M279 45h14M315 83v9M311 87h8" stroke="var(--accent-light)" strokeWidth="2.4" opacity=".55" />
    <circle cx="93" cy="78" r="3" fill="var(--accent-light)" opacity=".45" />
    <circle cx="272" cy="103" r="2.5" fill="var(--accent-light)" opacity=".42" />
  </>;
}

function Books({ filterId, gradientId }: { filterId: string; gradientId: string }) {
  return <g filter={`url(#${filterId})`}>
    <path d="M77 119c0-5 4-9 9-9h69c5 0 9 4 9 9v8H77v-8Z" fill={`url(#${gradientId})`} />
    <path d="M82 113h81c3 0 5 2 5 5v3H78v-3c0-3 2-5 4-5Z" fill="var(--accent-light)" opacity=".62" />
    <path d="M88 121h70" stroke="var(--ob-art-paper)" strokeOpacity=".56" strokeWidth="2" />
    <path d="M91 99c0-5 4-9 9-9h64c5 0 9 4 9 9v9H91v-9Z" fill="var(--ob-art-soft)" />
    <path d="M95 97h74" stroke="var(--ob-art-paper)" strokeOpacity=".62" strokeWidth="2" />
    <path d="M107 80c0-5 4-8 9-8h53c5 0 8 3 8 8v8h-70v-8Z" fill={`url(#${gradientId})`} opacity=".9" />
    <path d="M111 79h62" stroke="var(--ob-art-paper)" strokeOpacity=".54" strokeWidth="2" />
  </g>;
}

function TinyPlant({ filterId }: { filterId: string }) {
  return <g filter={`url(#${filterId})`}>
    <path d="M267 115h39l-5 19h-29l-5-19Z" fill="var(--ob-art-paper)" stroke="var(--accent)" strokeOpacity=".2" />
    <path d="M286 115v-24" stroke="var(--ob-art-leaf-stem)" strokeWidth="2.4" />
    <path d="M285 102c-18-4-17-18-15-23 13 2 18 10 15 23Z" fill="var(--ob-art-leaf)" />
    <path d="M287 98c4-16 16-17 22-16-1 12-8 18-22 16Z" fill="var(--ob-art-leaf-deep)" />
    <path d="M284 110c-12-2-16-10-15-16 10 1 16 5 15 16Z" fill="var(--ob-art-leaf-light)" />
  </g>;
}

export default function OnboardingArt({ variant }: ArtProps) {
  const rawId = useId();
  const id = `ob-art-${rawId.replace(/[^a-zA-Z0-9_-]/g, "")}`;

  return (
    <span className={`ob-step-art ob-step-art--${variant}`} aria-hidden="true">
      <svg viewBox="0 0 360 170" fill="none" role="presentation">
        <defs>
          <linearGradient id={`${id}-purple`} x1="76" y1="35" x2="241" y2="140" gradientUnits="userSpaceOnUse">
            <stop stopColor="var(--accent-light)" />
            <stop offset="1" stopColor="var(--accent)" />
          </linearGradient>
          <linearGradient id={`${id}-wash`} x1="78" y1="30" x2="282" y2="154" gradientUnits="userSpaceOnUse">
            <stop stopColor="var(--accent-light)" stopOpacity=".2" />
            <stop offset="1" stopColor="var(--accent)" stopOpacity=".055" />
          </linearGradient>
          <filter id={`${id}-shadow`} x="-20%" y="-25%" width="140%" height="160%">
            <feDropShadow dx="0" dy="7" stdDeviation="5" floodColor="var(--accent)" floodOpacity=".17" />
          </filter>
        </defs>

        {/* Gentle studio wash shared by each illustration. */}
        <path d="M97 130c-15-29 1-72 36-88 34-16 54 7 83 6 31-1 65-22 84 9 24 40-22 84-67 86l-104 2c-16 0-25-4-32-15Z" fill={`url(#${id}-wash)`} />
        <ellipse cx="180" cy="139" rx="121" ry="5" fill="var(--accent)" opacity=".1" />
        <Sparkles />

        {variant === "you" && <>
          <Books filterId={`${id}-shadow`} gradientId={`${id}-purple`} />
          <g filter={`url(#${id}-shadow)`}>
            <rect x="160" y="47" width="77" height="85" rx="10" fill="var(--ob-art-paper)" stroke={`url(#${id}-purple)`} strokeWidth="4" />
            <path d="M160 69h77" stroke={`url(#${id}-purple)`} strokeWidth="5" />
            <path d="M180 39v18M217 39v18" stroke="var(--accent)" strokeWidth="5" strokeLinecap="round" />
            <rect x="175" y="80" width="12" height="10" rx="3" fill="var(--accent-light)" opacity=".3" />
            <rect x="193" y="80" width="12" height="10" rx="3" fill="var(--accent-light)" opacity=".3" />
            <rect x="211" y="80" width="12" height="10" rx="3" fill="var(--accent-light)" opacity=".3" />
            <rect x="175" y="97" width="12" height="10" rx="3" fill="var(--accent-light)" opacity=".26" />
            <rect x="193" y="97" width="12" height="10" rx="3" fill="var(--accent-light)" opacity=".26" />
            <rect x="211" y="97" width="12" height="10" rx="3" fill="var(--accent-light)" opacity=".26" />
            <rect x="175" y="114" width="30" height="7" rx="3.5" fill="var(--accent)" opacity=".22" />
          </g>
          <TinyPlant filterId={`${id}-shadow`} />
        </>}

        {variant === "level" && <>
          <Books filterId={`${id}-shadow`} gradientId={`${id}-purple`} />
          <g filter={`url(#${id}-shadow)`}>
            <path d="m189 41 65 30-65 30-65-30 65-30Z" fill={`url(#${id}-purple)`} />
            <path d="m147 88 9 32c15 13 50 15 67 0l9-32-43 20-42-20Z" fill="var(--accent)" opacity=".84" />
            <path d="M254 72v31" stroke="var(--accent)" strokeWidth="4" strokeLinecap="round" />
            <circle cx="254" cy="108" r="5" fill="var(--ob-art-warm)" />
            <path d="m156 72 33 15 33-15-33-15-33 15Z" fill="var(--ob-art-paper)" opacity=".24" />
          </g>
          <TinyPlant filterId={`${id}-shadow`} />
        </>}

        {variant === "course" && <>
          <Books filterId={`${id}-shadow`} gradientId={`${id}-purple`} />
          <g filter={`url(#${id}-shadow)`}>
            <path d="M152 63c21-12 40-11 57 3v56c-17-12-36-13-57-2V63Z" fill="var(--ob-art-paper)" stroke={`url(#${id}-purple)`} strokeWidth="3.5" />
            <path d="M209 66c18-14 38-15 57-3v57c-19-11-38-10-57 2V66Z" fill="var(--ob-art-paper)" stroke={`url(#${id}-purple)`} strokeWidth="3.5" />
            <path d="M164 80h31M164 91h26M222 80h31M222 91h25" stroke="var(--accent)" strokeWidth="3" strokeLinecap="round" opacity=".28" />
            <circle cx="255" cy="55" r="22" fill="var(--ob-art-paper)" stroke={`url(#${id}-purple)`} strokeWidth="5" />
            <path d="m270 71 18 21" stroke="var(--accent)" strokeWidth="6" strokeLinecap="round" />
          </g>
          <TinyPlant filterId={`${id}-shadow`} />
        </>}

        {variant === "details" && <>
          <Books filterId={`${id}-shadow`} gradientId={`${id}-purple`} />
          <g filter={`url(#${id}-shadow)`}>
            <rect x="160" y="43" width="76" height="91" rx="11" fill="var(--ob-art-paper)" stroke={`url(#${id}-purple)`} strokeWidth="4" />
            <rect x="180" y="34" width="37" height="19" rx="7" fill={`url(#${id}-purple)`} />
            <path d="m177 74 6 6 10-12M177 96l6 6 10-12M177 118l6 6 10-12" stroke="var(--accent)" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round" />
            <path d="M202 75h19M202 97h19M202 119h14" stroke="var(--accent)" strokeOpacity=".26" strokeWidth="4" strokeLinecap="round" />
            <path d="m247 119 25-48 11 6-25 48-15 5 4-11Z" fill="var(--ob-art-soft)" stroke="var(--accent)" strokeWidth="2.5" />
            <path d="m272 71 6-11 11 6-6 11-11-6Z" fill="var(--ob-art-warm)" />
          </g>
          <TinyPlant filterId={`${id}-shadow`} />
        </>}

        {variant === "syllabus" && <>
          <g filter={`url(#${id}-shadow)`}>
            <path d="M112 119c0-5 4-9 9-9h113c5 0 9 4 9 9v10H112v-10Z" fill={`url(#${id}-purple)`} />
            <path d="M121 95c0-6 4-10 10-10h105c6 0 10 4 10 10v13H121V95Z" fill="var(--ob-art-soft)" />
            <path d="M134 69c0-6 4-10 10-10h82c6 0 10 4 10 10v15H134V69Z" fill={`url(#${id}-purple)`} opacity=".92" />
            <path d="M135 113h96M142 89h91M151 64h72" stroke="var(--ob-art-paper)" strokeOpacity=".56" strokeWidth="2.5" />
            <path d="M202 59v27l-9-7-9 7V59h18Z" fill="var(--ob-art-highlight)" />
          </g>
          <TinyPlant filterId={`${id}-shadow`} />
        </>}

        {variant === "style" && <>
          <Books filterId={`${id}-shadow`} gradientId={`${id}-purple`} />
          <g filter={`url(#${id}-shadow)`}>
            <path d="M189 34c-26 0-43 20-43 43 0 15 7 27 18 35v14h50v-14c11-8 18-20 18-35 0-23-17-43-43-43Z" fill={`url(#${id}-purple)`} />
            <path d="M171 128h36M175 138h28" stroke="var(--accent)" strokeWidth="6" strokeLinecap="round" />
            <path d="M174 85c0-13 7-24 18-29" stroke="var(--ob-art-paper)" strokeOpacity=".62" strokeWidth="4" strokeLinecap="round" />
            <path d="M189 16v11M135 45l10 8M243 45l-10 8M126 86h13M252 86h-13" stroke="var(--ob-art-warm)" strokeWidth="3" strokeLinecap="round" opacity=".82" />
            <circle cx="189" cy="78" r="15" fill="var(--ob-art-paper)" opacity=".18" />
          </g>
          <TinyPlant filterId={`${id}-shadow`} />
        </>}

        {variant === "rhythm" && <>
          <Books filterId={`${id}-shadow`} gradientId={`${id}-purple`} />
          <g filter={`url(#${id}-shadow)`}>
            <circle cx="207" cy="88" r="42" fill="var(--ob-art-paper)" stroke={`url(#${id}-purple)`} strokeWidth="5" />
            <path d="M207 58v31l19 12" stroke="var(--accent)" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" />
            <path d="M168 47c8-15 23-20 36-13l-10 17c-8-4-15-2-22 6l-4-10ZM246 47c-8-15-23-20-36-13l10 17c8-4 15-2 22 6l4-10Z" fill="var(--accent-light)" />
            <path d="m181 125-10 13M233 125l10 13" stroke="var(--accent)" strokeWidth="5" strokeLinecap="round" />
            <circle cx="207" cy="88" r="4" fill="var(--accent)" />
          </g>
          <TinyPlant filterId={`${id}-shadow`} />
        </>}

        {variant === "review" && <>
          <Books filterId={`${id}-shadow`} gradientId={`${id}-purple`} />
          <g filter={`url(#${id}-shadow)`}>
            <rect x="160" y="43" width="76" height="91" rx="11" fill="var(--ob-art-paper)" stroke={`url(#${id}-purple)`} strokeWidth="4" />
            <rect x="180" y="34" width="37" height="19" rx="7" fill={`url(#${id}-purple)`} />
            <path d="m177 77 6 6 10-12M177 100l6 6 10-12M177 123l6 6 10-12" stroke="var(--accent)" strokeWidth="3.6" strokeLinecap="round" strokeLinejoin="round" />
            <path d="M202 78h18M202 101h18M202 124h14" stroke="var(--accent)" strokeOpacity=".27" strokeWidth="4" strokeLinecap="round" />
            <path d="M252 43v89" stroke="var(--accent)" strokeWidth="4" strokeLinecap="round" />
            <path d="M253 45c15 10 28 8 39 0-3 16-20 26-39 16V45Z" fill="var(--ob-art-highlight)" stroke="var(--accent)" strokeWidth="2" />
          </g>
          <TinyPlant filterId={`${id}-shadow`} />
        </>}
      </svg>
    </span>
  );
}
