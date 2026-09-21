const $ = (id) => document.getElementById(id);
let ADMIN_KEY = localStorage.getItem("nexora_admin") || "";
let CURRENT_TOURNAMENT = null;
let CURRENT_TAB = "info";

/* ============ NAV ============ */
document.querySelectorAll("[data-nav]").forEach(b => {
  b.addEventListener("click", () => switchView(b.dataset.nav));
});

function switchView(name) {
  document.querySelectorAll("[data-nav]").forEach(b => b.classList.toggle("active", b.dataset.nav === name));
  $("view-home").classList.toggle("hidden", name !== "home");
  $("view-admin").classList.toggle("hidden", name !== "admin");
  $("view-detail").classList.toggle("hidden", name !== "detail");

  if (name === "home") loadTournaments();
  if (name === "admin") renderAdmin();
}

function goHome() { switchView("home"); }
window.goHome = goHome;

/* ============ API ============ */
async function api(url, opts = {}) {
  const headers = { "Content-Type": "application/json", ...(opts.headers || {}) };
  if (ADMIN_KEY) headers["X-Admin-Key"] = ADMIN_KEY;
  const res = await fetch(url, { ...opts, headers });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
  return data;
}

/* ============ LOAD TOURNAMENTS ============ */
async function loadTournaments() {
  const list = $("tournamentList");
  try {
    const data = await api("/api/tournaments");
    if (!data.length) {
      list.innerHTML = '<div class="empty">Abhi koi tournament nahi hai.<br/>Admin panel se banao!</div>';
      return;
    }
    list.innerHTML = data.map(t => `
      <div class="t-card" onclick="openTournament('${t.id}')">
        <div class="row">
          <h3>${esc(t.name)}</h3>
          <span class="status ${t.status}">${t.status}</span>
        </div>
        <div class="meta">
          🎮 <b>${esc(t.game)}</b><br/>
          📅 ${esc(t.date)}<br/>
          👥 Slots: <b>${t.registered}/${t.slots}</b> ${t.pending ? `(${t.pending} pending)` : ""}<br/>
          🏆 Prize: <b>${esc(t.prize)}</b>
        </div>
      </div>
    `).join("");
  } catch (e) {
    list.innerHTML = `<div class="empty">Error: ${esc(e.message)}</div>`;
  }
}

/* ============ OPEN TOURNAMENT ============ */
async function openTournament(id) {
  try {
    CURRENT_TOURNAMENT = await api(`/api/tournaments/${id}`);
    CURRENT_TAB = "info";
    switchView("detail");
    renderDetail();
  } catch (e) {
    alert("Error: " + e.message);
  }
}
window.openTournament = openTournament;

function renderDetail() {
  const t = CURRENT_TOURNAMENT;
  if (!t) return;

  $("detailHeader").innerHTML = `
    <h2 style="font-size:22px;margin-bottom:8px;">
      ${esc(t.name)}
      <span class="status ${t.status}" style="vertical-align:middle;margin-left:8px;">${t.status}</span>
    </h2>
    <div class="stat-row">
      <div class="stat"><div class="v">${t.teams.filter(x=>x.status==="approved").length}/${t.slots}</div><div class="l">Teams</div></div>
      <div class="stat"><div class="v">${t.matches.length}</div><div class="l">Matches</div></div>
      <div class="stat"><div class="v">${esc(t.prize)}</div><div class="l">Prize</div></div>
      <div class="stat"><div class="v">${esc(t.entry)}</div><div class="l">Entry</div></div>
    </div>
  `;

  document.querySelectorAll("#detailTabs button").forEach(b => {
    b.classList.toggle("active", b.dataset.tab === CURRENT_TAB);
    b.onclick = () => { CURRENT_TAB = b.dataset.tab; renderDetail(); };
  });

  const content = $("detailContent");

  if (CURRENT_TAB === "info") {
    content.innerHTML = `
      <div class="notice info">
        🎮 <b>${esc(t.game)}</b> • 📅 <b>${esc(t.date)}</b> • 🌍 Status: <b>${t.status}</b>
      </div>
      ${t.rules ? `<h3>📜 Rules</h3><p style="font-size:13px;line-height:1.7;color:var(--muted);white-space:pre-wrap;">${esc(t.rules)}</p>` : ""}
      <h3>📝 Register Your Team</h3>
      <div class="form" id="regForm">
        <div class="form-row">
          <div><label>Team Name *</label><input id="regTeamName" /></div>
          <div><label>Captain IGN *</label><input id="regCaptain" /></div>
        </div>
        <div class="form-row">
          <div><label>Player 2</label><input id="regP2" /></div>
          <div><label>Player 3</label><input id="regP3" /></div>
        </div>
        <div class="form-row">
          <div><label>Player 4</label><input id="regP4" /></div>
          <div><label>Player 5</label><input id="regP5" /></div>
        </div>
        <div><label>Contact (Discord/WhatsApp)</label><input id="regContact" /></div>
        <button class="btn primary" onclick="registerTeam()">🎯 Register Team</button>
      </div>
    `;
  }

  if (CURRENT_TAB === "teams") {
    const approved = t.teams.filter(x => x.status === "approved");
    const pending = t.teams.filter(x => x.status === "pending");
    const rejected = t.teams.filter(x => x.status === "rejected");

    content.innerHTML = `
      ${pending.length ? `<h3>⏳ Pending (${pending.length})</h3>${pending.map(teamRow).join("")}` : ""}
      <h3>✅ Approved (${approved.length})</h3>
      ${approved.length ? approved.map(teamRow).join("") : '<div class="empty">Abhi koi approved team nahi</div>'}
      ${rejected.length ? `<h3>❌ Rejected (${rejected.length})</h3>${rejected.map(teamRow).join("")}` : ""}
    `;
  }

  if (CURRENT_TAB === "points") {
    const sorted = [...t.teams].filter(x => x.status === "approved").sort((a, b) =>
      (b.points - a.points) || (b.kills - a.kills) || (b.wins - a.wins)
    );
    content.innerHTML = sorted.length ? `
      <table>
        <thead><tr>
          <th>#</th><th>Team</th><th>Matches</th><th>Wins</th><th>Kills</th><th>Points</th>
        </tr></thead>
        <tbody>
          ${sorted.map((team, i) => `
            <tr>
              <td class="rank pos-${i+1 <= 3 ? i+1 : 'x'}">${i + 1}</td>
              <td><b>${esc(team.teamName)}</b></td>
              <td>${team.matches || 0}</td>
              <td>${team.wins || 0}</td>
              <td>${team.kills || 0}</td>
              <td><b style="color:var(--accent2);">${team.points || 0}</b></td>
            </tr>
          `).join("")}
        </tbody>
      </table>
    ` : '<div class="empty">Abhi koi team approved nahi</div>';
  }

  if (CURRENT_TAB === "matches") {
    content.innerHTML = t.matches.length ? t.matches.map(m => `
      <div class="team-card">
        <div class="team-info">
          <b>${esc(m.name)}</b> ${m.time ? `• ⏰ ${esc(m.time)}` : ""}<br/>
          <small>Status: ${m.status}</small>
        </div>
        <span class="badge ${m.status === "completed" ? "approved" : "pending"}">${m.status}</span>
      </div>
    `).join("") : '<div class="empty">Abhi koi match schedule nahi</div>';
  }
}

function teamRow(x) {
  return `
    <div class="team-card">
      <div class="team-info">
        <b>${esc(x.teamName)}</b> <span class="badge ${x.status}">${x.status}</span><br/>
        👑 Captain: ${esc(x.captain)}<br/>
        ${x.players?.length ? `👥 ${x.players.map(esc).join(", ")}<br/>` : ""}
        ${x.contact ? `📞 ${esc(x.contact)}` : ""}
      </div>
    </div>
  `;
}

/* ============ REGISTER TEAM ============ */
async function registerTeam() {
  const teamName = $("regTeamName").value.trim();
  const captain = $("regCaptain").value.trim();
  if (!teamName || !captain) return alert("Team name aur captain required!");

  const players = [$("regP2").value, $("regP3").value, $("regP4").value, $("regP5").value]
    .map(v => v.trim()).filter(Boolean);

  try {
    await api(`/api/tournaments/${CURRENT_TOURNAMENT.id}/register`, {
      method: "POST",
      body: JSON.stringify({
        teamName, captain, players,
        contact: $("regContact").value.trim()
      })
    });
    alert("✅ Team registered! Admin approve karega.");
    CURRENT_TOURNAMENT = await api(`/api/tournaments/${CURRENT_TOURNAMENT.id}`);
    CURRENT_TAB = "teams";
    renderDetail();
  } catch (e) {
    alert("❌ " + e.message);
  }
}
window.registerTeam = registerTeam;

/* ============ ADMIN ============ */
function renderAdmin() {
  if (ADMIN_KEY) {
    $("adminLogin").classList.add("hidden");
    $("adminPanel").classList.remove("hidden");
    loadAdminTournaments();
  } else {
    $("adminLogin").classList.remove("hidden");
    $("adminPanel").classList.add("hidden");
  }
}

async function adminLogin() {
  const key = $("adminKeyInput").value.trim();
  if (!key) return alert("Key daalo!");
  ADMIN_KEY = key;
  try {
    await api("/api/tournaments"); // validate
    localStorage.setItem("nexora_admin", key);
    renderAdmin();
  } catch (e) {
    ADMIN_KEY = "";
    localStorage.removeItem("nexora_admin");
    alert("❌ Galat key");
  }
}
window.adminLogin = adminLogin;

function adminLogout() {
  ADMIN_KEY = "";
  localStorage.removeItem("nexora_admin");
  $("adminKeyInput").value = "";
  renderAdmin();
}
window.adminLogout = adminLogout;

async function createTournament() {
  const name = $("tName").value.trim();
  if (!name) return alert("Name required!");

  try {
    await api("/api/tournaments", {
      method: "POST",
      body: JSON.stringify({
        name,
        game: $("tGame").value.trim() || "Free Fire",
        date: $("tDate").value || new Date().toISOString().slice(0, 10),
        slots: +$("tSlots").value || 12,
        prize: $("tPrize").value.trim(),
        entry: $("tEntry").value.trim(),
        rules: $("tRules").value.trim()
      })
    });
    alert("✅ Tournament created!");
    ["tName","tPrize","tEntry","tRules"].forEach(id => $(id).value = "");
    loadAdminTournaments();
  } catch (e) {
    alert("❌ " + e.message);
  }
}
window.createTournament = createTournament;

async function loadAdminTournaments() {
  const box = $("adminTournamentList");
  try {
    const data = await api("/api/tournaments");
    if (!data.length) {
      box.innerHTML = '<div class="empty">Koi tournament nahi</div>';
      return;
    }
    box.innerHTML = data.map(t => `
      <div class="team-card">
        <div class="team-info">
          <b>${esc(t.name)}</b> <span class="status ${t.status}" style="font-size:9px;">${t.status}</span><br/>
          <small>👥 ${t.registered}/${t.slots} teams ${t.pending ? `• ${t.pending} pending` : ""}</small>
        </div>
        <div class="btn-row">
          <button class="btn ghost" onclick="manageTournament('${t.id}')">Manage</button>
          <button class="btn danger" onclick="deleteTournament('${t.id}')">Delete</button>
        </div>
      </div>
    `).join("");
  } catch (e) {
    box.innerHTML = `<div class="empty">Error: ${esc(e.message)}</div>`;
  }
}

async function deleteTournament(id) {
  if (!confirm("Delete this tournament?")) return;
  try {
    await api(`/api/tournaments/${id}`, { method: "DELETE" });
    loadAdminTournaments();
  } catch (e) { alert(e.message); }
}
window.deleteTournament = deleteTournament;

/* ============ MANAGE TOURNAMENT (MODAL) ============ */
async function manageTournament(id) {
  const t = await api(`/api/tournaments/${id}`);
  const pending = t.teams.filter(x => x.status === "pending");
  const approved = t.teams.filter(x => x.status === "approved");

  $("modalContent").innerHTML = `
    <h3>⚙️ ${esc(t.name)}</h3>

    <div style="margin-bottom:16px;">
      <label>Status</label>
      <select id="mtStatus">
        ${["open","closed","live","ended"].map(s =>
          `<option value="${s}" ${s === t.status ? "selected" : ""}>${s}</option>`
        ).join("")}
      </select>
      <button class="btn primary" style="margin-top:8px;" onclick="updateStatus('${id}')">Update Status</button>
    </div>

    ${pending.length ? `
      <h3 style="color:var(--warn);">⏳ Pending (${pending.length})</h3>
      ${pending.map(x => `
        <div class="team-card">
          <div class="team-info">
            <b>${esc(x.teamName)}</b> • 👑 ${esc(x.captain)}
            ${x.contact ? `<br/><small>📞 ${esc(x.contact)}</small>` : ""}
          </div>
          <div class="btn-row">
            <button class="btn ok" onclick="approveTeam('${id}','${x.id}','approve')">✓</button>
            <button class="btn danger" onclick="approveTeam('${id}','${x.id}','reject')">✕</button>
          </div>
        </div>
      `).join("")}
    ` : ""}

    <h3>➕ Add Match</h3>
    <div class="form">
      <input id="matchName" placeholder="Match name (e.g. Round 1)" />
      <input id="matchTime" placeholder="Time (e.g. 8:00 PM)" />
      <button class="btn primary" onclick="addMatch('${id}')">Add Match</button>
    </div>

    ${t.matches.length ? `
      <h3>⚔️ Matches (${t.matches.length})</h3>
      ${t.matches.map(m => `
        <div class="team-card">
          <div class="team-info">
            <b>${esc(m.name)}</b> ${m.time ? `• ${esc(m.time)}` : ""}<br/>
            <small>${m.status}</small>
          </div>
          <button class="btn ghost" onclick="openResultForm('${id}','${m.id}')">
            ${m.status === "completed" ? "Edit Result" : "Enter Result"}
          </button>
        </div>
      `).join("")}
    ` : ""}

    <div class="btn-row" style="margin-top:18px;">
      <button class="btn ghost" onclick="closeModal()">Close</button>
    </div>
  `;
  $("modal").classList.remove("hidden");
}
window.manageTournament = manageTournament;

function closeModal() { $("modal").classList.add("hidden"); }
window.closeModal = closeModal;

async function approveTeam(tid, teamId, action) {
  try {
    await api(`/api/tournaments/${tid}/teams/${teamId}/${action}`, { method: "POST" });
    manageTournament(tid);
  } catch (e) { alert(e.message); }
}
window.approveTeam = approveTeam;

async function addMatch(tid) {
  const name = $("matchName").value.trim();
  const time = $("matchTime").value.trim();
  try {
    await api(`/api/tournaments/${tid}/matches`, {
      method: "POST",
      body: JSON.stringify({ name, time })
    });
    manageTournament(tid);
  } catch (e) { alert(e.message); }
}
window.addMatch = addMatch;

async function updateStatus(tid) {
  const status = $("mtStatus").value;
  try {
    await api(`/api/tournaments/${tid}/status`, {
      method: "POST",
      body: JSON.stringify({ status })
    });
    alert("✅ Status updated to: " + status);
  } catch (e) { alert(e.message); }
}
window.updateStatus = updateStatus;

/* ============ MATCH RESULT FORM ============ */
async function openResultForm(tid, mid) {
  const t = await api(`/api/tournaments/${tid}`);
  const m = t.matches.find(x => x.id === mid);
  const approved = t.teams.filter(x => x.status === "approved");

  if (!approved.length) return alert("Pehle koi team approve karo!");

  $("modalContent").innerHTML = `
    <h3>⚔️ Result — ${esc(m.name)}</h3>
    <p class="notice info">Placement + Kills daalo. Points auto-calculate honge.</p>
    ${approved.map(team => {
      const prev = m.results?.find(r => r.teamId === team.id) || {};
      return `
        <div class="form-row" style="margin-bottom:10px;align-items:end;">
          <div>
            <label>${esc(team.teamName)} — Placement</label>
            <input type="number" class="placeInput" data-team="${team.id}" value="${prev.placement || ""}" placeholder="1-12" min="1" />
          </div>
          <div>
            <label>Kills</label>
            <input type="number" class="killInput" data-team="${team.id}" value="${prev.kills || 0}" placeholder="0" min="0" />
          </div>
        </div>
      `;
    }).join("")}
    <div class="btn-row" style="margin-top:16px;">
      <button class="btn primary" onclick="saveResult('${tid}','${mid}')">💾 Save Result</button>
      <button class="btn ghost" onclick="manageTournament('${tid}')">← Back</button>
      <button class="btn ghost" onclick="closeModal()">Cancel</button>
    </div>
  `;
}
window.openResultForm = openResultForm;

async function saveResult(tid, mid) {
  const results = [];
  document.querySelectorAll(".placeInput").forEach(inp => {
    const place = +inp.value;
    if (!place) return;
    const teamId = inp.dataset.team;
    const kill = +document.querySelector(`.killInput[data-team="${teamId}"]`).value || 0;
    results.push({ teamId, placement: place, kills: kill });
  });

  if (!results.length) return alert("Kam se kam ek team ka placement daalo!");

  try {
    await api(`/api/tournaments/${tid}/matches/${mid}/results`, {
      method: "POST",
      body: JSON.stringify({ results })
    });
    alert("✅ Result saved! Points updated.");
    manageTournament(tid);
  } catch (e) { alert("❌ " + e.message); }
}
window.saveResult = saveResult;

/* ============ MODAL CLOSE ON BG ============ */
$("modal").addEventListener("click", (e) => {
  if (e.target.id === "modal") closeModal();
});

/* ============ UTIL ============ */
function esc(s) {
  return String(s || "").replace(/[&<>"']/g, c => ({
    "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"
  }[c]));
}

/* ============ INIT ============ */
$("tDate").value = new Date().toISOString().slice(0, 10);
loadTournaments();
