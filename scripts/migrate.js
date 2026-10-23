/* eslint-disable */
const fs = require('fs');
const path = require('path');
const { Client } = require('pg');

async function run() {
  const password = process.env.SUPABASE_DB_PASSWORD || 'DPtZJeAsozVSM4yd';
  const sqlPath = path.join(__dirname, '..', 'supabase', 'schema.sql');
  const sql = fs.readFileSync(sqlPath, 'utf8');

  console.log('Reading master schema file:', sqlPath);

  const client = new Client({
    host: 'aws-0-ap-southeast-2.pooler.supabase.com',
    port: 6543,
    database: 'postgres',
    user: 'postgres.vsdntafpvqzhnqbhbuwc',
    password: password,
    ssl: { rejectUnauthorized: false }
  });

  try {
    console.log('Connecting to Supabase pooler...');
    await client.connect();
    console.log('Connected! Executing schema.sql...');
    await client.query(sql);
    console.log('schema.sql executed successfully!');

    // Verify tables
    const tables = await client.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
      ORDER BY table_name;
    `);
    console.log('Active tables in public schema:', tables.rows.map(t => t.table_name));

  } catch (err) {
    console.error('Database setup failed:', err);
    process.exit(1);
  } finally {
    await client.end();
  }
}

run();
