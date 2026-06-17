// ─────────────────────────────────────────
//  ui.js — Reusable UI helpers
// ─────────────────────────────────────────

// ── Toast ─────────────────────────────────────────────────────
let _toastTimer = null;
function showToast(msg, type = "success") {
  const el = document.getElementById("toast");
  const icons = { success:"✅", error:"❌", info:"ℹ️" };
  el.textContent = `${icons[type]||""} ${msg}`;
  el.className   = `toast ${type}`;
  if (_toastTimer) clearTimeout(_toastTimer);
  _toastTimer = setTimeout(() => el.classList.add("hidden"), 3000);
}

// ── Modal ─────────────────────────────────────────────────────
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

function closeModal() {
  document.getElementById("modal-overlay").classList.add("hidden");
}

// ── Gauge SVG ─────────────────────────────────────────────────
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
function badge(label, color, bg) {
  return `<span class="badge" style="color:${color};background:${bg}">${label}</span>`;
}

// ── Category chip ─────────────────────────────────────────────
function catChip(cat) {
  if (!cat) return "—";
  return `<span class="log-cat-chip" style="color:${cat.color};background:${cat.bg}">${cat.icon} ${cat.label}</span>`;
}

// ── KG badge ─────────────────────────────────────────────────
function kgBadge(kg) {
  const cls = kg > 30 ? "kg-high" : kg > 10 ? "kg-mid" : "kg-low";
  return `<span class="log-kg-badge ${cls}">${kg} kg</span>`;
}

// ── Empty state ───────────────────────────────────────────────
function emptyState(icon, text) {
  return `<div class="empty-state"><div class="empty-state-icon">${icon}</div><div class="empty-state-text">${text}</div></div>`;
}

// ── Show/hide screen ──────────────────────────────────────────
function showScreen(id) {
  document.querySelectorAll(".screen").forEach(s => s.classList.add("hidden"));
  const el = document.getElementById(`screen-${id}`);
  if (el) el.classList.remove("hidden");
}

// ── Update main header ────────────────────────────────────────
function setHeader(title, subtitle) {
  document.getElementById("main-title").textContent    = title;
  document.getElementById("main-subtitle").textContent = subtitle;
}

// ── Active nav item ───────────────────────────────────────────
function setActiveNav(screenId) {
  document.querySelectorAll(".nav-item").forEach(btn => {
    btn.classList.toggle("active", btn.dataset.screen === screenId);
  });
}
