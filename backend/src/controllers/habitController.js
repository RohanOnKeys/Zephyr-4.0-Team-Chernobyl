const { query } = require("../config/db");
const { colorForIndex } = require("../utils/habitColors");
const { serializeHabit, handlePgError, ensureUser } = require("../utils/habitSql");

// camelCase API field -> column. Only these can be changed by updateHabit.
const UPDATABLE = {
  name: "name",
  description: "description",
  category: "category",
  icon: "icon",
  color: "color",
  frequency: "frequency",
  targetDays: "target_days",
  reminderTime: "reminder_time",
  isArchived: "is_archived",
};

// Get all active (non-archived) habits for the authenticated user
const getHabits = async (req, res, next) => {
  try {
    const { rows } = await query(
      `SELECT * FROM habits
        WHERE user_id = $1 AND NOT is_archived
        ORDER BY created_at ASC`,
      [req.user.uid]
    );
    res.status(200).json(rows.map(serializeHabit));
  } catch (error) {
    next(error);
  }
};

// Create a new habit
const createHabit = async (req, res, next) => {
  try {
    const { uid } = req.user;
    const { name, description, category, icon, color, frequency, targetDays, reminderTime } = req.body;

    if (!name) {
      return res.status(400).json({ error: "Habit name is required" });
    }

    await ensureUser(req.user);

    // Counts archived habits too, matching the original color rotation.
    const count = await query("SELECT count(*)::int AS n FROM habits WHERE user_id = $1", [uid]);

    const { rows } = await query(
      `INSERT INTO habits
         (user_id, name, description, category, icon, color, frequency, target_days, reminder_time)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       RETURNING *`,
      [
        uid,
        name,
        description || "",
        category || "general",
        icon || "sparkles",
        color || colorForIndex(count.rows[0].n),
        frequency || "daily",
        targetDays || 7,
        reminderTime || null,
      ]
    );

    res.status(201).json(serializeHabit(rows[0]));
  } catch (error) {
    if (handlePgError(error, res, "Habit not found")) return;
    next(error);
  }
};

// Update a habit's fields
const updateHabit = async (req, res, next) => {
  try {
    const { uid } = req.user;
    const updates = req.body || {};

    const sets = [];
    const params = [req.params.id, uid];
    for (const [field, column] of Object.entries(UPDATABLE)) {
      if (updates[field] === undefined) continue;
      let value = updates[field];
      if (field === "reminderTime" && !value) value = null;
      params.push(value);
      sets.push(`${column} = $${params.length}`);
    }
    sets.push("updated_at = now()");

    const { rows } = await query(
      `UPDATE habits SET ${sets.join(", ")}
        WHERE id = $1 AND user_id = $2
        RETURNING *`,
      params
    );

    if (!rows.length) {
      return res.status(404).json({ error: "Habit not found" });
    }
    res.status(200).json(serializeHabit(rows[0]));
  } catch (error) {
    if (handlePgError(error, res, "Habit not found")) return;
    next(error);
  }
};

// Toggle a habit's archived state
const archiveHabit = async (req, res, next) => {
  try {
    const { rows } = await query(
      `UPDATE habits SET is_archived = NOT is_archived, updated_at = now()
        WHERE id = $1 AND user_id = $2
        RETURNING *`,
      [req.params.id, req.user.uid]
    );

    if (!rows.length) {
      return res.status(404).json({ error: "Habit not found" });
    }
    res.status(200).json(serializeHabit(rows[0]));
  } catch (error) {
    if (handlePgError(error, res, "Habit not found")) return;
    next(error);
  }
};

// Delete a habit; its completion logs go with it (ON DELETE CASCADE)
const deleteHabit = async (req, res, next) => {
  try {
    const result = await query("DELETE FROM habits WHERE id = $1 AND user_id = $2", [
      req.params.id,
      req.user.uid,
    ]);

    if (!result.rowCount) {
      return res.status(404).json({ error: "Habit not found" });
    }
    res.status(200).json({ message: "Habit deleted successfully" });
  } catch (error) {
    if (handlePgError(error, res, "Habit not found")) return;
    next(error);
  }
};

module.exports = { getHabits, createHabit, updateHabit, archiveHabit, deleteHabit };
