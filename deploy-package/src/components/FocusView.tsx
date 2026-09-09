"use client";

import React, { useEffect, useState } from "react";
import { today, type AppState } from "@/lib/client";
import { mmss, type TimerMode } from "@/lib/useTimer";
import type { StudySessionApi } from "@/lib/studySession";
import { playSound, setVolume, stopSound, currentSound } from "@/lib/sound";
import {
  IconCheck, IconClock, IconExpand, IconVolume, IconPlay, IconBolt,
  IconSpark, IconLeaf, IconTarget, IconFlame,
} from "./icons";
import { ClockScene } from "./Illustrations";
import { PageHead } from "./bits";
import { CountUp, Reveal, Spot } from "@/lib/fx";
import { cn } from "@/lib/cn";

const SOUNDS = [
  { id: "none", label: "Sound Off" },
  { id: "rain", label: "Soft Rain" },
  { id: "binaural", label: "40Hz Binaural" },
  { id: "brown", label: "Brown Noise" },
  { id: "ocean", label: "Ocean Waves" },
  { id: "wind", label: "Forest Wind" },
];

const MODES: { id: TimerMode; label: string }[] = [
  { id: "pomodoro", label: "Focus" },
  { id: "short", label: "Short Break" },
  { id: "long", label: "Long Break" },
  { id: "stopwatch", label: "Stopwatch" },
  { id: "custom", label: "Custom" },
];

export default function FocusView({
  state,
  session,
  onCompleteTask,
  onZen,
}: {
  state: AppState;
  session: StudySessionApi;
  onCompleteTask: (id: number) => void;
  onZen: () => void;
}) {
  const [sound, setSound] = useState(() => currentSound());
  const [vol, setVol] = useState(0.3);
  const { timer, clock } = session;
  const t = today();
  const todayTasks = state.tasks.filter((x) => x.date === t);

  useEffect(() => {
    setVolume(vol);
  }, [vol]);

  const pick = (id: string) => {
    setSound(id);
    if (id === "none") stopSound();
    else playSound(id, vol);
  };

  const pct =
    timer.mode === "stopwatch"
      ? (timer.seconds % 3600) / 3600
      : timer.total
        ? timer.seconds / timer.total
        : 0;
  const circ = 2 * Math.PI * 104;

  const clockTask = state.tasks.find((x) => x.id === clock.taskId);
  const loggedTodayRaw = state.sessions.filter((x) => x.date === t).reduce((a, x) => a + x.minutes, 0);
  const loggedToday = Math.round(loggedTodayRaw * 10) / 10;
  const loggedTodayLabel = Number.isInteger(loggedToday) ? String(loggedToday) : loggedToday.toFixed(1);

  const clockState = clock.running ? "running" : clock.onBreak ? "break" : clock.sessionActive ? "paused" : "idle";
  const clockStateLabel = clock.running ? "Recording now" : clock.onBreak ? "On a break" : clock.sessionActive ? "Paused" : "Ready to start";
  const timerInProgress = timer.mode === "stopwatch" ? timer.seconds > 0 : timer.seconds < timer.total;
  const timerStateLabel = timer.running ? (timer.isBreak ? "BREAK" : "FOCUSED") : timerInProgress ? "PAUSED" : "READY";
  const selectedSoundLabel = SOUNDS.find((x) => x.id === sound)?.label || "Sound Off";

  return (
    <div className="space-y-6 fade-in focus-view">
      <PageHead
        eyebrow="FOCUS STUDIO"
        title="A calmer way to study"
        sub="Record real study time with the clock, protected by distraction-free focus blocks and ambient soundscapes."
        art={<ClockScene />}
        actions={
          <button
            type="button"
            className="btn btn-secondary"
            onClick={onZen}
          >
            <IconExpand size={14} /> Zen Focus Mode
          </button>
        }
      />

      {/* ── 1. STUDY CLOCK CARD ── */}
      <Reveal>
        <Spot className="glass-panel tilt-card section-card p-5 sm:p-7 accent-edge accent-edge--success">
          <div className="grid gap-6 lg:grid-cols-[1.4fr_1fr] lg:items-center">
            <div>
              <div className="flex flex-wrap items-center gap-3">
                <span className="grid h-10 w-10 place-items-center rounded-xl bg-[color-mix(in_oklab,var(--success-accent,#2e9e6d)_15%,transparent)] text-[var(--success-accent,#2e9e6d)]">
                  <IconClock size={20} />
                </span>
                <h2 className="text-[19px] font-extrabold tracking-tight" style={{ color: "var(--text-main, #211a3a)" }}>
                  Study Clock
                </h2>
                <span
                  className={cn(
                    "flex items-center gap-1.5 rounded-full px-3 py-1 text-[12px] font-extrabold",
                    clock.running
                      ? "bg-[color-mix(in_oklab,var(--success-accent,#2e9e6d)_14%,transparent)] text-[var(--success-accent,#2e9e6d)]"
                      : clock.sessionActive
                        ? "bg-[color-mix(in_oklab,var(--warning-accent,#c07a10)_14%,transparent)] text-[var(--warning-accent,#c07a10)]"
                        : "bg-[var(--surface-2,#f4f2fc)] text-[var(--text-dim,#5f5a7a)]"
                  )}
                >
                  <span className={cn("h-1.5 w-1.5 rounded-full bg-current", clock.running && "pulse-dot")} />
                  {clockStateLabel}
                </span>
              </div>

              <h3 className="mt-4 text-[24px] font-extrabold tracking-tight sm:text-[27px]" style={{ color: "var(--text-main, #211a3a)" }}>
                Track your real study time
              </h3>
              <p className="mt-2 max-w-md text-[14px] font-medium leading-relaxed" style={{ color: "var(--text-dim, #5f5a7a)" }}>
                The study clock logs active minutes directly into your schedule. Pauses and breaks are excluded automatically.
              </p>
              <p className="mt-3 flex flex-wrap items-center gap-2.5 text-[13px] font-bold">
                <span style={{ color: "var(--text-main, #211a3a)" }}>{clockStateLabel}</span>
                <span style={{ color: "var(--text-dim, #5f5a7a)" }}>·</span>
                <span className="text-[var(--success-accent,#2e9e6d)] font-extrabold">
                  {loggedToday > 0 ? `${loggedTodayLabel} min logged today` : "0 min logged today"}
                </span>
              </p>
            </div>

            <div className="relative overflow-hidden rounded-2xl border border-[var(--border-subtle,#e4e0f1)] bg-[var(--surface-2,#f4f2fc)] p-6 text-center">
              <span className="text-[11px] font-extrabold uppercase tracking-wider block mb-1" style={{ color: "var(--text-dim, #5f5a7a)" }}>
                Active Session Time
              </span>
              <p className="mono text-[44px] font-extrabold leading-none tracking-tight sm:text-[52px]" style={{ color: "var(--accent, #6366f1)" }}>
                {mmss(clock.elapsed)}
              </p>
              {/* Subtle decorative wave SVG */}
              <svg viewBox="0 0 300 40" className="pointer-events-none absolute bottom-0 left-0 w-full" preserveAspectRatio="none">
                <path d="M0 26 C 50 12 90 34 150 22 C 200 12 250 30 300 18 V40 H0 Z" fill="var(--success-accent, #2e9e6d)" opacity="0.12" />
                <path d="M0 34 C 60 22 120 40 180 30 C 230 22 270 34 300 28 V40 H0 Z" fill="var(--success-accent, #2e9e6d)" opacity="0.16" />
              </svg>
            </div>
          </div>

          <div className="mt-6 grid gap-4 border-t border-[var(--border-subtle,#e4e0f1)] pt-5 sm:grid-cols-2">
            <div className="space-y-1.5">
              <div className="flex items-baseline justify-between text-[13px] font-bold">
                <span style={{ color: "var(--text-main, #211a3a)" }}>Studying subject</span>
                <span className="text-[11px] font-medium" style={{ color: "var(--text-dim, #5f5a7a)" }}>Optional</span>
              </div>
              <select
                id="clock-subject"
                className="input-field"
                value={clock.subjectId ?? ""}
                onChange={(e) => clock.setSubjectId(e.target.value ? Number(e.target.value) : null)}
              >
                <option value="">— none —</option>
                {state.subjects.map((x) => (
                  <option key={x.id} value={x.id}>
                    {x.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-1.5">
              <div className="flex items-baseline justify-between text-[13px] font-bold">
                <span style={{ color: "var(--text-main, #211a3a)" }}>Attach to today&apos;s task</span>
                <span className="text-[11px] font-medium" style={{ color: "var(--text-dim, #5f5a7a)" }}>Optional</span>
              </div>
              <select
                id="clock-task"
                className="input-field"
                value={clock.taskId ?? ""}
                onChange={(e) => {
                  const v = e.target.value ? Number(e.target.value) : null;
                  clock.setTaskId(v);
                  const task = state.tasks.find((x) => x.id === v);
                  if (task?.subjectId) clock.setSubjectId(task.subjectId);
                }}
              >
                <option value="">— free session —</option>
                {todayTasks.map((x) => (
                  <option key={x.id} value={x.id}>
                    {x.title}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-2.5">
              <button
                type="button"
                className={cn("btn clock-toggle", session.active ? "btn-secondary" : "btn-primary")}
                onClick={session.toggle}
              >
                <IconPlay size={15} /> {session.active ? "Pause" : clock.sessionActive ? "Resume" : "Start session"}
              </button>
              {clock.running && (
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={session.takeBreak}
                >
                  Take a Break
                </button>
              )}
              {clock.sessionActive && (
                <button
                  type="button"
                  className="btn btn-danger"
                  onClick={session.endSession}
                >
                  Clock Out
                </button>
              )}
            </div>

            {clockTask && (
              <div className="flex flex-wrap items-center gap-2">
                <span className="chip chip-kind">
                  {clockTask.actualMinutes}m / {clockTask.plannedMinutes}m planned
                </span>
                <button
                  type="button"
                  className="btn btn-xs btn-primary"
                  onClick={() => onCompleteTask(clockTask.id)}
                >
                  Mark complete
                </button>
              </div>
            )}
          </div>
        </Spot>
      </Reveal>

      {/* ── 2. FOCUS TIMER & AMBIENCE GRID ── */}
      <div className="grid gap-6 lg:grid-cols-[1.4fr_1fr]">
        <Reveal delay={60}>
          <Spot className="glass-panel tilt-card section-card p-5 sm:p-7">
            <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
              <div>
                <div className="text-[11.5px] font-extrabold uppercase tracking-wider" style={{ color: "var(--accent, #6366f1)" }}>
                  Deep Work Ritual
                </div>
                <h3 className="text-[20px] font-extrabold tracking-tight" style={{ color: "var(--text-main, #211a3a)" }}>
                  Focus Timer
                </h3>
              </div>
              <div className="flex items-center gap-2 rounded-xl border border-[var(--border-subtle,#e4e0f1)] bg-[var(--surface-2,#f4f2fc)] px-3 py-1.5">
                <strong className="mono text-[14px]" style={{ color: "var(--accent, #6366f1)" }}>{timer.cycles}</strong>
                <span className="text-[11.5px] font-bold" style={{ color: "var(--text-dim, #5f5a7a)" }}>cycles</span>
              </div>
            </div>

            <div className="mb-4">
              <span className="text-[12.5px] font-bold block mb-2" style={{ color: "var(--text-dim, #5f5a7a)" }}>
                Choose timer mode
              </span>
              <div className="flex flex-wrap gap-2" role="group" aria-label="Focus timer mode">
                {MODES.map((m) => (
                  <button
                    key={m.id}
                    type="button"
                    className={cn(
                      "btn btn-xs rounded-xl",
                      timer.mode === m.id ? "btn-primary" : "btn-secondary"
                    )}
                    aria-pressed={timer.mode === m.id}
                    onClick={() => session.setMode(m.id)}
                  >
                    {m.label}
                  </button>
                ))}
              </div>
            </div>

            {timer.mode === "custom" && (
              <div className="mb-5 rounded-xl border border-[var(--border-subtle,#e4e0f1)] bg-[var(--surface-2,#f4f2fc)] p-3.5">
                <label className="text-[12.5px] font-bold block mb-1.5" htmlFor="custom-min">
                  Custom length (minutes)
                </label>
                <div className="flex items-center gap-3">
                  <input
                    id="custom-min"
                    type="number"
                    className="input-field w-28 mono font-bold"
                    min={1}
                    max={180}
                    value={timer.customMin}
                    onChange={(e) => timer.setCustomMin(Number(e.target.value) || 1)}
                  />
                  <span className="text-[12.5px] font-semibold" style={{ color: "var(--text-dim, #5f5a7a)" }}>
                    1 to 180 min
                  </span>
                </div>
              </div>
            )}

            {/* Timer Ring */}
            <div className="my-6 grid place-items-center">
              <div className="relative grid place-items-center" role="timer" aria-label={`${mmss(timer.seconds)} ${timerStateLabel.toLowerCase()}`}>
                <svg viewBox="0 0 240 240" className="h-56 w-56 -rotate-90">
                  <circle
                    cx="120"
                    cy="120"
                    r="104"
                    stroke="var(--border-subtle, #e4e0f1)"
                    strokeWidth="8"
                    fill="transparent"
                  />
                  <circle
                    cx="120"
                    cy="120"
                    r="104"
                    stroke={timer.isBreak ? "var(--success-accent, #2e9e6d)" : "var(--accent, #6366f1)"}
                    strokeWidth="8"
                    fill="transparent"
                    strokeDasharray={circ}
                    strokeDashoffset={circ * (1 - pct)}
                    strokeLinecap="round"
                    style={{ transition: "stroke-dashoffset .4s linear" }}
                  />
                </svg>
                <div className="absolute text-center">
                  <div className="mono text-[42px] font-extrabold tracking-tight" style={{ color: "var(--text-main, #211a3a)" }}>
                    {mmss(timer.seconds)}
                  </div>
                  <div className="text-[12px] font-extrabold uppercase tracking-widest mt-0.5" style={{ color: timer.isBreak ? "var(--success-accent, #2e9e6d)" : "var(--accent, #6366f1)" }}>
                    {timerStateLabel}
                  </div>
                </div>
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-center gap-3">
              <button
                type="button"
                className="btn btn-primary px-6"
                onClick={session.toggle}
              >
                {session.active ? "Pause" : timer.isBreak ? "Start Break" : timerInProgress ? "Resume" : "Start Focus"}
              </button>
              <button
                type="button"
                className="btn btn-secondary px-5"
                onClick={session.reset}
              >
                Reset
              </button>
            </div>
            <p className="mt-4 text-center text-[12px] font-medium" style={{ color: "var(--text-dim, #5f5a7a)" }}>
              Timer and study clock run in sync. Breaks are automatically excluded from logged study time.
            </p>
          </Spot>
        </Reveal>

        {/* Right side: Ambient sounds & Session rules */}
        <div className="space-y-4">
          <Reveal delay={80}>
            <Spot className="glass-panel tilt-card section-card p-5">
              <div className="mb-4 flex items-center gap-2">
                <span className="grid h-8 w-8 place-items-center rounded-xl bg-[color-mix(in_oklab,var(--accent,#6366f1)_14%,transparent)] text-[var(--accent,#6366f1)]">
                  <IconVolume size={16} />
                </span>
                <div>
                  <h3 className="text-[15px] font-extrabold" style={{ color: "var(--text-main, #211a3a)" }}>
                    Ambient Sounds
                  </h3>
                  <p className="text-[11.5px] font-medium" style={{ color: "var(--text-dim, #5f5a7a)" }}>
                    Calm background audio layer
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2" role="group" aria-label="Ambient sound">
                {SOUNDS.map((x) => (
                  <button
                    key={x.id}
                    type="button"
                    className={cn(
                      "flex items-center justify-between rounded-xl border p-2.5 text-[12.5px] font-bold transition-all",
                      sound === x.id
                        ? "border-[var(--accent,#6366f1)] bg-[color-mix(in_oklab,var(--accent,#6366f1)_10%,transparent)] text-[var(--accent,#6366f1)]"
                        : "border-[var(--border-subtle,#e4e0f1)] bg-[var(--surface-2,#f4f2fc)] opacity-75 hover:opacity-100"
                    )}
                    aria-pressed={sound === x.id}
                    onClick={() => pick(x.id)}
                  >
                    <span>{x.label}</span>
                    {sound === x.id && <IconCheck size={13} />}
                  </button>
                ))}
              </div>

              <div className="mt-4 border-t border-[var(--border-subtle,#e4e0f1)] pt-3">
                <div className="flex items-center justify-between text-[12px] font-bold mb-1.5">
                  <span style={{ color: "var(--text-main, #211a3a)" }}>Sound Volume</span>
                  <span className="mono" style={{ color: "var(--accent, #6366f1)" }}>{Math.round(vol * 100)}%</span>
                </div>
                <input
                  id="ambient-volume"
                  type="range"
                  className="w-full accent-[var(--accent,#6366f1)] cursor-pointer"
                  min={0}
                  max={1}
                  step={0.05}
                  value={vol}
                  aria-label={`Ambient volume ${Math.round(vol * 100)} percent`}
                  onChange={(e) => setVol(Number(e.target.value))}
                />
              </div>
            </Spot>
          </Reveal>

          <Reveal delay={120}>
            <Spot className="glass-panel tilt-card section-card p-5">
              <div className="mb-3 flex items-center gap-2">
                <span className="grid h-8 w-8 place-items-center rounded-xl bg-[color-mix(in_oklab,var(--success-accent,#2e9e6d)_14%,transparent)] text-[var(--success-accent,#2e9e6d)]">
                  <IconCheck size={16} />
                </span>
                <h3 className="text-[15px] font-extrabold" style={{ color: "var(--text-main, #211a3a)" }}>
                  Deep Work Principles
                </h3>
              </div>
              <ul className="space-y-2 text-[12.5px] font-semibold" style={{ color: "var(--text-dim, #5f5a7a)" }}>
                <li className="flex items-start gap-2">
                  <IconCheck size={14} className="text-[var(--success-accent,#2e9e6d)] shrink-0 mt-0.5" />
                  <span>Phone out of reach, not face down on desk.</span>
                </li>
                <li className="flex items-start gap-2">
                  <IconCheck size={14} className="text-[var(--success-accent,#2e9e6d)] shrink-0 mt-0.5" />
                  <span>One single lesson per block — close unrelated tabs.</span>
                </li>
                <li className="flex items-start gap-2">
                  <IconCheck size={14} className="text-[var(--success-accent,#2e9e6d)] shrink-0 mt-0.5" />
                  <span>If stuck for 2 min, write down the simplest next sub-step.</span>
                </li>
                <li className="flex items-start gap-2">
                  <IconCheck size={14} className="text-[var(--success-accent,#2e9e6d)] shrink-0 mt-0.5" />
                  <span>Breaks mean standing up &amp; looking outside — not another screen.</span>
                </li>
              </ul>
            </Spot>
          </Reveal>
        </div>
      </div>
    </div>
  );
}
