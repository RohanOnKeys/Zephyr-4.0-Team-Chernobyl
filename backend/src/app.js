const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");
require("dotenv").config();

const { initFirebaseAdmin } = require("./config/firebaseAdmin");
const authRoutes = require("./routes/authRoutes");
const userRoutes = require("./routes/userRoutes");
const taskRoutes = require("./routes/taskRoutes");
const habitRoutes = require("./routes/habitRoutes");
const logRoutes = require("./routes/logRoutes");
const integrationRoutes = require("./routes/integrationRoutes");
const deckRoutes = require("./routes/deckRoutes");
const eventRoutes = require("./routes/eventRoutes");
const browserRoutes = require("./routes/browserRoutes");
const uploadRoutes = require("./routes/uploadRoutes");
const { errorHandler, notFoundHandler } = require("./middleware/errorMiddleware");

// Initialize Firebase Admin SDK
initFirebaseAdmin();

const app = express();

// Security Middlewares
app.use(helmet());

// Rate Limiting
// Local dev traffic (page loads, HMR re-fetches, repeated manual testing)
// easily exceeds a production-sized budget on one IP, so it's much looser
// outside of NODE_ENV=production rather than tripping constantly in dev.
const isProduction = process.env.NODE_ENV === "production";
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: isProduction ? 100 : 2000, // limit each IP to N requests per windowMs
  message: { error: "Too many requests from this IP, please try again later." },
  // Preflights aren't real work and shouldn't count toward the budget.
  skip: (req) => req.method === "OPTIONS",
});

// CORS Config
// Reflects whatever origin the request came from instead of one hardcoded
// port, so any teammate's dev server (different port, different machine)
// can talk to this backend. Protected routes still require a valid Firebase
// ID token, so this doesn't loosen who can actually read/write data.
app.use(cors({
  origin: true,
  credentials: true
}));

// Mounted AFTER cors on purpose. When the limiter runs first its 429 response
// carries no CORS headers, so the browser reports a rate-limit rejection as a
// misleading "No 'Access-Control-Allow-Origin' header" error instead.
app.use("/api/", limiter);

// Body Parsers
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Health Check Endpoint
app.get("/api/health", (req, res) => {
  res.status(200).json({ status: "ok", timestamp: new Date().toISOString() });
});

// API Routes
app.use("/api/auth", authRoutes);
app.use("/api/user", userRoutes);
app.use("/api/tasks", taskRoutes);
app.use("/api/habits", habitRoutes);
app.use("/api/logs", logRoutes);
app.use("/api/integrations", integrationRoutes);
app.use("/api/decks", deckRoutes);
app.use("/api/events", eventRoutes);
app.use("/api/browser", browserRoutes);
app.use("/api/upload", uploadRoutes);

// Error Handling
app.use(notFoundHandler);
app.use(errorHandler);

module.exports = app;
