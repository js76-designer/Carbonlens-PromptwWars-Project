// ─────────────────────────────────────────
//  api.js — All HTTP calls to the backend
// ─────────────────────────────────────────

const API = (() => {

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
