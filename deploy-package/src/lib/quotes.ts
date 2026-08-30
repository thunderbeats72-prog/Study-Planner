/**
 * Motivational quote engine for the dashboard.
 *
 * The quote card rotates on two axes:
 *   1. Time — every calendar day picks a fresh quote from the pool (hash of
 *      the date, advanced past anything already seen).
 *   2. Interaction — a click on "New thought" advances to the next unseen
 *      quote immediately.
 *
 * No repeat contract: each pick skips quotes recorded in the seen history.
 * When the whole pool has been seen, the history resets and the rotation
 * starts over — a quote never appears twice inside one cycle.
 *
 * The pool is a roster of real people — mystics, theologians, philosophers,
 * scientists and statesmen — so every card is attributed to a persona whose
 * voice gives the thought its weight (Osho, Martin Luther, Marcus Aurelius,
 * Rumi, Seneca, Vivekananda, …). `role` is the short persona descriptor shown
 * under the author's name.
 *
 * All rotation helpers are pure (no storage access) so the test suite can
 * verify the no-repeat contract without a DOM; `readSeen`/`writeSeen` are
 * the only localStorage touch points and are guarded for SSR safety.
 */

export type QuoteTone =
  | "presence"
  | "focus"
  | "begin"
  | "discipline"
  | "courage"
  | "patience"
  | "mastery";

export type Quote = {
  text: string;
  author: string;
  role: string;
  tone: QuoteTone;
};

/** Display tag shown in the pill on the quote card, per tone. */
export const TONE_TAG: Record<QuoteTone, string> = {
  presence: "Stay present",
  focus: "One thing at a time",
  begin: "Begin now",
  discipline: "Keep going",
  courage: "You've got this",
  patience: "Trust the process",
  mastery: "Master your craft",
};

export const QUOTES: Quote[] = [
  /* ── Osho — mystic & teacher ─────────────────────────────── */
  { text: "Creativity is the greatest rebellion in existence.", author: "Osho", role: "Mystic & Teacher", tone: "mastery" },
  { text: "Life begins where fear ends.", author: "Osho", role: "Mystic & Teacher", tone: "courage" },
  { text: "Drop the idea of becoming someone, because you are already a masterpiece.", author: "Osho", role: "Mystic & Teacher", tone: "presence" },
  { text: "The moment you accept yourself, you become beautiful.", author: "Osho", role: "Mystic & Teacher", tone: "presence" },
  { text: "Be — don't try to become.", author: "Osho", role: "Mystic & Teacher", tone: "begin" },

  /* ── Martin Luther — theologian & reformer ───────────────── */
  { text: "Pray, and let God worry.", author: "Martin Luther", role: "Theologian & Reformer", tone: "presence" },
  { text: "Whatever I have placed in God's hands, that I still possess.", author: "Martin Luther", role: "Theologian & Reformer", tone: "courage" },
  { text: "Even if I knew that tomorrow the world would go to pieces, I would still plant my apple tree.", author: "Martin Luther", role: "Theologian & Reformer", tone: "discipline" },

  /* ── Stoics ──────────────────────────────────────────────── */
  { text: "You have power over your mind — not outside events. Realize this, and you will find strength.", author: "Marcus Aurelius", role: "Roman Emperor · Stoic", tone: "mastery" },
  { text: "The impediment to action advances action. What stands in the way becomes the way.", author: "Marcus Aurelius", role: "Roman Emperor · Stoic", tone: "discipline" },
  { text: "Waste no more time arguing about what a good man should be. Be one.", author: "Marcus Aurelius", role: "Roman Emperor · Stoic", tone: "begin" },
  { text: "Luck is what happens when preparation meets opportunity.", author: "Seneca", role: "Stoic Philosopher", tone: "discipline" },
  { text: "We suffer more often in imagination than in reality.", author: "Seneca", role: "Stoic Philosopher", tone: "presence" },
  { text: "It is not that we have a short time to live, but that we waste a lot of it.", author: "Seneca", role: "Stoic Philosopher", tone: "focus" },
  { text: "No man is free who is not master of himself.", author: "Epictetus", role: "Stoic Philosopher", tone: "mastery" },
  { text: "It's not what happens to you, but how you react to it that matters.", author: "Epictetus", role: "Stoic Philosopher", tone: "discipline" },

  /* ── Eastern wisdom ──────────────────────────────────────── */
  { text: "The journey of a thousand miles begins with a single step.", author: "Lao Tzu", role: "Ancient Philosopher", tone: "begin" },
  { text: "When I let go of what I am, I become what I might be.", author: "Lao Tzu", role: "Ancient Philosopher", tone: "presence" },
  { text: "It does not matter how slowly you go as long as you do not stop.", author: "Confucius", role: "Philosopher", tone: "discipline" },
  { text: "Our greatest glory is not in never falling, but in rising every time we fall.", author: "Confucius", role: "Philosopher", tone: "courage" },
  { text: "The man who moves a mountain begins by carrying away small stones.", author: "Confucius", role: "Philosopher", tone: "begin" },
  { text: "What you seek is seeking you.", author: "Rumi", role: "Poet & Mystic", tone: "presence" },
  { text: "Raise your words, not your voice. It is rain that grows flowers, not thunder.", author: "Rumi", role: "Poet & Mystic", tone: "patience" },
  { text: "The mind is everything. What you think you become.", author: "Buddha", role: "Spiritual Teacher", tone: "mastery" },
  { text: "Drop by drop is the water pot filled. Likewise, the wise gather good little by little.", author: "Buddha", role: "Spiritual Teacher", tone: "patience" },
  { text: "Wherever you are is the entry point.", author: "Kabir", role: "Poet & Mystic", tone: "begin" },

  /* ── Philosophers ────────────────────────────────────────── */
  { text: "Beware the barrenness of a busy life.", author: "Socrates", role: "Philosopher", tone: "focus" },
  { text: "Pleasure in the job puts perfection in the work.", author: "Aristotle", role: "Philosopher", tone: "mastery" },
  { text: "Well begun is half done.", author: "Aristotle", role: "Philosopher", tone: "begin" },
  { text: "The beginning is the most important part of the work.", author: "Plato", role: "Philosopher", tone: "begin" },
  { text: "He who has a why to live can bear almost any how.", author: "Friedrich Nietzsche", role: "Philosopher", tone: "courage" },
  { text: "Life can only be understood backwards; but it must be lived forwards.", author: "Søren Kierkegaard", role: "Philosopher", tone: "patience" },
  { text: "Patience is the companion of wisdom.", author: "Saint Augustine", role: "Theologian", tone: "patience" },

  /* ── Scientists & inventors ──────────────────────────────── */
  { text: "It's not that I'm so smart, it's just that I stay with problems longer.", author: "Albert Einstein", role: "Physicist", tone: "focus" },
  { text: "Life is like riding a bicycle. To keep your balance, you must keep moving.", author: "Albert Einstein", role: "Physicist", tone: "courage" },
  { text: "Learning never exhausts the mind.", author: "Leonardo da Vinci", role: "Polymath", tone: "focus" },
  { text: "Energy and persistence conquer all things.", author: "Benjamin Franklin", role: "Founding Father & Scientist", tone: "discipline" },
  { text: "Our greatest weakness lies in giving up. The most certain way to succeed is always to try just one more time.", author: "Thomas Edison", role: "Inventor", tone: "discipline" },

  /* ── Teachers, leaders & writers ─────────────────────────── */
  { text: "Arise, awake, and stop not till the goal is reached.", author: "Swami Vivekananda", role: "Monk & Philosopher", tone: "discipline" },
  { text: "Take up one idea. Make that one idea your life — think of it, dream of it, live on that idea.", author: "Swami Vivekananda", role: "Monk & Philosopher", tone: "focus" },
  { text: "The future depends on what you do today.", author: "Mahatma Gandhi", role: "Spiritual & Political Leader", tone: "begin" },
  { text: "Strength does not come from physical capacity. It comes from an indomitable will.", author: "Mahatma Gandhi", role: "Spiritual & Political Leader", tone: "discipline" },
  { text: "It always seems impossible until it's done.", author: "Nelson Mandela", role: "Statesman", tone: "courage" },
  { text: "Success is not final, failure is not fatal: it is the courage to continue that counts.", author: "Winston Churchill", role: "Statesman", tone: "courage" },
  { text: "You can't cross the sea merely by standing and staring at the water.", author: "Rabindranath Tagore", role: "Poet", tone: "begin" },
  { text: "What lies behind us and what lies before us are tiny matters compared to what lies within us.", author: "Ralph Waldo Emerson", role: "Essayist & Poet", tone: "courage" },
  { text: "Go confidently in the direction of your dreams. Live the life you have imagined.", author: "Henry David Thoreau", role: "Writer & Philosopher", tone: "begin" },
  { text: "In the depth of winter, I finally learned that within me there lay an invincible summer.", author: "Albert Camus", role: "Writer & Philosopher", tone: "courage" },
  { text: "Today is victory over yourself of yesterday; tomorrow is your victory over lesser men.", author: "Miyamoto Musashi", role: "Swordsman & Strategist", tone: "mastery" },
  { text: "Victorious warriors win first and then go to war, while defeated warriors go to war first and then seek to win.", author: "Sun Tzu", role: "Military Strategist", tone: "focus" },
  { text: "Success is measured not by the position one has reached, but by the obstacles one has overcome.", author: "Booker T. Washington", role: "Educator", tone: "discipline" },
  { text: "Shoot for the moon. Even if you miss, you'll land among the stars.", author: "Norman Vincent Peale", role: "Minister & Author", tone: "begin" },
  { text: "You don't have to be great to start, but you have to start to be great.", author: "Zig Ziglar", role: "Motivational Author", tone: "begin" },
  { text: "Absorb what is useful, discard what is not, add what is uniquely your own.", author: "Bruce Lee", role: "Martial Artist & Philosopher", tone: "mastery" },
  { text: "The mystery of human existence lies not in just staying alive, but in finding something to live for.", author: "Fyodor Dostoevsky", role: "Novelist", tone: "mastery" },
];

/** Deterministic hash of a date key (same date → same number). */
export function hashDate(dateKey: string): number {
  let hash = 0;
  for (let i = 0; i < dateKey.length; i++) hash = (hash * 31 + dateKey.charCodeAt(i)) >>> 0;
  return hash;
}

/**
 * Pick the quote for a calendar day. Starts at the date's hash slot and
 * advances forward until it finds an unseen quote; the picked index is
 * appended to the history. If the whole pool has been seen, the history
 * resets and the rotation begins again.
 */
export function pickDaily(
  poolSize: number,
  dateKey: string,
  seen: readonly number[]
): { index: number; seen: number[] } {
  const start = hashDate(dateKey) % poolSize;
  const seenSet = new Set(seen);
  let index = start;
  let guard = 0;
  while (seenSet.has(index) && guard < poolSize) {
    index = (index + 1) % poolSize;
    guard++;
  }
  if (guard === poolSize) return { index: start, seen: [start] };
  return { index, seen: [...seen, index].slice(-poolSize) };
}

/**
 * Advance to the next unseen quote after `current` (the shuffle button).
 * Same no-repeat contract: skips seen indices, resets the history once the
 * pool is exhausted.
 */
export function pickNext(
  poolSize: number,
  current: number,
  seen: readonly number[]
): { index: number; seen: number[] } {
  const seenSet = new Set(seen);
  let index = (current + 1) % poolSize;
  let guard = 0;
  while (seenSet.has(index) && guard < poolSize) {
    index = (index + 1) % poolSize;
    guard++;
  }
  if (guard === poolSize) return { index, seen: [index] };
  return { index, seen: [...seen, index].slice(-poolSize) };
}

const STORAGE_KEY = "spp-quote-history";

/** Read the persisted seen-history. `null` when storage is unavailable. */
export function readSeen(): number[] | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((n): n is number => typeof n === "number" && Number.isInteger(n) && n >= 0);
  } catch {
    return null;
  }
}

/** Persist the seen-history. Never throws (quota / privacy modes). */
export function writeSeen(seen: readonly number[]): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(seen));
  } catch {
    /* noop — the rotation still works for the session without persistence */
  }
}
