"use client";

import React, { useState } from "react";
import { THEMES, type AppState } from "@/lib/client";
import { IconSpark } from "./icons";

export default function SettingsView({
  state, onPatch, onRestart, busy,
}: {
  state: AppState;
  onPatch: (patch: Record<string, unknown>, replan?: boolean) => void;
  onRestart: () => void;
  busy: boolean;
}) {
  const s = state.settings;
  const [local, setLocal] = useState({
    name: state.user.name,
    startDate: s.startDate, examDate: s.examDate, dailyHours: s.dailyHours,
    subjectsPerDay: s.subjectsPerDay, studyDays: s.studyDays, bufferDays: s.bufferDays,
    planMode: s.planMode, studyStyle: s.studyStyle, weakSubject: s.weakSubject, revisionWeeks: s.revisionWeeks,
  });
  const set = (k: string, v: unknown) => setLocal((p) => ({ ...p, [k]: v }));

  return (
    <div className="fade-in">
      <div className="page-header">
        <div>
          <h1 className="page-title">Settings</h1>
          <p className="page-subtitle">Tune the engine, the timer and the look. Saving the engine section re-plans instantly.</p>
        </div>
      </div>

      <div className="grid-fit-300">
        <div className="glass-panel tilt-card" style={{ padding: 22 }}>
          <h3 style={{ fontSize: ".95rem", fontWeight: 800, margin: "0 0 16px" }}>Schedule Engine</h3>
          <div className="mb-md"><label className="lbl">Your Name</label>
            <input className="input-field" value={local.name} onChange={(e) => set("name", e.target.value)} /></div>
          <div className="mb-md"><label className="lbl">Start Date</label>
            <input type="date" className="input-field" value={local.startDate} onChange={(e) => set("startDate", e.target.value)} /></div>
          <div className="mb-md"><label className="lbl">Target / Exam Date</label>
            <input type="date" className="input-field" value={local.examDate} onChange={(e) => set("examDate", e.target.value)} /></div>
          <div className="mb-md"><label className="lbl">Daily Target Hours</label>
            <input type="number" min={1} max={14} className="input-field" value={local.dailyHours} onChange={(e) => set("dailyHours", Number(e.target.value))} /></div>
          <div className="mb-md"><label className="lbl">Subjects per Day</label>
            <select className="input-field" value={local.subjectsPerDay} onChange={(e) => set("subjectsPerDay", Number(e.target.value))}>
              {[1,2,3,4,5,6].map((n) => <option key={n} value={n}>{n}/day</option>)}
            </select></div>
          <div className="mb-md"><label className="lbl">Study Days</label>
            <select className="input-field" value={local.studyDays} onChange={(e) => set("studyDays", e.target.value)}>
              <option value="all">All 7 days</option><option value="6days">6 days (Sun off)</option><option value="weekdays">Weekdays only</option>
            </select></div>
          <div className="mb-md"><label className="lbl">Buffer Days</label>
            <input type="number" min={0} max={30} className="input-field" value={local.bufferDays} onChange={(e) => set("bufferDays", Number(e.target.value))} /></div>
          <div className="mb-md"><label className="lbl">Plan Mode</label>
            <select className="input-field" value={local.planMode} onChange={(e) => set("planMode", e.target.value)}>
              <option value="syllabus">Syllabus</option><option value="revision">Revision</option><option value="mock">Mock-heavy</option>
            </select></div>
          <div className="mb-md"><label className="lbl">Study Style</label>
            <select className="input-field" value={local.studyStyle} onChange={(e) => set("studyStyle", e.target.value)}>
              <option value="balanced">Balanced</option><option value="theory">Theory heavy</option><option value="practice">Practice heavy</option>
            </select></div>
          <div className="mb-md"><label className="lbl">Weakest Subject</label>
            <select className="input-field" value={local.weakSubject} onChange={(e) => set("weakSubject", e.target.value)}>
              <option value="none">None</option>
              {state.subjects.map((x) => <option key={x.id} value={String(x.id)}>{x.name}</option>)}
            </select></div>
          <div className="mb-md"><label className="lbl">Revision Block (weeks)</label>
            <select className="input-field" value={local.revisionWeeks} onChange={(e) => set("revisionWeeks", Number(e.target.value))}>
              <option value={0}>None</option><option value={1}>1 week</option><option value={2}>2 weeks</option><option value={3}>3 weeks</option>
            </select></div>
          <button className="btn btn-primary w-full" disabled={busy} onClick={() => onPatch(local, true)}>
            <IconSpark size={14} />{busy ? "Rebuilding…" : "Save & Re-plan with AI"}
          </button>
        </div>

        <div className="flex-col gap-md">
          <div className="glass-panel tilt-card" style={{ padding: 22 }}>
            <h3 style={{ fontSize: ".95rem", fontWeight: 800, margin: "0 0 16px" }}>Appearance</h3>
            <div className="grid-2" style={{ gap: 9 }}>
              {THEMES.map((th) => (
                <button key={th.id} className={`btn ${s.theme === th.id ? "btn-primary" : "btn-secondary"}`}
                  onClick={() => onPatch({ theme: th.id })}>{th.label}</button>
              ))}
            </div>
          </div>

          <div className="glass-panel tilt-card" style={{ padding: 22 }}>
            <h3 style={{ fontSize: ".95rem", fontWeight: 800, margin: "0 0 16px" }}>Timer</h3>
            <div className="mb-md"><label className="lbl">Focus length (min)</label>
              <input type="number" min={5} max={120} className="input-field" defaultValue={s.pomodoro}
                onBlur={(e) => onPatch({ pomodoro: Number(e.target.value) })} /></div>
            <div className="mb-md"><label className="lbl">Short break (min)</label>
              <input type="number" min={1} max={30} className="input-field" defaultValue={s.shortBreak}
                onBlur={(e) => onPatch({ shortBreak: Number(e.target.value) })} /></div>
            <div><label className="lbl">Long break (min)</label>
              <input type="number" min={5} max={60} className="input-field" defaultValue={s.longBreak}
                onBlur={(e) => onPatch({ longBreak: Number(e.target.value) })} /></div>
          </div>

          <div className="glass-panel tilt-card" style={{ padding: 22 }}>
            <h3 style={{ fontSize: ".95rem", fontWeight: 800, margin: "0 0 10px" }}>Engine Status</h3>
            <div style={{ fontSize: ".82rem", color: "var(--text-muted)", lineHeight: 1.7, fontWeight: 600 }}>
              <div>AI provider: <strong>{state.aiProvider || "SHIGUN local engine"}</strong></div>
              <div>Lessons generated: <strong>{state.topics.length}</strong></div>
              <div>Scheduled tasks: <strong>{state.tasks.length}</strong></div>
              <div>Sessions logged: <strong>{state.sessions.length}</strong></div>
            </div>
            <button className="btn btn-secondary w-full mt-md" onClick={onRestart}>Re-run 7-step Setup Wizard</button>
          </div>
        </div>
      </div>
    </div>
  );
}
