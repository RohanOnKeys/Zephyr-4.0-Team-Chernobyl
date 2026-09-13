const express = require("express");
const { verifyToken } = require("../middleware/authMiddleware");
const { frameCheck } = require("../controllers/browserController");

const router = express.Router();

// Authenticated so the endpoint can't be used as an anonymous URL prober.
router.get("/frame-check", verifyToken, frameCheck);

module.exports = router;
