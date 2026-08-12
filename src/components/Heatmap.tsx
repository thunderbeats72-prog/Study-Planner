"use client";

import React, { useMemo } from "react";
import { addDays, today, type AppState } from "@/lib/client";

/** GitHub-style 12-week study consistency heatmap driven by logged sessions. */
export default function Heatmap({ state }: { state: AppState }) {
  const { weeks, max, totalMin, activeDays } = useMemo(() => {
    const t = today();
    const perDay = new Map<string, number>();
    for (const s of state.sessions) perDay.set(s.date, (perDay.get(s.date) || 0) + s.minutes);

    const WEEKS = 12;
    const end = new Date(t);
    // align to end of current week (Saturday)
    end.setDate(end.getDate() + (6 - end.getDay()));
    const start = new Date(end);
    start.setDate(start.getDate() - (WEEKS * 7 - 1));

    const cols: { date: string; min: number; future: boolean }[][] = [];
    let cur = new Date(start);
    let maxV = 0;
    let total = 0;
    let active = 0;
    for (let w = 0; w < WEEKS; w++) {
      const col: { date: string; min: number; future: boolean }[] = [];
      for (let d = 0; d < 7; d++) {
        const iso = `${cur.getFullYear()}-${String(cur.getMonth() + 1).padStart(2, "0")}-${String(cur.getDate()).padStart(2, "0")}`;
        const min = perDay.get(iso) || 0;
        maxV = Math.max(maxV, min);
        total += min;
        if (min > 0) active++;
        col.push({ date: iso, min, future: iso > t });
        cur.setDate(cur.getDate() + 1);
      }
      cols.push(col);
    }
    return { weeks: cols, max: maxV, totalMin: total, activeDays: active };
  }, [state.sessions]);

  const level = (min: number) => {
    if (min <= 0) return 0;
    const r = min / Math.max(1, max);
    if (r < 0.25) return 1;
    if (r < 0.5) return 2;
    if (r < 0.8) return 3;
    return 4;
  };

  const months: { label: string; span: number }[] = [];
  weeks.forEach((col) => {
    const m = new Date(col[0].date).toLocaleDateString(undefined, { month: "short" });
    const last = months[months.length - 1];
    if (last && last.label === m) last.span++;
    else months.push({ label: m, span: 1 });
  });

  return (
    <div className="glass-panel tilt-card dash-card">
      <div className="day-head" style={{ marginBottom: 10 }}>
        <h3 style={{ fontSize: ".88rem", fontWeight: 800, margin: 0 }}>Study Consistency</h3>
        <span className="day-meta">{activeDays} active days · {Math.round(totalMin / 60)}h in 12 weeks</span>
      </div>
      <div className="heatmap-scroll">
        <div className="heatmap">
          <div className="heatmap-months">
            {months.map((m, i) => (
              <span key={i} style={{ width: `calc(${m.span} * (13px + 3px))` }}>{m.span > 1 ? m.label : ""}</span>
            ))}
          </div>
          <div className="heatmap-grid">
            {weeks.map((col, ci) => (
              <div key={ci} className="heatmap-col">
                {col.map((cell) => (
                  <div
                    key={cell.date}
                    className={`heat-cell l${cell.future ? 0 : level(cell.min)}${cell.future ? " future" : ""}`}
                    title={`${cell.date}: ${cell.min ? `${Math.round(cell.min)} min` : "no study"}`}
                    style={{ animationDelay: `${ci * 18}ms` }}
                  />
                ))}
              </div>
            ))}
          </div>
        </div>
      </div>
      <div className="heatmap-legend">
        <span>Less</span>
        {[0, 1, 2, 3, 4].map((l) => <div key={l} className={`heat-cell l${l}`} />)}
        <span>More</span>
      </div>
    </div>
  );
}
