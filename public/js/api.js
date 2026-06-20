// ─────────────────────────────────────────
//  api.js — All HTTP calls to the backend
// ─────────────────────────────────────────

/**
 * API — centralised HTTP client for all backend calls.
 *
 * Every method returns a Promise that resolves to the parsed JSON
 * response body, or rejects with an Error whose message is the
 * server-supplied error string (or "Request failed" as fallback).
 *
 * Credentials (session cookies) are included on every request so
 * the server-side requireAuth middleware can identify the caller.
 */
const API = (() => {

  /**
   * Core fetch wrapper used by all public methods.
   * @param {string} method - HTTP verb (GET, POST, PUT, DELETE)
   * @param {string} url    - Absolute path, e.g. "/api/logs"
   * @param {object} [body] - Optional request body (will be JSON-encoded)
   * @returns {Promise<object>} Parsed JSON response
   */
  async function req(method, url, body) {
    const opts = {
      method,
      credentials: "include",
      headers: { "Content-Type": "application/json" },
    };
    if (body) opts.body = JSON.stringify(body);
    const res  = await fetch(url, opts);
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Request failed");
    return data;
  }

  return {
    // ── Auth ──────────────────────────────
    login:    (email, password)       => req("POST", "/api/auth/login",    { email, password }),
    register: (name, email, password) => req("POST", "/api/auth/register", { name, email, password }),
    logout:   ()                      => req("POST", "/api/auth/logout"),
    me:       ()                      => req("GET",  "/api/auth/me"),

    // ── User ──────────────────────────────
    updateProfile:  (data) => req("PUT",  "/api/user/profile",    data),
    updateFootprint:(annual)=> req("PUT",  "/api/user/footprint",  { annual }),
    retakeQuiz:     ()      => req("PUT",  "/api/user/retakequiz"),

    // ── Logs ──────────────────────────────
    getLogs:    ()           => req("GET",    "/api/logs"),
    addLog:     (entry)      => req("POST",   "/api/logs",      entry),
    deleteLog:  (id)         => req("DELETE", `/api/logs/${id}`),
    updateLog:  (id, entry)  => req("PUT",    `/api/logs/${id}`, entry),

    // ── Pledges ───────────────────────────
    getPledges:  ()          => req("GET", "/api/pledges"),
    savePledges: (pledges)   => req("PUT", "/api/pledges", { pledges }),

    // ── Stats ─────────────────────────────
    getStats: () => req("GET", "/api/stats"),
  };
})();