const { query } = require("../config/db");
const progression = require("../services/progressionService");

/** Postgres rejects a malformed uuid with 22P02; that's a 404, not a 500. */
const isBadUuid = (error) => error.code === "22P02";

const serializeDeck = (row) => ({
  id: row.id,
  title: row.title,
  description: row.description,
  // Counted by the query rather than stored, so it can never drift out of sync
  // with the cards that actually exist.
  cardCount: row.card_count ?? 0,
  lastStudied: row.last_studied,
  studiedToday: row.studied_today ?? false,
  createdAt: row.created_at,
});

const serializeCard = (row) => ({
  id: row.id,
  deckId: row.deck_id,
  front: row.front,
  back: row.back,
  imageUrl: row.image_url,
  imageDeleteUrl: row.image_delete_url,
  hasLatex: row.has_latex,
  order: row.position,
  createdAt: row.created_at,
});

/** Confirms the deck exists and belongs to the caller. */
async function assertOwned(uid, deckId) {
  try {
    const result = await query("SELECT id FROM decks WHERE id = $1 AND user_id = $2", [
      deckId,
      uid,
    ]);
    if (!result.rowCount) {
      const error = new Error("Deck not found");
      error.statusCode = 404;
      throw error;
    }
  } catch (error) {
    if (isBadUuid(error)) {
      const notFound = new Error("Deck not found");
      notFound.statusCode = 404;
      throw notFound;
    }
    throw error;
  }
}

const listDecks = async (req, res, next) => {
  try {
    // One query with a LEFT JOIN instead of a read per deck, plus a flag for
    // whether today's study reward has already been claimed.
    const result = await query(
      `SELECT d.*, count(c.id)::int AS card_count,
              (s.day IS NOT NULL) AS studied_today
         FROM decks d
         LEFT JOIN cards c ON c.deck_id = d.id
         LEFT JOIN deck_studies s
                ON s.deck_id = d.id AND s.user_id = d.user_id AND s.day = current_date
        WHERE d.user_id = $1
        GROUP BY d.id, s.day
        ORDER BY d.created_at DESC`,
      [req.user.uid]
    );
    res.status(200).json(result.rows.map(serializeDeck));
  } catch (error) {
    next(error);
  }
};

const createDeck = async (req, res, next) => {
  try {
    const title = typeof req.body.title === "string" ? req.body.title.trim() : "";

    if (!title) return res.status(400).json({ error: "Deck title is required" });
    if (title.length > 80) {
      return res.status(400).json({ error: "Title must be 80 characters or fewer" });
    }

    const result = await query(
      `INSERT INTO decks (user_id, title, description) VALUES ($1, $2, $3) RETURNING *`,
      [req.user.uid, title, req.body.description?.slice(0, 300) || ""]
    );

    res.status(201).json(serializeDeck(result.rows[0]));
  } catch (error) {
    next(error);
  }
};

const updateDeck = async (req, res, next) => {
  try {
    const { title, description } = req.body;

    if (title !== undefined) {
      const clean = typeof title === "string" ? title.trim() : "";
      if (!clean) return res.status(400).json({ error: "Title cannot be empty" });
      if (clean.length > 80) {
        return res.status(400).json({ error: "Title must be 80 characters or fewer" });
      }
    }

    const result = await query(
      `UPDATE decks SET title = COALESCE($3, title), description = COALESCE($4, description)
        WHERE id = $1 AND user_id = $2 RETURNING *`,
      [req.params.id, req.user.uid, title?.trim() ?? null, description ?? null]
    );

    if (!result.rowCount) return res.status(404).json({ error: "Deck not found" });
    res.status(200).json(serializeDeck(result.rows[0]));
  } catch (error) {
    if (isBadUuid(error)) return res.status(404).json({ error: "Deck not found" });
    next(error);
  }
};

const deleteDeck = async (req, res, next) => {
  try {
    // Cards and study logs go with it via ON DELETE CASCADE.
    const result = await query(
      "DELETE FROM decks WHERE id = $1 AND user_id = $2 RETURNING id",
      [req.params.id, req.user.uid]
    );

    if (!result.rowCount) return res.status(404).json({ error: "Deck not found" });
    res.status(200).json({ message: "Deck deleted" });
  } catch (error) {
    if (isBadUuid(error)) return res.status(404).json({ error: "Deck not found" });
    next(error);
  }
};

const listCards = async (req, res, next) => {
  try {
    await assertOwned(req.user.uid, req.params.id);
    const result = await query(
      "SELECT * FROM cards WHERE deck_id = $1 ORDER BY position, created_at",
      [req.params.id]
    );
    res.status(200).json(result.rows.map(serializeCard));
  } catch (error) {
    if (error.statusCode) return res.status(error.statusCode).json({ error: error.message });
    next(error);
  }
};

const createCard = async (req, res, next) => {
  try {
    await assertOwned(req.user.uid, req.params.id);

    const front = typeof req.body.front === "string" ? req.body.front.trim() : "";
    if (!front) return res.status(400).json({ error: "The front of the card is required" });

    const result = await query(
      `INSERT INTO cards (deck_id, front, back, image_url, image_delete_url, has_latex, position)
       VALUES ($1, $2, $3, $4, $5, $6,
               COALESCE($7, (SELECT COALESCE(max(position), 0) + 1 FROM cards WHERE deck_id = $1)))
       RETURNING *`,
      [
        req.params.id,
        front,
        req.body.back?.trim() || "",
        req.body.imageUrl || null,
        req.body.imageDeleteUrl || null,
        Boolean(req.body.hasLatex),
        req.body.order ?? null,
      ]
    );

    res.status(201).json(serializeCard(result.rows[0]));
  } catch (error) {
    if (error.statusCode) return res.status(error.statusCode).json({ error: error.message });
    next(error);
  }
};

const updateCard = async (req, res, next) => {
  try {
    await assertOwned(req.user.uid, req.params.id);

    const { front, back, imageUrl, imageDeleteUrl, hasLatex, order } = req.body;

    if (front !== undefined && !String(front).trim()) {
      return res.status(400).json({ error: "The front of the card cannot be empty" });
    }

    const result = await query(
      `UPDATE cards SET
         front            = COALESCE($3, front),
         back             = COALESCE($4, back),
         image_url        = CASE WHEN $5::boolean THEN $6 ELSE image_url END,
         image_delete_url = CASE WHEN $5::boolean THEN $7 ELSE image_delete_url END,
         has_latex        = COALESCE($8, has_latex),
         position         = COALESCE($9, position)
       WHERE id = $1 AND deck_id = $2
       RETURNING *`,
      [
        req.params.cardId,
        req.params.id,
        front?.trim() ?? null,
        back ?? null,
        imageUrl !== undefined,
        imageUrl || null,
        imageDeleteUrl || null,
        hasLatex ?? null,
        order ?? null,
      ]
    );

    if (!result.rowCount) return res.status(404).json({ error: "Card not found" });
    res.status(200).json(serializeCard(result.rows[0]));
  } catch (error) {
    if (error.statusCode) return res.status(error.statusCode).json({ error: error.message });
    if (isBadUuid(error)) return res.status(404).json({ error: "Card not found" });
    next(error);
  }
};

const deleteCard = async (req, res, next) => {
  try {
    await assertOwned(req.user.uid, req.params.id);

    const result = await query(
      "DELETE FROM cards WHERE id = $1 AND deck_id = $2 RETURNING id",
      [req.params.cardId, req.params.id]
    );

    if (!result.rowCount) return res.status(404).json({ error: "Card not found" });
    res.status(200).json({ message: "Card deleted" });
  } catch (error) {
    if (error.statusCode) return res.status(error.statusCode).json({ error: error.message });
    if (isBadUuid(error)) return res.status(404).json({ error: "Card not found" });
    next(error);
  }
};

const studyDeck = async (req, res, next) => {
  try {
    const result = await progression.studyDeck(
      req.user.uid,
      req.params.id,
      req.body?.cardsReviewed
    );
    res.status(200).json(result);
  } catch (error) {
    if (error.statusCode) return res.status(error.statusCode).json({ error: error.message });
    next(error);
  }
};

module.exports = {
  listDecks,
  createDeck,
  updateDeck,
  deleteDeck,
  listCards,
  createCard,
  updateCard,
  deleteCard,
  studyDeck,
};
