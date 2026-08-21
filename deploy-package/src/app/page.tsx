"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import { api, prettyLong, today, type AppState, type MessageRow } from "@/lib/client";
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

const SIDEBAR_KEY = "spp-sidebar-collapsed";

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

  useEffect(() => {
    api<AppState>("/api/state")
      .then(setState)
      .catch(() => notify("Could not reach the server.", "error"))
      .finally(() => setLoading(false));
  }, [notify]);

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
    document.body.className = [theme, mode].filter(Boolean).join(" ");
  }, [state?.settings.theme, state?.user.level]);

  const logSession = useCallback(
    (minutes: number, subjectId: number | null, taskId: number | null, mode: string) => {
      // Send the CLIENT's local date: the server's clock/timezone must
      // never shift a session into a different day than the user sees.
      api<AppState>("/api/sessions", {
        method: "POST",
        body: JSON.stringify({ minutes, subjectId, taskId, mode, date: today() }),
      }).then(setState).catch(() => {});
    },
    []
  );

  // 1) The study clock — tracks actual studied time
  const clock = useStudyClock(logSession);
  useEffect(() => {
    document.body.classList.toggle("focus-live", clock.running);
  }, [clock.running]);

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
    } catch { notify("Update failed.", "error"); }
  };

  const updateTask = async (id: number, patch: TaskPatch) => {
    try {
      const s = await api<AppState>("/api/tasks", { method: "PATCH", body: JSON.stringify({ id, ...patch }) });
      setState(s);
      notify("Task updated successfully.", "success");
    } catch { notify("Could not update task.", "error"); }
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
    } catch { notify("Could not skip subject.", "error"); }
  };

  const replan = async () => {
    // A fast second tap previously launched two destructive rebuilds in
    // parallel. The ref closes that pre-render window immediately.
    if (replanInFlightRef.current) return;
    replanInFlightRef.current = true;
    setBusy(true);
    try {
      const s = await api<AppState>("/api/replan", { method: "POST" });
      setState(s);
      const scheduled = s.stats?.scheduledTopics;
      notify(
        scheduled
          ? `Rebalanced from today · ${scheduled} lessons scheduled.`
          : "Schedule rebalanced from today — overdue work moved forward.",
        "success"
      );
    } catch {
      notify("Re-plan failed — your existing schedule was left unchanged.", "error");
    } finally {
      replanInFlightRef.current = false;
      setBusy(false);
    }
  };

  const patchSettings = async (patch: Record<string, unknown>, replanIt = false) => {
    setBusy(true);
    try {
      const s = await api<AppState>("/api/settings", {
        method: "PATCH",
        body: JSON.stringify({ ...patch, _replan: replanIt }),
      });
      setState(s);
      notify(replanIt ? "Settings saved — schedule regenerated." : "Saved.", "success");
    } catch { notify("Save failed.", "error"); } finally { setBusy(false); }
  };

  const addSubject = async (payload: { name: string; units: number; difficulty: string; color: string }) => {
    setBusy(true);
    try {
      setState(await api<AppState>("/api/subjects", { method: "POST", body: JSON.stringify(payload) }));
      notify("Subject added and lessons generated.", "success");
    } catch { notify("Could not add subject.", "error"); } finally { setBusy(false); }
  };

  const editSubject = async (payload: { id: number; name: string; units: number; difficulty: string; color: string }) => {
    setBusy(true);
    try {
      setState(await api<AppState>("/api/subjects", { method: "PATCH", body: JSON.stringify(payload) }));
      notify("Subject updated, schedule rebalanced.", "success");
    } catch { notify("Could not update.", "error"); } finally { setBusy(false); }
  };

  const deleteSubject = async (id: number) => {
    setBusy(true);
    try {
      setState(await api<AppState>(`/api/subjects?id=${id}`, { method: "DELETE" }));
      notify("Subject removed.");
    } catch { notify("Could not delete.", "error"); } finally { setBusy(false); }
  };

  const startSmartClock = () => {
    const t = today();
    const task = state?.tasks.find((x) => x.date === t && x.status === "pending") ||
      state?.tasks.find((x) => x.date === t);
    if (task) {
      clock.clockIn({ taskId: task.id, subjectId: task.subjectId ?? null });
      notify(`Clocked in: ${task.title.slice(0, 48)}`);
    } else {
      const sub = state?.subjects[0];
      clock.clockIn({ subjectId: sub?.id ?? null, taskId: null });
      notify(sub ? `Clocked in to ${sub.name}.` : "Clocked in — free session.");
    }
  };

  const focusTask = (taskId: number) => {
    const task = state?.tasks.find((x) => x.id === taskId);
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
    async (q: string, meta?: { voice?: boolean }) => {
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
        const r = await api<{ reply: string; action: { type: string; payload?: unknown } | null; state: AppState }>(
          "/api/chat",
          {
            method: "POST",
            body: JSON.stringify({ message, source: meta?.voice ? "voice" : "text" }),
          }
        );
        setState(r.state);
        setPendingMsgs([]);
        const a = r.action;
        if (a) {
          if (a.type === "navigate") setPage(String(a.payload) as Page);
          if (a.type === "startTimer") { if (!clock.running) startSmartClock(); }
          if (a.type === "stopTimer") { if (clock.running) clock.clockOut(); }
          if (a.type === "pause") { if (clock.running) clock.pause(); else notify("No session running to pause."); }
          if (a.type === "resume") { if (clock.onBreak) clock.endBreak(); else if (!clock.running) startSmartClock(); }
          if (a.type === "break") { if (clock.running) clock.takeBreak(); else notify("Start a session first, then take a break."); }
          if (a.type === "zen") setZen(true);
          // The chat API already performs and returns a fresh replan. Calling
          // /api/replan again here caused a second rebuild and race.
          if (a.type === "theme") { void patchSettings({ theme: String(a.payload) }); }
        }
      } catch {
        notify("Tutor unavailable right now.", "error");
        setPendingMsgs((prev) => [
          ...prev,
          {
            id: -Date.now() - 1, userId: 0, role: "assistant",
            content: "I couldn't reach the tutor service just now. Please try asking again.",
            createdAt: new Date().toISOString(),
          },
        ]);
      } finally {
        chatInFlightRef.current = false;
        setThinking(false);
      }
    },
    [clock]
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
        <div className="loader-sub">Refresh the page to retry.</div>
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
    { id: "clock-in", group: "Study Clock", label: clock.running ? "Clock Out" : "Clock In", hint: clock.running ? "Stop & log" : "Start recording", keywords: "timer record attendance", run: () => (clock.running ? clock.clockOut() : startSmartClock()) },
    { id: "clock-break", group: "Study Clock", label: clock.onBreak ? "Resume from break" : "Take a break", keywords: "pause rest", run: () => (clock.onBreak ? clock.endBreak() : clock.takeBreak()) },
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
          <div className="tracker-bar">
            <div className="flex-row gap-md tracker-status">
              <div className={`pulse-dot${clock.running ? " live" : ""}`} />
              <div className="tracker-labels">
                <div className="tracker-state">
                  {clock.running ? "Clocked in" : clock.onBreak ? "On break" : "Not clocked in"}
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
              {!clock.running && !clock.onBreak && (
                <button className="btn btn-xs btn-primary" onClick={startSmartClock}>Clock In</button>
              )}
              {clock.running && (
                <>
                  <button className="btn btn-xs btn-secondary act-pause" onClick={clock.pause}>Pause</button>
                  <button className="btn btn-xs btn-secondary act-break" onClick={clock.takeBreak}>Break</button>
                  <button className="btn btn-xs btn-danger act-out" onClick={clock.clockOut}>Clock Out</button>
                </>
              )}
              {clock.onBreak && (
                <button className="btn btn-xs btn-primary" onClick={clock.endBreak}>Resume</button>
              )}
              {ambient !== "none" && (
                <button className="btn btn-xs btn-secondary ambient-pill" onClick={() => stopSound()} title="Stop ambient sound">
                  <span className="ambient-bars"><i /><i /><i /></span> Stop sound
                </button>
              )}
              <button className="btn btn-xs btn-secondary" aria-label="Enter Zen focus mode" onClick={() => setZen(true)}><IconBolt size={12} /> Zen</button>
            </div>
          </div>

          {page === "dashboard" && (
            <Dashboard state={state} onTaskStatus={setTaskStatus} onTaskUpdate={updateTask}
              onSkipSubject={skipSubjectForDay} onFocusTask={focusTask}
              activeTaskId={clock.taskId} activeClockSeconds={clock.elapsed}
              replanning={busy} onReplan={replan} />
          )}
          {page === "planner" && (
            <PlannerView state={state} onTaskStatus={setTaskStatus} onTaskUpdate={updateTask}
              onSkipSubject={skipSubjectForDay} onFocusTask={focusTask}
              activeTaskId={clock.taskId} activeClockSeconds={clock.elapsed}
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
            Study clock: {clock.running ? "recording" : clock.onBreak ? "on break" : "not clocked in"} · {mmss(clock.elapsed)}
          </div>
          <div className="flex-row gap-md" style={{ flexWrap: "wrap", justifyContent: "center" }}>
            <button className="btn btn-primary" onClick={timer.toggle}>{timer.running ? "Pause Focus" : "Start Focus"}</button>
            {!clock.running
              ? <button className="btn btn-secondary" onClick={startSmartClock}>Clock In</button>
              : <button className="btn btn-secondary" onClick={clock.pause}>Pause Clock</button>}
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
