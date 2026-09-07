"use client";

import React, { useEffect, useRef, useState } from "react";
import StudyScene from "./StudyScene";
import { THEMES, type AppState } from "@/lib/client";
import { IconSpark, IconCheck, IconClock, IconBook, IconCalendar } from "./icons";
import { OnboardingSlider } from "./Onboarding";

/* Swatch previews for the theme picker — each tile shows the theme's
   canvas→accent duotone so the choice reads at a glance. v26: the retired
   "Default" preset is gone; Silver Lavender leads as the light theme. */
const THEME_SWATCH: Record<string, string> = {
  "silver-lavender": "linear-gradient(135deg,#F3F3F8 18%,#968EE9 60%,#6F63D8)",
  mint: "linear-gradient(135deg,#F4FAF7 18%,#34D399 60%,#0FA37F)",
  sunset: "linear-gradient(135deg,#FBF6F1 18%,#FB923C 60%,#DC5E0C)",
  dark: "linear-gradient(135deg,#08080B 18%,#9494F5 60%,#6E6EF0)",
  obsidian: "linear-gradient(135deg,#0B0F1A 18%,#4CC5F9 60%,#22A8E6)",
  nebula: "linear-gradient(135deg,#100B20 18%,#B168F8 60%,#9333EA)",
};

/* v26: premium sliders replace the raw number inputs. Values are seeded from
   the live settings (i.e. every slider opens on its current/default value)
   and commits are debounced so a drag produces ONE patch, not forty. */
function SettingsSlider({
  label, value, valueLabel, hint, min, max, step, minLabel, maxLabel, icon, onCommit,
}: {
  label: string; value: number; valueLabel: (v: number) => string; hint?: string;
  min: number; max: number; step: number; minLabel: string; maxLabel: string;
  icon?: React.ReactNode; onCommit: (v: number) => void;
}) {
  // Draft-while-dragging: the slider shows the draft, and 450ms after the
  // last tick the commit lands and the draft clears (prop is source of
  // truth again). One PATCH per drag, never one per tick.
  const [draft, setDraft] = useState<number | null>(null);
  const timer = useRef<number | null>(null);
  useEffect(() => () => { if (timer.current) window.clearTimeout(timer.current); }, []);
  const v = draft ?? value;
  return (
    <OnboardingSlider
      label={label}
      value={v}
      valueLabel={valueLabel(v)}
      hint={hint}
      min={min}
      max={max}
      step={step}
      minLabel={minLabel}
      maxLabel={maxLabel}
      icon={icon}
      fullWidth
      onChange={(n) => {
        setDraft(n);
        if (timer.current) window.clearTimeout(timer.current);
        timer.current = window.setTimeout(() => {
          onCommit(n);
          setDraft(null);
        }, 450);
      }}
    />
  );
}

function hoursLabel(v: number) {
  const whole = Math.floor(v);
  const mins = Math.round((v - whole) * 60);
  if (!whole) return `${mins}m`;
  if (!mins) return `${whole}h`;
  return `${whole}h ${mins}m`;
}

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
  // Seeded once via a lazy initialiser — no effect/setState machinery.
  const [longBreakAfter, setLongBreakAfter] = useState<number>(() => {
    try {
      const raw = localStorage.getItem("spp-long-break-after");
      if (raw) return Math.min(8, Math.max(2, Number(raw) || 4));
    } catch { /* private mode */ }
    return 4;
  });
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

            <div className="settings-slider-stack mb-md">
              <SettingsSlider
                label="Daily Target Hours" icon={<IconClock size={16} />}
                value={local.dailyHours} valueLabel={(v) => `${hoursLabel(v)}/day`}
                min={0.5} max={14} step={0.5} minLabel="30 min" maxLabel="14h"
                onCommit={(v) => set("dailyHours", v)}
              />
              <SettingsSlider
                label="Subjects Per Day" icon={<IconBook size={16} />}
                value={local.subjectsPerDay} valueLabel={(v) => `${v}/day`}
                min={1} max={6} step={1} minLabel="1" maxLabel="6"
                onCommit={(v) => set("subjectsPerDay", v)}
              />
              <SettingsSlider
                label="Buffer Days" icon={<IconCalendar size={16} />}
                value={local.bufferDays} valueLabel={(v) => `${v} days`}
                min={0} max={30} step={1} minLabel="0" maxLabel="30"
                onCommit={(v) => set("bufferDays", v)}
              />
            </div>

            <div className="mb-md"><label className="lbl" htmlFor="set-days">Study Days</label>
              <select id="set-days" className="input-field" value={local.studyDays} onChange={(e) => set("studyDays", e.target.value)}>
                <option value="all">All 7 days</option>
                <option value="6days">6 days (Sun off)</option>
                <option value="weekdays">Weekdays only</option>
              </select></div>

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
            <div className="settings-slider-stack">
              <SettingsSlider
                label="Focus Length" icon={<IconClock size={16} />}
                value={s.pomodoro} valueLabel={(v) => `${v} min`}
                min={5} max={120} step={5} minLabel="5 min" maxLabel="120 min"
                onCommit={(v) => onPatch({ pomodoro: v })}
              />
              <SettingsSlider
                label="Short Break" icon={<IconClock size={16} />}
                value={s.shortBreak} valueLabel={(v) => `${v} min`}
                min={1} max={30} step={1} minLabel="1 min" maxLabel="30 min"
                onCommit={(v) => onPatch({ shortBreak: v })}
              />
              <SettingsSlider
                label="Long Break" icon={<IconClock size={16} />}
                value={s.longBreak} valueLabel={(v) => `${v} min`}
                min={5} max={60} step={5} minLabel="5 min" maxLabel="60 min"
                onCommit={(v) => onPatch({ longBreak: v })}
              />
              <SettingsSlider
                label="Long Break After" icon={<IconClock size={16} />}
                value={longBreakAfter} valueLabel={(v) => `${v} blocks`}
                min={2} max={8} step={1} minLabel="2" maxLabel="8"
                onCommit={(v) => {
                  setLongBreakAfter(v);
                  try { localStorage.setItem("spp-long-break-after", String(v)); } catch { /* noop */ }
                }}
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
