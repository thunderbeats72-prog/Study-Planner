"use client";

import React, { useMemo, useState } from "react";
import { fmtDate, parseDate, today, type AppState } from "@/lib/client";
import { IconChevron } from "./icons";

/** Compact monthly calendar for the Dashboard — dates with planned tasks
 *  carry a soft dot; today gets the accent ring. Read-only at a glance. */
export default function MiniCalendar({ state }: { state: AppState }) {
  const now = new Date();
  const [view, setView] = useState({ y: now.getFullYear(), m: now.getMonth() });
  const t = today();

  const byDate = useMemo(() => {
    const map = new Map<string, number>();
    for (const task of state.tasks) map.set(task.date, (map.get(task.date) || 0) + 1);
    return map;
  }, [state.tasks]);

  const first = new Date(view.y, view.m, 1);
  const pad = first.getDay();
  const days = new Date(view.y, view.m + 1, 0).getDate();
  const cells: (string | null)[] = [
    ...Array(pad).fill(null),
    ...Array.from({ length: days }, (_, i) => fmtDate(new Date(view.y, view.m, i + 1))),
  ];

  const shift = (delta: number) =>
    setView((v) => {
      const d = new Date(v.y, v.m + delta, 1);
      return { y: d.getFullYear(), m: d.getMonth() };
    });

  return (
    <div className="mini-cal">
      <div className="mini-cal-head">
        <span className="mini-cal-title">
          {first.toLocaleDateString(undefined, { month: "long", year: "numeric" })}
        </span>
        <div className="mini-cal-nav">
          <button type="button" className="mini-cal-btn" aria-label="Previous month" onClick={() => shift(-1)}>
            <span style={{ transform: "rotate(90deg)", display: "inline-flex" }}><IconChevron size={13} /></span>
          </button>
          <button type="button" className="mini-cal-btn" aria-label="Next month" onClick={() => shift(1)}>
            <span style={{ transform: "rotate(-90deg)", display: "inline-flex" }}><IconChevron size={13} /></span>
          </button>
        </div>
      </div>
      <div className="mini-cal-grid">
        {["S", "M", "T", "W", "T", "F", "S"].map((d, i) => (
          <div key={i} className="mini-cal-dow">{d}</div>
        ))}
        {cells.map((d, i) => {
          if (!d) return <div key={`e${i}`} className="mini-cal-cell empty" />;
          const count = byDate.get(d) || 0;
          const isToday = d === t;
          return (
            <div
              key={d}
              className={`mini-cal-cell${isToday ? " is-today" : ""}${count ? " has-tasks" : ""}`}
              title={count ? `${count} task${count > 1 ? "s" : ""} planned` : undefined}
            >
              <span className="mini-cal-num">{parseDate(d).getDate()}</span>
              {count > 0 && <span className="mini-cal-dot" />}
            </div>
          );
        })}
      </div>
    </div>
  );
}
