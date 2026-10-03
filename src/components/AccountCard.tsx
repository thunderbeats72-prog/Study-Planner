"use client";

import React, { useCallback, useEffect, useState } from "react";
import { api, ApiError, type AccountInfo, type DeviceInfo } from "@/lib/client";
import { passwordProblem, passwordStrength } from "@/lib/authRules";
import { IconCheck, IconLock, IconRefresh, IconShield, IconUser, IconWarn } from "./icons";
import { Reveal, Spot } from "@/lib/fx";
import { cn } from "@/lib/cn";

/** "2 minutes ago" / "yesterday" — enough for a device list, no library. */
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
 * accounts make — the same plan, wherever you sign in.
 */
export default function AccountCard({
  account,
  onSignOut,
}: {
  account?: AccountInfo | null;
  onSignOut: (everywhere?: boolean) => void | Promise<void>;
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
    try {
      const res = await api<{ signedOutDevices: number }>("/api/auth/password", {
        method: "POST",
        body: JSON.stringify({ currentPassword, newPassword }),
        timeoutMs: 20_000,
      });
      setPasswordDone(
        res.signedOutDevices > 0
          ? `Password changed. ${res.signedOutDevices} other device${res.signedOutDevices === 1 ? " was" : "s were"} signed out.`
          : "Password changed.",
      );
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

  const username = account?.username || "";
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

            <p
              className="text-[length:var(--fs-meta)] font-semibold leading-relaxed"
              style={{ color: "var(--text-dim)" }}
            >
              Sign in with these credentials on a phone, tablet or another laptop and you will see
              exactly this plan — every change lands on all of them.
            </p>

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
                  Changing your password signs out every other device.
                </p>
                <div className="flex gap-2">
                  <button type="submit" className="btn btn-primary btn-sm" disabled={passwordBusy}>
                    <IconCheck size={14} /> {passwordBusy ? "Saving…" : "Change password"}
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
                  <IconLock size={14} /> Change password
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
              Signing out never deletes anything — your plan waits for the next sign-in.
            </p>
          </>
        )}
      </Spot>
    </Reveal>
  );
}
