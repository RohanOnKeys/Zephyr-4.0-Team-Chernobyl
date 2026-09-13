const { query } = require("../config/db");
const progression = require("../services/progressionService");
const { ATTRIBUTES, DIFFICULTY_XP } = require("../config/gameConfig");

const TASK_TYPES = ["habit", "daily", "todo"];

/** Maps a tasks row to the camelCase shape the frontend expects. */
const serializeTask = (row) => ({
  id: row.id,
  userId: row.user_id,
  title: row.title,
  description: row.description,
  type: row.type,
  difficulty: row.difficulty,
  attribute: row.attribute,
  completed: row.completed,
  completedAt: row.completed_at,
  dueDate: row.due_date,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

/** Postgres rejects a malformed uuid with 22P02; that's a 404, not a 500. */
const isBadUuid = (error) => error.code === "22P02";

const getTasks = async (req, res, next) => {
  try {
    const result = await query(
      "SELECT * FROM tasks WHERE user_id = $1 ORDER BY completed ASC, created_at DESC",
      [req.user.uid]
    );
    res.status(200).json(result.rows.map(serializeTask));
  } catch (error) {
    next(error);
  }
};

const createTask = async (req, res, next) => {
  try {
    const { title, description, type, difficulty, attribute, dueDate } = req.body;

    // Trim first: a title of only spaces is empty as far as the user is concerned.
    const cleanTitle = typeof title === "string" ? title.trim() : "";

    if (!cleanTitle) return res.status(400).json({ error: "Title is required" });
    if (cleanTitle.length > 120) {
      return res.status(400).json({ error: "Title must be 120 characters or fewer" });
    }
    if (!TASK_TYPES.includes(type)) {
      return res.status(400).json({ error: `Type must be one of: ${TASK_TYPES.join(", ")}` });
    }
    if (difficulty && !DIFFICULTY_XP[difficulty]) {
      return res.status(400).json({ error: "Unknown difficulty" });
    }
    if (attribute && !ATTRIBUTES.includes(attribute)) {
      return res.status(400).json({ error: "Unknown attribute" });
    }

    const result = await query(
      `INSERT INTO tasks (user_id, title, description, type, difficulty, attribute, due_date)
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
      [
        req.user.uid,
        cleanTitle,
        description?.slice(0, 500) || "",
        type,
        difficulty || "easy",
        attribute || null,
        dueDate || null,
      ]
    );

    res.status(201).json(serializeTask(result.rows[0]));
  } catch (error) {
    next(error);
  }
};

const updateTask = async (req, res, next) => {
  try {
    const { title, description, difficulty, attribute, type, dueDate } = req.body;

    if (title !== undefined) {
      const clean = typeof title === "string" ? title.trim() : "";
      if (!clean) return res.status(400).json({ error: "Title cannot be empty" });
      if (clean.length > 120) {
        return res.status(400).json({ error: "Title must be 120 characters or fewer" });
      }
    }
    if (difficulty !== undefined && !DIFFICULTY_XP[difficulty]) {
      return res.status(400).json({ error: "Unknown difficulty" });
    }
    if (attribute !== undefined && attribute !== null && !ATTRIBUTES.includes(attribute)) {
      return res.status(400).json({ error: "Unknown attribute" });
    }
    if (type !== undefined && !TASK_TYPES.includes(type)) {
      return res.status(400).json({ error: `Type must be one of: ${TASK_TYPES.join(", ")}` });
    }

    // `completed` is deliberately not updatable here. Completion is granted only
    // by POST /:id/complete, which pays XP inside a transaction - allowing it
    // here would let a client toggle the flag and farm rewards for free.
    // The user_id predicate is what enforces ownership: another user's task
    // simply matches no row.
    const result = await query(
      `UPDATE tasks SET
         title       = COALESCE($3, title),
         description = COALESCE($4, description),
         difficulty  = COALESCE($5, difficulty),
         type        = COALESCE($6, type),
         attribute   = CASE WHEN $7::boolean THEN $8 ELSE attribute END,
         due_date    = CASE WHEN $9::boolean THEN $10 ELSE due_date END,
         updated_at  = now()
       WHERE id = $1 AND user_id = $2
       RETURNING *`,
      [
        req.params.id,
        req.user.uid,
        title?.trim() ?? null,
        description ?? null,
        difficulty ?? null,
        type ?? null,
        attribute !== undefined,
        attribute || null,
        dueDate !== undefined,
        dueDate || null,
      ]
    );

    if (!result.rowCount) return res.status(404).json({ error: "Task not found" });
    res.status(200).json(serializeTask(result.rows[0]));
  } catch (error) {
    if (isBadUuid(error)) return res.status(404).json({ error: "Task not found" });
    next(error);
  }
};

const deleteTask = async (req, res, next) => {
  try {
    const result = await query(
      "DELETE FROM tasks WHERE id = $1 AND user_id = $2 RETURNING id",
      [req.params.id, req.user.uid]
    );

    if (!result.rowCount) return res.status(404).json({ error: "Task not found" });
    res.status(200).json({ message: "Task deleted successfully", id: result.rows[0].id });
  } catch (error) {
    if (isBadUuid(error)) return res.status(404).json({ error: "Task not found" });
    next(error);
  }
};

// Complete a task and grant XP, gold, attribute progress and streak credit.
const completeTask = async (req, res, next) => {
  try {
    res.status(200).json(await progression.completeTask(req.user.uid, req.params.id));
  } catch (error) {
    if (error.statusCode) return res.status(error.statusCode).json({ error: error.message });
    next(error);
  }
};

/**
 * Completion history plus a per-day roll-up for the streak calendar.
 *
 * The daily aggregate is a GROUP BY rather than something computed in Node,
 * which is exactly the kind of query a document store couldn't do for us.
 */
const getActivity = async (req, res, next) => {
  try {
    const [recent, daily] = await Promise.all([
      query(
        `SELECT id, task_id, title_snapshot, attribute, difficulty,
                xp_awarded, gold_awarded, streak_at_time, day, completed_at
           FROM completions WHERE user_id = $1
          ORDER BY completed_at DESC LIMIT 50`,
        [req.user.uid]
      ),
      query(
        `SELECT day, count(*)::int AS completions, sum(xp_awarded)::int AS xp
           FROM completions
          WHERE user_id = $1 AND day > current_date - INTERVAL '365 days'
          GROUP BY day ORDER BY day`,
        [req.user.uid]
      ),
    ]);

    res.status(200).json({
      recent: recent.rows.map((r) => ({
        id: r.id,
        taskId: r.task_id,
        title: r.title_snapshot,
        attribute: r.attribute,
        difficulty: r.difficulty,
        xpAwarded: r.xp_awarded,
        goldAwarded: r.gold_awarded,
        streakAtTime: r.streak_at_time,
        day: r.day,
        completedAt: r.completed_at,
      })),
      daily: daily.rows.map((r) => ({
        day: r.day,
        completions: r.completions,
        xp: r.xp,
      })),
    });
  } catch (error) {
    next(error);
  }
};

module.exports = { getTasks, createTask, updateTask, deleteTask, completeTask, getActivity };
