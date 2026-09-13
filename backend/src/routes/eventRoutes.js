const express = require("express");
const { verifyToken } = require("../middleware/authMiddleware");
const {
  listEvents,
  createEvent,
  updateEvent,
  deleteEvent,
  completeEvent,
  logProductive,
  getRules,
} = require("../controllers/eventController");

const router = express.Router();

router.use(verifyToken);

// Declared before "/:id" so these aren't swallowed as event ids.
router.get("/rules", getRules);
router.post("/productive", logProductive);

router.get("/", listEvents);
router.post("/", createEvent);
router.post("/:id/complete", completeEvent);
router.put("/:id", updateEvent);
router.delete("/:id", deleteEvent);

module.exports = router;
