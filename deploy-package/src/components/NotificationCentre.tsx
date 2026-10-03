"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import { api } from "@/lib/client";
import { IconBell, IconCheck } from "./icons";
import { cn } from "@/lib/cn";

/* The page of the app a notification is about - the exact strings the
   shell's goPage understands. */
export type NotificationTarget = "dashboard" | "planner" | "focus" | "subjects" | "analytics" | "settings";

export type InboxItem = {
  id: number;
  kind: string;
  title: string;
  body: string;
  href: string;
  read: boolean;
  createdAt: string;
};

type Snapshot = {
  items: InboxItem[];
  unread: number;
  quietNow: boolean;
  prefs: {
    quietStart: number;
    quietEnd: number;
    timezone: string;
    types: Record<string, boolean>;
  };
};

const KIND_DOT: Record<string, string> = {
  plan_ready: "notif-dot--green",
  overdue: "notif-dot--orange",
  streak_risk: "notif-dot--orange",
  exam_milestone: "notif-dot--violet",
  session_summary: "notif-dot--blue",
  weekly_summary: "notif-dot--violet",
};

const KIND_VERB: Record<string, string> = {
  plan_ready: "Open today",
  overdue: "Recover",
  streak_risk: "Log time",
  exam_milestone: "See the plan",
  session_summary: "Keep going",
  weekly_summary: "See the week",
};

/** "2m", "3h", "yesterday" - enough precision for a notification list. */
function ageLabel(iso: string): string {
  const then = Date.parse(iso);
  if (!Number.isFinite(then)) return "";
  const minutes = Math.max(0, Math.round((Date.now() - then) / 60_000));
  if (minutes < 1) return "now";
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h`;
  if (hours < 48) return "yesterday";
  return `${Math.round(hours / 24)}d`;
}

const POLL_MS = 75_000;

/**
 * THE BELL
 * ────────
 * One panel, two doors (mobil top bar and the desk tracker; both mount this
 * same component). It owns the whole loop: poll, badge, open, read, and the
 * gentle toast for whatever arrived while the app was open. State lives on
 * the SERVER (each poll regenerates candidates with dedup keys), so this
 * component can stay dumb: render the list, mark read on click, and never
 * invent a notification of its own.
 *
 * Quiet hours mute only the toast and the sound: the bell badge still tells
 * the truth, because lying about what is unread would break sync between
 * the laptop and the phone.
 */
export default function NotificationCentre({
  onNavigate,
  onToast,
  size = 15,
}: {
  /** Navigate INSIDE the app (the pages the shell owns). */
  onNavigate: (target: NotificationTarget) => void;
  /** The shell's toast: reused here, never a second toast system. */
  onToast?: (message: string, tone: "success" | "info" | "error", action?: { label: string; run: () => void }) => void;
  size?: number;
}) {
  const [open, setOpen] = useState(false);
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [marking, setMarking] = useState(false);
  const seenIds = useRef<Set<number> | null>(null);
  const rootRef = useRef<HTMLSpanElement | null>(null);

  const toastNew = useCallback(
    (fresh: Snapshot, previousSeen: Set<number> | null) => {
      if (fresh.quietNow || !onToast) return;
      const arrivals = fresh.items.filter(
        (item) => !item.read && previousSeen !== null && !previousSeen.has(item.id),
      );
      const first = arrivals[0];
      if (!first) return;
      const href = (first.href || "dashboard") as NotificationTarget;
      onToast(
        arrivals.length === 1 ? first.title : `${first.title} (+${arrivals.length - 1} more)`,
        "info",
        { label: KIND_VERB[first.kind] || "Open", run: () => onNavigate(href) },
      );
    },
    [onToast, onNavigate],
  );

  const refresh = useCallback(async () => {
    try {
      const fresh = await api<Snapshot>("/api/notifications", { timeoutMs: 12_000 });
      const previousSeen = seenIds.current;
      seenIds.current = new Set(fresh.items.map((item) => item.id));
      toastNew(fresh, previousSeen);
      setSnapshot(fresh);
    } catch {
      /* a skipped poll is invisible; the badge stays at last known truth */
    }
  }, [toastNew]);

  useEffect(() => {
    // Defer one tick so the first paint is the bell alone, then the badge.
    void Promise.resolve().then(refresh);
  }, [refresh]);
  useEffect(() => {
    const timer = setInterval(refresh, POLL_MS);
    const onVisible = () => {
      if (document.visibilityState === "visible") void refresh();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [refresh]);

  useEffect(() => {
    if (!open) return;
    const close = (event: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    window.addEventListener("mousedown", close);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("mousedown", close);
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const markRead = useCallback(
    async (item: InboxItem) => {
      const href = (item.href || "dashboard") as NotificationTarget;
      setOpen(false);
      onNavigate(href);
      if (item.read) return;
      try {
        await api<Snapshot>("/api/notifications", {
          method: "POST",
          body: JSON.stringify({ id: item.id }),
          timeoutMs: 10_000,
        });
        setSnapshot((previous) =>
          previous
            ? {
                ...previous,
                unread: Math.max(0, previous.unread - 1),
                items: previous.items.map((entry) => (entry.id === item.id ? { ...entry, read: true } : entry)),
              }
            : previous,
        );
      } catch {
        /* the badge catches up on the next poll */
      }
    },
    [onNavigate],
  );

  const markAll = useCallback(async () => {
    if (marking) return;
    setMarking(true);
    try {
      await api<Snapshot>("/api/notifications", { method: "POST", body: JSON.stringify({}), timeoutMs: 10_000 });
      setSnapshot((previous) =>
        previous ? { ...previous, unread: 0, items: previous.items.map((entry) => ({ ...entry, read: true })) } : previous,
      );
    } catch {
      /* next poll reconciles */
    } finally {
      setMarking(false);
    }
  }, [marking]);

  const unread = snapshot?.unread ?? 0;
  const items = snapshot?.items ?? [];

  return (
    <span className="quick-popover-wrap" ref={rootRef}>
      <button
        type="button"
        className="icon-quick-btn mh-qbtn"
        aria-label={unread > 0 ? `Notifications, ${unread} unread` : "Notifications"}
        aria-expanded={open}
        onClick={(e) => {
          /* Bare synthetic invocations (tests without a React event) carry no
             stopPropagation - one optional chain keeps them honest. */
          e?.stopPropagation?.();
          setOpen((v) => !v);
        }}
      >
        <IconBell size={size} />
        {unread > 0 && (
          <span className="notif-badge" aria-hidden="true">
            {unread > 9 ? "9+" : unread}
          </span>
        )}
      </button>
      {open && (
        <div className="quick-popover notif-panel" role="menu" aria-label="Notification centre">
          <div className="notif-panel-head">
            <span className="quick-popover-title" style={{ padding: 0 }}>
              Notifications
            </span>
            {unread > 0 && (
              <button type="button" className="notif-markall" onClick={markAll} disabled={marking}>
                <IconCheck size={12} /> Mark all read
              </button>
            )}
          </div>
          {items.length === 0 && (
            <div className="notif-empty">
              Nothing yet. Plan reminders, streak warnings and session summaries land here - on
              every device you sign in on.
            </div>
          )}
          <ul className="notif-list">
            {items.map((item) => (
              <li key={item.id}>
                <button
                  type="button"
                  className={cn("notif-row notif-item", !item.read && "unread")}
                  onClick={() => void markRead(item)}
                >
                  <span className={cn("notif-dot", KIND_DOT[item.kind] || "notif-dot--blue")} aria-hidden="true" />
                  <span className="notif-item-text">
                    <strong>
                      {item.title}
                      {!item.read && <span className="notif-new">new</span>}
                    </strong>
                    {item.body && <span>{item.body}</span>}
                    <span className="notif-item-meta">
                      {ageLabel(item.createdAt)}
                      <em>{KIND_VERB[item.kind] || "Open"}</em>
                    </span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </span>
  );
}
