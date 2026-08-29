// ============================================================
//  STUDY PLANNER PRO — src/lib/quickAdd.ts
//  Validation for the lightweight Quick Add workflow. Pure and
//  shared between the component and the test suite so the rules
//  never drift apart. Mirrors the server-side limits in
//  POST /api/tasks (title ≤ 300, 1 ≤ minutes ≤ 720).
// ============================================================

import { isIsoDate } from "./validation";

export const QUICK_ADD_KINDS = ["learn", "revise", "practice", "mock"] as const;
export type QuickAddKind = (typeof QUICK_ADD_KINDS)[number];

export const QUICK_ADD_KIND_LABELS: Record<QuickAddKind, string> = {
  learn: "Lesson",
  revise: "Recall",
  practice: "Practice",
  mock: "Test",
};

export type QuickAddInput = {
  title: string;
  minutes: number;
  date: string;
  subjectId: number | null;
  kind: string;
};

export type QuickAddErrors = Partial<Record<"title" | "minutes" | "date" | "subjectId" | "kind", string>>;

export function validateQuickAdd(input: QuickAddInput): { valid: boolean; errors: QuickAddErrors } {
  const errors: QuickAddErrors = {};

  if (typeof input.title !== "string" || !input.title.trim()) {
    errors.title = "What do you need to study?";
  } else if (input.title.trim().length > 300) {
    errors.title = "Keep the title under 300 characters.";
  }

  const minutes = input.minutes;
  if (!Number.isInteger(minutes) || minutes < 1 || minutes > 720) {
    errors.minutes = "Pick a whole number of minutes between 1 and 720.";
  }

  if (!isIsoDate(input.date)) {
    errors.date = "Choose a valid date.";
  }

  if (input.subjectId != null && (!Number.isInteger(input.subjectId) || input.subjectId <= 0)) {
    errors.subjectId = "Choose a subject from the list.";
  }

  if (!(QUICK_ADD_KINDS as readonly string[]).includes(input.kind)) {
    errors.kind = "Pick a task type.";
  }

  return { valid: Object.keys(errors).length === 0, errors };
}

export type QuickAddPayload = {
  title: string;
  plannedMinutes: number;
  date: string;
  subjectId: number | null;
  kind: QuickAddKind;
};

/** Turns validated input into the payload POST /api/tasks expects. */
export function quickAddPayload(input: QuickAddInput): QuickAddPayload {
  return {
    title: input.title.trim(),
    plannedMinutes: input.minutes,
    date: input.date,
    subjectId: input.subjectId,
    kind: input.kind as QuickAddKind,
  };
}
