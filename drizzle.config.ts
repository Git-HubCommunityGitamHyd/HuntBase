import { config } from "dotenv";
import { defineConfig } from "drizzle-kit";

config({ path: ".env.local" });

const databaseUrl = process.env.DATABASE_URL_DIRECT;
if (!databaseUrl) {
  throw new Error(
    "DATABASE_URL_DIRECT is required for Drizzle migrations. Set it in .env.local or the process environment."
  );
}

export default defineConfig({
  schema: "./src/db/schema",
  out: "./migrations",
  dialect: "postgresql",
  dbCredentials: {
    url: databaseUrl,
  },
});
