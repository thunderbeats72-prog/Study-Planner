"use client";

import React, { useEffect, useState } from "react";
import { THEMES, type AppState } from "@/lib/client";
import {
  IconCheck, IconClose, IconDownload, IconGear, IconMoon, IconPalette,
  IconRefresh, IconSpark, IconTarget, IconTrash, IconUser, IconVolume, IconWarn,
} from "./icons";
import { PageHead } from "./bits";
import { Reveal, Spot } from "@/lib/fx";
import { cn } from "@/lib/cn";

/* Theme swatch previews */
const THEME_SWATCH: Record<string, { bg: string; accent: string; sub: string }> = {
  default: { bg: "#f2f0f9", accent: "#5b4bd5", sub: "Soft lavender daylight" },
  "silver-lavender": { bg: "#f3f3f8", accent: "#6f63d8", sub: "Crisp silver studio" },
  mint: { bg: "#f4faf7", accent: "#0fa37f", sub: "Fresh emerald mint" },
  sunset: { bg: "#fbf6f1", accent: "#dc5e0c", sub: "Warm terracotta twilight" },
  dark: { bg: "#0b0b10", accent: "#8b7cf6", sub: "Midnight near-black" },
  obsidian: { bg: "#0b0f1a", accent: "#22a8e6", sub: "Deep cyber obsidian" },
  nebula: { bg: "#100b20", accent: "#9333ea", sub: "Cosmic violet nebula" },
};

export default function SettingsView({
  state,
  onPatch,
  onRestart,
  busy,
}: {
  state: AppState;
  onPatch: (patch: Record<string, unknown>, replan?: boolean) => void;
  onRestart: () => void;
  busy: boolean;
}) {
  const s = state.settings;
  const [local, setLocal] = useState({
    name: state.user.name,
    startDate: s.startDate,
    examDate: s.examDate,
    dailyHours: s.dailyHours,
    subjectsPerDay: s.subjectsPerDay,
    studyDays: s.studyDays,
    bufferDays: s.bufferDays,
    planMode: s.planMode,
    studyStyle: s.studyStyle,
    weakSubject: s.weakSubject,
    revisionWeeks: s.revisionWeeks,
    pomodoro: s.pomodoro || 25,
    shortBreak: s.shortBreak || 5,
    longBreak: s.longBreak || 15,
  });

  const [savedToast, setSavedToast] = useState(false);
  const [confirmWipeModal, setConfirmWipeModal] = useState(false);

  const set = (k: string, v: unknown) => setLocal((p) => ({ ...p, [k]: v }));

  const handleSaveProfile = () => {
    onPatch(
      {
        name: local.name.trim() || state.user.name,
        startDate: local.startDate,
        examDate: local.examDate,
        dailyHours: local.dailyHours,
        subjectsPerDay: local.subjectsPerDay,
        studyDays: local.studyDays,
        bufferDays: local.bufferDays,
        planMode: local.planMode,
        studyStyle: local.studyStyle,
        weakSubject: local.weakSubject,
        revisionWeeks: local.revisionWeeks,
      },
      true
    );
    setSavedToast(true);
    setTimeout(() => setSavedToast(false), 2500);
  };

  const exportJsonData = () => {
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(state, null, 2));
    const downloadAnchor = document.createElement("a");
    downloadAnchor.setAttribute("href", dataStr);
    downloadAnchor.setAttribute("download", `study-planner-export-${state.user.name || "plan"}.json`);
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();
  };

  return (
    <div className="space-y-6 fade-in settings-view">
      <PageHead
        eyebrow="SETTINGS"
        title="Tune the studio"
        sub="Personalise your pace, theme, learning style, and study rhythm — everything persists locally on this device."
      />

      <div className="grid gap-6 lg:grid-cols-2">
        {/* ── 1. PROFILE & TARGET CARD ── */}
        <Reveal>
          <Spot className="glass-panel tilt-card section-card p-5 sm:p-6 space-y-4">
            <h3 className="flex items-center gap-2 text-[16px] font-extrabold tracking-tight" style={{ color: "var(--text-main, #211a3a)" }}>
              <IconUser size={18} /> Profile &amp; Exam Target
            </h3>

            <div>
              <label className="lbl" htmlFor="set-name">Your Name</label>
              <input
                id="set-name"
                className="input-field"
                value={local.name}
                onChange={(e) => set("name", e.target.value)}
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="lbl" htmlFor="set-start">Start Date</label>
                <input
                  id="set-start"
                  type="date"
                  className="input-field mono"
                  value={local.startDate}
                  onChange={(e) => set("startDate", e.target.value)}
                />
              </div>
              <div>
                <label className="lbl" htmlFor="set-exam">Target / Exam Date</label>
                <input
                  id="set-exam"
                  type="date"
                  className="input-field mono"
                  value={local.examDate}
                  onChange={(e) => set("examDate", e.target.value)}
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="lbl" htmlFor="set-hours">Daily Target (Hours)</label>
                <input
                  id="set-hours"
                  type="number"
                  min={1}
                  max={14}
                  className="input-field mono font-bold"
                  value={local.dailyHours}
                  onChange={(e) => set("dailyHours", Number(e.target.value))}
                />
              </div>
              <div>
                <label className="lbl" htmlFor="set-subjects">Subjects / Day</label>
                <select
                  id="set-subjects"
                  className="input-field font-bold"
                  value={local.subjectsPerDay}
                  onChange={(e) => set("subjectsPerDay", Number(e.target.value))}
                >
                  {[1, 2, 3, 4, 5, 6].map((n) => (
                    <option key={n} value={n}>{n}/day</option>
                  ))}
                </select>
              </div>
            </div>

            <button
              type="button"
              className="btn btn-primary w-full"
              onClick={handleSaveProfile}
              disabled={busy}
            >
              <IconCheck size={15} /> Save &amp; Rebalance Plan
            </button>
            {savedToast && (
              <p className="text-center text-[12px] font-bold text-[var(--success-accent,#2e9e6d)] animate-fade-in">
                Profile and targets saved!
              </p>
            )}
          </Spot>
        </Reveal>

        {/* ── 2. APPEARANCE & THEMES CARD ── */}
        <Reveal delay={60}>
          <Spot className="glass-panel tilt-card section-card p-5 sm:p-6 space-y-4">
            <h3 className="flex items-center gap-2 text-[16px] font-extrabold tracking-tight" style={{ color: "var(--text-main, #211a3a)" }}>
              <IconPalette size={18} /> Studio Appearance
            </h3>

            <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-2">
              {THEMES.map((th) => {
                const info = THEME_SWATCH[th.id] || { bg: "#f2f0f9", accent: "#6366f1", sub: th.label };
                const isCurrent = s.theme === th.id;
                return (
                  <button
                    key={th.id}
                    type="button"
                    onClick={() => onPatch({ theme: th.id })}
                    className={cn(
                      "rounded-2xl border p-3 text-left transition-all",
                      isCurrent
                        ? "border-[var(--accent,#6366f1)] ring-2 ring-[var(--accent,#6366f1)]/20 shadow-md"
                        : "border-[var(--border-subtle,#e4e0f1)] bg-[var(--surface-2,#f4f2fc)] opacity-75 hover:opacity-100"
                    )}
                  >
                    <div className="flex items-center gap-2 mb-2">
                      <span className="h-4 w-4 rounded-full border border-black/10" style={{ background: info.accent }} />
                      <span className="h-4 w-4 rounded-full border border-black/10" style={{ background: info.bg }} />
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-[13px] font-extrabold" style={{ color: "var(--text-main, #211a3a)" }}>
                        {th.label}
                      </span>
                      {isCurrent && <IconCheck size={14} className="text-[var(--accent,#6366f1)]" />}
                    </div>
                    <span className="block text-[11px] font-medium" style={{ color: "var(--text-dim, #5f5a7a)" }}>
                      {info.sub}
                    </span>
                  </button>
                );
              })}
            </div>
          </Spot>
        </Reveal>
      </div>

      {/* ── 3. PACE & SCHEDULE RHYTHM ── */}
      <Reveal delay={80}>
        <Spot className="glass-panel tilt-card section-card p-5 sm:p-6 space-y-4">
          <h3 className="flex items-center gap-2 text-[16px] font-extrabold tracking-tight" style={{ color: "var(--text-main, #211a3a)" }}>
            <IconTarget size={18} /> Schedule Engine &amp; Rhythm
          </h3>

          <div className="grid gap-4 sm:grid-cols-3">
            <div>
              <label className="lbl" htmlFor="set-days">Study Days Mode</label>
              <select
                id="set-days"
                className="input-field"
                value={local.studyDays}
                onChange={(e) => set("studyDays", e.target.value)}
              >
                <option value="all">All 7 days</option>
                <option value="6days">6 days (Sun off)</option>
                <option value="weekdays">Weekdays only</option>
              </select>
            </div>

            <div>
              <label className="lbl" htmlFor="set-buffer">Buffer Recovery Days</label>
              <input
                id="set-buffer"
                type="number"
                min={0}
                max={30}
                className="input-field mono font-bold"
                value={local.bufferDays}
                onChange={(e) => set("bufferDays", Number(e.target.value))}
              />
            </div>

            <div>
              <label className="lbl" htmlFor="set-mode">Plan Generation Mode</label>
              <select
                id="set-mode"
                className="input-field"
                value={local.planMode}
                onChange={(e) => set("planMode", e.target.value)}
              >
                <option value="syllabus">Syllabus</option>
                <option value="revision">Revision</option>
                <option value="mock">Mock-heavy</option>
              </select>
            </div>

            <div>
              <label className="lbl" htmlFor="set-style">Learning Style</label>
              <select
                id="set-style"
                className="input-field"
                value={local.studyStyle}
                onChange={(e) => set("studyStyle", e.target.value)}
              >
                <option value="balanced">Balanced</option>
                <option value="theory">Theory heavy</option>
                <option value="practice">Practice heavy</option>
              </select>
            </div>

            <div>
              <label className="lbl" htmlFor="set-weak">Weakest Subject Focus</label>
              <select
                id="set-weak"
                className="input-field"
                value={local.weakSubject}
                onChange={(e) => set("weakSubject", e.target.value)}
              >
                <option value="none">None</option>
                {state.subjects.map((x) => (
                  <option key={x.id} value={String(x.id)}>{x.name}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="lbl" htmlFor="set-revision">Revision Block (Weeks)</label>
              <input
                id="set-revision"
                type="number"
                min={0}
                max={8}
                className="input-field mono font-bold"
                value={local.revisionWeeks}
                onChange={(e) => set("revisionWeeks", Number(e.target.value))}
              />
            </div>
          </div>
        </Spot>
      </Reveal>

      {/* ── 4. DATA & SYSTEM CONTROLS ── */}
      <Reveal delay={100}>
        <Spot className="glass-panel tilt-card section-card p-5 sm:p-6 space-y-3">
          <h3 className="flex items-center gap-2 text-[16px] font-extrabold tracking-tight" style={{ color: "var(--text-main, #211a3a)" }}>
            <IconGear size={18} /> Data, Export &amp; Setup
          </h3>
          <p className="text-[13px] font-medium" style={{ color: "var(--text-dim, #5f5a7a)" }}>
            Your syllabus, schedule, logged study minutes, and preferences reside securely on this device.
          </p>
          <div className="flex flex-wrap gap-2.5 pt-2">
            <button
              type="button"
              className="btn btn-secondary"
              onClick={onRestart}
            >
              <IconRefresh size={14} /> Re-run Setup Wizard
            </button>
            <button
              type="button"
              className="btn btn-secondary"
              onClick={exportJsonData}
            >
              <IconDownload size={14} /> Export Plan as JSON
            </button>
            <button
              type="button"
              className="btn btn-secondary hover:text-[var(--danger-accent,#ef4444)]"
              onClick={() => setConfirmWipeModal(true)}
            >
              <IconTrash size={14} /> Reset Everything
            </button>
          </div>
        </Spot>
      </Reveal>

      {/* Reset confirmation modal */}
      {confirmWipeModal && (
        <div className="modal-overlay" onClick={() => setConfirmWipeModal(false)}>
          <div className="glass-panel modal-box max-w-md" onClick={(e) => e.stopPropagation()}>
            <div className="confirm-icon mb-3"><IconWarn size={22} /></div>
            <h3 className="text-[17px] font-extrabold" style={{ color: "var(--text-main, #211a3a)" }}>
              Reset everything and restart?
            </h3>
            <p className="mt-2 text-[13.5px] font-medium leading-relaxed" style={{ color: "var(--text-dim, #5f5a7a)" }}>
              This will clear your current subjects, generated lessons, scheduled tasks, and session history,
              and relaunch the Setup Wizard.
            </p>
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => setConfirmWipeModal(false)}
              >
                Keep my plan
              </button>
              <button
                type="button"
                className="btn btn-danger"
                onClick={() => {
                  setConfirmWipeModal(false);
                  onRestart();
                }}
              >
                Reset Everything
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
