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

   The clock has two different kinds of state:
     • the active segment is measured from timestamps, not interval ticks;
     • whole minutes are flushed to the existing session ledger while the
       session is open, with the fractional remainder held locally.

   The open session snapshot is kept in localStorage. That is deliberately
   client-side: a refresh must not close a session or create a second one,
   while the existing /api/sessions route remains the one write path for the
   durable session ledger.
========================================================================= */

const ACTIVE_CLOCK_KEY = "spp-active-study-clock";
const ACTIVE_CLOCK_VERSION = 1;

type StoredClock = {
  version: number;
  sessionId: string;
  running: boolean;
  onBreak: boolean;
  subjectId: number | null;
  taskId: number | null;
  accumulatedActiveMs: number;
  segmentStartedAt: number | null;
  lastUnloggedAt: number | null;
  pendingLogMs: number;
  updatedAt: number;
};

function storage(): Storage | null {
  try {
    return typeof window !== "undefined" && window.localStorage
      ? window.localStorage
      : null;
  } catch {
    return null;
  }
}

function readStoredClock(): StoredClock | null {
  const store = storage();
  if (!store) return null;
  try {
    const raw = store.getItem(ACTIVE_CLOCK_KEY);
    if (!raw) return null;
    const value = JSON.parse(raw) as Partial<StoredClock>;
    const accumulatedActiveMs = Number(value.accumulatedActiveMs);
    if (
      value.version !== ACTIVE_CLOCK_VERSION ||
      typeof value.sessionId !== "string" ||
      !value.sessionId ||
      typeof value.running !== "boolean" ||
      typeof value.onBreak !== "boolean" ||
      !Number.isFinite(accumulatedActiveMs) ||
      accumulatedActiveMs < 0
    ) return null;
    const segmentStartedAt = value.segmentStartedAt == null ? null : Number(value.segmentStartedAt);
    const lastUnloggedAt = value.lastUnloggedAt == null ? null : Number(value.lastUnloggedAt);
    if (
      (segmentStartedAt != null && (!Number.isFinite(segmentStartedAt) || segmentStartedAt < 0)) ||
      (lastUnloggedAt != null && (!Number.isFinite(lastUnloggedAt) || lastUnloggedAt < 0))
    ) return null;
    return {
      version: ACTIVE_CLOCK_VERSION,
      sessionId: value.sessionId,
      running: value.running,
      onBreak: value.onBreak,
      subjectId: value.subjectId == null ? null : Number(value.subjectId),
      taskId: value.taskId == null ? null : Number(value.taskId),
      accumulatedActiveMs,
      segmentStartedAt,
      lastUnloggedAt,
      pendingLogMs: Number(value.pendingLogMs) >= 0 ? Number(value.pendingLogMs) : 0,
      updatedAt: Number(value.updatedAt) || 0,
    };
  } catch {
    return null;
  }
}

function writeStoredClock(value: StoredClock): void {
  const store = storage();
  if (!store) return;
  try {
    store.setItem(ACTIVE_CLOCK_KEY, JSON.stringify(value));
  } catch {
    /* Private mode / full storage: the in-memory clock still works. */
  }
}

function clearStoredClock(sessionId?: string): void {
  const store = storage();
  if (!store) return;
  try {
    if (!sessionId) {
      store.removeItem(ACTIVE_CLOCK_KEY);
      return;
    }
    const current = readStoredClock();
    if (!current || current.sessionId === sessionId) store.removeItem(ACTIVE_CLOCK_KEY);
  } catch {
    /* ignore storage failures */
  }
}

function newSessionId(): string {
  try {
    if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
      return `study_${crypto.randomUUID()}`;
    }
  } catch { /* fall through */ }
  return `study_${Date.now()}_${Math.random().toString(36).slice(2)}`;
}

export type ClockApi = {
  running: boolean;
  onBreak: boolean;
  /** True while a session is open (recording, paused, or on break). */
  sessionActive: boolean;
  elapsed: number;          // active seconds in the current session (survives pause and refresh)
  sessionTotal: number;     // seconds flushed to the durable session ledger during this mount
  /** Active seconds of the open session not yet represented in saved
   *  sessions. It includes the fractional remainder and is timestamp-based,
   *  so views can show the total logged value while the session is live. */
  pendingSeconds: number;
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
  onLog: (minutes: number, subjectId: number | null, taskId: number | null, mode: string) => void,
): ClockApi {
  const [running, setRunning] = useState(false);
  const [onBreak, setOnBreak] = useState(false);
  const [sessionOpen, setSessionOpen] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [sessionTotal, setSessionTotal] = useState(0);
  const [pendingSeconds, setPendingSeconds] = useState(0);
  const [subjectId, setSubjectId] = useState<number | null>(null);
  const [taskId, setTaskId] = useState<number | null>(null);
  const [storageReady, setStorageReady] = useState(false);

  // Display time and billable/logged time are deliberately separate. The
  // active segment is always measured against Date.now(), so throttled tabs
  // and refreshes cannot lose time or count a pause as study.
  const accumulatedActiveMs = useRef(0);
  const segmentStartedAt = useRef<number | null>(null);
  const lastUnloggedAt = useRef<number | null>(null);
  const pendingLogMs = useRef(0);
  const runningRef = useRef(false);
  const sessionOpenRef = useRef(false);
  const sessionIdRef = useRef<string | null>(null);
  const meta = useRef({ subjectId: null as number | null, taskId: null as number | null });
  const logRef = useRef(onLog);

  useEffect(() => { logRef.current = onLog; }, [onLog]);
  useEffect(() => { meta.current = { subjectId, taskId }; }, [subjectId, taskId]);

  const activeMsAt = useCallback((now = Date.now()) => {
    const current =
      segmentStartedAt.current == null
        ? 0
        : Math.max(0, now - segmentStartedAt.current);
    return Math.max(0, accumulatedActiveMs.current + current);
  }, []);

  const persistSnapshot = useCallback((breakState = onBreak) => {
    if (!sessionOpenRef.current || !sessionIdRef.current) return;
    writeStoredClock({
      version: ACTIVE_CLOCK_VERSION,
      sessionId: sessionIdRef.current,
      running: runningRef.current,
      onBreak: breakState,
      subjectId: meta.current.subjectId,
      taskId: meta.current.taskId,
      accumulatedActiveMs: accumulatedActiveMs.current,
      segmentStartedAt: segmentStartedAt.current,
      lastUnloggedAt: lastUnloggedAt.current,
      pendingLogMs: pendingLogMs.current,
      updatedAt: Date.now(),
    });
  }, [onBreak]);

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
      : available;
    pendingLogMs.current = Math.max(0, available - emitMs);
    setPendingSeconds(Math.floor(pendingLogMs.current / 1000));
    if (emitMs <= 0) return;
    // Keep sub-minute precision in the ledger. The source is a timestamp
    // difference in milliseconds, not an interval counter or whole-minute
    // approximation; the API stores the value to four decimal minutes.
    const minutes = Math.round((emitMs / 60_000) * 10_000) / 10_000;
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
    setPendingSeconds(Math.floor(pendingLogMs.current / 1000));
  }, []);

  // Restore an open session after a refresh before the first timer tick. A
  // timestamp is preserved rather than replacing it with Date.now(), which is
  // what keeps an inactive tab accurate.
  useEffect(() => {
    const restoreId = window.setTimeout(() => {
      const stored = readStoredClock();
      if (stored && !sessionOpenRef.current && (stored.running ? stored.segmentStartedAt != null : true)) {
        const now = Date.now();
        sessionIdRef.current = stored.sessionId;
        sessionOpenRef.current = true;
        runningRef.current = stored.running;
        accumulatedActiveMs.current = stored.accumulatedActiveMs;
        segmentStartedAt.current = stored.running ? stored.segmentStartedAt : null;
        lastUnloggedAt.current = stored.running ? stored.lastUnloggedAt : null;
        pendingLogMs.current = stored.pendingLogMs;
        const active = stored.running && stored.segmentStartedAt != null
          ? stored.accumulatedActiveMs + Math.max(0, now - stored.segmentStartedAt)
          : stored.accumulatedActiveMs;
        const pending = stored.running && stored.lastUnloggedAt != null
          ? stored.pendingLogMs + Math.max(0, now - stored.lastUnloggedAt)
          : stored.pendingLogMs;
        // Keep the original timestamps in the refs. The next tick adds only the
        // time since the saved `lastUnloggedAt`, so inactive tabs are accounted
        // for exactly once rather than by guessing how many intervals elapsed.
        setElapsed(Math.floor(active / 1000));
        setPendingSeconds(Math.floor(pending / 1000));
        setSubjectId(stored.subjectId);
        setTaskId(stored.taskId);
        meta.current = { subjectId: stored.subjectId, taskId: stored.taskId };
        setOnBreak(stored.onBreak);
        setSessionOpen(true);
        setRunning(stored.running);
      }
      setStorageReady(true);
    }, 0);
    return () => window.clearTimeout(restoreId);
  }, []);

  // Persist both active and paused sessions. The effect runs after every tick,
  // and callbacks also write immediately on clock-in/pause/clock-out so a
  // refresh between interval ticks cannot lose the timestamp.
  useEffect(() => {
    if (!storageReady) return;
    if (sessionOpen) persistSnapshot();
    // clockOut clears its own session synchronously. Do not blindly clear the
    // shared key here: another tab may already have started a new session.
    else if (sessionIdRef.current) clearStoredClock(sessionIdRef.current);
  }, [storageReady, sessionOpen, running, onBreak, elapsed, pendingSeconds, subjectId, taskId, persistSnapshot]);

  // A second tab can observe the same active session. Adopt newer snapshots
  // instead of starting an overlapping timer; removal means another tab
  // clocked out and this tab must close locally without logging twice.
  useEffect(() => {
    if (typeof window.addEventListener !== "function") return;
    const onStorage = (event: StorageEvent) => {
      if (event.key !== ACTIVE_CLOCK_KEY) return;
      const stored = event.newValue ? (() => {
        try { return JSON.parse(event.newValue) as StoredClock; } catch { return null; }
      })() : null;
      if (!stored) {
        if (sessionOpenRef.current) {
          sessionOpenRef.current = false;
          runningRef.current = false;
          sessionIdRef.current = null;
          segmentStartedAt.current = null;
          lastUnloggedAt.current = null;
          pendingLogMs.current = 0;
          setRunning(false);
          setOnBreak(false);
          setSessionOpen(false);
          setElapsed(0);
          setSessionTotal(0);
          setPendingSeconds(0);
        }
        return;
      }
      if (stored.version !== ACTIVE_CLOCK_VERSION || !stored.sessionId) return;
      // Ignore an older write from a paused render. Storage events are ordered
      // per source, but timestamps make cross-tab updates deterministic.
      const current = readStoredClock();
      if (current && current.sessionId === stored.sessionId && current.updatedAt > stored.updatedAt) return;
      sessionIdRef.current = stored.sessionId;
      sessionOpenRef.current = true;
      runningRef.current = stored.running;
      accumulatedActiveMs.current = stored.accumulatedActiveMs;
      segmentStartedAt.current = stored.running ? stored.segmentStartedAt : null;
      lastUnloggedAt.current = stored.running ? stored.lastUnloggedAt : null;
      pendingLogMs.current = stored.pendingLogMs;
      const now = Date.now();
      const active = stored.running && stored.segmentStartedAt != null
        ? stored.accumulatedActiveMs + Math.max(0, now - stored.segmentStartedAt)
        : stored.accumulatedActiveMs;
      const pending = stored.running && stored.lastUnloggedAt != null
        ? stored.pendingLogMs + Math.max(0, now - stored.lastUnloggedAt)
        : stored.pendingLogMs;
      setSubjectId(stored.subjectId);
      setTaskId(stored.taskId);
      meta.current = { subjectId: stored.subjectId, taskId: stored.taskId };
      setOnBreak(stored.onBreak);
      setElapsed(Math.floor(active / 1000));
      setPendingSeconds(Math.floor(pending / 1000));
      setSessionOpen(true);
      setRunning(stored.running);
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  // Tick from wall-clock so active time remains accurate in throttled tabs.
  useEffect(() => {
    if (!running) return;
    const id = window.setInterval(() => {
      if (segmentStartedAt.current == null) return;
      const now = Date.now();
      setElapsed(Math.floor(activeMsAt(now) / 1000));

      if (lastUnloggedAt.current != null) {
        pendingLogMs.current += Math.max(0, now - lastUnloggedAt.current);
        lastUnloggedAt.current = now;
        emitPending(true);
      }
    }, 1000);
    return () => window.clearInterval(id);
  }, [running, activeMsAt, emitPending]);

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
      persistSnapshot();
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, [running, emitPending, persistSnapshot]);

  const clockIn = useCallback((opts?: { subjectId?: number | null; taskId?: number | null }) => {
    const nextSubject = opts && "subjectId" in opts ? opts.subjectId ?? null : meta.current.subjectId;
    const nextTask = opts && "taskId" in opts ? opts.taskId ?? null : meta.current.taskId;

    // Never create a second overlapping timer for the same target. A separate
    // task intentionally switches the existing session and first flushes its
    // active segment, preserving the existing session architecture.
    if (sessionOpenRef.current && nextSubject === meta.current.subjectId && nextTask === meta.current.taskId) {
      return;
    }
    // A second tab can call Clock In before its restore callback runs. Respect
    // the shared snapshot and let that callback adopt it instead of replacing
    // the first tab's open session.
    if (!sessionOpenRef.current && readStoredClock()) return;

    if (sessionOpenRef.current) {
      if (runningRef.current) bankActiveSegment();
      emitPending(false);
    }

    setSubjectId(nextSubject);
    setTaskId(nextTask);
    meta.current = { subjectId: nextSubject, taskId: nextTask };
    accumulatedActiveMs.current = 0;
    pendingLogMs.current = 0;
    const now = Date.now();
    segmentStartedAt.current = now;
    lastUnloggedAt.current = now;
    sessionIdRef.current = sessionIdRef.current || newSessionId();
    setElapsed(0);
    setPendingSeconds(0);
    changeBreak(false);
    changeSessionOpen(true);
    changeRunning(true);
    writeStoredClock({
      version: ACTIVE_CLOCK_VERSION,
      sessionId: sessionIdRef.current,
      running: true,
      onBreak: false,
      subjectId: nextSubject,
      taskId: nextTask,
      accumulatedActiveMs: 0,
      segmentStartedAt: now,
      lastUnloggedAt: now,
      pendingLogMs: 0,
      updatedAt: now,
    });
  }, [bankActiveSegment, changeBreak, changeRunning, changeSessionOpen, emitPending]);

  const pause = useCallback(() => {
    if (!runningRef.current) return;
    bankActiveSegment();
    emitPending(false);
    changeRunning(false);
    persistSnapshot(false);
  }, [bankActiveSegment, changeRunning, emitPending, persistSnapshot]);

  const resume = useCallback(() => {
    if (!sessionOpenRef.current || runningRef.current) return;
    const now = Date.now();
    segmentStartedAt.current = now;
    lastUnloggedAt.current = now;
    changeBreak(false);
    changeRunning(true);
    persistSnapshot(false);
  }, [changeBreak, changeRunning, persistSnapshot]);

  const takeBreak = useCallback(() => {
    if (!sessionOpenRef.current) return;
    if (runningRef.current) {
      bankActiveSegment();
      emitPending(false);
    }
    changeRunning(false);
    changeBreak(true);
    beep(660);
    persistSnapshot(true);
  }, [bankActiveSegment, changeBreak, changeRunning, emitPending, persistSnapshot]);

  const endBreak = useCallback(() => {
    if (!sessionOpenRef.current) return;
    resume();
  }, [resume]);

  const clockOut = useCallback(() => {
    if (!sessionOpenRef.current) return;
    if (runningRef.current) bankActiveSegment();
    emitPending(false);
    const closedSessionId = sessionIdRef.current;
    changeRunning(false);
    changeBreak(false);
    changeSessionOpen(false);
    sessionIdRef.current = null;
    setSubjectId(null);
    setTaskId(null);
    meta.current = { subjectId: null, taskId: null };
    accumulatedActiveMs.current = 0;
    segmentStartedAt.current = null;
    lastUnloggedAt.current = null;
    pendingLogMs.current = 0;
    setElapsed(0);
    setSessionTotal(0);
    setPendingSeconds(0);
    clearStoredClock(closedSessionId || undefined);
  }, [bankActiveSegment, changeBreak, changeRunning, changeSessionOpen, emitPending]);

  const toggle = useCallback(() => {
    if (runningRef.current) pause();
    else if (sessionOpenRef.current) resume();
    else clockIn();
  }, [clockIn, pause, resume]);

  return {
    running, onBreak, sessionActive: sessionOpen, elapsed, sessionTotal, pendingSeconds,
    subjectId, taskId, setSubjectId, setTaskId, clockIn, pause, resume, takeBreak, endBreak, clockOut, toggle,
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
