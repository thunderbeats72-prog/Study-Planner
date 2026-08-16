"use client";

import React, { useEffect, useMemo, useState } from "react";
import { api, addDays, today, dayDiff, parseDate, prettyLong, type AppState } from "@/lib/client";
import { IconCheck } from "./icons";

type Level = { id: string; label: string; sub: string };
type SeedSubject = { name: string; units: number; difficulty: string; color: string };
type CourseMeta = { id: string; name: string; level: string; subjects: SeedSubject[] };

const PALETTE = ["#6366f1", "#10b981", "#f59e0b", "#ef4444", "#06b6d4", "#ec4899", "#84cc16", "#8b5cf6"];

export default function Onboarding({ onDone }: { onDone: (s: AppState) => void }) {
  const [step, setStep] = useState(1);
  const total = 8;
  const [levels, setLevels] = useState<Level[]>([]);
  const [levelCourses, setLevelCourses] = useState<Record<string, string[]>>({});
  const [courses, setCourses] = useState<CourseMeta[]>([]);
  const [provider, setProvider] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  const [name, setName] = useState("");
  const [level, setLevel] = useState("");
  const [course, setCourse] = useState("");
  const [year, setYear] = useState("1");
  const [subs, setSubs] = useState<SeedSubject[]>([]);
  const [newSub, setNewSub] = useState("");
  const [customName, setCustomName] = useState("");
  const [goalText, setGoalText] = useState("");
  const [suggesting, setSuggesting] = useState(false);
  const [suggestSource, setSuggestSource] = useState("");

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

  /** Assemble details for authentic syllabus retrieval */
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

  /** Deep Knowledge Retrieval for course syllabus */
  const suggestFor = async (typed: string, goal = goalText) => {
    const titleText = typed.trim();
    if (!titleText) return;
    const assessmentText = buildAssessmentText(titleText, goal);
    setCourse("custom");
    setCustomName(titleText);
    setSuggesting(true);
    setErr("");
    try {
      const r = await api<{ subjects: SeedSubject[]; source: string }>("/api/course-suggest", {
        method: "POST",
        body: JSON.stringify({ courseName: assessmentText, level }),
      });
      setSubs(r.subjects.map((x) => ({ ...x })));
      setSuggestSource(r.source);
      setStep(4);
    } catch {
      setErr("Could not build the subject list. Add your subjects manually below.");
      setStep(4);
    } finally {
      setSuggesting(false);
    }
  };

  // Strict Mathematical Projected Date Output
  const totalUnits = subs.reduce((a, s) => a + (Number(s.units) || 0), 0);
  const estMinutes = totalUnits * 45;
  const dailyMins = Math.max(15, hrs * 60);
  const totalStudyDaysRequired = Math.max(1, Math.ceil(estMinutes / dailyMins));

  const projected = useMemo(() => {
    let cursor = start;
    let count = 0;
    let guard = 0;
    while (guard < 3650) {
      const dow = parseDate(cursor).getDay();
      const isStudy = sdays === "weekdays" ? (dow >= 1 && dow <= 5) : sdays === "6days" ? (dow !== 0) : true;
      if (isStudy) {
        count++;
        if (count >= totalStudyDaysRequired) return cursor;
      }
      cursor = addDays(cursor, 1);
      guard++;
    }
    return cursor;
  }, [start, totalStudyDaysRequired, sdays]);

  const daysToExam = dayDiff(start, exam);
  const feasible = dayDiff(start, projected) <= daysToExam;

  const next = async () => {
    setErr("");
    if (step === 1 && !name.trim()) return setErr("Please enter your name to continue.");
    if (step === 2 && !level) return setErr("Pick your level of study.");
    if (step === 3 && !course) return setErr("Choose a course, search for yours, or add a custom one.");
    if (step === 3 && course === "custom" && !customName.trim())
      return setErr("Type the name of your course or exam first.");

    if (step === 4) {
      const title = course === "custom" ? customName : (courseById.get(course)?.name || customName);
      if (title.trim()) {
        setSuggesting(true);
        try {
          const r = await api<{ subjects: SeedSubject[]; source: string }>("/api/course-suggest", {
            method: "POST",
            body: JSON.stringify({ courseName: buildAssessmentText(title, goalText), level }),
          });
          if (r.subjects?.length) { setSubs(r.subjects.map((x) => ({ ...x }))); setSuggestSource(r.source); }
        } catch { /* keep existing */ } finally { setSuggesting(false); }
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
    setSubs((s) => [...s, { name: n, units: 8, difficulty: "Medium", color: PALETTE[s.length % PALETTE.length] }]);
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
      <div className="ob-progress">
        {Array.from({ length: total }, (_, i) => i + 1).map((i) => (
          <div key={i} className={`ob-dot${i === step ? " active" : i < step ? " done" : ""}`} />
        ))}
      </div>

      <div className="ob-card slide-in" key={step}>
        {step === 1 && (
          <>
            <h1>Welcome to Study Planner Pro</h1>
            <p>Your AI study architect. In 7 quick steps I&apos;ll retrieve your official syllabus, break it into sequenced lessons, and build a mathematically balanced daily schedule.</p>
            <label className="lbl">Your Name</label>
            <input className="ob-name-input" autoFocus value={name} placeholder="e.g. Alex"
              onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === "Enter" && next()} />
            <div className="ob-hint">
              {provider ? `AETHER engine online — connected to ${provider}.` : "AETHER hybrid engine online — Deep Knowledge Retrieval active."}
            </div>
          </>
        )}

        {step === 2 && (
          <>
            <h1>What are you studying?</h1>
            <p>From nursery to doctoral research — pick where you are and the engine will adapt the syllabus depth and pacing.</p>
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
            <p>Select your programme or type any specific university/exam title.</p>
            <input className="ob-course-search" placeholder="Search any course, university, or exam..." value={search}
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
                  {suggesting ? "Retrieving syllabus…" : <>Use <strong>&ldquo;{search.trim()}&rdquo;</strong> — AI will retrieve exact subjects</>}
                </div>
              )}
              <div className={`ob-course-item${course === "custom" ? " selected" : ""}`}
                onClick={() => { setCourse("custom"); setCustomName(search.trim()); setSubs([]); }}>
                <div className="ob-course-check">{course === "custom" && <IconCheck size={11} />}</div>
                Not listed? Let AI retrieve and build it from scratch
              </div>
            </div>

            {course === "custom" && (
              <div className="slide-in" style={{ marginBottom: 14 }}>
                <label className="lbl">Course / Exam Title</label>
                <div className="ob-add-sub-row">
                  <input className="ob-add-sub-input" autoFocus placeholder="e.g. MBA in Marketing from NMIMS CDOE"
                    value={customName} onChange={(e) => setCustomName(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && suggestFor(customName, goalText)} />
                  <button className="ob-btn ob-btn-primary" style={{ padding: "10px 16px" }}
                    disabled={suggesting || !customName.trim()} onClick={() => suggestFor(customName, goalText)}>
                    {suggesting ? "Retrieving…" : "AI: Retrieve Syllabus"}
                  </button>
                </div>
                <label className="lbl" style={{ marginTop: 12 }}>Describe your goal (optional)</label>
                <textarea className="input-field" rows={3} placeholder="e.g. Complete first semester syllabus, prepare for midterms, and focus on weak topics"
                  value={goalText} onChange={(e) => setGoalText(e.target.value)} />
              </div>
            )}
          </>
        )}

        {step === 4 && (
          <>
            <h1>Tell me the specifics</h1>
            <p>These details let the Deep Knowledge Retrieval engine fetch the <em>exact</em> papers, board pattern, and term modules.</p>
            <div className="ob-schedule-grid" style={{ gridTemplateColumns: "1fr" }}>
              {isDegree && (
                <>
                  <div className="ob-field">
                    <label>Institution / University</label>
                    <input className="input-field" placeholder="e.g. NMIMS CDOE, IGNOU, Delhi University"
                      value={institution} onChange={(e) => setInstitution(e.target.value)} />
                  </div>
                  <div className="ob-field">
                    <label>Specialisation / Stream</label>
                    <input className="input-field" placeholder="e.g. Marketing, Finance, Computer Science"
                      value={specialisation} onChange={(e) => setSpecialisation(e.target.value)} />
                  </div>
                  <div className="ob-field">
                    <label>Year / Semester</label>
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
                    <input className="input-field" placeholder="e.g. UPSC optional: PSIR · GATE CSE · CA Inter"
                      value={specialisation} onChange={(e) => setSpecialisation(e.target.value)} />
                  </div>
                  <div className="ob-field">
                    <label>Exam Body</label>
                    <input className="input-field" placeholder="e.g. ICAI, IBPS, UPSC, NTA"
                      value={institution} onChange={(e) => setInstitution(e.target.value)} />
                  </div>
                </>
              )}
              <div className="ob-field">
                <label>Your Goal</label>
                <textarea className="input-field" rows={2}
                  placeholder="e.g. Complete syllabus with high retention and structured spaced recall"
                  value={goalText} onChange={(e) => setGoalText(e.target.value)} />
              </div>
            </div>
          </>
        )}

        {step === 5 && (
          <>
            <h1>Review Your Subjects &amp; Units</h1>
            <p>Authentic syllabus retrieved. Adjust the exact number of units/chapters as needed.</p>
            <div className="ob-subs-grid">
              {subs.map((s, i) => (
                <div className="ob-sub-row" key={i}>
                  <div style={{ width: 10, height: 10, borderRadius: 99, background: s.color || PALETTE[i % 8] }} />
                  <input type="text" value={s.name}
                    onChange={(e) => setSubs((p) => p.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))} />
                  <input type="number" min={1} max={50} value={s.units} title="Units/Chapters"
                    onChange={(e) => setSubs((p) => p.map((x, j) => (j === i ? { ...x, units: Number(e.target.value) } : x)))} />
                  <select value={s.difficulty}
                    onChange={(e) => setSubs((p) => p.map((x, j) => (j === i ? { ...x, difficulty: e.target.value } : x)))}>
                    <option>Easy</option><option>Medium</option><option>Hard</option>
                  </select>
                  <button className="btn btn-xs btn-danger" onClick={() => setSubs((p) => p.filter((_, j) => j !== i))}>✕</button>
                </div>
              ))}
              {!subs.length && <div style={{ fontSize: ".84rem", color: "var(--text-dim)", padding: "10px 2px" }}>No subjects yet — add one below.</div>}
            </div>
            <div className="ob-add-sub-row">
              <input className="ob-add-sub-input" placeholder="+ Add a subject..." value={newSub}
                onChange={(e) => setNewSub(e.target.value)} onKeyDown={(e) => e.key === "Enter" && addSubject()} />
              <button className="ob-btn ob-btn-primary" style={{ padding: "10px 18px" }} onClick={addSubject}>Add</button>
            </div>
            <div className="flex-row gap-sm" style={{ flexWrap: "wrap", marginTop: 10 }}>
              <button className="btn btn-sm btn-secondary" disabled={suggesting}
                onClick={() => suggestFor(resolvedCourseName, goalText)}>
                {suggesting ? "Retrieving…" : "↻ Re-retrieve with AI"}
              </button>
              {suggestSource && (
                <span className="chip chip-kind">source: {suggestSource}</span>
              )}
            </div>
            <div className="ob-hint" style={{ marginTop: 12 }}>
              {subs.length} subjects · <strong>{totalUnits} lessons</strong> will be generated and scheduled.
            </div>
          </>
        )}

        {step === 6 && (
          <>
            <h1>How do you learn best?</h1>
            <p>Fine-tune study weights, revision blocks, and pedagogical style.</p>
            <div className="ob-schedule-grid" style={{ gridTemplateColumns: "1fr" }}>
              <div className="ob-field">
                <label>Weakest Subject (gets priority weight)</label>
                <select value={weak} onChange={(e) => setWeak(e.target.value)}>
                  <option value="-1">None / Balanced focus</option>
                  {subs.map((s, i) => <option key={i} value={String(i)}>{s.name}</option>)}
                </select>
              </div>
              <div className="ob-field">
                <label>Study Style</label>
                <select value={style} onChange={(e) => setStyle(e.target.value)}>
                  <option value="balanced">Balanced (Theory + Practice)</option>
                  <option value="theory">Theory Heavy (Foundations first)</option>
                  <option value="practice">Practice Heavy (Problem-first)</option>
                </select>
              </div>
              <div className="ob-field">
                <label>Pre-Exam Dedicated Revision Block</label>
                <select value={revision} onChange={(e) => setRevision(e.target.value)}>
                  <option value="1">Last 1 week</option>
                  <option value="2">Last 2 weeks</option>
                  <option value="3">Last 3 weeks</option>
                  <option value="0">No dedicated revision block</option>
                </select>
              </div>
              <div className="ob-field">
                <label>Plan Mode</label>
                <select value={planMode} onChange={(e) => setPlanMode(e.target.value)}>
                  <option value="syllabus">Syllabus — Learn from start to finish</option>
                  <option value="revision">Revision — Fast review of all units</option>
                  <option value="mock">Mock-Heavy — Test &amp; fix weaknesses</option>
                </select>
              </div>
            </div>
          </>
        )}

        {step === 7 && (
          <>
            <h1>Your Study Commitment</h1>
            <p>Set your daily study hours and timetable. The mathematical scheduler will divide your time perfectly.</p>
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
                  <option value="weekdays">Weekdays only (Mon-Fri)</option>
                </select></div>
              <div className="ob-field"><label>Buffer Days</label>
                <input type="number" min={0} max={30} value={buffer} onChange={(e) => setBuffer(Number(e.target.value))} /></div>
            </div>
            <div style={{ background: "var(--row-bg)", border: "1px solid var(--glass-border)", padding: 18, borderRadius: 14, textAlign: "center" }}>
              <div style={{ fontSize: ".7rem", fontWeight: 800, textTransform: "uppercase", color: "var(--text-muted)", letterSpacing: 1 }}>Strict Mathematical Projected Finish</div>
              <div style={{ fontSize: "1.75rem", fontWeight: 800, marginTop: 4 }}>{prettyLong(projected)}</div>
              <div style={{ fontSize: ".84rem", fontWeight: 650, marginTop: 6, color: feasible ? "var(--success-accent)" : "var(--danger-accent)" }}>
                {feasible
                  ? `Comfortable timeline — ${totalStudyDaysRequired} study days needed (${Math.round(estMinutes / 60)}h of content) for ${daysToExam} days available.`
                  : `Intensive timeline — requires ${totalStudyDaysRequired} study days (${Math.round(estMinutes / 60)}h of content). Consider increasing daily hours to finish before the exam.`}
              </div>
            </div>
          </>
        )}

        {step === 8 && (
          <>
            <h1>Ready to build your plan</h1>
            <p>The mathematical curriculum engine will sequence all {totalUnits} lessons, divide daily study time equally across active subjects, and schedule spaced-repetition checkpoints.</p>
            <div style={{ marginBottom: 20 }}>
              <div className="ob-summary-row"><span>Learner</span><span>{name}</span></div>
              <div className="ob-summary-row"><span>Programme</span><span>{resolvedCourseName}</span></div>
              {specialisation.trim() && <div className="ob-summary-row"><span>Specialisation</span><span>{specialisation}</span></div>}
              {institution.trim() && <div className="ob-summary-row"><span>Institution</span><span>{institution}</span></div>}
              <div className="ob-summary-row"><span>Subjects</span><span>{subs.length}</span></div>
              <div className="ob-summary-row"><span>Lessons</span><span>{totalUnits}</span></div>
              <div className="ob-summary-row"><span>Window</span><span>{prettyLong(start)} → {prettyLong(exam)}</span></div>
              <div className="ob-summary-row"><span>Daily Commitment</span><span>{hrs}h · {spd} subjects/day</span></div>
              <div className="ob-summary-row"><span>Projected Finish</span><span>{prettyLong(projected)}</span></div>
            </div>
            {busy && (
              <div style={{ background: "var(--accent-glow)", padding: 16, borderRadius: 12, fontSize: ".86rem", fontWeight: 650, marginBottom: 16 }}>
                AETHER is sequencing your lessons and building your mathematically sound schedule…
              </div>
            )}
          </>
        )}

        {err && <div style={{ color: "var(--danger-accent)", fontSize: ".82rem", fontWeight: 700, marginBottom: 12 }}>{err}</div>}

        <div className="ob-btn-row mt-md">
          {step > 1 && <button className="ob-btn ob-btn-secondary" onClick={back} disabled={busy || suggesting}>Back</button>}
          {step < total && <button className="ob-btn ob-btn-primary" onClick={next} disabled={suggesting}>{suggesting ? "Retrieving…" : step === 1 ? "Let's Start" : step === 4 ? "Assess & Continue" : "Continue"}</button>}
          {step === total && (
            <button className="ob-btn ob-btn-primary" onClick={launch} disabled={busy}>
              {busy ? "Generating Schedule…" : "Generate My AI Plan"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
