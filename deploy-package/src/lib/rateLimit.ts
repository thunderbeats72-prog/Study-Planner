import { createHash } from "node:crypto";

type Bucket = { count: number; resetAt: number };
type RateLimitGlobal = typeof globalThis & { __studyPlannerRateLimits?: Map<string, Bucket> };
const globalStore = globalThis as RateLimitGlobal;
const buckets = globalStore.__studyPlannerRateLimits ?? new Map<string, Bucket>();
globalStore.__studyPlannerRateLimits = buckets;

export type RateLimitResult = { allowed: boolean; retryAfterSeconds: number; remaining: number };

function fingerprint(req: Request): string {
  const forwarded = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  const userKey = req.headers.get("x-user-key")?.trim().slice(0, 160) || "missing";
  return createHash("sha256").update(`${forwarded}\0${userKey}`).digest("hex").slice(0, 24);
}

/**
 * Small per-instance limiter for expensive AI endpoints. Hosting-level rate
 * limits are still recommended, but this prevents accidental tap loops and
 * straightforward API-key abuse without introducing another service.
 */
export function checkRateLimit(
  req: Request,
  scope: string,
  limit: number,
  windowMs: number
): RateLimitResult {
  const now = Date.now();
  const key = `${scope}:${fingerprint(req)}`;
  const current = buckets.get(key);
  const bucket = !current || current.resetAt <= now
    ? { count: 0, resetAt: now + windowMs }
    : current;
  bucket.count++;
  buckets.set(key, bucket);

  // Bound memory on long-lived development/Node processes.
  if (buckets.size > 2000) {
    for (const [entryKey, entry] of buckets) {
      if (entry.resetAt <= now) buckets.delete(entryKey);
      if (buckets.size <= 1500) break;
    }
  }

  return {
    allowed: bucket.count <= limit,
    retryAfterSeconds: Math.max(1, Math.ceil((bucket.resetAt - now) / 1000)),
    remaining: Math.max(0, limit - bucket.count),
  };
}
