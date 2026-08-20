"use client";

/** Subtle haptic tick on supported devices (Android Chrome). Silently
 *  no-ops elsewhere. Kept to FUNCTIONAL moments only — completing a
 *  task, clocking in/out — never decorative. */
export function haptic(pattern: number | number[] = 12) {
  try {
    if (typeof navigator !== "undefined" && "vibrate" in navigator) {
      navigator.vibrate(pattern);
    }
  } catch { /* no-op */ }
}
