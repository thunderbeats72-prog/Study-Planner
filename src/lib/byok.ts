"use client";

/* Bring-your-own-key (BYOK) storage for the SHIGUN AI coach.
   ─────────────────────────────────────────────────────────────
   The cloud tutor needs an API key. Deployment env vars are the
   normal way to supply one, but a deployment that was never given a
   key used to be *permanently* stuck in local mode: every open-ended
   question fell through to the small on-device engine and the learner
   was told the assistant was unavailable, with no way to fix it
   without a redeploy.

   This module lets a learner (or the deployment owner) paste a key in
   Settings → AI coach. The key is kept in this browser's localStorage,
   attached to AI requests through the `x-ai-keys` header, and used by
   the server for that request only. The server never persists it and
   never logs it.
*/

export type ByokProviderId =
  | "cerebras"
  | "groq"
  | "mistral"
  | "sambanova"
  | "cohere"
  | "gemini"
  | "openrouter";

export const BYOK_PROVIDERS: {
  id: ByokProviderId;
  label: string;
  envVar: string;
  keyUrl: string;
  hint: string;
  /** Free tier available? Surfaced in the UI so the picker is honest. */
  free: boolean;
}[] = [
  {
    id: "gemini",
    label: "Google Gemini",
    envVar: "GEMINI_API_KEY",
    keyUrl: "https://aistudio.google.com/app/apikey",
    hint: "Easiest free key — one click with a Google account.",
    free: true,
  },
  {
    id: "groq",
    label: "Groq",
    envVar: "GROQ_API_KEY",
    keyUrl: "https://console.groq.com/keys",
    hint: "Very fast, generous free tier.",
    free: true,
  },
  {
    id: "cerebras",
    label: "Cerebras",
    envVar: "CEREBRAS_API_KEY",
    keyUrl: "https://cloud.cerebras.ai/",
    hint: "Fastest inference; primary provider when configured.",
    free: true,
  },
  {
    id: "openrouter",
    label: "OpenRouter",
    envVar: "OPENROUTER_API_KEY",
    keyUrl: "https://openrouter.ai/keys",
    hint: "One key, many vendors — the widest fallback.",
    free: false,
  },
  {
    id: "mistral",
    label: "Mistral",
    envVar: "MISTRAL_API_KEY",
    keyUrl: "https://console.mistral.ai/api-keys/",
    hint: "High-quality European models, small free tier.",
    free: false,
  },
  {
    id: "sambanova",
    label: "SambaNova",
    envVar: "SAMBANOVA_API_KEY",
    keyUrl: "https://cloud.sambanova.ai/apis",
    hint: "Fast open-weight inference, free tier.",
    free: true,
  },
  {
    id: "cohere",
    label: "Cohere",
    envVar: "COHERE_API_KEY",
    keyUrl: "https://dashboard.cohere.com/api-keys",
    hint: "Strong at retrieval-grounded tutoring.",
    free: false,
  },
];

const STORAGE_KEY = "spp.ai.keys.v1";
const CHANGED_EVENT = "spp-ai-keys-changed";

export type ByokKeys = Partial<Record<ByokProviderId, string>>;

function cleanKey(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const cleaned = value.replace(/^[\s"'`]+|[\s"'`]+$/g, "").replace(/[\r\n\t\0]/g, "").trim();
  return cleaned && cleaned.length <= 400 ? cleaned : null;
}

/** Read the stored keys. Returns `{}` when unavailable (SSR, private mode). */
export function getByokKeys(): ByokKeys {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object") return {};
    const out: ByokKeys = {};
    for (const provider of BYOK_PROVIDERS) {
      const key = cleanKey((parsed as Record<string, unknown>)[provider.id]);
      if (key) out[provider.id] = key;
    }
    return out;
  } catch {
    return {};
  }
}

export function setByokKey(id: ByokProviderId, key: string | null): ByokKeys {
  const next = { ...getByokKeys() };
  const cleaned = cleanKey(key);
  if (cleaned) next[id] = cleaned;
  else delete next[id];
  try {
    if (Object.keys(next).length) window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    else window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* storage blocked — the key stays in memory for this session only */
  }
  announce(next);
  return next;
}

export function clearByokKeys(): ByokKeys {
  try {
    window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* storage blocked */
  }
  announce({});
  return {};
}

/** Provider ids that have a key stored in this browser. */
export function byokProviderIds(keys: ByokKeys = getByokKeys()): ByokProviderId[] {
  return BYOK_PROVIDERS.filter((provider) => keys[provider.id]).map((provider) => provider.id);
}

/** Serialise for the `x-ai-keys` request header. Empty object → "{}". */
export function byokHeader(keys: ByokKeys = getByokKeys()): string {
  const out: Record<string, string> = {};
  for (const provider of BYOK_PROVIDERS) {
    const key = keys[provider.id];
    if (key) out[provider.id] = key;
  }
  return JSON.stringify(out);
}

function announce(keys: ByokKeys) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent<ByokKeys>(CHANGED_EVENT, { detail: keys }));
}

/** Subscribe to key changes (Settings saves, other tabs). */
export function onByokChange(handler: (keys: ByokKeys) => void): () => void {
  if (typeof window === "undefined") return () => {};
  const listener = (event: Event) => {
    handler((event as CustomEvent<ByokKeys>).detail ?? getByokKeys());
  };
  const storageListener = (event: StorageEvent) => {
    if (event.key === STORAGE_KEY) handler(getByokKeys());
  };
  window.addEventListener(CHANGED_EVENT, listener as EventListener);
  window.addEventListener("storage", storageListener);
  return () => {
    window.removeEventListener(CHANGED_EVENT, listener as EventListener);
    window.removeEventListener("storage", storageListener);
  };
}
