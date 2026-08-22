import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  throw new Error("DATABASE_URL is required");
}

const globalForDb = globalThis as typeof globalThis & {
  __arenaNextJsPostgresqlPool?: Pool;
  __arenaNextJsPostgresqlPoolErrorListener?: boolean;
};

const requestedPoolSize = Number(process.env.DATABASE_POOL_MAX || 5);
const maxPoolSize = Number.isFinite(requestedPoolSize)
  ? Math.max(1, Math.min(20, Math.round(requestedPoolSize)))
  : 5;

export const pool =
  globalForDb.__arenaNextJsPostgresqlPool ??
  new Pool({
    connectionString: databaseUrl,
    max: maxPoolSize,
    idleTimeoutMillis: 10_000,
    connectionTimeoutMillis: 8_000,
    allowExitOnIdle: process.env.NODE_ENV !== "production",
  });

// An idle client error without a listener is an uncaught EventEmitter error
// and can terminate the whole Node process. Log a credential-free summary and
// let subsequent requests reconnect through the pool.
if (!globalForDb.__arenaNextJsPostgresqlPoolErrorListener) {
  pool.on("error", (error) => {
    console.error("Unexpected PostgreSQL pool error:", error.message);
  });
  globalForDb.__arenaNextJsPostgresqlPoolErrorListener = true;
}

if (process.env.NODE_ENV !== "production") {
  globalForDb.__arenaNextJsPostgresqlPool = pool;
}

export const db = drizzle(pool);
