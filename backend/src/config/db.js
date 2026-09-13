const { Pool, types } = require("pg");

// Return DATE columns as plain "YYYY-MM-DD" strings.
//
// By default node-postgres turns a DATE into a JS Date at LOCAL midnight. Any
// later .toISOString() then shifts it back to UTC, so in a positive-offset zone
// (IST is UTC+5:30) "2026-09-13" reads back as "2026-09-12" - a day key that is
// silently off by one. That made the streak count a second completion on the
// same day as a new day. Day keys are calendar labels, not instants; keep them
// as text and they survive every timezone untouched.
types.setTypeParser(types.builtins.DATE, (value) => value);

/**
 * Neon Postgres connection pool.
 *
 * Prefers DATABASE_URL, falling back to the older NEON_KEY name so an existing
 * .env keeps working. NEON_KEY was always a connection string despite the name.
 */
const connectionString = process.env.DATABASE_URL || process.env.NEON_KEY;

if (!connectionString) {
  throw new Error(
    "No database connection string. Set DATABASE_URL in backend/.env (see .env.example)."
  );
}

const pool = new Pool({
  connectionString,
  // Neon's free tier suspends after idle, and Render/serverless hosts recycle
  // containers, so keep the pool small and don't hold dead sockets open.
  max: 10,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 15000,
});

pool.on("error", (error) => {
  // A pooled connection dying in the background must not take the process down.
  console.error("Unexpected database pool error:", error.message);
});

const query = (text, params) => pool.query(text, params);

/**
 * Runs `fn` inside a single transaction on one dedicated connection.
 *
 * Every multi-table reward payout goes through here, so a failure part-way
 * can never leave a task marked complete without the XP that pays for it.
 */
async function withTransaction(fn) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const result = await fn(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}

module.exports = { pool, query, withTransaction };
