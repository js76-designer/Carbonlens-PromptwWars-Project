// ─────────────────────────────────────────────────────────────
//  server/app.js  —  Express app (no listen) — importable for tests
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
      connectSrc: ["'self'"],
    },
  },
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
app.use(cors({ origin: true, credentials: true }));
app.use(express.json({ limit: "10kb" }));
app.use(express.static(path.join(__dirname, "../public")));
app.use(session({
  secret: process.env.SESSION_SECRET || "carbonlens-secret-2024",
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: false, httpOnly: true, sameSite: "lax",
    maxAge: 7 * 24 * 60 * 60 * 1000,
  },
}));

// ── Helpers ───────────────────────────────────────────────────
function sanitize(str) {
  if (typeof str !== "string") return str;
  return xss(str.trim());
}
function isValidEmail(e) { return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e); }
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

app.post("/api/auth/register", async (req, res) => {
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
});

app.post("/api/auth/login", async (req, res) => {
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
});

app.post("/api/auth/logout", (req, res) => {
  req.session.destroy(() => {});
  res.json({ ok: true });
});

app.get("/api/auth/me", (req, res) => {
  if (!req.session.userId) return res.json({ user: null });
  DB = loadDB();
  res.json({ user: safeUser(getUserById(req.session.userId)) });
});

// ══════════════════════════════════════════════════════════════
//  USER
// ══════════════════════════════════════════════════════════════

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

app.get("/api/logs", requireAuth, (req, res) => {
  DB = loadDB();
  res.json({ logs: DB.logs[req.session.userId] || [] });
});

app.post("/api/logs", requireAuth, (req, res) => {
  const cat  = sanitize(req.body.cat  || "");
  const item = sanitize(req.body.item || "");
  const note = sanitize(req.body.note || "");
  const qty  = Number(req.body.qty);
  const kg   = Number(req.body.kg);
  const validCats = ["travel", "food", "energy", "goods"];
  if (!validCats.includes(cat)) return res.status(400).json({ error: "Invalid category." });
  if (!item)                    return res.status(400).json({ error: "Activity is required." });
  if (isNaN(qty) || qty <= 0)   return res.status(400).json({ error: "Invalid quantity." });
  if (isNaN(kg)  || kg  <  0)   return res.status(400).json({ error: "Invalid CO2 value." });
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
  if (isNaN(qty) || qty <= 0) return res.status(400).json({ error: "Invalid quantity." });
  if (isNaN(kg)  || kg  <  0) return res.status(400).json({ error: "Invalid CO2 value." });
  DB.logs[uid][idx] = {
    ...logs[idx], item, qty, kg,
    note: note.substring(0, 500),
    updatedAt: new Date().toISOString(),
  };
  saveDB(DB);
  res.json({ ok: true, entry: DB.logs[uid][idx] });
});

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

app.get("/api/pledges", requireAuth, (req, res) => {
  DB = loadDB();
  res.json({ pledges: DB.pledges[req.session.userId] || [] });
});

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
  console.error("Unhandled error:", err.message);
  res.status(500).json({ error: "Internal server error." });
});

module.exports = { app, loadDB, saveDB, resetCache };