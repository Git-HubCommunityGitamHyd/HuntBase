import { Pool } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import * as schema from "./schema";

const globalForDb = globalThis as unknown as { pgPool?: Pool };

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL is not set");
}

const pool =
  globalForDb.pgPool ??
  new Pool({ connectionString: process.env.DATABASE_URL, max: 5 });

// Reuse the pool during dev hot-reloads so connections don't pile up.
if (process.env.NODE_ENV !== "production") globalForDb.pgPool = pool;

export const db = drizzle(pool, { schema });