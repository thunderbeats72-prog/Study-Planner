"use client";

import React, { useEffect, useState } from "react";
import { today, type AppState, type TaskRow } from "@/lib/client";
import { IconClose } from "./icons";
import { useBackClose } from "@/lib/useBackClose";

export type TaskPatch = {
  title?: string;
  detail?: string;
  plannedMinutes?: number;
  date?: string;
  subjectId?: number | null;
  status?: string;
};

export default function TaskEditor({
  state,
  task,
  onClose,
  onSave,
  onSkipSubject,
}: {
  state: AppState;
  task: TaskRow | null;
  onClose: () => void;
  onSave: (id: number, patch: TaskPatch) => void;
  onSkipSubject?: (subjectId: number, date: string) => void;
}) {
  const [title, setTitle] = useState("");
  const [detail, setDetail] = useState("");
  const [minutes, setMinutes] = useState(30);
  const [date, setDate] = useState(today());
  const [subjectId, setSubjectId] = useState<string>("");
  const [status, setStatus] = useState("pending");

  useEffect(() => {
    if (!task) return;
    setTitle(task.title);
    setDetail(task.detail || "");
    setMinutes(task.plannedMinutes);
    setDate(task.date);
    setSubjectId(task.subjectId ? String(task.subjectId) : "");
    setStatus(task.status);
  }, [task]);

  useBackClose(!!task, onClose);

  if (!task) return null;

  const subject = state.subjects.find((s) => s.id === task.subjectId);

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="glass-panel modal-box" style={{ maxWidth: 620 }} onClick={(e) => e.stopPropagation()}>
        <div className="day-head">
          <div>
            <h3 style={{ fontSize: "1.2rem", fontWeight: 800, margin: 0 }}>Edit today&apos;s study task</h3>
            <div className="day-meta">Change the lesson/topic, time, date or skip this subject for the day.</div>
          </div>
          <button className="btn btn-xs btn-secondary" onClick={onClose}><IconClose size={13} /></button>
        </div>

        <div className="flex-col gap-md">
          <div>
            <label className="lbl">Topic / task title</label>
            <input className="input-field" value={title} onChange={(e) => setTitle(e.target.value)} />
          </div>
          <div>
            <label className="lbl">Study instruction</label>
            <textarea className="input-field" rows={4} value={detail} onChange={(e) => setDetail(e.target.value)} />
          </div>
          <div className="grid-2 task-edit-grid">
            <div>
              <label className="lbl">Planned minutes</label>
              <input className="input-field" type="number" min={5} max={480} value={minutes}
                onChange={(e) => setMinutes(Number(e.target.value))} />
            </div>
            <div>
              <label className="lbl">Date</label>
              <input className="input-field" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            </div>
            <div>
              <label className="lbl">Subject</label>
              <select className="input-field" value={subjectId} onChange={(e) => setSubjectId(e.target.value)}>
                <option value="">No subject / general</option>
                {state.subjects.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </div>
            <div>
              <label className="lbl">Status</label>
              <select className="input-field" value={status} onChange={(e) => setStatus(e.target.value)}>
                <option value="pending">Pending</option>
                <option value="done">Done</option>
                <option value="skipped">Skipped</option>
              </select>
            </div>
          </div>

          <div style={{ background: "var(--row-bg)", border: "1px solid var(--glass-border)", padding: 12, borderRadius: 12 }}>
            <div style={{ fontSize: ".78rem", color: "var(--text-muted)", lineHeight: 1.5, fontWeight: 600 }}>
              Editing changes this task only. If you want the whole future plan rebuilt after many edits, use <strong>Re-plan</strong> afterwards.
            </div>
          </div>

          <div className="flex-row gap-md" style={{ justifyContent: "space-between", flexWrap: "wrap" }}>
            <div className="flex-row gap-sm" style={{ flexWrap: "wrap" }}>
              <button className="btn btn-danger" onClick={() => { onSave(task.id, { status: "skipped" }); onClose(); }}>
                Skip this topic
              </button>
              {subject && onSkipSubject && (
                <button className="btn btn-secondary" onClick={() => {
                  onSkipSubject(subject.id, task.date);
                  onClose();
                }}>
                  Skip all {subject.name} today
                </button>
              )}
            </div>
            <div className="flex-row gap-sm">
              <button className="btn btn-secondary" onClick={onClose}>Cancel</button>
              <button className="btn btn-primary" disabled={!title.trim()} onClick={() => {
                onSave(task.id, {
                  title: title.trim(),
                  detail: detail.trim(),
                  plannedMinutes: Math.max(1, Number(minutes) || task.plannedMinutes),
                  date,
                  subjectId: subjectId ? Number(subjectId) : null,
                  status,
                });
                onClose();
              }}>
                Save task
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
