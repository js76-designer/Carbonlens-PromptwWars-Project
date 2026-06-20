// ─────────────────────────────────────────
//  screens.js — All screen render functions
// ─────────────────────────────────────────

// ══════════════════════════════════════════
//  QUIZ
// ══════════════════════════════════════════
let _quizStep    = 0;
let _quizAnswers = {};

/**
 * Renders the onboarding carbon footprint quiz screen.
 * Resets step/answer state and delegates to _renderQuizStep().
 */
function renderQuiz() {
  _quizStep    = 0;
  _quizAnswers = {};
  showScreen("quiz");
  _renderQuizStep();
}

/**
 * Renders the current quiz question step with options,
 * progress bar, and next/submit button.
 * Called internally by renderQuiz() and on each answer selection.
 */
function _renderQuizStep() {
  const q    = QUIZ_QUESTIONS[_quizStep];
  const pct  = (_quizStep / QUIZ_QUESTIONS.length) * 100;
  const card = document.getElementById("quiz-card");

  card.innerHTML = `
    <div class="quiz-progress-wrap">
      <div class="quiz-progress-bar">
        <div class="quiz-progress-fill" style="width:${pct}%"></div>
      </div>
      <span class="quiz-step-label">${_quizStep+1} / ${QUIZ_QUESTIONS.length}</span>
    </div>
    <div class="quiz-category-chip">${q.category}</div>
    <div class="quiz-question">${q.q}</div>
    <div class="quiz-options">
      ${q.opts.map((opt,i) => `
        <button class="quiz-option ${_quizAnswers[_quizStep]===i?"selected":""}"
          data-idx="${i}">
          <div class="quiz-option-icon">${opt.i}</div>
          <span>${opt.l}</span>
        </button>`).join("")}
    </div>
    <div class="quiz-nav">
      <button class="btn-next" id="quiz-next"
        ${_quizAnswers[_quizStep] === undefined ? "disabled" : ""}>
        ${_quizStep < QUIZ_QUESTIONS.length-1 ? "Next question →" : "See my footprint →"}
      </button>
    </div>`;

  // Option click
  card.querySelectorAll(".quiz-option").forEach(btn => {
    btn.addEventListener("click", () => {
      _quizAnswers[_quizStep] = parseInt(btn.dataset.idx);
      _renderQuizStep();
    });
  });

  // Next click
  card.querySelector("#quiz-next").addEventListener("click", async () => {
    if (_quizAnswers[_quizStep] === undefined) return;
    if (_quizStep < QUIZ_QUESTIONS.length - 1) {
      _quizStep++;
      _renderQuizStep();
    } else {
      // All answered — compute footprint
      const scores  = QUIZ_QUESTIONS.map((_,i) => QUIZ_QUESTIONS[i].scores[_quizAnswers[i] ?? 0]);
      const annual  = calcAnnual(scores);
      try {
        const { user } = await API.updateFootprint(annual);
        AppState.user  = user;
        renderResult(annual);
      } catch(e) {
        showToast("Failed to save footprint", "error");
      }
    }
  });
}

// ══════════════════════════════════════════
//  RESULT
// ══════════════════════════════════════════
/**
 * Renders the post-quiz result screen showing the user's
 * estimated annual footprint, rating, and top recommended action.
 * @param {number} annual - Estimated annual CO₂ in kg
 */
function renderResult(annual) {
  showScreen("result");
  const rating = getRating(annual);
  const pct    = Math.round((annual / 8200) * 100);
  const card   = document.getElementById("result-card");

  card.innerHTML = `
    <div class="result-eyebrow">🌿 Your estimated annual footprint</div>
    <div class="gauge-wrap">
      ${buildGaugeSVG(annual, 16000, 190, rating.color)}
      <div class="gauge-inner">
        <div class="gauge-number">${(annual/1000).toFixed(1)}</div>
        <div class="gauge-unit">tonnes CO₂/yr</div>
      </div>
    </div>
    <div class="result-badge-wrap">${badge(rating.label, rating.color, rating.bg)}</div>
    <p class="result-desc">
      Your footprint is <strong>${pct}%</strong> of the national average (8.2 tonnes).
      ${annual<5000 ? "You're doing well — a few targeted actions can push this much lower."
      : annual<9000 ? "You're near average. Small, consistent changes add up fast."
      : "There's significant room to reduce. We'll show you exactly where to start."}
    </p>
    <div class="result-tip">
      <div class="result-tip-title">🎯 Your highest-impact action right now</div>
      <div class="result-tip-text">
        Switching to plant-based meals just 3 days a week saves <strong>420 kg CO₂/year</strong> —
        more than switching to an electric vehicle.
      </div>
    </div>
    <button class="btn-primary" id="btn-go-dashboard">Go to my dashboard →</button>`;

  card.querySelector("#btn-go-dashboard").addEventListener("click", () => {
    renderDashboard();
  });
}

// ══════════════════════════════════════════
//  DASHBOARD
// ══════════════════════════════════════════
/**
 * Fetches logs, pledges, and stats in parallel, then renders the
 * main dashboard: KPI cards, AI tips, footprint gauge, category
 * breakdown bars, 7-day trend chart, and recent activity table.
 */
async function renderDashboard() {
  showScreen("app");
  setActiveNav("dashboard");
  setHeader("Dashboard", `Welcome back, ${AppState.user?.name?.split(" ")[0]} 👋`);

  const body = document.getElementById("main-body");
  body.innerHTML = `<div class="flex-center" style="height:200px"><div class="spinner"></div></div>`;

  try {
    const [{ logs }, { pledges }, stats] = await Promise.all([
      API.getLogs(), API.getPledges(), API.getStats()
    ]);
    AppState.logs    = logs;
    AppState.pledges = pledges;

    const rating = getRating(stats.annual);
    const catColors = { travel:"#1A5C44", food:"#7C4A1E", energy:"#1E4D7C", goods:"#5B2D7C" };
    const maxCat = Math.max(...Object.values(stats.catKg), 1);
    const savedKg = pledges.reduce((a,p) => { const act=ACTIONS.find(x=>x.id===p); return a+(act?act.saving/12:0); }, 0);

    body.innerHTML = `
      <!-- KPIs -->
      <div class="kpi-grid" role="list" aria-label="Key metrics">
        <div class="kpi-card" role="listitem">
          <div class="kpi-label">Today's emissions</div>
          <div class="kpi-value" aria-label="${stats.todayKg.toFixed(1)} kg CO2 today">${stats.todayKg.toFixed(1)}</div>
          <div class="kpi-unit">kg CO₂</div>
        </div>
        <div class="kpi-card" role="listitem">
          <div class="kpi-label">Total logged</div>
          <div class="kpi-value">${stats.totalKg.toFixed(0)}</div>
          <div class="kpi-unit">kg CO₂ all time</div>
        </div>
        <div class="kpi-card" role="listitem">
          <div class="kpi-label">Annual estimate</div>
          <div class="kpi-value">${(stats.annual/1000).toFixed(1)}</div>
          <div class="kpi-unit">tonnes CO₂/yr</div>
        </div>
        <div class="kpi-card" role="listitem">
          <div class="kpi-label">Saved from pledges</div>
          <div class="kpi-value">${savedKg.toFixed(0)}</div>
          <div class="kpi-unit">kg CO₂/mo</div>
          <div class="kpi-change positive">↓ from ${pledges.length} pledges</div>
        </div>
      </div>
      <!-- AI Tips -->
      <div id="ai-tips-box" aria-label="AI personalised tips" aria-live="polite">
        <div class="flex-center" style="padding:16px"><div class="spinner"></div><span style="margin-left:10px;font-size:13px;color:var(--mist)">Loading tips…</span></div>
      </div>

      <!-- Middle row -->
      <div class="grid-2">
        <div class="card">
          <div class="card-title">Footprint rating</div>
          <div style="display:flex;align-items:center;gap:20px">
            <div class="gauge-wrap" style="margin-bottom:0">
              ${buildGaugeSVG(stats.annual, 16000, 110, rating.color)}
              <div class="gauge-inner">
                <div style="font-family:'Syne',sans-serif;font-size:20px;font-weight:800;color:var(--forest)">${(stats.annual/1000).toFixed(1)}</div>
                <div style="font-size:10px;color:var(--mist)">tonnes/yr</div>
              </div>
            </div>
            <div>
              <div style="font-family:'Syne',sans-serif;font-size:28px;font-weight:800;color:var(--forest);line-height:1">${(stats.annual/1000).toFixed(1)}t</div>
              <div style="font-size:12px;color:var(--mist);margin-bottom:10px">CO₂ per year</div>
              ${badge(rating.label, rating.color, rating.bg)}
              <div style="margin-top:10px">
                <button class="btn-edit" id="btn-update-footprint">Update estimate</button>
              </div>
            </div>
          </div>
        </div>

        <div class="card">
          <div class="card-title">Category breakdown</div>
          ${CATEGORIES.map(cat => `
            <div class="bar-row">
              <div class="bar-meta">
                <span class="bar-name">${cat.icon} ${cat.label}</span>
                <span class="bar-val">${(stats.catKg[cat.id]||0).toFixed(1)} kg</span>
              </div>
              <div class="bar-track" role="progressbar" aria-valuenow="${(stats.catKg[cat.id]||0).toFixed(1)}" aria-valuemin="0" aria-valuemax="${maxCat}">
                <div class="bar-fill" style="width:${Math.min(((stats.catKg[cat.id]||0)/maxCat)*100,100)}%;background:${catColors[cat.id]}"></div>
              </div>
            </div>`).join("")}
        </div>
      </div>

      <!-- Weekly Trend Chart -->
      <div class="card" style="margin-bottom:16px">
        <div class="card-title">7-day CO₂ trend</div>
        <div class="chart-container" role="img" aria-label="Bar chart showing your CO2 emissions over the last 7 days">
          <canvas id="trend-chart"></canvas>
        </div>
      </div>

      <!-- Recent activity -->
      <div class="card">
        <div class="card-header">
          <div class="card-title" style="margin-bottom:0">Recent activity</div>
          <button class="btn-edit" id="dash-view-all">View all →</button>
        </div>
        ${logs.length === 0
          ? emptyState("📋", "No entries yet — go to Log Activity to start tracking")
          : `<div class="log-table-wrap">
              <table class="log-table">
                <thead><tr>
                  <th>Activity</th><th>Category</th><th>Qty</th><th>CO₂</th><th>Date</th><th></th>
                </tr></thead>
                <tbody>
                  ${logs.slice(0,6).map(l => {
                    const cat = getCat(l.cat);
                    return `<tr>
                      <td style="font-weight:500">${l.item}</td>
                      <td>${catChip(cat)}</td>
                      <td>${l.qty} ${cat?.unit||""}</td>
                      <td>${kgBadge(l.kg)}</td>
                      <td style="color:var(--mist);font-size:12px">${l.date}</td>
                      <td><button class="action-btn edit-entry-btn" data-id="${l.id}">Edit</button></td>
                    </tr>`;
                  }).join("")}
                </tbody>
              </table>
            </div>`
        }
      </div>`;

    // Listeners
    document.getElementById("btn-update-footprint")?.addEventListener("click", openUpdateFootprintModal);
    document.getElementById("dash-view-all")?.addEventListener("click", () => renderHistory());
    document.querySelectorAll(".edit-entry-btn").forEach(btn => {
      btn.addEventListener("click", () => openEditLogModal(btn.dataset.id));
    });

    // Render chart after DOM is ready
    setTimeout(() => {
      if (stats.weeklyTrend) renderTrendChart(stats.weeklyTrend);
      loadAITips(stats);
    }, 100);

  } catch(e) {
    body.innerHTML = `<div class="empty-state"><div class="empty-state-text">Failed to load dashboard. ${e.message}</div></div>`;
  }
}

// ══════════════════════════════════════════
//  LOG ACTIVITY
// ══════════════════════════════════════════
/**
 * Renders the Log Activity screen with a category selector,
 * activity dropdown, quantity input, live CO₂ estimate, and submit.
 * Re-renders reactively when category or quantity changes.
 */
function renderLog() {
  showScreen("app");
  setActiveNav("log");
  setHeader("Log Activity", "Record a new carbon emission entry");

  let selectedCat  = CATEGORIES[0];
  let selectedItem = CATEGORIES[0].options[0];
  let qty          = 1;

  function getEstimate() { return estimateCO2(selectedCat.id, qty); }

  function rebuild() {
    const est  = getEstimate();
    const body = document.getElementById("main-body");
    body.innerHTML = `
      <div class="card">
        <div class="card-title">Select category</div>
        <div class="cat-selector">
          ${CATEGORIES.map(c => `
            <button class="cat-btn ${selectedCat.id===c.id?"sel":""}" data-cat="${c.id}">
              <div class="cat-btn-icon">${c.icon}</div>
              <div class="cat-btn-label">${c.label}</div>
            </button>`).join("")}
        </div>

        <div class="form-row">
          <div>
            <label class="form-label">Activity</label>
            <select id="log-item" class="inline-select">
              ${selectedCat.options.map(o => `<option ${o===selectedItem?"selected":""}>${o}</option>`).join("")}
            </select>
          </div>
          <div>
            <label class="form-label">Quantity (${selectedCat.unit})</label>
            <div class="qty-row">
              <button class="qty-btn" id="qty-minus">−</button>
              <input type="number" class="qty-input" id="qty-val" value="${qty}" min="1" />
              <button class="qty-btn" id="qty-plus">+</button>
            </div>
          </div>
        </div>

        <div class="form-group">
          <label class="form-label">Note <span style="color:var(--mist);font-weight:400;text-transform:none">(optional)</span></label>
          <input id="log-note" class="form-input" placeholder="e.g. drove to office, weekly groceries…" value="${window._logNote||''}" />
        </div>

        <div class="estimate-box">
          <div>
            <div class="estimate-label">Estimated CO₂ emission</div>
            <div class="estimate-sub">Based on standard emission factors</div>
          </div>
          <div>
            <div class="estimate-value">${est}</div>
            <div class="estimate-unit">kg CO₂</div>
          </div>
        </div>

        <button class="btn-log" id="btn-submit-log">Log this activity</button>
      </div>`;

    // Category select
    body.querySelectorAll(".cat-btn").forEach(btn => {
      btn.addEventListener("click", () => {
        selectedCat  = CATEGORIES.find(c => c.id === btn.dataset.cat);
        selectedItem = selectedCat.options[0];
        window._logNote = body.querySelector("#log-note")?.value || "";
        rebuild();
      });
    });

    body.querySelector("#log-item").addEventListener("change", e => { selectedItem = e.target.value; });
    body.querySelector("#qty-minus").addEventListener("click", () => { qty = Math.max(1,qty-1); window._logNote=body.querySelector("#log-note").value; rebuild(); });
    body.querySelector("#qty-plus").addEventListener("click",  () => { qty++; window._logNote=body.querySelector("#log-note").value; rebuild(); });
    body.querySelector("#qty-val").addEventListener("change",  e  => { qty = Math.max(1,parseInt(e.target.value)||1); });

    body.querySelector("#btn-submit-log").addEventListener("click", async () => {
      const note = body.querySelector("#log-note").value;
      const kg   = estimateCO2(selectedCat.id, qty);
      try {
        await API.addLog({ cat: selectedCat.id, item: selectedItem, qty, kg, note });
        showToast(`Logged ${kg} kg CO₂ for "${selectedItem}"`);
        window._logNote = "";
        qty = 1;
        renderDashboard();
      } catch(e) {
        showToast("Failed to save entry", "error");
      }
    });
  }

  window._logNote = "";
  rebuild();
}

// ══════════════════════════════════════════
//  HISTORY
// ══════════════════════════════════════════
/**
 * Renders the full activity history table with category filter chips.
 * Supports edit and delete actions on each entry inline.
 * @param {string} [filterCat="all"] - Category ID to filter by, or "all"
 */
async function renderHistory(filterCat = "all") {
  showScreen("app");
  setActiveNav("history");

  const body = document.getElementById("main-body");
  body.innerHTML = `<div class="flex-center" style="height:200px"><div class="spinner"></div></div>`;

  try {
    const { logs } = await API.getLogs();
    AppState.logs  = logs;

    const filtered = filterCat === "all" ? logs : logs.filter(l => l.cat === filterCat);
    const totalKg  = filtered.reduce((a,l) => a+l.kg, 0);

    setHeader("History", `${logs.length} total entries — ${totalKg.toFixed(1)} kg CO₂ filtered`);

    body.innerHTML = `
      <!-- Filter bar -->
      <div class="filter-bar">
        <button class="filter-chip ${filterCat==="all"?"active-all":""}" data-cat="all">All (${logs.length})</button>
        ${CATEGORIES.map(c => {
          const count = logs.filter(l=>l.cat===c.id).length;
          return `<button class="filter-chip ${filterCat===c.id?"active-all":""}"
            data-cat="${c.id}" style="${filterCat===c.id?`border-color:${c.color};background:${c.bg};color:${c.color}`:""}">
            ${c.icon} ${c.label} (${count})
          </button>`;
        }).join("")}
      </div>

      <!-- Summary -->
      <div style="display:flex;gap:12px;margin-bottom:16px;flex-wrap:wrap">
        <div class="summary-pill">📊 ${filtered.length} entries shown</div>
        <div class="summary-pill">💨 ${totalKg.toFixed(1)} kg CO₂ total</div>
        <div class="summary-pill">📅 ${filtered.length>0?filtered[filtered.length-1].date:"—"} → ${filtered.length>0?filtered[0].date:"—"}</div>
      </div>

      <!-- Table -->
      <div class="card">
        <div class="card-title">All logged activities</div>
        ${filtered.length === 0
          ? emptyState("🗂️", "No records yet. Log your first activity to see it here.")
          : `<div class="log-table-wrap">
              <table class="log-table">
                <thead><tr>
                  <th>Activity</th><th>Category</th><th>Qty</th><th>CO₂</th><th>Note</th><th>Date</th><th>Actions</th>
                </tr></thead>
                <tbody>
                  ${filtered.map(l => {
                    const cat = getCat(l.cat);
                    return `<tr>
                      <td style="font-weight:500">${l.item}</td>
                      <td>${catChip(cat)}</td>
                      <td>${l.qty} ${cat?.unit||""}</td>
                      <td>${kgBadge(l.kg)}</td>
                      <td style="color:var(--mist);font-size:12px;max-width:140px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${l.note||"—"}</td>
                      <td style="color:var(--mist);font-size:12px;white-space:nowrap">${l.date}</td>
                      <td style="display:flex;gap:6px;white-space:nowrap">
                        <button class="action-btn edit-log-btn" data-id="${l.id}">✏️ Edit</button>
                        <button class="action-btn danger del-log-btn" data-id="${l.id}">🗑</button>
                      </td>
                    </tr>`;
                  }).join("")}
                </tbody>
              </table>
            </div>`}
      </div>`;

    // Filter chips
    body.querySelectorAll(".filter-chip").forEach(btn => {
      btn.addEventListener("click", () => renderHistory(btn.dataset.cat));
    });

    // Edit buttons
    body.querySelectorAll(".edit-log-btn").forEach(btn => {
      btn.addEventListener("click", () => openEditLogModal(btn.dataset.id, () => renderHistory(filterCat)));
    });

    // Delete buttons
    body.querySelectorAll(".del-log-btn").forEach(btn => {
      btn.addEventListener("click", () => confirmDeleteLog(btn.dataset.id, () => renderHistory(filterCat)));
    });

  } catch(e) {
    body.innerHTML = emptyState("⚠️", `Failed to load history: ${e.message}`);
  }
}

// ══════════════════════════════════════════
//  INSIGHTS
// ══════════════════════════════════════════
/**
 * Renders the Insights screen: what-if simulator, pledge action list,
 * comparison bars against national/global averages, and AI insight box.
 */
async function renderInsights() {
  showScreen("app");
  setActiveNav("insights");
  setHeader("Insights", "Your personalised reduction plan");

  const body = document.getElementById("main-body");
  body.innerHTML = `<div class="flex-center" style="height:200px"><div class="spinner"></div></div>`;

  try {
    const [{ pledges }, stats] = await Promise.all([API.getPledges(), API.getStats()]);
    AppState.pledges = pledges;

    const totalPledgeSaving = pledges.reduce((a,p) => { const act=ACTIONS.find(x=>x.id===p); return a+(act?act.saving:0); }, 0);
    const allSaving         = ACTIONS.reduce((a,x) => a+x.saving, 0);
    const withAll           = Math.max(0, stats.annual - allSaving);
    const topCatEntry       = Object.entries(stats.catKg).sort((a,b)=>b[1]-a[1])[0];
    const topCat            = topCatEntry ? getCat(topCatEntry[0]) : null;

    body.innerHTML = `
      <!-- What-if -->
      <div class="whatif-card">
        <div class="whatif-eyebrow">💡 What-if simulator</div>
        <div class="whatif-row">
          <div class="whatif-block">
            <div class="whatif-num" style="color:#FFB4A2">${(stats.annual/1000).toFixed(1)}t</div>
            <div class="whatif-sub">Your current footprint</div>
          </div>
          <div class="whatif-arrow">→</div>
          <div class="whatif-block">
            <div class="whatif-num" style="color:#95D5B2">${(withAll/1000).toFixed(1)}t</div>
            <div class="whatif-sub">With all pledges</div>
          </div>
        </div>
        <div class="whatif-note">
          🌱 Taking all actions saves <strong>${allSaving.toLocaleString()} kg CO₂/year</strong>
          — like planting <strong>${Math.round(allSaving/21)} trees</strong>.
          Your ${pledges.length} active pledge${pledges.length!==1?"s":""} already save <strong>${totalPledgeSaving} kg/yr</strong>.
        </div>
      </div>

      <div class="grid-2">
        <!-- Pledges -->
        <div class="card">
          <div class="card-title">Action pledges</div>
          <div class="pledge-list">
            ${ACTIONS.sort((a,b)=>b.saving-a.saving).map(action => {
              const pledged = pledges.includes(action.id);
              const diff_color = action.difficulty==="Easy"?"#2D8A5E":action.difficulty==="Medium"?"#D4712A":"#B5381E";
              return `<div class="pledge-item">
                <div class="pledge-info">
                  <div class="pledge-title-text">${action.title}</div>
                  <div class="pledge-saving-text">
                    Saves ${action.saving} kg/yr &nbsp;·&nbsp;
                    <span style="color:${diff_color};font-weight:700">${action.difficulty}</span>
                  </div>
                </div>
                <button class="pledge-action-btn ${pledged?"pledged":"unpledged"}" data-id="${action.id}">
                  ${pledged?"✓ Pledged":"Pledge"}
                </button>
              </div>`;
            }).join("")}
          </div>
          ${pledges.length>0?`
            <div style="margin-top:14px;padding:12px 16px;background:var(--foam);border-radius:10px;font-size:13px;color:var(--forest);font-weight:600">
              🎯 Your pledges save ${totalPledgeSaving.toLocaleString()} kg CO₂/year
            </div>`:""}
        </div>

        <!-- Compare -->
        <div class="card">
          <div class="card-title">How you compare</div>
          ${[
            {l:"Your footprint",     v:stats.annual, color:getRating(stats.annual).color},
            {l:"India national avg", v:1700,         color:"#52B788"},
            {l:"Global average",     v:4700,         color:"#D4712A"},
            {l:"Paris 2050 target",  v:2300,         color:"#52B788"},
            {l:"High emitter",       v:14000,        color:"#B5381E"},
          ].map(row=>`
            <div class="compare-row">
              <div class="compare-meta">
                <span class="compare-name">${row.l}</span>
                <span class="compare-val" style="color:${row.color}">${(row.v/1000).toFixed(1)}t</span>
              </div>
              <div class="compare-track">
                <div class="compare-fill" style="width:${Math.min((row.v/16000)*100,100)}%;background:${row.color}"></div>
              </div>
            </div>`).join("")}

          ${topCat ? `
            <div class="ai-insight-box" style="background:${topCat.bg}">
              <div class="ai-insight-title" style="color:${topCat.color}">🔍 Insight</div>
              <div class="ai-insight-text">
                <strong>${topCat.label}</strong> is your biggest source
                (${(topCatEntry[1]).toFixed(1)} kg logged). Targeting this category
                will have the highest return on effort.
              </div>
            </div>` : ""}
        </div>
      </div>`;

    // Pledge toggle
    body.querySelectorAll(".pledge-action-btn").forEach(btn => {
      btn.addEventListener("click", async () => {
        const id   = btn.dataset.id;
        const next = pledges.includes(id) ? pledges.filter(x=>x!==id) : [...pledges, id];
        try {
          await API.savePledges(next);
          AppState.pledges = next;
          showToast(next.includes(id) ? "Pledge added!" : "Pledge removed");
          renderInsights();
        } catch(e) {
          showToast("Failed to update pledge", "error");
        }
      });
    });

  } catch(e) {
    body.innerHTML = emptyState("⚠️", `Failed to load insights: ${e.message}`);
  }
}

// ══════════════════════════════════════════
//  SETTINGS
// ══════════════════════════════════════════
/**
 * Renders the Settings screen: profile editing, footprint management,
 * quiz retake option, and sign-out button.
 */
function renderSettings() {
  showScreen("app");
  setActiveNav("settings");
  setHeader("Settings", "Manage your account and footprint estimate");

  const user   = AppState.user;
  const rating = getRating(user.annual||0);
  const body   = document.getElementById("main-body");

  body.innerHTML = `
    <div class="grid-2">
      <!-- Profile -->
      <div class="card">
        <div class="card-title">Profile</div>
        <div class="settings-row">
          <div class="settings-row-left">
            <div class="settings-row-label">Full name</div>
            <div class="settings-row-sub">${user.name}</div>
          </div>
          <button class="btn-edit" id="btn-edit-name">Edit</button>
        </div>
        <div class="settings-row">
          <div class="settings-row-left">
            <div class="settings-row-label">Email address</div>
            <div class="settings-row-sub">${user.email}</div>
          </div>
        </div>
        <div class="settings-row">
          <div class="settings-row-left">
            <div class="settings-row-label">Member since</div>
            <div class="settings-row-sub">${new Date(user.createdAt).toLocaleDateString("en-IN",{day:"numeric",month:"long",year:"numeric"})}</div>
          </div>
        </div>
      </div>

      <!-- Footprint -->
      <div class="card">
        <div class="card-title">Carbon footprint estimate</div>
        <div class="settings-row">
          <div class="settings-row-left">
            <div class="settings-row-label">Annual estimate</div>
            <div class="settings-row-sub">
              ${(user.annual/1000).toFixed(1)} tonnes CO₂/yr &nbsp;·&nbsp;
              <span style="color:${rating.color};font-weight:700">${rating.label}</span>
            </div>
          </div>
          <button class="btn-edit" id="btn-update-est">Update manually</button>
        </div>
        <div class="settings-row">
          <div class="settings-row-left">
            <div class="settings-row-label">Retake onboarding quiz</div>
            <div class="settings-row-sub">Recalculate your baseline footprint</div>
          </div>
          <button class="btn-edit" id="btn-retake-quiz">Retake quiz</button>
        </div>
        <div class="settings-row">
          <div class="settings-row-left">
            <div class="settings-row-label">Total activities logged</div>
            <div class="settings-row-sub">${(AppState.logs||[]).length} entries recorded</div>
          </div>
        </div>
        <div class="settings-row">
          <div class="settings-row-left">
            <div class="settings-row-label">Active pledges</div>
            <div class="settings-row-sub">${(AppState.pledges||[]).length} of ${ACTIONS.length} actions pledged</div>
          </div>
        </div>
      </div>
    </div>

    <!-- Danger zone -->
    <div class="card">
      <div class="card-title">Account</div>
      <div class="settings-row">
        <div class="settings-row-left">
          <div class="settings-row-label">Sign out</div>
          <div class="settings-row-sub">You will be returned to the login screen</div>
        </div>
        <button class="btn-danger" id="settings-logout">Sign out</button>
      </div>
    </div>`;

  // Edit name
  body.querySelector("#btn-edit-name").addEventListener("click", () => {
    showModal({
      title: "Edit your name",
      sub:   "This is shown in the sidebar and dashboard.",
      fields: [{ id:"name", label:"Full name", value: user.name, placeholder:"Your full name" }],
      confirmLabel: "Save changes",
      onConfirm: async ({ name }) => {
        if (!name?.trim()) return showToast("Name cannot be empty", "error");
        try {
          const { user: u } = await API.updateProfile({ name });
          AppState.user = u;
          updateSidebarUser(u);
          closeModal();
          showToast("Name updated!");
          renderSettings();
        } catch(e) { showToast("Failed to update name", "error"); }
      }
    });
  });

  // Update footprint manually
  body.querySelector("#btn-update-est").addEventListener("click", openUpdateFootprintModal);

  // Retake quiz
  body.querySelector("#btn-retake-quiz").addEventListener("click", async () => {
    try {
      await API.retakeQuiz();
      AppState.user.quizDone = false;
      renderQuiz();
    } catch(e) { showToast("Error", "error"); }
  });

  // Logout
  body.querySelector("#settings-logout").addEventListener("click", doLogout);
}

// ══════════════════════════════════════════
//  MODALS — Edit & Delete Log, Update Footprint
// ══════════════════════════════════════════
/**
 * Opens a modal pre-populated with the existing entry data
 * to allow the user to edit item, qty, kg, and note.
 * @param {string}    logId  - ID of the log entry to edit
 * @param {Function}  [onDone] - Callback fired after a successful save
 */
function openEditLogModal(logId, onDone) {
  const log = AppState.logs?.find(l => l.id === logId);
  if (!log) return;
  const cat = getCat(log.cat);

  showModal({
    title: "Edit entry",
    sub:   `Editing: ${log.item} — ${log.date}`,
    fields: [
      { id:"item", label:"Activity",          value: log.item, placeholder:"Activity name" },
      { id:"qty",  label:`Quantity (${cat?.unit||""})`, type:"number", value: log.qty,  placeholder:"Quantity" },
      { id:"kg",   label:"CO₂ (kg)",          type:"number", value: log.kg,  placeholder:"CO₂ in kg" },
      { id:"note", label:"Note",              value: log.note, placeholder:"Optional note" },
    ],
    confirmLabel: "Save changes",
    onConfirm: async ({ item, qty, kg, note }) => {
      try {
        await API.updateLog(logId, { item, qty: Number(qty), kg: Number(kg), note });
        closeModal();
        showToast("Entry updated!");
        if (onDone) onDone(); else renderDashboard();
      } catch(e) { showToast("Failed to update entry", "error"); }
    }
  });
}

/**
 * Opens a confirmation modal before permanently deleting a log entry.
 * @param {string}   logId  - ID of the log entry to delete
 * @param {Function} [onDone] - Callback fired after successful deletion
 */
function confirmDeleteLog(logId, onDone) {
  const log = AppState.logs?.find(l => l.id === logId);
  showModal({
    title: "Delete this entry?",
    sub:   `This will permanently remove "${log?.item||"this entry"}" from your history.`,
    fields: [],
    confirmLabel: "Yes, delete",
    confirmClass: "danger",
    onConfirm: async () => {
      try {
        await API.deleteLog(logId);
        closeModal();
        showToast("Entry deleted");
        if (onDone) onDone(); else renderHistory();
      } catch(e) { showToast("Failed to delete", "error"); }
    }
  });
}

/**
 * Opens a modal that lets the user manually update their annual
 * CO₂ footprint estimate without retaking the full quiz.
 */
function openUpdateFootprintModal() {
  showModal({
    title: "Update footprint estimate",
    sub:   "Enter your revised annual CO₂ estimate in kg (e.g. 5200 = 5.2 tonnes).",
    fields: [{ id:"annual", label:"Annual CO₂ (kg)", type:"number", value: AppState.user?.annual||0, placeholder:"e.g. 5200" }],
    confirmLabel: "Update",
    onConfirm: async ({ annual }) => {
      const val = Number(annual);
      if (!val || val < 0) return showToast("Enter a valid number", "error");
      try {
        const { user } = await API.updateFootprint(val);
        AppState.user  = user;
        closeModal();
        showToast(`Footprint updated to ${(val/1000).toFixed(1)} tonnes/yr`);
        renderDashboard();
      } catch(e) { showToast("Failed to update", "error"); }
    }
  });
}

// ══════════════════════════════════════════
//  CHART — Weekly CO2 Trend (Chart.js)
// ══════════════════════════════════════════
/**
 * Renders (or re-renders) the 7-day CO₂ trend bar chart using Chart.js.
 * Bars are colour-coded: green for low emissions, amber for medium,
 * red for high. Destroys any existing chart instance before creating.
 * @param {Array<{date: string, kg: number}>} weeklyTrend - 7 data points
 */
function renderTrendChart(weeklyTrend) {
  const canvas = document.getElementById("trend-chart");
  if (!canvas || typeof Chart === "undefined") return;

  // Destroy existing chart if any
  if (window._trendChart) { window._trendChart.destroy(); }

  window._trendChart = new Chart(canvas, {
    type: "bar",
    data: {
      labels:   weeklyTrend.map(d => d.date),
      datasets: [{
        label:           "CO₂ (kg)",
        data:            weeklyTrend.map(d => d.kg),
        backgroundColor: weeklyTrend.map(d =>
          d.kg > 30 ? "rgba(181,56,30,0.7)"
          : d.kg > 10 ? "rgba(212,113,42,0.7)"
          : "rgba(82,183,136,0.7)"
        ),
        borderColor: weeklyTrend.map(d =>
          d.kg > 30 ? "#B5381E" : d.kg > 10 ? "#D4712A" : "#52B788"
        ),
        borderWidth:  2,
        borderRadius: 8,
      }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: ctx => ` ${ctx.raw} kg CO₂`,
          },
        },
      },
      scales: {
        y: {
          beginAtZero: true,
          grid: { color: "rgba(0,0,0,0.05)" },
          ticks: {
            callback: v => `${v}kg`,
            color: "#9AADA4",
            font: { size: 11 },
          },
        },
        x: {
          grid: { display: false },
          ticks: { color: "#9AADA4", font: { size: 11 } },
        },
      },
    },
  });
}

// ══════════════════════════════════════════
//  AI TIPS — Gemini-powered suggestions
// ══════════════════════════════════════════
/**
 * Fetches personalised carbon reduction tips from the Claude API
 * based on the user's actual usage data, and injects them into
 * the #ai-tips-box element. Falls back to curated static tips if
 * the API is unavailable.
 * @param {object} stats - Dashboard stats object from GET /api/stats
 */
async function loadAITips(stats) {
  const el = document.getElementById("ai-tips-box");
  if (!el) return;

  el.innerHTML = `<div class="flex-center" style="padding:16px"><div class="spinner"></div><span style="margin-left:10px;font-size:13px;color:var(--mist)">Getting personalised tips…</span></div>`;

  try {
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "claude-sonnet-4-6",
        max_tokens: 400,
        messages: [{
          role: "user",
          content: `You are a carbon footprint expert. Give exactly 3 short, specific, actionable tips to reduce carbon emissions.

User data:
- Annual footprint: ${(stats.annual/1000).toFixed(1)} tonnes CO2/year
- Today logged: ${stats.todayKg} kg CO2
- Biggest category: ${Object.entries(stats.catKg).sort((a,b)=>b[1]-a[1])[0]?.[0] || "unknown"}
- Category breakdown: Travel=${stats.catKg.travel}kg, Food=${stats.catKg.food}kg, Energy=${stats.catKg.energy}kg, Shopping=${stats.catKg.goods}kg

Format your response as exactly 3 tips, each starting with an emoji and being 1-2 sentences max. Be specific and encouraging. No intro text, just the 3 tips.`
        }],
      }),
    });

    if (!response.ok) throw new Error("AI unavailable");
    const data = await response.json();
    const tips = data.content?.[0]?.text || "";

    el.innerHTML = `
      <div class="card-title">🤖 AI-Powered Personal Tips</div>
      <div style="font-size:13.5px;line-height:1.8;color:var(--ink);white-space:pre-line">${tips}</div>
      <div style="margin-top:12px;font-size:11px;color:var(--mist)">Generated based on your actual usage data</div>`;
  } catch(e) {
    // Fallback tips if AI unavailable
    const topCat = Object.entries(stats.catKg).sort((a,b)=>b[1]-a[1])[0]?.[0];
    const fallbacks = {
      food:   ["🥗 Try going plant-based 3 days a week — it saves up to 420kg CO₂/year.",
               "🛒 Buy local and seasonal produce to cut food transport emissions.",
               "♻️ Reduce food waste — 8% of global emissions come from wasted food."],
      travel: ["🚆 Replace one flight with a train journey to save up to 890kg CO₂.",
               "🚲 Cycle or walk for trips under 3km — saves fuel and improves health.",
               "🚗 Try carpooling twice a week to halve your commute emissions."],
      energy: ["💡 Switch to LED bulbs — they use 75% less energy.",
               "🌡️ Lower your thermostat by 2°C to save 210kg CO₂/year.",
               "☀️ Ask your energy provider about a renewable energy tariff."],
      goods:  ["👗 Buy secondhand clothing first — fashion is 10% of global emissions.",
               "🔧 Repair before replacing electronics to reduce e-waste.",
               "🎁 Choose experiences over things — memories don't have a carbon footprint."],
    };
    const tips = (fallbacks[topCat] || fallbacks.food).join("\n\n");
    el.innerHTML = `
      <div class="card-title">💡 Personalised Tips</div>
      <div style="font-size:13.5px;line-height:1.8;color:var(--ink);white-space:pre-line">${tips}</div>
      <div style="margin-top:12px;font-size:11px;color:var(--mist)">Based on your highest-emission category</div>`;
  }
}