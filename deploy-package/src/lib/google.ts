/**
 * GOOGLE SIGN-IN - authorization code flow, by hand.
 * ────────────────────────────────────────────────────
 * The repo carries eight dependencies and stays that way, so instead of an
 * auth framework this module speaks to Google with plain fetch and verifies
 * the ID token with node:crypto:
 *
 *   1. /start  - build the consent URL with a random `state` (CSRF guard)
 *      and a PKCE S256 challenge; both secrets ride in short-lived HttpOnly
 *      cookies the callback compares against.
 *   2. /callback - refuse any answer whose `state` does not match, swap the
 *      code for tokens at the token endpoint (the PKCE verifier proves the
 *      exchange is completing the SAME request it started), then verify the
 *      returned id_token as a JWS against Google's published keys: RS256
 *      signature, issuer, audience, not-yet-valid and expiry.
 *   3. The email is trusted ONLY when the verified payload says
 *      email_verified: true - a claim we never copy from anywhere else.
 *
 * If GOOGLE_OAUTH_CLIENT_ID / _SECRET are not configured (a local machine,
 * a preview deployment) every entry point reports "not configured" and the
 * UI hides the button; nothing else in the app knows or cares.
 */

import { createHash, createPrivateKey, createPublicKey, createSign, createVerify, randomBytes } from "node:crypto";
import * as tls from "node:tls";

export type GoogleOAuthConfig = {
  clientId: string;
  clientSecret: string;
  /** The absolute URL Google sends the browser back to (…/api/auth/google/callback). */
  redirectUri: string;
};

/**
 * Resolve the OAuth config, or null when it is not (fully) configured.
 * A missing pair must look EXACTLY like "feature off" - never like a crash.
 */
export function googleOAuthConfig(req: Request): GoogleOAuthConfig | null {
  const clientId = (process.env.GOOGLE_OAUTH_CLIENT_ID || "").trim();
  const clientSecret = (process.env.GOOGLE_OAUTH_CLIENT_SECRET || "").trim();
  if (!clientId || !clientSecret) return null;
  return { clientId, clientSecret, redirectUri: `${originFrom(req)}/api/auth/google/callback` };
}

/** True when Google sign-in is available on this deployment. The sign-in
 *  screen reads this from /api/auth/me to decide whether the button exists. */
export function googleSignInEnabled(): boolean {
  return !!(process.env.GOOGLE_OAUTH_CLIENT_ID || "").trim() && !!(process.env.GOOGLE_OAUTH_CLIENT_SECRET || "").trim();
}

/**
 * The canonical origin of this deployment. APP_URL wins (it is what the
 * OAuth console entry must match on Vercel); behind a proxy the forwarded
 * headers hold the truth on previews and local tunnels.
 */
export function originFrom(req: Request): string {
  const configured = (process.env.APP_URL || "").trim().replace(/\/+$/, "");
  if (configured && /^https?:\/\//i.test(configured)) return configured;
  const host = req.headers.get("x-forwarded-host") || req.headers.get("host") || "localhost:3000";
  const proto = (req.headers.get("x-forwarded-proto") || (host.includes("localhost") ? "http" : "https")).split(",")[0].trim();
  return `${proto}://${host.split(",")[0].trim()}`;
}

/* ── state + PKCE ──────────────────────────────────────────────────── */

const GOOGLE_STATE_COOKIE = "spp_google_state";
const GOOGLE_PKCE_COOKIE = "spp_google_verifier";
/** Ten minutes is generous for a consent round trip and short enough to limit replay. */
const OAUTH_COOKIE_MAX_AGE = 10 * 60;

function newUrlSafeToken(bytes = 32): string {
  return randomBytes(bytes).toString("base64url");
}

/** base64url(SHA-256(verifier)) - the PKCE S256 challenge, per RFC 7636. */
export function pkceChallenge(verifier: string): string {
  return createHash("sha256").update(verifier).digest("base64url");
}

/** A short-lived OAuth cookie: HttpOnly, Lax (the callback arrives as a
 *  top-level GET, so Lax sends it), Secure everywhere Secure works. */
function oauthCookie(name: string, value: string, req: Request, maxAge = OAUTH_COOKIE_MAX_AGE): string {
  const proto = req.headers.get("x-forwarded-proto")?.split(",")[0]?.trim().toLowerCase();
  let secure = proto === "https";
  if (!proto) {
    try {
      secure = new URL(req.url).protocol === "https:";
    } catch {
      secure = process.env.NODE_ENV === "production";
    }
  }
  const parts = [
    `${name}=${encodeURIComponent(value)}`,
    "Path=/api/auth/google",
    "HttpOnly",
    "SameSite=Lax",
    `Max-Age=${Math.max(0, Math.floor(maxAge))}`,
  ];
  if (secure) parts.push("Secure");
  return parts.join("; ");
}

function readCookie(req: Request, name: string): string | null {
  const header = req.headers.get("cookie");
  if (!header) return null;
  for (const part of header.split(";")) {
    const index = part.indexOf("=");
    if (index < 0) continue;
    if (part.slice(0, index).trim() !== name) continue;
    const value = decodeURIComponent(part.slice(index + 1).trim());
    return value || null;
  }
  return null;
}

/** Everything /start needs: the consent URL plus the two cookies to plant. */
export function googleStart(req: Request, config: GoogleOAuthConfig): {
  url: string;
  cookies: string[];
} {
  const state = newUrlSafeToken(16);
  const verifier = newUrlSafeToken(32);
  const params = new URLSearchParams({
    client_id: config.clientId,
    redirect_uri: config.redirectUri,
    response_type: "code",
    scope: "openid email profile",
    state,
    code_challenge: pkceChallenge(verifier),
    code_challenge_method: "S256",
    // A fresh account chooser on every sign-in; silent auto-select has
    // stranded learners on the wrong Google profile before.
    prompt: "select_account",
  });
  return {
    url: `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`,
    cookies: [
      oauthCookie(GOOGLE_STATE_COOKIE, state, req),
      oauthCookie(GOOGLE_PKCE_COOKIE, verifier, req),
    ],
  };
}

/**
 * Compare the `state` Google echoed with the one this browser started.
 * Constant time is overkill here (the cookie is per-browser, not a long
 * lived secret), but the comparison must be EXACT - never prefix, never
 * case-folded. null on any mismatch or missing cookie.
 */
export function checkOAuthState(req: Request, echoed: string | null): string | null {
  const expected = readCookie(req, GOOGLE_STATE_COOKIE);
  if (!expected || !echoed || echoed !== expected) return null;
  return expected;
}

/** The PKCE verifier the callback must send with the code, or null. */
export function oauthVerifierFrom(req: Request): string | null {
  return readCookie(req, GOOGLE_PKCE_COOKIE);
}

/* ── token exchange ────────────────────────────────────────────────── */

type FetchLike = (input: string, init?: { method?: string; headers?: Record<string, string>; body?: string }) => Promise<{
  ok: boolean;
  status: number;
  json: () => Promise<unknown>;
}>;

/** Swap an authorization code for tokens. The verifier closes the PKCE loop. */
export async function exchangeCode(
  config: GoogleOAuthConfig,
  code: string,
  verifier: string,
  fetchImpl: FetchLike = fetch as unknown as FetchLike,
): Promise<{ idToken: string }> {
  const response = await fetchImpl("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: config.clientId,
      client_secret: config.clientSecret,
      code,
      code_verifier: verifier,
      grant_type: "authorization_code",
      redirect_uri: config.redirectUri,
    }).toString(),
  });
  const payload = (await response.json().catch(() => ({}))) as Record<string, unknown>;
  if (!response.ok || typeof payload.id_token !== "string") {
    const reason = typeof payload.error_description === "string" ? payload.error_description : `HTTP ${response.status}`;
    throw new Error(`Google token exchange failed: ${reason}`);
  }
  return { idToken: payload.id_token };
}

/* ── id_token verification ─────────────────────────────────────────── */

type Jwk = { kty: string; kid?: string; n: string; e: string; alg?: string };
type JwksGlobal = typeof globalThis & { __sppGoogleJwks?: { fetchedAt: number; keys: Jwk[] } };
const jwksGlobal = globalThis as JwksGlobal;
const JWKS_TTL_MS = 6 * 60 * 60 * 1000;

/** Google's published signing keys, cached per server process. */
async function googleSigningKeys(fetchImpl: FetchLike): Promise<Jwk[]> {
  const cached = jwksGlobal.__sppGoogleJwks;
  if (cached && Date.now() - cached.fetchedAt < JWKS_TTL_MS) return cached.keys;
  const response = await fetchImpl("https://www.googleapis.com/oauth2/v3/certs");
  if (!response.ok) throw new Error(`Could not fetch Google signing keys (HTTP ${response.status}).`);
  const body = (await response.json()) as { keys?: Jwk[] };
  const keys = Array.isArray(body.keys) ? body.keys.filter((key) => key.kty === "RSA" && key.n && key.e) : [];
  if (!keys.length) throw new Error("Google published no usable signing keys.");
  jwksGlobal.__sppGoogleJwks = { fetchedAt: Date.now(), keys };
  return keys;
}

/** Forget the cached keys (one retry after a kid rotation). */
function dropJwks(): void {
  jwksGlobal.__sppGoogleJwks = undefined;
}

function decodeJwtPart(part: string): Record<string, unknown> | null {
  try {
    const decoded = JSON.parse(Buffer.from(part, "base64url").toString("utf8")) as unknown;
    return decoded && typeof decoded === "object" ? (decoded as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

export type GoogleClaims = {
  sub: string;
  email: string;
  emailVerified: boolean;
  displayName?: string;
};

/**
 * The claims that decide a sign-in, checked STRICTLY against what Google
 * promises an OpenID id_token contains. Everything else in the payload is
 * ignored. Returns null instead of throwing: a bad token is an auth
 * failure, never a 500.
 */
export function claimsFromPayload(payload: Record<string, unknown>, clientId: string): GoogleClaims | null {
  const issuer = payload.iss;
  if (issuer !== "https://accounts.google.com" && issuer !== "accounts.google.com") return null;
  const audience = payload.aud;
  const audiences = Array.isArray(audience) ? audience : [audience];
  if (!audiences.includes(clientId)) return null;
  const now = Math.floor(Date.now() / 1000);
  const exp = typeof payload.exp === "number" ? payload.exp : 0;
  const iat = typeof payload.iat === "number" ? payload.iat : 0;
  // Two minutes of clock skew either way is plenty between two servers.
  if (!exp || exp + 120 <= now) return null;
  if (!iat || iat - 120 > now) return null;
  const sub = typeof payload.sub === "string" ? payload.sub : "";
  const email = typeof payload.email === "string" ? payload.email : "";
  if (!sub || !email) return null;
  const name = typeof payload.name === "string" ? payload.name : undefined;
  return { sub, email, emailVerified: payload.email_verified === true, displayName: name };
}

/**
 * Verify a compact JWS (id_token): header alg must be RS256, kid must name
 * one of Google's CURRENT keys, and the RSA signature must cover the exact
 * bytes received. One JWKS refresh retry survives a key rotation.
 */
export async function verifyIdToken(
  idToken: string,
  clientId: string,
  fetchImpl: FetchLike = fetch as unknown as FetchLike,
): Promise<GoogleClaims> {
  const parts = idToken.split(".");
  if (parts.length !== 3) throw new Error("The Google sign-in answer was not a valid token.");
  const header = decodeJwtPart(parts[0]);
  if (!header || header.alg !== "RS256" || typeof header.kid !== "string") {
    throw new Error("The Google sign-in token had an unexpected shape.");
  }
  const payload = decodeJwtPart(parts[1]);
  if (!payload) throw new Error("The Google sign-in token payload was unreadable.");

  const signedContent = Buffer.from(`${parts[0]}.${parts[1]}`);
  const signature = Buffer.from(parts[2], "base64url");

  let verified = false;
  for (let attempt = 0; attempt < 2 && !verified; attempt++) {
    const keys = await googleSigningKeys(fetchImpl);
    const key = keys.find((candidate) => candidate.kid === header.kid);
    if (!key) {
      if (attempt === 0) {
        dropJwks(); // maybe the key rotated minutes ago - refresh once
        continue;
      }
      throw new Error("Google signed with a key this deployment does not recognise.");
    }
    const publicKey = createPublicKey({ format: "jwk", key: { kty: "RSA", n: key.n, e: key.e } });
    const verifier = createVerify("RSA-SHA256");
    verifier.update(signedContent);
    verifier.end();
    verified = verifier.verify(publicKey, signature);
  }
  if (!verified) throw new Error("The Google sign-in token signature did not verify.");

  const claims = claimsFromPayload(payload, clientId);
  if (!claims) throw new Error("The Google sign-in token was not minted for this app.");
  return claims;
}

/* ── test helpers (used by the suite's fake-Google round trip) ─────── */

/** Sign a payload the way Google would - for the test suite's local JWKS. */
export function __testSignIdToken(
  payload: Record<string, unknown>,
  privateKeyJwk: JsonWebKey,
  kid: string,
): string {
  const headerPart = Buffer.from(JSON.stringify({ alg: "RS256", kid, typ: "JWT" })).toString("base64url");
  const payloadPart = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const signer = createSign("RSA-SHA256");
  signer.update(Buffer.from(`${headerPart}.${payloadPart}`));
  signer.end();
  const signature = signer
    .sign(createPrivateKey({
      format: "jwk",
      key: privateKeyJwk as unknown as import("crypto").JsonWebKey,
    }))
    .toString("base64url");
  return `${headerPart}.${payloadPart}.${signature}`;
}

/** Fingerprint of the certificate chain Google actually presents - available
 *  to operators debugging a token fetch, never silently required. */
export function googleCertsReachable(): Promise<string | null> {
  return new Promise((resolve) => {
    try {
      const socket = tls.connect(443, "www.googleapis.com", { servername: "www.googleapis.com", timeout: 4000 }, () => {
        const cert = socket.getPeerCertificate();
        socket.end();
        resolve(cert && cert.fingerprint256 ? cert.fingerprint256 : null);
      });
      socket.on("error", () => resolve(null));
      socket.on("timeout", () => {
        socket.destroy();
        resolve(null);
      });
    } catch {
      resolve(null);
    }
  });
}
