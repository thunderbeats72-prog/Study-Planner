"use client";

import React, { useEffect, useMemo, useState } from "react";
import { api, addDays, today, dayDiff, prettyLong, type AppState } from "@/lib/client";
import { IconCheck } from "./icons";

type Level = { id: string; label: string; sub: string };
type SeedSubject = { name: string; units: number; difficulty: string; color: string };
type CurriculumSource = {
  title: string; publisher: string; type: string; url?: string; note?: string;
};
type CourseMeta = { id: string; name: string; level: string; subjects: SeedSubject[] };

const PALETTE = ["#6366f1", "#10b981", "#f59e0b", "#ef4444", "#06b6d4", "#ec4899", "#84cc16", "#8b5cf6"];

export default function Onboarding({
  onDone, isRerun = false, initialName = "", onCancel,
}: {
  onDone: (s: AppState) => void;
  isRerun?: boolean;
  initialName?: string;
  onCancel?: () => void;
}) {
  const [step, setStep] = useState(1);
  const total = 8;
  const [levels, setLevels] = useState<Level[]>([]);
  const [levelCourses, setLevelCourses] = useState<Record<string, string[]>>({});
  const [courses, setCourses] = useState<CourseMeta[]>([]);
  const [provider, setProvider] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  const [name, setName] = useState(initialName);
  const [level, setLevel] = useState("");
  const [course, setCourse] = useState("");
  const [year, setYear] = useState("1");
  const [subs, setSubs] = useState<SeedSubject[]>([]);
  const [newSub, setNewSub] = useState("");
  const [customName, setCustomName] = useState("");
  const [goalText, setGoalText] = useState("");
  const [suggesting, setSuggesting] = useState(false);
  const [suggestSource, setSuggestSource] = useState("");
  const [suggestSources, setSuggestSources] = useState<CurriculumSource[]>([]);
  // adaptive course-detail fields
  const [institution, setInstitution] = useState("");
  const [specialisation, setSpecialisation] = useState("");
  const [board, setBoard] = useState("CBSE");
  const [attempt, setAttempt] = useState("first");
  const [priorPrep, setPriorPrep] = useState("fresh");
  const [weak, setWeak] = useState("-1");
  const [style, setStyle] = useState("balanced");
  const [revision, setRevision] = useState("1");
  const [start, setStart] = useState(today());
  const [exam, setExam] = useState(addDays(today(), 90));
  const [hrs, setHrs] = useState(2);
  const [spd, setSpd] = useState(2);
  const [sdays, setSdays] = useState("all");
  const [buffer, setBuffer] = useState(5);
  const [planMode, setPlanMode] = useState("syllabus");

  useEffect(() => {
    api<{ levels: Level[]; levelCourses: Record<string, string[]>; courses: CourseMeta[]; aiProvider: string | null }>(
      "/api/courses"
    ).then((d) => {
      setLevels(d.levels); setLevelCourses(d.levelCourses); setCourses(d.courses); setProvider(d.aiProvider);
    }).catch(() => {});
  }, []);

  const courseById = useMemo(() => new Map(courses.map((c) => [c.id, c])), [courses]);
  const visibleCourses = useMemo(() => {
    const ids = levelCourses[level] || [];
    let list = ids.map((i) => courseById.get(i)).filter(Boolean) as CourseMeta[];
    if (search.trim()) {
      const q = search.toLowerCase();
      list = courses.filter((c) => c.name.toLowerCase().includes(q));
    }
    return list;
  }, [level, levelCourses, courseById, search, courses]);

  const pickCourse = (id: string) => {
    setCourse(id);
    setSuggestSource("");
    const c = courseById.get(id);
    setSubs(c ? c.subjects.map((s) => ({ ...s })) : []);
  };

  const resolvedCourseName =
    course === "custom" ? customName.trim() || "Custom Course" : courseById.get(course)?.name || "";

  const isCompetitive = level === "competitive" || level === "professional";
  const isDegree = level === "ug" || level === "pg";
  const isSchool = level === "school" || level === "nursery";

  /** Assemble every relevant detail so the engine can assess accurately. */
  const buildAssessmentText = (title: string, goal: string) => {
    const parts = [title.trim()];
    if (specialisation.trim()) parts.push(`specialisation: ${specialisation.trim()}`);
    if (institution.trim()) parts.push(`institution: ${institution.trim()}`);
    if (isSchool && board) parts.push(`board: ${board}`);
    const alreadyHasTerm = /\b(sem|semester|year)\b/i.test(`${title} ${goal} ${specialisation}`);
    if (!alreadyHasTerm && isDegree && Number(year) >= 1) parts.push(`year ${year}`);
    if (goal.trim()) parts.push(`goal: ${goal.trim()}`);
    return parts.join(" — ");
  };

  /** Ask the engine to build a relevant subject list for any typed course. */
  const suggestFor = async (typed: string, goal = goalText) => {
    const titleText = typed.trim();
    if (!titleText) return;
    const assessmentText = buildAssessmentText(titleText, goal);
    setCourse("custom");
    setCustomName(titleText);
    setSuggesting(true);
    setErr("");
    try {
      const r = await api<{ subjects: SeedSubject[]; source: string; sources: CurriculumSource[] }>("/api/course-suggest", {
        method: "POST",
        body: JSON.stringify({ courseName: assessmentText, level }),
      });
      setSubs(r.subjects.map((x) => ({ ...x })));
      setSuggestSource(r.source);
      setSuggestSources(r.sources || []);
      setStep(4);
    } catch {
      setErr("Could not build the subject list. Add your subjects manually below.");
      setStep(4);
    } finally {
      setSuggesting(false);
    }
  };

  const totalUnits = subs.reduce((a, s) => a + (Number(s.units) || 0), 0);
  const availDays = Math.max(1, dayDiff(start, exam));
  // Capacity reflects the actual difficulty-weighted lesson engine instead of
  // pretending every unit costs the same 50 minutes.
  const estMinutes = subs.reduce((total, subject) => {
    const perUnit = subject.difficulty === "Hard" ? 65 : subject.difficulty === "Easy" ? 40 : 50;
    return total + (Number(subject.units) || 0) * perUnit;
  }, 0);
  const capacity = availDays * hrs * 60 * 0.78;
  const feasible = capacity >= estMinutes;
  const projected = addDays(start, Math.min(availDays, Math.ceil(estMinutes / Math.max(1, hrs * 60 * 0.78))));

  const next = async () => {
    setErr("");
    if (step === 1 && !name.trim()) return setErr("Please enter your name to continue.");
    if (step === 2 && !level) return setErr("Pick your level of study.");
    if (step === 3 && !course) return setErr("Choose a course, search for yours, or add a custom one.");
    if (step === 3 && course === "custom" && !customName.trim())
      return setErr("Type the name of your course or exam first.");
    // Step 4 = adaptive course details. Leaving it (re)assesses subjects so
    // institution/specialisation/board actually influence the syllabus.
    if (step === 4) {
      const title = course === "custom" ? customName : (courseById.get(course)?.name || customName);
      if (title.trim()) {
        setSuggesting(true);
        try {
          const r = await api<{ subjects: SeedSubject[]; source: string; sources: CurriculumSource[] }>("/api/course-suggest", {
            method: "POST",
            body: JSON.stringify({ courseName: buildAssessmentText(title, goalText), level }),
          });
          if (r.subjects?.length) {
            setSubs(r.subjects.map((x) => ({ ...x })));
            setSuggestSource(r.source);
            setSuggestSources(r.sources || []);
          }
        } catch { /* keep whatever we have */ } finally { setSuggesting(false); }
      }
    }
    if (step === 5 && subs.length === 0) return setErr("Add at least one subject.");
    if (step === 7 && dayDiff(start, exam) < 1) return setErr("Your target date must be after the start date.");
    setStep((s) => Math.min(total, s + 1));
  };
  const back = () => { setErr(""); setStep((s) => Math.max(1, s - 1)); };

  const addSubject = () => {
    const n = newSub.trim();
    if (!n) return;
    setSubs((s) => [...s, { name: n, units: 6, difficulty: "Medium", color: PALETTE[s.length % PALETTE.length] }]);
    setNewSub("");
  };

  const launch = async () => {
    setBusy(true); setErr("");
    try {
      const richName = [
        resolvedCourseName || "Custom Course",
        specialisation.trim() ? `(${specialisation.trim()})` : "",
        institution.trim() ? `— ${institution.trim()}` : "",
      ].filter(Boolean).join(" ");
      const payload = {
        name: name.trim(), level, course: course || "custom",
        courseName: richName,
        year,
        institution: institution.trim(), specialisation: specialisation.trim(),
        board, attempt, priorPrep,
        subjects: subs.map((s, i) => ({ ...s, color: s.color || PALETTE[i % PALETTE.length] })),
        startDate: start, examDate: exam, dailyHours: hrs, subjectsPerDay: spd,
        studyDays: sdays, bufferDays: buffer, planMode, studyStyle: style,
        weakSubject: weak, revisionWeeks: Number(revision),
      };
      const s = await api<AppState>("/api/onboard", { method: "POST", body: JSON.stringify(payload) });
      onDone(s);
    } catch {
      setErr("Something went wrong while generating your plan. Please try again.");
      setBusy(false);
    }
  };

  return (
    <div className="ob-overlay">
      {isRerun && (
        <div className="ob-wipe-banner">
          <strong>Fresh start mode:</strong> when you finish, your previous course, schedule and logged
          minutes are wiped and rebuilt from scratch.
        </div>
      )}
      <div className="ob-progress">
        {Array.from({ length: total }, (_, i) => i + 1).map((i) => (
          <div key={i} className={`ob-dot${i === step ? " active" : i < step ? " done" : ""}`} />
        ))}
      </div>

      <div className="ob-card slide-in" key={step}>
        {step === 1 && (
          <>
            <h1>Welcome to Study Planner Pro</h1>
            <p>Your AI study architect. In 7 quick steps I&apos;ll read your syllabus, break it into lessons and build a day-by-day plan you can actually follow.</p>
            <label className="lbl">Your Name</label>
            <input className="ob-name-input" autoFocus value={name} placeholder="e.g. Rakshit"
              onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === "Enter" && next()} />
            <div className="ob-hint ob-engine-hint">
              {provider
                ? `SHIGUN engine online — connected to ${provider}. The neural tutor voice is always key-free.`
                : "SHIGUN hybrid engine online — curriculum synthesis runs locally and the neural tutor voice needs no API key."}
            </div>
          </>
        )}

        {step === 2 && (
          <>
            <h1>What are you studying?</h1>
            <p>From nursery to doctoral research — pick where you are and I&apos;ll adapt the depth, pacing and language.</p>
            <div className="ob-level-grid">
              {levels.map((l) => (
                <button key={l.id} className={`ob-level-btn${level === l.id ? " selected" : ""}`}
                  onClick={() => { setLevel(l.id); setCourse(""); setSubs([]); }}>
                  {l.label}<br /><small style={{ fontWeight: 500, color: "var(--text-dim)" }}>{l.sub}</small>
                </button>
              ))}
            </div>
          </>
        )}

        {step === 3 && (
          <>
            <h1>Your Course / Exam</h1>
            <p>Select your programme. I&apos;ll auto-load its subjects and syllabus structure.</p>
            <input className="ob-course-search" placeholder="Search any course or exam..." value={search}
              onChange={(e) => setSearch(e.target.value)} />
            <div className="ob-course-list">
              {visibleCourses.map((c) => (
                <div key={c.id} className={`ob-course-item${course === c.id ? " selected" : ""}`} onClick={() => pickCourse(c.id)}>
                  <div className="ob-course-check">{course === c.id && <IconCheck size={11} />}</div>
                  {c.name}
                </div>
              ))}
              {search.trim().length > 1 && (
                <div className="ob-course-item" style={{ borderColor: "var(--accent)" }}
                  onClick={() => suggestFor(search)}>
                  <div className="ob-course-check" />
                  {suggesting ? "Building your syllabus…" : <>Use <strong>&ldquo;{search.trim()}&rdquo;</strong> — AI will build the subject list</>}
                </div>
              )}
              <div className={`ob-course-item${course === "custom" ? " selected" : ""}`}
                onClick={() => { setCourse("custom"); setCustomName(search.trim()); setSubs([]); }}>
                <div className="ob-course-check">{course === "custom" && <IconCheck size={11} />}</div>
                Not listed? Let the AI build it from scratch
              </div>
            </div>

            {course === "custom" && (
              <div className="slide-in" style={{ marginBottom: 14 }}>
                <label className="lbl">Course / exam title</label>
                <div className="ob-add-sub-row">
                  <input className="ob-add-sub-input" autoFocus placeholder="e.g. MBA in Marketing from NMIMS CDOE"
                    value={customName} onChange={(e) => setCustomName(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && suggestFor(customName, goalText)} />
                  <button className="ob-btn ob-btn-primary" style={{ padding: "10px 16px" }}
                    disabled={suggesting || !customName.trim()} onClick={() => suggestFor(customName, goalText)}>
                    {suggesting ? "Working…" : "AI: Assess & Build Subjects"}
                  </button>
                </div>
                <label className="lbl" style={{ marginTop: 12 }}>Describe your goal (optional)</label>
                <textarea className="input-field" rows={3} placeholder="e.g. I want to complete the course, prepare for exams, and revise weak topics"
                  value={goalText} onChange={(e) => setGoalText(e.target.value)} />
                <div className="ob-hint" style={{ marginTop: 8, marginBottom: 0 }}>
                  The engine uses the course title first, then the goal as extra context. You can edit every subject on the next screen.
                </div>
              </div>
            )}
          </>
        )}

        {step === 4 && (
          <>
            <h1>Tell me the specifics</h1>
            <p>These details let me assess the <em>exact</em> syllabus — the right papers, board pattern and specialisation — instead of a generic list.</p>
            <div className="ob-schedule-grid" style={{ gridTemplateColumns: "1fr" }}>
              {isDegree && (
                <>
                  <div className="ob-field">
                    <label>Institution / University (optional but improves accuracy)</label>
                    <input className="input-field" placeholder="e.g. NMIMS CDOE, IGNOU, Delhi University"
                      value={institution} onChange={(e) => setInstitution(e.target.value)} />
                  </div>
                  <div className="ob-field">
                    <label>Specialisation / Stream</label>
                    <input className="input-field" placeholder="e.g. Marketing, Finance, Computer Science"
                      value={specialisation} onChange={(e) => setSpecialisation(e.target.value)} />
                  </div>
                  <div className="ob-field">
                    <label>Year / Semester (narrows to that term)</label>
                    <select value={year} onChange={(e) => setYear(e.target.value)}>
                      <option value="0">Full course (all terms)</option>
                      <option value="1">Year 1 / Semester 1-2</option>
                      <option value="2">Year 2 / Semester 3-4</option>
                      <option value="3">Year 3 / Semester 5-6</option>
                      <option value="4">Year 4 / Semester 7-8</option>
                    </select>
                  </div>
                </>
              )}
              {isSchool && (
                <>
                  <div className="ob-field">
                    <label>Board</label>
                    <select value={board} onChange={(e) => setBoard(e.target.value)}>
                      <option>CBSE</option><option>ICSE</option><option>State Board</option>
                      <option>IB</option><option>IGCSE / Cambridge</option>
                    </select>
                  </div>
                  <div className="ob-field">
                    <label>Stream (for class 11-12)</label>
                    <select value={specialisation} onChange={(e) => setSpecialisation(e.target.value)}>
                      <option value="">Not applicable</option>
                      <option value="Science (PCM)">Science (PCM)</option>
                      <option value="Science (PCB)">Science (PCB)</option>
                      <option value="Commerce">Commerce</option>
                      <option value="Arts / Humanities">Arts / Humanities</option>
                    </select>
                  </div>
                </>
              )}
              {isCompetitive && (
                <>
                  <div className="ob-field">
                    <label>Specific post / specialisation / optional subject</label>
                    <input className="input-field" placeholder="e.g. UPSC optional: PSIR · SSC CGL · GATE CSE · CA Inter"
                      value={specialisation} onChange={(e) => setSpecialisation(e.target.value)} />
                  </div>
                  <div className="ob-field">
                    <label>Coaching / exam body (optional)</label>
                    <input className="input-field" placeholder="e.g. ICAI, IBPS, UPSC, NTA"
                      value={institution} onChange={(e) => setInstitution(e.target.value)} />
                  </div>
                  <div className="ob-field">
                    <label>Which attempt is this?</label>
                    <select value={attempt} onChange={(e) => setAttempt(e.target.value)}>
                      <option value="first">First attempt</option>
                      <option value="repeat">Repeat attempt</option>
                      <option value="final">Final / last attempt</option>
                    </select>
                  </div>
                  <div className="ob-field">
                    <label>How much have you already prepared?</label>
                    <select value={priorPrep} onChange={(e) => setPriorPrep(e.target.value)}>
                      <option value="fresh">Starting fresh (0-20%)</option>
                      <option value="partial">Partly done (20-60%)</option>
                      <option value="revision">Mostly done (60%+)</option>
                    </select>
                  </div>
                </>
              )}
              <div className="ob-field">
                <label>Your goal (optional — shapes the plan&apos;s emphasis)</label>
                <textarea className="input-field" rows={2}
                  placeholder="e.g. Clear the exam in first attempt, focus on weak areas, finish syllabus then revise"
                  value={goalText} onChange={(e) => setGoalText(e.target.value)} />
              </div>
            </div>
            <div className="ob-hint" style={{ marginTop: 4 }}>
              {suggesting ? "Assessing your exact syllabus…" : "When you continue, I'll assess these details and build the precise subject list."}
            </div>
          </>
        )}

        {step === 5 && (
          <>
            <h1>Review Your Subjects</h1>
            <p>{course && course !== "custom"
              ? "Suggested syllabus loaded. Adjust the number of units — each unit becomes a scheduled lesson."
              : "Add your subjects. Each unit becomes an individually scheduled lesson."}</p>
            <div className="ob-subs-grid">
              {subs.map((s, i) => (
                <div className="ob-sub-row" key={i}>
                  <div style={{ width: 10, height: 10, borderRadius: 99, background: s.color || PALETTE[i % 8] }} />
                  <input type="text" value={s.name}
                    onChange={(e) => setSubs((p) => p.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))} />
                  <input type="number" min={1} max={40} value={s.units}
                    onChange={(e) => setSubs((p) => p.map((x, j) => (j === i ? { ...x, units: Number(e.target.value) } : x)))} />
                  <select value={s.difficulty}
                    onChange={(e) => setSubs((p) => p.map((x, j) => (j === i ? { ...x, difficulty: e.target.value } : x)))}>
                    <option>Easy</option><option>Medium</option><option>Hard</option>
                  </select>
                  <button className="btn btn-xs btn-danger" onClick={() => setSubs((p) => p.filter((_, j) => j !== i))}>✕</button>
                </div>
              ))}
              {!subs.length && <div style={{ fontSize: ".82rem", color: "var(--text-dim)", padding: "10px 2px" }}>No subjects yet — add one below.</div>}
            </div>
            <div className="ob-add-sub-row">
              <input className="ob-add-sub-input" placeholder="+ Add a subject..." value={newSub}
                onChange={(e) => setNewSub(e.target.value)} onKeyDown={(e) => e.key === "Enter" && addSubject()} />
              <button className="ob-btn ob-btn-primary" style={{ padding: "10px 18px" }} onClick={addSubject}>Add</button>
            </div>
            <div className="flex-row gap-sm" style={{ flexWrap: "wrap", marginTop: 10 }}>
              <button className="btn btn-sm btn-secondary" disabled={suggesting}
                onClick={() => suggestFor(resolvedCourseName, goalText)}>
                {suggesting ? "Rebuilding…" : "↻ Re-assess subjects with AI"}
              </button>
              {suggestSource && (
                <span className="chip chip-kind">source: {suggestSource}</span>
              )}
            </div>
            {!!suggestSources.length && (
              <div className="curriculum-sources" aria-label="Curriculum source details">
                <div className="curriculum-sources-title">Source details used for this curriculum</div>
                {suggestSources.map((source, index) => (
                  <div className="curriculum-source" key={`${source.publisher}-${source.title}-${index}`}>
                    <span className="curriculum-source-type">{source.type}</span>
                    <div>
                      {source.url ? (
                        <a href={source.url} target="_blank" rel="noreferrer">{source.title}</a>
                      ) : <strong>{source.title}</strong>}
                      <div>{source.publisher}{source.note ? ` · ${source.note}` : ""}</div>
                    </div>
                  </div>
                ))}
              </div>
            )}
            <div className="ob-hint" style={{ marginTop: 10 }}>
              {subs.length} subjects · <strong>{totalUnits} advanced lessons</strong> will be generated with prerequisites, key concepts, applied practice, and source references.
            </div>
          </>
        )}

        {step === 6 && (
          <>
            <h1>How do you learn best?</h1>
            <p>This tunes how much time each lesson gets and where the extra weight goes.</p>
            <div className="ob-schedule-grid" style={{ gridTemplateColumns: "1fr" }}>
              <div className="ob-field">
                <label>Weakest Subject (gets extra time)</label>
                <select value={weak} onChange={(e) => setWeak(e.target.value)}>
                  <option value="-1">None / not sure</option>
                  {subs.map((s, i) => <option key={i} value={String(i)}>{s.name}</option>)}
                </select>
              </div>
              <div className="ob-field">
                <label>Study Style</label>
                <select value={style} onChange={(e) => setStyle(e.target.value)}>
                  <option value="balanced">Balanced — all-round</option>
                  <option value="theory">Theory heavy</option>
                  <option value="practice">Practice heavy</option>
                </select>
              </div>
              <div className="ob-field">
                <label>Pre-Exam Revision Block</label>
                <select value={revision} onChange={(e) => setRevision(e.target.value)}>
                  <option value="1">Last 1 week</option>
                  <option value="2">Last 2 weeks</option>
                  <option value="3">Last 3 weeks</option>
                  <option value="0">No revision block</option>
                </select>
              </div>
              <div className="ob-field">
                <label>Plan Mode</label>
                <select value={planMode} onChange={(e) => setPlanMode(e.target.value)}>
                  <option value="syllabus">Syllabus — from scratch</option>
                  <option value="revision">Revision — studied once</option>
                  <option value="mock">Mock-heavy — test &amp; fix</option>
                </select>
              </div>
            </div>
          </>
        )}

        {step === 7 && (
          <>
            <h1>Your Schedule</h1>
            <p>Be honest about the hours. A plan you follow beats a plan that looks impressive.</p>
            <div className="ob-schedule-grid">
              <div className="ob-field"><label>Start Date</label>
                <input type="date" value={start} onChange={(e) => setStart(e.target.value)} /></div>
              <div className="ob-field"><label>Exam / Target Date</label>
                <input type="date" value={exam} onChange={(e) => setExam(e.target.value)} /></div>
              <div className="ob-field"><label>Daily Study Hours</label>
                <select value={hrs} onChange={(e) => setHrs(Number(e.target.value))}>
                  {[1,2,3,4,5,6,7,8,9,10,11,12].map((h) => <option key={h} value={h}>{h} hour{h > 1 ? "s" : ""}</option>)}
                </select></div>
              <div className="ob-field"><label>Subjects per Day</label>
                <select value={spd} onChange={(e) => setSpd(Number(e.target.value))}>
                  {[1,2,3,4,5,6].map((n) => <option key={n} value={n}>{n} subject{n > 1 ? "s" : ""}/day</option>)}
                </select></div>
              <div className="ob-field"><label>Study Days</label>
                <select value={sdays} onChange={(e) => setSdays(e.target.value)}>
                  <option value="all">All 7 days</option>
                  <option value="6days">6 days (Sunday off)</option>
                  <option value="weekdays">Weekdays only</option>
                </select></div>
              <div className="ob-field"><label>Buffer Days</label>
                <input type="number" min={0} max={30} value={buffer} onChange={(e) => setBuffer(Number(e.target.value))} /></div>
            </div>
            <div style={{ background: "var(--row-bg)", border: "1px solid var(--glass-border)", padding: 16, borderRadius: 12, textAlign: "center" }}>
              <div style={{ fontSize: ".68rem", fontWeight: 800, textTransform: "uppercase", color: "var(--text-muted)", letterSpacing: 1 }}>Projected Syllabus Completion</div>
              <div style={{ fontSize: "1.7rem", fontWeight: 800, marginTop: 4 }}>{prettyLong(projected)}</div>
              <div style={{ fontSize: ".82rem", fontWeight: 650, marginTop: 4, color: feasible ? "var(--success-accent)" : "var(--danger-accent)" }}>
                {feasible
                  ? `Comfortable — ${availDays} days available, ${Math.round(estMinutes / 60)}h of content.`
                  : `Tight — needs ~${Math.round(estMinutes / 60)}h but you only have ~${Math.round(capacity / 60)}h. I'll compress lessons.`}
              </div>
            </div>
          </>
        )}

        {step === 8 && (
          <>
            <h1>Ready to build your plan</h1>
            <p>The AI engine will break every subject into ordered lessons, sequence them by difficulty, weave in spaced-recall checkpoints and weekly tests, then map it all to your calendar.</p>
            <div style={{ marginBottom: 18 }}>
              <div className="ob-summary-row"><span>Learner</span><span>{name}</span></div>
              <div className="ob-summary-row"><span>Programme</span><span>{resolvedCourseName}</span></div>
              {specialisation.trim() && <div className="ob-summary-row"><span>Specialisation</span><span>{specialisation}</span></div>}
              {institution.trim() && <div className="ob-summary-row"><span>Institution</span><span>{institution}</span></div>}
              <div className="ob-summary-row"><span>Subjects</span><span>{subs.length}</span></div>
              <div className="ob-summary-row"><span>Lessons to generate</span><span>{totalUnits}</span></div>
              <div className="ob-summary-row"><span>Window</span><span>{prettyLong(start)} → {prettyLong(exam)}</span></div>
              <div className="ob-summary-row"><span>Daily commitment</span><span>{hrs}h · {spd} subjects/day</span></div>
              <div className="ob-summary-row"><span>Revision block</span><span>{revision === "0" ? "None" : `Last ${revision} week(s)`}</span></div>
              <div className="ob-summary-row"><span>Buffer days</span><span>{buffer}</span></div>
            </div>
            {busy && (
              <div style={{ background: "var(--accent-glow)", padding: 14, borderRadius: 12, fontSize: ".84rem", fontWeight: 650, marginBottom: 16 }}>
                SHIGUN is analysing your syllabus and sequencing {totalUnits} lessons… this takes a few seconds.
              </div>
            )}
          </>
        )}

        {err && <div style={{ color: "var(--danger-accent)", fontSize: ".8rem", fontWeight: 700, marginBottom: 12 }}>{err}</div>}

        <div className="ob-btn-row mt-md">
          {step > 1 && <button className="ob-btn ob-btn-secondary" onClick={back} disabled={busy || suggesting}>Back</button>}
          {step < total && <button className="ob-btn ob-btn-primary" onClick={next} disabled={suggesting}>{suggesting ? "Assessing…" : step === 1 ? "Let's Start" : step === 4 ? "Assess & Continue" : "Continue"}</button>}
          {step === total && (
            <button className="ob-btn ob-btn-primary" onClick={launch} disabled={busy}>
              {busy ? "Generating…" : isRerun ? "Wipe old plan & Generate New" : "Generate My AI Plan"}
            </button>
          )}
        </div>
        {isRerun && onCancel && (
          <button className="ob-cancel-link" onClick={onCancel} disabled={busy}>
            Cancel — keep my current plan
          </button>
        )}
      </div>
    </div>
  );
}
