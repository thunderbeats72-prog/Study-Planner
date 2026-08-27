"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import { api, ApiError, prettyLong, today, type AppState, type MessageRow } from "@/lib/client";
import { mmss, useFocusTimer, useStudyClock, type TimerMode } from "@/lib/useTimer";
import Onboarding from "@/components/Onboarding";
import Dashboard from "@/components/Dashboard";
import PlannerView from "@/components/PlannerView";
import FocusView from "@/components/FocusView";
import SubjectsView from "@/components/SubjectsView";
import SettingsView from "@/components/SettingsView";
import ChatPanel from "@/components/ChatPanel";
import CommandPalette, { type Command } from "@/components/CommandPalette";
import { onSoundChange, stopSound } from "@/lib/sound";
import { haptic } from "@/lib/haptics";
import { useBackClose } from "@/lib/useBackClose";
import type { TaskPatch } from "@/components/TaskEditor";
import {
  IconBolt, IconBook, IconCalendar, IconCheck, IconClock, IconFlame, IconGear, IconHome,
  IconLogo, IconPanelLeft, IconSpark, IconWarn,
} from "@/components/icons";

import {
  parseCommand, languageCapabilityReply, instantTutorReply, commandReply,
} from "@/lib/ai";
import { appendChatTurn, isFallbackUser } from "@/lib/chatTurn";

type Page = "dashboard" | "planner" | "focus" | "subjects" | "settings";

const NAV: { id: Page; label: string; icon: React.ReactNode }[] = [
  { id: "dashboard", label: "Overview", icon: <IconHome /> },
  { id: "planner", label: "Planner", icon: <IconCalendar /> },
  { id: "focus", label: "Focus", icon: <IconClock /> },
  { id: "subjects", label: "Subjects", icon: <IconBook /> },
  { id: "settings", label: "Settings", icon: <IconGear /> },
];

type ToastTone = "success" | "info" | "error";
type Toast = { id: number; msg: string; tone: ToastTone };
type PendingSessionLog = {
  eventId: string;
  minutes: number;
  subjectId: number | null;
  taskId: number | null;
  mode: string;
  date: string;
};

const SIDEBAR_KEY = "spp-sidebar-collapsed";
const SESSION_QUEUE_KEY = "spp-pending-session-logs";

function apiFailureMessage(error: unknown, fallback: string): string {
  return error instanceof ApiError && error.message ? error.message : fallback;
}

function savedSessionQueue(raw: string | null): PendingSessionLog[] {
  try {
    const parsed = JSON.parse(raw || "[]") as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((entry): entry is PendingSessionLog => {
      if (!entry || typeof entry !== "object") return false;
      const value = entry as Partial<PendingSessionLog>;
      return typeof value.eventId === "string"
        && typeof value.minutes === "number" && Number.isFinite(value.minutes) && value.minutes > 0
        && typeof value.mode === "string" && typeof value.date === "string";
    }).slice(-200);
  } catch { return []; }
}

export default function Home() {
  const [state, setState] = useState<AppState | null>(null);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState<Page>("dashboard");
  const [busy, setBusy] = useState(false);
  const [chatOpen, setChatOpen] = useState(false);
  const [thinking, setThinking] = useState(false);
  const [zen, setZen] = useState(false);
  const [ambient, setAmbient] = useState("none");
  useEffect(() => onSoundChange(setAmbient), []);
  useBackClose(zen, () => setZen(false));
  useBackClose(chatOpen, () => setChatOpen(false));
  const [toast, setToast] = useState<Toast | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [pendingMsgs, setPendingMsgs] = useState<MessageRow[]>([]);
  const chatInFlightRef = useRef(false);
  const replanInFlightRef = useRef(false);
  const sessionQueueRef = useRef<PendingSessionLog[] | null>(null);
  const sessionDrainRef = useRef(false);
  const lastSessionErrorRef = useRef(0);
  const [forceWizard, setForceWizard] = useState(false);
  const [confirmWipe, setConfirmWipe] = useState(false);
  useBackClose(confirmWipe, () => setConfirmWipe(false));
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => {
    // restore the user's sidebar preference (desktop only; harmless on mobile)
    try {
      if (typeof window !== "undefined") return localStorage.getItem(SIDEBAR_KEY) === "1";
    } catch { /* private mode */ }
    return false;
  });
  const toggleSidebar = () => {
    setSidebarCollapsed((v) => {
      try { localStorage.setItem(SIDEBAR_KEY, v ? "0" : "1"); } catch { /* noop */ }
      return !v;
    });
  };

  /** Structured toast: one per event, auto-dismissed, stack-safe. */
  const notify = useCallback((m: string, tone: ToastTone = "info") => {
    const id = Date.now() + Math.random();
    setToast({ id, msg: m, tone });
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 3400);
  }, []);
  useEffect(() => () => { if (toastTimer.current) clearTimeout(toastTimer.current); }, []);

  const loadInitialState = useCallback(() => {
    setLoading(true);
    api<AppState>("/api/state", { timeoutMs: 20_000 })
      .then(setState)
      .catch((error) => notify(error instanceof ApiError ? error.message : "Could not reach the server.", "error"))
      .finally(() => setLoading(false));
  }, [notify]);

  useEffect(() => {
    const timer = window.setTimeout(loadInitialState, 0);
    return () => window.clearTimeout(timer);
  }, [loadInitialState]);

  useEffect(() => {
    // Theme + age-adaptive presentation mode.
    const theme = state?.settings.theme ? `theme-${state.settings.theme}` : "";
    const level = state?.user.level || "";
    const mode =
      level === "nursery" || level === "school"
        ? "mode-young"
        : level === "pg" || level === "phd" || level === "professional"
          ? "mode-focused"
          : "";
    const next = [theme, mode].filter(Boolean).join(" ");
    // v13: where the View Transitions API exists, the theme flip becomes a
    // real cross-fade instead of an instant repaint.
    const doc = document as Document & { startViewTransition?: (cb: () => void) => unknown };
    if (doc.startViewTransition && !window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      doc.startViewTransition(() => { document.body.className = next; });
    } else {
      document.body.className = next;
    }
  }, [state?.settings.theme, state?.user.level]);

  /* v12 — global click micro-interactions: every small click gets a soft
     spring pulse (its icon pops with it) and CTAs grow a ripple at the
     pointer. Delegated once; WAAPI so it never fights the CSS animations. */
  useEffect(() => {
    const PRESSABLE =
      "button, a, .vtab, .nav-item, .cal-cell, .cmdk-item, .task-row, .ob-range-chip, [role='button']";
    const RIPPLE_HOST = ".btn, .ob-btn-primary, .ai-fab";
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)");
    const coarse = window.matchMedia("(pointer: coarse)");
    const SPRING = "cubic-bezier(.22,1,.36,1)";
    /* v13: a tiny confetti burst celebrates completions at the pointer */
    const CONFETTI = ["--accent", "--success-accent", "--warning-accent", "--color-ai"];
    const burst = (x: number, y: number) => {
      const cs = getComputedStyle(document.body);
      for (let i = 0; i < 12; i++) {
        const p = document.createElement("span");
        p.className = "confetti";
        p.style.background = cs.getPropertyValue(CONFETTI[i % CONFETTI.length]);
        p.style.left = `${x}px`;
        p.style.top = `${y}px`;
        document.body.appendChild(p);
        const angle = ((Math.PI * 2) / 12) * i + Math.random() * 0.6;
        const dist = 34 + Math.random() * 46;
        const anim = p.animate(
          [
            { transform: "translate(-50%,-50%) rotate(0deg)", opacity: 1 },
            {
              transform: `translate(calc(-50% + ${(Math.cos(angle) * dist).toFixed(1)}px), calc(-50% + ${(Math.sin(angle) * dist - 14).toFixed(1)}px)) rotate(${(180 + Math.random() * 180).toFixed(0)}deg)`,
              opacity: 0,
            },
          ],
          { duration: 650 + Math.random() * 350, easing: "cubic-bezier(.16,1,.3,1)" },
        );
        anim.onfinish = () => p.remove();
      }
    };
    const onClick = (e: MouseEvent) => {
      const t = e.target;
      if (!(t instanceof Element)) return;
      if (coarse.matches) haptic(6); // light tick on real taps
      if (reduce.matches) return;
      const el = t.closest(PRESSABLE);
      if (!(el instanceof HTMLElement)) return;
      const label = (el.textContent || "").trim();
      if (label === "Done" || el.matches(".rate-btn")) burst(e.clientX, e.clientY);
      const soft = el.matches(".task-row, .kpi-card");
      el.animate(
        [
          { transform: "scale(1)" },
          { transform: soft ? "scale(1.012)" : "scale(1.045)", offset: 0.35 },
          { transform: "scale(1)" },
        ],
        { duration: soft ? 500 : 620, easing: SPRING },
      );
      el.querySelector("svg")?.animate(
        [
          { transform: "scale(.82)" },
          { transform: "scale(1.14)", offset: 0.55 },
          { transform: "scale(1)" },
        ],
        { duration: 520, easing: SPRING },
      );
      const host = el.matches(RIPPLE_HOST) ? el : el.closest(RIPPLE_HOST);
      if (host instanceof HTMLElement) {
        const r = host.getBoundingClientRect();
        const size = Math.max(r.width, r.height) * 2.2;
        const span = document.createElement("span");
        span.className = "fx-ripple";
        span.style.width = span.style.height = `${size}px`;
        span.style.left = `${e.detail === 0 ? r.width / 2 : e.clientX - r.left}px`;
        span.style.top = `${e.detail === 0 ? r.height / 2 : e.clientY - r.top}px`;
        host.appendChild(span);
        const anim = span.animate(
          [
            { transform: "translate(-50%,-50%) scale(0)", opacity: 0.55 },
            { transform: "translate(-50%,-50%) scale(1)", opacity: 0 },
          ],
          { duration: 750, easing: "cubic-bezier(.16,1,.3,1)" },
        );
        anim.onfinish = () => span.remove();
      }
    };
    document.addEventListener("click", onClick);
    return () => document.removeEventListener("click", onClick);
  }, []);

  /* v13 — cursor spotlight: an accent pool tracks the mouse over cards.
     Delegated + rAF-throttled; touch pointers never trigger it. */
  useEffect(() => {
    let spotEl: HTMLElement | null = null;
    let raf = 0;
    let x = 0;
    let y = 0;
    const paint = () => {
      raf = 0;
      if (!spotEl) return;
      const r = spotEl.getBoundingClientRect();
      spotEl.style.setProperty("--mx", `${(x - r.left).toFixed(1)}px`);
      spotEl.style.setProperty("--my", `${(y - r.top).toFixed(1)}px`);
    };
    const onMove = (e: PointerEvent) => {
      if (e.pointerType !== "mouse") return;
      const t = e.target;
      const el = t instanceof Element ? t.closest(".tilt-card") : null;
      spotEl = el instanceof HTMLElement ? el : null;
      x = e.clientX;
      y = e.clientY;
      if (spotEl && !raf) raf = requestAnimationFrame(paint);
    };
    document.addEventListener("pointermove", onMove, { passive: true });
    return () => {
      document.removeEventListener("pointermove", onMove);
      if (raf) cancelAnimationFrame(raf);
    };
  }, []);

  const persistSessionQueue = useCallback(() => {
    try { localStorage.setItem(SESSION_QUEUE_KEY, JSON.stringify(sessionQueueRef.current || [])); }
    catch { /* in-memory queue still protects this page session */ }
  }, []);

  const drainSessionQueue = useCallback(async () => {
    if (sessionDrainRef.current) return;
    if (sessionQueueRef.current == null) {
      try { sessionQueueRef.current = savedSessionQueue(localStorage.getItem(SESSION_QUEUE_KEY)); }
      catch { sessionQueueRef.current = []; }
    }
    if (!sessionQueueRef.current.length) return;

    sessionDrainRef.current = true;
    try {
      while (sessionQueueRef.current.length) {
        const entry = sessionQueueRef.current[0];
        try {
          const fresh = await api<AppState>("/api/sessions", {
            method: "POST",
            body: JSON.stringify(entry),
            timeoutMs: 25_000,
          });
          sessionQueueRef.current.shift();
          persistSessionQueue();
          setState(fresh);
        } catch {
          const now = Date.now();
          if (now - lastSessionErrorRef.current > 60_000) {
            lastSessionErrorRef.current = now;
            notify("Study time is saved on this device and will sync when the connection returns.", "error");
          }
          break;
        }
      }
    } finally {
      sessionDrainRef.current = false;
    }
  }, [notify, persistSessionQueue]);

  const logSession = useCallback(
    (minutes: number, subjectId: number | null, taskId: number | null, mode: string) => {
      if (!Number.isFinite(minutes) || minutes <= 0) return;
      if (sessionQueueRef.current == null) {
        try { sessionQueueRef.current = savedSessionQueue(localStorage.getItem(SESSION_QUEUE_KEY)); }
        catch { sessionQueueRef.current = []; }
      }
      const random = typeof crypto.randomUUID === "function"
        ? crypto.randomUUID()
        : `${Date.now()}_${Math.random().toString(36).slice(2)}`;
      sessionQueueRef.current.push({
        eventId: `session_${random}`,
        minutes,
        subjectId,
        taskId,
        mode,
        // Send the CLIENT's local date: server timezone must not move a
        // session into a different day than the learner sees.
        date: today(),
      });
      // Keep a hard bound if a device stays offline for a very long time.
      if (sessionQueueRef.current.length > 200) sessionQueueRef.current.splice(0, sessionQueueRef.current.length - 200);
      persistSessionQueue();
      void drainSessionQueue();
    },
    [drainSessionQueue, persistSessionQueue]
  );

  useEffect(() => {
    void drainSessionQueue();
    const onOnline = () => void drainSessionQueue();
    window.addEventListener("online", onOnline);
    return () => window.removeEventListener("online", onOnline);
  }, [drainSessionQueue]);

  // 1) The study clock — tracks actual studied time
  const clock = useStudyClock(logSession);
  useEffect(() => {
    document.body.classList.toggle("focus-live", clock.running);
  }, [clock.running]);

  // Live clock in the browser-tab title: on phones the tab switcher shows
  // the running session at a glance, even from another app/tab. Placed
  // before the early returns so the hook order never changes.
  const clockTaskId = clock.taskId;
  const clockSubjectId = clock.subjectId;
  useEffect(() => {
    const base = "Study Planner Pro";
    const title =
      state?.tasks.find((x) => x.id === clockTaskId)?.title ||
      state?.subjects.find((x) => x.id === clockSubjectId)?.name ||
      "Session";
    if (clock.running) document.title = `⏱ ${mmss(clock.elapsed)} · ${title.slice(0, 30)} — ${base}`;
    else if (clock.sessionActive) document.title = `⏸ ${mmss(clock.elapsed)} · paused — ${base}`;
    else document.title = base;
  }, [state, clock.running, clock.sessionActive, clock.elapsed, clockTaskId, clockSubjectId]);

  // 2) Focus timer — pomodoro ritual
  const onBlockComplete = useCallback((mode: TimerMode, minutes: number) => {
    if (mode === "short" || mode === "long") { notify("Break complete — back to studying."); return; }
    notify(`Focus block completed (${minutes} min). Great job!`, "success");
  }, [notify]);

  const timer = useFocusTimer(
    {
      pomodoro: state?.settings.pomodoro ?? 25,
      shortBreak: state?.settings.shortBreak ?? 5,
      longBreak: state?.settings.longBreak ?? 15,
    },
    onBlockComplete
  );

  const setTaskStatus = async (id: number, status: string, rating?: number) => {
    try {
      const s = await api<AppState>("/api/tasks", { method: "PATCH", body: JSON.stringify({ id, status, rating }) });
      setState(s);
      if (status === "done") {
        haptic([10, 40, 18]);
        notify(
          rating
            ? rating === 1
              ? "Logged — this topic will come back sooner for another pass."
              : "Logged — the memory model scheduled your next review."
            : "Lesson marked done — mastery updated.",
          "success"
        );
      }
    } catch (error) { notify(apiFailureMessage(error, "Update failed."), "error"); }
  };

  const updateTask = async (id: number, patch: TaskPatch) => {
    try {
      const s = await api<AppState>("/api/tasks", { method: "PATCH", body: JSON.stringify({ id, ...patch }) });
      setState(s);
      notify("Task updated successfully.", "success");
    } catch (error) { notify(apiFailureMessage(error, "Could not update task."), "error"); }
  };

  const skipSubjectForDay = async (subjectId: number, date: string) => {
    try {
      const s = await api<AppState>("/api/tasks", {
        method: "PATCH",
        body: JSON.stringify({ skipSubjectId: subjectId, skipDate: date }),
      });
      setState(s);
      const name = s.subjects.find((x) => x.id === subjectId)?.name || "subject";
      notify(`Skipped ${name} for that day.`);
    } catch (error) { notify(apiFailureMessage(error, "Could not skip subject."), "error"); }
  };

  const replan = async () => {
    // A fast second tap previously launched two destructive rebuilds in
    // parallel. The ref closes that pre-render window immediately.
    if (replanInFlightRef.current) return;
    replanInFlightRef.current = true;
    setBusy(true);
    try {
      const s = await api<AppState>("/api/replan", { method: "POST", timeoutMs: 90_000 });
      setState(s);
      const scheduled = s.stats?.scheduledTopics;
      notify(
        scheduled
          ? `Rebalanced from today · ${scheduled} lessons scheduled.`
          : "Schedule rebalanced from today — overdue work moved forward.",
        "success"
      );
    } catch (error) {
      notify(apiFailureMessage(error, "Re-plan failed — your existing schedule was left unchanged."), "error");
    } finally {
      replanInFlightRef.current = false;
      setBusy(false);
    }
  };

  const patchSettings = useCallback(async (patch: Record<string, unknown>, replanIt = false) => {
    setBusy(true);
    try {
      const s = await api<AppState>("/api/settings", {
        method: "PATCH",
        body: JSON.stringify({ ...patch, _replan: replanIt }),
        timeoutMs: replanIt ? 90_000 : 30_000,
      });
      setState(s);
      notify(replanIt ? "Settings saved — schedule regenerated." : "Saved.", "success");
    } catch (error) { notify(apiFailureMessage(error, "Save failed."), "error"); } finally { setBusy(false); }
  }, [notify]);

  const addSubject = async (payload: { name: string; units: number; difficulty: string; color: string }) => {
    setBusy(true);
    try {
      setState(await api<AppState>("/api/subjects", { method: "POST", body: JSON.stringify(payload), timeoutMs: 90_000 }));
      notify("Subject added and lessons generated.", "success");
    } catch (error) { notify(apiFailureMessage(error, "Could not add subject."), "error"); } finally { setBusy(false); }
  };

  const editSubject = async (payload: { id: number; name: string; units: number; difficulty: string; color: string }) => {
    setBusy(true);
    try {
      setState(await api<AppState>("/api/subjects", { method: "PATCH", body: JSON.stringify(payload), timeoutMs: 90_000 }));
      notify("Subject updated, schedule rebalanced.", "success");
    } catch (error) { notify(apiFailureMessage(error, "Could not update."), "error"); } finally { setBusy(false); }
  };

  const deleteSubject = async (id: number) => {
    setBusy(true);
    try {
      setState(await api<AppState>(`/api/subjects?id=${id}`, { method: "DELETE" }));
      notify("Subject removed.");
    } catch (error) { notify(apiFailureMessage(error, "Could not delete."), "error"); } finally { setBusy(false); }
  };

  const startSmartClock = useCallback(() => {
    const currentDay = today();
    const task = state?.tasks.find((item) => item.date === currentDay && item.status === "pending") ||
      state?.tasks.find((item) => item.date === currentDay);
    if (task) {
      clock.clockIn({ taskId: task.id, subjectId: task.subjectId ?? null });
      notify(`Clocked in: ${task.title.slice(0, 48)}`);
    } else {
      const subject = state?.subjects[0];
      clock.clockIn({ subjectId: subject?.id ?? null, taskId: null });
      notify(subject ? `Clocked in to ${subject.name}.` : "Clocked in — free session.");
    }
  }, [clock, notify, state]);

  // Clock out from ANYWHERE — one handler for the tracker bar, the up-next
  // card, task rows and Zen mode. Confirms the saved minutes by name.
  const clockOutNow = useCallback(() => {
    const task = state?.tasks.find((item) => item.id === clock.taskId);
    const minutes = Math.floor(clock.elapsed / 60);
    clock.clockOut();
    haptic([12, 30]);
    notify(
      task
        ? `Clocked out of “${task.title.slice(0, 40)}” — minutes saved.`
        : `Clocked out — ${minutes > 0 ? `${minutes} min saved.` : "minutes saved."}`,
      "success"
    );
  }, [clock, notify, state]);

  // Pause when recording; resume when paused/on break.
  const pauseOrResume = () => {
    if (clock.running) { clock.pause(); notify("Paused — the clock waits with you."); }
    else if (clock.onBreak || clock.elapsed > 0) { clock.resume(); notify("Resumed — back on the clock."); }
    else startSmartClock();
  };

  const focusTask = (taskId: number) => {
    const task = state?.tasks.find((x) => x.id === taskId);
    // Already recording THIS task → never restart the clock (that used to
    // silently eat the unlogged partial minutes of the running session).
    if (clock.sessionActive && clock.taskId === taskId) {
      notify("Already recording this lesson — the clock is running.");
      return;
    }
    if (clock.sessionActive) {
      clock.clockIn({ taskId, subjectId: task?.subjectId ?? null });
      notify(`Switched to: ${task ? task.title.slice(0, 42) : "session"} — earlier minutes saved.`);
      return;
    }
    clock.clockIn({ taskId, subjectId: task?.subjectId ?? null });
    notify(`Clocked in: ${task ? task.title.slice(0, 42) : "session"} — timer recording.`);
  };

  /** Entry point for every "Re-run Setup" button — always confirm first. */
  const requestWizardRestart = () => {
    if (state?.user.onboarded && (state.subjects.length || state.sessions.length || state.tasks.length)) {
      setConfirmWipe(true);
    } else {
      startWizard();
    }
  };
  const startWizard = () => {
    setConfirmWipe(false);
    // bank any live study time before entering the wizard
    if (clock.running) clock.pause();
    setForceWizard(true);
  };

  const askTutor = useCallback(
    async (q: string) => {
      const message = q.trim();
      setChatOpen(true);
      // Disable duplicate taps synchronously; waiting for `thinking` to render
      // left enough time for the same mobile request to be inserted twice.
      if (!message || chatInFlightRef.current) return;
      chatInFlightRef.current = true;
      setThinking(true);
      const optimistic: MessageRow = {
        id: -Date.now(), userId: 0, role: "user", content: message, createdAt: new Date().toISOString(),
      };
      setPendingMsgs((p) => [...p, optimistic]);
      try {
        const r = await api<{
          reply: string;
          action: { type: string; payload?: unknown } | null;
          state: AppState;
          ai?: { source: string; model: string | null; degraded: boolean; message?: string };
        }>(
          "/api/chat",
          {
            method: "POST",
            body: JSON.stringify({ message, source: "text" }),
            timeoutMs: 35_000,
          }
        );
        const reply = (r.reply || "").trim()
          || "I'm here — try asking again about your plan or a topic from your subjects.";
        setState((prev) => {
          const incoming = r.state;
          // Never replace a real onboarded plan with the empty DB-less
          // fallback. That used to wipe the chat (and the syllabus) after
          // a perfectly good tutor reply.
          const keepPrev = !!prev && isFallbackUser(incoming?.user) && !isFallbackUser(prev.user);
          const base = (keepPrev ? prev : incoming) || prev;
          if (!base) return prev;
          const history = (base.messages || []).filter((row) => row.id > 0);
          return {
            ...base,
            messages: appendChatTurn(history, message, reply, base.user?.id || 0),
            context: keepPrev && prev ? prev.context : (incoming.context || base.context),
            aiProvider: incoming.aiProvider ?? base.aiProvider,
          };
        });
        setPendingMsgs([]);
        if (r.ai?.degraded && r.ai.message) notify(r.ai.message, "info");
        const a = r.action;
        if (a) {
          if (a.type === "navigate") setPage(String(a.payload) as Page);
          if (a.type === "startTimer") { if (!clock.running) { if (clock.sessionActive) clock.resume(); else startSmartClock(); } }
          if (a.type === "stopTimer") { if (clock.sessionActive) clockOutNow(); }
          if (a.type === "pause") { if (clock.running) clock.pause(); else notify("No session running to pause."); }
          if (a.type === "resume") { if (clock.onBreak || clock.elapsed > 0) clock.resume(); else if (!clock.running) startSmartClock(); }
          if (a.type === "break") { if (clock.running) clock.takeBreak(); else notify("Start a session first, then take a break."); }
          if (a.type === "zen") setZen(true);
          // The chat API already performs and returns a fresh replan. Calling
          // /api/replan again here caused a second rebuild and race.
          if (a.type === "theme") { void patchSettings({ theme: String(a.payload) }); }
        }
      } catch (error) {
        console.warn("API call failed, using client-side local tutor fallback:", error);
        const action = parseCommand(message);
        const langReply = languageCapabilityReply(message);
        const currentCtx = state?.context;
        const instant = (action || !currentCtx) ? null : instantTutorReply(message, currentCtx);

        let fallbackText = "";
        if (langReply) {
          fallbackText = langReply;
        } else if (action) {
          fallbackText = commandReply(action, message, currentCtx?.daysLeft ?? 90);
          if (action.type === "navigate") setPage(String(action.payload) as Page);
          if (action.type === "startTimer") { if (!clock.running) { if (clock.sessionActive) clock.resume(); else startSmartClock(); } }
          if (action.type === "stopTimer") { if (clock.sessionActive) clockOutNow(); }
          if (action.type === "pause") { if (clock.running) clock.pause(); else notify("No session running to pause."); }
          if (action.type === "resume") { if (clock.onBreak || clock.elapsed > 0) clock.resume(); else if (!clock.running) startSmartClock(); }
          if (action.type === "break") { if (clock.running) clock.takeBreak(); else notify("Start a session first, then take a break."); }
          if (action.type === "zen") setZen(true);
          if (action.type === "theme") { void patchSettings({ theme: String(action.payload) }); }
        } else if (instant) {
          fallbackText = instant.text;
        } else {
          const pending = (currentCtx?.today || []).filter((task) => task.status === "pending").slice(0, 3);
          fallbackText = pending.length
            ? `I couldn't reach the cloud tutor just now. From your plan, start with **${pending[0].title}**. Ask me to explain it, or say *"what should I study today?"*.`
            : "I couldn't reach the cloud tutor just now. Ask again in a moment, or say *\"what should I study today?\"* / *\"explain [a topic from your subjects]\"*.";
        }

        const botMsg: MessageRow = {
          id: Date.now() + 1,
          userId: state?.user.id || 0,
          role: "assistant",
          content: fallbackText,
          createdAt: new Date().toISOString(),
        };

        if (state) {
          setState({
            ...state,
            messages: [...state.messages, optimistic, botMsg],
          });
        }
        setPendingMsgs([]);
      } finally {
        chatInFlightRef.current = false;
        setThinking(false);
      }
    },
    [clock, clockOutNow, notify, patchSettings, startSmartClock, state]
  );

  if (loading) {
    return (
      <div className="loader-screen">
        <div className="loader-stack">
          <div className="loader-ring"><IconLogo size={28} /></div>
          <div className="loader-title">Study Planner Pro</div>
          <div className="loader-sub">Loading your study plan…</div>
          <div className="loader-skeletons">
            <div className="skeleton skeleton-strong" style={{ height: 52, borderRadius: 999 }} />
            <div className="skeleton skeleton-strong" style={{ height: 84 }} />
            <div className="skeleton skeleton-strong" style={{ height: 84, opacity: .72 }} />
            <div className="skeleton skeleton-strong" style={{ height: 84, opacity: .45 }} />
          </div>
        </div>
      </div>
    );
  }

  if (!state) {
    return (
      <div className="loader-screen">
        <div className="loader-title">Connection problem</div>
        <div className="loader-sub">Your data is still safe. Check the connection and try again.</div>
        <button className="btn btn-primary" style={{ marginTop: 16 }} onClick={loadInitialState}>Retry</button>
      </div>
    );
  }

  if (!state.user.onboarded || forceWizard) {
    return <Onboarding
      onDone={(s) => { setState(s); setForceWizard(false); setPage("dashboard"); }}
      isRerun={state.user.onboarded}
      initialName={state.user.onboarded ? state.user.name : ""}
      onCancel={state.user.onboarded ? () => setForceWizard(false) : undefined}
    />;
  }

  const ctx = state.context;
  const t = today();
  const todayDone = state.tasks.filter((x) => x.date === t && x.status === "done").length;
  const todayTotal = state.tasks.filter((x) => x.date === t).length;
  const allMsgs = [...state.messages, ...pendingMsgs];

  // The full task title, untruncated — CSS wraps it cleanly instead of
  // slicing it in JS (fixes "Principles of Marketing: Introduction…").
  const clockTaskTitle =
    state.tasks.find((x) => x.id === clock.taskId)?.title ||
    state.subjects.find((x) => x.id === clock.subjectId)?.name ||
    "Free session";

  const commands: Command[] = [
    { id: "nav-dash", group: "Navigate", label: "Go to Overview", hint: "Dashboard", keywords: "home stats", run: () => setPage("dashboard") },
    { id: "nav-plan", group: "Navigate", label: "Go to Planner", hint: "Schedule", keywords: "tasks lessons", run: () => setPage("planner") },
    { id: "nav-focus", group: "Navigate", label: "Go to Focus", hint: "Pomodoro", keywords: "timer deep work", run: () => setPage("focus") },
    { id: "nav-subj", group: "Navigate", label: "Go to Subjects", hint: "Syllabus", keywords: "units topics", run: () => setPage("subjects") },
    { id: "nav-set", group: "Navigate", label: "Go to Settings", keywords: "theme preferences", run: () => setPage("settings") },
    { id: "clock-in", group: "Study Clock", label: clock.running ? "Pause Clock" : clock.sessionActive ? "Resume Clock" : "Clock In", hint: clock.running ? "Freeze, keep session" : "Start recording", keywords: "timer record attendance pause", run: () => (clock.running ? clock.pause() : clock.sessionActive ? clock.resume() : startSmartClock()) },
    { id: "clock-out", group: "Study Clock", label: "Clock Out", hint: clock.sessionActive ? "Stop & save minutes" : "no open session", keywords: "stop end finish timer", run: () => (clock.sessionActive ? clockOutNow() : notify("No open session to close.")) },
    { id: "clock-break", group: "Study Clock", label: clock.onBreak ? "Resume from break" : "Take a break", keywords: "pause rest", run: () => (clock.onBreak ? clock.endBreak() : clock.takeBreak()) },
    { id: "next-lesson", group: "Study Clock", label: "Start next pending lesson", hint: "Clock in + switch", keywords: "begin study start task", run: () => { const t = today(); const next = state.tasks.find((x) => x.date === t && x.status === "pending" && x.id !== clock.taskId); if (next) focusTask(next.id); else notify("Nothing pending today — enjoy the rest day."); } },
    { id: "zen", group: "Focus", label: "Enter Zen mode", hint: "Distraction-free", keywords: "fullscreen minimal", run: () => setZen(true) },
    { id: "ai", group: "AI Tutor", label: "Ask AI Tutor", hint: "Open chat", keywords: "help question doubt", run: () => setChatOpen(true) },
    { id: "ai-today", group: "AI Tutor", label: "What should I study today?", keywords: "plan today", run: () => askTutor("What should I study today and in what order?") },
    { id: "replan", group: "Plan", label: "Re-plan Mathematically", hint: "Rebalance", keywords: "regenerate schedule", run: () => { setPage("planner"); replan(); } },
    { id: "setup", group: "Plan", label: "Re-run Setup Wizard", keywords: "onboarding restart course", run: () => requestWizardRestart() },
  ];

  return (
    <>
      <header className="mobile-header">
        <div className="flex-row gap-sm">
          <div className="brand-logo-icon" style={{ width: 30, height: 30 }}><IconLogo size={16} /></div>
          <span style={{ fontSize: ".92rem", fontWeight: 800 }}>Study Planner Pro</span>
        </div>
        <span className="streak-badge"><IconFlame /> {state.user.streak}d</span>
      </header>

      <div className={`app-wrapper${sidebarCollapsed ? " sb-collapsed" : ""}`}>
        <aside className="sidebar">
          <button
            className="sb-toggle"
            onClick={toggleSidebar}
            aria-label={sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}
            title={sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}
          >
            <IconPanelLeft size={16} />
          </button>
          <div className="brand-header">
            <div className="brand-logo-icon"><IconLogo /></div>
            <div className="brand-text">
              <div className="brand-title">Study Planner Pro</div>
              <div className="brand-course">{state.user.courseName}</div>
            </div>
          </div>
          <nav className="nav-list">
            {NAV.map((n) => (
              <div
                key={n.id}
                className={`nav-item${page === n.id ? " active" : ""}`}
                onClick={() => setPage(n.id)}
                title={sidebarCollapsed ? n.label : undefined}
                aria-label={n.label}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setPage(n.id); } }}
              >
                {n.icon}<span>{n.label}</span>
              </div>
            ))}
          </nav>
          <div className="sidebar-foot" style={{ marginTop: "auto", paddingTop: 16 }}>
            <div className="glass-panel tilt-card" style={{ padding: 18, textAlign: "center" }}>
              <div className="streak-badge" style={{ marginBottom: 10 }}>
                <IconFlame /> {state.user.streak} Day Streak
              </div>
              <h4 style={{ fontSize: ".88rem", fontWeight: 800, margin: "0 0 4px" }}>Keep Moving</h4>
              <p style={{ fontSize: ".76rem", color: "var(--text-muted)", lineHeight: 1.45, margin: "0 0 12px" }}>
                {ctx.daysLeft} days left · {ctx.progressPct}% syllabus completed.
              </p>
              <button className="btn btn-secondary w-full" style={{ fontSize: ".78rem", padding: 8 }} onClick={requestWizardRestart}>
                Re-run Setup
              </button>
            </div>
          </div>
        </aside>

        <main className="main-workspace">
          <div className="tracker-bar" role="status" aria-live="off">
            <div className="flex-row gap-md tracker-status">
              <div className={`pulse-dot${clock.running ? " live" : ""}`} />
              <div className="tracker-labels">
                <div className="tracker-state">
                  {clock.running ? "Clocked in" : clock.onBreak ? "On break" : clock.sessionActive ? "Paused" : "Not clocked in"}
                </div>
                <div className="tracker-task">{clockTaskTitle}</div>
              </div>
              <div className="mono tracker-time">
                {mmss(clock.elapsed)}
              </div>
            </div>
            <div className="flex-row gap-sm tracker-actions">
              <span className="chip chip-kind">{todayDone}/{todayTotal} today</span>
              <span className="chip chip-pending">{ctx.daysLeft}d to {prettyLong(state.settings.examDate)}</span>
              {!clock.sessionActive && (
                <button className="btn btn-xs btn-primary" onClick={startSmartClock}>Clock In</button>
              )}
              {clock.running && (
                <>
                  <button className="btn btn-xs btn-secondary act-pause" onClick={clock.pause}>Pause</button>
                  <button className="btn btn-xs btn-secondary act-break" onClick={clock.takeBreak}>Break</button>
                </>
              )}
              {clock.sessionActive && !clock.running && !clock.onBreak && (
                <button className="btn btn-xs btn-primary act-pause" onClick={clock.resume}>Resume</button>
              )}
              {clock.sessionActive && (
                <button className="btn btn-xs btn-danger act-out" onClick={clockOutNow}>Clock Out</button>
              )}
              {clock.onBreak && (
                <button className="btn btn-xs btn-primary" onClick={clock.endBreak}>Resume</button>
              )}
              {ambient !== "none" && (
                <button className="btn btn-xs btn-secondary ambient-pill" onClick={() => stopSound()} title="Stop ambient sound">
                  <span className="ambient-bars"><i /><i /><i /></span> Stop sound
                </button>
              )}
              <button className="btn btn-xs btn-secondary tracker-zen" aria-label="Enter Zen focus mode" onClick={() => setZen(true)}><IconBolt size={12} /> Zen</button>
            </div>
          </div>

          {page === "dashboard" && (
            <Dashboard state={state} onTaskStatus={setTaskStatus} onTaskUpdate={updateTask}
              onSkipSubject={skipSubjectForDay} onFocusTask={focusTask}
              activeTaskId={clock.taskId} activeClockSeconds={clock.elapsed}
              clockRunning={clock.running} clockSessionActive={clock.sessionActive} clockOnBreak={clock.onBreak}
              onClockOut={clockOutNow} onPauseOrResume={pauseOrResume}
              replanning={busy} onReplan={replan} />
          )}
          {page === "planner" && (
            <PlannerView state={state} onTaskStatus={setTaskStatus} onTaskUpdate={updateTask}
              onSkipSubject={skipSubjectForDay} onFocusTask={focusTask}
              activeTaskId={clock.taskId} activeClockSeconds={clock.elapsed}
              clockSessionActive={clock.sessionActive}
              onClockOut={clockOutNow}
              onAskTutor={askTutor} replanning={busy} onReplan={replan} />
          )}
          {page === "focus" && (
            <FocusView state={state} timer={timer} clock={clock} onCompleteTask={(id) => setTaskStatus(id, "done")} onZen={() => setZen(true)} />
          )}
          {page === "subjects" && (
            <SubjectsView state={state} onAdd={addSubject} onEdit={editSubject} onDelete={deleteSubject} busy={busy} onAskTutor={askTutor} />
          )}
          {page === "settings" && (
            <SettingsView state={state} onPatch={patchSettings} onRestart={requestWizardRestart} busy={busy} />
          )}
        </main>
      </div>

      <ChatPanel open={chatOpen} setOpen={setChatOpen} messages={allMsgs} onSend={askTutor}
        thinking={thinking} provider={state.aiProvider}
        learner={{ name: state.user.name, daysLeft: ctx.daysLeft, progressPct: ctx.progressPct, streak: state.user.streak, todayDone, todayTotal }} />

      <CommandPalette commands={commands} />
      <div className="cmdk-tip">Press ⌘K / Ctrl-K for commands</div>

      {zen && (
        <div className="zen">
          <div style={{ fontSize: ".78rem", letterSpacing: 3, textTransform: "uppercase", opacity: 0.7 }}>
            {state.subjects.find((x) => x.id === clock.subjectId)?.name || "Deep Focus Session"}
          </div>
          <div className="zen-digits mono">{mmss(timer.seconds)}</div>
          <div style={{ fontSize: ".84rem", opacity: 0.65, fontWeight: 700 }}>
            Study clock: {clock.running ? "recording" : clock.onBreak ? "on break" : clock.sessionActive ? "paused" : "not clocked in"} · {mmss(clock.elapsed)}
          </div>
          <div className="flex-row gap-md" style={{ flexWrap: "wrap", justifyContent: "center" }}>
            <button className="btn btn-primary" onClick={timer.toggle}>{timer.running ? "Pause Focus" : "Start Focus"}</button>
            {!clock.sessionActive
              ? <button className="btn btn-secondary" onClick={startSmartClock}>Clock In</button>
              : <>
                  <button className="btn btn-secondary" onClick={pauseOrResume}>
                    {clock.running ? "Pause Clock" : "Resume Clock"}
                  </button>
                  <button className="btn btn-danger" onClick={clockOutNow}>Clock Out</button>
                </>}
            <button className="btn btn-secondary" onClick={() => setZen(false)}>Exit Zen</button>
          </div>
        </div>
      )}

      {/* ── Re-run Setup confirmation (data-wipe warning) ── */}
      {confirmWipe && (
        <div className="modal-overlay" onClick={() => setConfirmWipe(false)}>
          <div className="glass-panel modal-box confirm-box" onClick={(e) => e.stopPropagation()}>
            <div className="confirm-icon"><IconWarn size={22} /></div>
            <h3 style={{ margin: "0 0 6px", fontSize: "1.05rem" }}>Start fresh with the Setup Wizard?</h3>
            <p style={{ fontSize: ".86rem", color: "var(--text-muted)", lineHeight: 1.6, margin: "0 0 6px" }}>
              Re-running setup <strong>completely wipes</strong> your current course data — subjects, lessons,
              schedule, logged study minutes and AI chat history — and rebuilds everything from scratch.
            </p>
            <p style={{ fontSize: ".78rem", color: "var(--text-dim)", margin: "0 0 18px" }}>
              Your name and app preferences (theme, timer lengths) are kept.
            </p>
            <div className="flex-row gap-sm" style={{ flexWrap: "wrap" }}>
              <button className="btn btn-primary" onClick={startWizard}>Wipe &amp; restart</button>
              <button className="btn btn-secondary" onClick={() => setConfirmWipe(false)}>Keep my plan</button>
            </div>
          </div>
        </div>
      )}

      {toast && (
        <div className={`toast toast-${toast.tone}`} role="status" aria-live="polite" key={toast.id}>
          <span className="toast-icon">
            {toast.tone === "success" ? <IconCheck size={13} /> : toast.tone === "error" ? <IconWarn size={13} /> : <IconSpark size={13} />}
          </span>
          <span className="toast-msg">{toast.msg}</span>
          <button className="toast-close" aria-label="Dismiss notification" onClick={() => setToast(null)}>×</button>
          <span className="toast-life" aria-hidden="true" />
        </div>
      )}
    </>
  );
}
