"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { ClockApi, TimerApi, TimerMode } from "./useTimer";

/* One controller for Focus + Study Clock. Focus-owned sessions keep the two
   timers synchronized; manual clock sessions remain independent until the
   learner explicitly clocks out. */
export function isBreakMode(mode: TimerMode): boolean { return mode === "short" || mode === "long"; }

export type SessionSnapshot = {
  timerRunning: boolean;
  timerIsBreak: boolean;
  clockRunning: boolean;
  clockSessionActive: boolean;
  clockOnBreak: boolean;
  focusOwnsClock: boolean;
};

export function snapshotOf(timer: TimerApi, clock: ClockApi, focusOwnsClock: boolean): SessionSnapshot {
  return { timerRunning: timer.running, timerIsBreak: timer.isBreak, clockRunning: clock.running, clockSessionActive: clock.sessionActive, clockOnBreak: clock.onBreak, focusOwnsClock };
}

export type SessionCommand =
  | { type: "start" } | { type: "pause" } | { type: "toggle" } | { type: "break" }
  | { type: "endSession" } | { type: "reset" } | { type: "setMode"; mode: TimerMode }
  | { type: "blockComplete" } | { type: "breakComplete" } | { type: "reconcile" };

export type SessionEffect =
  | { kind: "timer.start" } | { kind: "timer.pause" } | { kind: "timer.reset" }
  | { kind: "timer.setMode"; mode: TimerMode } | { kind: "clock.in" } | { kind: "clock.pause" }
  | { kind: "clock.resume" } | { kind: "clock.break" } | { kind: "clock.endBreak" }
  | { kind: "clock.out" } | { kind: "own.focus" } | { kind: "own.clear" }
  | { kind: "note"; message: string };

export function effectKinds(effects: readonly SessionEffect[]): SessionEffect["kind"][] { return effects.map((effect) => effect.kind); }

export function planSession(snapshot: SessionSnapshot, command: SessionCommand): SessionEffect[] {
  const fx: SessionEffect[] = [];
  const claimOwnership = () => { if (!snapshot.focusOwnsClock) fx.push({ kind: "own.focus" }); };

  switch (command.type) {
    case "start": {
      if (!snapshot.timerRunning) fx.push({ kind: "timer.start" });
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
    case "pause": {
      if (snapshot.timerRunning) fx.push({ kind: "timer.pause" });
      if (snapshot.focusOwnsClock && snapshot.clockRunning) fx.push({ kind: "clock.pause" });
      if (snapshot.focusOwnsClock && snapshot.timerRunning && snapshot.clockRunning) fx.push({ kind: "note", message: "Paused — focus timer and study clock stopped together." });
      return fx;
    }
    case "toggle": return planSession(snapshot, snapshot.timerRunning ? { type: "pause" } : { type: "start" });
    case "break": {
      if (!snapshot.focusOwnsClock || !snapshot.clockSessionActive || snapshot.clockOnBreak) return fx;
      if (snapshot.timerRunning) fx.push({ kind: "timer.pause" });
      fx.push({ kind: "clock.break" }, { kind: "note", message: "On a break — study time is paused." });
      return fx;
    }
    case "endSession": {
      if (snapshot.timerRunning) fx.push({ kind: "timer.pause" });
      /* Clock Out must work for manual clock sessions too. Focus ownership
         only determines who is allowed to auto-pause/control the clock. */
      if (snapshot.clockSessionActive) fx.push({ kind: "clock.out" });
      if (snapshot.focusOwnsClock) fx.push({ kind: "own.clear" });
      return fx;
    }
    case "reset": {
      fx.push({ kind: "timer.reset" });
      if (snapshot.focusOwnsClock && snapshot.clockSessionActive) {
        fx.push({ kind: "clock.out" }, { kind: "own.clear" });
      }
      return fx;
    }
    case "setMode": {
      if (snapshot.focusOwnsClock && snapshot.timerRunning) {
        fx.push({ kind: "timer.pause" });
        if (snapshot.clockRunning) fx.push({ kind: "clock.pause" });
      }
      if (snapshot.focusOwnsClock && isBreakMode(command.mode) && snapshot.clockSessionActive && !snapshot.clockOnBreak) fx.push({ kind: "clock.break" });
      fx.push({ kind: "timer.setMode", mode: command.mode });
      return fx;
    }
    case "blockComplete": {
      if (snapshot.focusOwnsClock && snapshot.clockSessionActive && !snapshot.clockOnBreak) fx.push({ kind: "clock.break" });
      return fx;
    }
    case "breakComplete": {
      if (!snapshot.focusOwnsClock) return fx;
      if (!snapshot.timerRunning) fx.push({ kind: "timer.start" });
      if (!snapshot.clockSessionActive) fx.push({ kind: "clock.in" });
      else if (snapshot.clockOnBreak) fx.push({ kind: "clock.endBreak" });
      else if (!snapshot.clockRunning) fx.push({ kind: "clock.resume" });
      fx.push({ kind: "note", message: "Break over — focus and study clock resumed together." });
      return fx;
    }
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
    default: return fx;
  }
}

export type SessionTaskTarget = { taskId: number | null; subjectId: number | null };
export type StudySessionApi = {
  timer: TimerApi; clock: ClockApi; focusOwnsClock: boolean; active: boolean;
  start: () => void; pause: () => void; toggle: () => void; takeBreak: () => void;
  endSession: () => void; reset: () => void; setMode: (mode: TimerMode) => void;
  run: (command: SessionCommand) => void;
};

const LONG_BREAK_KEY = "spp-long-break-after";
function readLongBreakAfter(): number {
  try { const raw = window.localStorage.getItem(LONG_BREAK_KEY); if (raw) return Math.min(8, Math.max(2, Number(raw) || 4)); } catch { /* private mode */ }
  return 4;
}

export function useStudySession({ timer, clock, pickTask, onEvent, autoFlow = true }: {
  timer: TimerApi; clock: ClockApi; pickTask: () => SessionTaskTarget; onEvent?: (message: string) => void; autoFlow?: boolean;
}): StudySessionApi {
  const [focusOwnsClock, setFocusOwnsClock] = useState(false);
  const timerRef = useRef(timer); const clockRef = useRef(clock); const pickTaskRef = useRef(pickTask); const onEventRef = useRef(onEvent); const ownsRef = useRef(false);
  const [longBreakAfter, setLongBreakAfter] = useState(4);

  useEffect(() => { timerRef.current = timer; clockRef.current = clock; pickTaskRef.current = pickTask; onEventRef.current = onEvent; });
  useEffect(() => { const id = window.setTimeout(() => setLongBreakAfter(readLongBreakAfter()), 0); return () => window.clearTimeout(id); }, []);

  const claim = useCallback((value: boolean) => { ownsRef.current = value; setFocusOwnsClock(value); }, []);
  const run = useCallback((command: SessionCommand) => {
    const snapshot = snapshotOf(timerRef.current, clockRef.current, ownsRef.current);
    for (const effect of planSession(snapshot, command)) {
      switch (effect.kind) {
        case "timer.start": timerRef.current.start(); break;
        case "timer.pause": timerRef.current.pause(); break;
        case "timer.reset": timerRef.current.reset(); break;
        case "timer.setMode": timerRef.current.setMode(effect.mode); break;
        case "clock.in": { const target = pickTaskRef.current(); clockRef.current.clockIn({ taskId: target.taskId, subjectId: target.subjectId }); break; }
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

  const previousTimer = useRef({ mode: timer.mode, seconds: timer.seconds });
  useEffect(() => {
    const was = previousTimer.current; previousTimer.current = { mode: timer.mode, seconds: timer.seconds };
    if (was.mode === timer.mode) return;
    if (isBreakMode(timer.mode) && !isBreakMode(was.mode)) run({ type: "blockComplete" });
    else if (!isBreakMode(timer.mode) && isBreakMode(was.mode) && was.seconds === 0 && ownsRef.current) run({ type: "breakComplete" });
  }, [timer.mode, timer.seconds, run]);

  useEffect(() => {
    if (!autoFlow || !ownsRef.current) return;
    if (timer.running || timer.mode === "stopwatch" || timer.mode === "custom" || timer.seconds !== 0) return;
    const id = window.setTimeout(() => {
      if (timer.mode === "pomodoro") {
        const every = Math.max(2, longBreakAfter);
        timer.setMode(timer.cycles > 0 && timer.cycles % every === 0 ? "long" : "short");
      } else timer.setMode("pomodoro");
    }, 900);
    return () => window.clearTimeout(id);
  }, [autoFlow, longBreakAfter, timer]);

  useEffect(() => { if (focusOwnsClock) run({ type: "reconcile" }); }, [focusOwnsClock, timer.running, timer.isBreak, clock.running, clock.sessionActive, clock.onBreak, run]);

  const start = useCallback(() => run({ type: "start" }), [run]);
  const pause = useCallback(() => run({ type: "pause" }), [run]);
  const toggle = useCallback(() => run({ type: "toggle" }), [run]);
  const takeBreak = useCallback(() => run({ type: "break" }), [run]);
  const endSession = useCallback(() => run({ type: "endSession" }), [run]);
  const reset = useCallback(() => run({ type: "reset" }), [run]);
  const setMode = useCallback((mode: TimerMode) => run({ type: "setMode", mode }), [run]);

  return { timer, clock, focusOwnsClock, active: focusOwnsClock && (timer.running || clock.running), start, pause, toggle, takeBreak, endSession, reset, setMode, run };
}
