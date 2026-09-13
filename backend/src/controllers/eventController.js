const { query } = require("../config/db");
const progression = require("../services/progressionService");
const { ATTRIBUTES, IMPORTANCE_XP, PRODUCTIVE_ACTIONS } = require("../config/gameConfig");

const isBadUuid = (error) => error.code === "22P02";

const serializeEvent = (row) => ({
  id: row.id,
  title: row.title,
  notes: row.notes,
  importance: row.importance,
  attribute: row.attribute,
  // DATE/TIME come back as plain strings (see the parser in config/db.js),
  // which is what the calendar wants - these are wall-clock labels, not instants.
  scheduledFor: row.scheduled_for,
  startTime: row.start_time ? String(row.start_time).slice(0, 5) : null,
  endTime: row.end_time ? String(row.end_time).slice(0, 5) : null,
  completed: row.completed,
  completedAt: row.completed_at,
  createdAt: row.created_at,
});

/**
 * Events, optionally limited to a month via ?from=YYYY-MM-DD&to=YYYY-MM-DD so
 * the calendar only pulls what it is about to draw.
 */
const listEvents = async (req, res, next) => {
  try {
    const { from, to } = req.query;
    const clauses = ["user_id = $1"];
    const params = [req.user.uid];

    if (from) { params.push(from); clauses.push(`scheduled_for >= $${params.length}`); }
    if (to) { params.push(to); clauses.push(`scheduled_for <= $${params.length}`); }

    const result = await query(
      `SELECT * FROM events WHERE ${clauses.join(" AND ")}
        ORDER BY scheduled_for, start_time NULLS LAST, created_at`,
      params
    );

    res.status(200).json(result.rows.map(serializeEvent));
  } catch (error) {
    if (isBadUuid(error)) return res.status(400).json({ error: "Invalid date range" });
    next(error);
  }
};

const createEvent = async (req, res, next) => {
  try {
    const { title, notes, importance, attribute, scheduledFor, startTime, endTime } = req.body;

    const cleanTitle = typeof title === "string" ? title.trim() : "";
    if (!cleanTitle) return res.status(400).json({ error: "Give the schedule a name" });
    if (cleanTitle.length > 120) {
      return res.status(400).json({ error: "Name must be 120 characters or fewer" });
    }
    if (!scheduledFor || !/^\d{4}-\d{2}-\d{2}$/.test(scheduledFor)) {
      return res.status(400).json({ error: "A valid date is required" });
    }
    if (importance && !IMPORTANCE_XP[importance]) {
      return res.status(400).json({ error: "Unknown importance" });
    }
    if (attribute && !ATTRIBUTES.includes(attribute)) {
      return res.status(400).json({ error: "Unknown attribute" });
    }
    if (startTime && endTime && endTime < startTime) {
      return res.status(400).json({ error: "End time must be after the start time" });
    }

    const result = await query(
      `INSERT INTO events (user_id, title, notes, importance, attribute, scheduled_for, start_time, end_time)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
      [
        req.user.uid,
        cleanTitle,
        notes?.slice(0, 500) || "",
        importance || "medium",
        attribute || null,
        scheduledFor,
        startTime || null,
        endTime || null,
      ]
    );

    res.status(201).json(serializeEvent(result.rows[0]));
  } catch (error) {
    next(error);
  }
};

const updateEvent = async (req, res, next) => {
  try {
    const { title, notes, importance, attribute, scheduledFor, startTime, endTime } = req.body;

    if (title !== undefined && !String(title).trim()) {
      return res.status(400).json({ error: "Name cannot be empty" });
    }
    if (importance !== undefined && !IMPORTANCE_XP[importance]) {
      return res.status(400).json({ error: "Unknown importance" });
    }
    if (attribute !== undefined && attribute !== null && !ATTRIBUTES.includes(attribute)) {
      return res.status(400).json({ error: "Unknown attribute" });
    }

    // `completed` is deliberately absent: it is granted only by /:id/complete,
    // which pays XP inside a transaction.
    const result = await query(
      `UPDATE events SET
         title         = COALESCE($3, title),
         notes         = COALESCE($4, notes),
         importance    = COALESCE($5, importance),
         attribute     = CASE WHEN $6::boolean THEN $7 ELSE attribute END,
         scheduled_for = COALESCE($8, scheduled_for),
         start_time    = CASE WHEN $9::boolean  THEN $10 ELSE start_time END,
         end_time      = CASE WHEN $11::boolean THEN $12 ELSE end_time   END,
         updated_at    = now()
       WHERE id = $1 AND user_id = $2
       RETURNING *`,
      [
        req.params.id, req.user.uid,
        title?.trim() ?? null,
        notes ?? null,
        importance ?? null,
        attribute !== undefined, attribute || null,
        scheduledFor ?? null,
        startTime !== undefined, startTime || null,
        endTime !== undefined, endTime || null,
      ]
    );

    if (!result.rowCount) return res.status(404).json({ error: "Event not found" });
    res.status(200).json(serializeEvent(result.rows[0]));
  } catch (error) {
    if (isBadUuid(error)) return res.status(404).json({ error: "Event not found" });
    next(error);
  }
};

const deleteEvent = async (req, res, next) => {
  try {
    const result = await query(
      "DELETE FROM events WHERE id = $1 AND user_id = $2 RETURNING id",
      [req.params.id, req.user.uid]
    );
    if (!result.rowCount) return res.status(404).json({ error: "Event not found" });
    res.status(200).json({ message: "Event deleted" });
  } catch (error) {
    if (isBadUuid(error)) return res.status(404).json({ error: "Event not found" });
    next(error);
  }
};

const completeEvent = async (req, res, next) => {
  try {
    res.status(200).json(await progression.completeEvent(req.user.uid, req.params.id));
  } catch (error) {
    if (error.statusCode) return res.status(error.statusCode).json({ error: error.message });
    next(error);
  }
};

/**
 * Records a productive action and grants its (small) XP.
 *
 * Never fails for a repeat or a capped action - it returns xpGained: 0 so the
 * UI can stay silent during ordinary browsing.
 */
const logProductive = async (req, res, next) => {
  try {
    const { kind, ref } = req.body;
    res.status(200).json(await progression.logProductive(req.user.uid, kind, ref));
  } catch (error) {
    if (error.statusCode) return res.status(error.statusCode).json({ error: error.message });
    next(error);
  }
};

/** What the client needs to render importance colours and productivity rules. */
const getRules = (req, res) => {
  res.status(200).json({
    importance: IMPORTANCE_XP,
    productive: PRODUCTIVE_ACTIONS,
  });
};

module.exports = {
  listEvents, createEvent, updateEvent, deleteEvent, completeEvent, logProductive, getRules,
};
