require("dotenv").config();

const fs = require("node:fs");
const path = require("node:path");
const { pool, withTransaction } = require("../config/db");

const MIGRATIONS_DIR = path.join(__dirname, "..", "..", "migrations");

/**
 * Applies every .sql file in migrations/ that hasn't run yet, in filename order.
 * Each file runs inside its own transaction and is recorded in schema_migrations,
 * so running this repeatedly is safe and only new files execute.
 */
async function migrate() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      filename   TEXT PRIMARY KEY,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `);

  const applied = new Set(
    (await pool.query("SELECT filename FROM schema_migrations")).rows.map((r) => r.filename)
  );

  const files = fs
    .readdirSync(MIGRATIONS_DIR)
    .filter((name) => name.endsWith(".sql"))
    .sort();

  let ran = 0;

  for (const filename of files) {
    if (applied.has(filename)) {
      console.log(`  skip     ${filename}`);
      continue;
    }

    const sql = fs.readFileSync(path.join(MIGRATIONS_DIR, filename), "utf8");

    await withTransaction(async (client) => {
      await client.query(sql);
      await client.query("INSERT INTO schema_migrations (filename) VALUES ($1)", [filename]);
    });

    console.log(`  applied  ${filename}`);
    ran += 1;
  }

  console.log(ran ? `\n${ran} migration(s) applied.` : "\nDatabase already up to date.");
}

migrate()
  .then(() => pool.end())
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("\nMigration failed:", error.message);
    pool.end().finally(() => process.exit(1));
  });
