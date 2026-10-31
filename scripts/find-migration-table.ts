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

async function find() {
  const client = await pool.connect();
  try {
    const res = await client.query(`
      SELECT table_schema, table_name
      FROM information_schema.tables
      WHERE table_name LIKE '%drizzle%' OR table_name LIKE '%migration%'
      ORDER BY table_schema, table_name
    `);
    console.log('Migration tables:', JSON.stringify(res.rows, null, 2));
  } finally {
    client.release();
    await pool.end();
  }
}

find();