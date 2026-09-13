-- Life RPG initial schema.
--
-- Identity lives in Firebase Auth; `users.uid` is the Firebase UID and is the
-- owner key for every other table. Every foreign key cascades, so deleting an
-- account leaves nothing orphaned behind.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS users (
  uid              TEXT PRIMARY KEY,
  email            TEXT NOT NULL,
  display_name     TEXT NOT NULL DEFAULT 'Hero',

  level            INTEGER NOT NULL DEFAULT 1 CHECK (level >= 1),
  -- Lifetime XP earned, never spent. Kept alongside xp_into_level so the
  -- progress bar and the all-time total don't have to be derived from each other.
  xp               INTEGER NOT NULL DEFAULT 0 CHECK (xp >= 0),
  xp_into_level    INTEGER NOT NULL DEFAULT 0 CHECK (xp_into_level >= 0),
  gold             INTEGER NOT NULL DEFAULT 0 CHECK (gold >= 0),
  total_completed  INTEGER NOT NULL DEFAULT 0 CHECK (total_completed >= 0),

  streak_current   INTEGER NOT NULL DEFAULT 0 CHECK (streak_current >= 0),
  streak_longest   INTEGER NOT NULL DEFAULT 0 CHECK (streak_longest >= 0),
  last_active_day  DATE,

  github_username   TEXT,
  leetcode_username TEXT,

  settings         JSONB NOT NULL DEFAULT '{}'::jsonb,

  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_login       TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- One row per character stat. A table rather than columns so new attributes
-- can be added without a schema change.
CREATE TABLE IF NOT EXISTS attributes (
  uid    TEXT NOT NULL REFERENCES users(uid) ON DELETE CASCADE,
  name   TEXT NOT NULL,
  level  INTEGER NOT NULL DEFAULT 1 CHECK (level >= 1),
  xp     INTEGER NOT NULL DEFAULT 0 CHECK (xp >= 0),
  PRIMARY KEY (uid, name)
);

CREATE TABLE IF NOT EXISTS tasks (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      TEXT NOT NULL REFERENCES users(uid) ON DELETE CASCADE,
  title        TEXT NOT NULL CHECK (length(btrim(title)) > 0 AND length(title) <= 120),
  description  TEXT NOT NULL DEFAULT '',
  type         TEXT NOT NULL CHECK (type IN ('habit', 'daily', 'todo')),
  difficulty   TEXT NOT NULL DEFAULT 'easy'
               CHECK (difficulty IN ('trivial', 'easy', 'medium', 'hard', 'epic')),
  attribute    TEXT,
  completed    BOOLEAN NOT NULL DEFAULT FALSE,
  completed_at TIMESTAMPTZ,
  due_date     DATE,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS tasks_user_idx ON tasks (user_id, completed, created_at DESC);

-- Immutable audit log of every reward ever paid. Powers the streak calendar and
-- the activity widgets without re-reading the tasks table.
CREATE TABLE IF NOT EXISTS completions (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         TEXT NOT NULL REFERENCES users(uid) ON DELETE CASCADE,
  task_id         UUID REFERENCES tasks(id) ON DELETE SET NULL,
  title_snapshot  TEXT NOT NULL,
  attribute       TEXT,
  difficulty      TEXT NOT NULL,
  xp_awarded      INTEGER NOT NULL,
  gold_awarded    INTEGER NOT NULL,
  streak_at_time  INTEGER NOT NULL,
  day             DATE NOT NULL,
  completed_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS completions_user_time_idx ON completions (user_id, completed_at DESC);
CREATE INDEX IF NOT EXISTS completions_user_day_idx  ON completions (user_id, day);

CREATE TABLE IF NOT EXISTS decks (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      TEXT NOT NULL REFERENCES users(uid) ON DELETE CASCADE,
  title        TEXT NOT NULL CHECK (length(btrim(title)) > 0 AND length(title) <= 80),
  description  TEXT NOT NULL DEFAULT '',
  last_studied TIMESTAMPTZ,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS decks_user_idx ON decks (user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS cards (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  deck_id          UUID NOT NULL REFERENCES decks(id) ON DELETE CASCADE,
  front            TEXT NOT NULL CHECK (length(btrim(front)) > 0),
  back             TEXT NOT NULL DEFAULT '',
  image_url        TEXT,
  image_delete_url TEXT,
  has_latex        BOOLEAN NOT NULL DEFAULT FALSE,
  position         INTEGER NOT NULL DEFAULT 0,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS cards_deck_idx ON cards (deck_id, position);

-- The composite primary key is what makes the daily study reward idempotent:
-- a second study of the same deck on the same day simply conflicts.
CREATE TABLE IF NOT EXISTS deck_studies (
  user_id        TEXT NOT NULL REFERENCES users(uid) ON DELETE CASCADE,
  deck_id        UUID NOT NULL REFERENCES decks(id) ON DELETE CASCADE,
  day            DATE NOT NULL,
  cards_reviewed INTEGER NOT NULL DEFAULT 0,
  xp_gained      INTEGER NOT NULL DEFAULT 0,
  studied_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, deck_id, day)
);

CREATE TABLE IF NOT EXISTS shop_items (
  id          TEXT PRIMARY KEY,
  name        TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  cost        INTEGER NOT NULL CHECK (cost >= 0),
  kind        TEXT NOT NULL,
  asset       TEXT,
  min_level   INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS inventory (
  user_id     TEXT NOT NULL REFERENCES users(uid) ON DELETE CASCADE,
  item_id     TEXT NOT NULL REFERENCES shop_items(id) ON DELETE CASCADE,
  equipped    BOOLEAN NOT NULL DEFAULT FALSE,
  acquired_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, item_id)
);

-- Ledger of every gold movement, so a balance can always be explained.
CREATE TABLE IF NOT EXISTS transactions (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    TEXT NOT NULL REFERENCES users(uid) ON DELETE CASCADE,
  amount     INTEGER NOT NULL,
  reason     TEXT NOT NULL,
  item_id    TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS transactions_user_idx ON transactions (user_id, created_at DESC);
