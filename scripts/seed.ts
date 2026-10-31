import { config } from "dotenv";
import { Pool } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { eq } from "drizzle-orm";
import { hostUsers } from "../src/db/schema";
import { hashPassword } from "../src/lib/auth/password";

config({ path: ".env.local" });

async function main() {
  const url = process.env.DATABASE_URL_DIRECT;
  const username = process.env.SEED_ADMIN_USERNAME;
  const email = process.env.SEED_ADMIN_EMAIL;
  const password = process.env.SEED_ADMIN_PASSWORD;

  if (!url || !username || !email || !password) {
    throw new Error("Set DATABASE_URL_DIRECT and SEED_ADMIN_USERNAME / EMAIL / PASSWORD");
  }
  if (password.length < 12) {
    throw new Error("SEED_ADMIN_PASSWORD must be at least 12 characters");
  }

  const pool = new Pool({ connectionString: url });
  const db = drizzle(pool);

  const existing = await db
    .select({ id: hostUsers.id })
    .from(hostUsers)
    .where(eq(hostUsers.username, username));

  if (existing.length > 0) {
    console.log("Admin already exists, nothing to do.");
  } else {
    await db.insert(hostUsers).values({
      username,
      email,
      fullName: "Platform Admin",
      role: "super_admin",
      passwordHash: await hashPassword(password),
    });
    console.log("Super admin created.");
  }
  await pool.end();
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});