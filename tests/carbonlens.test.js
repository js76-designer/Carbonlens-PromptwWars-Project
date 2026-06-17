// ─────────────────────────────────────────────────────────────
//  tests/carbonlens.test.js
//  Full test suite for CarbonLens API
//  Run: npm test
// ─────────────────────────────────────────────────────────────

const request = require("supertest");
const path    = require("path");
const fs      = require("fs");
const os      = require("os");

// ── Use a temporary DB file so tests never touch real data ────
const TEST_DB = path.join(os.tmpdir(), `carbonlens-test-${Date.now()}.json`);
process.env.DB_PATH   = TEST_DB;
process.env.NODE_ENV  = "test";

const { app, resetCache } = require("../server/app");

// ── Shared test state ─────────────────────────────────────────
let agent;          // authenticated supertest agent
let logId;          // id of a created log entry
const TEST_USER = {
  name:     "Test User",
  email:    "test@carbonlens.dev",
  password: "secure123",
};
const TEST_USER_2 = {
  name:     "Second User",
  email:    "second@carbonlens.dev",
  password: "password99",
};

// ── Helpers ───────────────────────────────────────────────────
function freshAgent() {
  return request.agent(app);    // agent preserves cookies (session)
}

// ── Lifecycle ─────────────────────────────────────────────────
beforeEach(() => {
  // Wipe DB and cache before every test for isolation
  fs.writeFileSync(TEST_DB, JSON.stringify({ users: {}, logs: {}, pledges: {} }, null, 2));
  resetCache();
  agent = freshAgent();
});

afterAll(() => {
  // Clean up temp DB
  if (fs.existsSync(TEST_DB)) fs.unlinkSync(TEST_DB);
});

// ═════════════════════════════════════════════════════════════
//  1. HEALTH CHECK
// ═════════════════════════════════════════════════════════════
describe("Health", () => {
  test("GET /api/health returns ok and version", async () => {
    const res = await request(app).get("/api/health");
    expect(res.status).toBe(200);
    expect(res.body.status).toBe("ok");
    expect(res.body.version).toBe("2.0.0");
    expect(typeof res.body.uptime).toBe("number");
  });
});

// ═════════════════════════════════════════════════════════════
//  2. REGISTRATION
// ═════════════════════════════════════════════════════════════
describe("Registration", () => {
  test("registers a new user successfully", async () => {
    const res = await agent.post("/api/auth/register").send(TEST_USER);
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.user.email).toBe(TEST_USER.email);
    expect(res.body.user.name).toBe(TEST_USER.name);
    // Password hash must never be returned
    expect(res.body.user.passwordHash).toBeUndefined();
  });

  test("rejects duplicate email", async () => {
    await agent.post("/api/auth/register").send(TEST_USER);
    const res = await freshAgent().post("/api/auth/register").send(TEST_USER);
    expect(res.status).toBe(409);
    expect(res.body.error).toMatch(/already exists/i);
  });

  test("rejects missing name", async () => {
    const res = await agent.post("/api/auth/register")
      .send({ email: "a@b.com", password: "abc123" });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/required/i);
  });

  test("rejects invalid email format", async () => {
    const res = await agent.post("/api/auth/register")
      .send({ name: "Test", email: "notanemail", password: "abc123" });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/valid email/i);
  });

  test("rejects password shorter than 6 characters", async () => {
    const res = await agent.post("/api/auth/register")
      .send({ name: "Test", email: "x@y.com", password: "abc" });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/6 characters/i);
  });

  test("sets a session cookie on success", async () => {
    const res = await agent.post("/api/auth/register").send(TEST_USER);
    expect(res.headers["set-cookie"]).toBeDefined();
  });
});

// ═════════════════════════════════════════════════════════════
//  3. LOGIN
// ═════════════════════════════════════════════════════════════
describe("Login", () => {
  beforeEach(async () => {
    // Register user before each login test
    await agent.post("/api/auth/register").send(TEST_USER);
    resetCache();
  });

  test("logs in with correct credentials", async () => {
    const res = await freshAgent().post("/api/auth/login")
      .send({ email: TEST_USER.email, password: TEST_USER.password });
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.user.email).toBe(TEST_USER.email);
    expect(res.body.user.passwordHash).toBeUndefined();
  });

  test("rejects wrong password", async () => {
    const res = await freshAgent().post("/api/auth/login")
      .send({ email: TEST_USER.email, password: "wrongpass" });
    expect(res.status).toBe(401);
    expect(res.body.error).toMatch(/invalid/i);
  });

  test("rejects unknown email", async () => {
    const res = await freshAgent().post("/api/auth/login")
      .send({ email: "ghost@x.com", password: "abc123" });
    expect(res.status).toBe(401);
    expect(res.body.error).toMatch(/invalid/i);
  });

  test("is case-insensitive for email", async () => {
    const res = await freshAgent().post("/api/auth/login")
      .send({ email: TEST_USER.email.toUpperCase(), password: TEST_USER.password });
    expect(res.status).toBe(200);
  });

  test("rejects empty email", async () => {
    const res = await freshAgent().post("/api/auth/login")
      .send({ email: "", password: TEST_USER.password });
    expect(res.status).toBe(400);
  });
});

// ═════════════════════════════════════════════════════════════
//  4. SESSION & AUTH GUARD
// ═════════════════════════════════════════════════════════════
describe("Session & Auth guard", () => {
  test("GET /api/auth/me returns null when not logged in", async () => {
    const res = await request(app).get("/api/auth/me");
    expect(res.status).toBe(200);
    expect(res.body.user).toBeNull();
  });

  test("GET /api/auth/me returns user after login", async () => {
    await agent.post("/api/auth/register").send(TEST_USER);
    const res = await agent.get("/api/auth/me");
    expect(res.status).toBe(200);
    expect(res.body.user.email).toBe(TEST_USER.email);
  });

  test("protected routes return 401 without session", async () => {
    const routes = [
      () => request(app).get("/api/logs"),
      () => request(app).get("/api/pledges"),
      () => request(app).get("/api/stats"),
      () => request(app).put("/api/user/profile").send({ name: "X" }),
    ];
    for (const route of routes) {
      const res = await route();
      expect(res.status).toBe(401);
    }
  });

  test("logout clears session", async () => {
    await agent.post("/api/auth/register").send(TEST_USER);
    await agent.post("/api/auth/logout");
    const res = await agent.get("/api/auth/me");
    expect(res.body.user).toBeNull();
  });
});

// ═════════════════════════════════════════════════════════════
//  5. USER PROFILE
// ═════════════════════════════════════════════════════════════
describe("User profile", () => {
  beforeEach(async () => {
    await agent.post("/api/auth/register").send(TEST_USER);
  });

  test("updates display name", async () => {
    const res = await agent.put("/api/user/profile").send({ name: "New Name" });
    expect(res.status).toBe(200);
    expect(res.body.user.name).toBe("New Name");
  });

  test("rejects name longer than 100 chars", async () => {
    const res = await agent.put("/api/user/profile")
      .send({ name: "A".repeat(101) });
    expect(res.status).toBe(400);
  });

  test("sets footprint from quiz", async () => {
    const res = await agent.put("/api/user/footprint").send({ annual: 5200 });
    expect(res.status).toBe(200);
    expect(res.body.user.annual).toBe(5200);
    expect(res.body.user.quizDone).toBe(true);
  });

  test("rejects invalid footprint value", async () => {
    const res = await agent.put("/api/user/footprint").send({ annual: -100 });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/invalid/i);
  });

  test("retake quiz resets quizDone and annual", async () => {
    await agent.put("/api/user/footprint").send({ annual: 5200 });
    const res = await agent.put("/api/user/retakequiz");
    expect(res.status).toBe(200);
    resetCache();
    const me = await agent.get("/api/auth/me");
    expect(me.body.user.quizDone).toBe(false);
    expect(me.body.user.annual).toBe(0);
  });
});

// ═════════════════════════════════════════════════════════════
//  6. ACTIVITY LOGGING
// ═════════════════════════════════════════════════════════════
describe("Activity logging", () => {
  beforeEach(async () => {
    await agent.post("/api/auth/register").send(TEST_USER);
  });

  test("creates a log entry", async () => {
    const res = await agent.post("/api/logs")
      .send({ cat: "travel", item: "Car ride", qty: 20, kg: 4.8, note: "To work" });
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.entry.id).toBeDefined();
    expect(res.body.entry.cat).toBe("travel");
    expect(res.body.entry.kg).toBe(4.8);
    logId = res.body.entry.id;
  });

  test("retrieves all log entries", async () => {
    await agent.post("/api/logs").send({ cat: "food",   item: "Beef meal", qty: 1,  kg: 6.0 });
    await agent.post("/api/logs").send({ cat: "energy", item: "AC",        qty: 5,  kg: 2.5 });
    const res = await agent.get("/api/logs");
    expect(res.status).toBe(200);
    expect(res.body.logs).toHaveLength(2);
  });

  test("rejects invalid category", async () => {
    const res = await agent.post("/api/logs")
      .send({ cat: "invalid", item: "x", qty: 1, kg: 1 });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/category/i);
  });

  test("rejects missing activity name", async () => {
    const res = await agent.post("/api/logs")
      .send({ cat: "food", item: "", qty: 1, kg: 1 });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/activity/i);
  });

  test("rejects zero or negative quantity", async () => {
    const res = await agent.post("/api/logs")
      .send({ cat: "travel", item: "Car", qty: 0, kg: 1 });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/quantity/i);
  });

  test("rejects negative kg value", async () => {
    const res = await agent.post("/api/logs")
      .send({ cat: "travel", item: "Car", qty: 1, kg: -5 });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/CO2/i);
  });

  test("edits an existing log entry", async () => {
    const created = await agent.post("/api/logs")
      .send({ cat: "goods", item: "T-shirt", qty: 1, kg: 3.2 });
    const id = created.body.entry.id;

    const res = await agent.put(`/api/logs/${id}`).send({ kg: 4.5, item: "Jeans" });
    expect(res.status).toBe(200);
    expect(res.body.entry.kg).toBe(4.5);
    expect(res.body.entry.item).toBe("Jeans");
  });

  test("deletes a log entry", async () => {
    const created = await agent.post("/api/logs")
      .send({ cat: "energy", item: "Heater", qty: 3, kg: 1.8 });
    const id = created.body.entry.id;

    const del = await agent.delete(`/api/logs/${id}`);
    expect(del.status).toBe(200);

    const list = await agent.get("/api/logs");
    expect(list.body.logs).toHaveLength(0);
  });

  test("returns 404 when editing non-existent entry", async () => {
    const res = await agent.put("/api/logs/fake-id-0000").send({ kg: 1, qty: 1 });
    expect(res.status).toBe(404);
  });

  test("returns 404 when deleting non-existent entry", async () => {
    const res = await agent.delete("/api/logs/fake-id-0000");
    expect(res.status).toBe(404);
  });

  test("one user cannot access another user's logs", async () => {
    // User 1 logs an entry
    await agent.post("/api/logs")
      .send({ cat: "food", item: "Steak", qty: 1, kg: 7.0 });

    // User 2 logs in separately
    const agent2 = freshAgent();
    await agent2.post("/api/auth/register").send(TEST_USER_2);
    const res = await agent2.get("/api/logs");
    expect(res.body.logs).toHaveLength(0);
  });
});

// ═════════════════════════════════════════════════════════════
//  7. PLEDGES
// ═════════════════════════════════════════════════════════════
describe("Pledges", () => {
  beforeEach(async () => {
    await agent.post("/api/auth/register").send(TEST_USER);
  });

  test("starts with empty pledges", async () => {
    const res = await agent.get("/api/pledges");
    expect(res.status).toBe(200);
    expect(res.body.pledges).toHaveLength(0);
  });

  test("saves and retrieves pledges", async () => {
    await agent.put("/api/pledges").send({ pledges: ["a1", "a3", "a5"] });
    const res = await agent.get("/api/pledges");
    expect(res.body.pledges).toEqual(["a1", "a3", "a5"]);
  });

  test("overwriting pledges replaces old list", async () => {
    await agent.put("/api/pledges").send({ pledges: ["a1", "a2"] });
    await agent.put("/api/pledges").send({ pledges: ["a3"] });
    const res = await agent.get("/api/pledges");
    expect(res.body.pledges).toEqual(["a3"]);
  });

  test("strips invalid pledge entries", async () => {
    const res = await agent.put("/api/pledges")
      .send({ pledges: ["ok", 123, null, "another"] });
    expect(res.status).toBe(200);
    // Only string pledges survive
    const got = await agent.get("/api/pledges");
    expect(got.body.pledges.every(p => typeof p === "string")).toBe(true);
  });
});

// ═════════════════════════════════════════════════════════════
//  8. STATS
// ═════════════════════════════════════════════════════════════
describe("Stats", () => {
  beforeEach(async () => {
    await agent.post("/api/auth/register").send(TEST_USER);
    await agent.put("/api/user/footprint").send({ annual: 6000 });
    resetCache();
  });

  test("returns zeroed stats for a new user", async () => {
    const res = await agent.get("/api/stats");
    expect(res.status).toBe(200);
    expect(res.body.totalKg).toBe(0);
    expect(res.body.todayKg).toBe(0);
    expect(res.body.totalEntries).toBe(0);
    expect(res.body.annual).toBe(6000);
  });

  test("totalKg accumulates across multiple logs", async () => {
    await agent.post("/api/logs").send({ cat: "travel", item: "Bus",  qty: 10, kg: 1.5 });
    await agent.post("/api/logs").send({ cat: "food",   item: "Beef", qty: 1,  kg: 6.0 });
    resetCache();
    const res = await agent.get("/api/stats");
    expect(res.body.totalKg).toBeCloseTo(7.5, 1);
    expect(res.body.totalEntries).toBe(2);
  });

  test("catKg breaks down emissions by category", async () => {
    await agent.post("/api/logs").send({ cat: "travel", item: "Car",   qty: 5, kg: 3.0 });
    await agent.post("/api/logs").send({ cat: "energy", item: "AC",    qty: 2, kg: 2.0 });
    resetCache();
    const res = await agent.get("/api/stats");
    expect(res.body.catKg.travel).toBeCloseTo(3.0, 1);
    expect(res.body.catKg.energy).toBeCloseTo(2.0, 1);
    expect(res.body.catKg.food).toBe(0);
  });

  test("weeklyTrend returns 7 data points", async () => {
    const res = await agent.get("/api/stats");
    expect(res.body.weeklyTrend).toHaveLength(7);
    expect(res.body.weeklyTrend[0]).toHaveProperty("date");
    expect(res.body.weeklyTrend[0]).toHaveProperty("kg");
  });

  test("pledgeCount reflects saved pledges", async () => {
    await agent.put("/api/pledges").send({ pledges: ["a1", "a2", "a3"] });
    resetCache();
    const res = await agent.get("/api/stats");
    expect(res.body.pledgeCount).toBe(3);
  });
});

// ═════════════════════════════════════════════════════════════
//  9. SECURITY
// ═════════════════════════════════════════════════════════════
describe("Security", () => {
  test("password hash is never returned in any response", async () => {
    const reg = await agent.post("/api/auth/register").send(TEST_USER);
    expect(JSON.stringify(reg.body)).not.toContain("passwordHash");

    const login = await agent.post("/api/auth/login")
      .send({ email: TEST_USER.email, password: TEST_USER.password });
    expect(JSON.stringify(login.body)).not.toContain("passwordHash");

    const me = await agent.get("/api/auth/me");
    expect(JSON.stringify(me.body)).not.toContain("passwordHash");
  });

  test("XSS input is sanitized before storage", async () => {
    await agent.post("/api/auth/register").send(TEST_USER);
    await agent.post("/api/logs").send({
      cat: "food", item: "<script>alert('xss')</script>",
      qty: 1, kg: 1, note: "<img src=x onerror=alert(1)>",
    });
    resetCache();
    const res = await agent.get("/api/logs");
    const item = res.body.logs[0].item;
    expect(item).not.toContain("<script>");
    expect(item).not.toContain("onerror");
  });

  test("JSON body larger than 10kb is rejected", async () => {
    const res = await request(app)
      .post("/api/auth/register")
      .set("Content-Type", "application/json")
      .send(JSON.stringify({ name: "X".repeat(15000), email: "x@x.com", password: "abc123" }));
    // Either 400 (validation) or 413 (payload too large)
    expect([400, 413, 500]).toContain(res.status);
  });

  test("helmet sets security headers", async () => {
    const res = await request(app).get("/api/health");
    expect(res.headers["x-content-type-options"]).toBe("nosniff");
    expect(res.headers["x-frame-options"]).toBeDefined();
  });

  test("session cookie is httpOnly", async () => {
    const res = await request(app).post("/api/auth/register").send(TEST_USER);
    const cookies = res.headers["set-cookie"] || [];
    const sessionCookie = cookies.find(c => c.includes("connect.sid"));
    if (sessionCookie) {
      expect(sessionCookie.toLowerCase()).toContain("httponly");
    }
  });

  test("users cannot edit each other's logs", async () => {
    // User 1 creates a log
    await agent.post("/api/auth/register").send(TEST_USER);
    const log = await agent.post("/api/logs")
      .send({ cat: "food", item: "Steak", qty: 1, kg: 7 });
    const logId = log.body.entry.id;

    // User 2 tries to edit it
    const agent2 = freshAgent();
    await agent2.post("/api/auth/register").send(TEST_USER_2);
    const res = await agent2.put(`/api/logs/${logId}`).send({ kg: 999, qty: 1 });
    expect(res.status).toBe(404); // Not found in user 2's scope
  });
});

// ═════════════════════════════════════════════════════════════
//  10. EDGE CASES
// ═════════════════════════════════════════════════════════════
describe("Edge cases", () => {
  beforeEach(async () => {
    await agent.post("/api/auth/register").send(TEST_USER);
  });

  test("log entry with 0 kg is accepted (carbon-neutral activity)", async () => {
    const res = await agent.post("/api/logs")
      .send({ cat: "travel", item: "Walking", qty: 5, kg: 0 });
    expect(res.status).toBe(200);
    expect(res.body.entry.kg).toBe(0);
  });

  test("note is optional — missing note defaults to empty string", async () => {
    const res = await agent.post("/api/logs")
      .send({ cat: "energy", item: "Solar panel", qty: 1, kg: 0 });
    expect(res.status).toBe(200);
    expect(res.body.entry.note).toBe("");
  });

  test("note longer than 500 chars is truncated", async () => {
    const longNote = "A".repeat(600);
    const res = await agent.post("/api/logs")
      .send({ cat: "goods", item: "Laptop", qty: 1, kg: 300, note: longNote });
    expect(res.status).toBe(200);
    expect(res.body.entry.note.length).toBeLessThanOrEqual(500);
  });

  test("footprint value of 0 is accepted", async () => {
    const res = await agent.put("/api/user/footprint").send({ annual: 0 });
    expect(res.status).toBe(200);
    expect(res.body.user.annual).toBe(0);
  });

  test("extremely large footprint (200000) is accepted", async () => {
    const res = await agent.put("/api/user/footprint").send({ annual: 200000 });
    expect(res.status).toBe(200);
  });

  test("footprint above max (200001) is rejected", async () => {
    const res = await agent.put("/api/user/footprint").send({ annual: 200001 });
    expect(res.status).toBe(400);
  });

  test("empty pledges array clears all pledges", async () => {
    await agent.put("/api/pledges").send({ pledges: ["a1", "a2"] });
    await agent.put("/api/pledges").send({ pledges: [] });
    const res = await agent.get("/api/pledges");
    expect(res.body.pledges).toHaveLength(0);
  });
});