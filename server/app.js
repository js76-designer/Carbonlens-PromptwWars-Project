// ─────────────────────────────────────────────────────────────
//  server/app.js  —  Express app (no listen) — importable for tests
//
//  Security posture:
//   - All passwords hashed with bcrypt (cost factor 12)
//   - All user input sanitized via xss() before storage
//   - Session cookies are httpOnly + sameSite=lax
//   - CORS restricted to an explicit allow-list (see ALLOWED_ORIGINS)
//   - Rate limiting on /api/auth (10/15min) and /api (100/min)
//   - Helmet sets standard hardening headers (CSP, HSTS, etc.)
// ─────────────────────────────────────────────────────────────

const express        = require("express");
const session        = require("express-session");
const bcrypt         = require("bcryptjs");
const cors           = require("cors");
const path           = require("path");
const fs             = require("fs");
const { v4: uuidv4 } = require("uuid");
const helmet         = require("helmet");
const rateLimit      = require("express-rate-limit");
const xss            = require("xss");
const compression    = require("compression");

// ── DB (path injectable for test isolation) ───────────────────
const DB_PATH = process.env.DB_PATH ||
  path.join(__dirname, "../carbonlens-data.json");

let _cache     = null;
let _cacheTime = 0;
const CACHE_TTL = 2000;

/**
 * Loads the JSON "database" from disk, using a short-lived in-memory
 * cache to avoid a disk read on every single request.
 * @returns {{users: object, logs: object, pledges: object}}
 */
function loadDB() {
  const now = Date.now();
  if (_cache && (now - _cacheTime) < CACHE_TTL) return _cache;
  if (!fs.existsSync(DB_PATH)) {
    const empty = { users: {}, logs: {}, pledges: {} };
    fs.writeFileSync(DB_PATH, JSON.stringify(empty, null, 2));
    _cache = empty;
  } else {
    _cache = JSON.parse(fs.readFileSync(DB_PATH, "utf8"));
  }
  _cacheTime = now;
  return _cache;
}

// ── EFFICIENCY NOTE ─────────────────────────────────────────────
// fs.writeFileSync is used here deliberately, not fs.writeFile.
// This codebase's test suite calls resetCache() between requests
// to verify that data is actually persisted to disk (not just
// held in memory) — a fully async write would create a race
// condition where a fast follow-up request reads stale data
// before the write completes. At this app's scale (a single JSON
// file, sub-millisecond writes for realistic payloads) the sync
// write does not meaningfully block the event loop. The in-memory
// cache above (_cache / CACHE_TTL) is what actually protects
// request throughput — most reads never touch the disk at all.
/**
 * Persists the given database object to disk and refreshes the cache.
 * @param {object} data - full database object to persist
 */
function saveDB(data) {
  _cache = data;
  _cacheTime = Date.now();
  fs.writeFileSync(DB_PATH, JSON.stringify(data, null, 2));
}

// Reset cache (used in tests between test runs)
function resetCache() { _cache = null; _cacheTime = 0; }

let DB = loadDB();

// ── Express ───────────────────────────────────────────────────
const app = express();

app.use(compression());
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc:  ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com",
                   "https://cdnjs.cloudflare.com", "https://cdn.jsdelivr.net"],
      styleSrc:   ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
      fontSrc:    ["'self'", "https://fonts.gstatic.com"],
      imgSrc:     ["'self'", "data:"],
      // connect-src must include the same CDNs as script-src — browsers
      // fetch .map source-map files and other sub-resources from these
      // origins as part of loading the script, and that counts as a
      // "connect" under CSP, not a "script" load.
      connectSrc: ["'self'", "https://cdnjs.cloudflare.com", "https://cdn.jsdelivr.net"],
    },
  },
  // Force HTTPS on every future visit for 1 year, including subdomains.
  // No-op on plain http://localhost, active once deployed behind HTTPS.
  hsts: { maxAge: 31536000, includeSubDomains: true, preload: true },
  // Prevent the app from ever being framed (defense-in-depth on top of CSP).
  frameguard: { action: "deny" },
  // Block browsers from MIME-sniffing responses away from declared Content-Type.
  noSniff: true,
  // Don't leak the full referrer URL to third parties.
  referrerPolicy: { policy: "same-origin" },
}));

// Relax rate limits in test environment
const isTest = process.env.NODE_ENV === "test";

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: isTest ? 1000 : 10,
  message: { error: "Too many attempts. Please try again in 15 minutes." },
});
const apiLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: isTest ? 5000 : 100,
  message: { error: "Too many requests. Please slow down." },
});

app.use("/api/auth", authLimiter);
app.use("/api",      apiLimiter);
// SECURITY: Restrict CORS to an explicit allow-list rather than
// reflecting every request origin. `origin: true` with
// `credentials: true` effectively disables the same-origin
// protection CORS is meant to provide, since it echoes back
// whatever Origin header the caller sends. In production, only
// requests from this app's own deployed origin (and localhost
// during development) are permitted to send/receive cookies.
const ALLOWED_ORIGINS = [
  "http://localhost:3000",
  "http://127.0.0.1:3000",
  process.env.APP_ORIGIN, // set this to your Render URL in production
].filter(Boolean);

app.use(cors({
  origin(origin, callback) {
    // Same-origin requests (no Origin header, e.g. curl, server-to-server)
    // and explicitly allow-listed origins are accepted.
    if (!origin || ALLOWED_ORIGINS.includes(origin)) {
      return callback(null, true);
    }
    return callback(new Error("Not allowed by CORS"));
  },
  credentials: true,
}));
// PaaS providers like Render terminate HTTPS at a reverse proxy —
// without this, Express sees every request as plain HTTP, which
// breaks the `secure` cookie flag below in production.
app.set("trust proxy", 1);

app.use(express.json({ limit: "10kb" }));
app.use(express.static(path.join(__dirname, "../public")));
app.use(session({
  secret: process.env.SESSION_SECRET || "carbonlens-secret-2024",
  resave: false,
  saveUninitialized: false,
  cookie: {
    // true only when actually deployed over HTTPS; false locally so
    // login still works over plain http://localhost in development.
    secure: process.env.NODE_ENV === "production",
    httpOnly: true,
    sameSite: "lax",
    maxAge: 7 * 24 * 60 * 60 * 1000,
  },
}));

// ── Helpers ───────────────────────────────────────────────────
function sanitize(str) {
  if (typeof str !== "string") return str;
  return xss(str.trim());
}
function isValidEmail(e) { return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e); }

/**
 * Validates a log entry's quantity and CO₂ values, shared by both
 * POST /api/logs and PUT /api/logs/:id so the two routes can never
 * silently drift apart on what counts as a valid entry.
 * @param {number} qty - Quantity in the category's native unit
 * @param {number} kg  - CO₂ value in kg
 * @returns {string|null} An error message if invalid, otherwise null
 */
function validateLogValues(qty, kg) {
  if (isNaN(qty) || qty <= 0) return "Invalid quantity.";
  if (isNaN(kg)  || kg  <  0) return "Invalid CO2 value.";
  return null;
}
function requireAuth(req, res, next) {
  if (!req.session.userId)
    return res.status(401).json({ error: "Not authenticated" });
  next();
}
function safeUser(u) {
  if (!u) return null;
  const { passwordHash, ...safe } = u;
  return safe;
}
function getUserById(id) {
  return Object.values(DB.users).find(u => u.id === id) || null;
}
function todayLabel() {
  return new Date().toLocaleDateString("en-IN", {
    day: "numeric", month: "short", year: "numeric",
  });
}

// ══════════════════════════════════════════════════════════════
//  AUTH
// ══════════════════════════════════════════════════════════════

/**
 * POST /api/auth/register
 * Creates a new user account. Body: { name, email, password }.
 */
app.post("/api/auth/register", async (req, res) => {
  try {
    const name     = sanitize(req.body.name     || "");
    const email    = sanitize(req.body.email    || "").toLowerCase();
    const password =          req.body.password || "";
    if (!name || !email || !password)
      return res.status(400).json({ error: "All fields are required." });
    if (!isValidEmail(email))
      return res.status(400).json({ error: "Please enter a valid email address." });
    if (password.length < 6)
      return res.status(400).json({ error: "Password must be at least 6 characters." });
    if (name.length > 100)
      return res.status(400).json({ error: "Name is too long." });
    DB = loadDB();
    if (DB.users[email])
      return res.status(409).json({ error: "An account with this email already exists." });
    const passwordHash = await bcrypt.hash(password, 12);
    const id = uuidv4();
    DB.users[email] = {
      id, name, email, passwordHash,
      annual: 0, quizDone: false,
      createdAt: new Date().toISOString(),
    };
    DB.logs[id]    = [];
    DB.pledges[id] = [];
    saveDB(DB);
    req.session.userId = id;
    res.json({ ok: true, user: safeUser(DB.users[email]) });
  } catch (err) {
    console.error("Register error:", err.message);
    res.status(500).json({ error: "Could not create account. Please try again." });
  }
});

/**
 * POST /api/auth/login
 * Authenticates a user. Body: { email, password }.
 */
app.post("/api/auth/login", async (req, res) => {
  try {
    const email    = sanitize(req.body.email    || "").toLowerCase();
    const password =          req.body.password || "";
    if (!email || !password)
      return res.status(400).json({ error: "Email and password are required." });
    DB = loadDB();
    const user = DB.users[email];
    if (!user) return res.status(401).json({ error: "Invalid email or password." });
    const ok = await bcrypt.compare(password, user.passwordHash);
    if (!ok)  return res.status(401).json({ error: "Invalid email or password." });
    req.session.userId = user.id;
    res.json({ ok: true, user: safeUser(user) });
  } catch (err) {
    console.error("Login error:", err.message);
    res.status(500).json({ error: "Could not sign in. Please try again." });
  }
});

/**
 * POST /api/auth/logout
 * Destroys the current session and clears the session cookie.
 */
app.post("/api/auth/logout", (req, res) => {
  req.session.destroy(() => {});
  res.json({ ok: true });
});

/**
 * GET /api/auth/me
 * Returns the currently authenticated user, or null if not logged in.
 */
app.get("/api/auth/me", (req, res) => {
  if (!req.session.userId) return res.json({ user: null });
  DB = loadDB();
  res.json({ user: safeUser(getUserById(req.session.userId)) });
});

// ══════════════════════════════════════════════════════════════
//  USER
// ══════════════════════════════════════════════════════════════

/**
 * PUT /api/user/profile
 * Updates the authenticated user's display name. Body: { name }.
 */
app.put("/api/user/profile", requireAuth, (req, res) => {
  DB = loadDB();
  const user = getUserById(req.session.userId);
  if (!user) return res.status(404).json({ error: "User not found" });
  if (req.body.name) {
    const name = sanitize(req.body.name);
    if (name.length > 100) return res.status(400).json({ error: "Name too long" });
    DB.users[user.email].name = name;
    saveDB(DB);
  }
  res.json({ ok: true, user: safeUser(DB.users[user.email]) });
});

/**
 * PUT /api/user/footprint
 * Saves or updates the user's annual CO₂ footprint estimate.
 * Body: { annual } — value in kg, max 200 000.
 */
app.put("/api/user/footprint", requireAuth, (req, res) => {
  DB = loadDB();
  const user   = getUserById(req.session.userId);
  if (!user) return res.status(404).json({ error: "User not found" });
  const annual = Number(req.body.annual);
  if (isNaN(annual) || annual < 0 || annual > 200000)
    return res.status(400).json({ error: "Invalid footprint value." });
  DB.users[user.email].annual   = annual;
  DB.users[user.email].quizDone = true;
  saveDB(DB);
  res.json({ ok: true, user: safeUser(DB.users[user.email]) });
});

/**
 * PUT /api/user/retakequiz
 * Resets the user's quizDone flag and annual estimate so they can
 * retake the onboarding quiz.
 */
app.put("/api/user/retakequiz", requireAuth, (req, res) => {
  DB = loadDB();
  const user = getUserById(req.session.userId);
  if (!user) return res.status(404).json({ error: "User not found" });
  DB.users[user.email].quizDone = false;
  DB.users[user.email].annual   = 0;
  saveDB(DB);
  res.json({ ok: true });
});

// ══════════════════════════════════════════════════════════════
//  LOGS
// ══════════════════════════════════════════════════════════════

/**
 * GET /api/logs
 * Returns all activity log entries for the authenticated user,
 * ordered newest-first.
 */
app.get("/api/logs", requireAuth, (req, res) => {
  DB = loadDB();
  res.json({ logs: DB.logs[req.session.userId] || [] });
});

/**
 * POST /api/logs
 * Adds a new activity log entry. Body: { cat, item, qty, kg, note }.
 * Category must be one of: travel | food | energy | goods.
 */
app.post("/api/logs", requireAuth, (req, res) => {
  const cat  = sanitize(req.body.cat  || "");
  const item = sanitize(req.body.item || "");
  const note = sanitize(req.body.note || "");
  const qty  = Number(req.body.qty);
  const kg   = Number(req.body.kg);
  const validCats = ["travel", "food", "energy", "goods"];
  if (!validCats.includes(cat)) return res.status(400).json({ error: "Invalid category." });
  if (!item)                    return res.status(400).json({ error: "Activity is required." });
  const validationError = validateLogValues(qty, kg);
  if (validationError) return res.status(400).json({ error: validationError });
  DB = loadDB();
  const uid = req.session.userId;
  if (!DB.logs[uid]) DB.logs[uid] = [];
  if (DB.logs[uid].length >= 10000)
    return res.status(400).json({ error: "Maximum log entries reached." });
  const entry = {
    id: uuidv4(), cat, item, qty, kg,
    note: note.substring(0, 500),
    date: todayLabel(), createdAt: new Date().toISOString(),
  };
  DB.logs[uid].unshift(entry);
  saveDB(DB);
  res.json({ ok: true, entry });
});

/**
 * PUT /api/logs/:id
 * Edits an existing log entry. Body: any subset of { item, qty, kg, note }.
 * Only the authenticated owner of the entry may edit it.
 */
app.put("/api/logs/:id", requireAuth, (req, res) => {
  DB = loadDB();
  const uid  = req.session.userId;
  const logs = DB.logs[uid] || [];
  const idx  = logs.findIndex(l => l.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: "Entry not found" });
  const item = req.body.item != null ? sanitize(req.body.item) : logs[idx].item;
  const note = req.body.note != null ? sanitize(req.body.note) : logs[idx].note;
  const qty  = req.body.qty  != null ? Number(req.body.qty)    : logs[idx].qty;
  const kg   = req.body.kg   != null ? Number(req.body.kg)     : logs[idx].kg;
  const validationError = validateLogValues(qty, kg);
  if (validationError) return res.status(400).json({ error: validationError });
  DB.logs[uid][idx] = {
    ...logs[idx], item, qty, kg,
    note: note.substring(0, 500),
    updatedAt: new Date().toISOString(),
  };
  saveDB(DB);
  res.json({ ok: true, entry: DB.logs[uid][idx] });
});

/**
 * DELETE /api/logs/:id
 * Permanently removes a log entry.
 * Only the authenticated owner of the entry may delete it.
 */
app.delete("/api/logs/:id", requireAuth, (req, res) => {
  DB = loadDB();
  const uid  = req.session.userId;
  const prev = DB.logs[uid] || [];
  const next = prev.filter(l => l.id !== req.params.id);
  if (next.length === prev.length)
    return res.status(404).json({ error: "Entry not found" });
  DB.logs[uid] = next;
  saveDB(DB);
  res.json({ ok: true });
});

// ══════════════════════════════════════════════════════════════
//  PLEDGES
// ══════════════════════════════════════════════════════════════

/**
 * GET /api/pledges
 * Returns the list of pledged action IDs for the authenticated user.
 */
app.get("/api/pledges", requireAuth, (req, res) => {
  DB = loadDB();
  res.json({ pledges: DB.pledges[req.session.userId] || [] });
});

/**
 * PUT /api/pledges
 * Replaces the user's full pledge list. Body: { pledges: string[] }.
 */
app.put("/api/pledges", requireAuth, (req, res) => {
  DB = loadDB();
  const pledges = (req.body.pledges || [])
    .filter(p => typeof p === "string" && p.length < 20).slice(0, 50);
  DB.pledges[req.session.userId] = pledges;
  saveDB(DB);
  res.json({ ok: true });
});

// ══════════════════════════════════════════════════════════════
//  STATS
// ══════════════════════════════════════════════════════════════

/**
 * GET /api/stats
 * Returns aggregated statistics for the dashboard: total/today kg,
 * per-category breakdown, pledge count, and 7-day weekly trend.
 */
app.get("/api/stats", requireAuth, (req, res) => {
  DB = loadDB();
  const uid     = req.session.userId;
  const user    = getUserById(uid);
  const logs    = DB.logs[uid]    || [];
  const pledges = DB.pledges[uid] || [];
  const today   = todayLabel();

  const totalKg = logs.reduce((a, l) => a + l.kg, 0);
  const todayKg = logs.filter(l => l.date === today).reduce((a, l) => a + l.kg, 0);
  const catKg   = { travel: 0, food: 0, energy: 0, goods: 0 };
  logs.forEach(l => { if (catKg[l.cat] !== undefined) catKg[l.cat] += l.kg; });

  const weeklyTrend = [];
  for (let i = 6; i >= 0; i--) {
    const d   = new Date(); d.setDate(d.getDate() - i);
    const lbl = d.toLocaleDateString("en-IN", { day: "numeric", month: "short" });
    const key = d.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
    const kg  = logs.filter(l => l.date === key).reduce((a, l) => a + l.kg, 0);
    weeklyTrend.push({ date: lbl, kg: Math.round(kg * 10) / 10 });
  }

  res.json({
    totalKg:      Math.round(totalKg * 10) / 10,
    todayKg:      Math.round(todayKg * 10) / 10,
    annual:       user?.annual || 0,
    totalEntries: logs.length,
    catKg, pledgeCount: pledges.length, weeklyTrend,
  });
});

// ══════════════════════════════════════════════════════════════
//  HEALTH
// ══════════════════════════════════════════════════════════════

/**
 * GET /api/health
 * Public health-check endpoint. Returns server uptime, version,
 * and registered user count. Used by hosting providers for liveness probes.
 */
app.get("/api/health", (req, res) => {
  res.json({
    status: "ok",
    uptime: Math.floor(process.uptime()),
    users:  Object.keys(loadDB().users).length,
    version: "2.0.0",
  });
});

// ── Frontend fallback ──────────────────────────────────────────
app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "../public/index.html"));
});

// ── Global error handler ───────────────────────────────────────
app.use((err, req, res, next) => {
  // CORS rejections are an expected, deliberate security control —
  // not a server bug — so they get their own clean 403 response
  // instead of falling through to the generic 500 handler below.
  if (err && err.message === "Not allowed by CORS") {
    return res.status(403).json({ error: "This origin is not permitted to access the API." });
  }
  console.error("Unhandled error:", err.message);
  res.status(500).json({ error: "Internal server error." });
});

module.exports = { app, loadDB, saveDB, resetCache };