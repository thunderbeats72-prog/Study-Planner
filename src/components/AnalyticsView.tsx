"use client";

import React, { useEffect, useMemo, useState } from "react";
import PageHead from "./PageHead";
import StudyScene from "./StudyScene";
import Heatmap from "./Heatmap";
import { CountUp, IconTile, fmtHoursMin, type Tone } from "./StatFx";
import { api, addDays, today, type AppState } from "@/lib/client";
import {
  IconBolt, IconCalendar, IconChart, IconCheck, IconClock, IconFlame, IconSignal,
  IconSpark, IconSunrise, IconTarget,
} from "./icons";

/* /api/analytics payload — the same intelligence snapshot Overview used to
   render; Analytics is now its proper home. */
type Intel = {
  upNext?: { id: number; title: string; minutes: number; kind: string; subjectId: number | null } | null;
  focusSuggestion?: { startHour: number; endHour: number; isNow: boolean } | null;
  pace: { global: number; samples: number; bySubject: { id: number; name: string; color: string; pace: number }[] } | null;
  weekdays: number[] | null;
  peakHour: number | null;
  tomorrowRisk: number;
  readiness: { onTrack: boolean; loadPct: number; likelyDays: number; optimisticDays: number; pessimisticDays: number; samples: number; effectiveDailyMinutes?: number };
  effectiveDailyMinutes?: { minutes: number; activeDays: number; samples: number };
  memory: { strong: number; fading: number; atRisk: number; tracked: number };
};

/** Scalable building block: every Analytics section shares the same header
 *  grammar (icon tile · title · right-aligned meta) so new sections added
 *  later slot in visually without new CSS. */
function ASection({
  icon,
  tone = "accent",
  title,
  meta,
  children,
  className,
  delay,
}: {
  icon: React.ReactNode;
  tone?: Tone;
  title: string;
  meta?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  delay?: number;
}) {
  return (
    <section
      className={`glass-panel tilt-card section-card an-section rv${className ? ` ${className}` : ""}`}
      style={delay ? ({ "--rv-d": `${delay}ms` } as React.CSSProperties) : undefined}
    >
      <header className="an-section-head">
        <IconTile tone={tone} size={32} radius={10}>{icon}</IconTile>
        <h3 className="section-title an-section-title">{title}</h3>
        {meta && <span className="an-section-meta">{meta}</span>}
      </header>
      {children}
    </section>
  );
}

/** One stat tile in the top row. */
function ATile({
  icon, tone = "accent", label, value, sub, delay = 0,
}: {
  icon: React.ReactNode; tone?: Tone; label: string; value: React.ReactNode; sub?: React.ReactNode; delay?: number;
}) {
  return (
    <div className="glass-panel tilt-card an-tile rv" style={{ "--rv-d": `${delay}ms` } as React.CSSProperties}>
      <div className="an-tile-head">
        <span className="an-tile-label">{label}</span>
        <IconTile tone={tone} size={30} radius={9}>{icon}</IconTile>
      </div>
      <div className="mono an-tile-value">{value}</div>
      {sub && <div className="an-tile-sub">{sub}</div>}
    </div>
  );
}

export default function AnalyticsView({ state }: { state: AppState }) {
  const [intel, setIntel] = useState<Intel | null>(null);
  const [intelOpen, setIntelOpen] = useState(false);
  const t = today();

  /* Refresh the ML snapshot on the same cadence the Overview used: task
     progress changes, plus a 15-minute session bucket. */
  const taskProgressVersion = `${state.tasks.length}:${state.tasks.filter((x) => x.status === "done").length}:${state.tasks.filter((x) => x.status === "skipped").length}`;
  const loggedQuarterHour = Math.floor(state.sessions.reduce((a, s) => a + s.minutes, 0) / 15);
  useEffect(() => {
    let cancelled = false;
    api<Intel>("/api/analytics")
      .then((data) => { if (!cancelled) setIntel(data); })
      .catch(() => undefined);
    return () => { cancelled = true; };
  }, [taskProgressVersion, loggedQuarterHour]);

  /* ── Core aggregates (breaks never count as study time) ─────────────── */
  const study = useMemo(() => state.sessions.filter((s) => s.mode !== "break"), [state.sessions]);
  const perDay = useMemo(() => {
    const map = new Map<string, number>();
    for (const s of study) map.set(s.date, (map.get(s.date) || 0) + s.minutes);
    return map;
  }, [study]);

  const totalMin = study.reduce((a, s) => a + s.minutes, 0);
  const avgSession = study.length ? Math.round(totalMin / study.length) : 0;
  const active14 = Array.from({ length: 14 }, (_, i) => addDays(t, -i)).filter((d) => (perDay.get(d) || 0) > 0).length;
  const consistency = Math.round((active14 / 14) * 100);
  const goalMin = Math.max(30, (state.settings.dailyHours || 2) * 60);
  const goalHits14 = Array.from({ length: 14 }, (_, i) => addDays(t, -i)).filter((d) => (perDay.get(d) || 0) >= goalMin).length;

  /* today's week (goal line). `today()` is evaluated inside the memo — the
     compiler needs every manual dep to be stable across renders. */
  const week = useMemo(() => Array.from({ length: 7 }, (_, i) => {
    const d = addDays(today(), -(6 - i));
    return {
      date: d,
      label: new Date(d + "T00:00:00").toLocaleDateString(undefined, { weekday: "short" }).slice(0, 3),
      hours: Math.round(((perDay.get(d) || 0) / 60) * 100) / 100,
    };
  }), [perDay]);
  const maxH = Math.max(1, state.settings.dailyHours, ...week.map((w) => w.hours));

  /* 8-week trend (7-day buckets ending today) */
  const trend = useMemo(() => Array.from({ length: 8 }, (_, i) => {
    const end = addDays(today(), -(7 - i - 1) * 7);
    const start = addDays(end, -6);
    let mins = 0;
    for (const [d, m] of perDay) if (d >= start && d <= end) mins += m;
    return {
      key: start,
      label: new Date(start + "T00:00:00").toLocaleDateString(undefined, { month: "short", day: "numeric" }),
      hours: Math.round((mins / 60) * 10) / 10,
      current: i === 7,
    };
  }), [perDay]);
  const maxTrend = Math.max(1, ...trend.map((w) => w.hours));

  /* weekday rhythm — average minutes per weekday across history */
  const rhythm = useMemo(() => {
    const sums = new Array(7).fill(0) as number[];
    const counts = new Array(7).fill(0) as number[];
    for (const [d, m] of perDay) {
      const dow = new Date(d + "T00:00:00").getDay();
      sums[dow] += m;
      counts[dow] += 1;
    }
    const DOW = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
    const rows = DOW.map((label, i) => ({ label, avg: counts[i] ? Math.round(sums[i] / counts[i]) : 0 }));
    const order = [1, 2, 3, 4, 5, 6, 0];
    return { rows: order.map((i) => rows[i]), max: Math.max(30, ...rows.map((r) => r.avg)) };
  }, [perDay]);

  /* momentum — this week vs last */
  const momentum = useMemo(() => {
    const dayMs = 86400000;
    const now = new Date(today() + "T00:00:00").getTime();
    const inRange = (d: string, from: number, to: number) => {
      const x = new Date(d + "T00:00:00").getTime();
      return x >= from && x < to;
    };
    const thisMin = study.filter((s) => inRange(s.date, now - 6 * dayMs, now + dayMs)).reduce((a, s) => a + s.minutes, 0);
    const lastMin = study.filter((s) => inRange(s.date, now - 13 * dayMs, now - 6 * dayMs)).reduce((a, s) => a + s.minutes, 0);
    const delta = lastMin > 0 ? Math.round(((thisMin - lastMin) / lastMin) * 100) : null;
    const recent = state.tasks.filter((x) => inRange(x.date, now - 6 * dayMs, now + dayMs) && x.kind !== "buffer");
    const compRate = recent.length ? Math.round((recent.filter((x) => x.status === "done").length / recent.length) * 100) : null;
    return { thisHrs: Math.round((thisMin / 60) * 10) / 10, delta, compRate };
  }, [study, state.tasks]);

  const recent7 = state.tasks.filter((x) => x.date <= t && x.date >= addDays(t, -6) && x.kind !== "buffer");
  const comp7 = recent7.length ? Math.round((recent7.filter((x) => x.status === "done").length / recent7.length) * 100) : 0;
  const overdue = state.tasks.filter((x) => x.status === "pending" && x.date < t).length;

  /* subject-wise remaining load */
  const subjectLoad = useMemo(() => {
    const rows = state.subjects.map((sb) => {
      const pend = state.tasks.filter((x) => x.subjectId === sb.id && x.status === "pending");
      return { id: sb.id, name: sb.name, color: sb.color, count: pend.length, mins: pend.reduce((a, x) => a + x.plannedMinutes, 0) };
    }).sort((a, b) => b.mins - a.mins);
    return { rows, max: Math.max(30, ...rows.map((r) => r.mins)) };
  }, [state.subjects, state.tasks]);

  const ringC = 2 * Math.PI * 52;

  /* derived recommendations — calm, honest lines */
  const recos: { icon: React.ReactNode; tone: Tone; text: React.ReactNode }[] = [];
  if (intel?.peakHour != null) {
    const h = intel.peakHour;
    recos.push({
      icon: <IconSunrise size={15} />, tone: "orange",
      text: <>Your peak focus usually starts around <strong>{h % 12 || 12}{h < 12 ? "am" : "pm"}</strong> — put the hardest lesson of the day there.</>,
    });
  }
  if (intel && intel.tomorrowRisk >= 0.65) {
    recos.push({
      icon: <IconSignal size={15} />, tone: "rose",
      text: <>Tomorrow looks overloaded ({Math.round(intel.tomorrowRisk * 100)}% skip risk). Move one lesson forward or re-plan to keep the day winnable.</>,
    });
  } else if (intel && intel.tomorrowRisk > 0 && intel.tomorrowRisk < 0.4) {
    recos.push({
      icon: <IconCheck size={15} />, tone: "mint",
      text: <>Tomorrow&apos;s load looks comfortable — a good day to protect one deep-work block.</>,
    });
  }
  if (intel?.memory && intel.memory.atRisk > 0) {
    recos.push({
      icon: <IconSpark size={15} />, tone: "violet",
      text: <><strong>{intel.memory.atRisk} topic{intel.memory.atRisk > 1 ? "s" : ""}</strong> from earlier lessons are fading — a short recall pass today will hold them.</>,
    });
  }
  if (momentum.delta !== null && momentum.delta < -15) {
    recos.push({
      icon: <IconFlame size={15} />, tone: "blue",
      text: <>This week is {Math.abs(momentum.delta)}% below last week&apos;s volume. One 25-minute block today bends the trend back.</>,
    });
  }
  if (!recos.length) {
    recos.push({
      icon: <IconCheck size={15} />, tone: "mint",
      text: <>Everything reads healthy — keep the streak alive with today&apos;s plan.</>,
    });
  }

  return (
    <div className="fade-in analytics-view">
      <PageHead
        eyebrow="Analytics"
        title="Where the hours went"
        sub={`${active14} of the last 14 days active · ${fmtHoursMin(totalMin)} logged in total · every chart updates live as you study`}
        scene={<StudyScene variant="planner" />}
      />

      {/* ── Top-line stats ── */}
      <div className="an-tiles">
        <ATile icon={<IconClock size={15} />} tone="blue" label="Total study time" delay={0}
          value={<CountUp to={Math.round((totalMin / 60) * 10) / 10} suffix=" h" />}
          sub={`${study.length} sessions recorded`} />
        <ATile icon={<IconBolt size={15} />} tone="mint" label="Avg session" delay={50}
          value={<CountUp to={avgSession} suffix=" min" />}
          sub="focus-length across all sessions" />
        <ATile icon={<IconCheck size={15} />} tone="violet" label="Completion · 7d" delay={100}
          value={<CountUp to={comp7} suffix="%" />}
          sub={`${recent7.filter((x) => x.status === "done").length} of ${recent7.length} tasks done`} />
        <ATile icon={<IconSignal size={15} />} tone={overdue > 0 ? "rose" : "slate"} label="Overdue tasks" delay={150}
          value={<CountUp to={overdue} />}
          sub={overdue > 0 ? "carry them forward gently" : "nothing is behind"} />
        <ATile icon={<IconFlame size={15} />} tone="orange" label="Active days" delay={200}
          value={<><CountUp to={active14} /><span className="an-tile-den">/14</span></>}
          sub={`${goalHits14} hit the daily goal`} />
      </div>

      {/* ── Consistency + weekly volume ── */}
      <div className="an-grid an-grid--consistency">
        <ASection icon={<IconFlame size={15} />} tone="orange" title="Learning consistency"
          meta={`${consistency}% over 14 days`} delay={40}>
          <div className="an-consistency">
            <div className="an-ring" role="img" aria-label={`Consistency ${consistency}%`}>
              <svg viewBox="0 0 120 120" aria-hidden="true">
                <defs>
                  <linearGradient id="anRingGrad" x1="0" y1="0" x2="1" y2="1">
                    <stop offset="0" stopColor="var(--accent-light)" />
                    <stop offset="1" stopColor="var(--accent)" />
                  </linearGradient>
                </defs>
                <circle className="ring-track" cx="60" cy="60" r="52" fill="none" strokeWidth="10" />
                <circle className="ring-prog an-ring-prog" cx="60" cy="60" r="52" fill="none" strokeWidth="10"
                  stroke="url(#anRingGrad)"
                  strokeDasharray={ringC}
                  strokeDashoffset={ringC * (1 - consistency / 100)} />
              </svg>
              <div className="an-ring-center">
                <span className="mono an-ring-num"><CountUp to={consistency} suffix="%" /></span>
                <span className="an-ring-cap">consistency</span>
              </div>
            </div>
            <div className="an-consistency-facts">
              <div className="an-fact"><strong>{state.user.streak}d</strong><span>current streak</span></div>
              <div className="an-fact"><strong>{goalHits14}/14</strong><span>goal days hit</span></div>
              <div className="an-fact"><strong>{fmtHoursMin(goalMin)}</strong><span>daily goal</span></div>
            </div>
          </div>
        </ASection>

        <ASection icon={<IconChart size={15} />} tone="accent" title="This week's volume"
          meta={`${fmtHoursMin(week.reduce((a, w) => a + w.hours, 0) * 60)} so far`} delay={90}>
          <div className="wk2">
            <div className="wk2-plot">
              <div className="wk2-goal" style={{ bottom: `${Math.min(100, (state.settings.dailyHours / maxH) * 100)}%` }}>
                <span>goal {state.settings.dailyHours}h</span>
              </div>
              {week.map((w, i) => (
                <div key={w.date} className={`wk2-col${w.date === t ? " is-today" : ""}`}>
                  <div className="wk2-val">{w.hours || ""}</div>
                  <div className="wk2-bar"
                    title={`${w.label} · ${w.hours}h studied — goal ${state.settings.dailyHours}h`}
                    style={{ height: `${Math.max(3, (w.hours / maxH) * 100)}%`, "--i": i } as React.CSSProperties} />
                </div>
              ))}
            </div>
            <div className="wk2-labels">
              {week.map((w) => (
                <span key={w.date} className={`wk2-label${w.date === t ? " is-today" : ""}`}>{w.label}</span>
              ))}
            </div>
          </div>
        </ASection>
      </div>

      {/* ── Trends ── */}
      <div className="an-grid">
        <ASection icon={<IconCalendar size={15} />} tone="blue" title="8-week study trend"
          meta="hours per 7-day stretch" delay={60}>
          <div className="wk2">
            <div className="wk2-plot">
              {trend.map((w, i) => (
                <div key={w.key} className={`wk2-col${w.current ? " is-today" : ""}`}>
                  <div className="wk2-val">{w.hours || ""}</div>
                  <div className="wk2-bar"
                    title={`Week of ${w.label} · ${w.hours}h`}
                    style={{ height: `${Math.max(3, (w.hours / maxTrend) * 100)}%`, "--i": i } as React.CSSProperties} />
                </div>
              ))}
            </div>
            <div className="wk2-labels">
              {trend.map((w) => (
                <span key={w.key} className={`wk2-label wk2-label--sm${w.current ? " is-today" : ""}`}>{w.label}</span>
              ))}
            </div>
          </div>
        </ASection>

        <ASection icon={<IconSunrise size={15} />} tone="violet" title="Weekday rhythm"
          meta="average minutes per weekday" delay={110}>
          <div className="an-rhythm">
            {rhythm.rows.map((r) => (
              <div className="an-rhythm-row" key={r.label}
                title={`${r.label}s · avg ${r.avg} min`}>
                <span className="an-rhythm-label">{r.label}</span>
                <div className="an-rhythm-track">
                  <div className="an-rhythm-fill" style={{ width: `${Math.max(2, (r.avg / rhythm.max) * 100)}%` }} />
                </div>
                <span className="mono an-rhythm-val">{r.avg}m</span>
              </div>
            ))}
          </div>
          <p className="an-footnote">Plan the heavy lessons on your strongest weekday.</p>
        </ASection>
      </div>

      {/* ── Heatmap (deep history) ── */}
      <div className="rv">
        <Heatmap state={state} />
      </div>

      {/* ── Subject analytics ── */}
      <div className="an-grid">
        <ASection icon={<IconTarget size={15} />} tone="mint" title="Subject performance"
          meta="syllabus mastery per subject" delay={60}>
          <div className="mastery-list an-mastery">
            {state.context.subjects.map((s) => {
              const pct = s.total ? Math.round((s.done / s.total) * 100) : 0;
              const color = state.subjects.find((x) => x.id === s.id)?.color || "var(--accent)";
              return (
                <div key={s.id} className="mastery-row-wrap">
                  <div className="mastery-row">
                    <span className="mastery-name">{s.name}</span>
                    <span className="mastery-count">{s.done}/{s.total} · {pct}%</span>
                  </div>
                  <div className="bar-track"><div className="bar-fill" style={{ width: `${pct}%`, background: color }} /></div>
                </div>
              );
            })}
            {!state.context.subjects.length && <div className="panel-lead">No subjects yet.</div>}
          </div>
          {intel?.pace && intel.pace.samples >= 3 && (
            <div className="an-pace">
              <div className="an-pace-head">Your pace vs plan (learned from {intel.pace.samples} sessions)</div>
              {intel.pace.bySubject.slice(0, 6).map((p) => (
                <div key={p.id} className="intel-pace-row">
                  <span className="task-dot" style={{ background: p.color }} />
                  <span className="intel-pace-name">{p.name}</span>
                  <span className={`intel-pace-val ${p.pace > 1.15 ? "warn-text" : p.pace < 0.9 ? "ok-text" : ""}`}>
                    {p.pace > 1.05 ? `${Math.round((p.pace - 1) * 100)}% slower` : p.pace < 0.95 ? `${Math.round((1 - p.pace) * 100)}% faster` : "on pace"}
                  </span>
                </div>
              ))}
            </div>
          )}
        </ASection>

        <ASection icon={<IconSignal size={15} />} tone="rose" title="Where the remaining work is"
          meta={`${fmtHoursMin(subjectLoad.rows.reduce((a, r) => a + r.mins, 0))} pending across ${subjectLoad.rows.length} subjects`} delay={110}>
          <div className="an-load">
            {subjectLoad.rows.map((r) => (
              <div className="an-load-row" key={r.id} title={`${r.name} · ${r.count} pending tasks · ${fmtHoursMin(r.mins)}`}>
                <span className="an-load-name">{r.name}</span>
                <div className="an-load-track">
                  <div className="an-load-fill" style={{ width: `${(r.mins / subjectLoad.max) * 100}%`, background: r.color }} />
                </div>
                <span className="mono an-load-val">{fmtHoursMin(r.mins)}</span>
              </div>
            ))}
            {!subjectLoad.rows.length && <div className="panel-lead">No subjects yet.</div>}
          </div>
          <div className="an-momentum">
            <span className="momentum-pill">This week <strong>{momentum.thisHrs}h</strong>
              {momentum.delta !== null && (
                <span className={momentum.delta >= 0 ? "up" : "down"}>
                  {momentum.delta >= 0 ? "▲" : "▼"} {Math.abs(momentum.delta)}%
                </span>
              )}
            </span>
            {momentum.compRate !== null && <span className="momentum-pill">7-day completion <strong>{momentum.compRate}%</strong></span>}
            <span className="momentum-pill">Deep sessions avg <strong>{avgSession}m</strong></span>
          </div>
        </ASection>
      </div>

      {intel && intel.readiness && (
        <ASection icon={<IconSpark size={15} />} tone="violet" title="Intelligence"
          meta="learned from your own study data" delay={80}>
          <div className="intel-grid">
            <div className="intel-stat">
              <span className={`intel-dot ${intel.readiness.onTrack ? "ok" : "warn"}`} />
              <div>
                <div className="intel-label">Exam readiness</div>
                <div className="intel-value">
                  {intel.readiness.onTrack ? "On track" : "Behind pace"}
                  <span className="intel-sub"> · needs ~{intel.readiness.likelyDays}d of your remaining time</span>
                </div>
              </div>
            </div>
            <div className="intel-stat">
              <span className={`intel-dot ${intel.tomorrowRisk < 0.4 ? "ok" : intel.tomorrowRisk < 0.65 ? "mid" : "warn"}`} />
              <div>
                <div className="intel-label">Tomorrow&apos;s plan</div>
                <div className="intel-value">
                  {intel.tomorrowRisk < 0.4 ? "Looks doable" : intel.tomorrowRisk < 0.65 ? "A bit heavy" : "Overloaded"}
                  <span className="intel-sub"> · {Math.round(intel.tomorrowRisk * 100)}% skip risk</span>
                </div>
              </div>
            </div>
            {intel.memory.tracked > 0 && (
              <div className="intel-stat">
                <span className={`intel-dot ${intel.memory.atRisk === 0 ? "ok" : "mid"}`} />
                <div>
                  <div className="intel-label">Memory health</div>
                  <div className="intel-value">
                    {intel.memory.strong} strong
                    {intel.memory.fading > 0 && <span className="intel-sub"> · {intel.memory.fading} fading</span>}
                    {intel.memory.atRisk > 0 && <span className="intel-sub warn-text"> · {intel.memory.atRisk} need review</span>}
                  </div>
                </div>
              </div>
            )}
            {intel.peakHour !== null && (
              <div className="intel-stat">
                <span className="intel-dot ok" />
                <div>
                  <div className="intel-label">Your peak focus</div>
                  <div className="intel-value">{intel.peakHour % 12 || 12}{intel.peakHour < 12 ? "am" : "pm"}–{(intel.peakHour + 2) % 12 || 12}{(intel.peakHour + 2) < 12 || (intel.peakHour + 2) >= 24 ? "am" : "pm"}
                    <span className="intel-sub"> · schedule hard topics here</span>
                  </div>
                </div>
              </div>
            )}
          </div>

          <button className="more-options-toggle" onClick={() => setIntelOpen(!intelOpen)}>
            {intelOpen ? "Hide details" : "More details"}
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"
              style={{ transform: intelOpen ? "rotate(180deg)" : "none", transition: "transform .25s ease" }}>
              <path d="m6 9 6 6 6-6" />
            </svg>
          </button>

          {intelOpen && (
            <div className="intel-details slide-in">
              <div className="intel-label intel-subhead intel-subhead--first">Finish-time projection</div>
              <div className="panel-lead">
                Best case ~{intel.readiness.optimisticDays}d · likely ~{intel.readiness.likelyDays}d · worst case ~{intel.readiness.pessimisticDays}d of study time remaining.
                {intel.effectiveDailyMinutes && intel.effectiveDailyMinutes.activeDays >= 4 && (
                  <>
                    {" "}Based on the <strong>{Math.round(intel.effectiveDailyMinutes.minutes)} min/day</strong> you
                    actually study ({intel.effectiveDailyMinutes.activeDays} active days), not just your target.
                  </>
                )}
              </div>
            </div>
          )}
        </ASection>
      )}

      <ASection icon={<IconBolt size={15} />} tone="orange" title="Recommendations"
        meta="from your data, refreshed as you study" delay={100}>
        <div className="an-recos">
          {recos.slice(0, 4).map((r, i) => (
            <div className="an-reco" key={i}>
              <IconTile tone={r.tone} size={30} radius={9}>{r.icon}</IconTile>
              <p className="an-reco-text">{r.text}</p>
            </div>
          ))}
        </div>
      </ASection>
    </div>
  );
}
