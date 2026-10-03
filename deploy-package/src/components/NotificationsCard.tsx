"use client";

import React, { useCallback, useEffect, useState } from "react";
import { api, ApiError, type AccountInfo } from "@/lib/client";
import { emailProblem } from "@/lib/emailRules";
import { IconBell, IconCheck, IconMail, IconRefresh, IconSend, IconWarn } from "./icons";
import { Select } from "./bits";
import { Reveal, Spot } from "@/lib/fx";
import { cn } from "@/lib/cn";

/* The shape /api/notifications/settings returns (server owns the defaults). */
type NotificationPrefsView = {
  digestEnabled: boolean;
  weeklyEmailEnabled: boolean;
  sendHour: number;
  timezone: string;
  quietStart: number;
  quietEnd: number;
  types: Record<
    "plan_ready" | "overdue" | "streak_risk" | "exam_milestone" | "session_summary" | "weekly_summary",
    boolean
  >;
};

type SettingsSnapshot = {
  prefs: NotificationPrefsView;
  account: AccountInfo;
  mail: { configured: boolean; status: string };
};

type TypeToggleMeta = {
  key: keyof NotificationPrefsView["types"];
  label: string;
  note: string;
};

const TYPE_TOGGLES: TypeToggleMeta[] = [
  { key: "plan_ready", label: "Today's plan is ready", note: "A morning note once lessons are planned for the day." },
  { key: "overdue", label: "Something is overdue", note: "Once a day, with a recover action that opens the backlog options." },
  { key: "streak_risk", label: "Streak at risk", note: "An evening warning when a live streak has nothing logged yet." },
  { key: "exam_milestone", label: "Exam countdown", note: "At 30, 14, 7, 3 and 1 days out - once each." },
  { key: "session_summary", label: "Session summary", note: "After clocking out: minutes logged and what comes next." },
  { key: "weekly_summary", label: "Weekly wrap (bell)", note: "Sunday evening recap of the week, in the bell." },
];

const TIMEZONE_OPTIONS: { value: string; label: string }[] = [
  { value: "Asia/Kolkata", label: "India (IST)" },
  { value: "Asia/Colombo", label: "Sri Lanka" },
  { value: "Asia/Dhaka", label: "Bangladesh" },
  { value: "Asia/Kathmandu", label: "Nepal" },
  { value: "Asia/Karachi", label: "Pakistan" },
  { value: "Asia/Dubai", label: "Gulf (GST)" },
  { value: "Asia/Singapore", label: "Singapore" },
  { value: "Asia/Jakarta", label: "Indonesia (WIB)" },
  { value: "Asia/Tokyo", label: "Japan" },
  { value: "Australia/Sydney", label: "Australia (Sydney)" },
  { value: "Pacific/Auckland", label: "New Zealand" },
  { value: "Europe/London", label: "UK" },
  { value: "Europe/Berlin", label: "Central Europe" },
  { value: "Africa/Nairobi", label: "East Africa" },
  { value: "America/New_York", label: "US Eastern" },
  { value: "America/Chicago", label: "US Central" },
  { value: "America/Denver", label: "US Mountain" },
  { value: "America/Los_Angeles", label: "US Pacific" },
  { value: "America/Sao_Paulo", label: "Brazil" },
];

/** "8" -> "8:00 AM" - digest send time in plain words. */
function hourLabel(hour: number): string {
  const normalized = ((Math.floor(hour) % 24) + 24) % 24;
  const suffix = normalized < 12 ? "AM" : "PM";
  const twelve = normalized % 12 === 0 ? 12 : normalized % 12;
  return `${twelve}:00 ${suffix}`;
}

const HOUR_OPTIONS = Array.from({ length: 24 }, (_, hour) => ({
  value: String(hour),
  label: hourLabel(hour),
}));

/** A switch that matches the design system's quiet, compact controls. */
function Toggle({
  checked,
  onChange,
  disabled,
  ariaLabel,
}: {
  checked: boolean;
  onChange: (value: boolean) => void;
  disabled?: boolean;
  ariaLabel: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={ariaLabel}
      className={cn("nt-switch", checked && "on")}
      disabled={disabled}
      onClick={() => onChange(!checked)}
    >
      <span className="nt-switch-knob" aria-hidden="true" />
    </button>
  );
}

/**
 * SETTINGS → NOTIFICATIONS
 * ────────────────────────
 * One card owns everything the app volunteers at you: the account email and
 * its verification, the daily digest (time, timezone, weekly opt-in), the
 * per-type bell toggles, quiet hours, the test button, and the master
 * "no email at all" switch. Every change saves on its own (PATCH), so there
 * is no half-saved state between the laptop and the phone.
 */
export default function NotificationsCard({
  account,
  onAccountChange,
}: {
  account?: AccountInfo | null;
  onAccountChange?: (account: AccountInfo) => void;
}) {
  const [snapshot, setSnapshot] = useState<SettingsSnapshot | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [emailDraft, setEmailDraft] = useState("");
  const [emailEditing, setEmailEditing] = useState(false);
  const [testState, setTestState] = useState<{
    sending: boolean;
    outcome?: { ok: boolean; dryRun: boolean; transport: string; error?: string };
    preview?: { subject: string; text: string };
  }>({ sending: false });

  const hasAccount = !!account?.hasAccount;

  const load = useCallback(async () => {
    try {
      const fresh = await api<SettingsSnapshot>("/api/notifications/settings", { timeoutMs: 12_000 });
      setSnapshot(fresh);
      onAccountChange?.(fresh.account);
      setError(null);
    } catch (loadError) {
      setError(loadError instanceof ApiError ? loadError.message : "Could not load notification settings.");
    }
  }, [onAccountChange]);

  useEffect(() => {
    if (!hasAccount) return;
    void Promise.resolve().then(load);
  }, [hasAccount, load]);

  const patch = useCallback(
    async (body: Record<string, unknown>, tag: string) => {
      setBusy(tag);
      setNote(null);
      setError(null);
      try {
        const fresh = await api<SettingsSnapshot>("/api/notifications/settings", {
          method: "PATCH",
          body: JSON.stringify(body),
          timeoutMs: 12_000,
        });
        setSnapshot(fresh);
        onAccountChange?.(fresh.account);
        return fresh;
      } catch (patchError) {
        setError(patchError instanceof ApiError ? patchError.message : "Could not save that change.");
        return null;
      } finally {
        setBusy(null);
      }
    },
    [onAccountChange],
  );

  const saveEmail = useCallback(async () => {
    const issue = emailProblem(emailDraft);
    if (issue) {
      setError(issue);
      return;
    }
    setBusy("email");
    setError(null);
    setNote(null);
    try {
      const res = await api<{ account: AccountInfo; mailSent: boolean; mailDryRun: boolean; mailError?: string }>(
        "/api/auth/email",
        { method: "POST", body: JSON.stringify({ email: emailDraft.trim() }), timeoutMs: 20_000 },
      );
      onAccountChange?.(res.account);
      setEmailEditing(false);
      setEmailDraft("");
      setNote(
        res.mailSent
          ? "Verification link sent. The digest stays off for this address until the link is clicked."
          : res.mailDryRun
            ? "Address saved. Mail is in dry-run mode here, so the verification link was written to the local outbox file instead of being sent."
            : `Address saved, but the verification mail failed${res.mailError ? `: ${res.mailError}` : ""}. Press Resend to try again.`,
      );
    } catch (saveError) {
      setError(saveError instanceof ApiError ? saveError.message : "Could not save the email address.");
    } finally {
      setBusy(null);
    }
  }, [emailDraft, onAccountChange]);

  const resendVerification = useCallback(async () => {
    setBusy("resend");
    setError(null);
    setNote(null);
    try {
      const res = await api<{ mailSent: boolean; mailDryRun: boolean; mailError?: string }>("/api/auth/email", {
        method: "POST",
        body: JSON.stringify({ resend: true }),
        timeoutMs: 20_000,
      });
      setNote(
        res.mailSent
          ? "A fresh verification link is on its way."
          : res.mailDryRun
            ? "Mail is in dry-run mode here - the link was written to the local outbox file."
            : `The verification mail failed${res.mailError ? `: ${res.mailError}` : ""}.`,
      );
    } catch (resendError) {
      setError(resendError instanceof ApiError ? resendError.message : "Could not resend the link.");
    } finally {
      setBusy(null);
    }
  }, []);

  const sendTest = useCallback(async () => {
    setTestState({ sending: true });
    setError(null);
    try {
      const res = await api<{
        ok: boolean;
        transport: string;
        dryRun: boolean;
        error?: string;
        preview: { subject: string; text: string };
      }>("/api/digest/test", { method: "POST", body: JSON.stringify({}), timeoutMs: 45_000 });
      setTestState({
        sending: false,
        outcome: { ok: res.ok, dryRun: res.dryRun, transport: res.transport, error: res.error },
        preview: { subject: res.preview.subject, text: res.preview.text },
      });
    } catch (testError) {
      setTestState({ sending: false });
      setError(testError instanceof ApiError ? testError.message : "Could not send the test digest.");
    }
  }, []);

  const prefs = snapshot?.prefs;
  const emailVerified = account?.emailVerified === true;
  const emailReady = !!account?.email && emailVerified && !account?.emailUnsubscribed;

  return (
    <Reveal delay={45}>
      {/* id lets the account card's "Add your email" link jump straight here. */}
      <div id="settings-notifications">
      <Spot className="glass-panel tilt-card section-card p-5 sm:p-6 space-y-4">
        <h3
          className="flex items-center gap-2 text-[length:var(--fs-md)] font-extrabold tracking-tight"
          style={{ color: "var(--text-main)" }}
        >
          <IconBell size={18} /> Notifications
        </h3>

        {!hasAccount ? (
          <p className="text-[length:var(--fs-sm)] font-medium leading-relaxed" style={{ color: "var(--text-dim)" }}>
            Notifications and the daily digest live with an account. Configure a database and sign
            in to switch them on.
          </p>
        ) : (
          <>
            {/* ── Email address: the address everything emails goes to ── */}
            <div className="nt-block">
              <div className="nt-head-row">
                <span className="lbl" style={{ marginBottom: 0 }}>
                  Email address
                </span>
                {account?.email && !emailEditing && (
                  <button
                    type="button"
                    className="notif-linkbtn"
                    onClick={() => {
                      setEmailDraft(account.email || "");
                      setEmailEditing(true);
                      setError(null);
                    }}
                  >
                    Change
                  </button>
                )}
              </div>
              {account?.email && !emailEditing ? (
                <div className="acct-row nt-email-row">
                  <span className="nt-mail-avatar" aria-hidden="true">
                    <IconMail size={14} />
                  </span>
                  <div className="min-w-0">
                    <div className="acct-name">{account.email}</div>
                    <div
                      className={cn("acct-meta", !emailVerified && "nt-warn-text")}
                    >
                      {emailVerified
                        ? "Verified. Digest mail can arrive here."
                        : "Not verified yet - check your inbox for the link, or resend it below."}
                    </div>
                  </div>
                </div>
              ) : (
                <form
                  className="nt-email-form"
                  onSubmit={(event) => {
                    event.preventDefault();
                    void saveEmail();
                  }}
                >
                  <input
                    className="input-field"
                    name="notifications-email"
                    type="email"
                    autoComplete="email"
                    inputMode="email"
                    autoCapitalize="none"
                    placeholder="you@example.com"
                    value={emailDraft}
                    onChange={(event) => setEmailDraft(event.target.value.slice(0, 165))}
                    disabled={busy === "email"}
                    aria-label="Email address"
                  />
                  <button type="submit" className="btn btn-primary btn-sm" disabled={busy === "email"}>
                    <IconCheck size={13} /> {busy === "email" ? "Saving…" : "Save"}
                  </button>
                  {emailEditing && (
                    <button
                      type="button"
                      className="btn btn-secondary btn-sm"
                      onClick={() => {
                        setEmailEditing(false);
                        setEmailDraft("");
                        setError(null);
                      }}
                      disabled={busy === "email"}
                    >
                      Cancel
                    </button>
                  )}
                </form>
              )}
              {!account?.email && !emailEditing && (
                <p className="nt-photo-hint">
                  Add your email to switch on the daily digest and sign in with it anywhere.
                </p>
              )}
              {account?.email && !emailVerified && !emailEditing && (
                <button
                  type="button"
                  className="btn btn-secondary btn-xs"
                  onClick={resendVerification}
                  disabled={busy === "resend"}
                >
                  <IconRefresh size={12} /> {busy === "resend" ? "Sending…" : "Resend verification link"}
                </button>
              )}
              {account?.emailUnsubscribed && (
                <div className="auth-banner nt-unsub-banner" role="status">
                  <IconWarn size={15} />
                  <span>
                    All email is switched off for this account.{" "}
                    <button
                      type="button"
                      className="auth-link"
                      onClick={() => void patch({ emailUnsubscribed: false }, "resubscribe")}
                    >
                      Turn email back on
                    </button>
                  </span>
                </div>
              )}
            </div>

            {/* ── Daily digest email ── */}
            <div className="nt-block">
              <div className="nt-row">
                <div className="nt-row-text">
                  <strong>Daily digest email</strong>
                  <span>
                    One message a day: your best next task, today&apos;s lessons, overdue
                    recovery, streak and exam countdown.
                  </span>
                  {!emailReady && (
                    <em className="nt-blocked-note">
                      {!account?.email
                        ? "Needs an email address first - add one above."
                        : !emailVerified
                          ? "Needs the address verified first - the digest only goes to verified inboxes."
                          : "Email is currently off for this account (resubscribe above)."}
                    </em>
                  )}
                </div>
                <Toggle
                  ariaLabel="Daily digest email"
                  checked={prefs?.digestEnabled === true && emailReady}
                  disabled={!emailReady || busy === "digest"}
                  onChange={(value) => void patch({ digestEnabled: value }, "digest")}
                />
              </div>
              {prefs && (
                <div className="nt-grid-2">
                  <div>
                    <label className="lbl" htmlFor="nt-sendhour">
                      Send time
                    </label>
                    <Select
                      id="nt-sendhour"
                      ariaLabel="Digest send time"
                      value={String(prefs.sendHour)}
                      onChange={(value) => void patch({ sendHour: Number(value) }, "sendHour")}
                      options={HOUR_OPTIONS}
                    />
                  </div>
                  <div>
                    <label className="lbl" htmlFor="nt-timezone">
                      Your timezone
                    </label>
                    <Select
                      id="nt-timezone"
                      ariaLabel="Your timezone"
                      value={prefs.timezone}
                      onChange={(value) => void patch({ timezone: value }, "timezone")}
                      options={
                        TIMEZONE_OPTIONS.some((option) => option.value === prefs.timezone)
                          ? TIMEZONE_OPTIONS
                          : [...TIMEZONE_OPTIONS, { value: prefs.timezone, label: prefs.timezone }]
                      }
                    />
                  </div>
                </div>
              )}
              <div className="nt-row">
                <div className="nt-row-text">
                  <strong>Weekly summary email</strong>
                  <span>Sunday evening: the week that was, separately opted in.</span>
                </div>
                <Toggle
                  ariaLabel="Weekly summary email"
                  checked={prefs?.weeklyEmailEnabled === true && emailReady}
                  disabled={!emailReady || busy === "weekly"}
                  onChange={(value) => void patch({ weeklyEmailEnabled: value }, "weekly")}
                />
              </div>
              <div className="nt-row nt-row-btns">
                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  onClick={() => void sendTest()}
                  disabled={testState.sending || !account?.email}
                >
                  <IconSend size={13} /> {testState.sending ? "Building the real digest…" : "Send me a test digest now"}
                </button>
              </div>
              {testState.outcome && (
                <div className={cn("nt-test-outcome", testState.outcome.ok ? "nt-ok" : "nt-bad")}>
                  {testState.outcome.ok
                    ? testState.outcome.dryRun
                      ? "No mail keys are configured, so the digest was written to the local outbox (.spp-mail-outbox) instead of being sent. Exactly what the real one will contain:"
                      : "Sent. Check your inbox - it is the same email the schedule sends tonight."
                    : `The test failed: ${testState.outcome.error || "unknown error"}`}
                </div>
              )}
              {testState.preview && (
                <details className="nt-preview">
                  <summary>{testState.preview.subject}</summary>
                  <pre>{testState.preview.text}</pre>
                </details>
              )}
            </div>

            {/* ── In-app alerts (the bell) ── */}
            <div className="nt-block">
              <span className="lbl">In the bell, on every device</span>
              {TYPE_TOGGLES.map((toggle) => (
                <div className="nt-row" key={toggle.key}>
                  <div className="nt-row-text">
                    <strong>{toggle.label}</strong>
                    <span>{toggle.note}</span>
                  </div>
                  <Toggle
                    ariaLabel={toggle.label}
                    checked={prefs?.types[toggle.key] === true}
                    disabled={!prefs || busy === toggle.key}
                    onChange={(value) => void patch({ types: { [toggle.key]: value } }, toggle.key)}
                  />
                </div>
              ))}
            </div>

            {/* ── Quiet hours + master email switch ── */}
            {prefs && (
              <div className="nt-block">
                <span className="lbl">Quiet hours - nothing pops up, no mail is sent</span>
                <div className="nt-grid-2">
                  <div>
                    <label className="lbl" htmlFor="nt-quietstart">
                      From
                    </label>
                    <Select
                      id="nt-quietstart"
                      ariaLabel="Quiet hours start"
                      value={String(prefs.quietStart)}
                      onChange={(value) => void patch({ quietStart: Number(value) }, "quietStart")}
                      options={HOUR_OPTIONS}
                    />
                  </div>
                  <div>
                    <label className="lbl" htmlFor="nt-quietend">
                      To
                    </label>
                    <Select
                      id="nt-quietend"
                      ariaLabel="Quiet hours end"
                      value={String(prefs.quietEnd)}
                      onChange={(value) => void patch({ quietEnd: Number(value) }, "quietEnd")}
                      options={HOUR_OPTIONS}
                    />
                  </div>
                </div>
                <p className="nt-photo-hint">
                  The bell still collects everything - quiet hours only mute the popping. Set both
                  ends to the same hour to switch quiet hours off.
                </p>
              </div>
            )}
            <div className="nt-block">
              <div className="nt-row">
                <div className="nt-row-text">
                  <strong>Unsubscribe from all email</strong>
                  <span>The digest, the weekly summary, everything. Reversible any time.</span>
                </div>
                <Toggle
                  ariaLabel="Unsubscribe from all email"
                  checked={account?.emailUnsubscribed === true}
                  disabled={busy === "unsub"}
                  onChange={(value) => void patch({ emailUnsubscribed: value }, "unsub")}
                />
              </div>
            </div>

            {snapshot?.mail.status && <p className="nt-photo-hint">{snapshot.mail.status}</p>}
            {note && <p className="nt-note">{note}</p>}
            {error && (
              <div className="auth-error">
                <IconWarn size={15} />
                <span>{error}</span>
              </div>
            )}
          </>
        )}
      </Spot>
      </div>
    </Reveal>
  );
}
