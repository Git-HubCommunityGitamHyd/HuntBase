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

async function checkDb() {
  const client = await pool.connect();
  try {
    const orgs = await client.query("SELECT * FROM organizations");
    console.log("Organizations:", orgs.rows);
    const users = await client.query("SELECT id, username, email, role, is_active FROM host_users");
    console.log("Host Users:", users.rows);
  } finally {
    client.release();
    await pool.end();
  }
}

checkDb();