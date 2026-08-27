"use client";

import React, { useEffect, useState } from "react";
import { today, type AppState } from "@/lib/client";
import { mmss, type ClockApi, type TimerApi, type TimerMode } from "@/lib/useTimer";
import { playSound, setVolume, stopSound, currentSound } from "@/lib/sound";
import { IconExpand, IconVolume } from "./icons";

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
  state, timer, clock, onCompleteTask, onZen,
}: {
  state: AppState;
  timer: TimerApi;
  clock: ClockApi;
  onCompleteTask: (id: number) => void;
  onZen: () => void;
}) {
  const [sound, setSound] = useState(() => currentSound());
  const [vol, setVol] = useState(0.3);
  const t = today();
  const todayTasks = state.tasks.filter((x) => x.date === t);

  useEffect(() => { setVolume(vol); }, [vol]);

  const pick = (id: string) => { setSound(id); if (id === "none") stopSound(); else playSound(id, vol); };

  const pct = timer.mode === "stopwatch"
    ? (timer.seconds % 3600) / 3600
    : timer.total ? timer.seconds / timer.total : 0;
  const circ = 2 * Math.PI * 104;
  const clockTask = state.tasks.find((x) => x.id === clock.taskId);
  const loggedTodayRaw = state.sessions.filter((x) => x.date === t).reduce((a, x) => a + x.minutes, 0);
  // 13.5 minutes logged displays as exactly "13.5 min logged today"
  const loggedToday = Math.round(loggedTodayRaw * 10) / 10;
  const loggedTodayLabel = Number.isInteger(loggedToday) ? String(loggedToday) : loggedToday.toFixed(1);

  return (
    <div className="fade-in">
      <div className="page-header">
        <div>
          <h1 className="page-title">Focus Studio</h1>
          <p className="page-subtitle">
            The <strong>clock</strong> records your studied time. The <strong>focus timer</strong> is a separate deep-work ritual — they run independently.
          </p>
        </div>
        <button className="btn btn-secondary" onClick={onZen}><IconExpand /> Zen Focus Mode</button>
      </div>

      {/* ---------------- STUDY CLOCK ---------------- */}
      <div className="glass-panel tilt-card liquid-card section-card accent-edge accent-edge--success">
        <div className="day-head flex flex-row justify-between items-center study-clock-header" style={{ display: "flex", flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
          <div className="flex flex-col study-clock-text-group" style={{ display: "flex", flexDirection: "column" }}>
            <h3 className="section-title gradient-text study-clock-title" style={{ marginBottom: "6px", textDecoration: "none", borderBottom: "none" }}>Study Clock — time tracking</h3>
            <div className="day-meta">
              {clock.running ? "Recording your study time" : clock.onBreak ? "On a break — clock paused" : clock.sessionActive ? "Paused — resume or clock out" : "Not clocked in"}
              {" · "}{loggedTodayLabel} min logged today
            </div>
          </div>
          <div className="mono stat-big gradient-text shimmer-text">{mmss(clock.elapsed)}</div>
        </div>

        <div className="grid-2 clock-pickers">
          <div>
            <label className="lbl">Studying subject</label>
            <select className="input-field" value={clock.subjectId ?? ""}
              onChange={(e) => clock.setSubjectId(e.target.value ? Number(e.target.value) : null)}>
              <option value="">— none —</option>
              {state.subjects.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
            </select>
          </div>
          <div>
            <label className="lbl">Attach to today&apos;s task</label>
            <select className="input-field" value={clock.taskId ?? ""} onChange={(e) => {
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

        <div className="flex-row gap-sm clock-actions flex flex-wrap gap-3" style={{ display: "flex", flexWrap: "wrap", gap: "0.75rem" }}>
          {!clock.sessionActive && (
            <button className="btn btn-primary" onClick={() => clock.clockIn()}>Clock In</button>
          )}
          {clock.running && (
            <>
              <button className="btn btn-secondary" onClick={clock.pause}>Pause</button>
              <button className="btn btn-secondary" onClick={clock.takeBreak}>Take a Break</button>
              <button className="btn btn-danger" onClick={clock.clockOut}>Clock Out</button>
            </>
          )}
          {!clock.running && !clock.onBreak && clock.sessionActive && (
            <>
              <button className="btn btn-primary" onClick={clock.resume}>Resume</button>
              <button className="btn btn-danger" onClick={clock.clockOut}>Clock Out</button>
            </>
          )}
          {clock.onBreak && (
            <>
              <button className="btn btn-primary" onClick={clock.endBreak}>Resume Studying</button>
              <button className="btn btn-danger" onClick={clock.clockOut}>Clock Out</button>
            </>
          )}
          {clockTask && (
            <>
              <span className="chip chip-kind">{clockTask.actualMinutes}m / {clockTask.plannedMinutes}m</span>
              <button className="btn btn-sm btn-primary" onClick={() => onCompleteTask(clockTask.id)}>Mark task complete</button>
            </>
          )}
        </div>
        <div className="panel-lead">
          Minutes are written to the server every 60 seconds, so nothing is lost if you close the tab.
        </div>
      </div>

      {/* ---------------- FOCUS TIMER ---------------- */}
      <div className="focus-grid-2">
        <div className="glass-panel tilt-card liquid-card flex-col section-card timer-panel">
          <div className="timer-kicker shimmer-text">
            Focus Timer · {timer.cycles} cycles done
          </div>
          <div className="flex-row gap-sm mb-md mode-row">
            {MODES.map((m) => (
              <button key={m.id}
                className={`btn btn-sm ${timer.mode === m.id ? "btn-primary" : "btn-secondary"}`}
                onClick={() => timer.setMode(m.id)}>{m.label}</button>
            ))}
          </div>
          {timer.mode === "custom" && (
            <div className="flex-row gap-sm mb-md custom-min-row">
              <label className="custom-min-label" htmlFor="custom-min">Minutes</label>
              <input id="custom-min" type="number" className="input-field custom-min-input" min={1} max={180}
                value={timer.customMin} onChange={(e) => timer.setCustomMin(Number(e.target.value) || 1)} />
            </div>
          )}

          <div className="timer-ring-wrap">
            <svg viewBox="0 0 240 240">
              <circle cx="120" cy="120" r="104" stroke="var(--row-bg)" strokeWidth="10" fill="transparent" />
              <circle cx="120" cy="120" r="104" stroke={timer.isBreak ? "var(--success-accent)" : "var(--accent)"}
                strokeWidth="10" fill="transparent" strokeDasharray={circ}
                strokeDashoffset={circ * (1 - pct)} strokeLinecap="round"
                style={{ transition: "stroke-dashoffset .4s linear" }} />
            </svg>
            <div className="timer-center">
              <div id="t-digits" className="mono shimmer-text">{mmss(timer.seconds)}</div>
              <div id="t-label">{timer.running ? (timer.isBreak ? "BREAK" : "FOCUSED") : "READY"}</div>
            </div>
          </div>

          <div className="flex-row gap-md timer-controls">
            <button className="btn btn-primary btn-lg" onClick={timer.toggle}>
              {timer.running ? "Pause" : timer.isBreak ? "Start Break" : "Start Focus"}
            </button>
            <button className="btn btn-secondary btn-lg" onClick={timer.reset}>Reset</button>
          </div>
          <div className="panel-lead timer-footnote">
            This timer only structures your session. It does <strong>not</strong> start or stop the study clock above.
          </div>
        </div>

        <div className="flex-col gap-md">
          <div className="glass-panel tilt-card section-card">
            <h3 className="section-title section-title--row">
              <IconVolume /> Ambient Sounds
            </h3>
            <div className="flex-col gap-sm mb-md">
              {SOUNDS.map((x) => (
                <button key={x.id} className={`btn btn-left ${sound === x.id ? "btn-primary" : "btn-secondary"}`}
                  onClick={() => pick(x.id)}>{x.label}</button>
              ))}
            </div>
            <label className="vol-label">
              <span>Volume</span><span>{Math.round(vol * 100)}%</span>
            </label>
            <input type="range" className="vol-range" min={0} max={1} step={0.05} value={vol}
              onChange={(e) => setVol(Number(e.target.value))} />
          </div>

          <div className="glass-panel tilt-card section-card">
            <h3 className="section-title">Session Rules</h3>
            <ul className="rules-list">
              <li>Phone in another room — not face down.</li>
              <li>One task per session. Write it down first.</li>
              <li>If you stall for 2 minutes, do the easiest sub-step.</li>
              <li>Break = stand up + look far away. Not a screen.</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}
