"use client";

import React, { useState } from "react";
import { THEMES, type AppState } from "@/lib/client";
import { IconSpark } from "./icons";

/* Swatch previews for the theme picker — each dot shows the theme's
   canvas→accent duotone so the choice reads at a glance. */
const THEME_SWATCH: Record<string, string> = {
  default: "linear-gradient(135deg,#F6F5FA 18%,#7D6DF0 60%,#5D4DE0)",
  "silver-lavender": "linear-gradient(135deg,#F3F3F8 18%,#968EE9 60%,#6F63D8)",
  mint: "linear-gradient(135deg,#F4FAF7 18%,#34D399 60%,#0FA37F)",
  sunset: "linear-gradient(135deg,#FBF6F1 18%,#FB923C 60%,#DC5E0C)",
  dark: "linear-gradient(135deg,#0E0E10 18%,#9494F5 60%,#6E6EF0)",
  obsidian: "linear-gradient(135deg,#0B0F1A 18%,#4CC5F9 60%,#22A8E6)",
  nebula: "linear-gradient(135deg,#100B20 18%,#B168F8 60%,#9333EA)",
};

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

  // Derive a clean status label — never expose which AI provider is active.
  const engineStatus = state.aiProvider ? "Active" : "Local mode";

  return (
    <div className="fade-in">
      <div className="page-header">
        <div>
          <h1 className="page-title">Settings</h1>
          <p className="page-subtitle">Tune your schedule, timer, and appearance.</p>
        </div>
      </div>

      <div className="grid-fit-300">
        {/* ── Left column: Schedule Engine ── */}
        <div className="glass-panel tilt-card section-card">
          <h3 className="section-title">Schedule Engine</h3>

          <div className="mb-md"><label className="lbl">Your Name</label>
            <input className="input-field" value={local.name} onChange={(e) => set("name", e.target.value)} /></div>

          <div className="mb-md"><label className="lbl">Start Date</label>
            <input type="date" className="input-field" value={local.startDate} onChange={(e) => set("startDate", e.target.value)} /></div>

          <div className="mb-md"><label className="lbl">Target / Exam Date</label>
            <input type="date" className="input-field" value={local.examDate} onChange={(e) => set("examDate", e.target.value)} /></div>

          <div className="mb-md"><label className="lbl">Daily Target Hours</label>
            <input type="number" min={1} max={14} className="input-field" value={local.dailyHours}
              onChange={(e) => set("dailyHours", Number(e.target.value))} /></div>

          <div className="mb-md"><label className="lbl">Subjects per Day</label>
            <select className="input-field" value={local.subjectsPerDay} onChange={(e) => set("subjectsPerDay", Number(e.target.value))}>
              {[1, 2, 3, 4, 5, 6].map((n) => <option key={n} value={n}>{n}/day</option>)}
            </select></div>

          <div className="mb-md"><label className="lbl">Study Days</label>
            <select className="input-field" value={local.studyDays} onChange={(e) => set("studyDays", e.target.value)}>
              <option value="all">All 7 days</option>
              <option value="6days">6 days (Sun off)</option>
              <option value="weekdays">Weekdays only</option>
            </select></div>

          <div className="mb-md"><label className="lbl">Buffer Days</label>
            <input type="number" min={0} max={30} className="input-field" value={local.bufferDays}
              onChange={(e) => set("bufferDays", Number(e.target.value))} /></div>

          <div className="mb-md"><label className="lbl">Plan Mode</label>
            <select className="input-field" value={local.planMode} onChange={(e) => set("planMode", e.target.value)}>
              <option value="syllabus">Syllabus</option>
              <option value="revision">Revision</option>
              <option value="mock">Mock-heavy</option>
            </select></div>

          <div className="mb-md"><label className="lbl">Study Style</label>
            <select className="input-field" value={local.studyStyle} onChange={(e) => set("studyStyle", e.target.value)}>
              <option value="balanced">Balanced</option>
              <option value="theory">Theory heavy</option>
              <option value="practice">Practice heavy</option>
            </select></div>

          <div className="mb-md"><label className="lbl">Weakest Subject</label>
            <select className="input-field" value={local.weakSubject} onChange={(e) => set("weakSubject", e.target.value)}>
              <option value="none">None</option>
              {state.subjects.map((x) => <option key={x.id} value={String(x.id)}>{x.name}</option>)}
            </select></div>

          <div className="mb-md"><label className="lbl">Revision Block (weeks)</label>
            <select className="input-field" value={local.revisionWeeks} onChange={(e) => set("revisionWeeks", Number(e.target.value))}>
              <option value={0}>None</option>
              <option value={1}>1 week</option>
              <option value={2}>2 weeks</option>
              <option value={3}>3 weeks</option>
            </select></div>

          <button className="btn btn-primary w-full" disabled={busy} onClick={() => onPatch(local, true)}>
            <IconSpark size={14} />{busy ? "Rebuilding…" : "Save & Re-plan"}
          </button>
        </div>

        {/* ── Right column ── */}
        <div className="flex-col gap-md">

          {/* Appearance */}
          <div className="glass-panel tilt-card section-card">
            <h3 className="section-title">Appearance</h3>
            <div className="grid-2 theme-grid">
              {THEMES.map((th) => (
                <button
                  key={th.id}
                  className={`btn ${s.theme === th.id ? "btn-primary" : "btn-secondary"}`}
                  onClick={() => onPatch({ theme: th.id })}
                >
                  <span className="theme-dot" aria-hidden style={{ background: THEME_SWATCH[th.id] }} />
                  {th.label}
                </button>
              ))}
            </div>
          </div>

          {/* Timer */}
          <div className="glass-panel tilt-card section-card">
            <h3 className="section-title">Timer</h3>
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

          {/* Engine Status — clean, no provider names */}
          <div className="glass-panel tilt-card section-card">
            <h3 className="section-title">Engine Status</h3>
            <div className="engine-status">
              <div>Shigun AI: <strong className={state.aiProvider ? "is-live" : ""}>{engineStatus}</strong></div>
              <div>Lessons generated: <strong>{state.topics.length}</strong></div>
              <div>Scheduled tasks: <strong>{state.tasks.length}</strong></div>
              <div>Sessions logged: <strong>{state.sessions.length}</strong></div>
            </div>
            <button className="btn btn-secondary w-full mt-md" onClick={onRestart}>
              Re-run Setup Wizard
            </button>
          </div>

        </div>
      </div>
    </div>
  );
}
