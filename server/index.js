// ─────────────────────────────────────────────────────────────
//  server/index.js  —  Entry point: starts the HTTP server
//  The actual Express app lives in server/app.js so it can be
//  imported by tests without binding to a port.
// ─────────────────────────────────────────────────────────────

const { app } = require("./app");

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`\n🌿 CarbonLens v2.0 → http://localhost:${PORT}`);
  console.log(`🔒 Security        → Helmet + RateLimit + XSS + Sanitization\n`);
});