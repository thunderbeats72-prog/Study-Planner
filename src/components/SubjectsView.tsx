"use client";

import React, { useState } from "react";
import { type AppState, type SubjectRow } from "@/lib/client";
import {
  IconBook, IconCheck, IconClose, IconEdit, IconPlus, IconSpark, IconTrash,
  IconClock, IconTarget, IconChevron,
} from "./icons";
import { PageHead, Select } from "./bits";
import { CountUp, Reveal, Spot } from "@/lib/fx";
import { cn } from "@/lib/cn";

const PALETTE = [
  "#6366f1", "#10b981", "#f59e0b", "#ef4444",
  "#06b6d4", "#ec4899", "#84cc16", "#8b5cf6",
  "#3b82f6", "#14b8a6", "#f97316", "#a855f7",
];

export default function SubjectsView({
  state,
  onAdd,
  onEdit,
  onDelete,
  busy,
  onAskTutor,
  onNavigate,
}: {
  state: AppState;
  onAdd: (s: { name: string; units: number; difficulty: string; color: string }) => void;
  onEdit: (s: { id: number; name: string; units: number; difficulty: string; color: string }) => void;
  onDelete: (id: number) => void;
  busy: boolean;
  onAskTutor: (q: string) => void;
  onNavigate?: (page: string) => void;
}) {
  const [addModalOpen, setAddModalOpen] = useState(false);
  const [name, setName] = useState("");
  const [units, setUnits] = useState(8);
  const [difficulty, setDifficulty] = useState("Medium");
  const [color, setColor] = useState(PALETTE[0]);
  const [editing, setEditing] = useState<SubjectRow | null>(null);
  const [openTopics, setOpenTopics] = useState<number | null>(null);
  const [openLesson, setOpenLesson] = useState<number | null>(null);

  const doneTopicIds = new Set(
    state.topics.filter((x) => x.status === "done").map((x) => x.id)
  );

  const handleAddSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    onAdd({ name: name.trim(), units, difficulty, color });
    setName("");
    setUnits(8);
    setDifficulty("Medium");
    setColor(PALETTE[0]);
    setAddModalOpen(false);
  };

  const handleEditSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editing || !editing.name.trim()) return;
    onEdit(editing);
    setEditing(null);
  };

  return (
    <div className="space-y-6 fade-in">
      <PageHead
        eyebrow="SUBJECT MASTERY"
        title="Subjects &amp; Curriculum"
        sub={`${state.subjects.length} subjects · ${state.topics.length} sequenced AI lessons · progress tracks automatically as you complete lessons`}
        actions={
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => setAddModalOpen(true)}
          >
            <IconPlus size={15} /> Add Subject
          </button>
        }
      />

      {/* ── SUBJECT CARDS GRID ── */}
      <div className="grid gap-4 md:grid-cols-2">
        {state.subjects.map((s, i) => {
          const list = state.topics.filter((x) => x.subjectId === s.id);
          const done = list.filter((x) => doneTopicIds.has(x.id)).length;
          const pct = list.length ? Math.round((done / list.length) * 100) : 0;
          const pendingTasks = state.tasks.filter((tk) => tk.subjectId === s.id && tk.status === "pending");
          const pendingMins = pendingTasks.reduce((a, b) => a + b.plannedMinutes, 0);
          const loggedMins = state.sessions.filter((sn) => sn.subjectId === s.id).reduce((a, b) => a + b.minutes, 0);
          const open = openTopics === s.id;

          return (
            <Reveal key={s.id} delay={i * 60}>
              <Spot className="glass-panel tilt-card section-card flex h-full flex-col overflow-hidden">
                <span className="block h-1.5 w-full shrink-0" style={{ background: s.color }} />
                <div className="p-5 flex-1 flex flex-col justify-between">
                  <div>
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <h3 className="truncate text-[17px] font-extrabold tracking-tight" style={{ color: "var(--text-main)" }}>
                          {s.name}
                        </h3>
                        <p className="mono mt-1 text-[12px] font-semibold" style={{ color: "var(--text-dim)" }}>
                          {list.length || s.units} lessons · {s.difficulty}
                        </p>
                      </div>
                      <span className="mono text-[26px] font-extrabold tracking-tight" style={{ color: s.color }}>
                        <CountUp to={pct} suffix="%" />
                      </span>
                    </div>

                    <div className="mt-4 h-2 w-full overflow-hidden rounded-full bg-[var(--surface-2)]">
                      <div
                        className="h-full rounded-full transition-all duration-1000"
                        style={{ width: `${pct}%`, background: s.color }}
                      />
                    </div>

                    <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2 text-[12px] font-semibold" style={{ color: "var(--text-dim)" }}>
                      <span className="flex items-center gap-1.5">
                        <IconCheck size={14} className="text-[var(--success-accent)]" />
                        {done}/{list.length || s.units} completed
                      </span>
                      <span className="flex items-center gap-1.5">
                        <IconTarget size={14} />
                        {pendingTasks.length} pending tasks
                      </span>
                      <span className="mono flex items-center gap-1.5">
                        <IconClock size={14} />
                        {pendingMins}m left
                      </span>
                    </div>
                  </div>

                  <div className="mt-5 flex items-center justify-between border-t border-[var(--border-subtle)] pt-3">
                    <button
                      type="button"
                      className="btn btn-xs btn-secondary"
                      onClick={() => setOpenTopics(open ? null : s.id)}
                    >
                      {open ? "Hide lessons" : `View ${list.length} lessons`}
                    </button>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        className="btn btn-xs btn-ghost btn-icon"
                        title="Edit subject"
                        onClick={() => setEditing(s)}
                      >
                        <IconEdit size={13} />
                      </button>
                      <button
                        type="button"
                        className="btn btn-xs btn-ghost btn-icon hover:text-[var(--danger-accent)]"
                        title="Delete subject"
                        onClick={() => {
                          if (confirm(`Remove "${s.name}" and all its lessons?`)) {
                            onDelete(s.id);
                          }
                        }}
                      >
                        <IconTrash size={13} />
                      </button>
                    </div>
                  </div>
                </div>

                {/* ── EXPANDABLE LESSONS LIST ──
                    One quiet row per topic: number · title · minutes · state.
                    Everything else (unit, difficulty, mastery, concepts,
                    practice, the tutor) lives INSIDE the brief, one tap away —
                    the row itself stays scannable when a subject has 30
                    lessons. */}
                {open && (
                  <div className="topics-list slide-in">
                    {list.length === 0 && (
                      <p className="topics-empty" style={{ color: "var(--text-dim)" }}>
                        No lessons generated yet.
                      </p>
                    )}
                    {list.map((tp, li) => {
                      const isDone = doneTopicIds.has(tp.id);
                      const isBriefOpen = openLesson === tp.id;
                      return (
                        <div
                          key={tp.id}
                          className={cn(
                            "topic-row",
                            isBriefOpen && "is-open",
                            isDone && "is-done",
                          )}
                        >
                          <button
                            type="button"
                            className="topic-row-head"
                            aria-expanded={isBriefOpen}
                            aria-controls={`topic-brief-${tp.id}`}
                            onClick={() =>
                              setOpenLesson(isBriefOpen ? null : tp.id)
                            }
                            title={
                              isBriefOpen
                                ? "Hide the lesson brief"
                                : "Read the lesson brief"
                            }
                          >
                            <span
                              className="topic-row-num mono"
                              style={{ color: s.color }}
                            >
                              {li + 1}
                            </span>
                            <span className="topic-row-title">{tp.title}</span>
                            <span className="topic-row-side">
                              {isDone ? (
                                <span className="topic-row-done">
                                  <IconCheck size={12} /> Done
                                </span>
                              ) : (
                                <span className="topic-row-mins mono">
                                  {tp.estMinutes}m
                                </span>
                              )}
                              <IconChevron
                                size={14}
                                className={cn(
                                  "topic-row-caret",
                                  isBriefOpen && "is-open",
                                )}
                              />
                            </span>
                          </button>

                          {isBriefOpen && (
                            <div
                              id={`topic-brief-${tp.id}`}
                              className="topic-brief"
                            >
                              <p className="topic-brief-meta mono">
                                {tp.unit} · {tp.difficulty} · mastery{" "}
                                {tp.mastery}%
                              </p>
                              <p className="topic-brief-text">{tp.summary}</p>
                              {(tp.keyConcepts ?? []).length > 0 && (
                                <div className="topic-brief-block">
                                  <strong>Key concepts</strong>
                                  <div className="topic-brief-concepts">
                                    {tp.keyConcepts.map((item, j) => (
                                      <span
                                        key={j}
                                        className="chip chip-kind chip-tight"
                                      >
                                        {item}
                                      </span>
                                    ))}
                                  </div>
                                </div>
                              )}
                              {(tp.prerequisites ?? []).length > 0 && (
                                <div className="topic-brief-block">
                                  <strong>Prerequisites</strong>
                                  <ul>
                                    {tp.prerequisites.map((item, j) => (
                                      <li key={j}>{item}</li>
                                    ))}
                                  </ul>
                                </div>
                              )}
                              {tp.practice && (
                                <div className="topic-brief-practice">
                                  <span className="topic-brief-practice-label">
                                    Try this
                                  </span>
                                  <span>{tp.practice}</span>
                                </div>
                              )}
                              <div className="topic-brief-foot">
                                <span className="topic-brief-foot-note">
                                  Want it explained step by step?
                                </span>
                                <button
                                  type="button"
                                  className="btn btn-xs btn-primary"
                                  onClick={() =>
                                    onAskTutor(
                                      `Teach me "${tp.title}" from ${s.name}. Use objectives: ${(tp.objectives || []).join("; ")}. Explain with a clear worked example.`,
                                    )
                                  }
                                >
                                  <IconSpark size={12} /> Teach me
                                </button>
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </Spot>
            </Reveal>
          );
        })}
      </div>

      {/* ── ADD SUBJECT MODAL ── */}
      {addModalOpen && (
        <div className="modal-overlay" onClick={() => setAddModalOpen(false)}>
          <div className="glass-panel modal-box max-w-md" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between border-b border-[var(--border-subtle)] pb-3 mb-4">
              <h3 className="text-[17px] font-extrabold" style={{ color: "var(--text-main)" }}>
                Add New Subject
              </h3>
              <button
                type="button"
                className="btn btn-ghost btn-icon"
                onClick={() => setAddModalOpen(false)}
                aria-label="Close"
              >
                <IconClose size={16} />
              </button>
            </div>

            <form onSubmit={handleAddSubmit} className="space-y-4">
              <div>
                <label className="lbl" htmlFor="sub-name">Subject Name</label>
                <input
                  id="sub-name"
                  className="input-field"
                  placeholder="e.g. Public Finance"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  autoFocus
                />
              </div>

              <div>
                <label className="lbl">Subject Color</label>
                <div className="flex flex-wrap gap-2 pt-1">
                  {PALETTE.map((c) => (
                    <button
                      key={c}
                      type="button"
                      aria-label={`Color ${c}`}
                      onClick={() => setColor(c)}
                      className={cn(
                        "h-8 w-8 rounded-xl transition-transform",
                        color === c && "scale-110 ring-2 ring-offset-2 ring-[var(--accent)]"
                      )}
                      style={{ background: c }}
                    />
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="lbl" htmlFor="sub-units">Number of Units</label>
                  <input
                    id="sub-units"
                    type="number"
                    min={1}
                    max={30}
                    className="input-field mono font-bold"
                    value={units}
                    onChange={(e) => setUnits(Number(e.target.value) || 1)}
                  />
                </div>
                <div>
                  <label className="lbl" htmlFor="sub-diff">Difficulty</label>
                  <Select
                    id="sub-diff"
                    ariaLabel="Difficulty"
                    value={difficulty}
                    onChange={setDifficulty}
                    options={["Easy", "Medium", "Hard"].map((d) => ({ value: d, label: d }))}
                  />
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => setAddModalOpen(false)}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn btn-primary"
                  disabled={!name.trim() || busy}
                >
                  <IconPlus size={15} /> Add Subject
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── EDIT SUBJECT MODAL ── */}
      {editing && (
        <div className="modal-overlay" onClick={() => setEditing(null)}>
          <div className="glass-panel modal-box max-w-md" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between border-b border-[var(--border-subtle)] pb-3 mb-4">
              <h3 className="text-[17px] font-extrabold" style={{ color: "var(--text-main)" }}>
                Edit Subject
              </h3>
              <button
                type="button"
                className="btn btn-ghost btn-icon"
                onClick={() => setEditing(null)}
                aria-label="Close"
              >
                <IconClose size={16} />
              </button>
            </div>

            <form onSubmit={handleEditSubmit} className="space-y-4">
              <div>
                <label className="lbl" htmlFor="edit-sub-name">Subject Name</label>
                <input
                  id="edit-sub-name"
                  className="input-field"
                  value={editing.name}
                  onChange={(e) => setEditing({ ...editing, name: e.target.value })}
                />
              </div>

              <div>
                <label className="lbl">Subject Color</label>
                <div className="flex flex-wrap gap-2 pt-1">
                  {PALETTE.map((c) => (
                    <button
                      key={c}
                      type="button"
                      aria-label={`Color ${c}`}
                      onClick={() => setEditing({ ...editing, color: c })}
                      className={cn(
                        "h-8 w-8 rounded-xl transition-transform",
                        editing.color === c && "scale-110 ring-2 ring-offset-2 ring-[var(--accent)]"
                      )}
                      style={{ background: c }}
                    />
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="lbl" htmlFor="edit-sub-units">Units / Lessons</label>
                  <input
                    id="edit-sub-units"
                    type="number"
                    min={1}
                    max={30}
                    className="input-field mono font-bold"
                    value={editing.units}
                    onChange={(e) => setEditing({ ...editing, units: Number(e.target.value) || 1 })}
                  />
                </div>
                <div>
                  <label className="lbl" htmlFor="edit-sub-diff">Difficulty</label>
                  <Select
                    id="edit-sub-diff"
                    ariaLabel="Difficulty"
                    value={editing.difficulty}
                    onChange={(v) => setEditing({ ...editing, difficulty: v })}
                    options={["Easy", "Medium", "Hard"].map((d) => ({ value: d, label: d }))}
                  />
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => setEditing(null)}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn btn-primary"
                  disabled={!editing.name.trim() || busy}
                >
                  <IconCheck size={15} /> Save Changes
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
