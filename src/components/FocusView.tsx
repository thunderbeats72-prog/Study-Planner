"use client";

import React, { useEffect, useRef, useState } from "react";
import StudyOrbit from "./StudyOrbit";
import focusScene from "../app/focus-clock-studio-scene.webp";
import { today, type AppState } from "@/lib/client";
import { mmss, type TimerMode } from "@/lib/useTimer";
import type { StudySessionApi } from "@/lib/studySession";
import { playSound, setVolume, stopSound, currentSound } from "@/lib/sound";
import { IconCheck, IconClock, IconExpand, IconVolume } from "./icons";

const SOUNDS = [
  { id: "none", label: "Sound Off" }, { id: "rain", label: "Soft Rain" }, { id: "binaural", label: "40Hz Binaural" },
  { id: "brown", label: "Brown Noise" }, { id: "ocean", label: "Ocean Waves" }, { id: "wind", label: "Forest Wind" },
];
const MODES: { id: TimerMode; label: string }[] = [
  { id: "pomodoro", label: "Focus" }, { id: "short", label: "Short Break" }, { id: "long", label: "Long Break" },
  { id: "stopwatch", label: "Stopwatch" }, { id: "custom", label: "Custom" },
];

export default function FocusView({ state, session, onCompleteTask, onZen }: { state: AppState; session: StudySessionApi; onCompleteTask: (id: number) => void; onZen: () => void; }) {
  const [sound, setSound] = useState(() => currentSound());
  const [vol, setVol] = useState(0.3);
  const { timer, clock } = session;
  const t = today();
  const todayTasks = state.tasks.filter((x) => x.date === t);
  useEffect(() => { setVolume(vol); }, [vol]);

  const pick = (id: string) => { setSound(id); if (id === "none") stopSound(); else playSound(id, vol); };
  const pct = timer.mode === "stopwatch" ? (timer.seconds % 3600) / 3600 : timer.total ? timer.seconds / timer.total : 0;
  const circ = 2 * Math.PI * 104;
  const clockTask = state.tasks.find((x) => x.id === clock.taskId);
  const loggedTodayRaw = state.sessions.filter((x) => x.date === t).reduce((a, x) => a + x.minutes, 0);
  const loggedToday = Math.round(loggedTodayRaw * 10) / 10;
  const loggedTodayLabel = Number.isInteger(loggedToday) ? String(loggedToday) : loggedToday.toFixed(1);
  const clockState = clock.running ? "running" : clock.onBreak ? "break" : clock.sessionActive ? "paused" : "idle";
  const clockStateLabel = clock.running ? "Recording now" : clock.onBreak ? "On a break" : clock.sessionActive ? "Paused" : "Ready to start";
  const timerInProgress = timer.mode === "stopwatch" ? timer.seconds > 0 : timer.seconds < timer.total;
  const timerStateLabel = timer.running ? (timer.isBreak ? "BREAK" : "FOCUSED") : timerInProgress ? "PAUSED" : "READY";
  const selectedSoundLabel = SOUNDS.find((x) => x.id === sound)?.label || "Sound Off";

  /* A satisfying close: when a counted-down block reaches zero, surface a
     quiet completion state instead of just snapping back to READY. */
  const [completed, setCompleted] = useState<{ minutes: number } | null>(null);
  const prevSeconds = useRef(timer.seconds);
  useEffect(() => {
    const prev = prevSeconds.current;
    prevSeconds.current = timer.seconds;
    if (timer.mode !== "stopwatch" && timer.total > 0 && prev > 0 && timer.seconds === 0 && !timer.isBreak) {
      setCompleted({ minutes: Math.max(1, Math.round(timer.total / 60)) });
    }
  }, [timer.seconds, timer.mode, timer.total, timer.isBreak]);

  return <div className="fade-in focus-view ed-focusview">
    <div className="page-header focus-page-header ed-pagehead">
      <div className="focus-header-copy">
        <div className="focus-eyebrow ed-eyebrow"><span className="focus-eyebrow-mark" /> Focus Studio</div>
        <h1 className="page-title ed-page-title">Stay with <em>one thing</em>.</h1>
        <p className="page-subtitle">A calm, distraction-free space. Focus timer and study clock are one session.</p>
      </div>
      <div className="ed-pagehead-scene" aria-hidden="true">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={focusScene.src} alt="" draggable={false} />
      </div>
      <button className="btn btn-secondary focus-zen-button" type="button" onClick={onZen}><IconExpand /> Zen Focus Mode</button>
    </div>

    <section className="glass-panel tilt-card liquid-card section-card accent-edge accent-edge--success study-clock-panel" aria-labelledby="study-clock-title">
      <div className="study-clock-header"><div className="study-clock-text-group"><div className="focus-card-eyebrow"><IconClock size={14} /> Study clock <span className={`clock-state-chip clock-state-chip--${clockState}`}><span className="clock-state-dot" /> {clockStateLabel}</span></div><h2 id="study-clock-title" className="section-title study-clock-title">Real study time</h2><p className="study-clock-description">Active focus time is recorded automatically. Pauses and breaks are excluded.</p><div className="study-clock-status" role="status" aria-live="polite"><span>{clockStateLabel}</span><span className="study-clock-status-separator">·</span><strong>{loggedTodayLabel} min logged today</strong></div></div><div className="study-clock-display"><span className="study-clock-display-label">Active time</span><span className="mono stat-big gradient-text">{mmss(clock.elapsed)}</span></div></div>
      <div className="grid-2 clock-pickers">
        <div className="clock-field"><label className="clock-field-label" htmlFor="clock-subject"><span>Studying subject</span><span className="clock-field-hint">Optional</span></label><select id="clock-subject" className="input-field" value={clock.subjectId ?? ""} onChange={(e) => clock.setSubjectId(e.target.value ? Number(e.target.value) : null)}><option value="">— none —</option>{state.subjects.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</select></div>
        <div className="clock-field"><label className="clock-field-label" htmlFor="clock-task"><span>Attach to today&apos;s task</span><span className="clock-field-hint">Optional</span></label><select id="clock-task" className="input-field" value={clock.taskId ?? ""} onChange={(e) => { const v = e.target.value ? Number(e.target.value) : null; clock.setTaskId(v); const task = state.tasks.find((x) => x.id === v); if (task?.subjectId) clock.setSubjectId(task.subjectId); }}><option value="">— free session —</option>{todayTasks.map((x) => <option key={x.id} value={x.id}>{x.title}</option>)}</select></div>
      </div>
      <div className="clock-actions"><div className="clock-action-buttons"><button className={`btn ${session.active ? "btn-secondary" : "btn-primary"} clock-toggle`} type="button" onClick={session.toggle}>{session.active ? "Pause" : clock.sessionActive ? "Resume" : "Start session"}</button>{clock.running && <button className="btn btn-secondary" type="button" onClick={session.takeBreak}>Take a Break</button>}{clock.sessionActive && <button className="btn btn-danger" type="button" onClick={session.endSession}>Clock Out</button>}</div>{clockTask && <div className="clock-task-actions"><span className="chip chip-kind clock-task-chip">{clockTask.actualMinutes}m / {clockTask.plannedMinutes}m planned</span><button className="btn btn-sm btn-primary" type="button" onClick={() => onCompleteTask(clockTask.id)}>Mark task complete</button></div>}</div>
    </section>

    <div className="focus-grid-2">
      <section className="glass-panel tilt-card liquid-card flex-col section-card timer-panel" aria-labelledby="focus-timer-title">
        <div className="timer-panel-heading"><div className="timer-panel-copy"><div className="timer-kicker">Deep-work ritual</div><h2 id="focus-timer-title" className="timer-title">Focus Timer</h2><p className="timer-description">One rhythm, one task, one session.</p></div><div className="timer-cycle-badge" aria-label={`${timer.cycles} cycles completed`}><strong>{timer.cycles}</strong><span>cycles</span></div></div>
        <div className="timer-mode-heading"><span>Choose a mode</span><span className="timer-mode-note">All controls stay synced with the study clock</span></div>
        <div className="mode-row" role="group" aria-label="Focus timer mode">{MODES.map((m) => <button key={m.id} type="button" className={`btn btn-sm ${timer.mode === m.id ? "btn-primary" : "btn-secondary"}`} aria-pressed={timer.mode === m.id} onClick={() => session.setMode(m.id)}>{m.label}</button>)}</div>
        {timer.mode === "custom" && <div className="custom-min-row"><div className="custom-min-copy"><label className="custom-min-label" htmlFor="custom-min">Custom length</label><span>Set the timer from 1 to 180 minutes.</span></div><div className="custom-min-control"><input id="custom-min" aria-label="Custom timer length in minutes" type="number" className="input-field custom-min-input" min={1} max={180} value={timer.customMin} onChange={(e) => timer.setCustomMin(Number(e.target.value) || 1)} /><span>min</span></div></div>}
        <div className="timer-stage"><div className="timer-ring-wrap" role="timer" aria-label={`${mmss(timer.seconds)} ${timerStateLabel.toLowerCase()}`}><svg viewBox="0 0 240 240" aria-hidden="true"><circle cx="120" cy="120" r="104" stroke="var(--row-bg)" strokeWidth="10" fill="transparent" /><circle cx="120" cy="120" r="104" stroke={timer.isBreak ? "var(--success-accent)" : "var(--accent)"} strokeWidth="10" fill="transparent" strokeDasharray={circ} strokeDashoffset={circ * (1 - pct)} strokeLinecap="round" style={{ transition: "stroke-dashoffset .4s linear" }} /></svg><div className="timer-center"><div id="t-digits" className="mono">{mmss(timer.seconds)}</div><div id="t-label">{timerStateLabel}</div></div></div></div>
        <div className="flex-row gap-md timer-controls"><button className="btn btn-primary btn-lg" type="button" onClick={session.toggle}>{session.active ? "Pause" : timer.isBreak ? "Start Break" : timerInProgress ? "Resume" : "Start Focus"}</button><button className="btn btn-secondary btn-lg" type="button" onClick={session.reset}>Reset</button></div>
        <p className="panel-lead timer-footnote">Pause pauses both timers. Clock Out ends the complete focus session. Breaks never count as study time.</p>
      </section>

      <div className="focus-side-column"><section className="glass-panel tilt-card section-card ambient-panel" aria-labelledby="ambient-title"><div className="focus-panel-heading"><span className="focus-panel-icon"><IconVolume /></span><div><h2 id="ambient-title" className="section-title">Ambient sounds</h2><p className="focus-panel-description">A quiet layer behind your focus.</p></div></div><div className="sound-grid" role="group" aria-label="Ambient sound">{SOUNDS.map((x) => <button key={x.id} type="button" className={`sound-option ${sound === x.id ? "is-selected" : ""}`} aria-pressed={sound === x.id} onClick={() => pick(x.id)}><span className="sound-option-label">{x.label}</span><span className="sound-option-indicator" aria-hidden="true">{sound === x.id && <IconCheck size={13} />}</span></button>)}</div><label className="vol-label" htmlFor="ambient-volume"><span>Volume</span><strong>{Math.round(vol * 100)}%</strong></label><input id="ambient-volume" type="range" className="vol-range" min={0} max={1} step={0.05} value={vol} aria-label={`Ambient volume ${Math.round(vol * 100)} percent`} aria-valuetext={`${Math.round(vol * 100)} percent`} onChange={(e) => setVol(Number(e.target.value))} style={{ "--vol-fill": `${Math.round(vol * 100)}%` } as React.CSSProperties} /><div className="ambient-current"><span className="ambient-current-dot" /> {selectedSoundLabel}</div></section>
        <section className="glass-panel tilt-card section-card rules-panel" aria-labelledby="rules-title"><div className="focus-panel-heading"><span className="focus-panel-icon focus-panel-icon--soft"><IconCheck /></span><div><h2 id="rules-title" className="section-title">Session rules</h2><p className="focus-panel-description">Small boundaries, better sessions.</p></div></div><ul className="rules-list"><li><span className="rule-icon"><IconCheck size={12} /></span><span>Phone in another room — not face down.</span></li><li><span className="rule-icon"><IconCheck size={12} /></span><span>One task per session. Write it down first.</span></li><li><span className="rule-icon"><IconCheck size={12} /></span><span>If you stall for 2 minutes, do the easiest sub-step.</span></li><li><span className="rule-icon"><IconCheck size={12} /></span><span>Break = stand up + look far away. Not a screen.</span></li></ul></section></div>
    </div>

    {completed && (
      <div className="ed-complete" role="status" aria-live="polite">
        <div className="ed-complete-card">
          <StudyOrbit className="ed-complete-orbit" density="quiet" />
          <div className="ed-complete-kicker">Focus block finished</div>
          <h3 className="ed-complete-title">Session complete.</h3>
          <p className="ed-complete-sub">{completed.minutes} minutes of focused study. That is the work, done.</p>
          <div className="ed-complete-actions">
            <button className="btn btn-primary" type="button" onClick={() => { setCompleted(null); session.takeBreak(); }}>
              Take a break
            </button>
            <button className="btn btn-quiet" type="button" onClick={() => setCompleted(null)}>
              Keep going
            </button>
          </div>
        </div>
      </div>
    )}
  </div>;
}
