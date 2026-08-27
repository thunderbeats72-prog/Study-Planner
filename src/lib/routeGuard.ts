import { NextResponse } from "next/server";
import { DatabaseUnavailableError } from "@/db";

/**
 * True when a request failed specifically because DATABASE_URL is not
 * configured — as opposed to a transient database outage or a genuine bug.
 */
export function isDatabaseConfigError(error: unknown): boolean {
  return error instanceof DatabaseUnavailableError;
}

type RouteHandler = (req: Request) => Promise<Response>;

/**
 * Wraps a route handler so an unconfigured database surfaces as the app-wide
 * friendly 503 (the contract documented in src/db/index.ts) instead of a raw
 * 500. Matches the behaviour the state / onboard / chat routes already
 * implement by hand. Any other error is rethrown untouched so real bugs keep
 * their stack traces.
 */
export function withDbGuard(handler: RouteHandler): RouteHandler {
  return async (req) => {
    try {
      return await handler(req);
    } catch (error) {
      if (isDatabaseConfigError(error)) {
        return NextResponse.json(
          {
            error: "The study planner database is not configured. Add DATABASE_URL (see .env.example) and redeploy.",
            code: "DATABASE_UNAVAILABLE",
          },
          { status: 503 },
        );
      }
      throw error;
    }
  };
}
