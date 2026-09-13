const express = require("express");
const { verifyToken } = require("../middleware/authMiddleware");
const { uploadImage } = require("../controllers/uploadController");

const router = express.Router();

router.use(verifyToken);

// Base64 images blow straight past the global 100kb JSON limit, so this route
// gets its own parser with enough headroom for an ~8MB original.
router.post("/", express.json({ limit: "12mb" }), uploadImage);

module.exports = router;
