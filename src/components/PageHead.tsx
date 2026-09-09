"use client";

import React, { useEffect, useRef, useState } from "react";

/* On-view hook — one-shot IntersectionObserver used by the headline
   animations below (falls back to "visible" where IO is missing). */
export function useInView<T extends HTMLElement>(threshold = 0.25) {
  const ref = useRef<T | null>(null);
  const [inView, setInView] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (typeof IntersectionObserver === "undefined") {
      /* No IO (very old browsers): mark visible on the next tick so the
         setState never fires synchronously inside the effect body. */
      const id = window.setTimeout(() => setInView(true), 0);
      return () => window.clearTimeout(id);
    }
    const io = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) {
          setInView(true);
          io.disconnect();
        }
      },
      { threshold, rootMargin: "0px 0px -8% 0px" }
    );
    io.observe(el);
    return () => io.disconnect();
  }, [threshold]);
  return { ref, inView };
}

/** Masked-word headline reveal — every word rises out of its own clip window
 *  with a small stagger (the reference studio headline treatment). */
export function MaskWords({ text, step = 60 }: { text: string; step?: number }) {
  const { ref, inView } = useInView<HTMLSpanElement>(0.4);
  const words = text.split(" ");
  return (
    <span ref={ref} className={inView ? "in" : undefined}>
      {words.map((w, i) => (
        <React.Fragment key={`${w}-${i}`}>
          <span className="mw" style={{ "--d": `${i * step}ms` } as React.CSSProperties}>
            <i>{w}</i>
          </span>
          {i < words.length - 1 ? " " : null}
        </React.Fragment>
      ))}
    </span>
  );
}

const GLYPHS = "▚▞/\\<>#*+=—";

/** Decode-style eyebrow label — settles from glyphs into the real text once,
 *  the moment it scrolls into view. Respects reduced-motion. */
export function Scramble({ text, speed = 24 }: { text: string; speed?: number }) {
  const { ref, inView } = useInView<HTMLSpanElement>(0.4);
  const [out, setOut] = useState(text);
  useEffect(() => {
    if (!inView) return;
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) {
      /* Reduced motion: settle straight to the final text on the next tick
         (async, so no setState ever runs synchronously inside the effect). */
      const id = window.setTimeout(() => setOut(text), 0);
      return () => window.clearTimeout(id);
    }
    let frame = 0;
    const total = text.length * 3 + 8;
    const id = window.setInterval(() => {
      frame += 1;
      const settled = Math.floor((frame / total) * text.length * 1.4);
      if (settled >= text.length) {
        setOut(text);
        window.clearInterval(id);
        return;
      }
      setOut(
        text
          .split("")
          .map((c, i) => (c === " " ? " " : i < settled ? c : GLYPHS[Math.floor(Math.random() * GLYPHS.length)]))
          .join("")
      );
    }, speed);
    return () => window.clearInterval(id);
  }, [inView, text, speed]);
  return <span ref={ref}>{out}</span>;
}

/**
 * The ported page-head: mono eyebrow with accent dot + scramble, a large
 * masked-word headline, one calm supporting line, and the page's scene art
 * anchored to the bottom-right (hidden on small screens).
 */
export default function PageHead({
  eyebrow,
  title,
  sub,
  scene,
  className,
}: {
  eyebrow: string;
  title: string;
  sub: React.ReactNode;
  scene?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={`ph rv${className ? ` ${className}` : ""}`}>
      <div className="ph-copy">
        <p className="ph-eyebrow">
          <Scramble text={eyebrow} />
        </p>
        <h1 className="ph-title">
          <MaskWords text={title} />
        </h1>
        <p className="ph-sub">{sub}</p>
      </div>
      {scene ? <div className="ph-scene" aria-hidden="true">{scene}</div> : null}
    </div>
  );
}
