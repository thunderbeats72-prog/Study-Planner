"use client";

import React, { useEffect, useState } from "react";
import StudyScene from "./StudyScene";
import { today, type AppState } from "@/lib/client";
import { mmss, type ClockApi, type TimerApi, type TimerMode } from "@/lib/useTimer";
import { playSound, setVolume, stopSound, currentSound } from "@/lib/sound";
import { IconCheck, IconClock, IconExpand, IconVolume } from "./icons";

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
  state, timer, clock, onCompleteTask, onZen, onClockLink,
}: {
  state: AppState;
  timer: TimerApi;
  clock: ClockApi;
  onCompleteTask: (id: number) => void;
  onZen: () => void;
  /** Called when the focus timer starts the study clock too (linked mode). */
  onClockLink: (message: string) => void;
}) {
  const [sound, setSound] = useState(() => currentSound());
  const [vol, setVol] = useState(0.3);
  const [longBreakAfter, setLongBreakAfter] = useState(4);
  const t = today();
  const todayTasks = state.tasks.filter((x) => x.date === t);

  useEffect(() => { setVolume(vol); }, [vol]);

  // "Long break after N focus blocks" — a local preference (the server
  // settings table doesn't store it), defaulting to the classic 4. Read
  // async after mount so no setState runs synchronously in the effect.
  useEffect(() => {
    const id = window.setTimeout(() => {
      try {
        const raw = localStorage.getItem("spp-long-break-after");
        if (raw) setLongBreakAfter(Math.min(8, Math.max(2, Number(raw) || 4)));
      } catch { /* private mode */ }
    }, 0);
    return () => window.clearTimeout(id);
  }, []);

  // Auto-flow: when a focus block ends, roll into a short break; a long
  // break arrives every Nth block. When a break ends, return to focus.
  useEffect(() => {
    if (timer.running || timer.mode === "stopwatch" || timer.mode === "custom") return;
    if (timer.seconds !== 0) return;
    const id = window.setTimeout(() => {
      if (timer.mode === "pomodoro") {
        const n = Math.max(2, longBreakAfter);
        timer.setMode(timer.cycles > 0 && timer.cycles % n === 0 ? "long" : "short");
      } else {
        timer.setMode("pomodoro");
      }
    }, 900);
    return () => window.clearTimeout(id);
  }, [timer, longBreakAfter]);

  const pick = (id: string) => {
    setSound(id);
    if (id === "none") stopSound();
    else playSound(id, vol);
  };

  const pct = timer.mode === "stopwatch"
    ? (timer.seconds % 3600) / 3600
    : timer.total ? timer.seconds / timer.total : 0;
  const circ = 2 * Math.PI * 104;
  const clockTask = state.tasks.find((x) => x.id === clock.taskId);
  const loggedTodayRaw = state.sessions.filter((x) => x.date === t).reduce((a, x) => a + x.minutes, 0);
  // 13.5 minutes logged displays as exactly "13.5 min logged today"
  const loggedToday = Math.round(loggedTodayRaw * 10) / 10;
  const loggedTodayLabel = Number.isInteger(loggedToday) ? String(loggedToday) : loggedToday.toFixed(1);
  const clockState = clock.running ? "running" : clock.onBreak ? "break" : clock.sessionActive ? "paused" : "idle";
  const clockStateLabel = clock.running
    ? "Recording now"
    : clock.onBreak
      ? "On a break"
      : clock.sessionActive
        ? "Paused"
        : "Ready to start";
  const timerInProgress = timer.mode === "stopwatch"
    ? timer.seconds > 0
    : timer.seconds < timer.total;
  const timerStateLabel = timer.running ? (timer.isBreak ? "BREAK" : "FOCUSED") : timerInProgress ? "PAUSED" : "READY";
  const selectedSoundLabel = SOUNDS.find((x) => x.id === sound)?.label || "Sound Off";

  /**
   * Linked start: one tap begins the focus block AND the study clock, so the
   * learner never juggles two timers. Breaks are the exception — a short or
   * long break is rest, so the clock keeps whatever state it was in.
   */
  const toggleTimerLinked = () => {
    if (timer.running) { timer.pause(); return; }
    if (timer.isBreak) { timer.start(); return; }
    timer.start();
    if (clock.onBreak) {
      clock.endBreak();
      onClockLink("Break ended — study clock resumed with your focus timer.");
    } else if (!clock.sessionActive) {
      const firstTask = state.tasks.find((x) => x.date === t && x.status === "pending")
        || state.tasks.find((x) => x.date === t)
        || null;
      clock.clockIn({ taskId: firstTask?.id ?? null, subjectId: firstTask?.subjectId ?? null });
      onClockLink(firstTask
        ? `Study clock started on “${firstTask.title.slice(0, 40)}” — minutes are recorded.`
        : "Study clock started — free session. Attach a task to track it.");
    } else if (!clock.running) {
      clock.resume();
      onClockLink("Study clock resumed with your focus timer.");
    }
  };

  return (
    <div className="fade-in focus-view">
      <div className="page-header focus-page-header">
        <StudyScene className="page-header-scene" />
        <div className="focus-header-copy">
          <div className="focus-eyebrow"><span className="focus-eyebrow-mark" /> Focus Studio</div>
          <h1 className="page-title">Focus Studio</h1>
          <p className="page-subtitle">
            A calm, distraction-free space — record real study time with the clock, then protect your attention with the focus timer.
          </p>
        </div>
        <button className="btn btn-secondary focus-zen-button" type="button" onClick={onZen}>
          <IconExpand /> Zen Focus Mode
        </button>
      </div>

      {/* ---------------- STUDY CLOCK ---------------- */}
      <section className="glass-panel tilt-card liquid-card section-card accent-edge accent-edge--success study-clock-panel" aria-labelledby="study-clock-title">
        <div className="study-clock-header">
          <div className="study-clock-text-group">
            <div className="focus-card-eyebrow">
              <IconClock size={14} /> Study clock
              <span className={`clock-state-chip clock-state-chip--${clockState}`}>
                <span className="clock-state-dot" /> {clockStateLabel}
              </span>
            </div>
            <h2 id="study-clock-title" className="section-title study-clock-title">Track your real study time</h2>
            <p className="study-clock-description">
              The clock logs active minutes to your plan. Pauses and breaks stay out of your study total.
            </p>
            <div className="study-clock-status" role="status" aria-live="polite">
              <span>{clockStateLabel}</span>
              <span className="study-clock-status-separator" aria-hidden="true">·</span>
              <strong>{loggedTodayLabel} min logged today</strong>
            </div>
          </div>
          <div className="study-clock-display" aria-label={`Active study time ${mmss(clock.elapsed)}`}>
            <span className="study-clock-display-label">Active time</span>
            <span className="mono stat-big gradient-text shimmer-text">{mmss(clock.elapsed)}</span>
          </div>
        </div>

        <div className="grid-2 clock-pickers">
          <div className="clock-field">
            <label className="clock-field-label" htmlFor="clock-subject">
              <span>Studying subject</span><span className="clock-field-hint">Optional</span>
            </label>
            <select id="clock-subject" className="input-field" value={clock.subjectId ?? ""}
              onChange={(e) => clock.setSubjectId(e.target.value ? Number(e.target.value) : null)}>
              <option value="">— none —</option>
              {state.subjects.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
            </select>
          </div>
          <div className="clock-field">
            <label className="clock-field-label" htmlFor="clock-task">
              <span>Attach to today&apos;s task</span><span className="clock-field-hint">Optional</span>
            </label>
            <select id="clock-task" className="input-field" value={clock.taskId ?? ""} onChange={(e) => {
              const v = e.target.value ? Number(e.target.value) : null;
              clock.setTaskId(v);
              const task = state.tasks.find((x) => x.id === v);
              if (task?.subjectId) clock.setSubjectId(task.subjectId);
            }}>
              <option value="">— free session —</option>
              {todayTasks.map((x) => <option key={x.id} value={x.id}>{x.title}</option>)}
            </select>
          </div>
        </div>

        <div className="clock-actions">
          <div className="clock-action-buttons">
            {!clock.sessionActive && (
              <button className="btn btn-primary" type="button" onClick={() => clock.clockIn()}>Clock In</button>
            )}
            {clock.running && (
              <>
                <button className="btn btn-secondary" type="button" onClick={clock.pause}>Pause</button>
                <button className="btn btn-secondary" type="button" onClick={clock.takeBreak}>Take a Break</button>
                <button className="btn btn-danger" type="button" onClick={clock.clockOut}>Clock Out</button>
              </>
            )}
            {!clock.running && !clock.onBreak && clock.sessionActive && (
              <>
                <button className="btn btn-primary" type="button" onClick={clock.resume}>Resume</button>
                <button className="btn btn-danger" type="button" onClick={clock.clockOut}>Clock Out</button>
              </>
            )}
            {clock.onBreak && (
              <>
                <button className="btn btn-primary" type="button" onClick={clock.endBreak}>Resume Studying</button>
                <button className="btn btn-danger" type="button" onClick={clock.clockOut}>Clock Out</button>
              </>
            )}
          </div>
          {clockTask && (
            <div className="clock-task-actions">
              <span className="chip chip-kind clock-task-chip">{clockTask.actualMinutes}m / {clockTask.plannedMinutes}m planned</span>
              <button className="btn btn-sm btn-primary" type="button" onClick={() => onCompleteTask(clockTask.id)}>Mark task complete</button>
            </div>
          )}
        </div>
        <p className="panel-lead clock-save-note">
          Minutes sync to the server every 60 seconds, so your progress stays safe if you close the tab.
        </p>
      </section>

      {/* ---------------- FOCUS TIMER ---------------- */}
      <div className="focus-grid-2">
        <section className="glass-panel tilt-card liquid-card flex-col section-card timer-panel" aria-labelledby="focus-timer-title">
          <div className="timer-panel-heading">
            <div className="timer-panel-copy">
              <div className="timer-kicker shimmer-text">Deep-work ritual</div>
              <h2 id="focus-timer-title" className="timer-title">Focus Timer</h2>
              <p className="timer-description">Choose a rhythm and stay with one task until the bell.</p>
            </div>
            <div className="timer-cycle-badge" aria-label={`${timer.cycles} cycles completed`}>
              <strong>{timer.cycles}</strong><span>cycles</span>
            </div>
          </div>

          <div className="timer-mode-heading">
            <span>Choose a mode</span>
            <span className="timer-mode-note">Start Focus also starts the study clock · breaks don&apos;t</span>
          </div>
          <div className="mode-row" role="group" aria-label="Focus timer mode">
            {MODES.map((m) => (
              <button key={m.id} type="button"
                className={`btn btn-sm ${timer.mode === m.id ? "btn-primary" : "btn-secondary"}`}
                aria-pressed={timer.mode === m.id}
                onClick={() => timer.setMode(m.id)}>{m.label}</button>
            ))}
          </div>

          {timer.mode === "custom" && (
            <div className="custom-min-row">
              <div className="custom-min-copy">
                <label className="custom-min-label" htmlFor="custom-min">Custom length</label>
                <span>Set the timer from 1 to 180 minutes.</span>
              </div>
              <div className="custom-min-control">
                <input id="custom-min" aria-label="Custom timer length in minutes" type="number" className="input-field custom-min-input" min={1} max={180}
                  value={timer.customMin} onChange={(e) => timer.setCustomMin(Number(e.target.value) || 1)} />
                <span>min</span>
              </div>
            </div>
          )}

          <div className="timer-stage">
            <div className="timer-ring-wrap" role="timer" aria-label={`${mmss(timer.seconds)} ${timerStateLabel.toLowerCase()}`}>
              <svg viewBox="0 0 240 240" aria-hidden="true">
                <circle cx="120" cy="120" r="104" stroke="var(--row-bg)" strokeWidth="10" fill="transparent" />
                <circle cx="120" cy="120" r="104" stroke={timer.isBreak ? "var(--success-accent)" : "var(--accent)"}
                  strokeWidth="10" fill="transparent" strokeDasharray={circ}
                  strokeDashoffset={circ * (1 - pct)} strokeLinecap="round"
                  style={{ transition: "stroke-dashoffset .4s linear" }} />
              </svg>
              <div className="timer-center">
                <div id="t-digits" className="mono shimmer-text">{mmss(timer.seconds)}</div>
                <div id="t-label">{timerStateLabel}</div>
              </div>
            </div>
          </div>

          <div className="flex-row gap-md timer-controls">
            <button className="btn btn-primary btn-lg" type="button" onClick={toggleTimerLinked}>
              {timer.running ? "Pause" : timer.isBreak ? "Start Break" : timerInProgress ? "Resume Focus" : "Start Focus"}
            </button>
            <button className="btn btn-secondary btn-lg" type="button" onClick={timer.reset}>Reset</button>
          </div>
          <p className="panel-lead timer-footnote">
            Starting a focus block also starts the study clock, so your minutes are recorded. Breaks never touch the clock.
          </p>
        </section>

        <div className="focus-side-column">
          <section className="glass-panel tilt-card section-card ambient-panel" aria-labelledby="ambient-title">
            <div className="focus-panel-heading">
              <span className="focus-panel-icon"><IconVolume /></span>
              <div>
                <h2 id="ambient-title" className="section-title">Ambient sounds</h2>
                <p className="focus-panel-description">A quiet layer behind your focus.</p>
              </div>
            </div>
            <div className="sound-grid" role="group" aria-label="Ambient sound">
              {SOUNDS.map((x) => (
                <button key={x.id} type="button" className={`sound-option ${sound === x.id ? "is-selected" : ""}`}
                  aria-pressed={sound === x.id} onClick={() => pick(x.id)}>
                  <span className="sound-option-label">{x.label}</span>
                  <span className="sound-option-indicator" aria-hidden="true">{sound === x.id && <IconCheck size={13} />}</span>
                </button>
              ))}
            </div>
            <label className="vol-label" htmlFor="ambient-volume">
              <span>Volume</span><strong>{Math.round(vol * 100)}%</strong>
            </label>
            <input id="ambient-volume" type="range" className="vol-range" min={0} max={1} step={0.05} value={vol}
              aria-label={`Ambient volume ${Math.round(vol * 100)} percent`}
              onChange={(e) => setVol(Number(e.target.value))} />
            <div className="ambient-current"><span className="ambient-current-dot" /> {selectedSoundLabel}</div>
          </section>

          <section className="glass-panel tilt-card section-card rules-panel" aria-labelledby="rules-title">
            <div className="focus-panel-heading">
              <span className="focus-panel-icon focus-panel-icon--soft"><IconCheck /></span>
              <div>
                <h2 id="rules-title" className="section-title">Session rules</h2>
                <p className="focus-panel-description">Small boundaries, better sessions.</p>
              </div>
            </div>
            <ul className="rules-list">
              <li><span className="rule-icon"><IconCheck size={12} /></span><span>Phone in another room — not face down.</span></li>
              <li><span className="rule-icon"><IconCheck size={12} /></span><span>One task per session. Write it down first.</span></li>
              <li><span className="rule-icon"><IconCheck size={12} /></span><span>If you stall for 2 minutes, do the easiest sub-step.</span></li>
              <li><span className="rule-icon"><IconCheck size={12} /></span><span>Break = stand up + look far away. Not a screen.</span></li>
            </ul>
          </section>
        </div>
      </div>
    </div>
  );
}
