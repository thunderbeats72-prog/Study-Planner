export class ValidationError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(message: string, code = "INVALID_REQUEST", status = 400) {
    super(message);
    this.name = "ValidationError";
    this.code = code;
    this.status = status;
  }
}

export type JsonObject = Record<string, unknown>;

export async function readJsonObject(req: Request, maxBytes = 64_000): Promise<JsonObject> {
  const announced = Number(req.headers.get("content-length") || 0);
  if (Number.isFinite(announced) && announced > maxBytes) {
    throw new ValidationError("Request body is too large.", "BODY_TOO_LARGE", 413);
  }

  const raw = await req.text();
  if (new TextEncoder().encode(raw).length > maxBytes) {
    throw new ValidationError("Request body is too large.", "BODY_TOO_LARGE", 413);
  }
  if (!raw.trim()) throw new ValidationError("A JSON request body is required.");

  let value: unknown;
  try { value = JSON.parse(raw); }
  catch { throw new ValidationError("Invalid JSON request body.", "INVALID_JSON"); }
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new ValidationError("The request body must be a JSON object.");
  }
  return value as JsonObject;
}

export function textValue(
  value: unknown,
  field: string,
  options: { required?: boolean; min?: number; max?: number; fallback?: string } = {}
): string {
  const { required = false, min = required ? 1 : 0, max = 200, fallback = "" } = options;
  if (value == null) {
    if (required) throw new ValidationError(`${field} is required.`);
    return fallback;
  }
  if (typeof value !== "string") throw new ValidationError(`${field} must be text.`);
  const clean = value.replace(/\0/g, "").replace(/\s+/g, " ").trim();
  if (clean.length < min) throw new ValidationError(`${field} is required.`);
  if (clean.length > max) throw new ValidationError(`${field} must be ${max} characters or fewer.`);
  return clean;
}

export function finiteNumber(
  value: unknown,
  field: string,
  options: { min: number; max: number; fallback?: number; integer?: boolean }
): number {
  const parsed = typeof value === "number" ? value : typeof value === "string" && value.trim() ? Number(value) : NaN;
  if (!Number.isFinite(parsed)) {
    if (options.fallback !== undefined) return options.fallback;
    throw new ValidationError(`${field} must be a valid number.`);
  }
  if (options.integer && !Number.isInteger(parsed)) {
    throw new ValidationError(`${field} must be a whole number.`);
  }
  const normalized = parsed;
  if (normalized < options.min || normalized > options.max) {
    throw new ValidationError(`${field} must be between ${options.min} and ${options.max}.`);
  }
  return normalized;
}

export function positiveId(value: unknown, field = "id", optional = false): number | null {
  if ((value == null || value === "") && optional) return null;
  const id = finiteNumber(value, field, { min: 1, max: 2_147_483_647, integer: true });
  return id;
}

export function enumValue<const T extends readonly string[]>(
  value: unknown,
  field: string,
  allowed: T,
  fallback?: T[number]
): T[number] {
  if ((value == null || value === "") && fallback !== undefined) return fallback;
  if (typeof value !== "string" || !allowed.includes(value)) {
    throw new ValidationError(`${field} has an unsupported value.`);
  }
  return value as T[number];
}

export function booleanValue(value: unknown, field: string): boolean {
  if (typeof value !== "boolean") throw new ValidationError(`${field} must be true or false.`);
  return value;
}

const ISO_DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

/** Strict YYYY-MM-DD validation (Date.parse alone accepts dates such as Feb 31). */
export function isIsoDate(value: unknown): value is string {
  if (typeof value !== "string") return false;
  const match = ISO_DATE_RE.exec(value);
  if (!match) return false;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (year < 2000 || year > 2200 || month < 1 || month > 12 || day < 1 || day > 31) return false;
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

export function isoDate(value: unknown, field: string): string {
  if (!isIsoDate(value)) throw new ValidationError(`${field} must be a valid date in YYYY-MM-DD format.`);
  return value;
}

export function dateDistanceDays(a: string, b: string): number {
  return Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86_400_000);
}

export function assertDateWindow(start: string, end: string, maxDays = 3650): void {
  const days = dateDistanceDays(start, end);
  if (days < 1) throw new ValidationError("The target date must be after the start date.");
  if (days > maxDays) throw new ValidationError(`The study window cannot be longer than ${maxDays} days.`);
}

export function validationPayload(error: unknown): { error: string; code: string; status: number } {
  if (error instanceof ValidationError) {
    return { error: error.message, code: error.code, status: error.status };
  }
  return { error: "Unexpected server error.", code: "INTERNAL_ERROR", status: 500 };
}
