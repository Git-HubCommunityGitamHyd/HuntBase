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

async function diagnose() {
  const client = await pool.connect();
  try {
    console.log("=== HuntBase Migration Diagnostic Script ===");

    // 1. Current database and schema
    const dbRes = await client.query("SELECT current_database() AS db, current_schema() AS schema");
    console.log("Database & Schema:", dbRes.rows[0]);

    // 2. Check if public.theme_configs exists
    const tableRes = await client.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables
        WHERE table_schema = 'public'
        AND table_name = 'theme_configs'
      ) AS exists;
    `);
    const themeConfigsExists = tableRes.rows[0].exists;
    console.log("public.theme_configs exists:", themeConfigsExists);

    // 3. List columns of public.theme_configs if it exists
    if (themeConfigsExists) {
      const colsRes = await client.query(`
        SELECT column_name, data_type, is_nullable
        FROM information_schema.columns
        WHERE table_schema = 'public'
        AND table_name = 'theme_configs'
        ORDER BY ordinal_position;
      `);
      console.log("Columns in public.theme_configs:", colsRes.rows);
    } else {
      console.log("public.theme_configs does not exist yet.");
    }

    // 4. Check whether drizzle.__drizzle_migrations or public.__drizzle_migrations exists
    const migTableRes = await client.query(`
      SELECT table_schema, table_name
      FROM information_schema.tables
      WHERE table_name = '__drizzle_migrations';
    `);
    console.log("Migration tables found:", migTableRes.rows);

    for (const row of migTableRes.rows) {
      const schemaName = row.table_schema;
      const tableName = row.table_name;
      console.log(`\nInspecting columns for ${schemaName}.${tableName}:`);
      const migCols = await client.query(`
        SELECT column_name, data_type, is_nullable
        FROM information_schema.columns
        WHERE table_schema = $1
        AND table_name = $2
        ORDER BY ordinal_position;
      `, [schemaName, tableName]);
      console.log(migCols.rows);

      console.log(`Contents of ${schemaName}.${tableName}:`);
      const migData = await client.query(`SELECT * FROM "${schemaName}"."${tableName}" ORDER BY created_at ASC;`);
      console.log(migData.rows);
    }

    console.log("\nDiagnostic checks completed successfully.");
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    const code = err && typeof err === "object" && "code" in err ? err.code : undefined;
    console.error("Diagnostic execution error:", message);
    if (code) {
      console.error("PostgreSQL Error Code:", code);
    }
  } finally {
    client.release();
    await pool.end();
  }
}

diagnose();
