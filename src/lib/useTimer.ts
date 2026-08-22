"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export function mmss(sec: number): string {
  const s = Math.max(0, Math.floor(sec));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const r = s % 60;
  if (h > 0) return `${h}:${`${m}`.padStart(2, "0")}:${`${r}`.padStart(2, "0")}`;
  return `${`${m}`.padStart(2, "0")}:${`${r}`.padStart(2, "0")}`;
}

function beep(freq = 880) {
  try {
    const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const ac = new AC();
    const o = ac.createOscillator();
    const g = ac.createGain();
    o.connect(g); g.connect(ac.destination);
    o.frequency.value = freq; g.gain.value = 0.12;
    o.start();
    setTimeout(() => { o.stop(); ac.close(); }, 450);
  } catch { /* ignore */ }
}

/* =========================================================================
   STUDY CLOCK — the attendance/time-tracking system.
   Completely independent of the Focus Studio pomodoro timer.
   Clock In → counts up and logs real studied minutes to the server.
========================================================================= */

export type ClockApi = {
  running: boolean;
  onBreak: boolean;
  /** True while a session is open (recording, paused, or on break). */
  sessionActive: boolean;
  elapsed: number;          // seconds in the current session (survives pause, clears on clock-out)
  sessionTotal: number;     // seconds accumulated today in this browser session
  subjectId: number | null;
  taskId: number | null;
  setSubjectId: (v: number | null) => void;
  setTaskId: (v: number | null) => void;
  clockIn: (opts?: { subjectId?: number | null; taskId?: number | null }) => void;
  pause: () => void;
  resume: () => void;
  takeBreak: () => void;
  endBreak: () => void;
  clockOut: () => void;
  toggle: () => void;
};

export function useStudyClock(
  onLog: (minutes: number, subjectId: number | null, taskId: number | null, mode: string) => void
): ClockApi {
  const [running, setRunning] = useState(false);
  const [onBreak, setOnBreak] = useState(false);
  const [sessionOpen, setSessionOpen] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [sessionTotal, setSessionTotal] = useState(0);
  const [subjectId, setSubjectId] = useState<number | null>(null);
  const [taskId, setTaskId] = useState<number | null>(null);

  // Display time and billable/logged time are deliberately separate. The old
  // clock reused one wall-clock timestamp for both, which meant clocking out
  // after a pause accidentally counted the entire pause/break as study time.
  const accumulatedActiveMs = useRef(0);
  const segmentStartedAt = useRef<number | null>(null);
  const lastUnloggedAt = useRef<number | null>(null);
  const pendingLogMs = useRef(0);
  const runningRef = useRef(false);
  const sessionOpenRef = useRef(false);
  const meta = useRef({ subjectId: null as number | null, taskId: null as number | null });
  const logRef = useRef(onLog);

  useEffect(() => { logRef.current = onLog; }, [onLog]);
  useEffect(() => { meta.current = { subjectId, taskId }; }, [subjectId, taskId]);

  const changeRunning = useCallback((value: boolean) => {
    runningRef.current = value;
    setRunning(value);
  }, []);
  const changeBreak = useCallback((value: boolean) => {
    setOnBreak(value);
  }, []);
  const changeSessionOpen = useCallback((value: boolean) => {
    sessionOpenRef.current = value;
    setSessionOpen(value);
  }, []);

  const emitPending = useCallback((fullMinutesOnly: boolean) => {
    const available = pendingLogMs.current;
    const emitMs = fullMinutesOnly
      ? Math.floor(available / 60_000) * 60_000
      : available >= 1_000 ? available : 0;
    if (emitMs <= 0) return;
    pendingLogMs.current = Math.max(0, available - emitMs);
    const minutes = Math.round((emitMs / 60_000) * 100) / 100;
    setSessionTotal((value) => value + Math.round(emitMs / 1000));
    logRef.current(minutes, meta.current.subjectId, meta.current.taskId, "clock");
  }, []);

  /** Bank only an ACTIVE segment. Paused/break wall time never enters here. */
  const bankActiveSegment = useCallback((now = Date.now()) => {
    if (segmentStartedAt.current != null) {
      accumulatedActiveMs.current += Math.max(0, now - segmentStartedAt.current);
      segmentStartedAt.current = null;
    }
    if (lastUnloggedAt.current != null) {
      pendingLogMs.current += Math.max(0, now - lastUnloggedAt.current);
      lastUnloggedAt.current = null;
    }
    setElapsed(Math.floor(accumulatedActiveMs.current / 1000));
  }, []);

  // Tick from wall-clock so active time remains accurate in throttled tabs.
  useEffect(() => {
    if (!running) return;
    const id = window.setInterval(() => {
      if (segmentStartedAt.current == null) return;
      const now = Date.now();
      setElapsed(Math.floor((accumulatedActiveMs.current + now - segmentStartedAt.current) / 1000));

      if (lastUnloggedAt.current != null) {
        pendingLogMs.current += Math.max(0, now - lastUnloggedAt.current);
        lastUnloggedAt.current = now;
        emitPending(true);
      }
    }, 1000);
    return () => window.clearInterval(id);
  }, [running, emitPending]);

  // Bank active time before a mobile browser suspends JavaScript. The segment
  // remains running, so elapsed display continues correctly when it wakes.
  useEffect(() => {
    if (!running) return;
    const onVisibility = () => {
      if (document.visibilityState !== "hidden" || lastUnloggedAt.current == null) return;
      const now = Date.now();
      pendingLogMs.current += Math.max(0, now - lastUnloggedAt.current);
      lastUnloggedAt.current = now;
      emitPending(false);
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, [running, emitPending]);

  const clockIn = useCallback((opts?: { subjectId?: number | null; taskId?: number | null }) => {
    // Switching lessons closes only the old ACTIVE segment. If the old session
    // was paused/on-break, none of that idle wall time is logged.
    if (runningRef.current) bankActiveSegment();
    emitPending(false);

    if (opts && "subjectId" in opts) setSubjectId(opts.subjectId ?? null);
    if (opts && "taskId" in opts) setTaskId(opts.taskId ?? null);
    if (opts) {
      meta.current = {
        subjectId: opts.subjectId !== undefined ? opts.subjectId : meta.current.subjectId,
        taskId: opts.taskId !== undefined ? opts.taskId : meta.current.taskId,
      };
    }

    accumulatedActiveMs.current = 0;
    pendingLogMs.current = 0;
    const now = Date.now();
    segmentStartedAt.current = now;
    lastUnloggedAt.current = now;
    setElapsed(0);
    changeBreak(false);
    changeSessionOpen(true);
    changeRunning(true);
  }, [bankActiveSegment, changeBreak, changeRunning, changeSessionOpen, emitPending]);

  const pause = useCallback(() => {
    if (!runningRef.current) return;
    bankActiveSegment();
    emitPending(false);
    changeRunning(false);
  }, [bankActiveSegment, changeRunning, emitPending]);

  const resume = useCallback(() => {
    if (!sessionOpenRef.current || runningRef.current) return;
    const now = Date.now();
    segmentStartedAt.current = now;
    lastUnloggedAt.current = now;
    changeBreak(false);
    changeRunning(true);
  }, [changeBreak, changeRunning]);

  const takeBreak = useCallback(() => {
    if (!sessionOpenRef.current) return;
    if (runningRef.current) {
      bankActiveSegment();
      emitPending(false);
    }
    changeRunning(false);
    changeBreak(true);
    beep(660);
  }, [bankActiveSegment, changeBreak, changeRunning, emitPending]);

  const endBreak = useCallback(() => {
    if (!sessionOpenRef.current) return;
    resume();
  }, [resume]);

  const clockOut = useCallback(() => {
    if (!sessionOpenRef.current) return;
    if (runningRef.current) bankActiveSegment();
    emitPending(false);
    changeRunning(false);
    changeBreak(false);
    changeSessionOpen(false);
    accumulatedActiveMs.current = 0;
    segmentStartedAt.current = null;
    lastUnloggedAt.current = null;
    pendingLogMs.current = 0;
    setElapsed(0);
  }, [bankActiveSegment, changeBreak, changeRunning, changeSessionOpen, emitPending]);

  const toggle = useCallback(() => {
    if (runningRef.current) pause();
    else if (sessionOpenRef.current) resume();
    else clockIn();
  }, [clockIn, pause, resume]);

  return {
    running, onBreak, sessionActive: sessionOpen, elapsed, sessionTotal, subjectId, taskId,
    setSubjectId, setTaskId, clockIn, pause, resume, takeBreak, endBreak, clockOut, toggle,
  };
}

/* =========================================================================
   FOCUS TIMER — the Pomodoro / deep-work ritual in the Focus Studio.
   Purely a countdown. It never starts the clock and the clock never
   starts it. It can optionally log its own completed focus blocks.
========================================================================= */

export type TimerMode = "pomodoro" | "short" | "long" | "stopwatch" | "custom";

export type TimerApi = {
  mode: TimerMode;
  running: boolean;
  seconds: number;
  total: number;
  cycles: number;
  customMin: number;
  setCustomMin: (n: number) => void;
  setMode: (m: TimerMode) => void;
  start: () => void;
  pause: () => void;
  toggle: () => void;
  reset: () => void;
  isBreak: boolean;
};

export function useFocusTimer(
  durations: { pomodoro: number; shortBreak: number; longBreak: number },
  onBlockComplete?: (mode: TimerMode, minutes: number) => void
): TimerApi {
  const [mode, setModeState] = useState<TimerMode>("pomodoro");
  const [running, setRunning] = useState(false);
  const [customMin, setCustomMin] = useState(50);
  const [seconds, setSeconds] = useState(durations.pomodoro * 60);
  const [total, setTotal] = useState(durations.pomodoro * 60);
  const [cycles, setCycles] = useState(0);

  const deadline = useRef<number | null>(null);
  const startedAt = useRef<number | null>(null);
  const completeRef = useRef(onBlockComplete);
  useEffect(() => { completeRef.current = onBlockComplete; }, [onBlockComplete]);

  const isBreak = mode === "short" || mode === "long";

  const durFor = useCallback(
    (m: TimerMode) => {
      if (m === "pomodoro") return Math.max(1, durations.pomodoro) * 60;
      if (m === "short") return Math.max(1, durations.shortBreak) * 60;
      if (m === "long") return Math.max(1, durations.longBreak) * 60;
      if (m === "custom") return Math.max(1, customMin) * 60;
      return 0;
    },
    [durations.pomodoro, durations.shortBreak, durations.longBreak, customMin]
  );

  // Reset the displayed time whenever the mode or configured length changes
  // while idle. The "previous value in state" pattern keeps this out of an
  // effect (and avoids the cascading renders effects can introduce).
  const [idleSnapshot, setIdleSnapshot] = useState(() => ({
    mode,
    running,
    total: durFor(mode),
  }));
  {
    const d = durFor(mode);
    if (idleSnapshot.mode !== mode || idleSnapshot.running !== running || idleSnapshot.total !== d) {
      setIdleSnapshot({ mode, running, total: d });
      if (!running) {
        setSeconds(mode === "stopwatch" ? 0 : d);
        setTotal(mode === "stopwatch" ? 3600 : d);
      }
    }
  }

  useEffect(() => {
    if (!running) return;
    const id = setInterval(() => {
      if (mode === "stopwatch") {
        if (startedAt.current == null) return;
        setSeconds(Math.floor((Date.now() - startedAt.current) / 1000));
        return;
      }
      if (deadline.current == null) return;
      const left = Math.round((deadline.current - Date.now()) / 1000);
      if (left <= 0) {
        setSeconds(0);
        setRunning(false);
        deadline.current = null;
        beep(isBreak ? 660 : 920);
        const mins = Math.round(durFor(mode) / 60);
        if (!isBreak) setCycles((c) => c + 1);
        completeRef.current?.(mode, mins);
      } else {
        setSeconds(left);
      }
    }, 250);
    return () => clearInterval(id);
  }, [running, mode, isBreak, durFor]);

  const start = useCallback(() => {
    if (mode === "stopwatch") {
      startedAt.current = Date.now() - seconds * 1000;
    } else {
      const remaining = seconds > 0 ? seconds : durFor(mode);
      deadline.current = Date.now() + remaining * 1000;
      setSeconds(remaining);
    }
    setRunning(true);
  }, [mode, seconds, durFor]);

  const pause = useCallback(() => {
    setRunning(false);
    deadline.current = null;
  }, []);

  const toggle = useCallback(() => {
    if (running) pause();
    else start();
  }, [running, pause, start]);

  const reset = useCallback(() => {
    setRunning(false);
    deadline.current = null;
    startedAt.current = null;
    const d = durFor(mode);
    setSeconds(mode === "stopwatch" ? 0 : d);
    setTotal(mode === "stopwatch" ? 3600 : d);
  }, [durFor, mode]);

  const setMode = useCallback((m: TimerMode) => {
    setRunning(false);
    deadline.current = null;
    startedAt.current = null;
    setModeState(m);
  }, []);

  return {
    mode, running, seconds, total, cycles, customMin, setCustomMin,
    setMode, start, pause, toggle, reset, isBreak,
  };
}
