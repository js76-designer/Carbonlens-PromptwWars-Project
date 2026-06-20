// ─────────────────────────────────────────
//  ui.js — Reusable UI helpers
// ─────────────────────────────────────────

// ── Toast ─────────────────────────────────────────────────────
let _toastTimer = null;
/**
 * Displays a temporary toast notification at the bottom-right of the screen.
 * @param {string} msg              - Message to display
 * @param {"success"|"error"|"info"} [type="success"] - Visual style
 */
function showToast(msg, type = "success") {
  const el = document.getElementById("toast");
  const icons = { success:"✅", error:"❌", info:"ℹ️" };
  el.textContent = `${icons[type]||""} ${msg}`;
  el.className   = `toast ${type}`;
  if (_toastTimer) clearTimeout(_toastTimer);
  _toastTimer = setTimeout(() => el.classList.add("hidden"), 3000);
}

// ── Modal ─────────────────────────────────────────────────────
/**
 * Renders and opens a modal dialog with optional form fields.
 * @param {object}   opts
 * @param {string}   opts.title         - Modal heading
 * @param {string}   [opts.sub]         - Subtitle / description text
 * @param {Array}    [opts.fields]      - Form field descriptors
 * @param {string}   [opts.confirmLabel] - Confirm button label
 * @param {string}   [opts.confirmClass] - Extra CSS class on confirm button
 * @param {Function} opts.onConfirm     - Called with { fieldId: value } on confirm
 */
function showModal({ title, sub, fields=[], confirmLabel="Confirm", confirmClass="", onConfirm }) {
  const overlay = document.getElementById("modal-overlay");
  const box     = document.getElementById("modal-box");

  const fieldsHTML = fields.map(f => `
    <div class="form-group">
      <label class="form-label">${f.label}</label>
      ${f.type === "select"
        ? `<select id="mf-${f.id}" class="inline-select">${f.options.map(o=>`<option value="${o.v||o}">${o.l||o}</option>`).join("")}</select>`
        : `<input id="mf-${f.id}" class="form-input" type="${f.type||'text'}" value="${f.value||''}" placeholder="${f.placeholder||''}" />`
      }
    </div>`).join("");

  box.innerHTML = `
    <div class="modal-title">${title}</div>
    <div class="modal-sub">${sub||""}</div>
    ${fieldsHTML}
    <div class="modal-actions">
      <button class="btn-cancel" id="modal-cancel">Cancel</button>
      <button class="btn-confirm ${confirmClass}" id="modal-confirm">${confirmLabel}</button>
    </div>`;

  overlay.classList.remove("hidden");

  document.getElementById("modal-cancel").onclick  = closeModal;
  overlay.onclick = (e) => { if(e.target===overlay) closeModal(); };
  document.getElementById("modal-confirm").onclick = () => {
    const vals = {};
    fields.forEach(f => {
      const el = document.getElementById(`mf-${f.id}`);
      vals[f.id] = el ? el.value : null;
    });
    onConfirm(vals);
  };
}

/**
 * Closes the currently open modal overlay.
 */
function closeModal() {
  document.getElementById("modal-overlay").classList.add("hidden");
}

// ── Gauge SVG ─────────────────────────────────────────────────
/**
 * Builds an SVG ring/donut gauge element as an HTML string.
 * @param {number} value - Current value
 * @param {number} max   - Maximum value (full ring)
 * @param {number} size  - SVG canvas size in px (square)
 * @param {string} color - Stroke colour (CSS colour string)
 * @returns {string} SVG HTML string
 */
function buildGaugeSVG(value, max, size, color) {
  const r    = (size - 14) / 2;
  const circ = 2 * Math.PI * r;
  const dash = Math.min(value / max, 1) * circ;
  return `
    <svg width="${size}" height="${size}" style="transform:rotate(-90deg)">
      <circle cx="${size/2}" cy="${size/2}" r="${r}" fill="none" stroke="#EDE9DF" stroke-width="10"/>
      <circle cx="${size/2}" cy="${size/2}" r="${r}" fill="none" stroke="${color}" stroke-width="10"
        stroke-dasharray="${dash} ${circ}" stroke-linecap="round"/>
    </svg>`;
}

// ── Badge ─────────────────────────────────────────────────────
/**
 * Returns an HTML badge/pill element as a string.
 * @param {string} label - Text content
 * @param {string} color - Text colour
 * @param {string} bg    - Background colour
 * @returns {string} HTML string
 */
function badge(label, color, bg) {
  return `<span class="badge" style="color:${color};background:${bg}">${label}</span>`;
}

// ── Category chip ─────────────────────────────────────────────
/**
 * Returns an HTML category chip element for use in tables.
 * @param {object|undefined} cat - Category object from CATEGORIES array
 * @returns {string} HTML string
 */
function catChip(cat) {
  if (!cat) return "—";
  return `<span class="log-cat-chip" style="color:${cat.color};background:${cat.bg}">${cat.icon} ${cat.label}</span>`;
}

// ── KG badge ─────────────────────────────────────────────────
/**
 * Returns a colour-coded CO₂ badge HTML string.
 * Green for low emissions, amber for medium, red for high.
 * @param {number} kg - CO₂ value in kg
 * @returns {string} HTML string
 */
function kgBadge(kg) {
  const cls = kg > 30 ? "kg-high" : kg > 10 ? "kg-mid" : "kg-low";
  return `<span class="log-kg-badge ${cls}">${kg} kg</span>`;
}

// ── Empty state ───────────────────────────────────────────────
/**
 * Returns an HTML empty-state placeholder (icon + message).
 * @param {string} icon - Emoji or icon character
 * @param {string} text - Descriptive message
 * @returns {string} HTML string
 */
function emptyState(icon, text) {
  return `<div class="empty-state"><div class="empty-state-icon">${icon}</div><div class="empty-state-text">${text}</div></div>`;
}

// ── Show/hide screen ──────────────────────────────────────────
/**
 * Shows the named top-level screen div and hides all others.
 * @param {string} id - Screen identifier, e.g. "login", "app", "quiz"
 */
function showScreen(id) {
  document.querySelectorAll(".screen").forEach(s => s.classList.add("hidden"));
  const el = document.getElementById(`screen-${id}`);
  if (el) el.classList.remove("hidden");
}

// ── Update main header ────────────────────────────────────────
/**
 * Updates the main content area's page title and subtitle.
 * @param {string} title    - Primary heading text
 * @param {string} subtitle - Secondary/contextual text
 */
function setHeader(title, subtitle) {
  document.getElementById("main-title").textContent    = title;
  document.getElementById("main-subtitle").textContent = subtitle;
}

// ── Active nav item ───────────────────────────────────────────
/**
 * Marks the matching sidebar nav item as active, removing the
 * active class from all others.
 * @param {string} screenId - The data-screen value of the target nav item
 */
function setActiveNav(screenId) {
  document.querySelectorAll(".nav-item").forEach(btn => {
    btn.classList.toggle("active", btn.dataset.screen === screenId);
  });
}