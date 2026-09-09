"use client";

import { useEffect } from "react";

/**
 * Studio interaction layer — mounted once at the app shell.
 *
 * 1. Pointer spotlight: every `.tilt-card` receives `--mx` / `--my` custom
 *    properties while hovered, so the CSS radial highlight tracks the cursor
 *    (reference "Spot" card). Delegated + rAF-throttled, fine pointers only.
 *
 * 2. Reveal-on-scroll: elements marked `.rv` fade/rise in once on first view,
 *    staggered via their inline `--rv-d`. A MutationObserver picks up `.rv`
 *    elements added later (re-planned days, added subjects, insights, …).
 *
 * Reduced-motion users get everything instantly visible and no tracking.
 */
export default function StudioFx() {
  useEffect(() => {
    const fine = window.matchMedia("(pointer: fine)");
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)");

    /* ── pointer spotlight ──────────────────────────────────── */
    let raf = 0;
    let lastEl: HTMLElement | null = null;
    const onMove = (e: PointerEvent) => {
      if (!fine.matches || reduce.matches) return;
      const target = e.target;
      if (!(target instanceof Element)) return;
      const card = target.closest(".tilt-card");
      lastEl = card instanceof HTMLElement ? card : null;
      if (!lastEl || raf) return;
      const { clientX, clientY } = e;
      raf = requestAnimationFrame(() => {
        raf = 0;
        const el = lastEl;
        if (!el) return;
        const r = el.getBoundingClientRect();
        el.style.setProperty("--mx", `${(clientX - r.left).toFixed(1)}px`);
        el.style.setProperty("--my", `${(clientY - r.top).toFixed(1)}px`);
      });
    };
    document.addEventListener("pointermove", onMove, { passive: true });

    /* ── reveal on scroll ───────────────────────────────────── */
    const seen = new WeakSet<Element>();
    const io =
      typeof IntersectionObserver !== "undefined"
        ? new IntersectionObserver(
            (entries, observer) => {
              for (const en of entries) {
                if (en.isIntersecting) {
                  en.target.classList.add("in");
                  observer.unobserve(en.target);
                }
              }
            },
            { threshold: 0.08, rootMargin: "0px 0px -4% 0px" }
          )
        : null;

    const mark = (el: Element) => {
      if (seen.has(el)) return;
      seen.add(el);
      const observer = io;
      if (reduce.matches || !observer) el.classList.add("in");
      else observer.observe(el);
    };
    const scan = (root: ParentNode) => {
      if (root instanceof Element && root.matches?.(".rv:not(.in)")) mark(root);
      root.querySelectorAll(".rv:not(.in)").forEach(mark);
    };
    scan(document.documentElement);
    const mo = new MutationObserver((muts) => {
      for (const m of muts) {
        m.addedNodes.forEach((n) => {
          if (n instanceof Element) scan(n);
        });
      }
    });
    mo.observe(document.body, { childList: true, subtree: true });

    return () => {
      document.removeEventListener("pointermove", onMove);
      if (raf) cancelAnimationFrame(raf);
      io?.disconnect();
      mo.disconnect();
    };
  }, []);

  return null;
}
