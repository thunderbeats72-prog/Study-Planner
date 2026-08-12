export type PlanTopic = {
  id: number;
  subjectId: number;
  title: string;
  unit: string;
  estMinutes: number;
  difficulty: string;
  mastery?: number;
};

export type PlanSubject = {
  id: number;
  name: string;
  difficulty: string;
  color: string;
};

export type PlanSettings = {
  startDate: string;
  examDate: string;
  dailyHours: number;
  subjectsPerDay: number;
  studyDays: string;
  bufferDays: number;
  planMode: string;
  studyStyle: string;
  weakSubject: string;
  revisionWeeks: number;
};

export type PlanTask = {
  date: string;
  subjectId: number | null;
  topicId: number | null;
  kind: "learn" | "revise" | "practice" | "mock" | "buffer";
  title: string;
  detail: string;
  plannedMinutes: number;
  position: number;
};

export function fmt(d: Date): string {
  const y = d.getFullYear();
  const m = `${d.getMonth() + 1}`.padStart(2, "0");
  const day = `${d.getDate()}`.padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function parse(s: string): Date {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y, (m || 1) - 1, d || 1);
}

export function addDays(s: string, n: number): string {
  const d = parse(s);
  d.setDate(d.getDate() + n);
  return fmt(d);
}

export function todayStr(): string {
  return fmt(new Date());
}

export function diffDays(a: string, b: string): number {
  return Math.round((parse(b).getTime() - parse(a).getTime()) / 86400000);
}

function isStudyDay(dateStr: string, mode: string): boolean {
  const dow = parse(dateStr).getDay(); // 0 = Sun
  if (mode === "weekdays") return dow >= 1 && dow <= 5;
  if (mode === "6days") return dow !== 0;
  return true;
}

function diffWeight(d: string): number {
  return d === "Hard" ? 1.3 : d === "Easy" ? 0.8 : 1;
}

export type PlanResult = {
  tasks: PlanTask[];
  stats: {
    studyDays: number;
    learnDays: number;
    revisionDays: number;
    bufferDays: number;
    totalTopics: number;
    scheduledTopics: number;
    projectedFinish: string | null;
    dailyMinutes: number;
    requiredMinutes: number;
    feasible: boolean;
    loadRatio: number;
  };
};

export function buildPlan(
  subjects: PlanSubject[],
  topics: PlanTopic[],
  st: PlanSettings
): PlanResult {
  const dates: string[] = [];
  const start = st.startDate;
  const end = st.examDate;
  let cursor = start;
  let guard = 0;
  while (diffDays(cursor, end) >= 0 && guard < 2000) {
    if (isStudyDay(cursor, st.studyDays)) dates.push(cursor);
    cursor = addDays(cursor, 1);
    guard++;
  }

  const empty: PlanResult = {
    tasks: [],
    stats: {
      studyDays: 0, learnDays: 0, revisionDays: 0, bufferDays: 0,
      totalTopics: topics.length, scheduledTopics: 0, projectedFinish: null,
      dailyMinutes: st.dailyHours * 60, requiredMinutes: 0, feasible: false, loadRatio: 0,
    },
  };
  if (!dates.length || !subjects.length) return empty;

  const dailyCap = Math.max(20, Math.round(st.dailyHours * 60));
  const bufferCount = Math.min(st.bufferDays, Math.floor(dates.length * 0.2));
  const revisionCount =
    st.planMode === "revision"
      ? 0
      : Math.min(st.revisionWeeks * 7, Math.floor((dates.length - bufferCount) * 0.3));

  const learnDates = dates.slice(0, Math.max(1, dates.length - bufferCount - revisionCount));
  const revisionDates = dates.slice(learnDates.length, dates.length - bufferCount);
  const bufferDates = dates.slice(dates.length - bufferCount);

  const weakId = st.weakSubject && st.weakSubject !== "none" ? Number(st.weakSubject) : -1;
  const subjWeight = new Map<number, number>();
  for (const s of subjects) {
    subjWeight.set(s.id, diffWeight(s.difficulty) * (s.id === weakId ? 1.45 : 1));
  }

  const queues = new Map<number, PlanTopic[]>();
  for (const s of subjects) queues.set(s.id, []);
  for (const t of topics) {
    if (!queues.has(t.subjectId)) queues.set(t.subjectId, []);
    queues.get(t.subjectId)!.push(t);
  }

  const styleMul = st.studyStyle === "theory" ? 1.1 : st.studyStyle === "practice" ? 0.9 : 1;
  const requiredMinutes = topics.reduce(
    (a, t) => a + t.estMinutes * styleMul * (1 + (t.mastery ? -t.mastery / 200 : 0)),
    0
  );
  const availableMinutes = learnDates.length * dailyCap * 0.78; // 22% goes to spaced review
  const loadRatio = availableMinutes > 0 ? requiredMinutes / availableMinutes : 99;
  // compression: if overloaded, shrink per-topic time (still keeps every lesson on the plan)
  const compress = loadRatio > 1 ? Math.max(0.45, 1 / loadRatio) : 1;

  const tasks: PlanTask[] = [];
  const reviewQueue = new Map<number, { topic: PlanTopic; pass: number }[]>();
  const pushReview = (dayIdx: number, topic: PlanTopic, pass: number) => {
    if (dayIdx >= learnDates.length) return;
    const arr = reviewQueue.get(dayIdx) || [];
    arr.push({ topic, pass });
    reviewQueue.set(dayIdx, arr);
  };

  const subjById = new Map(subjects.map((s) => [s.id, s]));
  const learned: PlanTopic[] = [];
  let cyclePtr = 0;
  let scheduled = 0;
  let lastLearnDate: string | null = null;

  // pace new lessons so the syllabus spreads across the whole learning window
  // instead of finishing in a burst and leaving empty weeks behind.
  const dailyLearnBudget = Math.max(
    25,
    Math.min(Math.round(dailyCap * 0.8), Math.ceil(requiredMinutes / Math.max(1, learnDates.length)) + 10)
  );

  if (st.planMode !== "revision") {
    for (let d = 0; d < learnDates.length; d++) {
      const date = learnDates[d];
      let remaining = dailyCap;
      let pos = 0;

      // 1) spaced repetition reviews due today
      const due = (reviewQueue.get(d) || []).slice(0, 3);
      for (const r of due) {
        const mins = r.pass === 1 ? 15 : 20;
        if (remaining < mins + 20) break;
        remaining -= mins;
        tasks.push({
          date,
          subjectId: r.topic.subjectId,
          topicId: r.topic.id,
          kind: "revise",
          title: `Recall: ${r.topic.title}`,
          detail:
            r.pass === 1
              ? "24–48h spaced recall. Close the book, write everything you remember, then check gaps."
              : "1-week spaced recall. Do 5 mixed questions from this lesson without notes.",
          plannedMinutes: mins,
          position: pos++,
        });
      }

      // 2) weekly self-test / mock
      const isTestDay = d > 3 && d % 7 === 6;
      if (isTestDay && remaining > 45) {
        const mins = st.planMode === "mock" ? 60 : 40;
        remaining -= mins;
        tasks.push({
          date,
          subjectId: null,
          topicId: null,
          kind: "mock",
          title: `Weekly Checkpoint Test #${Math.floor(d / 7)}`,
          detail:
            "Mixed test on everything covered in the last 7 study days. Time it strictly, then log every mistake in your error notebook.",
          plannedMinutes: mins,
          position: pos++,
        });
      }

      // 3) new lessons — choose subjects for the day
      const live = subjects.filter((s) => (queues.get(s.id) || []).length > 0);
      const rotated = [...(live.length ? live : subjects)].sort((a, b) => {
        const ra = ((queues.get(a.id)!.length * (subjWeight.get(a.id) || 1)) % 1000);
        const rb = ((queues.get(b.id)!.length * (subjWeight.get(b.id) || 1)) % 1000);
        return rb - ra;
      });
      const offset = d % rotated.length;
      const ordered = [...rotated.slice(offset), ...rotated.slice(0, offset)];
      const chosen = ordered.slice(0, Math.max(1, Math.min(st.subjectsPerDay, ordered.length)));

      const learnBudget = Math.max(20, Math.min(remaining - 5, dailyLearnBudget));
      const wsum = chosen.reduce((a, s) => a + (subjWeight.get(s.id) || 1), 0);
      const touched: PlanSubject[] = [];
      const todaysTopics: PlanTopic[] = [];
      for (const s of chosen) {
        let slot = Math.round((learnBudget * (subjWeight.get(s.id) || 1)) / wsum);
        const q = queues.get(s.id)!;
        let placed = 0;
        while (q.length) {
          const t = q[0];
          const mins = Math.max(15, Math.round((t.estMinutes * styleMul * compress) / 5) * 5);
          if (placed > 0 && mins > slot) break;
          if (mins > remaining) break;
          q.shift();
          slot -= mins;
          remaining -= mins;
          placed++;
          scheduled++;
          lastLearnDate = date;
          if (!touched.includes(s)) touched.push(s);
          todaysTopics.push(t);
          learned.push(t);
          tasks.push({
            date,
            subjectId: s.id,
            topicId: t.id,
            kind: "learn",
            title: `${s.name}: ${t.title}`,
            detail: `${t.unit} • ${t.difficulty}. Learn the concept, then attempt practice questions before marking done.`,
            plannedMinutes: mins,
            position: pos++,
          });
          pushReview(d + 2, t, 1);
          pushReview(d + 7, t, 2);
          if (slot <= 10) break;
        }
      }

      // 4) fill spare capacity with topic-linked practice / mastery cycles,
      //    so every study day is tied to specific lessons — never generic filler.
      let guardFill = 0;
      while (remaining >= 25 && guardFill < 5) {
        let t: PlanTopic | undefined;
        let label = "";
        let detail = "";
        if (todaysTopics[guardFill]) {
          t = todaysTopics[guardFill];
          label = "Apply";
          detail =
            "Immediate application of the lesson you just learned: 10–12 graded questions, easy → hard. Anything you hesitate on goes in the error log.";
        } else if (learned.length) {
          t = learned[cyclePtr % learned.length];
          const cycle = 2 + Math.floor(cyclePtr / learned.length);
          cyclePtr++;
          label = `Mastery Cycle ${cycle}`;
          detail =
            "Second-pass mastery: previous-year and advanced variations of this lesson. Work for speed and accuracy, not re-reading.";
        } else if (touched.length || chosen.length) {
          const s = (touched.length ? touched : chosen)[guardFill % (touched.length || chosen.length)];
          remaining -= Math.min(remaining, 45);
          tasks.push({
            date, subjectId: s.id, topicId: null, kind: "practice",
            title: `${s.name} — Warm-up Problem Set`,
            detail: "Mixed questions to build baseline familiarity before the syllabus lessons begin.",
            plannedMinutes: 45, position: pos++,
          });
          guardFill++;
          continue;
        } else break;

        const sName = subjById.get(t.subjectId)?.name || "Study";
        const mins = Math.min(remaining, 45);
        remaining -= mins;
        tasks.push({
          date,
          subjectId: t.subjectId,
          topicId: t.id,
          kind: "practice",
          title: `${label} — ${sName}: ${t.title}`,
          detail,
          plannedMinutes: mins,
          position: pos++,
        });
        guardFill++;
      }
    }
  }

  // 4) revision block — hardest + least mastered first, cycled
  const revisionPool = [...topics].sort((a, b) => {
    const w = diffWeight(b.difficulty) - diffWeight(a.difficulty);
    if (w !== 0) return w;
    return (a.mastery || 0) - (b.mastery || 0);
  });
  const revDates = st.planMode === "revision" ? dates.slice(0, dates.length - bufferCount) : revisionDates;
  if (revDates.length && revisionPool.length) {
    const perDay = Math.max(1, Math.ceil(revisionPool.length / revDates.length));
    let idx = 0;
    for (let d = 0; d < revDates.length; d++) {
      const date = revDates[d];
      let remaining = dailyCap;
      let pos = 0;
      const isMockDay = st.planMode === "mock" ? d % 2 === 0 : d % 3 === 2;
      if (isMockDay) {
        const mins = Math.min(90, Math.round(dailyCap * 0.5));
        remaining -= mins;
        tasks.push({
          date,
          subjectId: null,
          topicId: null,
          kind: "mock",
          title: `Full-Length Mock Test #${Math.floor(d / 3) + 1}`,
          detail: "Exam-condition mock. Afterwards spend 20 minutes analysing every wrong answer.",
          plannedMinutes: mins,
          position: pos++,
        });
      }
      for (let k = 0; k < perDay && remaining > 15; k++) {
        const t = revisionPool[idx % revisionPool.length];
        idx++;
        const s = subjById.get(t.subjectId);
        const mins = Math.max(15, Math.min(remaining, Math.round(t.estMinutes * 0.45 / 5) * 5));
        remaining -= mins;
        tasks.push({
          date,
          subjectId: t.subjectId,
          topicId: t.id,
          kind: "revise",
          title: `Revise — ${s ? s.name + ": " : ""}${t.title}`,
          detail: "Active recall + previous-year questions. Aim for speed and accuracy, not re-reading.",
          plannedMinutes: mins,
          position: pos++,
        });
      }
    }
  }

  // 5) buffer / taper days
  bufferDates.forEach((date, i) => {
    const last = i === bufferDates.length - 1;
    tasks.push({
      date,
      subjectId: null,
      topicId: null,
      kind: "buffer",
      title: last ? "Light review & rest before exam" : `Buffer day ${i + 1} — catch-up & weak areas`,
      detail: last
        ? "No new material. Skim your recall sheets, sleep early, prepare documents."
        : "Use this slack to finish anything you skipped, or drill your weakest topic list.",
      plannedMinutes: Math.round(dailyCap * (last ? 0.4 : 0.7)),
      position: 0,
    });
  });

  return {
    tasks,
    stats: {
      studyDays: dates.length,
      learnDays: learnDates.length,
      revisionDays: revDates.length,
      bufferDays: bufferDates.length,
      totalTopics: topics.length,
      scheduledTopics: scheduled,
      projectedFinish: lastLearnDate,
      dailyMinutes: dailyCap,
      requiredMinutes: Math.round(requiredMinutes),
      feasible: loadRatio <= 1.15,
      loadRatio: Math.round(loadRatio * 100) / 100,
    },
  };
}
