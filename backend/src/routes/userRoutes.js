const express = require("express");
const { verifyToken } = require("../middleware/authMiddleware");
const { getMe, putSettings } = require("../controllers/userController");

const router = express.Router();

// Protect these routes with the Firebase token verification middleware
router.get("/me", verifyToken, getMe);
router.put("/settings", verifyToken, putSettings);

module.exports = router;
