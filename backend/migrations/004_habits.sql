-- Habit tracker, ported from the Firestore `habits` and `habitLogs` collections.
--
-- Column names are snake_case; controllers map them back to the original
-- camelCase document fields so the API contract is unchanged.

CREATE TABLE IF NOT EXISTS habits (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id        TEXT NOT NULL REFERENCES users(uid) ON DELETE CASCADE,
  name           TEXT NOT NULL CHECK (length(btrim(name)) > 0 AND length(name) <= 200),
  description    TEXT NOT NULL DEFAULT '',
  category       TEXT NOT NULL DEFAULT 'general',
  icon           TEXT NOT NULL DEFAULT 'sparkles',
  color          TEXT NOT NULL,
  frequency      TEXT NOT NULL DEFAULT 'daily' CHECK (frequency IN ('daily', 'weekly')),
  target_days    INTEGER NOT NULL DEFAULT 7 CHECK (target_days BETWEEN 1 AND 7),
  -- "HH:MM" in the server's local clock, matched by the reminder job.
  reminder_time  TEXT CHECK (reminder_time IS NULL OR reminder_time ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'),
  is_archived    BOOLEAN NOT NULL DEFAULT FALSE,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS habits_user_idx ON habits (user_id, is_archived, created_at);
CREATE INDEX IF NOT EXISTS habits_reminder_idx ON habits (reminder_time) WHERE reminder_time IS NOT NULL AND NOT is_archived;

-- One completion per habit per day: createLog was already idempotent on
-- (userId, habitId, date); the unique constraint now enforces it under races.
CREATE TABLE IF NOT EXISTS habit_logs (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     TEXT NOT NULL REFERENCES users(uid) ON DELETE CASCADE,
  habit_id    UUID NOT NULL REFERENCES habits(id) ON DELETE CASCADE,
  date        DATE NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (habit_id, date)
);

CREATE INDEX IF NOT EXISTS habit_logs_user_date_idx ON habit_logs (user_id, date);

-- Anti-farm ledger for habit XP. Deliberately NOT a foreign key to habits or
-- habit_logs: undoing a log (or deleting the habit) must not free the day up
-- to be paid again.
CREATE TABLE IF NOT EXISTS habit_rewards (
  user_id     TEXT NOT NULL REFERENCES users(uid) ON DELETE CASCADE,
  habit_id    UUID NOT NULL,
  day         DATE NOT NULL,
  attribute   TEXT NOT NULL,
  xp_gained   INTEGER NOT NULL CHECK (xp_gained >= 0),
  gold_gained INTEGER NOT NULL CHECK (gold_gained >= 0),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, habit_id, day)
);

CREATE INDEX IF NOT EXISTS habit_rewards_user_day_idx ON habit_rewards (user_id, day);
