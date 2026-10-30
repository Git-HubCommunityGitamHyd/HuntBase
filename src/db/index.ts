import { Pool } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import * as schema from "./schema";

const globalForDb = globalThis as unknown as { pgPool?: Pool };

const connectionString =
  process.env.DATABASE_URL ||
  "postgresql://postgres:postgres@localhost:5432/huntbase";

const pool =
  globalForDb.pgPool ??
  new Pool({ connectionString, max: 5 });

// Reuse the pool during dev hot-reloads so connections don't pile up.
if (process.env.NODE_ENV !== "production") globalForDb.pgPool = pool;

export const db = drizzle(pool, { schema });
