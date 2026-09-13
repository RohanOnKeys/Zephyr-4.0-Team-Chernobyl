const { query, withTransaction } = require("../config/db");
const { rewardHabitCheckIn } = require("../services/progressionService");
const { serializeLog, handlePgError } = require("../utils/habitSql");

const HEATMAP_DAYS = 90;

function todayKey() {
  return new Date().toISOString().slice(0, 10);
}

// Today's completion logs, across all habits
const getTodayLogs = async (req, res, next) => {
  try {
    const { rows } = await query(
      "SELECT * FROM habit_logs WHERE user_id = $1 AND date = $2 ORDER BY created_at",
      [req.user.uid, todayKey()]
    );
    res.status(200).json(rows.map(serializeLog));
  } catch (error) {
    next(error);
  }
};

// Completion logs within a date range (inclusive), e.g. for a weekly grid.
const getRangeLogs = async (req, res, next) => {
  try {
    const { start, end } = req.query;

    if (!start || !end) {
      return res.status(400).json({ error: "start and end query params are required" });
    }

    const { rows } = await query(
      `SELECT * FROM habit_logs
        WHERE user_id = $1 AND date BETWEEN $2 AND $3
        ORDER BY date, created_at`,
      [req.user.uid, start, end]
    );
    res.status(200).json(rows.map(serializeLog));
  } catch (error) {
    if (handlePgError(error, res, "Not found")) return;
    next(error);
  }
};

// Daily completion counts (across all habits) for the last 90 days, including zero-count days
const getHeatmap = async (req, res, next) => {
  try {
    // Day keys built exactly as the Firestore version did, then filled from SQL counts.
    const keys = [];
    const cursor = new Date();
    cursor.setDate(cursor.getDate() - (HEATMAP_DAYS - 1));
    for (let i = 0; i < HEATMAP_DAYS; i++) {
      keys.push(cursor.toISOString().slice(0, 10));
      cursor.setDate(cursor.getDate() + 1);
    }

    const { rows } = await query(
      `SELECT date, count(*)::int AS count FROM habit_logs
        WHERE user_id = $1 AND date BETWEEN $2 AND $3
        GROUP BY date`,
      [req.user.uid, keys[0], keys[keys.length - 1]]
    );
    const counts = Object.fromEntries(rows.map((r) => [r.date, r.count]));

    res.status(200).json(keys.map((date) => ({ date, count: counts[date] || 0 })));
  } catch (error) {
    next(error);
  }
};

// Mark a habit complete for a given date (idempotent)
const createLog = async (req, res, next) => {
  try {
    const { uid } = req.user;
    const { habitId, date } = req.body;

    if (!habitId || !date) {
      return res.status(400).json({ error: "habitId and date are required" });
    }

    const outcome = await withTransaction(async (client) => {
      const habitResult = await client.query(
        "SELECT id, name, category FROM habits WHERE id = $1 AND user_id = $2",
        [habitId, uid]
      );
      if (!habitResult.rowCount) return { notFound: true };

      const inserted = await client.query(
        `INSERT INTO habit_logs (user_id, habit_id, date) VALUES ($1, $2, $3)
         ON CONFLICT (habit_id, date) DO NOTHING
         RETURNING *`,
        [uid, habitId, date]
      );

      if (!inserted.rowCount) {
        const existing = await client.query(
          "SELECT * FROM habit_logs WHERE habit_id = $1 AND date = $2 AND user_id = $3",
          [habitId, date, uid]
        );
        return { existing: existing.rows[0] };
      }

      const log = inserted.rows[0];
      // Paid in the same transaction as the log insert.
      const reward = await rewardHabitCheckIn(uid, habitResult.rows[0], log.date, client);
      return { created: log, reward };
    });

    if (outcome.notFound) {
      return res.status(404).json({ error: "Habit not found" });
    }
    if (outcome.existing) {
      return res.status(200).json(serializeLog(outcome.existing));
    }

    res.status(201).json({
      ...serializeLog(outcome.created),
      stats: outcome.reward.stats,
      reward: outcome.reward,
    });
  } catch (error) {
    if (handlePgError(error, res, "Habit not found")) return;
    next(error);
  }
};

// Undo a habit completion for a given date.
// XP is intentionally NOT clawed back: the habit_rewards ledger keeps the day
// claimed, so undo + redo neither re-pays nor double-charges.
const deleteLog = async (req, res, next) => {
  try {
    const { habitId, date } = req.body;

    if (!habitId || !date) {
      return res.status(400).json({ error: "habitId and date are required" });
    }

    await query("DELETE FROM habit_logs WHERE user_id = $1 AND habit_id = $2 AND date = $3", [
      req.user.uid,
      habitId,
      date,
    ]);

    res.status(200).json({ message: "Log removed" });
  } catch (error) {
    if (handlePgError(error, res, "Habit not found")) return;
    next(error);
  }
};

module.exports = { getTodayLogs, getRangeLogs, getHeatmap, createLog, deleteLog };
