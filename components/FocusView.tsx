"use client";

import React, { useCallback, useEffect, useState } from "react";
import { today, type AppState } from "@/lib/client";
import { mmss, type TimerMode } from "@/lib/useTimer";
import type { StudySessionApi } from "@/lib/studySession";
import { playSound, setVolume, stopSound, currentSound } from "@/lib/sound";
import {
  IconCheck,
  IconClock,
  IconExpand,
  IconVolume,
  IconPlay,
  IconPause,
  IconLeaf,
  IconSpark,
  IconTarget,
  IconClose,
  IconFlame,
} from "./icons";
import { ClockScene } from "./Illustrations";
import { PageHead, Select } from "./bits";
import { Reveal, Spot } from "@/lib/fx";
import { cn } from "@/lib/cn";

const SOUNDS = [
  { id: "none", label: "Sound off" },
  { id: "rain", label: "Soft rain" },
  { id: "binaural", label: "40Hz binaural" },
  { id: "brown", label: "Brown noise" },
  { id: "ocean", label: "Ocean waves" },
  { id: "wind", label: "Forest wind" },
];

const MODES: { id: TimerMode; label: string }[] = [
  { id: "pomodoro", label: "Focus" },
  { id: "short", label: "Short break" },
  { id: "long", label: "Long break" },
  { id: "stopwatch", label: "Stopwatch" },
  { id: "custom", label: "Custom" },
];

/* ══════════════════════════════════════════════════════════════════════
   Focus (v25) — same session logic, one visual contract.

   Every colour used to be `var(--token, #hex)`: on the five dark themes the
   fallback was invisible and on the light ones it fought the theme, which is
   most of why this page looked like a different product per theme. The
   fallbacks are gone, the markup reads through the shared card classes
   (`.card-head`, `.card-title`, `.section-card`) and the numerals use the
   shared tabular figure style. Nothing here replaced a working control: the
   study clock, breaks, soundscape, volume and the ring all still drive the
   real `useTimer` session.
   ══════════════════════════════════════════════════════════════════════ */
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
  const [isFull, setIsFull] = useState(false);
  const { timer, clock } = session;
  const t = today();
  const todayTasks = state.tasks.filter((x) => x.date === t);

  useEffect(() => {
    setVolume(vol);
  }, [vol]);

  /* Real Fullscreen API, mirroring Zen's own toggle: it can be blocked or
     unavailable, and the page must keep working when it is. */
  useEffect(() => {
    const sync = () => setIsFull(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", sync);
    return () => document.removeEventListener("fullscreenchange", sync);
  }, []);
  const toggleFullscreen = useCallback(() => {
    const el = document.documentElement;
    try {
      if (document.fullscreenElement) void document.exitFullscreen();
      else void el.requestFullscreen?.();
    } catch {
      /* blocked — the focus page works without it */
    }
  }, []);

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
  const loggedTodayRaw = state.sessions
    .filter((x) => x.date === t)
    .reduce((a, x) => a + x.minutes, 0);
  const loggedToday = Math.round(loggedTodayRaw * 10) / 10;
  const loggedTodayLabel = Number.isInteger(loggedToday)
    ? String(loggedToday)
    : loggedToday.toFixed(1);

  const clockStateLabel = clock.running
    ? "Recording now"
    : clock.onBreak
      ? "On a break"
      : clock.sessionActive
        ? "Paused"
        : "Ready to start";
  const timerInProgress =
    timer.mode === "stopwatch"
      ? timer.seconds > 0
      : timer.seconds < timer.total;
  const timerStateLabel = timer.running
    ? timer.isBreak
      ? "BREAK"
      : "FOCUSED"
    : timerInProgress
      ? "PAUSED"
      : "READY";

  return (
    <div className="page-stack fade-in focus-view">
      <PageHead
        eyebrow="FOCUS STUDIO"
        title="A calmer way to study"
        sub="Record real study time with the clock, protected by distraction-free focus blocks and ambient soundscapes."
        art={<ClockScene />}
        actions={
          <>
            <button
              type="button"
              className="btn btn-secondary"
              onClick={toggleFullscreen}
              aria-pressed={isFull}
              title={
                isFull
                  ? "Leave full screen"
                  : "Hide the browser chrome while you work"
              }
            >
              <IconExpand size={14} />{" "}
              <span>{isFull ? "Exit full screen" : "Full screen"}</span>
            </button>
            <button
              type="button"
              className="btn btn-primary"
              onClick={onZen}
              title="Distraction-free Zen room with the same session"
            >
              <IconLeaf size={14} /> <span>Zen focus mode</span>
            </button>
          </>
        }
      />

      {/* ── 1 · STUDY CLOCK — the functional heart of the page ───────── */}
      <Reveal>
        <Spot className="glass-panel tilt-card section-card focus-clock-card accent-edge accent-edge--success">
          <div className="focus-clock-top">
            <div className="focus-clock-id">
              <span className="card-icon is-good" aria-hidden="true">
                <IconClock size={18} />
              </span>
              <div className="focus-clock-copy">
                <h2 className="card-title section-title">Study clock</h2>
                <p className="card-sub">
                  Active minutes land straight in your schedule. Pauses and
                  breaks are excluded automatically.
                </p>
              </div>
            </div>
            <span
              className={cn(
                "state-pill",
                clock.running
                  ? "is-live"
                  : clock.sessionActive
                    ? "is-paused"
                    : "is-idle",
              )}
            >
              <span className="state-dot" aria-hidden="true" />
              {clockStateLabel}
            </span>
          </div>

          <div className="focus-clock-body">
            <div className="focus-clock-read">
              <span className="focus-clock-read-label">
                Active session time
              </span>
              <p className="focus-clock-digits mono">{mmss(clock.elapsed)}</p>
              <p className="focus-clock-logged">
                {loggedToday > 0
                  ? `${loggedTodayLabel} min logged today`
                  : "Nothing logged today yet"}
              </p>
              <svg
                className="focus-clock-wave"
                viewBox="0 0 300 40"
                preserveAspectRatio="none"
                aria-hidden="true"
              >
                <path d="M0 26 C 50 12 90 34 150 22 C 200 12 250 30 300 18 V40 H0 Z" />
                <path
                  d="M0 34 C 60 22 120 40 180 30 C 230 22 270 34 300 28 V40 H0 Z"
                  className="is-2"
                />
              </svg>
            </div>

            <div className="focus-clock-fields">
              <div className="field">
                <div className="field-label-row">
                  <label className="field-label" htmlFor="clock-subject">
                    Studying subject
                  </label>
                  <span className="field-hint">Optional</span>
                </div>
                <Select
                  id="clock-subject"
                  ariaLabel="Studying subject"
                  value={clock.subjectId ? String(clock.subjectId) : ""}
                  onChange={(v) => clock.setSubjectId(v ? Number(v) : null)}
                  options={[
                    { value: "", label: "— none —" },
                    ...state.subjects.map((x) => ({
                      value: String(x.id),
                      label: x.name,
                    })),
                  ]}
                />
              </div>

              <div className="field">
                <div className="field-label-row">
                  <label className="field-label" htmlFor="clock-task">
                    Attach to today&apos;s task
                  </label>
                  <span className="field-hint">Optional</span>
                </div>
                <Select
                  id="clock-task"
                  ariaLabel="Attach to today's task"
                  value={clock.taskId ? String(clock.taskId) : ""}
                  onChange={(v) => {
                    const n = v ? Number(v) : null;
                    clock.setTaskId(n);
                    const task = state.tasks.find((x) => x.id === n);
                    if (task?.subjectId) clock.setSubjectId(task.subjectId);
                  }}
                  options={[
                    { value: "", label: "— free session —" },
                    ...todayTasks.map((x) => ({
                      value: String(x.id),
                      label: x.title,
                    })),
                  ]}
                />
              </div>
            </div>
          </div>

          <div className="focus-clock-actions">
            <div className="btn-row">
              <button
                type="button"
                className={cn(
                  "btn clock-toggle",
                  session.active ? "btn-secondary" : "btn-primary",
                )}
                onClick={session.toggle}
                aria-pressed={session.active}
                title={
                  session.active
                    ? "Pause the study clock and the timer"
                    : "Start the study clock and the timer"
                }
              >
                {session.active ? (
                  <IconPause size={15} />
                ) : (
                  <IconPlay size={15} />
                )}
                <span>
                  {session.active
                    ? "Pause"
                    : clock.sessionActive
                      ? "Resume"
                      : "Start session"}
                </span>
              </button>
              {clock.running && (
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={session.takeBreak}
                  title="Break time is never logged as study time"
                >
                  <IconLeaf size={14} /> <span>Take a break</span>
                </button>
              )}
              {clock.sessionActive && (
                <button
                  type="button"
                  className="btn btn-danger"
                  onClick={session.endSession}
                  title="Save the minutes so far and close the session"
                >
                  <IconCheck size={14} /> <span>Clock out</span>
                </button>
              )}
            </div>

            {clockTask && (
              <div className="focus-clock-task">
                <span className="chip chip-kind">
                  {clockTask.actualMinutes}m / {clockTask.plannedMinutes}m
                  planned
                </span>
                <button
                  type="button"
                  className="btn btn-xs btn-primary"
                  onClick={() => onCompleteTask(clockTask.id)}
                  title="Mark this task done without leaving the session"
                >
                  <IconTarget size={12} /> <span>Mark complete</span>
                </button>
              </div>
            )}
          </div>
        </Spot>
      </Reveal>

      {/* ── 2 · TIMER + RITUAL ─────────────────────────────────────────── */}
      <div className="focus-grid">
        <Reveal delay={60}>
          <Spot className="glass-panel tilt-card section-card focus-timer-card">
            <div className="card-head">
              <div>
                <p className="card-eyebrow">Deep work ritual</p>
                <h3 className="card-title section-title">Focus timer</h3>
              </div>
              <span className="cycle-chip" title="Completed focus cycles today">
                <strong className="mono">{timer.cycles}</strong>{" "}
                <span>cycles</span>
              </span>
            </div>

            <div className="mode-block">
              <span className="block-label" id="focus-mode-label">
                Choose timer mode
              </span>
              <div
                className="mode-row"
                role="group"
                aria-labelledby="focus-mode-label"
              >
                {MODES.map((m) => (
                  <button
                    key={m.id}
                    type="button"
                    className={cn("mode-btn", timer.mode === m.id && "is-on")}
                    aria-pressed={timer.mode === m.id}
                    onClick={() => session.setMode(m.id)}
                  >
                    {m.label}
                  </button>
                ))}
              </div>
            </div>

            {timer.mode === "custom" && (
              <div className="custom-length">
                <label className="block-label" htmlFor="custom-min">
                  Custom length (minutes)
                </label>
                <div className="custom-length-row">
                  <input
                    id="custom-min"
                    type="number"
                    className="input-field mono custom-length-input"
                    min={1}
                    max={180}
                    value={timer.customMin}
                    onChange={(e) =>
                      timer.setCustomMin(Number(e.target.value) || 1)
                    }
                  />
                  <span className="field-hint">1 to 180 min</span>
                </div>
              </div>
            )}

            <div className="ring-block">
              <div
                className="ring-wrap"
                role="timer"
                aria-label={`${mmss(timer.seconds)} ${timerStateLabel.toLowerCase()}`}
              >
                <svg
                  className="ring-svg"
                  viewBox="0 0 240 240"
                  aria-hidden="true"
                >
                  <circle
                    className="ring-track"
                    cx="120"
                    cy="120"
                    r="104"
                    strokeWidth="8"
                    fill="transparent"
                  />
                  <circle
                    className={cn("ring-progress", timer.isBreak && "is-break")}
                    cx="120"
                    cy="120"
                    r="104"
                    strokeWidth="8"
                    fill="transparent"
                    strokeDasharray={circ}
                    strokeDashoffset={circ * (1 - pct)}
                    strokeLinecap="round"
                  />
                </svg>
                <div className="ring-center">
                  <span className="ring-digits mono">
                    {mmss(timer.seconds)}
                  </span>
                  <span
                    className={cn("ring-state", timer.isBreak && "is-break")}
                  >
                    {timerStateLabel}
                  </span>
                </div>
              </div>
            </div>

            <div className="timer-actions">
              <button
                type="button"
                className="btn btn-primary"
                onClick={session.toggle}
                title={
                  session.active
                    ? "Pause this block"
                    : "Start or resume this block"
                }
              >
                {session.active ? (
                  <IconPause size={15} />
                ) : (
                  <IconPlay size={15} />
                )}
                <span>
                  {session.active
                    ? "Pause"
                    : timer.isBreak
                      ? "Start break"
                      : timerInProgress
                        ? "Resume"
                        : "Start focus"}
                </span>
              </button>
              <button
                type="button"
                className="btn btn-secondary"
                onClick={session.reset}
                title="Reset the countdown to its full length"
              >
                <IconClose size={14} /> <span>Reset</span>
              </button>
            </div>
            <p className="timer-note">
              Timer and study clock run in sync. Breaks are automatically
              excluded from logged study time.
            </p>
          </Spot>
        </Reveal>

        <div className="page-stack">
          <Reveal delay={80}>
            <Spot className="glass-panel tilt-card section-card">
              <div className="card-head card-head--tight">
                <span className="card-icon" aria-hidden="true">
                  <IconVolume size={16} />
                </span>
                <div className="card-head-copy">
                  <h3 className="card-title section-title">Ambient sounds</h3>
                  <p className="card-sub">
                    Calm background layer — never a playlist
                  </p>
                </div>
              </div>

              <div
                className="sound-grid"
                role="group"
                aria-label="Ambient sound"
              >
                {SOUNDS.map((x) => (
                  <button
                    key={x.id}
                    type="button"
                    className={cn("sound-btn", sound === x.id && "is-on")}
                    aria-pressed={sound === x.id}
                    onClick={() => pick(x.id)}
                  >
                    <span>{x.label}</span>
                    {sound === x.id && <IconCheck size={13} />}
                  </button>
                ))}
              </div>

              <div className="volume-block">
                <div className="field-label-row">
                  <label className="field-label" htmlFor="ambient-volume">
                    Sound volume
                  </label>
                  <span className="field-value mono">
                    {Math.round(vol * 100)}%
                  </span>
                </div>
                <input
                  id="ambient-volume"
                  type="range"
                  className="volume-range"
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
            <Spot className="glass-panel tilt-card section-card">
              <div className="card-head card-head--tight">
                <span className="card-icon is-good" aria-hidden="true">
                  <IconFlame size={15} />
                </span>
                <div className="card-head-copy">
                  <h3 className="card-title section-title">
                    Deep work principles
                  </h3>
                  <p className="card-sub">
                    Four habits that make the block count
                  </p>
                </div>
              </div>
              <ul className="principle-list">
                <li>
                  <IconCheck size={14} />
                  <span>Phone out of reach, not face down on the desk.</span>
                </li>
                <li>
                  <IconCheck size={14} />
                  <span>One lesson per block — close unrelated tabs.</span>
                </li>
                <li>
                  <IconCheck size={14} />
                  <span>
                    If stuck for two minutes, write the simplest next sub-step.
                  </span>
                </li>
                <li>
                  <IconCheck size={14} />
                  <span>
                    Breaks mean standing up and looking outside, not another
                    screen.
                  </span>
                </li>
              </ul>
              <p className="principle-note">
                <IconSpark size={13} /> Ask the tutor for a worked example any
                time — the clock keeps running.
              </p>
            </Spot>
          </Reveal>
        </div>
      </div>
    </div>
  );
}
