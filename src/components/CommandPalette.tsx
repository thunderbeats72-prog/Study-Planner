"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";

export type Command = {
  id: string;
  label: string;
  hint?: string;
  group: string;
  keywords?: string;
  run: () => void;
};

/**
 * ⌘K / Ctrl-K command palette: fast keyboard-driven navigation and actions.
 * Fully self-contained; parent supplies the command list.
 */
export default function CommandPalette({ commands }: { commands: Command[] }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((v) => !v);
      } else if (e.key === "Escape") {
        setOpen(false);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    if (open) {
      setQuery("");
      setActive(0);
      setTimeout(() => inputRef.current?.focus(), 40);
    }
  }, [open]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return commands;
    return commands.filter((c) =>
      `${c.label} ${c.hint || ""} ${c.keywords || ""} ${c.group}`.toLowerCase().includes(q)
    );
  }, [query, commands]);

  useEffect(() => {
    if (active >= filtered.length) setActive(0);
  }, [filtered.length, active]);

  if (!open) return null;

  const groups = filtered.reduce<Record<string, Command[]>>((acc, c) => {
    (acc[c.group] ||= []).push(c);
    return acc;
  }, {});

  let flatIndex = -1;

  return (
    <div className="cmdk-overlay" onClick={() => setOpen(false)}>
      <div className="cmdk glass-panel" onClick={(e) => e.stopPropagation()}>
        <div className="cmdk-input-row">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="11" cy="11" r="7" /><path d="m21 21-4.3-4.3" />
          </svg>
          <input
            ref={inputRef}
            className="cmdk-input"
            placeholder="Type a command or search… (Esc to close)"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "ArrowDown") { e.preventDefault(); setActive((a) => Math.min(filtered.length - 1, a + 1)); }
              else if (e.key === "ArrowUp") { e.preventDefault(); setActive((a) => Math.max(0, a - 1)); }
              else if (e.key === "Enter") {
                e.preventDefault();
                const c = filtered[active];
                if (c) { c.run(); setOpen(false); }
              }
            }}
          />
          <span className="cmdk-kbd">ESC</span>
        </div>
        <div className="cmdk-list">
          {Object.entries(groups).map(([group, items]) => (
            <div key={group}>
              <div className="cmdk-group">{group}</div>
              {items.map((c) => {
                flatIndex++;
                const idx = flatIndex;
                return (
                  <button
                    key={c.id}
                    className={`cmdk-item${idx === active ? " active" : ""}`}
                    onMouseEnter={() => setActive(idx)}
                    onClick={() => { c.run(); setOpen(false); }}
                  >
                    <span className="cmdk-label">{c.label}</span>
                    {c.hint && <span className="cmdk-hint">{c.hint}</span>}
                  </button>
                );
              })}
            </div>
          ))}
          {!filtered.length && <div className="cmdk-empty">No matching commands.</div>}
        </div>
      </div>
    </div>
  );
}
