const { withTransaction } = require("../config/db");
const {
  applyXp,
  DIFFICULTY_XP,
  IMPORTANCE_XP,
  PRODUCTIVE_ACTIONS,
  ATTRIBUTES,
  GOLD_RATIO,
  HABIT_XP,
  HABIT_DAILY_CAP,
  HABIT_CATEGORY_ATTRIBUTE,
  streakMultiplier,
  dayKey,
  daysBetween,
} = require("../config/gameConfig");

function httpError(message, statusCode) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}

/**
 * Works out the new streak from the last active day.
 * Same day  -> unchanged (five quests today is still a one-day streak)
 * Yesterday -> +1
 * Otherwise -> reset to 1
 */
function nextStreak({ current, longest, lastActiveDay }, today) {
  let value;
  if (!lastActiveDay) value = 1;
  else if (lastActiveDay === today) value = Math.max(current, 1);
  else if (daysBetween(lastActiveDay, today) === 1) value = current + 1;
  else value = 1;

  return { current: value, longest: Math.max(longest, value), lastActiveDay: today };
}

// DATE columns already arrive as "YYYY-MM-DD" strings (see config/db.js).
const asDayKey = (value) => value || null;

/**
 * Applies XP to one attribute row and returns what it became.
 */
async function bumpAttribute(client, uid, name, xpGained) {
  const existing = await client.query(
    "SELECT level, xp FROM attributes WHERE uid = $1 AND name = $2 FOR UPDATE",
    [uid, name]
  );

  const current = existing.rows[0] ?? { level: 1, xp: 0 };
  const next = applyXp(current.level, current.xp, xpGained);

  await client.query(
    `INSERT INTO attributes (uid, name, level, xp) VALUES ($1, $2, $3, $4)
     ON CONFLICT (uid, name) DO UPDATE SET level = EXCLUDED.level, xp = EXCLUDED.xp`,
    [uid, name, next.level, next.xpIntoLevel]
  );

  return { name, level: next.level, xp: next.xpIntoLevel, leveledUp: next.levelsGained > 0 };
}

async function readAttributes(client, uid) {
  const rows = await client.query("SELECT name, level, xp FROM attributes WHERE uid = $1", [uid]);
  const attributes = Object.fromEntries(ATTRIBUTES.map((n) => [n, { level: 1, xp: 0 }]));
  rows.rows.forEach((r) => {
    attributes[r.name] = { level: r.level, xp: r.xp };
  });
  return attributes;
}

/**
 * Completes a task and grants every reward in ONE transaction, so a failure
 * can never leave a task marked done without the XP that pays for it.
 *
 * `FOR UPDATE` locks the task row for the life of the transaction. That is what
 * makes double-completion impossible even if two requests race: the second one
 * blocks until the first commits, then sees completed = true and is rejected.
 */
async function completeTask(uid, taskId) {
  return withTransaction(async (client) => {
    let task;
    try {
      const result = await client.query(
        "SELECT * FROM tasks WHERE id = $1 FOR UPDATE",
        [taskId]
      );
      task = result.rows[0];
    } catch (error) {
      // A malformed uuid is a client mistake, not a server fault.
      if (error.code === "22P02") throw httpError("Task not found", 404);
      throw error;
    }

    if (!task) throw httpError("Task not found", 404);
    if (task.user_id !== uid) throw httpError("Forbidden: You don't own this task", 403);
    if (task.completed) throw httpError("Task is already completed", 409);

    const userResult = await client.query(
      `SELECT level, xp, xp_into_level, gold, total_completed,
              streak_current, streak_longest, last_active_day
         FROM users WHERE uid = $1 FOR UPDATE`,
      [uid]
    );

    if (!userResult.rowCount) throw httpError("User profile not found", 404);
    const user = userResult.rows[0];

    const today = dayKey();
    const streak = nextStreak(
      {
        current: user.streak_current,
        longest: user.streak_longest,
        lastActiveDay: asDayKey(user.last_active_day),
      },
      today
    );

    const baseXp = DIFFICULTY_XP[task.difficulty] ?? DIFFICULTY_XP.easy;
    const xpGained = Math.round(baseXp * streakMultiplier(streak.current));
    const goldGained = Math.round(xpGained * GOLD_RATIO);

    const progressed = applyXp(user.level, user.xp_into_level, xpGained);

    await client.query(
      `UPDATE tasks SET completed = TRUE, completed_at = now(), updated_at = now()
        WHERE id = $1`,
      [taskId]
    );

    const updated = await client.query(
      `UPDATE users
          SET level = $2, xp_into_level = $3, xp = xp + $4, gold = gold + $5,
              total_completed = total_completed + 1,
              streak_current = $6, streak_longest = $7, last_active_day = $8
        WHERE uid = $1
        RETURNING level, xp, xp_into_level, gold, total_completed`,
      [
        uid,
        progressed.level,
        progressed.xpIntoLevel,
        xpGained,
        goldGained,
        streak.current,
        streak.longest,
        today,
      ]
    );

    const attribute = ATTRIBUTES.includes(task.attribute) ? task.attribute : null;
    const attributeResult = attribute
      ? await bumpAttribute(client, uid, attribute, xpGained)
      : null;

    // Immutable history + the gold ledger, written in the same transaction.
    await client.query(
      `INSERT INTO completions
         (user_id, task_id, title_snapshot, attribute, difficulty,
          xp_awarded, gold_awarded, streak_at_time, day)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [uid, taskId, task.title, attribute, task.difficulty, xpGained, goldGained, streak.current, today]
    );

    await client.query(
      "INSERT INTO transactions (user_id, amount, reason) VALUES ($1, $2, $3)",
      [uid, goldGained, `Completed: ${task.title}`]
    );

    const stats = updated.rows[0];

    return {
      taskId,
      xpGained,
      goldGained,
      leveledUp: progressed.levelsGained > 0,
      levelsGained: progressed.levelsGained,
      attribute: attributeResult,
      stats: {
        level: stats.level,
        xp: stats.xp,
        xpIntoLevel: stats.xp_into_level,
        gold: stats.gold,
        totalCompleted: stats.total_completed,
      },
      attributes: await readAttributes(client, uid),
      streak,
    };
  });
}

/**
 * Rewards finishing a flashcard deck with Intellect XP, so studying feeds the
 * same progression engine as quests rather than being a bolt-on.
 *
 * Capped at once per deck per day by the deck_studies composite primary key:
 * a repeat study conflicts on (user_id, deck_id, day) and pays nothing.
 */
async function studyDeck(uid, deckId, cardsReviewed) {
  return withTransaction(async (client) => {
    let deck;
    try {
      const result = await client.query("SELECT id, user_id FROM decks WHERE id = $1", [deckId]);
      deck = result.rows[0];
    } catch (error) {
      if (error.code === "22P02") throw httpError("Deck not found", 404);
      throw error;
    }

    if (!deck || deck.user_id !== uid) throw httpError("Deck not found", 404);

    await client.query("UPDATE decks SET last_studied = now() WHERE id = $1", [deckId]);

    // 2 XP per card so longer decks are worth more, capped so a 500-card deck
    // can't out-earn every quest in the game.
    const xpGained = Math.min(Math.max(Number(cardsReviewed) || 0, 1) * 2, 60);
    const today = dayKey();

    const claim = await client.query(
      `INSERT INTO deck_studies (user_id, deck_id, day, cards_reviewed, xp_gained)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (user_id, deck_id, day) DO NOTHING
       RETURNING day`,
      [uid, deckId, today, Number(cardsReviewed) || 0, xpGained]
    );

    // No row inserted means today's reward for this deck was already claimed.
    if (!claim.rowCount) {
      const current = await client.query(
        "SELECT level, xp, xp_into_level, gold, total_completed FROM users WHERE uid = $1",
        [uid]
      );
      const s = current.rows[0];
      return {
        deckId,
        xpGained: 0,
        alreadyStudiedToday: true,
        leveledUp: false,
        stats: {
          level: s.level,
          xp: s.xp,
          xpIntoLevel: s.xp_into_level,
          gold: s.gold,
          totalCompleted: s.total_completed,
        },
        attributes: await readAttributes(client, uid),
      };
    }

    const userResult = await client.query(
      "SELECT level, xp_into_level FROM users WHERE uid = $1 FOR UPDATE",
      [uid]
    );
    if (!userResult.rowCount) throw httpError("User profile not found", 404);

    const progressed = applyXp(
      userResult.rows[0].level,
      userResult.rows[0].xp_into_level,
      xpGained
    );

    const updated = await client.query(
      `UPDATE users SET level = $2, xp_into_level = $3, xp = xp + $4
        WHERE uid = $1
        RETURNING level, xp, xp_into_level, gold, total_completed`,
      [uid, progressed.level, progressed.xpIntoLevel, xpGained]
    );

    const attributeResult = await bumpAttribute(client, uid, "intellect", xpGained);
    const stats = updated.rows[0];

    return {
      deckId,
      xpGained,
      alreadyStudiedToday: false,
      leveledUp: progressed.levelsGained > 0,
      attribute: attributeResult,
      stats: {
        level: stats.level,
        xp: stats.xp,
        xpIntoLevel: stats.xp_into_level,
        gold: stats.gold,
        totalCompleted: stats.total_completed,
      },
      attributes: await readAttributes(client, uid),
    };
  });
}

/**
 * Marks a scheduled calendar event done and pays out by its importance.
 *
 * Locks the row for the transaction, so a double-click or a replayed request
 * can't collect twice. Event completions also feed the daily streak, exactly
 * like quests - showing up for what you planned counts as showing up.
 */
async function completeEvent(uid, eventId) {
  return withTransaction(async (client) => {
    let event;
    try {
      const result = await client.query("SELECT * FROM events WHERE id = $1 FOR UPDATE", [eventId]);
      event = result.rows[0];
    } catch (error) {
      if (error.code === "22P02") throw httpError("Event not found", 404);
      throw error;
    }

    if (!event) throw httpError("Event not found", 404);
    if (event.user_id !== uid) throw httpError("Forbidden: You don't own this event", 403);
    if (event.completed) throw httpError("Event is already completed", 409);

    const userResult = await client.query(
      `SELECT level, xp, xp_into_level, gold, total_completed,
              streak_current, streak_longest, last_active_day
         FROM users WHERE uid = $1 FOR UPDATE`,
      [uid]
    );
    if (!userResult.rowCount) throw httpError("User profile not found", 404);
    const user = userResult.rows[0];

    const today = dayKey();
    const streak = nextStreak(
      {
        current: user.streak_current,
        longest: user.streak_longest,
        lastActiveDay: asDayKey(user.last_active_day),
      },
      today
    );

    const baseXp = IMPORTANCE_XP[event.importance] ?? IMPORTANCE_XP.medium;
    const xpGained = Math.round(baseXp * streakMultiplier(streak.current));
    const goldGained = Math.round(xpGained * GOLD_RATIO);

    const progressed = applyXp(user.level, user.xp_into_level, xpGained);

    await client.query(
      "UPDATE events SET completed = TRUE, completed_at = now(), updated_at = now() WHERE id = $1",
      [eventId]
    );

    const updated = await client.query(
      `UPDATE users
          SET level = $2, xp_into_level = $3, xp = xp + $4, gold = gold + $5,
              total_completed = total_completed + 1,
              streak_current = $6, streak_longest = $7, last_active_day = $8
        WHERE uid = $1
        RETURNING level, xp, xp_into_level, gold, total_completed`,
      [uid, progressed.level, progressed.xpIntoLevel, xpGained, goldGained,
       streak.current, streak.longest, today]
    );

    const attribute = ATTRIBUTES.includes(event.attribute) ? event.attribute : null;
    const attributeResult = attribute ? await bumpAttribute(client, uid, attribute, xpGained) : null;

    await client.query(
      `INSERT INTO completions
         (user_id, task_id, title_snapshot, attribute, difficulty,
          xp_awarded, gold_awarded, streak_at_time, day)
       VALUES ($1, NULL, $2, $3, $4, $5, $6, $7, $8)`,
      [uid, event.title, attribute, event.importance, xpGained, goldGained, streak.current, today]
    );

    await client.query(
      "INSERT INTO transactions (user_id, amount, reason) VALUES ($1, $2, $3)",
      [uid, goldGained, `Scheduled: ${event.title}`]
    );

    const stats = updated.rows[0];

    return {
      eventId,
      xpGained,
      goldGained,
      leveledUp: progressed.levelsGained > 0,
      attribute: attributeResult,
      stats: {
        level: stats.level,
        xp: stats.xp,
        xpIntoLevel: stats.xp_into_level,
        gold: stats.gold,
        totalCompleted: stats.total_completed,
      },
      attributes: await readAttributes(client, uid),
      streak,
    };
  });
}

/**
 * Rewards a productive action that isn't a quest - adding a flashcard, or
 * opening a study/coding site from the in-room browser.
 *
 * Two independent brakes:
 *  1. the productive_log primary key (user, kind, ref, day) means the same card
 *     or the same site pays at most once per day;
 *  2. dailyCap limits how many DISTINCT things of that kind pay out per day.
 *
 * A capped or repeated action is NOT an error - it just returns xpGained: 0, so
 * the UI can stay quiet instead of showing a failure for normal browsing.
 */
async function logProductive(uid, kind, ref) {
  const action = PRODUCTIVE_ACTIONS[kind];
  if (!action) throw httpError("Unknown activity", 400);

  const cleanRef = String(ref || "").slice(0, 160).toLowerCase();
  if (!cleanRef) throw httpError("Missing activity reference", 400);

  return withTransaction(async (client) => {
    const today = dayKey();

    const used = await client.query(
      "SELECT count(*)::int AS n FROM productive_log WHERE user_id = $1 AND kind = $2 AND day = $3",
      [uid, kind, today]
    );

    const quiet = async (capped) => ({
      kind,
      xpGained: 0,
      capped,
      alreadyCounted: !capped,
      attributes: await readAttributes(client, uid),
    });

    if (used.rows[0].n >= action.dailyCap) return quiet(true);

    const claim = await client.query(
      `INSERT INTO productive_log (user_id, kind, ref, day, attribute, xp_gained)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (user_id, kind, ref, day) DO NOTHING
       RETURNING ref`,
      [uid, kind, cleanRef, today, action.attribute, action.xp]
    );

    // Nothing inserted: this exact card/site already paid out today.
    if (!claim.rowCount) return quiet(false);

    const userResult = await client.query(
      "SELECT level, xp_into_level FROM users WHERE uid = $1 FOR UPDATE",
      [uid]
    );
    if (!userResult.rowCount) throw httpError("User profile not found", 404);

    const progressed = applyXp(userResult.rows[0].level, userResult.rows[0].xp_into_level, action.xp);

    const updated = await client.query(
      `UPDATE users SET level = $2, xp_into_level = $3, xp = xp + $4
        WHERE uid = $1
        RETURNING level, xp, xp_into_level, gold, total_completed`,
      [uid, progressed.level, progressed.xpIntoLevel, action.xp]
    );

    const attributeResult = await bumpAttribute(client, uid, action.attribute, action.xp);
    const stats = updated.rows[0];

    return {
      kind,
      xpGained: action.xp,
      capped: false,
      alreadyCounted: false,
      leveledUp: progressed.levelsGained > 0,
      attribute: attributeResult,
      stats: {
        level: stats.level,
        xp: stats.xp,
        xpIntoLevel: stats.xp_into_level,
        gold: stats.gold,
        totalCompleted: stats.total_completed,
      },
      attributes: await readAttributes(client, uid),
    };
  });
}

/**
 * Pays XP for checking off a habit, feeding the same progression as quests.
 *
 * Idempotent per (user, habit, day) via the habit_rewards primary key. That
 * ledger is independent of habit_logs, so undoing a check-in and redoing it -
 * or deleting the habit - never pays twice. Only check-ins for "today" (with a
 * day of slack either side for timezones) pay, so backfilling old days can't
 * farm XP, and HABIT_DAILY_CAP bounds how many distinct habits pay per day.
 *
 * Accepts an optional client so the caller can pay inside the same
 * transaction that inserted the log.
 */
async function rewardHabitCheckIn(uid, habit, date, existingClient) {
  const run = async (client) => {
    const readStats = async () => {
      const r = await client.query(
        "SELECT level, xp, xp_into_level, gold, total_completed FROM users WHERE uid = $1",
        [uid]
      );
      return r.rows[0] ? serializeStats(r.rows[0]) : undefined;
    };

    const quiet = async (reason) => ({
      habitId: habit.id,
      xpGained: 0,
      goldGained: 0,
      reason,
      leveledUp: false,
      stats: await readStats(),
      attributes: await readAttributes(client, uid),
    });

    const today = dayKey();
    if (Math.abs(daysBetween(today, date)) > 1) return quiet("not_today");

    // Lock the user row first: serialises concurrent check-ins so the daily
    // cap count below can't be raced past.
    const userResult = await client.query(
      `SELECT level, xp_into_level, streak_current, streak_longest, last_active_day
         FROM users WHERE uid = $1 FOR UPDATE`,
      [uid]
    );
    if (!userResult.rowCount) throw httpError("User profile not found", 404);
    const user = userResult.rows[0];

    const used = await client.query(
      "SELECT count(*)::int AS n FROM habit_rewards WHERE user_id = $1 AND day = $2",
      [uid, date]
    );
    if (used.rows[0].n >= HABIT_DAILY_CAP) return quiet("capped");

    const attribute = HABIT_CATEGORY_ATTRIBUTE[habit.category] || "focus";
    const xpGained = HABIT_XP;
    const goldGained = Math.round(xpGained * GOLD_RATIO);

    const claim = await client.query(
      `INSERT INTO habit_rewards (user_id, habit_id, day, attribute, xp_gained, gold_gained)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (user_id, habit_id, day) DO NOTHING
       RETURNING day`,
      [uid, habit.id, date, attribute, xpGained, goldGained]
    );
    if (!claim.rowCount) return quiet("already_rewarded");

    const streak = nextStreak(
      {
        current: user.streak_current,
        longest: user.streak_longest,
        lastActiveDay: asDayKey(user.last_active_day),
      },
      today
    );
    const progressed = applyXp(user.level, user.xp_into_level, xpGained);

    const updated = await client.query(
      `UPDATE users
          SET level = $2, xp_into_level = $3, xp = xp + $4, gold = gold + $5,
              streak_current = $6, streak_longest = $7, last_active_day = $8
        WHERE uid = $1
        RETURNING level, xp, xp_into_level, gold, total_completed`,
      [uid, progressed.level, progressed.xpIntoLevel, xpGained, goldGained,
       streak.current, streak.longest, today]
    );

    const attributeResult = await bumpAttribute(client, uid, attribute, xpGained);

    await client.query(
      "INSERT INTO transactions (user_id, amount, reason) VALUES ($1, $2, $3)",
      [uid, goldGained, `Habit: ${habit.name}`]
    );

    return {
      habitId: habit.id,
      xpGained,
      goldGained,
      leveledUp: progressed.levelsGained > 0,
      levelsGained: progressed.levelsGained,
      attribute: attributeResult,
      stats: serializeStats(updated.rows[0]),
      attributes: await readAttributes(client, uid),
      streak,
    };
  };

  return existingClient ? run(existingClient) : withTransaction(run);
}

function serializeStats(row) {
  return {
    level: row.level,
    xp: row.xp,
    xpIntoLevel: row.xp_into_level,
    gold: row.gold,
    totalCompleted: row.total_completed,
  };
}

module.exports = { completeTask, studyDeck, completeEvent, logProductive, rewardHabitCheckIn };
