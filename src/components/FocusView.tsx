"use client";

import React, { useEffect, useState } from "react";
import { today, type AppState } from "@/lib/client";
import { mmss, type ClockApi, type TimerApi, type TimerMode } from "@/lib/useTimer";
import { playSound, setVolume, stopSound } from "@/lib/sound";
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
  const [sound, setSound] = useState("none");
  const [vol, setVol] = useState(0.3);
  const t = today();
  const todayTasks = state.tasks.filter((x) => x.date === t);

  useEffect(() => () => stopSound(), []);
  useEffect(() => { setVolume(vol); }, [vol]);

  const pick = (id: string) => { setSound(id); playSound(id, vol); };

  const pct = timer.mode === "stopwatch"
    ? (timer.seconds % 3600) / 3600
    : timer.total ? timer.seconds / timer.total : 0;
  const circ = 2 * Math.PI * 104;
  const clockTask = state.tasks.find((x) => x.id === clock.taskId);
  const loggedToday = Math.round(state.sessions.filter((x) => x.date === t).reduce((a, x) => a + x.minutes, 0));

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
      <div className="glass-panel tilt-card" style={{ padding: 22, marginBottom: 16, borderLeft: "4px solid var(--success-accent)" }}>
        <div className="day-head">
          <div>
            <h3 style={{ fontSize: ".95rem", fontWeight: 800, margin: 0 }}>Study Clock — time tracking</h3>
            <div className="day-meta">
              {clock.running ? "Recording your study time" : clock.onBreak ? "On a break — clock paused" : "Not clocked in"}
              {" · "}{loggedToday} min logged today
            </div>
          </div>
          <div className="mono" style={{ fontSize: "1.9rem", fontWeight: 800, fontVariantNumeric: "tabular-nums" }}>
            {mmss(clock.elapsed)}
          </div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 14 }}>
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

        <div className="flex-row gap-sm" style={{ flexWrap: "wrap" }}>
          {!clock.running && !clock.onBreak && (
            <button className="btn btn-primary" onClick={() => clock.clockIn()}>Clock In</button>
          )}
          {clock.running && (
            <>
              <button className="btn btn-secondary" onClick={clock.pause}>Pause</button>
              <button className="btn btn-secondary" onClick={clock.takeBreak}>Take a Break</button>
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
        <div style={{ fontSize: ".74rem", color: "var(--text-dim)", fontWeight: 600, marginTop: 10 }}>
          Minutes are written to the server every 60 seconds, so nothing is lost if you close the tab.
        </div>
      </div>

      {/* ---------------- FOCUS TIMER ---------------- */}
      <div className="focus-grid-2">
        <div className="glass-panel tilt-card flex-col" style={{ padding: 28, alignItems: "center" }}>
          <div style={{ fontSize: ".7rem", fontWeight: 800, textTransform: "uppercase", letterSpacing: 1, color: "var(--text-muted)", marginBottom: 12 }}>
            Focus Timer · {timer.cycles} cycles done
          </div>
          <div className="flex-row gap-sm mb-md" style={{ flexWrap: "wrap", justifyContent: "center" }}>
            {MODES.map((m) => (
              <button key={m.id}
                className={`btn btn-sm ${timer.mode === m.id ? "btn-primary" : "btn-secondary"}`}
                onClick={() => timer.setMode(m.id)}>{m.label}</button>
            ))}
          </div>
          {timer.mode === "custom" && (
            <div className="flex-row gap-sm mb-md">
              <span style={{ fontSize: ".78rem", fontWeight: 700, color: "var(--text-muted)" }}>Minutes</span>
              <input type="number" className="input-field" style={{ width: 90, height: 34 }} min={1} max={180}
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
            <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
              <div id="t-digits" className="mono">{mmss(timer.seconds)}</div>
              <div id="t-label">{timer.running ? (timer.isBreak ? "BREAK" : "FOCUSED") : "READY"}</div>
            </div>
          </div>

          <div className="flex-row gap-md">
            <button className="btn btn-primary" style={{ padding: "13px 30px", fontSize: ".95rem" }} onClick={timer.toggle}>
              {timer.running ? "Pause" : timer.isBreak ? "Start Break" : "Start Focus"}
            </button>
            <button className="btn btn-secondary" style={{ padding: "13px 16px" }} onClick={timer.reset}>Reset</button>
          </div>
          <div style={{ fontSize: ".74rem", color: "var(--text-dim)", fontWeight: 600, marginTop: 14, textAlign: "center", maxWidth: 320 }}>
            This timer only structures your session. It does <strong>not</strong> start or stop the study clock above.
          </div>
        </div>

        <div className="flex-col gap-md">
          <div className="glass-panel tilt-card" style={{ padding: 22 }}>
            <h3 style={{ fontSize: ".92rem", fontWeight: 800, margin: "0 0 14px", display: "flex", alignItems: "center", gap: 8 }}>
              <IconVolume /> Ambient Sounds
            </h3>
            <div className="flex-col gap-sm mb-md">
              {SOUNDS.map((x) => (
                <button key={x.id} className={`btn ${sound === x.id ? "btn-primary" : "btn-secondary"}`}
                  style={{ justifyContent: "flex-start" }} onClick={() => pick(x.id)}>{x.label}</button>
              ))}
            </div>
            <label style={{ display: "flex", justifyContent: "space-between", fontSize: ".78rem", fontWeight: 700, color: "var(--text-muted)", marginBottom: 6 }}>
              <span>Volume</span><span>{Math.round(vol * 100)}%</span>
            </label>
            <input type="range" min={0} max={1} step={0.05} value={vol} style={{ width: "100%", accentColor: "var(--accent)" }}
              onChange={(e) => setVol(Number(e.target.value))} />
          </div>

          <div className="glass-panel tilt-card" style={{ padding: 22 }}>
            <h3 style={{ fontSize: ".92rem", fontWeight: 800, margin: "0 0 12px" }}>Session Rules</h3>
            <ul style={{ margin: 0, paddingLeft: 18, fontSize: ".82rem", color: "var(--text-muted)", lineHeight: 1.8, fontWeight: 550 }}>
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
