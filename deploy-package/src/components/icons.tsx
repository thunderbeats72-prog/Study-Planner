import React from "react";

type P = { size?: number; className?: string; style?: React.CSSProperties };
const base = (size: number) => ({
  width: size,
  height: size,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 2,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
});

export const IconLogo = ({ size = 18, className, style }: P) => (
  <svg {...base(size)} strokeWidth={2.5} className={className} style={style}>
    <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" />
  </svg>
);
export const IconHome = ({ size = 18, className, style }: P) => (
  <svg {...base(size)} className={className} style={style}>
    <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
    <path d="M9 22V12h6v10" />
  </svg>
);
export const IconCalendar = ({ size = 18, className, style }: P) => (
  <svg {...base(size)} className={className} style={style}>
    <rect x="3" y="4" width="18" height="18" rx="2" />
    <line x1="16" y1="2" x2="16" y2="6" />
    <line x1="8" y1="2" x2="8" y2="6" />
    <line x1="3" y1="10" x2="21" y2="10" />
  </svg>
);
export const IconClock = ({ size = 18, className, style }: P) => (
  <svg {...base(size)} className={className} style={style}>
    <circle cx="12" cy="12" r="10" />
    <polyline points="12 6 12 12 16 14" />
  </svg>
);
export const IconBook = ({ size = 18, className, style }: P) => (
  <svg {...base(size)} className={className} style={style}>
    <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
    <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
  </svg>
);
export const IconBookOpen = ({ size = 18, className, style }: P) => (
  <svg {...base(size)} className={className} style={style}>
    <path d="M2 4h6a4 4 0 0 1 4 4v12a3 3 0 0 0-3-3H2z" />
    <path d="M22 4h-6a4 4 0 0 0-4 4v12a3 3 0 0 1 3-3h7z" />
  </svg>
);
export const IconChart = ({ size = 18, className, style }: P) => (
  <svg {...base(size)} className={className} style={style}>
    <path d="M3 3v18h18" />
    <path d="M8 17v-4M13 17V7M18 17v-6" />
  </svg>
);
export const IconGear = ({ size = 18, className, style }: P) => (
  <svg {...base(size)} className={className} style={style}>
    <circle cx="12" cy="12" r="3" />
    <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9c.26.6.852.997 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
  </svg>
);
export const IconBolt = ({ size = 18, className, style }: P) => (
  <svg {...base(size)} strokeWidth={2.5} className={className} style={style}>
    <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
  </svg>
);
export const IconFlame = ({ size = 13, className, style }: P) => (
  <svg {...base(size)} strokeWidth={2.5} className={className} style={style}>
    <path d="M12 2c.5 3-1.5 5-3 7 2 0 3 1 3.5 3 .5-2 1.5-3 3.5-3-1.5-2-3.5-4-4-7z" />
  </svg>
);
export const IconSpark = ({ size = 18, className, style }: P) => (
  <svg {...base(size)} className={className} style={style}>
    <path d="M12 3v3M12 18v3M3 12h3M18 12h3M5.6 5.6l2.1 2.1M16.3 16.3l2.1 2.1M18.4 5.6l-2.1 2.1M7.7 16.3l-2.1 2.1" />
    <circle cx="12" cy="12" r="3.2" />
  </svg>
);
export const IconSend = ({ size = 16, className, style }: P) => (
  <svg {...base(size)} className={className} style={style}>
    <line x1="22" y1="2" x2="11" y2="13" />
    <polygon points="22 2 15 22 11 13 2 9 22 2" />
  </svg>
);
export const IconExpand = ({ size = 14, className, style }: P) => (
  <svg {...base(size)} className={className} style={style}>
    <polyline points="15 3 21 3 21 9" />
    <polyline points="9 21 3 21 3 15" />
    <line x1="21" y1="3" x2="14" y2="10" />
    <line x1="3" y1="21" x2="10" y2="14" />
  </svg>
);
export const IconCheck = ({ size = 14, className, style }: P) => (
  <svg {...base(size)} strokeWidth={3} className={className} style={style}>
    <polyline points="20 6 9 17 4 12" />
  </svg>
);
export const IconClose = ({ size = 16, className, style }: P) => (
  <svg {...base(size)} className={className} style={style}>
    <line x1="18" y1="6" x2="6" y2="18" />
    <line x1="6" y1="6" x2="18" y2="18" />
  </svg>
);
export const IconTrash = ({ size = 14, className, style }: P) => (
  <svg {...base(size)} className={className} style={style}>
    <polyline points="3 6 5 6 21 6" />
    <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
  </svg>
);
export const IconVolume = ({ size = 16, className, style }: P) => (
  <svg {...base(size)} className={className} style={style}>
    <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
    <path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07" />
  </svg>
);
export const IconChat = ({ size = 22, className, style }: P) => (
  <svg {...base(size)} className={className} style={style}>
    <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" />
  </svg>
);
export const IconPanelLeft = ({ size = 16, className, style }: P) => (
  <svg {...base(size)} className={className} style={style}>
    <rect x="3" y="3" width="18" height="18" rx="2" />
    <line x1="9" y1="3" x2="9" y2="21" />
    <path d="m14 9 3 3-3 3" />
  </svg>
);
export const IconChevron = ({ size = 14, className, style }: P) => (
  <svg {...base(size)} className={className} style={style}>
    <polyline points="6 9 12 15 18 9" />
  </svg>
);
export const IconWarn = ({ size = 16, className, style }: P) => (
  <svg {...base(size)} className={className} style={style}>
    <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
    <line x1="12" y1="9" x2="12" y2="13" />
    <line x1="12" y1="17" x2="12.01" y2="17" />
  </svg>
);
export const IconCopy = ({ size = 13, className, style }: P) => (
  <svg {...base(size)} className={className} style={style}>
    <rect x="9" y="9" width="12" height="12" rx="2" />
    <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
  </svg>
);
export const IconSignal = ({ size = 14, className, style }: P) => (
  <svg {...base(size)} className={className} style={style}>
    <path d="M2 20h.01M7 20v-4M12 20v-8M17 20V8M22 20V4" />
  </svg>
);
export const IconLock = ({ size = 14, className, style }: P) => (
  <svg {...base(size)} className={className} style={style}>
    <rect x="3" y="11" width="18" height="11" rx="2" />
    <path d="M7 11V7a5 5 0 0 1 10 0v4" />
  </svg>
);
export const IconTarget = ({ size = 14, className, style }: P) => (
  <svg {...base(size)} className={className} style={style}>
    <circle cx="12" cy="12" r="10" />
    <circle cx="12" cy="12" r="6" />
    <circle cx="12" cy="12" r="2" />
  </svg>
);
export const IconMenu = ({ size = 20, className, style }: P) => (
  <svg {...base(size)} strokeWidth={2.2} className={className} style={style}>
    <line x1="3" y1="6" x2="21" y2="6" />
    <line x1="3" y1="12" x2="21" y2="12" />
    <line x1="3" y1="18" x2="21" y2="18" />
  </svg>
);
export const IconBell = ({ size = 16, className, style }: P) => (
  <svg {...base(size)} className={className} style={style}>
    <path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" />
    <path d="M13.73 21a2 2 0 0 1-3.46 0" />
  </svg>
);
export const IconPalette = ({ size = 16, className, style }: P) => (
  <svg {...base(size)} className={className} style={style}>
    <circle cx="13.5" cy="6.5" r="1.5" fill="currentColor" stroke="none" />
    <circle cx="17.5" cy="10.5" r="1.5" fill="currentColor" stroke="none" />
    <circle cx="8.5" cy="7.5" r="1.5" fill="currentColor" stroke="none" />
    <circle cx="6.5" cy="12.5" r="1.5" fill="currentColor" stroke="none" />
    <path d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10c.926 0 1.648-.746 1.648-1.688 0-.437-.18-.835-.437-1.125-.29-.289-.438-.652-.438-1.125a1.64 1.64 0 0 1 1.668-1.668h1.996c3.051 0 5.555-2.503 5.555-5.554C21.965 6.012 17.461 2 12 2z" />
  </svg>
);
export const IconPlay = ({ size = 16, className, style }: P) => (
  <svg
    {...base(size)}
    strokeWidth={2.4}
    fill="currentColor"
    stroke="none"
    className={className}
    style={style}
  >
    <polygon points="6 3 20 12 6 21 6 3" />
  </svg>
);
export const IconExpand2 = ({ size = 14, className, style }: P) => (
  <svg {...base(size)} className={className} style={style}>
    <polyline points="15 3 21 3 21 9" />
    <polyline points="9 21 3 21 3 15" />
    <line x1="21" y1="3" x2="14" y2="10" />
    <line x1="3" y1="21" x2="10" y2="14" />
  </svg>
);
export const IconFocus2 = ({ size = 16, className, style }: P) => (
  <svg {...base(size)} className={className} style={style}>
    <circle cx="12" cy="12" r="9" />
    <circle cx="12" cy="12" r="5" />
    <circle cx="12" cy="12" r="1.6" fill="currentColor" stroke="none" />
  </svg>
);
export const IconLeaf = ({ size = 16, className, style }: P) => (
  <svg {...base(size)} className={className} style={style}>
    <path d="M11 20A7 7 0 0 1 9.8 6.1C15.5 5 17 4.48 19 2c1 2 2 4.18 2 8 0 5.5-4.78 10-10 10Z" />
    <path d="M2 21c0-3 1.85-5.36 5.08-6C9.5 14.52 12 13 13 12" />
  </svg>
);
export const IconRocket = ({ size = 16, className, style }: P) => (
  <svg {...base(size)} className={className} style={style}>
    <path d="M4.5 16.5c-1.5 1.26-2 5-2 5s3.74-.5 5-2c.71-.84.7-2.13-.09-2.91a2.18 2.18 0 0 0-2.91-.09z" />
    <path d="m12 15-3-3a22 22 0 0 1 2-3.95A12.88 12.88 0 0 1 22 2c0 2.72-.78 7.5-6 11a22.35 22.35 0 0 1-4 2z" />
    <path d="M9 12H4s.55-3.03 2-4c1.62-1.08 5 0 5 0" />
    <path d="M12 15v5s3.03-.55 4-2c1.08-1.62 0-5 0-5" />
  </svg>
);
export const IconPlus = ({ size = 14, className, style }: P) => (
  <svg {...base(size)} className={className} style={style}>
    <path d="M12 5v14M5 12h14" />
  </svg>
);
export const IconTrend = ({ size = 16, className, style }: P) => (
  <svg {...base(size)} className={className} style={style}>
    <path d="M22 7l-8.5 8.5-5-5L2 17" />
    <path d="M16 7h6v6" />
  </svg>
);
export const IconBoard = ({ size = 16, className, style }: P) => (
  <svg {...base(size)} className={className} style={style}>
    <rect x="4" y="4" width="4.5" height="12" rx="1.2" />
    <rect x="10" y="4" width="4.5" height="8" rx="1.2" />
    <rect x="16" y="4" width="4.5" height="16" rx="1.2" />
  </svg>
);
export const IconList = ({ size = 16, className, style }: P) => (
  <svg {...base(size)} className={className} style={style}>
    <path d="M8 6h13M8 12h13M8 18h13M3.5 6h.01M3.5 12h.01M3.5 18h.01" />
  </svg>
);
export const IconSun = ({ size = 18, className, style }: P) => (
  <svg {...base(size)} className={className} style={style}>
    <circle cx="12" cy="12" r="4" />
    <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41" />
  </svg>
);
export const IconMoon = ({ size = 18, className, style }: P) => (
  <svg {...base(size)} className={className} style={style}>
    <path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z" />
  </svg>
);
export const IconArrowRight = ({ size = 16, className, style }: P) => (
  <svg {...base(size)} className={className} style={style}>
    <path d="M5 12h14" />
    <path d="m12 5 7 7-7 7" />
  </svg>
);
export const IconArrowLeft = ({ size = 16, className, style }: P) => (
  <svg {...base(size)} className={className} style={style}>
    <path d="M19 12H5" />
    <path d="m12 19-7-7 7-7" />
  </svg>
);
export const IconDownload = ({ size = 16, className, style }: P) => (
  <svg {...base(size)} className={className} style={style}>
    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
    <path d="M7 10l5 5 5-5M12 15V3" />
  </svg>
);
export const IconRefresh = ({ size = 16, className, style }: P) => (
  <svg {...base(size)} className={className} style={style}>
    <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
    <path d="M3 3v5h5" />
  </svg>
);
export const IconEdit = ({ size = 16, className, style }: P) => (
  <svg {...base(size)} className={className} style={style}>
    <path d="M17 3a2.83 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" />
  </svg>
);
export const IconUser = ({ size = 16, className, style }: P) => (
  <svg {...base(size)} className={className} style={style}>
    <path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2" />
    <circle cx="12" cy="7" r="4" />
  </svg>
);
export const IconFilter = ({ size = 16, className, style }: P) => (
  <svg {...base(size)} className={className} style={style}>
    <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3" />
  </svg>
);
/* v25 additions — same 24×24 stroke grid, same `base()`, so the set stays a
   single family. `IconUndo` labels the reversible Done action, `IconStopwatch`
   is the session verb every Clock-in / Clock-out control shares. */
/* Redrawn at button size (13–16px): the old undo was a near-full circle that
   read as "refresh". This is the open-arrow hook — one corner + one arc —
   which stays legible when the stroke is a fifth of the glyph. */
export const IconUndo = ({ size = 16, className, style }: P) => (
  <svg {...base(size)} className={className} style={style}>
    <path d="M9 14 4 9l5-5" />
    <path d="M4 9h10a6 6 0 0 1 0 12h-1" />
  </svg>
);
export const IconStop = ({ size = 16, className, style }: P) => (
  <svg {...base(size)} className={className} style={style}>
    <rect x="7" y="7" width="10" height="10" rx="2" />
  </svg>
);
export const IconPause = ({ size = 16, className, style }: P) => (
  <svg {...base(size)} className={className} style={style}><path d="M10 4H7v16h3V4Z" /><path d="M17 4h-3v16h3V4Z" /></svg>
);
export const IconSwap = ({ size = 16, className, style }: P) => (
  <svg {...base(size)} className={className} style={style}>
    <path d="M16 3l4 4-4 4" />
    <path d="M20 7H4" />
    <path d="M8 21l-4-4 4-4" />
    <path d="M4 17h16" />
  </svg>
);
/* Redrawn: the old stopwatch carried a base line and a stem that crossed the
   dial, and at 13px it collapsed into a circle-with-a-dot. Now it is exactly
   three parts — crown, dial, hand — with nothing touching the rim. */
export const IconStopwatch = ({ size = 16, className, style }: P) => (
  <svg {...base(size)} className={className} style={style}>
    <circle cx="12" cy="13" r="8" />
    <path d="M12 9v4l2.5 1.5" />
    <path d="M9 2h6M12 2v3" />
    <path d="m17 5 2-2" />
  </svg>
);
/* v32 — two quiet glyphs the reference uses sparingly: a clipboard for the
   lesson brief's \"takeaway\" and a shield for protected/checkpoint states.
   Same 24×24 stroke grid, same base — the set stays one family. */
export const IconClipboard = ({ size = 16, className, style }: P) => (
  <svg {...base(size)} className={className} style={style}>
    <rect x="9" y="4" width="6" height="4" rx="1" />
    <path d="M8 8H7a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V10a2 2 0 0 0-2-2h-1" />
    <path d="M12 11v6" />
    <path d="M9 14h6" />
  </svg>
);
export const IconShield = ({ size = 16, className, style }: P) => (
  <svg {...base(size)} className={className} style={style}>
    <path d="M12 2 4 5v6c0 5 3.5 8.5 8 11 4.5-2.5 8-6 8-11V5z" />
    <path d="M9 12 11.2 14l4-5" />
  </svg>
);
