"use client";

import React, { useEffect, useRef, useState } from "react";
import { addDays, today, type AppState } from "@/lib/client";
import {
  QUICK_ADD_KIND_LABELS, QUICK_ADD_KINDS, quickAddPayload,
  validateQuickAdd, type QuickAddErrors, type QuickAddKind, type QuickAddPayload,
} from "@/lib/quickAdd";
import { IconClose, IconPlus } from "./icons";

const MINUTE_CHOICES = [15, 25, 30, 45, 60];

/**
 * Quick Add — capture a task in one breath: title, duration, optional
 * subject, today/tomorrow, type. Deliberately NOT the full editor.
 * Submits through the parent's `onAdd` (which owns the API call), then
 * collapses itself again.
 */
export default function QuickAdd({
  state,
  onAdd,
}: {
  state: AppState;
  onAdd: (payload: QuickAddPayload) => void;
}) {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [minutes, setMinutes] = useState(30);
  const [date, setDate] = useState(today());
  const [subjectId, setSubjectId] = useState("");
  const [kind, setKind] = useState<QuickAddKind>("practice");
  const [errors, setErrors] = useState<QuickAddErrors>({});
  const [submitting, setSubmitting] = useState(false);
  const titleRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape") setOpen(false); };
    window.addEventListener("keydown", onKey);
    const timer = window.setTimeout(() => titleRef.current?.focus(), 60);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.clearTimeout(timer);
    };
  }, [open]);

  const reset = () => {
    setTitle("");
    setMinutes(30);
    setSubjectId("");
    setKind("practice");
  };

  // Fresh defaults each time the tray opens (event handler, not an effect).
  const openTray = () => {
    reset();
    setDate(today());
    setErrors({});
    setOpen(true);
  };

  const submit = () => {
    if (submitting) return;
    const result = validateQuickAdd({
      title,
      minutes,
      date,
      subjectId: subjectId ? Number(subjectId) : null,
      kind,
    });
    setErrors(result.errors);
    if (!result.valid) return;
    setSubmitting(true);
    onAdd(quickAddPayload({ title, minutes, date, subjectId: subjectId ? Number(subjectId) : null, kind }));
    reset();
    setOpen(false);
    setSubmitting(false);
  };

  return (
    <div className="quick-add">
      {!open ? (
        <button type="button" className="btn btn-secondary btn-sm quick-add-toggle" onClick={openTray}>
          <IconPlus size={13} /> Add task
        </button>
      ) : (
        <div className="glass-panel quick-add-panel" role="form" aria-label="Quick add task">
          <div className="quick-add-head">
            <span className="quick-add-title">Add a task</span>
            <button type="button" className="btn btn-xs btn-secondary" aria-label="Close quick add" onClick={() => setOpen(false)}>
              <IconClose size={13} />
            </button>
          </div>
          <div className="quick-add-grid">
            <label className="qa-field qa-field-title">
              <span className="lbl">What do you need to study?</span>
              <input
                ref={titleRef}
                className="input-field"
                value={title}
                maxLength={300}
                placeholder="e.g. Physics — Current Electricity"
                onChange={(event) => setTitle(event.target.value)}
                onKeyDown={(event) => { if (event.key === "Enter") submit(); }}
              />
              {errors.title && <span className="qa-error">{errors.title}</span>}
            </label>
            <label className="qa-field">
              <span className="lbl">How long?</span>
              <div className="qa-minutes">
                {MINUTE_CHOICES.map((choice) => (
                  <button
                    key={choice}
                    type="button"
                    className={`qa-min-chip${minutes === choice ? " active" : ""}`}
                    aria-pressed={minutes === choice}
                    onClick={() => setMinutes(choice)}
                  >
                    {choice}m
                  </button>
                ))}
                <input
                  className="input-field qa-min-input"
                  type="number"
                  min={1}
                  max={720}
                  step={5}
                  value={Number.isFinite(minutes) ? minutes : ""}
                  aria-label="Minutes"
                  onChange={(event) => setMinutes(Number(event.target.value))}
                />
              </div>
              {errors.minutes && <span className="qa-error">{errors.minutes}</span>}
            </label>
            <label className="qa-field">
              <span className="lbl">Subject <span className="lbl-opt">(optional)</span></span>
              <select className="input-field" value={subjectId} onChange={(event) => setSubjectId(event.target.value)}>
                <option value="">No subject</option>
                {state.subjects.map((subject) => (
                  <option key={subject.id} value={subject.id}>{subject.name}</option>
                ))}
              </select>
            </label>
            <label className="qa-field">
              <span className="lbl">When</span>
              <div className="qa-date-seg" role="group" aria-label="Date">
                {[{ value: today(), label: "Today" }, { value: addDays(today(), 1), label: "Tomorrow" }].map((choice) => (
                  <button
                    key={choice.value}
                    type="button"
                    className={`qa-date-btn${date === choice.value ? " active" : ""}`}
                    aria-pressed={date === choice.value}
                    onClick={() => setDate(choice.value)}
                  >
                    {choice.label}
                  </button>
                ))}
              </div>
            </label>
            <label className="qa-field">
              <span className="lbl">Type</span>
              <select className="input-field" value={kind} onChange={(event) => setKind(event.target.value as QuickAddKind)}>
                {QUICK_ADD_KINDS.map((option) => (
                  <option key={option} value={option}>{QUICK_ADD_KIND_LABELS[option]}</option>
                ))}
              </select>
            </label>
          </div>
          <div className="quick-add-actions">
            <button type="button" className="btn btn-secondary" onClick={() => setOpen(false)}>Cancel</button>
            <button type="button" className="btn btn-primary" disabled={!title.trim() || submitting} onClick={submit}>
              {submitting ? "Adding…" : "Add task"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
