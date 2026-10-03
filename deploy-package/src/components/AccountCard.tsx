"use client";

import React, { useCallback, useEffect, useState } from "react";
import { api, ApiError, type AccountInfo, type DeviceInfo } from "@/lib/client";
import { passwordProblem, passwordStrength, usernameProblem } from "@/lib/authRules";
import { IconCheck, IconGoogle, IconLock, IconMail, IconRefresh, IconShield, IconUser, IconWarn } from "./icons";
import { Reveal, Spot } from "@/lib/fx";
import { cn } from "@/lib/cn";

/** "2 minutes ago" / "yesterday" - enough for a device list, no library. */
function sinceLabel(iso: string): string {
  const then = Date.parse(iso);
  if (!Number.isFinite(then)) return "";
  const minutes = Math.max(0, Math.round((Date.now() - then) / 60_000));
  if (minutes < 1) return "active now";
  if (minutes < 60) return `active ${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `active ${hours}h ago`;
  const days = Math.round(hours / 24);
  if (days === 1) return "active yesterday";
  if (days < 30) return `active ${days} days ago`;
  return `active ${Math.round(days / 30)} months ago`;
}

/**
 * SETTINGS → ACCOUNT & SYNC
 * ─────────────────────────
 * The management side of the credentials created at the front door: who is
 * signed in, which devices are currently open on this plan, how to change
 * the password, and how to leave. Everything here is about the ONE promise
 * accounts make - the same plan, wherever you sign in.
 */
export default function AccountCard({
  account,
  onSignOut,
  onAccountChange,
}: {
  account?: AccountInfo | null;
  onSignOut: (everywhere?: boolean) => void | Promise<void>;
  onAccountChange?: (account: AccountInfo) => void;
}) {
  const [devices, setDevices] = useState<DeviceInfo[] | null>(null);
  const [devicesBusy, setDevicesBusy] = useState(false);
  const [devicesError, setDevicesError] = useState<string | null>(null);
  const [changing, setChanging] = useState(false);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [passwordBusy, setPasswordBusy] = useState(false);
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [passwordDone, setPasswordDone] = useState<string | null>(null);
  const [renaming, setRenaming] = useState(false);
  const [usernameDraft, setUsernameDraft] = useState("");
  const [renameBusy, setRenameBusy] = useState(false);
  const [renameMessage, setRenameMessage] = useState<string | null>(null);

  const loadDevices = useCallback(async () => {
    setDevicesBusy(true);
    setDevicesError(null);
    try {
      const res = await api<{ devices: DeviceInfo[] }>("/api/auth/devices", { timeoutMs: 12_000 });
      setDevices(res.devices || []);
    } catch (error) {
      setDevicesError(
        error instanceof ApiError ? error.message : "Could not load your signed-in devices.",
      );
    } finally {
      setDevicesBusy(false);
    }
  }, []);

  // First paint: fetch the device list without touching state synchronously
  // (a cascading render on mount is exactly what the hooks rule guards).
  useEffect(() => {
    if (!account?.hasAccount) return;
    let alive = true;
    (async () => {
      try {
        const res = await api<{ devices: DeviceInfo[] }>("/api/auth/devices", { timeoutMs: 12_000 });
        if (alive) setDevices(res.devices || []);
      } catch (error) {
        if (alive) {
          setDevicesError(
            error instanceof ApiError ? error.message : "Could not load your signed-in devices.",
          );
        }
      }
    })();
    return () => {
      alive = false;
    };
  }, [account?.hasAccount]);

  const submitPassword = async (event: React.FormEvent) => {
    event.preventDefault();
    if (passwordBusy) return;
    const issue = passwordProblem(newPassword, account?.usernameKey || "");
    if (issue) {
      setPasswordError(issue);
      return;
    }
    if (newPassword !== confirmPassword) {
      setPasswordError("The two new passwords do not match.");
      return;
    }
    setPasswordBusy(true);
    setPasswordError(null);
    setPasswordDone(null);
    /* Accounts created with "Continue with Google" have no password yet: the
       first time is a set, not a change - no current-password check then. */
    const setting = account?.hasAccount === true && account.hasPassword === false;
    try {
      const res = await api<{ signedOutDevices: number }>("/api/auth/password", {
        method: "POST",
        body: JSON.stringify(setting
          ? { setPassword: true, newPassword }
          : { currentPassword, newPassword }),
        timeoutMs: 20_000,
      });
      if (setting) {
        setPasswordDone("Password set. You can now also sign in with it.");
        if (account && onAccountChange) onAccountChange({ ...account, hasPassword: true });
      } else {
        setPasswordDone(
          res.signedOutDevices > 0
            ? `Password changed. ${res.signedOutDevices} other device${res.signedOutDevices === 1 ? " was" : "s were"} signed out.`
            : "Password changed.",
        );
      }
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      setChanging(false);
      void loadDevices();
    } catch (error) {
      setPasswordError(
        error instanceof ApiError ? error.message : "Could not change the password.",
      );
    } finally {
      setPasswordBusy(false);
    }
  };

  const signOutOthers = async () => {
    setDevicesBusy(true);
    setDevicesError(null);
    try {
      const res = await api<{ signedOut: number; devices: DeviceInfo[] }>("/api/auth/devices", {
        method: "DELETE",
        timeoutMs: 12_000,
      });
      setDevices(res.devices || []);
      setPasswordDone(
        res.signedOut > 0
          ? `Signed out ${res.signedOut} other device${res.signedOut === 1 ? "" : "s"}.`
          : "No other devices were signed in.",
      );
    } catch (error) {
      setDevicesError(
        error instanceof ApiError ? error.message : "Could not sign out the other devices.",
      );
    } finally {
      setDevicesBusy(false);
    }
  };

  const renameAccount = async (event: React.FormEvent) => {
    event.preventDefault();
    if (renameBusy) return;
    const issue = usernameProblem(usernameDraft);
    if (issue) {
      setRenameMessage(issue);
      return;
    }
    setRenameBusy(true);
    setRenameMessage(null);
    try {
      const res = await api<{ ok: boolean; account: AccountInfo }>("/api/auth/username", {
        method: "POST",
        body: JSON.stringify({ username: usernameDraft }),
        timeoutMs: 15_000,
      });
      onAccountChange?.(res.account);
      setRenaming(false);
      setRenameMessage(null);
    } catch (error) {
      setRenameMessage(
        error instanceof ApiError ? error.message : "Could not change the username.",
      );
    } finally {
      setRenameBusy(false);
    }
  };

  const username = account?.username || "";
  const noPasswordYet = account?.hasAccount === true && account.hasPassword === false;
  const strength = newPassword ? passwordStrength(newPassword, account?.usernameKey || "") : null;

  return (
    <Reveal delay={30}>
      <Spot className="glass-panel tilt-card section-card p-5 sm:p-6 space-y-4">
        <h3
          className="flex items-center gap-2 text-[length:var(--fs-md)] font-extrabold tracking-tight"
          style={{ color: "var(--text-main)" }}
        >
          <IconShield size={18} /> Account &amp; Sync
        </h3>

        {!account?.hasAccount ? (
          <p
            className="text-[length:var(--fs-sm)] font-medium leading-relaxed"
            style={{ color: "var(--text-dim)" }}
          >
            This preview is running without accounts, so nothing is syncing. Configure a database
            to create credentials and share one plan across your devices.
          </p>
        ) : (
          <>
            <div className="acct-row">
              <span className="acct-avatar" aria-hidden="true">
                {(username[0] || "?").toUpperCase()}
              </span>
              <div className="min-w-0">
                <div className="acct-name">{username}</div>
                <div className="acct-meta">
                  Signed in · your plan, logs and streak live with this account
                </div>
              </div>
            </div>

            {/* ── Email: the verification target and where digests go ── */}
            <div className="acct-email">
              <IconMail size={15} />
              <div className="min-w-0 flex-1">
                {account.email ? (
                  <>
                    <span className="acct-email-address">{account.email}</span>
                    {account.emailVerified ? (
                      <span className="acct-chip acct-chip-ok">
                        <IconCheck size={11} /> Verified
                      </span>
                    ) : (
                      <span className="acct-chip acct-chip-warn">
                        <IconWarn size={11} /> Not verified yet
                      </span>
                    )}
                  </>
                ) : (
                  <span className="acct-email-address acct-email-none">
                    No email on this account yet
                  </span>
                )}
              </div>
              <a className="notif-linkbtn" href="#settings-notifications">
                {account.email ? "Change" : "Add your email"}
              </a>
            </div>
            {account.googleLinked && (
              <div className="acct-google">
                <IconGoogle size={14} /> Also signs in with the Google account above
              </div>
            )}
            {!account.emailVerified && (
              <p
                className="text-[length:var(--fs-meta)] font-semibold leading-relaxed"
                style={{ color: "var(--text-dim)" }}
              >
                {account.email
                  ? "Plan emails stay switched off until this address is verified - resend the link from the Notifications card below."
                  : "Add your email to get a reminder when the plan moves or an exam closes in. Username-only sign-in keeps working either way."}
              </p>
            )}

            <p
              className="text-[length:var(--fs-meta)] font-semibold leading-relaxed"
              style={{ color: "var(--text-dim)" }}
            >
              Sign in with these credentials on a phone, tablet or another laptop and you will see
              exactly this plan - every change lands on all of them.
            </p>

            {/* ── Username ── */}
            {renaming ? (
              <form className="acct-rename" onSubmit={renameAccount}>
                <input
                  aria-label="New username"
                  className="input-field"
                  type="text"
                  autoComplete="username"
                  placeholder="New username"
                  value={usernameDraft}
                  onChange={(e) => setUsernameDraft(e.target.value.slice(0, 32))}
                  disabled={renameBusy}
                  autoFocus
                />
                <button type="submit" className="btn btn-primary btn-sm" disabled={renameBusy}>
                  {renameBusy ? "Saving…" : "Save"}
                </button>
                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  disabled={renameBusy}
                  onClick={() => {
                    setRenaming(false);
                    setRenameMessage(null);
                  }}
                >
                  Cancel
                </button>
              </form>
            ) : (
              <div>
                <button
                  type="button"
                  className="notif-linkbtn"
                  onClick={() => {
                    setUsernameDraft(username);
                    setRenaming(true);
                    setRenameMessage(null);
                  }}
                >
                  Change username
                </button>
              </div>
            )}
            {renameMessage && (
              <p
                className="text-[length:var(--fs-meta)] font-bold"
                style={{ color: "var(--danger-accent)" }}
              >
                {renameMessage}
              </p>
            )}

            {/* ── Signed-in devices ── */}
            <div className="space-y-2">
              <div className="flex items-center justify-between gap-2">
                <span className="lbl" style={{ marginBottom: 0 }}>
                  Signed-in devices
                </span>
                <button
                  type="button"
                  className="btn btn-xs btn-secondary"
                  onClick={loadDevices}
                  disabled={devicesBusy}
                >
                  <IconRefresh size={12} /> Refresh
                </button>
              </div>
              {devicesError && (
                <p
                  className="text-[length:var(--fs-meta)] font-bold"
                  style={{ color: "var(--danger-accent, #b4232a)" }}
                >
                  {devicesError}
                </p>
              )}
              <ul className="acct-devices">
                {(devices || []).map((device) => (
                  <li key={device.id}>
                    <span className="truncate">{device.device}</span>
                    <span className={cn(device.current && "acct-current")}>
                      {device.current ? "this device" : sinceLabel(device.lastSeenAt)}
                    </span>
                  </li>
                ))}
                {devices && devices.length === 0 && !devicesBusy && (
                  <li>
                    <span>No other devices are signed in.</span>
                  </li>
                )}
                {!devices && devicesBusy && (
                  <li>
                    <span>Loading…</span>
                  </li>
                )}
              </ul>
            </div>

            {/* ── Password ── */}
            {changing ? (
              <form className="space-y-3" onSubmit={submitPassword}>
                {!noPasswordYet && (
                  <div>
                    <label className="lbl" htmlFor="acct-current">
                      Current password
                    </label>
                    <input
                      id="acct-current"
                      className="input-field"
                      type="password"
                      autoComplete="current-password"
                      value={currentPassword}
                      onChange={(e) => setCurrentPassword(e.target.value)}
                      disabled={passwordBusy}
                    />
                  </div>
                )}
                {noPasswordYet && (
                  <p
                    className="text-[length:var(--fs-meta)] font-semibold leading-relaxed"
                    style={{ color: "var(--text-dim)" }}
                  >
                    This account has no password yet - it was created with Google sign-in.
                  </p>
                )}
                <div>
                  <label className="lbl" htmlFor="acct-new">
                    New password
                  </label>
                  <input
                    id="acct-new"
                    className="input-field"
                    type="password"
                    autoComplete="new-password"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    disabled={passwordBusy}
                  />
                  {strength && (
                    <div className="auth-strength mt-2">
                      <div className="auth-meter" data-score={strength.score}>
                        {[0, 1, 2, 3].map((i) => (
                          <span
                            key={i}
                            className={cn("auth-meter-bar", i < strength.score && "on")}
                          />
                        ))}
                      </div>
                      <span className="auth-strength-label">{strength.label}</span>
                    </div>
                  )}
                </div>
                <div>
                  <label className="lbl" htmlFor="acct-confirm">
                    Confirm new password
                  </label>
                  <input
                    id="acct-confirm"
                    className="input-field"
                    type="password"
                    autoComplete="new-password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    disabled={passwordBusy}
                  />
                </div>
                {passwordError && (
                  <div className="auth-error">
                    <IconWarn size={15} />
                    <span>{passwordError}</span>
                  </div>
                )}
                <p
                  className="text-[length:var(--fs-meta)] font-semibold"
                  style={{ color: "var(--text-dim)" }}
                >
                  {noPasswordYet
                    ? "After this, Google sign-in and password sign-in both work on this account."
                    : "Changing your password signs out every other device."}
                </p>
                <div className="flex gap-2">
                  <button type="submit" className="btn btn-primary btn-sm" disabled={passwordBusy}>
                    <IconCheck size={14} />{" "}
                    {passwordBusy ? "Saving…" : noPasswordYet ? "Set password" : "Change password"}
                  </button>
                  <button
                    type="button"
                    className="btn btn-secondary btn-sm"
                    onClick={() => {
                      setChanging(false);
                      setPasswordError(null);
                    }}
                    disabled={passwordBusy}
                  >
                    Cancel
                  </button>
                </div>
              </form>
            ) : (
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  onClick={() => {
                    setChanging(true);
                    setPasswordDone(null);
                  }}
                >
                  <IconLock size={14} /> {noPasswordYet ? "Set a password" : "Change password"}
                </button>
                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  onClick={signOutOthers}
                  disabled={devicesBusy}
                >
                  <IconShield size={14} /> Sign out other devices
                </button>
                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  onClick={() => onSignOut(false)}
                >
                  <IconUser size={14} /> Sign out
                </button>
              </div>
            )}

            {passwordDone && (
              <p
                className="text-[length:var(--fs-meta)] font-bold"
                style={{ color: "var(--success-accent)" }}
              >
                {passwordDone}
              </p>
            )}

            <p
              className="text-[length:var(--fs-meta)] font-semibold leading-relaxed"
              style={{ color: "var(--text-dim)" }}
            >
              Signing out never deletes anything - your plan waits for the next sign-in.
            </p>
          </>
        )}
      </Spot>
    </Reveal>
  );
}
