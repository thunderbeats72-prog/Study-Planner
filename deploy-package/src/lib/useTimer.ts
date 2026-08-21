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
  elapsed: number;          // seconds in the current session
  sessionTotal: number;     // seconds accumulated today in this browser session
  subjectId: number | null;
  taskId: number | null;
  setSubjectId: (v: number | null) => void;
  setTaskId: (v: number | null) => void;
  clockIn: (opts?: { subjectId?: number | null; taskId?: number | null }) => void;
  pause: () => void;
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
  const [elapsed, setElapsed] = useState(0);
  const [sessionTotal, setSessionTotal] = useState(0);
  const [subjectId, setSubjectId] = useState<number | null>(null);
  const [taskId, setTaskId] = useState<number | null>(null);

  const startedAt = useRef<number | null>(null);
  const lastFlushAt = useRef<number | null>(null);
  const meta = useRef({ subjectId: null as number | null, taskId: null as number | null });
  const logRef = useRef(onLog);
  useEffect(() => { logRef.current = onLog; }, [onLog]);
  useEffect(() => { meta.current = { subjectId, taskId }; }, [subjectId, taskId]);

  // tick from wall-clock so the count stays correct in background tabs.
  // Display shows total current-session time; DB logging flushes only the
  // newly elapsed minutes, so the visible timer never resets at 01:00.
  useEffect(() => {
    if (!running) return;
    const id = setInterval(() => {
      if (startedAt.current == null) return;
      const now = Date.now();
      const displaySecs = Math.floor((now - startedAt.current) / 1000);
      setElapsed(displaySecs);

      const flushBase = lastFlushAt.current ?? startedAt.current;
      const newSecs = Math.floor((now - flushBase) / 1000);
      if (newSecs >= 60) {
        const mins = Math.floor(newSecs / 60);
        logRef.current(mins, meta.current.subjectId, meta.current.taskId, "clock");
        // advance exactly by the minutes we logged — no drift accrues
        lastFlushAt.current = flushBase + mins * 60000;
        setSessionTotal((v) => v + mins * 60);
      }
    }, 1000);
    return () => clearInterval(id);
  }, [running]);

  const flush = useCallback((keepAlive = false) => {
    const now = Date.now();
    const base = lastFlushAt.current ?? startedAt.current;
    const secs = base ? Math.floor((now - base) / 1000) : 0;
    // two-decimal fractional minutes: 13m30s → exactly 13.5 logged
    const mins = Math.round((secs / 60) * 100) / 100;
    if (!keepAlive) {
      startedAt.current = null;
      lastFlushAt.current = null;
      setElapsed(0);
    } else {
      // background-tab safeguard: bank the elapsed time but keep the
      // session alive so the visible timer doesn't reset
      lastFlushAt.current = now;
    }
    if (secs >= 10) {
      setSessionTotal((v) => v + secs);
      logRef.current(mins, meta.current.subjectId, meta.current.taskId, "clock");
    }
  }, []);

  // Mobile/tab-suspend safety net: when the tab hides, bank whatever has
  // elapsed since the last flush. Browsers throttle or kill timers in
  // hidden tabs — this guarantees 13.5 minutes studied logs as 13.5.
  useEffect(() => {
    if (!running) return;
    const onVis = () => {
      if (document.visibilityState === "hidden") flush(true);
    };
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, [running, flush]);

  const clockIn = useCallback((opts?: { subjectId?: number | null; taskId?: number | null }) => {
    if (opts && "subjectId" in opts) setSubjectId(opts.subjectId ?? null);
    if (opts && "taskId" in opts) setTaskId(opts.taskId ?? null);
    if (opts) {
      meta.current = {
        subjectId: opts.subjectId !== undefined ? opts.subjectId : meta.current.subjectId,
        taskId: opts.taskId !== undefined ? opts.taskId : meta.current.taskId,
      };
    }
    startedAt.current = Date.now();
    lastFlushAt.current = startedAt.current;
    setElapsed(0);
    setOnBreak(false);
    setRunning(true);
  }, []);

  const pause = useCallback(() => {
    setRunning(false);
    flush();
  }, [flush]);

  const takeBreak = useCallback(() => {
    setRunning(false);
    flush();
    setOnBreak(true);
    beep(660);
  }, [flush]);

  const endBreak = useCallback(() => {
    setOnBreak(false);
    startedAt.current = Date.now();
    lastFlushAt.current = startedAt.current;
    setElapsed(0);
    setRunning(true);
  }, []);

  const clockOut = useCallback(() => {
    setRunning(false);
    setOnBreak(false);
    flush();
  }, [flush]);

  const toggle = useCallback(() => {
    if (running) pause();
    else clockIn();
  }, [running, pause, clockIn]);

  return {
    running, onBreak, elapsed, sessionTotal, subjectId, taskId,
    setSubjectId, setTaskId, clockIn, pause, takeBreak, endBreak, clockOut, toggle,
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
