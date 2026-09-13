// Vercel serverless entry point. The Express app is exported without calling
// app.listen(), because Vercel owns the HTTP server lifecycle.
module.exports = require("../src/app");
