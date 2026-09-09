"use client";

import React, { useEffect, useRef, useState } from "react";
import { cn } from "./cn";

/* in-view hook */
export function useInView<T extends HTMLElement>(threshold = 0.15) {
  const ref = useRef<T | null>(null);
  const [inView, setInView] = useState(() => typeof window === "undefined" || typeof IntersectionObserver === "undefined");
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof IntersectionObserver === "undefined") return;
    const io = new IntersectionObserver(
      ([e]) => {
        if (e.isIntersecting) {
          setInView(true);
          io.disconnect();
        }
      },
      { threshold, rootMargin: "0px 0px -4% 0px" }
    );
    io.observe(el);
    return () => io.disconnect();
  }, [threshold]);
  return { ref, inView };
}

/* scroll / mount reveal wrapper */
export function Reveal({
  children,
  delay = 0,
  className,
}: {
  children: React.ReactNode;
  delay?: number;
  className?: string;
}) {
  const { ref, inView } = useInView<HTMLDivElement>();
  return (
    <div
      ref={ref}
      className={cn("reveal", inView && "in", className)}
      style={{ ["--d" as string]: `${delay}ms` }}
    >
      {children}
    </div>
  );
}

/* line-mask word reveal (linea-prompt style headline) */
export function MaskWords({
  text,
  className,
  step = 45,
}: {
  text: string;
  className?: string;
  step?: number;
}) {
  const { ref, inView } = useInView<HTMLSpanElement>(0.2);
  return (
    <span ref={ref} className={cn(inView && "in", className)}>
      {text.split(" ").map((w, i) => (
        <span key={i} className="mw" style={{ ["--d" as string]: `${i * step}ms` }}>
          <i>{w}</i>
          {i < text.split(" ").length - 1 ? <> </> : null}
        </span>
      ))}
    </span>
  );
}

/* scramble-decode label (cyber/trading-dashboard style) */
const GLYPHS = "▚▞/\\<>#*+=—";
export function Scramble({
  text,
  className,
  speed = 24,
}: {
  text: string;
  className?: string;
  speed?: number;
}) {
  const { ref, inView } = useInView<HTMLSpanElement>(0.2);
  const [out, setOut] = useState(text);
  useEffect(() => {
    if (!inView) return;
    let frame = 0;
    const total = text.length * 3 + 6;
    const id = setInterval(() => {
      frame++;
      const settled = Math.floor((frame / total) * text.length * 1.3);
      setOut(
        text
          .split("")
          .map((c, i) =>
            c === " "
              ? " "
              : i < settled
                ? c
                : GLYPHS[Math.floor(Math.random() * GLYPHS.length)]
          )
          .join("")
      );
      if (settled >= text.length) {
        setOut(text);
        clearInterval(id);
      }
    }, speed);
    return () => clearInterval(id);
  }, [inView, text, speed]);
  return (
    <span ref={ref} className={className}>
      {out}
    </span>
  );
}

/* animated counter */
export function CountUp({
  to,
  decimals = 0,
  suffix = "",
  prefix = "",
  duration = 900,
  className,
}: {
  to: number;
  decimals?: number;
  suffix?: string;
  prefix?: string;
  duration?: number;
  className?: string;
}) {
  const { ref, inView } = useInView<HTMLSpanElement>(0.2);
  const [v, setV] = useState(0);
  useEffect(() => {
    if (!inView) return;
    const reduce =
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let raf = 0;
    if (reduce) {
      raf = requestAnimationFrame(() => setV(to));
      return () => cancelAnimationFrame(raf);
    }
    const t0 = performance.now();
    const loop = (t: number) => {
      const p = Math.min(1, (t - t0) / duration);
      const e = 1 - Math.pow(1 - p, 3);
      setV(to * e);
      if (p < 1) raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [inView, to, duration]);
  return (
    <span ref={ref} className={className}>
      {prefix}
      {v.toFixed(decimals)}
      {suffix}
    </span>
  );
}

/* magnetic hover */
export function Magnetic({
  children,
  strength = 0.25,
  className,
}: {
  children: React.ReactNode;
  strength?: number;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement | null>(null);
  const onMove = (e: React.MouseEvent) => {
    const el = ref.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const x = (e.clientX - r.left - r.width / 2) * strength;
    const y = (e.clientY - r.top - r.height / 2) * strength;
    el.style.transform = `translate(${x}px, ${y}px)`;
  };
  const onLeave = () => {
    const el = ref.current;
    if (el) el.style.transform = "translate(0,0)";
  };
  return (
    <div
      ref={ref}
      onMouseMove={onMove}
      onMouseLeave={onLeave}
      className={cn(
        "transition-transform duration-300 ease-[cubic-bezier(.22,1,.36,1)] will-change-transform",
        className
      )}
    >
      {children}
    </div>
  );
}

/* pointer-spotlight card */
export function Spot({
  children,
  className,
  onClick,
  style,
}: {
  children: React.ReactNode;
  className?: string;
  onClick?: (e: React.MouseEvent<HTMLDivElement>) => void;
  style?: React.CSSProperties;
}) {
  const ref = useRef<HTMLDivElement | null>(null);
  const onMove = (e: React.MouseEvent) => {
    const el = ref.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    el.style.setProperty("--mx", `${e.clientX - r.left}px`);
    el.style.setProperty("--my", `${e.clientY - r.top}px`);
  };
  return (
    <div
      ref={ref}
      onMouseMove={onMove}
      onClick={onClick}
      className={cn("spot", className)}
      style={style}
    >
      {children}
    </div>
  );
}

/* infinite marquee ticker */
export function Marquee({
  children,
  speed = 34,
  className,
}: {
  children: React.ReactNode;
  speed?: number;
  className?: string;
}) {
  return (
    <div className={cn("marquee overflow-hidden", className)}>
      <div className="marquee-track" style={{ ["--spd" as string]: `${speed}s` }}>
        <div className="flex shrink-0 items-center">{children}</div>
        <div className="flex shrink-0 items-center" aria-hidden="true">
          {children}
        </div>
      </div>
    </div>
  );
}

/* ticking now() for live displays */
export function useNow(ms = 1000) {
  const [n, setN] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setN(new Date()), ms);
    return () => clearInterval(id);
  }, [ms]);
  return n;
}
