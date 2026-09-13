-- Scheduled calendar events, and the log that rewards productive activity.

CREATE TABLE IF NOT EXISTS events (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       TEXT NOT NULL REFERENCES users(uid) ON DELETE CASCADE,
  title         TEXT NOT NULL CHECK (length(btrim(title)) > 0 AND length(title) <= 120),
  notes         TEXT NOT NULL DEFAULT '',
  -- Drives both the colour coding in the UI and the size of the reward.
  importance    TEXT NOT NULL DEFAULT 'medium'
                CHECK (importance IN ('low', 'medium', 'high', 'critical')),
  attribute     TEXT,
  scheduled_for DATE NOT NULL,
  start_time    TIME,
  end_time      TIME,
  completed     BOOLEAN NOT NULL DEFAULT FALSE,
  completed_at  TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS events_user_day_idx ON events (user_id, scheduled_for);

-- One row per rewarded productive action per day.
--
-- The composite primary key is the anti-farm mechanism: `ref` is the thing that
-- earned it (a card id, or a site's hostname), so re-adding the same card or
-- revisiting the same site on the same day conflicts and pays nothing.
CREATE TABLE IF NOT EXISTS productive_log (
  user_id    TEXT NOT NULL REFERENCES users(uid) ON DELETE CASCADE,
  kind       TEXT NOT NULL,
  ref        TEXT NOT NULL,
  day        DATE NOT NULL,
  attribute  TEXT NOT NULL,
  xp_gained  INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, kind, ref, day)
);

CREATE INDEX IF NOT EXISTS productive_log_user_day_idx ON productive_log (user_id, day);
