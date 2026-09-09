"use client";

import React, { useState } from "react";
import { type AppState, type SubjectRow } from "@/lib/client";
import {
  IconBook, IconCheck, IconClose, IconEdit, IconPlus, IconSpark, IconTrash,
  IconClock, IconTarget, IconChevron,
} from "./icons";
import { PageHead } from "./bits";
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
                        <h3 className="truncate text-[17px] font-extrabold tracking-tight" style={{ color: "var(--text-main, #211a3a)" }}>
                          {s.name}
                        </h3>
                        <p className="mono mt-1 text-[12px] font-semibold" style={{ color: "var(--text-dim, #5f5a7a)" }}>
                          {list.length || s.units} lessons · {s.difficulty}
                        </p>
                      </div>
                      <span className="mono text-[26px] font-extrabold tracking-tight" style={{ color: s.color }}>
                        <CountUp to={pct} suffix="%" />
                      </span>
                    </div>

                    <div className="mt-4 h-2 w-full overflow-hidden rounded-full bg-[var(--surface-2,#f4f2fc)]">
                      <div
                        className="h-full rounded-full transition-all duration-1000"
                        style={{ width: `${pct}%`, background: s.color }}
                      />
                    </div>

                    <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2 text-[12px] font-semibold" style={{ color: "var(--text-dim, #5f5a7a)" }}>
                      <span className="flex items-center gap-1.5">
                        <IconCheck size={14} className="text-[var(--success-accent,#2e9e6d)]" />
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

                  <div className="mt-5 flex items-center justify-between border-t border-[var(--border-subtle,#e4e0f1)] pt-3">
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
                        className="btn btn-xs btn-ghost btn-icon hover:text-[var(--danger-accent,#ef4444)]"
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

                {/* ── EXPANDABLE LESSONS LIST ── */}
                {open && (
                  <div className="border-t border-[var(--border-subtle,#e4e0f1)] bg-[var(--surface-2,#f4f2fc)] p-4 sm:p-5 slide-in">
                    <div className="space-y-3">
                      {list.length === 0 && (
                        <p className="text-[13px] font-medium text-center py-4" style={{ color: "var(--text-dim, #5f5a7a)" }}>
                          No lessons generated yet.
                        </p>
                      )}
                      {list.map((tp, li) => {
                        const isDone = doneTopicIds.has(tp.id);
                        const isBriefOpen = openLesson === tp.id;
                        return (
                          <div
                            key={tp.id}
                            className="rounded-xl border border-[var(--border-subtle,#e4e0f1)] bg-[var(--surface-card,#fcfbff)] p-3.5 transition-all"
                          >
                            <div className="flex flex-wrap items-center justify-between gap-2.5">
                              <div className="flex items-center gap-2.5 min-w-0 flex-1">
                                <span className="mono grid h-6 w-6 shrink-0 place-items-center rounded-md bg-[var(--surface-2,#f4f2fc)] text-[11px] font-bold" style={{ color: s.color }}>
                                  {li + 1}
                                </span>
                                <div className="min-w-0 flex-1">
                                  <p className={cn("truncate text-[13.5px] font-bold", isDone && "line-through opacity-50")} style={{ color: "var(--text-main, #211a3a)" }}>
                                    {tp.title}
                                  </p>
                                  <p className="mono text-[11px] font-semibold" style={{ color: "var(--text-dim, #5f5a7a)" }}>
                                    {tp.unit} · {tp.estMinutes} min · {tp.difficulty} · mastery {tp.mastery}%
                                  </p>
                                </div>
                              </div>
                              <div className="flex items-center gap-2">
                                <button
                                  type="button"
                                  className="btn btn-xs btn-ghost"
                                  onClick={() => setOpenLesson(isBriefOpen ? null : tp.id)}
                                >
                                  {isBriefOpen ? "Hide brief" : "Lesson brief"}
                                </button>
                                <button
                                  type="button"
                                  className="btn btn-xs btn-primary"
                                  onClick={() => onAskTutor(`Teach me "${tp.title}" from ${s.name}. Use objectives: ${(tp.objectives || []).join("; ")}. Explain with a clear worked example.`)}
                                >
                                  <IconSpark size={12} /> Teach
                                </button>
                              </div>
                            </div>

                            {isBriefOpen && (
                              <div className="mt-3 border-t border-[var(--border-subtle,#e4e0f1)] pt-3 text-[12.5px] space-y-2.5 slide-in">
                                <p className="font-medium" style={{ color: "var(--text-main, #211a3a)" }}>{tp.summary}</p>
                                {tp.prerequisites?.length > 0 && (
                                  <div>
                                    <strong className="block text-[11.5px] uppercase tracking-wider text-[var(--text-dim,#5f5a7a)] mb-1">Prerequisites</strong>
                                    <ul className="list-disc pl-4 space-y-0.5">
                                      {tp.prerequisites.map((item, j) => <li key={j}>{item}</li>)}
                                    </ul>
                                  </div>
                                )}
                                {tp.keyConcepts?.length > 0 && (
                                  <div>
                                    <strong className="block text-[11.5px] uppercase tracking-wider text-[var(--text-dim,#5f5a7a)] mb-1">Key Concepts</strong>
                                    <div className="flex flex-wrap gap-1.5">
                                      {tp.keyConcepts.map((item, j) => <span key={j} className="chip chip-kind chip-tight">{item}</span>)}
                                    </div>
                                  </div>
                                )}
                                {tp.practice && (
                                  <div>
                                    <strong className="block text-[11.5px] uppercase tracking-wider text-[var(--text-dim,#5f5a7a)] mb-0.5">Applied Practice</strong>
                                    <p style={{ color: "var(--text-main, #211a3a)" }}>{tp.practice}</p>
                                  </div>
                                )}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
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
            <div className="flex items-center justify-between border-b border-[var(--border-subtle,#e4e0f1)] pb-3 mb-4">
              <h3 className="text-[17px] font-extrabold" style={{ color: "var(--text-main, #211a3a)" }}>
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
                        color === c && "scale-110 ring-2 ring-offset-2 ring-[var(--accent,#6366f1)]"
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
                  <select
                    id="sub-diff"
                    className="input-field"
                    value={difficulty}
                    onChange={(e) => setDifficulty(e.target.value)}
                  >
                    <option>Easy</option>
                    <option>Medium</option>
                    <option>Hard</option>
                  </select>
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
            <div className="flex items-center justify-between border-b border-[var(--border-subtle,#e4e0f1)] pb-3 mb-4">
              <h3 className="text-[17px] font-extrabold" style={{ color: "var(--text-main, #211a3a)" }}>
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
                        editing.color === c && "scale-110 ring-2 ring-offset-2 ring-[var(--accent,#6366f1)]"
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
                  <select
                    id="edit-sub-diff"
                    className="input-field"
                    value={editing.difficulty}
                    onChange={(e) => setEditing({ ...editing, difficulty: e.target.value })}
                  >
                    <option>Easy</option>
                    <option>Medium</option>
                    <option>Hard</option>
                  </select>
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
