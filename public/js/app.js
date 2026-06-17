// ─────────────────────────────────────────────────────────────
//  app.js — Root app: global state, auth, routing, boot
//  Place this at: public/js/app.js
// ─────────────────────────────────────────────────────────────

// ── Global state ──────────────────────────────────────────────
const AppState = {
  user:    null,   // logged-in user object
  logs:    [],     // cached activity logs
  pledges: [],     // cached pledge ids
};

// ── Routing ───────────────────────────────────────────────────
function navigate(screenId) {
  setActiveNav(screenId);
  // Sync mobile nav active state
  document.querySelectorAll(".mobile-nav-btn").forEach(b =>
    b.classList.toggle("active", b.dataset.screen === screenId)
  );
  switch (screenId) {
    case "dashboard": renderDashboard(); break;
    case "log":       renderLog();       break;
    case "history":   renderHistory();   break;
    case "insights":  renderInsights();  break;
    case "settings":  renderSettings();  break;
  }
}

// ── Sidebar nav clicks ────────────────────────────────────────
document.querySelectorAll(".nav-item[data-screen]").forEach(btn => {
  btn.addEventListener("click", () => navigate(btn.dataset.screen));
  btn.addEventListener("keydown", e => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      navigate(btn.dataset.screen);
    }
  });
});

// ── Mobile nav clicks ─────────────────────────────────────────
document.querySelectorAll(".mobile-nav-btn[data-screen]").forEach(btn => {
  btn.addEventListener("click", () => navigate(btn.dataset.screen));
});

// ── Auth: Login ───────────────────────────────────────────────
document.getElementById("btn-login").addEventListener("click", async () => {
  const email    = document.getElementById("login-email").value.trim();
  const password = document.getElementById("login-pass").value;
  const errEl    = document.getElementById("login-error");
  errEl.classList.add("hidden");

  if (!email || !password) {
    errEl.textContent = "Please enter your email and password.";
    errEl.classList.remove("hidden");
    return;
  }

  const btn = document.getElementById("btn-login");
  btn.disabled    = true;
  btn.textContent = "Signing in…";

  try {
    const { user } = await API.login(email, password);
    AppState.user  = user;
    bootApp();
  } catch (err) {
    errEl.textContent = err.message || "Login failed. Please try again.";
    errEl.classList.remove("hidden");
  } finally {
    btn.disabled    = false;
    btn.textContent = "Sign in";
  }
});

// Enter key on login fields
document.getElementById("login-email").addEventListener("keydown", e => {
  if (e.key === "Enter") document.getElementById("login-pass").focus();
});
document.getElementById("login-pass").addEventListener("keydown", e => {
  if (e.key === "Enter") document.getElementById("btn-login").click();
});

// ── Auth: Register ────────────────────────────────────────────
document.getElementById("btn-register").addEventListener("click", async () => {
  const name     = document.getElementById("reg-name").value.trim();
  const email    = document.getElementById("reg-email").value.trim();
  const password = document.getElementById("reg-pass").value;
  const errEl    = document.getElementById("register-error");
  errEl.classList.add("hidden");

  if (!name || !email || !password) {
    errEl.textContent = "Please fill in all fields.";
    errEl.classList.remove("hidden");
    return;
  }
  if (password.length < 6) {
    errEl.textContent = "Password must be at least 6 characters.";
    errEl.classList.remove("hidden");
    return;
  }

  const btn = document.getElementById("btn-register");
  btn.disabled    = true;
  btn.textContent = "Creating account…";

  try {
    const { user } = await API.register(name, email, password);
    AppState.user  = user;
    bootApp();
  } catch (err) {
    errEl.textContent = err.message || "Registration failed. Please try again.";
    errEl.classList.remove("hidden");
  } finally {
    btn.disabled    = false;
    btn.textContent = "Create account";
  }
});

// Enter key on register form
document.getElementById("reg-pass").addEventListener("keydown", e => {
  if (e.key === "Enter") document.getElementById("btn-register").click();
});

// ── Auth: screen switcher links ───────────────────────────────
document.getElementById("go-register").addEventListener("click",  () => showScreen("register"));
document.getElementById("go-register").addEventListener("keydown", e => {
  if (e.key === "Enter" || e.key === " ") showScreen("register");
});
document.getElementById("go-login").addEventListener("click",  () => showScreen("login"));
document.getElementById("go-login").addEventListener("keydown", e => {
  if (e.key === "Enter" || e.key === " ") showScreen("login");
});

// ── Auth: Logout ──────────────────────────────────────────────
document.getElementById("btn-logout").addEventListener("click", async () => {
  try { await API.logout(); } catch (_) {}
  AppState.user    = null;
  AppState.logs    = [];
  AppState.pledges = [];
  // Clear login form fields
  document.getElementById("login-email").value = "";
  document.getElementById("login-pass").value  = "";
  document.getElementById("login-error").classList.add("hidden");
  showScreen("login");
});

// ── Boot: enter main app after login/register ─────────────────
function bootApp() {
  const user = AppState.user;

  // Populate sidebar user info
  document.getElementById("sidebar-username").textContent = user.name  || "User";
  document.getElementById("sidebar-email").textContent    = user.email || "";
  document.getElementById("sidebar-avatar").textContent   =
    (user.name || "U").charAt(0).toUpperCase();

  // Set today's date in header
  document.getElementById("header-date").textContent =
    new Date().toLocaleDateString("en-IN", {
      weekday: "long", day: "numeric", month: "long",
    });

  showScreen("app");

  if (!user.quizDone) {
    // New user — show carbon footprint quiz first
    renderQuiz();
  } else {
    // Returning user — go straight to dashboard
    navigate("dashboard");
  }
}

// ── Init: restore session on page load ───────────────────────
(async function init() {
  showScreen("login"); // default while session check runs
  try {
    const { user } = await API.me();
    if (user) {
      AppState.user = user;
      bootApp();
    }
    // else stays on login screen
  } catch (_) {
    // Server unreachable — stay on login
  }
})();