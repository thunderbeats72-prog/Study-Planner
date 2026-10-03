"use client";

import React, { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { api, ApiError, type AppState } from "@/lib/client";
import {
  normalizeUsername,
  passwordProblem,
  passwordStrength,
  usernameProblem,
  USERNAME_MAX,
} from "@/lib/authRules";
import {
  IconArrowRight, IconCheck, IconLock, IconLogo, IconShield, IconSpark, IconUser, IconWarn,
} from "./icons";
import { cn } from "@/lib/cn";

type Mode = "signin" | "signup";
type MeResponse = {
  authenticated: boolean;
  preview?: boolean;
  accountsReady?: boolean;
  error?: string;
};

/**
 * THE FRONT DOOR
 * ──────────────
 * One account, every device. This screen is the only thing standing between
 * a visitor and somebody's study plan, so it does three jobs carefully:
 *
 *   1. It explains, in one line, WHY an account exists — "your plan follows
 *      you to your phone" — because that is the whole feature.
 *   2. It validates with the EXACT rules the server uses (src/lib/authRules
 *      is shared), so the form never promises something the API rejects.
 *   3. It fails kindly: wrong password, taken username, database asleep and
 *      Caps Lock all read as plain sentences, next to the field at fault.
 */
export default function AuthGate({
  onAuthenticated,
  initialMode = "signup",
}: {
  onAuthenticated: (state: AppState, info: { mode: Mode; claimedExistingPlan: boolean }) => void;
  initialMode?: Mode;
}) {
  const [mode, setMode] = useState<Mode>(initialMode);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [touched, setTouched] = useState(false);
  const [capsLock, setCapsLock] = useState(false);
  const [service, setService] = useState<MeResponse | null>(null);
  const usernameRef = useRef<HTMLInputElement | null>(null);
  const fieldId = useId();

  const isSignup = mode === "signup";

  useEffect(() => {
    // Ask once whether accounts are even possible here (a preview without a
    // database cannot store them) so the form can say so up front instead of
    // failing on submit.
    let alive = true;
    api<MeResponse>("/api/auth/me", { timeoutMs: 12_000, skipAuthRedirect: true })
      .then((res) => {
        if (alive) setService(res);
      })
      .catch(() => {
        if (alive) setService({ authenticated: false, accountsReady: true });
      });
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    usernameRef.current?.focus();
  }, []);

  const strength = useMemo(
    () => passwordStrength(password, username),
    [password, username],
  );
  const usernameIssue = useMemo(
    () => (isSignup && username ? usernameProblem(username) : null),
    [isSignup, username],
  );
  const passwordIssue = useMemo(
    () => (isSignup && password ? passwordProblem(password, username) : null),
    [isSignup, password, username],
  );
  const confirmIssue = useMemo(
    () => (isSignup && confirm && confirm !== password ? "The two passwords do not match." : null),
    [isSignup, confirm, password],
  );

  const switchMode = useCallback((next: Mode) => {
    setMode(next);
    setError(null);
    setTouched(false);
    setConfirm("");
    // Keep whatever they typed — switching tabs should never retype a name.
  }, []);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (busy) return;
    setTouched(true);

    const name = normalizeUsername(username);
    if (isSignup) {
      const issue = usernameProblem(username) || passwordProblem(password, username);
      if (issue) {
        setError(issue);
        return;
      }
      if (password !== confirm) {
        setError("The two passwords do not match.");
        return;
      }
    } else if (!name || !password) {
      setError("Enter your username and password.");
      return;
    }

    setBusy(true);
    setError(null);
    try {
      const path = isSignup ? "/api/auth/signup" : "/api/auth/login";
      const body = isSignup
        ? { username: username.trim(), password, name: displayName.trim() || undefined }
        : { username: name, password };
      const state = await api<AppState>(path, {
        method: "POST",
        body: JSON.stringify(body),
        timeoutMs: 30_000,
        skipAuthRedirect: true,
      });
      onAuthenticated(state, {
        mode,
        claimedExistingPlan: state.claimedExistingPlan === true,
      });
    } catch (err) {
      setError(
        err instanceof ApiError && err.message
          ? err.message
          : "Could not reach the server. Check your connection and try again.",
      );
      setBusy(false);
    }
  };

  const offline = service && service.accountsReady === false;
  const preview = service?.preview === true;

  return (
    <div className="auth-screen">
      <div className="auth-aura" aria-hidden="true" />
      <div className="auth-shell">
        <header className="auth-brand">
          <div className="auth-brand-mark">
            <IconLogo size={22} />
          </div>
          <div>
            <div className="auth-brand-name">Study Planner Pro</div>
            <div className="auth-brand-tag">One account · every device</div>
          </div>
        </header>

        <div className="auth-card">
          <div className="auth-tabs" role="tablist" aria-label="Account">
            <button
              type="button"
              role="tab"
              aria-selected={isSignup}
              className={cn("auth-tab", isSignup && "active")}
              onClick={() => switchMode("signup")}
            >
              Create account
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={!isSignup}
              className={cn("auth-tab", !isSignup && "active")}
              onClick={() => switchMode("signin")}
            >
              Sign in
            </button>
          </div>

          <h1 className="auth-title">
            {isSignup ? "Create your credentials" : "Welcome back"}
          </h1>
          <p className="auth-lead">
            {isSignup
              ? "Pick a username and password. Your plan, logged hours, streak and tutor history live with the account — sign in on your phone and it is all there."
              : "Sign in and your plan appears exactly as you left it, on any device."}
          </p>

          {offline && (
            <div className="auth-banner auth-banner-warn" role="status">
              <IconWarn size={15} />
              <span>
                {service?.error ||
                  "Accounts are unavailable because the database could not be reached."}
              </span>
            </div>
          )}
          {!offline && preview && (
            <div className="auth-banner" role="status">
              <IconSpark size={15} />
              <span>
                This preview has no database, so sign-up is disabled here. Add DATABASE_URL to
                enable accounts.
              </span>
            </div>
          )}

          <form className="auth-form" onSubmit={submit} noValidate>
            <div className="auth-field">
              <label className="lbl" htmlFor={`${fieldId}-username`}>
                Username
              </label>
              <div className="auth-input-wrap">
                <span className="auth-input-icon" aria-hidden="true">
                  <IconUser size={15} />
                </span>
                <input
                  id={`${fieldId}-username`}
                  ref={usernameRef}
                  className="input-field auth-input"
                  value={username}
                  onChange={(e) => setUsername(e.target.value.slice(0, USERNAME_MAX + 6))}
                  autoComplete="username"
                  autoCapitalize="none"
                  autoCorrect="off"
                  spellCheck={false}
                  inputMode="text"
                  name="username"
                  placeholder={isSignup ? "e.g. arjun.r" : "Your username"}
                  aria-invalid={!!usernameIssue}
                  disabled={busy}
                />
              </div>
              {isSignup && (
                <p className={cn("auth-hint", usernameIssue && "auth-hint-bad")}>
                  {usernameIssue ||
                    "3–24 characters: letters, numbers, and . _ - — capitals don't matter when signing in."}
                </p>
              )}
            </div>

            {isSignup && (
              <div className="auth-field">
                <label className="lbl" htmlFor={`${fieldId}-name`}>
                  Your name <span className="auth-optional">optional</span>
                </label>
                <input
                  id={`${fieldId}-name`}
                  className="input-field"
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value.slice(0, 60))}
                  autoComplete="name"
                  placeholder="What the planner should call you"
                  disabled={busy}
                />
              </div>
            )}

            <div className="auth-field">
              <label className="lbl" htmlFor={`${fieldId}-password`}>
                Password
              </label>
              <div className="auth-input-wrap">
                <span className="auth-input-icon" aria-hidden="true">
                  <IconLock size={15} />
                </span>
                <input
                  id={`${fieldId}-password`}
                  className="input-field auth-input auth-input-password"
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  onKeyUp={(e) => setCapsLock(e.getModifierState?.("CapsLock") ?? false)}
                  onBlur={() => setCapsLock(false)}
                  autoComplete={isSignup ? "new-password" : "current-password"}
                  name="password"
                  placeholder={isSignup ? "At least 8 characters" : "Your password"}
                  aria-invalid={!!passwordIssue}
                  disabled={busy}
                />
                <button
                  type="button"
                  className="auth-reveal"
                  onClick={() => setShowPassword((v) => !v)}
                  aria-pressed={showPassword}
                  tabIndex={-1}
                >
                  {showPassword ? "Hide" : "Show"}
                </button>
              </div>
              {capsLock && (
                <p className="auth-hint auth-hint-bad">Caps Lock is on.</p>
              )}
              {isSignup && password && (
                <div className="auth-strength" aria-live="polite">
                  <div className="auth-meter" data-score={strength.score}>
                    {[0, 1, 2, 3].map((i) => (
                      <span key={i} className={cn("auth-meter-bar", i < strength.score && "on")} />
                    ))}
                  </div>
                  <span className="auth-strength-label">{strength.label}</span>
                </div>
              )}
              {isSignup && (
                <p className={cn("auth-hint", passwordIssue && touched && "auth-hint-bad")}>
                  {passwordIssue || strength.hint || "Strong password — good to go."}
                </p>
              )}
            </div>

            {isSignup && (
              <div className="auth-field">
                <label className="lbl" htmlFor={`${fieldId}-confirm`}>
                  Confirm password
                </label>
                <div className="auth-input-wrap">
                  <span className="auth-input-icon" aria-hidden="true">
                    <IconShield size={15} />
                  </span>
                  <input
                    id={`${fieldId}-confirm`}
                    className="input-field auth-input"
                    type={showPassword ? "text" : "password"}
                    value={confirm}
                    onChange={(e) => setConfirm(e.target.value)}
                    autoComplete="new-password"
                    name="confirm-password"
                    placeholder="Type it once more"
                    aria-invalid={!!confirmIssue}
                    disabled={busy}
                  />
                </div>
                {confirmIssue && <p className="auth-hint auth-hint-bad">{confirmIssue}</p>}
              </div>
            )}

            {error && (
              <div className="auth-error" role="alert">
                <IconWarn size={15} />
                <span>{error}</span>
              </div>
            )}

            <button
              type="submit"
              className="btn btn-primary auth-submit"
              disabled={busy || offline === true || preview}
            >
              {busy ? (
                <>
                  <span className="auth-spinner" aria-hidden="true" />
                  {isSignup ? "Creating your account…" : "Signing you in…"}
                </>
              ) : (
                <>
                  {isSignup ? "Create account" : "Sign in"}
                  <IconArrowRight size={15} />
                </>
              )}
            </button>
          </form>

          <div className="auth-switch">
            {isSignup ? (
              <>
                Already have credentials?{" "}
                <button type="button" className="auth-link" onClick={() => switchMode("signin")}>
                  Sign in instead
                </button>
              </>
            ) : (
              <>
                First time here?{" "}
                <button type="button" className="auth-link" onClick={() => switchMode("signup")}>
                  Create an account
                </button>
              </>
            )}
          </div>
        </div>

        <ul className="auth-points" aria-label="What an account gives you">
          <li>
            <span className="auth-point-icon">
              <IconCheck size={13} />
            </span>
            Same plan on laptop and phone — tasks, logged hours, streak and chat.
          </li>
          <li>
            <span className="auth-point-icon">
              <IconCheck size={13} />
            </span>
            Already built a plan on this device? Creating an account keeps it.
          </li>
          <li>
            <span className="auth-point-icon">
              <IconLock size={13} />
            </span>
            Passwords are stored as salted scrypt hashes — never in plain text.
          </li>
        </ul>
      </div>
    </div>
  );
}
