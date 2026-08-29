"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { ClockApi, TimerApi, TimerMode } from "./useTimer";

/* =========================================================================
   STUDY SESSION — the Focus timer and the Study Clock as ONE workflow.

   Before this module existed the two timers were synchronised by hand in
   three different places (the Focus Studio, the Zen room and the tracker
   bar). Every one of those copies drifted, which is how the app ended up
   with a paused focus timer over a still-recording clock, a study clock
   that kept billing through a break, and a Zen screen with four buttons
   for two timers.

   The whole contract now lives here, in one place:

     Start  → focus timer + study clock start together
     Pause  → both pause, study time stops accumulating
     Resume → both resume on the same task
     Block ends → clock stops recording and the break is NOT billed
     Break ends → both resume, the same task becomes active again
     Clock Out → the whole session ends and the minutes are saved

   `planSession` is a PURE function so the rules can be unit-tested
   without a DOM. `useStudySession` is the thin React binding that turns
   the returned effects into calls on the existing `useFocusTimer` /
   `useStudyClock` hooks — no timer logic is duplicated here.
========================================================================= */

/** Break modes never count as study time. */
export function isBreakMode(mode: TimerMode): boolean {
  return mode === "short" || mode === "long";
}

/** Everything the planner needs to know — no React, no refs, no timers. */
export type SessionSnapshot = {
  timerRunning: boolean;
  timerIsBreak: boolean;
  clockRunning: boolean;
  clockSessionActive: boolean;
  clockOnBreak: boolean;
  /** True once Focus Mode created (or adopted) the study-clock session. */
  focusOwnsClock: boolean;
};

export function snapshotOf(timer: TimerApi, clock: ClockApi, focusOwnsClock: boolean): SessionSnapshot {
  return {
    timerRunning: timer.running,
    timerIsBreak: timer.isBreak,
    clockRunning: clock.running,
    clockSessionActive: clock.sessionActive,
    clockOnBreak: clock.onBreak,
    focusOwnsClock,
  };
}

export type SessionCommand =
  | { type: "start" }
  | { type: "pause" }
  | { type: "toggle" }
  /** A manual break: nothing runs, and the clock is not billing. */
  | { type: "break" }
  /** Clock Out — terminates the entire session and saves the minutes. */
  | { type: "endSession" }
  | { type: "reset" }
  | { type: "setMode"; mode: TimerMode }
  /** The focus timer rolled into a break — stop billing study time. */
  | { type: "blockComplete" }
  /** A break ran out — the session goes back to recording. */
  | { type: "breakComplete" }
  /** Repair any drift between the two timers of a focus-owned session. */
  | { type: "reconcile" };

export type SessionEffect =
  | { kind: "timer.start" }
  | { kind: "timer.pause" }
  | { kind: "timer.reset" }
  | { kind: "timer.setMode"; mode: TimerMode }
  | { kind: "clock.in" }
  | { kind: "clock.pause" }
  | { kind: "clock.resume" }
  | { kind: "clock.break" }
  | { kind: "clock.endBreak" }
  | { kind: "clock.out" }
  | { kind: "own.focus" }
  | { kind: "own.clear" }
  | { kind: "note"; message: string };

/** The effect kinds in a plan, for readable assertions. */
export function effectKinds(effects: readonly SessionEffect[]): SessionEffect["kind"][] {
  return effects.map((effect) => effect.kind);
}

/**
 * The single source of truth for how the two timers move together.
 * Pure: same snapshot + command → same effects, always.
 */
export function planSession(snapshot: SessionSnapshot, command: SessionCommand): SessionEffect[] {
  const fx: SessionEffect[] = [];
  const claimOwnership = () => {
    if (!snapshot.focusOwnsClock) fx.push({ kind: "own.focus" });
  };

  switch (command.type) {
    /* One tap starts the whole session. The clock is attached to the
       current/up-next task by the binding layer (`clock.in`). */
    case "start": {
      if (!snapshot.timerRunning) fx.push({ kind: "timer.start" });
      /* Starting a BREAK countdown is rest, not study: the clock must stay
         parked, otherwise the break would bill as study time. */
      if (snapshot.timerIsBreak) {
        if (snapshot.clockSessionActive && !snapshot.clockOnBreak) fx.push({ kind: "clock.break" });
        claimOwnership();
        return fx;
      }
      if (!snapshot.clockSessionActive) fx.push({ kind: "clock.in" });
      else if (snapshot.clockOnBreak) fx.push({ kind: "clock.endBreak" });
      else if (!snapshot.clockRunning) fx.push({ kind: "clock.resume" });
      claimOwnership();
      return fx;
    }

    /* Pause Focus must pause the Study Clock. Never one without the other. */
    case "pause": {
      if (snapshot.timerRunning) fx.push({ kind: "timer.pause" });
      if (snapshot.clockRunning) fx.push({ kind: "clock.pause" });
      if (snapshot.timerRunning && snapshot.clockRunning) {
        fx.push({ kind: "note", message: "Paused — focus timer and study clock stopped together." });
      }
      return fx;
    }

    case "toggle":
      return planSession(snapshot, snapshot.timerRunning ? { type: "pause" } : { type: "start" });

    /* A break is rest: nothing keeps running and nothing keeps billing. */
    case "break": {
      if (!snapshot.clockSessionActive || snapshot.clockOnBreak) return fx;
      if (snapshot.timerRunning) fx.push({ kind: "timer.pause" });
      fx.push({ kind: "clock.break" });
      fx.push({ kind: "note", message: "On a break — the study clock is not recording." });
      return fx;
    }

    /* Clock Out ends the WHOLE session — no separate pause steps. */
    case "endSession": {
      if (snapshot.timerRunning) fx.push({ kind: "timer.pause" });
      if (snapshot.clockSessionActive) fx.push({ kind: "clock.out" });
      fx.push({ kind: "own.clear" });
      return fx;
    }

    case "reset": {
      fx.push({ kind: "timer.reset" });
      if (snapshot.focusOwnsClock && snapshot.clockSessionActive) {
        fx.push({ kind: "clock.out" });
        fx.push({ kind: "own.clear" });
      } else if (snapshot.clockRunning) {
        fx.push({ kind: "clock.pause" });
      }
      return fx;
    }

    case "setMode": {
      if (snapshot.timerRunning) {
        fx.push({ kind: "timer.pause" });
        if (snapshot.clockRunning) fx.push({ kind: "clock.pause" });
      }
      if (isBreakMode(command.mode) && snapshot.clockSessionActive && !snapshot.clockOnBreak) {
        fx.push({ kind: "clock.break" });
      }
      fx.push({ kind: "timer.setMode", mode: command.mode });
      return fx;
    }

    /* 00:00 on a focus block: the timer has already stopped itself, so the
       only job left is to stop billing. Break wall time never enters the
       study total because `takeBreak` banks the active segment first. */
    case "blockComplete": {
      if (snapshot.clockSessionActive && !snapshot.clockOnBreak) fx.push({ kind: "clock.break" });
      return fx;
    }

    /* The break is over: focus and the clock come back on the same task. */
    case "breakComplete": {
      if (!snapshot.focusOwnsClock) return fx;
      if (!snapshot.timerRunning) fx.push({ kind: "timer.start" });
      if (!snapshot.clockSessionActive) fx.push({ kind: "clock.in" });
      else if (snapshot.clockOnBreak) fx.push({ kind: "clock.endBreak" });
      else if (!snapshot.clockRunning) fx.push({ kind: "clock.resume" });
      fx.push({ kind: "note", message: "Break over — focus and study clock resumed together." });
      return fx;
    }

    /* Safety net: a focus-owned session may never show the two timers in
       different states. Whatever else happened, this puts them back in
       step. Idempotent — a consistent snapshot produces no effects. */
    case "reconcile": {
      if (!snapshot.focusOwnsClock) return fx;
      if (snapshot.timerIsBreak) {
        if (snapshot.clockSessionActive && !snapshot.clockOnBreak) fx.push({ kind: "clock.break" });
      } else if (snapshot.timerRunning) {
        if (snapshot.clockOnBreak) fx.push({ kind: "clock.endBreak" });
        else if (!snapshot.clockSessionActive) fx.push({ kind: "clock.in" });
        else if (!snapshot.clockRunning) fx.push({ kind: "clock.resume" });
      } else if (snapshot.clockRunning) {
        fx.push({ kind: "clock.pause" });
      }
      return fx;
    }

    default:
      return fx;
  }
}

/** The task the study clock should attach to when a session opens. */
export type SessionTaskTarget = { taskId: number | null; subjectId: number | null };

export type StudySessionApi = {
  timer: TimerApi;
  clock: ClockApi;
  /** True when Focus Mode owns the study-clock session. */
  focusOwnsClock: boolean;
  /** True while anything in the session is actually moving. */
  active: boolean;
  start: () => void;
  pause: () => void;
  toggle: () => void;
  takeBreak: () => void;
  /** Clock Out for the whole session. */
  endSession: () => void;
  reset: () => void;
  setMode: (mode: TimerMode) => void;
  run: (command: SessionCommand) => void;
};

const LONG_BREAK_KEY = "spp-long-break-after";

function readLongBreakAfter(): number {
  try {
    const raw = window.localStorage.getItem(LONG_BREAK_KEY);
    if (raw) return Math.min(8, Math.max(2, Number(raw) || 4));
  } catch { /* private mode */ }
  return 4;
}

/**
 * Binds the two existing hooks into one session. Every surface — Focus
 * Studio, Zen, the tracker bar and the command palette — drives the study
 * session through the object this returns, so they can never disagree.
 */
export function useStudySession({
  timer,
  clock,
  pickTask,
  onEvent,
  autoFlow = true,
}: {
  timer: TimerApi;
  clock: ClockApi;
  /** Called when a session opens without an explicit task. */
  pickTask: () => SessionTaskTarget;
  onEvent?: (message: string) => void;
  /** Pomodoro → break → pomodoro chaining. Off for stopwatch/custom modes. */
  autoFlow?: boolean;
}): StudySessionApi {
  const [focusOwnsClock, setFocusOwnsClock] = useState(false);

  // The hook objects are rebuilt every render; refs keep `run` stable so it
  // can be used as an effect dependency without re-firing every frame.
  const timerRef = useRef(timer);
  const clockRef = useRef(clock);
  const pickTaskRef = useRef(pickTask);
  const onEventRef = useRef(onEvent);
  const ownsRef = useRef(false);
  const [longBreakAfter, setLongBreakAfter] = useState(4);

  // Declared FIRST so it commits before any effect below can call `run`:
  // the stable callback then always reads the newest hook objects. Refs are
  // written in an effect rather than during render, per the React contract.
  useEffect(() => {
    timerRef.current = timer;
    clockRef.current = clock;
    pickTaskRef.current = pickTask;
    onEventRef.current = onEvent;
  });

  useEffect(() => {
    const id = window.setTimeout(() => setLongBreakAfter(readLongBreakAfter()), 0);
    return () => window.clearTimeout(id);
  }, []);

  const claim = useCallback((value: boolean) => {
    ownsRef.current = value;
    setFocusOwnsClock(value);
  }, []);

  const run = useCallback((command: SessionCommand) => {
    const snapshot = snapshotOf(timerRef.current, clockRef.current, ownsRef.current);
    for (const effect of planSession(snapshot, command)) {
      switch (effect.kind) {
        case "timer.start": timerRef.current.start(); break;
        case "timer.pause": timerRef.current.pause(); break;
        case "timer.reset": timerRef.current.reset(); break;
        case "timer.setMode": timerRef.current.setMode(effect.mode); break;
        case "clock.in": {
          const target = pickTaskRef.current();
          clockRef.current.clockIn({ taskId: target.taskId, subjectId: target.subjectId });
          break;
        }
        case "clock.pause": clockRef.current.pause(); break;
        case "clock.resume": clockRef.current.resume(); break;
        case "clock.break": clockRef.current.takeBreak(); break;
        case "clock.endBreak": clockRef.current.endBreak(); break;
        case "clock.out": clockRef.current.clockOut(); break;
        case "own.focus": claim(true); break;
        case "own.clear": claim(false); break;
        case "note": onEventRef.current?.(effect.message); break;
      }
    }
  }, [claim]);

  /* ── Mode transitions are the one place the two timers change state on
        their own, so they are the one thing worth watching: entering a break
        stops the billing, and a break that RAN OUT restarts the session. A
        break the learner switches away from by hand does not auto-start. ── */
  const previousTimer = useRef({ mode: timer.mode, seconds: timer.seconds });
  useEffect(() => {
    const was = previousTimer.current;
    previousTimer.current = { mode: timer.mode, seconds: timer.seconds };
    if (was.mode === timer.mode) return;
    if (isBreakMode(timer.mode) && !isBreakMode(was.mode)) {
      run({ type: "blockComplete" });
    } else if (!isBreakMode(timer.mode) && isBreakMode(was.mode) && was.seconds === 0 && ownsRef.current) {
      run({ type: "breakComplete" });
    }
  }, [timer.mode, timer.seconds, run]);

  /* ── Auto-flow: a finished block rolls into a break, a finished break
        rolls back into focus. It drives the Focus Studio AND Zen, which is
        why it lives with the session rather than inside one view. ── */
  useEffect(() => {
    if (!autoFlow) return;
    if (timer.running || timer.mode === "stopwatch" || timer.mode === "custom") return;
    if (timer.seconds !== 0) return;
    const id = window.setTimeout(() => {
      if (timer.mode === "pomodoro") {
        const every = Math.max(2, longBreakAfter);
        timer.setMode(timer.cycles > 0 && timer.cycles % every === 0 ? "long" : "short");
      } else {
        timer.setMode("pomodoro");
      }
    }, 900);
    return () => window.clearTimeout(id);
  }, [autoFlow, longBreakAfter, timer]);

  /* ── The invariant. A focus-owned session can never show a paused focus
        timer over a recording clock (or the other way round). ── */
  useEffect(() => {
    if (!focusOwnsClock) return;
    run({ type: "reconcile" });
  }, [focusOwnsClock, timer.running, timer.isBreak, clock.running, clock.sessionActive, clock.onBreak, run]);

  const start = useCallback(() => run({ type: "start" }), [run]);
  const pause = useCallback(() => run({ type: "pause" }), [run]);
  const toggle = useCallback(() => run({ type: "toggle" }), [run]);
  const takeBreak = useCallback(() => run({ type: "break" }), [run]);
  const endSession = useCallback(() => run({ type: "endSession" }), [run]);
  const reset = useCallback(() => run({ type: "reset" }), [run]);
  const setMode = useCallback((mode: TimerMode) => run({ type: "setMode", mode }), [run]);

  return {
    timer,
    clock,
    focusOwnsClock,
    active: timer.running || clock.running,
    start, pause, toggle, takeBreak, endSession, reset, setMode, run,
  };
}
