const express = require("express");
const cors = require("cors");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const app = express();
const PORT = process.env.PORT || 3000;
const ADMIN_KEY = process.env.ADMIN_KEY || "nexora123";
const DATA_FILE = path.join(__dirname, "data.json");

app.use(cors());
app.use(express.json());
app.use(express.static("public"));

/* ============ STORAGE ============ */
function load() {
  if (!fs.existsSync(DATA_FILE)) return { tournaments: [] };
  try { return JSON.parse(fs.readFileSync(DATA_FILE, "utf8")); }
  catch { return { tournaments: [] }; }
}
function save(d) {
  fs.writeFileSync(DATA_FILE, JSON.stringify(d, null, 2));
}
const uid = () => crypto.randomBytes(6).toString("hex");

function adminOnly(req, res, next) {
  if (req.headers["x-admin-key"] !== ADMIN_KEY)
    return res.status(401).json({ error: "Unauthorized — admin key galat hai" });
  next();
}

/* ============ LIST ============ */
app.get("/api/tournaments", (req, res) => {
  const d = load();
  res.json(d.tournaments.map(t => ({
    id: t.id, name: t.name, game: t.game, date: t.date,
    slots: t.slots,
    registered: t.teams.filter(x => x.status === "approved").length,
    pending: t.teams.filter(x => x.status === "pending").length,
    prize: t.prize, entry: t.entry, status: t.status
  })));
});

/* ============ GET ONE ============ */
app.get("/api/tournaments/:id", (req, res) => {
  const d = load();
  const t = d.tournaments.find(x => x.id === req.params.id);
  if (!t) return res.status(404).json({ error: "Tournament not found" });
  res.json(t);
});

/* ============ CREATE ============ */
app.post("/api/tournaments", adminOnly, (req, res) => {
  const { name, game, date, slots, prize, entry, rules } = req.body;
  if (!name) return res.status(400).json({ error: "Tournament name required" });

  const d = load();
  const t = {
    id: uid(),
    name,
    game: game || "Free Fire",
    date: date || new Date().toISOString().slice(0, 10),
    slots: +slots || 12,
    prize: prize || "TBA",
    entry: entry || "Free",
    rules: rules || "",
    status: "open",
    teams: [],
    matches: [],
    createdAt: Date.now()
  };
  d.tournaments.push(t);
  save(d);
  res.json({ ok: true, tournament: t });
});

/* ============ DELETE ============ */
app.delete("/api/tournaments/:id", adminOnly, (req, res) => {
  const d = load();
  d.tournaments = d.tournaments.filter(t => t.id !== req.params.id);
  save(d);
  res.json({ ok: true });
});

/* ============ TEAM REGISTER ============ */
app.post("/api/tournaments/:id/register", (req, res) => {
  const { teamName, captain, players, contact } = req.body;
  if (!teamName || !captain)
    return res.status(400).json({ error: "Team name aur captain required" });

  const d = load();
  const t = d.tournaments.find(x => x.id === req.params.id);
  if (!t) return res.status(404).json({ error: "Tournament not found" });
  if (t.status !== "open") return res.status(400).json({ error: "Registration closed" });

  const approvedCount = t.teams.filter(x => x.status === "approved").length;
  if (approvedCount >= t.slots) return res.status(400).json({ error: "Slots full" });

  if (t.teams.find(x => x.teamName.toLowerCase() === teamName.toLowerCase()))
    return res.status(400).json({ error: "Ye team name already registered hai" });

  const team = {
    id: uid(),
    teamName,
    captain,
    players: Array.isArray(players) ? players.filter(Boolean).slice(0, 6) : [],
    contact: contact || "",
    status: "pending",
    points: 0, kills: 0, matches: 0, wins: 0,
    registeredAt: Date.now()
  };
  t.teams.push(team);
  save(d);
  res.json({ ok: true, team });
});

/* ============ APPROVE / REJECT ============ */
app.post("/api/tournaments/:id/teams/:tid/:action", adminOnly, (req, res) => {
  const { id, tid, action } = req.params;
  if (!["approve", "reject"].includes(action))
    return res.status(400).json({ error: "Invalid action" });

  const d = load();
  const t = d.tournaments.find(x => x.id === id);
  if (!t) return res.status(404).json({ error: "Tournament not found" });
  const team = t.teams.find(x => x.id === tid);
  if (!team) return res.status(404).json({ error: "Team not found" });

  team.status = action === "approve" ? "approved" : "rejected";
  save(d);
  res.json({ ok: true, team });
});

/* ============ ADD MATCH ============ */
app.post("/api/tournaments/:id/matches", adminOnly, (req, res) => {
  const { name, time, teams } = req.body;
  const d = load();
  const t = d.tournaments.find(x => x.id === req.params.id);
  if (!t) return res.status(404).json({ error: "Tournament not found" });

  const m = {
    id: uid(),
    name: name || `Match ${t.matches.length + 1}`,
    time: time || "",
    teams: teams || [],
    results: [],
    status: "scheduled",
    createdAt: Date.now()
  };
  t.matches.push(m);
  save(d);
  res.json({ ok: true, match: m });
});

/* ============ SUBMIT MATCH RESULT ============ */
app.post("/api/tournaments/:id/matches/:mid/results", adminOnly, (req, res) => {
  const { results } = req.body;
  if (!Array.isArray(results))
    return res.status(400).json({ error: "results array required" });

  const d = load();
  const t = d.tournaments.find(x => x.id === req.params.id);
  if (!t) return res.status(404).json({ error: "Tournament not found" });
  const m = t.matches.find(x => x.id === req.params.mid);
  if (!m) return res.status(404).json({ error: "Match not found" });

  // Rollback previous results
  m.results.forEach(old => {
    const team = t.teams.find(x => x.id === old.teamId);
    if (!team) return;
    team.matches = Math.max(0, (team.matches || 0) - 1);
    team.kills = Math.max(0, (team.kills || 0) - (+old.kills || 0));
    team.points = Math.max(0, (team.points || 0) - (pointsFor(+old.placement) + (+old.kills || 0)));
    if (+old.placement === 1) team.wins = Math.max(0, (team.wins || 0) - 1);
  });

  m.results = results;
  m.status = "completed";

  results.forEach(r => {
    const team = t.teams.find(x => x.id === r.teamId);
    if (!team) return;
    team.matches = (team.matches || 0) + 1;
    team.kills = (team.kills || 0) + (+r.kills || 0);
    team.points = (team.points || 0) + pointsFor(+r.placement) + (+r.kills || 0);
    if (+r.placement === 1) team.wins = (team.wins || 0) + 1;
  });

  save(d);
  res.json({ ok: true, match: m });
});

function pointsFor(p) {
  const table = { 1: 12, 2: 9, 3: 8, 4: 7, 5: 6, 6: 5, 7: 4, 8: 3, 9: 2, 10: 1 };
  return table[p] || 0;
}

/* ============ UPDATE STATUS ============ */
app.post("/api/tournaments/:id/status", adminOnly, (req, res) => {
  const { status } = req.body;
  if (!["open", "closed", "live", "ended"].includes(status))
    return res.status(400).json({ error: "Invalid status" });

  const d = load();
  const t = d.tournaments.find(x => x.id === req.params.id);
  if (!t) return res.status(404).json({ error: "Tournament not found" });
  t.status = status;
  save(d);
  res.json({ ok: true, status });
});

/* ============ FALLBACK ============ */
app.get("/", (req, res) => res.sendFile(path.join(__dirname, "public", "index.html")));
app.use((req, res) => res.status(404).json({ error: "not found" }));

app.listen(PORT, () => {
  console.log("╔═══════════════════════════════════════╗");
  console.log("║   🏆 NEXORA TOURNAMENT PANEL          ║");
  console.log("╚═══════════════════════════════════════╝");
  console.log(`  🌐  http://localhost:${PORT}`);
  console.log(`  🔑  Admin Key: ${ADMIN_KEY}`);
  console.log("");
});
