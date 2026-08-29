"use client";

import React, { useEffect, useState } from "react";
import StudyScene from "./StudyScene";
import { THEMES, type AppState } from "@/lib/client";
import { IconSpark, IconCheck } from "./icons";

/* Swatch previews for the theme picker — each tile shows the theme's
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
  // Local preference (the server settings table doesn't store this).
  // Seed the control from localStorage in an event-time lazy initialiser
  // so no effect/setState machinery is involved.
  const [longBreakAfter, setLongBreakAfter] = useState<number>(4);
  const [prefLoaded, setPrefLoaded] = useState(false);
  const hydratePref = () => {
    if (prefLoaded) return;
    let v = 4;
    try {
      const raw = localStorage.getItem("spp-long-break-after");
      if (raw) v = Math.min(8, Math.max(2, Number(raw) || 4));
    } catch { /* private mode */ }
    setLongBreakAfter(v);
    setPrefLoaded(true);
  };
  const set = (k: string, v: unknown) => setLocal((p) => ({ ...p, [k]: v }));

  // Derive a clean status label — never expose which AI provider is active.
  const engineStatus = state.aiProvider ? "Active" : "Local mode";

  return (
    <div className="fade-in settings-view">
      <div className="page-header">
        <StudyScene variant="settings" className="page-header-scene" />
        <div>
          <h1 className="page-title">Settings</h1>
          <p className="page-subtitle">Tune your schedule, timer, and appearance.</p>
        </div>
      </div>

      <div className="settings-grid">
        {/* ── LEFT: Schedule Engine ── */}
        <div className="flex-col gap-md settings-col">
          <div className="glass-panel tilt-card section-card">
            <h3 className="section-title">Schedule Engine</h3>

            <div className="mb-md"><label className="lbl" htmlFor="set-name">Your Name</label>
              <input id="set-name" className="input-field" value={local.name} onChange={(e) => set("name", e.target.value)} /></div>

            <div className="mb-md"><label className="lbl" htmlFor="set-start">Start Date</label>
              <input id="set-start" type="date" className="input-field" value={local.startDate} onChange={(e) => set("startDate", e.target.value)} /></div>

            <div className="mb-md"><label className="lbl" htmlFor="set-exam">Target / Exam Date</label>
              <input id="set-exam" type="date" className="input-field" value={local.examDate} onChange={(e) => set("examDate", e.target.value)} /></div>

            <div className="mb-md"><label className="lbl" htmlFor="set-hours">Daily Target Hours</label>
              <input id="set-hours" type="number" min={1} max={14} className="input-field" value={local.dailyHours}
                onChange={(e) => set("dailyHours", Number(e.target.value))} /></div>

            <div className="mb-md"><label className="lbl" htmlFor="set-subjects">Subjects Per Day</label>
              <select id="set-subjects" className="input-field" value={local.subjectsPerDay} onChange={(e) => set("subjectsPerDay", Number(e.target.value))}>
                {[1, 2, 3, 4, 5, 6].map((n) => <option key={n} value={n}>{n}/day</option>)}
              </select></div>

            <div className="mb-md"><label className="lbl" htmlFor="set-days">Study Days</label>
              <select id="set-days" className="input-field" value={local.studyDays} onChange={(e) => set("studyDays", e.target.value)}>
                <option value="all">All 7 days</option>
                <option value="6days">6 days (Sun off)</option>
                <option value="weekdays">Weekdays only</option>
              </select></div>

            <div className="mb-md"><label className="lbl" htmlFor="set-buffer">Buffer Days</label>
              <input id="set-buffer" type="number" min={0} max={30} className="input-field" value={local.bufferDays}
                onChange={(e) => set("bufferDays", Number(e.target.value))} /></div>

            <div className="mb-md"><label className="lbl" htmlFor="set-mode">Plan Mode</label>
              <select id="set-mode" className="input-field" value={local.planMode} onChange={(e) => set("planMode", e.target.value)}>
                <option value="syllabus">Syllabus</option>
                <option value="revision">Revision</option>
                <option value="mock">Mock-heavy</option>
              </select></div>

            <div className="mb-md"><label className="lbl" htmlFor="set-style">Study Style</label>
              <select id="set-style" className="input-field" value={local.studyStyle} onChange={(e) => set("studyStyle", e.target.value)}>
                <option value="balanced">Balanced</option>
                <option value="theory">Theory heavy</option>
                <option value="practice">Practice heavy</option>
              </select></div>

            <div className="mb-md"><label className="lbl" htmlFor="set-weak">Weakest Subject</label>
              <select id="set-weak" className="input-field" value={local.weakSubject} onChange={(e) => set("weakSubject", e.target.value)}>
                <option value="none">None</option>
                {state.subjects.map((x) => <option key={x.id} value={String(x.id)}>{x.name}</option>)}
              </select></div>

            <div className="mb-md"><label className="lbl" htmlFor="set-revision">Revision Block (weeks)</label>
              <select id="set-revision" className="input-field" value={local.revisionWeeks} onChange={(e) => set("revisionWeeks", Number(e.target.value))}>
                <option value={0}>None</option>
                <option value={1}>1 week</option>
                <option value={2}>2 weeks</option>
                <option value={3}>3 weeks</option>
              </select></div>

            <button className="btn btn-primary w-full" disabled={busy} onClick={() => onPatch(local, true)}>
              <IconSpark size={14} />{busy ? "Rebuilding…" : "Save & Re-plan"}
            </button>
          </div>

          <div className="glass-panel tilt-card section-card">
            <h3 className="section-title">Engine Status</h3>
            <div className="engine-status">
              <div><span>Shigun AI</span><strong className={state.aiProvider ? "is-live" : ""}>{engineStatus}</strong></div>
              <div><span>Lessons generated</span><strong>{state.topics.length}</strong></div>
              <div><span>Scheduled tasks</span><strong>{state.tasks.length}</strong></div>
              <div><span>Sessions logged</span><strong>{state.sessions.length}</strong></div>
            </div>
            <button className="btn btn-secondary w-full mt-md" onClick={onRestart}>
              Re-run Setup Wizard
            </button>
          </div>
        </div>

        {/* ── RIGHT: Appearance + Timer ── */}
        <div className="flex-col gap-md settings-col">
          <div className="glass-panel tilt-card section-card">
            <h3 className="section-title">Appearance</h3>
            <div className="theme-card-grid">
              {THEMES.map((th) => {
                const active = s.theme === th.id;
                return (
                  <button
                    key={th.id}
                    type="button"
                    className={`theme-card${active ? " active" : ""}`}
                    aria-pressed={active}
                    onClick={() => onPatch({ theme: th.id })}
                  >
                    <span className="theme-card-swatch" style={{ background: THEME_SWATCH[th.id] }}>
                      {active && <span className="theme-card-check"><IconCheck size={12} /></span>}
                    </span>
                    <span className="theme-card-label">{th.label}</span>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="glass-panel tilt-card section-card">
            <h3 className="section-title">Timer</h3>
            <div className="settings-timer-grid">
              <div><label className="lbl" htmlFor="set-focus">Focus Length</label>
                <div className="input-affix">
                  <input id="set-focus" type="number" min={5} max={120} className="input-field" defaultValue={s.pomodoro}
                    onBlur={(e) => onPatch({ pomodoro: Number(e.target.value) })} />
                  <span className="input-suffix">min</span>
                </div></div>
              <div><label className="lbl" htmlFor="set-short">Short Break</label>
                <div className="input-affix">
                  <input id="set-short" type="number" min={1} max={30} className="input-field" defaultValue={s.shortBreak}
                    onBlur={(e) => onPatch({ shortBreak: Number(e.target.value) })} />
                  <span className="input-suffix">min</span>
                </div></div>
              <div><label className="lbl" htmlFor="set-long">Long Break</label>
                <div className="input-affix">
                  <input id="set-long" type="number" min={5} max={60} className="input-field" defaultValue={s.longBreak}
                    onBlur={(e) => onPatch({ longBreak: Number(e.target.value) })} />
                  <span className="input-suffix">min</span>
                </div></div>
              <div onMouseEnter={hydratePref}>
                <label className="lbl" htmlFor="set-long-after">Long Break After</label>
                <div className="input-affix">
                  <input id="set-long-after" type="number" min={2} max={8} className="input-field"
                    value={longBreakAfter}
                    onFocus={hydratePref}
                    onChange={(e) => setLongBreakAfter(Math.min(8, Math.max(2, Number(e.target.value) || 4)))}
                    onBlur={(e) => {
                      hydratePref();
                      const v = Math.min(8, Math.max(2, Number(e.target.value) || 4));
                      try { localStorage.setItem("spp-long-break-after", String(v)); } catch { /* noop */ }
                    }} />
                  <span className="input-suffix">blocks</span>
                </div></div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
