"use client";

import { useEffect, useRef } from "react";

/**
 * Makes the hardware/browser Back button close an overlay (modal, sheet,
 * zen mode, chat panel) instead of leaving the page — the behaviour every
 * native app has and users instinctively expect on Android.
 *
 * While `open` is true, one history entry is pushed; pressing Back pops it
 * and we call `onClose` instead of navigating away. If the overlay closes
 * by any other means (X button, backdrop tap), the sentinel entry is
 * consumed silently so history stays balanced.
 */
export function useBackClose(open: boolean, onClose: () => void) {
  const closeRef = useRef(onClose);
  useEffect(() => {
    closeRef.current = onClose;
  }, [onClose]);
  const armedRef = useRef(false);

  useEffect(() => {
    if (typeof window === "undefined") return;

    if (open && !armedRef.current) {
      armedRef.current = true;
      window.history.pushState({ __overlay: true }, "");

      const onPop = () => {
        if (armedRef.current) {
          armedRef.current = false;
          closeRef.current();
        }
      };
      window.addEventListener("popstate", onPop);
      return () => {
        window.removeEventListener("popstate", onPop);
        // Closed without Back (X / backdrop): consume our sentinel entry.
        if (armedRef.current) {
          armedRef.current = false;
          window.history.back();
        }
      };
    }
  }, [open]);
}
