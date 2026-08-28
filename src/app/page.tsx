"use client";

import React, { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { api, ApiError, prettyLong, today, type AppState, type MessageRow } from "@/lib/client";
import { mmss, useFocusTimer, useStudyClock, type ClockApi, type TimerMode } from "@/lib/useTimer";
import { nextPendingTask, type CompletedTaskInfo } from "@/lib/completion";
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
  IconBolt, IconBell, IconBook, IconCalendar, IconCheck, IconClock, IconExpand2, IconFlame,
  IconFocus2, IconGear, IconHome, IconLeaf, IconLogo, IconMenu, IconPalette, IconPanelLeft,
  IconSpark, IconWarn,
} from "@/components/icons";
import ZenScene from "@/components/ZenScene";
import { THEMES } from "@/lib/client";

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

/** POST /api/sessions response — same full state, plus which task (if any)
 *  the server auto-completed because its logged minutes met the plan. */
type SessionLogResponse = AppState & { completedTask?: CompletedTaskInfo | null };

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

/** The ⌘K hint's compact rail form has to name the modifier the learner
 *  actually presses: ⌘ on Apple keyboards, ⌃ (Ctrl) on everything else.
 *  `useSyncExternalStore` is React's own platform-detection pattern — the
 *  server snapshot and the first hydration paint both answer "Apple", the
 *  client corrects immediately afterwards, and no effect or state is
 *  involved, so the markup can never desynchronise from the DOM. */
const noStoreSubscription = () => () => {};
function isApplePlatform(): boolean {
  if (typeof navigator === "undefined") return true;
  return /Mac|iPhone|iPad|iPod/i.test(`${navigator.userAgent || ""} ${navigator.platform || ""}`);
}
function useAppleKeyboard(): boolean {
  return useSyncExternalStore(noStoreSubscription, isApplePlatform, () => true);
}

export default function Home() {
  const [state, setState] = useState<AppState | null>(null);
  const [loading, setLoading] = useState(true);
  /* v14 — the page and the direction it was entered from are one piece of
     state, written together by the nav action. The first painted frame of a
     new view therefore already knows which way to slide in, and the state
     updater stays pure. */
  const [nav, setNav] = useState<{ page: Page; dir: "fwd" | "back" }>({ page: "dashboard", dir: "fwd" });
  const page = nav.page;
  const navDir = nav.dir;
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
  const clockApiRef = useRef<ClockApi | null>(null);
  const autoCompleteRef = useRef<(fresh: AppState, completed: CompletedTaskInfo, date: string) => void>(() => {});
  const [forceWizard, setForceWizard] = useState(false);
  const [confirmWipe, setConfirmWipe] = useState(false);
  useBackClose(confirmWipe, () => setConfirmWipe(false));
  /* Mobile navigation drawer (phones/tablets): the sidebar slides in
     over a scrim instead of living in the bottom dock. */
  const [drawerOpen, setDrawerOpen] = useState(false);
  useBackClose(drawerOpen, () => setDrawerOpen(false));
  /* Quick controls: notifications + theme popovers in the tracker bar. */
  const [notifOpen, setNotifOpen] = useState(false);
  const [themeOpen, setThemeOpen] = useState(false);
  const [zenMinimal, setZenMinimal] = useState(false);
  const zenRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (!notifOpen && !themeOpen) return;
    const close = () => { setNotifOpen(false); setThemeOpen(false); };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") close(); };
    window.addEventListener("click", close);
    window.addEventListener("keydown", onKey);
    return () => { window.removeEventListener("click", close); window.removeEventListener("keydown", onKey); };
  }, [notifOpen, themeOpen]);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => {
    // restore the user's sidebar preference (desktop only; harmless on mobile)
    try {
      if (typeof window !== "undefined") return localStorage.getItem(SIDEBAR_KEY) === "1";
    } catch { /* private mode */ }
    return false;
  });
  /* While the rail is travelling, the whole sidebar carries `sb-anim`: the
     measured nav pill shortens its own transition so it *tracks* the width
     change (re-measured each frame by the ResizeObserver) instead of racing
     ahead of it, which is what made the old collapse look broken. */
  const [railAnimating, setRailAnimating] = useState(false);
  const railTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (railTimer.current) clearTimeout(railTimer.current); }, []);
  /* The collapsed rail has no room for a sentence, so the ⌘K hint shows a key
     glyph there — and it has to be the glyph this learner actually presses:
     ⌘ on Apple keyboards, ⌃ (Ctrl) on everything else. */
  const cmdGlyph = useAppleKeyboard() ? "⌘" : "⌃";
  const toggleSidebar = () => {
    setRailAnimating(true);
    if (railTimer.current) clearTimeout(railTimer.current);
    railTimer.current = setTimeout(() => setRailAnimating(false), 520);
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

  useEffect(() => {
    // Auto-completion handler: the server just marked a task done because the
    // logged minutes reached its planned time. Notify the learner, and if the
    // study clock is STILL recording that task, roll it forward to the next
    // pending task so the minutes they keep studying land on the right lesson.
    autoCompleteRef.current = (fresh, completed, date) => {
      const clockApi = clockApiRef.current;
      const stillRecording = !!clockApi && clockApi.sessionActive && clockApi.running && clockApi.taskId === completed.id;
      const next = nextPendingTask(fresh.tasks || [], date, completed.id);
      haptic([10, 30, 18]);
      if (stillRecording && next) {
        clockApi.clockIn({ taskId: next.id, subjectId: next.subjectId ?? null });
        notify(
          `“${completed.title}” complete — ${completed.actualMinutes}m logged (≥ ${completed.plannedMinutes}m planned). Clocked into next: ${next.title.slice(0, 42)}`,
          "success"
        );
      } else if (next) {
        notify(
          `“${completed.title}” complete — ${completed.actualMinutes}m logged (≥ ${completed.plannedMinutes}m planned). Next up: ${next.title.slice(0, 42)}`,
          "success"
        );
      } else {
        notify(
          `“${completed.title}” complete — ${completed.actualMinutes}m logged (≥ ${completed.plannedMinutes}m planned). All of today's tasks done!`,
          "success"
        );
      }
    };
  }, [notify]);

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

  const themeSetting = state ? state.settings.theme || "default" : null;
  const themeLevel = state?.user.level || "";
  useEffect(() => {
    // Theme + age-adaptive presentation mode. Waits for state so the
    // server-rendered `theme-default` never flashes off before data lands.
    if (themeSetting === null) return;
    const theme = `theme-${themeSetting}`;
    const level = themeLevel;
    const mode =
      level === "nursery" || level === "school"
        ? "mode-young"
        : level === "pg" || level === "phd" || level === "professional"
          ? "mode-focused"
          : "";
    const wanted = [theme, mode].filter(Boolean);
    const body = document.body;
    // Swap only the theme-/mode- classes so unrelated body classes
    // (e.g. `focus-live` while the clock runs) are never wiped out.
    const apply = () => {
      for (const cls of Array.from(body.classList)) {
        if (/^(theme-|mode-)/.test(cls) && !wanted.includes(cls)) body.classList.remove(cls);
      }
      for (const cls of wanted) body.classList.add(cls);
    };
    const current = Array.from(body.classList).filter((c) => /^(theme-|mode-)/.test(c));
    const unchanged = current.length === wanted.length && wanted.every((c) => current.includes(c));
    const firstPaint = !body.dataset.themeReady;
    body.dataset.themeReady = "1";
    if (unchanged) return;
    // v13: where the View Transitions API exists, the theme flip becomes a
    // real cross-fade instead of an instant repaint. Skipped on the very
    // first paint (nothing to cross-fade from) and under reduced motion.
    // While the cross-fade runs, `.theme-switching` freezes per-element CSS
    // colour transitions so the view transition is the ONLY animation —
    // otherwise the two fades stack and the flip looks like a weird
    // double-morph instead of one clean dissolve.
    const doc = document as Document & {
      startViewTransition?: (cb: () => void) => { finished?: Promise<unknown> } | undefined;
    };
    if (!firstPaint && doc.startViewTransition && !window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      const root = document.documentElement;
      root.classList.add("theme-switching");
      const vt = doc.startViewTransition(apply);
      const done = () => root.classList.remove("theme-switching");
      if (vt && vt.finished && typeof vt.finished.then === "function") {
        vt.finished.then(done, done);
      } else {
        window.setTimeout(done, 500);
      }
    } else {
      apply();
    }
  }, [themeSetting, themeLevel]);

  /* Calm interaction layer. The old per-click pulse, icon pop, pointer-light
     listener and ripple were removed; hover/focus states now carry the
     micro-feedback. We keep only real completion celebration + touch haptics. */
  const navRef = useRef<HTMLElement | null>(null);
  useEffect(() => {
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)");
    const coarse = window.matchMedia("(pointer: coarse)");
    const CONFETTI = ["--accent", "--success-accent"];
    const burst = (x: number, y: number) => {
      const cs = getComputedStyle(document.body);
      for (let i = 0; i < 8; i++) {
        const p = document.createElement("span");
        p.className = "confetti";
        p.style.background = cs.getPropertyValue(CONFETTI[i % CONFETTI.length]);
        p.style.left = `${x}px`;
        p.style.top = `${y}px`;
        document.body.appendChild(p);
        const angle = ((Math.PI * 2) / 8) * i + Math.random() * 0.5;
        const dist = 24 + Math.random() * 22;
        const anim = p.animate(
          [
            { transform: "translate(-50%,-50%) rotate(0deg)", opacity: 0.85 },
            {
              transform: `translate(calc(-50% + ${(Math.cos(angle) * dist).toFixed(1)}px), calc(-50% + ${(Math.sin(angle) * dist - 10).toFixed(1)}px)) rotate(${(180 + Math.random() * 180).toFixed(0)}deg)`,
              opacity: 0,
            },
          ],
          { duration: 520 + Math.random() * 180, easing: "cubic-bezier(.22,1,.36,1)" },
        );
        anim.onfinish = () => p.remove();
        anim.oncancel = () => p.remove();
      }
    };
    const onClick = (e: MouseEvent) => {
      const t = e.target;
      if (!(t instanceof Element)) return;
      if (coarse.matches) haptic(6);
      const el = t.closest("button, a, .rate-btn, [role='button']");
      if (!(el instanceof HTMLElement)) return;
      if (reduce.matches) return;
      const label = (el.textContent || "").trim();
      if (label === "Done" || el.matches(".rate-btn")) {
        const rect = el.getBoundingClientRect();
        const fromKeyboard = e.detail === 0 || (e.clientX === 0 && e.clientY === 0);
        const px = fromKeyboard ? rect.left + rect.width / 2 : e.clientX;
        const py = fromKeyboard ? rect.top + rect.height / 2 : e.clientY;
        burst(px, py);
      }
    };
    document.addEventListener("click", onClick);
    return () => document.removeEventListener("click", onClick);
  }, []);

  /* v14 — advancing through the rail slides the new view in from the right,
     stepping back from the left. Anything that is not a rail move (an AI
     command, a re-plan landing on the Planner) travels forward. */
  const goPage = useCallback((next: Page) => {
    setNav((prev) => {
      if (prev.page === next) return prev;
      const from = NAV.findIndex((n) => n.id === prev.page);
      const to = NAV.findIndex((n) => n.id === next);
      return { page: next, dir: from < 0 || to >= from ? "fwd" : "back" };
    });
    setDrawerOpen(false);
  }, []);

  const toggleZenFullscreen = useCallback(() => {
    const el = zenRef.current;
    if (!el) return;
    try {
      if (document.fullscreenElement) void document.exitFullscreen();
      else void el.requestFullscreen?.();
    } catch { /* fullscreen may be blocked — Zen still works */ }
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
          const fresh = await api<SessionLogResponse>("/api/sessions", {
            method: "POST",
            body: JSON.stringify(entry),
            timeoutMs: 25_000,
          });
          sessionQueueRef.current.shift();
          persistSessionQueue();
          setState(fresh);
          if (fresh.completedTask) {
            autoCompleteRef.current(fresh, fresh.completedTask, entry.date);
          }
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
    clockApiRef.current = clock;
  });
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

  /** Dashboard hero: one tap starts a smart clock session AND jumps to
   *  the Focus Studio, so "Start Focus" always does both. */
  const startFocusSession = useCallback(() => {
    if (!clock.sessionActive) startSmartClock();
    else if (!clock.running && !clock.onBreak) clock.resume();
    goPage("focus");
  }, [clock, goPage, startSmartClock]);

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

  // Linked focus start (used by Zen): one tap starts the focus timer AND the
  // study clock, so entering Zen no longer means juggling two separate
  // controls. Breaks keep the clock untouched (they are rest, not study).
  const startFocusWithClock = useCallback(() => {
    if (!timer.running) timer.start();
    if (clock.onBreak) {
      clock.endBreak();
      notify("Break ended — study clock resumed with your focus timer.", "success");
      return;
    }
    if (!clock.sessionActive) {
      startSmartClock();
    } else if (!clock.running) {
      clock.resume();
      notify("Study clock resumed with your focus timer.", "success");
    }
  }, [clock, notify, startSmartClock, timer]);

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
          if (a.type === "navigate") goPage(String(a.payload) as Page);
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
          if (action.type === "navigate") goPage(String(action.payload) as Page);
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
    [clock, clockOutNow, goPage, notify, patchSettings, startSmartClock, state]
  );

  if (loading) {
    return (
      <div className="loader-screen">
        <div className="loader-stack">
          <div className="loader-ring"><IconLogo size={28} /></div>
          <div className="loader-title">Study Planner Pro</div>
          <div className="loader-sub">Loading your study plan…</div>
          <div className="loader-skeletons">
            <div className="skeleton skeleton-strong sk-pill" />
            <div className="skeleton skeleton-strong sk-card" />
            <div className="skeleton skeleton-strong sk-card sk-card-soft" />
            <div className="skeleton skeleton-strong sk-card sk-card-faint" />
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
        <button className="btn btn-primary retry-btn" onClick={loadInitialState}>Retry</button>
      </div>
    );
  }

  if (!state.user.onboarded || forceWizard) {
    return <Onboarding
      onDone={(s) => { setState(s); setForceWizard(false); goPage("dashboard"); }}
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

  // Zen ring progress: countdown modes deplete over the block (start full,
  // drain to zero); stopwatch eases a full sweep once an hour. 0..1, NaN-safe.
  const zenRingPct = timer.mode === "stopwatch"
    ? (timer.seconds % 3600) / 3600
    : timer.total ? Math.min(1, Math.max(0, timer.seconds / timer.total)) : 0;

  // The full task title, untruncated — CSS wraps it cleanly instead of
  // slicing it in JS (fixes "Principles of Marketing: Introduction…").
  const clockTaskTitle =
    state.tasks.find((x) => x.id === clock.taskId)?.title ||
    state.subjects.find((x) => x.id === clock.subjectId)?.name ||
    "Free session";

  const commands: Command[] = [
    { id: "nav-dash", group: "Navigate", label: "Go to Overview", hint: "Dashboard", keywords: "home stats", run: () => goPage("dashboard") },
    { id: "nav-plan", group: "Navigate", label: "Go to Planner", hint: "Schedule", keywords: "tasks lessons", run: () => goPage("planner") },
    { id: "nav-focus", group: "Navigate", label: "Go to Focus", hint: "Pomodoro", keywords: "timer deep work", run: () => goPage("focus") },
    { id: "nav-subj", group: "Navigate", label: "Go to Subjects", hint: "Syllabus", keywords: "units topics", run: () => goPage("subjects") },
    { id: "nav-set", group: "Navigate", label: "Go to Settings", keywords: "theme preferences", run: () => goPage("settings") },
    { id: "clock-in", group: "Study Clock", label: clock.running ? "Pause Clock" : clock.sessionActive ? "Resume Clock" : "Clock In", hint: clock.running ? "Freeze, keep session" : "Start recording", keywords: "timer record attendance pause", run: () => (clock.running ? clock.pause() : clock.sessionActive ? clock.resume() : startSmartClock()) },
    { id: "clock-out", group: "Study Clock", label: "Clock Out", hint: clock.sessionActive ? "Stop & save minutes" : "no open session", keywords: "stop end finish timer", run: () => (clock.sessionActive ? clockOutNow() : notify("No open session to close.")) },
    { id: "clock-break", group: "Study Clock", label: clock.onBreak ? "Resume from break" : "Take a break", keywords: "pause rest", run: () => (clock.onBreak ? clock.endBreak() : clock.takeBreak()) },
    { id: "next-lesson", group: "Study Clock", label: "Start next pending lesson", hint: "Clock in + switch", keywords: "begin study start task", run: () => { const t = today(); const next = state.tasks.find((x) => x.date === t && x.status === "pending" && x.id !== clock.taskId); if (next) focusTask(next.id); else notify("Nothing pending today — enjoy the rest day."); } },
    { id: "zen", group: "Focus", label: "Enter Zen mode", hint: "Distraction-free", keywords: "fullscreen minimal", run: () => setZen(true) },
    { id: "ai", group: "AI Tutor", label: "Ask AI Tutor", hint: "Open chat", keywords: "help question doubt", run: () => setChatOpen(true) },
    { id: "ai-today", group: "AI Tutor", label: "What should I study today?", keywords: "plan today", run: () => askTutor("What should I study today and in what order?") },
    { id: "replan", group: "Plan", label: "Re-plan Mathematically", hint: "Rebalance", keywords: "regenerate schedule", run: () => { goPage("planner"); replan(); } },
    { id: "setup", group: "Plan", label: "Re-run Setup Wizard", keywords: "onboarding restart course", run: () => requestWizardRestart() },
  ];

  return (
    <>
      {/* One flex row: [ mark + titles ]  ←→  [ status chip ]. The group keeps
          its own gap, and both ends are bounded so neither stretches. */}
      <header className="mobile-header">
        <button
          className="mh-menu"
          aria-label="Open navigation menu"
          aria-expanded={drawerOpen}
          onClick={() => setDrawerOpen(true)}
        >
          <IconMenu size={20} />
        </button>
        <div className="mh-brand">
          <div className="brand-logo-icon brand-logo-sm" aria-hidden="true"><IconLogo size={14} /></div>
          <div className="mh-titles">
            <span className="mh-wordmark">Study Planner Pro</span>
            <span className="mh-page">{NAV.find((n) => n.id === page)?.label ?? "Study Planner Pro"}</span>
          </div>
        </div>
        <span className="streak-badge mh-streak"><IconFlame /> {state.user.streak}d</span>
      </header>

      {/* Mobile/tablet navigation drawer + scrim */}
      {drawerOpen && <div className="drawer-scrim" onClick={() => setDrawerOpen(false)} aria-hidden="true" />}
      <aside className={`mobile-drawer${drawerOpen ? " open" : ""}`} aria-hidden={!drawerOpen}>
        <div className="drawer-head">
          <div className="brand-header">
            <div className="brand-logo-icon" aria-hidden="true"><IconLogo /></div>
            <div className="brand-text">
              <div className="brand-title">Study Planner Pro</div>
              <div className="brand-course">{state.user.courseName}</div>
            </div>
          </div>
          <button className="drawer-close" aria-label="Close navigation menu" onClick={() => setDrawerOpen(false)}>×</button>
        </div>
        <div className="drawer-tools">
          <button className="drawer-tool" type="button"
            onClick={() => { setDrawerOpen(false); void replan(); }}
            disabled={busy} title="Re-plan schedule with AI">
            <span className={busy ? "replanning-spark" : ""}><IconSpark size={15} /></span>
            <span>Re-plan{busy ? "ning…" : ""}</span>
          </button>
        </div>
        <nav className="drawer-nav">
          {NAV.map((n) => (
            <button
              key={n.id}
              type="button"
              className={`drawer-item${page === n.id ? " active" : ""}`}
              onClick={() => goPage(n.id)}
            >
              {n.icon}<span>{n.label}</span>
            </button>
          ))}
        </nav>
        <div className="drawer-foot">
          <div className="drawer-theme-row" role="group" aria-label="Theme">
            {THEMES.map((th) => (
              <button
                key={th.id}
                type="button"
                className={`drawer-theme-dot theme-swatch--${th.id}${state.settings.theme === th.id ? " active" : ""}`}
                title={th.label}
                aria-label={`Theme: ${th.label}`}
                aria-pressed={state.settings.theme === th.id}
                onClick={() => void patchSettings({ theme: th.id })}
              />
            ))}
          </div>
          <div className="streak-badge foot-badge">
            <IconFlame /> {state.user.streak} Day Streak
          </div>
          <p className="foot-sub">
            {ctx.daysLeft} days left · {ctx.progressPct}% syllabus completed.
          </p>
          <button className="btn btn-secondary btn-sm w-full" onClick={() => { setDrawerOpen(false); requestWizardRestart(); }}>
            Re-run Setup
          </button>
        </div>
      </aside>

      <div className={`app-wrapper${sidebarCollapsed ? " sb-collapsed" : ""}${railAnimating ? " sb-anim" : ""}`}>
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
            {/* Presentational mark: it never carries a nav state, so the only
                highlighted thing in the rail is the active route's pill. */}
            <div className="brand-logo-icon" aria-hidden="true"><IconLogo /></div>
            <div className="brand-text">
              <div className="brand-title">Study Planner Pro</div>
              <div className="brand-course">{state.user.courseName}</div>
            </div>
          </div>
          <nav className="nav-list" ref={navRef}>
            {NAV.map((n) => (
              <div
                key={n.id}
                className={`nav-item${page === n.id ? " active" : ""}`}
                onClick={() => goPage(n.id)}
                title={sidebarCollapsed ? n.label : undefined}
                aria-label={n.label}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); goPage(n.id); } }}
              >
                {n.icon}<span>{n.label}</span>
              </div>
            ))}
          </nav>
          <div className="sidebar-foot">
            <div className="glass-panel tilt-card accent-edge accent-edge--warning">
              <div className="streak-badge foot-badge">
                <IconFlame /> {state.user.streak} Day Streak
              </div>
              <h4 className="foot-title">Keep Moving</h4>
              <p className="foot-sub">
                {ctx.daysLeft} days left · {ctx.progressPct}% syllabus completed.
              </p>
              <button className="btn btn-secondary btn-sm w-full" onClick={requestWizardRestart}>
                Re-run Setup
              </button>
            </div>
          </div>
          {/* ⌘K hint. It lives *inside* the sidebar rather than pinned to the
              viewport corner, so the rail's own width is the hint's width: it
              shrinks, re-centres and stays clipped by the sidebar instead of
              hanging out of it with a word cut in half. The sentence keeps its
              place in the DOM (screen readers still get it) while the rail
              swaps it for the compact key chip. */}
          <div className="cmdk-tip">
            <kbd className="cmdk-tip-key" aria-hidden="true">{cmdGlyph}K</kbd>
            <span className="cmdk-tip-text">Press ⌘K / Ctrl-K for commands</span>
          </div>
        </aside>

        <main className="main-workspace" data-nav-dir={navDir}>
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
              <span className="chip chip-pending tracker-exam-chip">
                <span className="exam-chip-full">{ctx.daysLeft}d to {prettyLong(state.settings.examDate)}</span>
                <span className="exam-chip-short">{ctx.daysLeft}d to exam</span>
              </span>
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
              <span className="tracker-quick-controls">
                <button
                  className="icon-quick-btn"
                  aria-label={`Re-plan schedule${busy ? " (in progress)" : ""}`}
                  title="AI re-plan"
                  disabled={busy}
                  onClick={(e) => { e.stopPropagation(); void replan(); }}
                >
                  <span className={busy ? "replanning-spark" : ""}><IconSpark size={15} /></span>
                </button>
                <div className="quick-popover-wrap" onClick={(e) => e.stopPropagation()}>
                  <button
                    className="icon-quick-btn"
                    aria-label="Notifications"
                    aria-expanded={notifOpen}
                    onClick={(e) => { e.stopPropagation(); setThemeOpen(false); setNotifOpen((v) => !v); }}
                  >
                    <IconBell size={15} />
                    <span className="icon-quick-dot" aria-hidden="true" />
                  </button>
                  {notifOpen && (
                    <div className="quick-popover notif-popover" role="menu">
                      <div className="quick-popover-title">Notifications</div>
                      <div className="notif-row">
                        <span className="notif-dot notif-dot--orange" />
                        <div>
                          <strong>{ctx.overdue > 0 ? `${ctx.overdue} overdue task${ctx.overdue > 1 ? "s" : ""}` : "No overdue tasks"}</strong>
                          <span>{ctx.overdue > 0 ? "Re-plan to redistribute them." : "You're up to date."}</span>
                        </div>
                      </div>
                      <div className="notif-row">
                        <span className="notif-dot notif-dot--green" />
                        <div>
                          <strong>{todayDone}/{todayTotal} lessons done today</strong>
                          <span>{todayTotal ? `${Math.round((todayDone / Math.max(1, todayTotal)) * 100)}% of today's plan` : "Rest day or no plan yet"}</span>
                        </div>
                      </div>
                      <div className="notif-row">
                        <span className="notif-dot notif-dot--violet" />
                        <div>
                          <strong>{state.user.streak} day streak</strong>
                          <span>Study today to keep it alive.</span>
                        </div>
                      </div>
                      <div className="notif-row">
                        <span className="notif-dot notif-dot--blue" />
                        <div>
                          <strong>{ctx.daysLeft} days to {prettyLong(state.settings.examDate)}</strong>
                          <span>{ctx.progressPct}% of the syllabus complete.</span>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
                <div className="quick-popover-wrap" onClick={(e) => e.stopPropagation()}>
                  <button
                    className="icon-quick-btn"
                    aria-label="Change theme"
                    aria-expanded={themeOpen}
                    onClick={(e) => { e.stopPropagation(); setNotifOpen(false); setThemeOpen((v) => !v); }}
                  >
                    <IconPalette size={15} />
                  </button>
                  {themeOpen && (
                    <div className="quick-popover theme-popover" role="menu">
                      <div className="quick-popover-title">Theme</div>
                      {THEMES.map((th) => (
                        <button
                          key={th.id}
                          type="button"
                          className={`theme-pop-item${state.settings.theme === th.id ? " active" : ""}`}
                          onClick={(e) => { e.stopPropagation(); void patchSettings({ theme: th.id }); setThemeOpen(false); }}
                        >
                          <span className={`theme-pop-swatch theme-swatch--${th.id}`} aria-hidden="true" />
                          <span>{th.label}</span>
                          {state.settings.theme === th.id && <IconCheck size={13} />}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </span>
            </div>
          </div>

          {page === "dashboard" && (
            <Dashboard state={state} onTaskStatus={setTaskStatus} onTaskUpdate={updateTask}
              onSkipSubject={skipSubjectForDay} onFocusTask={focusTask}
              activeTaskId={clock.taskId} activeClockSeconds={clock.elapsed}
              clockRunning={clock.running} clockSessionActive={clock.sessionActive} clockOnBreak={clock.onBreak}
              onClockOut={clockOutNow} onPauseOrResume={pauseOrResume}
              replanning={busy} onReplan={replan} onStartFocus={startFocusSession} />
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
            <FocusView state={state} timer={timer} clock={clock} onCompleteTask={(id) => setTaskStatus(id, "done")}
              onZen={() => setZen(true)}
              onClockLink={(msg) => notify(msg, "success")} />
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

      {zen && (
        <div className={`zen${zenMinimal ? " zen-minimal" : ""}`} ref={zenRef}>
          <ZenScene className="zen-environment" />
          <div className="zen-glow" aria-hidden="true" />

          <div className="zen-topbar">
            <button className="zen-ghost" onClick={() => setZenMinimal((v) => !v)} aria-pressed={zenMinimal}>
              <IconFocus2 size={14} /> Focus Mode
            </button>
            <div className="zen-eyebrow">Deep Focus Session</div>
            <div className="zen-topbar-right">
              <button className="zen-ghost" onClick={toggleZenFullscreen}>
                <IconExpand2 size={14} /> Full Screen
              </button>
              <button className="zen-ghost zen-exit" onClick={() => setZen(false)}>Exit Zen</button>
            </div>
          </div>

          {!zenMinimal && (
            <div className="zen-kicker">
              {state.subjects.find((x) => x.id === clock.subjectId)?.name || "Protect this time for what matters"}
            </div>
          )}

          <div className="zen-ring-wrap">
            <svg className="zen-ring" viewBox="0 0 320 320" aria-hidden="true">
              <circle cx="160" cy="160" r="140" className="zen-ring-track" />
              <circle
                cx="160" cy="160" r="140" className="zen-ring-progress"
                style={{
                  strokeDashoffset: 2 * Math.PI * 140 * (1 - zenRingPct),
                }}
              />
            </svg>
            <div className="zen-center">
              <div className="zen-digits mono">{mmss(timer.seconds)}</div>
              <div className="zen-status">
                Study clock: {clock.running ? "recording" : clock.onBreak ? "on break" : clock.sessionActive ? "paused" : "not clocked in"} · {mmss(clock.elapsed)}
              </div>
            </div>
          </div>

          <div className="flex-row gap-md zen-actions">
            <button className="btn btn-primary zen-primary" onClick={() => (timer.running ? timer.pause() : startFocusWithClock())}>
              {timer.running ? "Pause Focus" : "Start Focus + Clock"}
            </button>
            {clock.sessionActive && (
              <>
                <button className="btn btn-secondary zen-secondary" onClick={pauseOrResume}>
                  {clock.running ? "Pause Clock" : "Resume Clock"}
                </button>
                <button className="btn btn-danger" onClick={clockOutNow}>Clock Out</button>
              </>
            )}
            <button className="btn btn-secondary zen-secondary zen-exit-btn" onClick={() => setZen(false)}>Exit Zen</button>
          </div>
          {!timer.running && !clock.sessionActive && (
            <p className="zen-hint">
              “Start Focus + Clock” begins your focus timer and study clock together — one tap, no juggling.
            </p>
          )}

          {!zenMinimal && (
            <div className="zen-guidance">
              <div className="zen-guidance-item"><IconLeaf size={15} /><span>Stay present</span></div>
              <div className="zen-guidance-sep" aria-hidden="true" />
              <div className="zen-guidance-item"><IconFocus2 size={15} /><span>Protect your focus</span></div>
              <div className="zen-guidance-sep" aria-hidden="true" />
              <div className="zen-guidance-item"><IconSpark size={15} /><span>You&apos;ve got this</span></div>
            </div>
          )}
        </div>
      )}

      {/* ── Re-run Setup confirmation (data-wipe warning) ── */}
      {confirmWipe && (
        <div className="modal-overlay" onClick={() => setConfirmWipe(false)}>
          <div className="glass-panel modal-box confirm-box" onClick={(e) => e.stopPropagation()}>
            <div className="confirm-icon"><IconWarn size={22} /></div>
            <h3 className="modal-title">Start fresh with the Setup Wizard?</h3>
            <p className="modal-lead">
              Re-running setup <strong>completely wipes</strong> your current course data — subjects, lessons,
              schedule, logged study minutes and AI chat history — and rebuilds everything from scratch.
            </p>
            <p className="modal-note">
              Your name and app preferences (theme, timer lengths) are kept.
            </p>
            <div className="flex-row gap-sm modal-actions-wrap">
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
