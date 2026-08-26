"use client";

import React, { useState } from "react";
import { type AppState, type SubjectRow } from "@/lib/client";
import { IconSpark, IconTrash, IconClose } from "./icons";

export default function SubjectsView({
  state, onAdd, onEdit, onDelete, busy, onAskTutor,
}: {
  state: AppState;
  onAdd: (s: { name: string; units: number; difficulty: string; color: string }) => void;
  onEdit: (s: { id: number; name: string; units: number; difficulty: string; color: string }) => void;
  onDelete: (id: number) => void;
  busy: boolean;
  onAskTutor: (q: string) => void;
}) {
  const [name, setName] = useState("");
  const [units, setUnits] = useState(8);
  const [difficulty, setDifficulty] = useState("Medium");
  const [color, setColor] = useState("#6366f1");
  const [editing, setEditing] = useState<SubjectRow | null>(null);
  const [openTopics, setOpenTopics] = useState<number | null>(null);
  const [openLesson, setOpenLesson] = useState<number | null>(null);

  const doneTopicIds = new Set(state.topics.filter((x) => x.status === "done").map((x) => x.id));

  return (
    <div className="fade-in">
      <div className="page-header">
        <div>
          <h1 className="page-title">Subjects &amp; Lessons</h1>
          <p className="page-subtitle">
            {state.subjects.length} subjects · {state.topics.length} AI-generated lessons. Editing rebalances the schedule.
          </p>
        </div>
      </div>

      <div className="subs-wrap">
        <div className="flex-col gap-md">
          {state.subjects.map((s) => {
            const list = state.topics.filter((x) => x.subjectId === s.id);
            const done = list.filter((x) => doneTopicIds.has(x.id)).length;
            const pct = list.length ? Math.round((done / list.length) * 100) : 0;
            const open = openTopics === s.id;
            return (
              <div className="glass-panel tilt-card" key={s.id} style={{ padding: 20, borderLeft: `4px solid ${s.color}` }}>
                <div className="day-head" style={{ marginBottom: 10 }}>
                  <div>
                    <div className="day-date">{s.name}</div>
                    <div className="day-meta">{list.length} lessons · {s.difficulty} · {done} completed</div>
                  </div>
                  <div className="flex-row gap-sm">
                    <button className="btn btn-xs btn-secondary" onClick={() => setOpenTopics(open ? null : s.id)}>
                      {open ? "Hide lessons" : "View lessons"}
                    </button>
                    <button className="btn btn-xs btn-secondary" onClick={() => setEditing(s)}>Edit</button>
                  </div>
                </div>
                <div className="bar-track"><div className="bar-fill" style={{ width: `${pct}%`, background: s.color }} /></div>
                {open && (
                  <div className="slide-in" style={{ marginTop: 16 }}>
                    {list.map((tp, i) => (
                      <React.Fragment key={tp.id}>
                        <div className="task-row subject-lesson-row">
                          <div className="task-info-top">
                            <div style={{ fontSize: ".76rem", fontWeight: 800, color: "var(--text-dim)", width: 24, marginTop: 2 }}>{i + 1}</div>
                            <div className="task-info">
                              <div className="task-title">{tp.title}</div>
                              <div className="task-sub">{tp.unit} · {tp.depth || "Core"} · {tp.difficulty} · {tp.estMinutes} min · mastery {tp.mastery}%</div>
                            </div>
                          </div>
                          <div className="task-actions">
                            <button className="btn btn-xs btn-secondary"
                              onClick={() => setOpenLesson(openLesson === tp.id ? null : tp.id)}>
                              {openLesson === tp.id ? "Hide brief" : "Lesson brief"}
                            </button>
                            <button className="btn btn-xs btn-secondary"
                              onClick={() => onAskTutor(`Teach me "${tp.title}" from ${s.name}. Use these curriculum objectives: ${(tp.objectives || []).join("; ")}. Explain from first principles with a worked example and cite the listed sources.`)}>
                              <IconSpark size={12} /> Teach
                            </button>
                          </div>
                        </div>
                        {openLesson === tp.id && (
                          <div className="lesson-detail subject-lesson-detail slide-in">
                            <p className="lesson-summary">{tp.summary}</p>
                            {!!tp.prerequisites?.length && (
                              <div className="lesson-detail-block">
                                <strong>Prerequisites</strong>
                                <ul>{tp.prerequisites.map((item, j) => <li key={j}>{item}</li>)}</ul>
                              </div>
                            )}
                            {!!tp.keyConcepts?.length && (
                              <div className="lesson-detail-block">
                                <strong>Key concepts</strong>
                                <div className="lesson-concepts">{tp.keyConcepts.map((item, j) => <span className="chip chip-kind" key={j}>{item}</span>)}</div>
                              </div>
                            )}
                            {!!tp.objectives?.length && (
                              <div className="lesson-detail-block">
                                <strong>Measurable outcomes</strong>
                                <ul>{tp.objectives.map((item, j) => <li key={j}>{item}</li>)}</ul>
                              </div>
                            )}
                            {tp.practice && (
                              <div className="lesson-practice"><strong>Applied practice</strong><span>{tp.practice}</span></div>
                            )}
                            {!!tp.sources?.length && (
                              <div className="lesson-detail-block">
                                <strong>Sources</strong>
                                <div className="lesson-source-list">
                                  {tp.sources.map((source, j) => (
                                    <div className="lesson-source" key={`${source.publisher}-${j}`}>
                                      <span>{source.type}</span>
                                      <div>
                                        {source.url ? <a href={source.url} target="_blank" rel="noreferrer">{source.title}</a> : <b>{source.title}</b>}
                                        <small>{source.publisher}{source.section ? ` · ${source.section}` : ""}</small>
                                        {source.note && <small>{source.note}</small>}
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            )}
                          </div>
                        )}
                      </React.Fragment>
                    ))}
                    {!list.length && <div style={{ fontSize: ".82rem", color: "var(--text-dim)" }}>No lessons generated yet.</div>}
                  </div>
                )}
              </div>
            );
          })}
          {!state.subjects.length && (
            <div className="glass-panel" style={{ padding: 28, fontSize: ".88rem", color: "var(--text-muted)", textAlign: "center" }}>
              No subjects yet — add your first one on the right.
            </div>
          )}
        </div>

        <div className="glass-panel tilt-card" style={{ padding: 24, alignSelf: "flex-start" }}>
          <h3 style={{ fontSize: "1rem", fontWeight: 800, margin: "0 0 18px" }}>Add New Subject</h3>
          <div className="mb-md">
            <label className="lbl">Subject Name</label>
            <input className="input-field" value={name} placeholder="e.g. Organizational Behavior" onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="grid-2 mb-md">
            <div><label className="lbl">Units / Lessons</label>
              <input type="number" className="input-field" min={1} max={50} value={units} onChange={(e) => setUnits(Number(e.target.value))} /></div>
            <div><label className="lbl">Colour</label>
              <input type="color" className="input-field" style={{ height: 44, padding: 3 }} value={color} onChange={(e) => setColor(e.target.value)} /></div>
          </div>
          <div className="mb-md">
            <label className="lbl">Difficulty</label>
            <select className="input-field" value={difficulty} onChange={(e) => setDifficulty(e.target.value)}>
              <option>Easy</option><option>Medium</option><option>Hard</option>
            </select>
          </div>
          <button className="btn btn-primary w-full" disabled={!name.trim() || busy}
            onClick={() => { onAdd({ name: name.trim(), units, difficulty, color }); setName(""); }}>
            <IconSpark size={14} />{busy ? "Generating…" : "Add & Rebalance Engine"}
          </button>
          <p style={{ fontSize: ".76rem", color: "var(--text-dim)", marginTop: 12, lineHeight: 1.55 }}>
            The AI curriculum engine will break this subject into an authentic ordered lesson list and integrate it seamlessly into your schedule.
          </p>
        </div>
      </div>

      {editing && (
        <div className="modal-overlay" onClick={() => setEditing(null)}>
          <div className="glass-panel modal-box" style={{ maxWidth: 480 }} onClick={(e) => e.stopPropagation()}>
            <div className="day-head">
              <h3 style={{ fontSize: "1.2rem", fontWeight: 800, margin: 0 }}>Edit Subject</h3>
              <button className="btn btn-xs btn-secondary" onClick={() => setEditing(null)}><IconClose size={13} /></button>
            </div>
            <div className="flex-col gap-md">
              <div><label className="lbl">Subject Name</label>
                <input className="input-field" value={editing.name} onChange={(e) => setEditing({ ...editing, name: e.target.value })} /></div>
              <div className="grid-2" style={{ gap: 14 }}>
                <div><label className="lbl">Units / Lessons</label>
                  <input type="number" className="input-field" min={1} max={50} value={editing.units}
                    onChange={(e) => setEditing({ ...editing, units: Number(e.target.value) })} /></div>
                <div><label className="lbl">Colour</label>
                  <input type="color" className="input-field" style={{ height: 44, padding: 4 }} value={editing.color}
                    onChange={(e) => setEditing({ ...editing, color: e.target.value })} /></div>
              </div>
              <div><label className="lbl">Difficulty</label>
                <select className="input-field" value={editing.difficulty} onChange={(e) => setEditing({ ...editing, difficulty: e.target.value })}>
                  <option>Easy</option><option>Medium</option><option>Hard</option>
                </select></div>
              <div className="flex-row gap-md mt-md">
                <button className="btn btn-secondary" style={{ flex: 1 }} onClick={() => setEditing(null)}>Cancel</button>
                <button className="btn btn-primary" style={{ flex: 2 }} disabled={busy}
                  onClick={() => { onEdit({ id: editing.id, name: editing.name, units: editing.units, difficulty: editing.difficulty, color: editing.color }); setEditing(null); }}>
                  Save &amp; Rebalance
                </button>
              </div>
              <div style={{ borderTop: "1px solid var(--glass-border)", paddingTop: 12 }}>
                <button className="btn btn-danger w-full" disabled={busy}
                  onClick={() => { if (confirm(`Delete "${editing.name}" and all its lessons? This cannot be undone.`)) { onDelete(editing.id); setEditing(null); } }}>
                  <IconTrash /> Delete this subject
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
