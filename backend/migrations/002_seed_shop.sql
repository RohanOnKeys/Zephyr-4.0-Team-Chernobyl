-- Starter reward catalogue. Idempotent so re-running a migration is harmless.

INSERT INTO shop_items (id, name, description, cost, kind, asset, min_level) VALUES
  ('theme_dusk',      'Dusk Theme',        'Warm sunset light through the window.',        150, 'theme', 'dusk',      1),
  ('theme_midnight',  'Midnight Theme',    'Deep blues for late-night study sessions.',    300, 'theme', 'midnight',  3),
  ('theme_sakura',    'Sakura Theme',      'Soft pink blossom light.',                     450, 'theme', 'sakura',    5),
  ('decor_plant',     'Desk Plant',        'A small monstera for the corner of the desk.', 120, 'decor', 'plant',     1),
  ('decor_poster',    'Retro Poster',      'A framed print above the bookshelf.',          200, 'decor', 'poster',    2),
  ('decor_lamp',      'Neon Lamp',         'A soft glow for the shelf.',                   260, 'decor', 'lamp',      4),
  ('decor_cat',       'Sleeping Cat',      'She naps on the rug while you work.',          500, 'decor', 'cat',       6),
  ('badge_starter',   'First Steps',       'Completed your first quest.',                   50, 'badge', 'starter',   1),
  ('badge_streak',    'Unbroken',          'For those who show up every day.',             400, 'badge', 'streak',    5),
  ('badge_scholar',   'Scholar',           'Awarded for serious flashcard devotion.',      350, 'badge', 'scholar',   4)
ON CONFLICT (id) DO NOTHING;
