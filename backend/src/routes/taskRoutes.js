const express = require("express");
const { verifyToken } = require("../middleware/authMiddleware");
const {
  getTasks,
  createTask,
  updateTask,
  deleteTask,
  completeTask,
  getActivity,
} = require("../controllers/taskController");

const router = express.Router();

// All task routes require authentication
router.use(verifyToken);

router.get("/", getTasks);
// Declared before "/:id" so "activity" isn't swallowed as a task id.
router.get("/activity", getActivity);
router.post("/", createTask);
router.post("/:id/complete", completeTask);
router.put("/:id", updateTask);
router.delete("/:id", deleteTask);

module.exports = router;
