const express = require("express");
const { verifyToken } = require("../middleware/authMiddleware");
const {
  listDecks,
  createDeck,
  updateDeck,
  deleteDeck,
  listCards,
  createCard,
  updateCard,
  deleteCard,
  studyDeck,
} = require("../controllers/deckController");

const router = express.Router();

router.use(verifyToken);

router.get("/", listDecks);
router.post("/", createDeck);
router.put("/:id", updateDeck);
router.delete("/:id", deleteDeck);

router.post("/:id/study", studyDeck);

router.get("/:id/cards", listCards);
router.post("/:id/cards", createCard);
router.put("/:id/cards/:cardId", updateCard);
router.delete("/:id/cards/:cardId", deleteCard);

module.exports = router;
