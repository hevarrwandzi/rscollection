const fs = require("fs");
const path = require("path");
const { Pool } = require("pg");
require("dotenv").config();

async function run() {
  const pool = new Pool({
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT || 5432),
    database: process.env.DB_NAME,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    ssl: process.env.DB_SSL === "true" ? { rejectUnauthorized: false } : undefined,
  });

  const client = await pool.connect();
  try {
    console.log("Starting database migrations...");

    // Create the schema_migrations table if it doesn't exist
    await client.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        version VARCHAR(255) PRIMARY KEY,
        executed_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Get list of executed migrations
    const executedRes = await client.query("SELECT version FROM schema_migrations");
    const executed = new Set(executedRes.rows.map((row) => row.version));

    // Read migrations directory
    const migrationsDir = path.join(__dirname, "..", "migrations");
    if (!fs.existsSync(migrationsDir)) {
      console.log("Migrations directory not found. Creating it...");
      await fs.promises.mkdir(migrationsDir, { recursive: true });
    }

    const files = await fs.promises.readdir(migrationsDir);
    const sqlFiles = files
      .filter((file) => file.endsWith(".sql"))
      .sort();

    if (sqlFiles.length === 0) {
      console.log("No migration files found.");
      return;
    }

    for (const file of sqlFiles) {
      if (executed.has(file)) {
        console.log(`Migration ${file} already executed. Skipping.`);
        continue;
      }

      console.log(`Running migration: ${file}...`);
      const filePath = path.join(migrationsDir, file);
      const sqlContent = await fs.promises.readFile(filePath, "utf8");

      await client.query("BEGIN");
      try {
        // Run SQL content (supports multiple queries)
        await client.query(sqlContent);
        // Record migration execution
        await client.query("INSERT INTO schema_migrations (version) VALUES ($1)", [file]);
        await client.query("COMMIT");
        console.log(`Migration ${file} completed successfully.`);
      } catch (err) {
        await client.query("ROLLBACK");
        throw err;
      }
    }

    console.log("Database migrations completed successfully.");
  } catch (error) {
    console.error("Migration failed:", error.message || error);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

run();
