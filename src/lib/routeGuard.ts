import { NextResponse } from "next/server";
import { DatabaseUnavailableError } from "@/db";
import { AuthError, AuthRequiredError } from "./auth";

/**
 * True when a request failed specifically because DATABASE_URL is not
 * configured — as opposed to a transient database outage or a genuine bug.
 */
export function isDatabaseConfigError(error: unknown): boolean {
  return error instanceof DatabaseUnavailableError;
}

/** The one 401 shape the whole app speaks. The client watches for this
 *  `code` and shows the sign-in screen instead of a red error toast. */
export function unauthorizedResponse(message = "Sign in to continue."): NextResponse {
  return NextResponse.json({ error: message, code: "AUTH_REQUIRED" }, { status: 401 });
}

/** The app-wide friendly 503 for "no database configured". */
export function databaseUnavailableResponse(): NextResponse {
  return NextResponse.json(
    {
      error: "The study planner database is not configured. Add DATABASE_URL (see .env.example) and redeploy.",
      code: "DATABASE_UNAVAILABLE",
    },
    { status: 503 },
  );
}

/**
 * Convert an auth/database failure into its documented JSON response, or
 * null when the error is something else (a real bug, which must keep its
 * stack trace). Routes that own their own try/catch call this first.
 */
export function guardResponse(error: unknown): NextResponse | null {
  if (error instanceof AuthRequiredError) return unauthorizedResponse(error.message);
  if (error instanceof AuthError) {
    return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
  }
  if (isDatabaseConfigError(error)) return databaseUnavailableResponse();
  return null;
}

type RouteHandler = (req: Request) => Promise<Response>;

/**
 * Wraps a route handler so that
 *   • a request without a signed-in account returns the app-wide 401, and
 *   • an unconfigured database surfaces as the app-wide friendly 503
 *     (the contract documented in src/db/index.ts) instead of a raw 500.
 * Any other error is rethrown untouched so real bugs keep their stack traces.
 */
export function withDbGuard(handler: RouteHandler): RouteHandler {
  return async (req) => {
    try {
      return await handler(req);
    } catch (error) {
      const guarded = guardResponse(error);
      if (guarded) return guarded;
      throw error;
    }
  };
}
