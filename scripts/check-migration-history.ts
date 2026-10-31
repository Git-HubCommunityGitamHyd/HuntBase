import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

import pkg from "pg";
const { Pool } = pkg;

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  console.error("Error: DATABASE_URL is not set in .env.local");
  process.exit(1);
}

const pool = new Pool({
  connectionString,
});

async function check() {
  const client = await pool.connect();
  try {
    const res = await client.query(`
      SELECT * FROM "drizzle"."__drizzle_migrations" ORDER BY created_at ASC
    `);
    console.log('Migration history:', JSON.stringify(res.rows, null, 2));
  } finally {
    client.release();
    await pool.end();
  }
}

check();