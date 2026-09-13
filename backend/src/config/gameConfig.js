/**
 * Single source of truth for all RPG maths.
 *
 * Everything here is server-only on purpose. The client never sends XP or gold,
 * it only says "I completed task X" - otherwise stats are trivially forged by
 * replaying a request with a bigger number in the body.
 */

// XP needed to climb from `level` to `level + 1`. Non-linear, so each level
// costs more than the last: L1->2 = 100, L2->3 = 282, L9->10 = 2700.
const xpForLevel = (level) => Math.floor(100 * Math.pow(level, 1.5));

const DIFFICULTY_XP = {
  trivial: 5,
  easy: 10,
  medium: 25,
  hard: 50,
  epic: 100,
};

const ATTRIBUTES = ["intellect", "strength", "focus", "charisma"];

// Scheduled events pay by how important the user said they were.
const IMPORTANCE_XP = {
  low: 10,
  medium: 25,
  high: 50,
  critical: 80,
};

/**
 * Small rewards for productive activity that isn't a quest: building a deck,
 * or opening a study/coding site from the in-room browser.
 *
 * `dailyCap` is the number of DISTINCT things of that kind that can pay out in
 * one day. Combined with the productive_log primary key (which stops the same
 * card or the same site paying twice), this keeps the drip meaningful without
 * letting anyone grind levels by refreshing a page.
 */
const PRODUCTIVE_ACTIONS = {
  flashcard_created: { xp: 3, attribute: "intellect", dailyCap: 10 },
  study_site: { xp: 5, attribute: "focus", dailyCap: 5 },
  coding_site: { xp: 5, attribute: "intellect", dailyCap: 5 },
};

const GOLD_RATIO = 0.6;

// Habit check-ins: flat XP, paid at most once per habit per day, and for at
// most HABIT_DAILY_CAP distinct habits per day so spawning habits can't farm.
const HABIT_XP = 10;
const HABIT_DAILY_CAP = 10;
const HABIT_CATEGORY_ATTRIBUTE = {
  general: "focus",
  health: "strength",
  fitness: "strength",
  learning: "intellect",
  mindfulness: "focus",
  creativity: "charisma",
};

// Consistency bonus, capped at a 1.35x multiplier on day 7 so a long streak
// stays rewarding without letting XP run away exponentially.
const STREAK_BONUS_PER_DAY = 0.05;
const STREAK_BONUS_MAX_DAYS = 7;

const streakMultiplier = (streak) =>
  1 + Math.min(Math.max(streak, 0), STREAK_BONUS_MAX_DAYS) * STREAK_BONUS_PER_DAY;

/**
 * Applies XP to a level/progress pair, rolling over as many levels as the XP
 * covers (a single epic quest can push a low-level character up twice).
 */
function applyXp(level, xpIntoLevel, gained) {
  let nextLevel = level;
  let progress = xpIntoLevel + gained;
  let levelsGained = 0;

  while (progress >= xpForLevel(nextLevel)) {
    progress -= xpForLevel(nextLevel);
    nextLevel += 1;
    levelsGained += 1;
  }

  return { level: nextLevel, xpIntoLevel: progress, levelsGained };
}

/** UTC day key, e.g. "2026-09-13". Used for streaks and the activity calendar. */
const dayKey = (date = new Date()) => date.toISOString().slice(0, 10);

/** Whole days between two day keys. */
function daysBetween(fromKey, toKey) {
  const from = Date.parse(`${fromKey}T00:00:00Z`);
  const to = Date.parse(`${toKey}T00:00:00Z`);
  return Math.round((to - from) / 86400000);
}

const DEFAULT_ATTRIBUTES = () =>
  Object.fromEntries(ATTRIBUTES.map((name) => [name, { level: 1, xp: 0 }]));

const DEFAULT_STREAK = () => ({ current: 0, longest: 0, lastActiveDay: null });

module.exports = {
  xpForLevel,
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
  DEFAULT_ATTRIBUTES,
  DEFAULT_STREAK,
};
