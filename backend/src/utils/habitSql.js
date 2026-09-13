const { query } = require("../config/db");
const { getOrCreateUser } = require("../services/userService");

// Shared helpers for the Postgres-backed habit tracker (formerly Firestore).

/** Maps a habits row back to the original Firestore document shape. */
function serializeHabit(row) {
  return {
    id: row.id,
    userId: row.user_id,
    name: row.name,
    description: row.description,
    category: row.category,
    icon: row.icon,
    color: row.color,
    frequency: row.frequency,
    targetDays: row.target_days,
    reminderTime: row.reminder_time,
    isArchived: row.is_archived,
    createdAt: new Date(row.created_at).toISOString(),
    updatedAt: new Date(row.updated_at).toISOString(),
  };
}

/** Maps a habit_logs row back to the original Firestore document shape. */
function serializeLog(row) {
  return {
    id: row.id,
    userId: row.user_id,
    habitId: row.habit_id,
    date: row.date,
    createdAt: new Date(row.created_at).toISOString(),
  };
}

/**
 * Translates Postgres errors caused by bad client input into HTTP responses.
 * Returns true if a response was sent.
 */
function handlePgError(error, res, notFoundMessage) {
  switch (error.code) {
    case "22P02": // malformed uuid / integer text
      res.status(404).json({ error: notFoundMessage });
      return true;
    case "22007": // invalid date format
    case "22008": // date out of range
      res.status(400).json({ error: "Invalid date" });
      return true;
    case "23514": // check violation
    case "23502": // not-null violation
    case "22001": // value too long
      res.status(400).json({ error: "Invalid habit data" });
      return true;
    default:
      return false;
  }
}

/**
 * habits.user_id references users(uid). The dashboard fires /user/me and the
 * habit requests in parallel, so a habit write can arrive before the profile
 * row exists - create it on demand.
 */
async function ensureUser(reqUser) {
  const existing = await query("SELECT 1 FROM users WHERE uid = $1", [reqUser.uid]);
  if (existing.rowCount) return;
  await getOrCreateUser(reqUser.uid, reqUser.email, reqUser.name);
}

module.exports = { serializeHabit, serializeLog, handlePgError, ensureUser };
