export type PlanTopic = {
  id: number;
  subjectId: number;
  title: string;
  unit: string;
  estMinutes: number;
  difficulty: "Easy" | "Medium" | "Hard" | string;
  mastery?: number;
  position?: number;
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
  studyDays: string; // "all" | "6days" | "weekdays"
  bufferDays: number;
  planMode: string; // "syllabus" | "revision" | "mock"
  studyStyle: string; // "balanced" | "theory" | "practice"
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

export function isStudyDay(dateStr: string, mode: string): boolean {
  const dow = parse(dateStr).getDay(); // 0 = Sun, 1 = Mon, ..., 6 = Sat
  if (mode === "weekdays") return dow >= 1 && dow <= 5;
  if (mode === "6days") return dow !== 0;
  return true;
}

export function diffWeight(d: string): number {
  return d === "Hard" ? 1.25 : d === "Easy" ? 0.85 : 1.0;
}

/**
 * Strict Mathematical Projected Date Calculator:
 * Total Days Required = ceil((Total Units Across All Subjects * Estimated Minutes Per Unit) / (Daily Study Hours * 60))
 * Then advances calendar days from startDate skipping non-study days according to studyDays setting.
 */
export function calculateProjectedCompletionDate(
  startDate: string,
  totalUnits: number,
  avgMinutesPerUnit: number,
  dailyHours: number,
  studyDays = "all"
): { projectedDate: string; totalDaysRequired: number; totalMinutes: number } {
  const totalMinutes = Math.max(1, totalUnits * Math.max(15, avgMinutesPerUnit));
  const dailyMinutes = Math.max(15, Math.round(dailyHours * 60));
  const totalDaysRequired = Math.max(1, Math.ceil(totalMinutes / dailyMinutes));

  let cursor = startDate;
  let studyDaysAccumulated = 0;
  let guard = 0;

  while (guard < 3650) {
    if (isStudyDay(cursor, studyDays)) {
      studyDaysAccumulated++;
      if (studyDaysAccumulated >= totalDaysRequired) {
        return { projectedDate: cursor, totalDaysRequired, totalMinutes };
      }
    }
    cursor = addDays(cursor, 1);
    guard++;
  }

  return { projectedDate: cursor, totalDaysRequired, totalMinutes };
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

/**
 * Robust Mathematical Scheduling & Time-Division Engine
 */
export function buildPlan(
  subjects: PlanSubject[],
  topics: PlanTopic[],
  st: PlanSettings
): PlanResult {
  const empty: PlanResult = {
    tasks: [],
    stats: {
      studyDays: 0,
      learnDays: 0,
      revisionDays: 0,
      bufferDays: 0,
      totalTopics: topics.length,
      scheduledTopics: 0,
      projectedFinish: null,
      dailyMinutes: Math.round(st.dailyHours * 60),
      requiredMinutes: 0,
      feasible: false,
      loadRatio: 0,
    },
  };

  if (!subjects.length) return empty;

  const dailyMinutes = Math.max(20, Math.round(st.dailyHours * 60));
  const styleMul = st.studyStyle === "theory" ? 1.08 : st.studyStyle === "practice" ? 0.92 : 1.0;

  // 1. Calculate exact required minutes for each topic
  type TopicWork = PlanTopic & { remainingMinutes: number; targetMinutes: number };
  const topicWorkList: TopicWork[] = topics.map((t) => {
    const baseMins = Math.max(15, Number(t.estMinutes) || 45);
    const masteryMul = t.mastery ? Math.max(0.4, 1 - t.mastery / 200) : 1.0;
    const targetMinutes = Math.max(15, Math.round(baseMins * styleMul * masteryMul));
    return {
      ...t,
      targetMinutes,
      remainingMinutes: targetMinutes,
    };
  });

  const totalRequiredMinutes = topicWorkList.reduce((acc, t) => acc + t.targetMinutes, 0);

  // 2. Strict mathematical calculation of required study days
  const studyDaysRequired = Math.max(1, Math.ceil(totalRequiredMinutes / dailyMinutes));

  // 3. Compute the exact projected finish date by stepping study days
  let projectedFinishDate = st.startDate;
  let studyDaysCount = 0;
  let pCursor = st.startDate;
  let pGuard = 0;

  while (pGuard < 3650) {
    if (isStudyDay(pCursor, st.studyDays)) {
      studyDaysCount++;
      if (studyDaysCount >= studyDaysRequired) {
        projectedFinishDate = pCursor;
        break;
      }
    }
    pCursor = addDays(pCursor, 1);
    pGuard++;
  }

  // 4. Construct the full date timeline covering both syllabus completion and exam window
  const endCalendarDate = diffDays(projectedFinishDate, st.examDate) > 0 ? st.examDate : projectedFinishDate;
  const allDates: string[] = [];
  let dCursor = st.startDate;
  let dGuard = 0;

  while (diffDays(dCursor, endCalendarDate) >= 0 && dGuard < 3650) {
    if (isStudyDay(dCursor, st.studyDays)) {
      allDates.push(dCursor);
    }
    dCursor = addDays(dCursor, 1);
    dGuard++;
  }

  if (!allDates.length) return empty;

  // 5. Build subject topic queues
  const weakId = st.weakSubject && st.weakSubject !== "none" ? Number(st.weakSubject) : -1;
  const subjWeight = new Map<number, number>();
  for (const s of subjects) {
    subjWeight.set(s.id, diffWeight(s.difficulty) * (s.id === weakId ? 1.3 : 1.0));
  }

  const queues = new Map<number, TopicWork[]>();
  for (const s of subjects) queues.set(s.id, []);
  for (const t of topicWorkList) {
    if (!queues.has(t.subjectId)) queues.set(t.subjectId, []);
    queues.get(t.subjectId)!.push(t);
  }

  const subjById = new Map(subjects.map((s) => [s.id, s]));
  const tasks: PlanTask[] = [];
  const learnedTopics: TopicWork[] = [];
  const scheduledTopicIds = new Set<number>();
  let lastLearnDate: string | null = null;
  let learnDaysUsed = 0;

  // Spaced review map: studyDayIndex -> { topic: TopicWork; pass: number }[]
  const reviewQueue = new Map<number, { topic: TopicWork; pass: number }[]>();
  const pushReview = (dayIdx: number, topic: TopicWork, pass: number) => {
    const arr = reviewQueue.get(dayIdx) || [];
    arr.push({ topic, pass });
    reviewQueue.set(dayIdx, arr);
  };

  // 6. Schedule day by day
  let dayIndex = 0;

  for (let d = 0; d < allDates.length; d++) {
    const date = allDates[d];
    dayIndex = d;
    let dayRemaining = dailyMinutes;
    let pos = 0;

    // Check if there are active subjects with remaining pending units
    const activeSubjects = subjects.filter((s) => (queues.get(s.id) || []).length > 0);

    if (activeSubjects.length > 0 && st.planMode !== "revision") {
      learnDaysUsed++;
      lastLearnDate = date;

      // A) Spaced Repetition (light review, max 20% of day)
      const reviewsDue = (reviewQueue.get(d) || []).slice(0, 2);
      for (const r of reviewsDue) {
        const revTime = Math.min(15, Math.floor(dayRemaining * 0.15));
        if (revTime < 10) break;
        dayRemaining -= revTime;
        tasks.push({
          date,
          subjectId: r.topic.subjectId,
          topicId: r.topic.id,
          kind: "revise",
          title: `Recall Checkpoint: ${r.topic.title}`,
          detail:
            r.pass === 1
              ? "24-48h Spaced Recall. Practice active recall without notes, then check knowledge gaps."
              : "1-Week Spaced Mastery. Solve 3-5 mixed application questions on this concept.",
          plannedMinutes: revTime,
          position: pos++,
        });
      }

      // B) Weekly Checkpoint (every 7th study day)
      const isWeeklyCheckDay = d > 0 && d % 7 === 6;
      if (isWeeklyCheckDay && dayRemaining >= 40) {
        const testMins = Math.min(45, Math.floor(dayRemaining * 0.35));
        dayRemaining -= testMins;
        tasks.push({
          date,
          subjectId: null,
          topicId: null,
          kind: "mock",
          title: `Weekly Milestone Checkpoint #${Math.floor(d / 7) + 1}`,
          detail: "Timed checkpoint on the lessons covered over the last 7 study days. Log any errors in your review notebook.",
          plannedMinutes: testMins,
          position: pos++,
        });
      }

      // C) Perfect Subject Time Division for New Lessons
      const numSubjectsToday = Math.max(1, Math.min(st.subjectsPerDay, activeSubjects.length));
      const sortedActive = [...activeSubjects].sort((a, b) => {
        const qa = (queues.get(a.id)?.length || 0) * (subjWeight.get(a.id) || 1);
        const qb = (queues.get(b.id)?.length || 0) * (subjWeight.get(b.id) || 1);
        return qb - qa;
      });

      const offset = d % sortedActive.length;
      const rotated = [...sortedActive.slice(offset), ...sortedActive.slice(0, offset)];
      const chosenForToday = rotated.slice(0, numSubjectsToday);

      // Divide remaining daily time equally and precisely among the chosen subjects
      const baseSlot = Math.floor(dayRemaining / chosenForToday.length);
      const remMinutes = dayRemaining % chosenForToday.length;

      for (let i = 0; i < chosenForToday.length; i++) {
        const s = chosenForToday[i];
        let subjectSlotBudget = baseSlot + (i < remMinutes ? 1 : 0);
        const q = queues.get(s.id)!;

        while (subjectSlotBudget > 0 && q.length > 0) {
          const currentTopic = q[0];
          const isSplit = currentTopic.remainingMinutes < currentTopic.targetMinutes;

          if (currentTopic.remainingMinutes <= subjectSlotBudget) {
            // Topic finishes in this slot
            const allocatedMins = currentTopic.remainingMinutes;
            subjectSlotBudget -= allocatedMins;
            dayRemaining -= allocatedMins;
            currentTopic.remainingMinutes = 0;
            q.shift(); // Remove finished topic

            scheduledTopicIds.add(currentTopic.id);
            learnedTopics.push(currentTopic);
            pushReview(d + 2, currentTopic, 1);
            pushReview(d + 7, currentTopic, 2);

            tasks.push({
              date,
              subjectId: s.id,
              topicId: currentTopic.id,
              kind: "learn",
              title: isSplit
                ? `${s.name}: ${currentTopic.title} (Part 2 — Completion)`
                : `${s.name}: ${currentTopic.title}`,
              detail: `${currentTopic.unit} • ${currentTopic.difficulty}. Core curriculum lesson. Review concept and complete practice problems.`,
              plannedMinutes: allocatedMins,
              position: pos++,
            });
          } else {
            // Topic is larger than slot budget: bifurcate into a clean study block
            const allocatedMins = subjectSlotBudget;
            currentTopic.remainingMinutes -= allocatedMins;
            dayRemaining -= allocatedMins;
            subjectSlotBudget = 0;

            tasks.push({
              date,
              subjectId: s.id,
              topicId: currentTopic.id,
              kind: "learn",
              title: `${s.name}: ${currentTopic.title} (Part 1 — Concept & Foundations)`,
              detail: `${currentTopic.unit} • ${currentTopic.difficulty}. Study block 1: Understand core principles and definitions.`,
              plannedMinutes: allocatedMins,
              position: pos++,
            });
          }
        }

        // If subject has no more topics but still has slot time, allocate subject practice
        if (subjectSlotBudget >= 15) {
          const pracMins = subjectSlotBudget;
          dayRemaining -= pracMins;
          subjectSlotBudget = 0;
          tasks.push({
            date,
            subjectId: s.id,
            topicId: null,
            kind: "practice",
            title: `Practice & Problem Drill: ${s.name}`,
            detail: "Targeted problem set to reinforce mastery of completed units.",
            plannedMinutes: pracMins,
            position: pos++,
          });
        }
      }

      // D) Fill any tiny leftover minute drift with targeted review
      if (dayRemaining >= 15 && learnedTopics.length > 0) {
        const revTopic = learnedTopics[d % learnedTopics.length];
        const sName = subjById.get(revTopic.subjectId)?.name || "Study";
        tasks.push({
          date,
          subjectId: revTopic.subjectId,
          topicId: revTopic.id,
          kind: "practice",
          title: `Reinforcement: ${sName} — ${revTopic.title}`,
          detail: "Active application drill to solidify retention.",
          plannedMinutes: dayRemaining,
          position: pos++,
        });
        dayRemaining = 0;
      }
    } else {
      // Post-Syllabus / Revision / Buffer Phase
      const isBufferDay = d >= allDates.length - Math.max(1, st.bufferDays);
      if (isBufferDay) {
        const isFinalDay = d === allDates.length - 1;
        tasks.push({
          date,
          subjectId: null,
          topicId: null,
          kind: "buffer",
          title: isFinalDay ? "Final Pre-Exam Rest & High-Yield Formulae Review" : `Buffer Catch-up Day ${d - (allDates.length - st.bufferDays) + 1}`,
          detail: isFinalDay
            ? "No new lessons. Review one-page recall sheets, rest well, and organise exam materials."
            : "Buffer slack day. Use this time to revisit any challenging concepts or resolve doubts.",
          plannedMinutes: Math.round(dailyMinutes * (isFinalDay ? 0.4 : 0.7)),
          position: pos++,
        });
      } else {
        // High-Yield Revision / Mock Phase
        const isMock = d % 3 === 0 || st.planMode === "mock";
        if (isMock && dayRemaining >= 60) {
          const mockMins = Math.min(90, Math.round(dailyMinutes * 0.6));
          dayRemaining -= mockMins;
          tasks.push({
            date,
            subjectId: null,
            topicId: null,
            kind: "mock",
            title: `Full Syllabus Simulation Mock #${Math.floor(d / 3) + 1}`,
            detail: "Full exam conditions. Time strictly and review every incorrect answer immediately after.",
            plannedMinutes: mockMins,
            position: pos++,
          });
        }

        // Cycle through all topics by lowest mastery / highest difficulty
        const sortedPool = [...topics].sort((a, b) => {
          const w = diffWeight(b.difficulty) - diffWeight(a.difficulty);
          if (w !== 0) return w;
          return (a.mastery || 0) - (b.mastery || 0);
        });

        let poolIdx = d * 2;
        while (dayRemaining >= 20 && sortedPool.length > 0) {
          const t = sortedPool[poolIdx % sortedPool.length];
          poolIdx++;
          const s = subjById.get(t.subjectId);
          const mins = Math.min(dayRemaining, Math.max(20, Math.round(t.estMinutes * 0.5)));
          dayRemaining -= mins;
          tasks.push({
            date,
            subjectId: t.subjectId,
            topicId: t.id,
            kind: "revise",
            title: `Deep Revision: ${s ? s.name + " — " : ""}${t.title}`,
            detail: "Active recall and previous-year question practice. Focus on speed and precision.",
            plannedMinutes: mins,
            position: pos++,
          });
        }
      }
    }
  }

  // 7. Calculate final statistical indicators
  const totalStudyDays = allDates.length;
  const scheduledCount = scheduledTopicIds.size || (topics.length ? topics.length : 0);
  const finishDate = lastLearnDate || projectedFinishDate;
  const availableMinutes = totalStudyDays * dailyMinutes;
  const loadRatio = availableMinutes > 0 ? totalRequiredMinutes / availableMinutes : 1.0;
  const feasible = diffDays(st.startDate, finishDate) <= diffDays(st.startDate, st.examDate);

  return {
    tasks,
    stats: {
      studyDays: totalStudyDays,
      learnDays: learnDaysUsed || studyDaysRequired,
      revisionDays: Math.max(0, totalStudyDays - (learnDaysUsed || studyDaysRequired) - st.bufferDays),
      bufferDays: st.bufferDays,
      totalTopics: topics.length,
      scheduledTopics: scheduledCount,
      projectedFinish: finishDate,
      dailyMinutes,
      requiredMinutes: Math.round(totalRequiredMinutes),
      feasible,
      loadRatio: Math.round(loadRatio * 100) / 100,
    },
  };
}
