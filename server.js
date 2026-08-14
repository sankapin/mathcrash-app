'use strict';
const express = require('express');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const path = require('path');
const { getPool, initSchema } = require('./db');

const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-change-me';
const PORT = process.env.PORT || 3000;

// =====================================================================
// METADATOS DE ESCENARIOS (deben coincidir con public/app.js)
// =====================================================================
const SCENARIOS_META = [
  { id: 'combinadas', levels: [1, 2, 3, 4, 5, 'boss'] },
  { id: 'potencias', levels: [1, 2, 3, 4, 5, 'boss'] },
  { id: 'cartesianos', levels: [1, 2, 3, 4, 5, 'boss'] },
  { id: 'mcm', levels: [1, 2, 3, 4, 5, 'boss'] },
  { id: 'mcd', levels: [1, 2, 3, 4, 5, 'boss'] },
  { id: 'entera', levels: [1, 2, 3, 4, 5, 'boss'] },
  { id: 'raices', levels: [1, 2, 3, 4, 5, 'boss'] },
  { id: 'faltante', levels: [1, 2, 3, 4, 5, 'boss'] },
  { id: 'parciales', levels: [1, 2, 3, 4, 5] },
];
function qCount(level) { return level === 'boss' ? 10 : 6; }
function levelQuestionCount(scenarioId, level) { return scenarioId === 'parciales' ? 8 : qCount(level); }

function uid() { return crypto.randomUUID(); }

const app = express();
app.use(cors());
app.use(express.json({ limit: '2mb' }));

// =====================================================================
// INIT: crear tablas + admin y config por defecto
// =====================================================================
async function ensureDefaults() {
  const p = getPool();
  const { rows } = await p.query('SELECT COUNT(*)::int AS c FROM admin_users');
  if (rows[0].c === 0) {
    const hash = await bcrypt.hash('admin123', 10);
    await p.query('INSERT INTO admin_users (id, username, password, name) VALUES ($1,$2,$3,$4)', [uid(), 'admin', hash, 'Administrador']);
  }
  for (const sc of SCENARIOS_META) {
    for (const lv of sc.levels) {
      const { rows: existing } = await p.query('SELECT 1 FROM config WHERE scenario_id=$1 AND level=$2', [sc.id, String(lv)]);
      if (existing.length === 0) {
        await p.query('INSERT INTO config (scenario_id, level, eff_pct, time_sec) VALUES ($1,$2,$3,$4)', [sc.id, String(lv), 75, levelQuestionCount(sc.id, lv) * 25]);
      }
    }
  }
}

// =====================================================================
// AUTH MIDDLEWARE
// =====================================================================
function requireAdmin(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'No autorizado' });
  try {
    req.admin = jwt.verify(token, JWT_SECRET);
    next();
  } catch (e) {
    return res.status(401).json({ error: 'Sesión inválida o expirada' });
  }
}

// =====================================================================
// RUTAS: AUTH ADMIN
// =====================================================================
app.post('/api/admin/login', async (req, res) => {
  const { username, password } = req.body || {};
  if (!username || !password) return res.status(400).json({ error: 'Faltan datos' });
  const p = getPool();
  const { rows } = await p.query('SELECT * FROM admin_users WHERE username=$1', [username]);
  const user = rows[0];
  if (!user) return res.status(401).json({ error: 'Usuario o contraseña incorrectos' });
  const ok = await bcrypt.compare(password, user.password);
  if (!ok) return res.status(401).json({ error: 'Usuario o contraseña incorrectos' });
  const token = jwt.sign({ id: user.id, username: user.username, name: user.name }, JWT_SECRET, { expiresIn: '30d' });
  res.json({ token, user: { id: user.id, username: user.username, name: user.name } });
});

app.get('/api/admin/users', requireAdmin, async (req, res) => {
  const p = getPool();
  const { rows } = await p.query('SELECT id, username, name FROM admin_users ORDER BY created_at ASC');
  res.json(rows);
});

app.post('/api/admin/users', requireAdmin, async (req, res) => {
  const { name, username, password } = req.body || {};
  if (!name || !username || !password) return res.status(400).json({ error: 'Completa todos los campos' });
  if (password.length < 4) return res.status(400).json({ error: 'La contraseña debe tener al menos 4 caracteres' });
  const p = getPool();
  const { rows: existing } = await p.query('SELECT 1 FROM admin_users WHERE LOWER(username)=LOWER($1)', [username]);
  if (existing.length > 0) return res.status(400).json({ error: 'Ese usuario ya existe' });
  const hash = await bcrypt.hash(password, 10);
  const id = uid();
  await p.query('INSERT INTO admin_users (id, username, password, name) VALUES ($1,$2,$3,$4)', [id, username, hash, name]);
  res.json({ id, username, name });
});

app.delete('/api/admin/users/:id', requireAdmin, async (req, res) => {
  const p = getPool();
  const { rows: admins } = await p.query('SELECT id FROM admin_users');
  if (admins.length <= 1) return res.status(400).json({ error: 'No puedes eliminar el único administrador' });
  const target = admins.find(a => a.id === req.params.id);
  if (!target) return res.status(404).json({ error: 'No encontrado' });
  await p.query('DELETE FROM admin_users WHERE id=$1', [req.params.id]);
  res.json({ ok: true, wasSelf: req.admin.id === req.params.id });
});

// =====================================================================
// RUTAS: JUGADORES
// =====================================================================
app.get('/api/players', async (req, res) => {
  const p = getPool();
  const { rows } = await p.query('SELECT id, name, avatar FROM players WHERE is_test_account=false ORDER BY created_at ASC');
  res.json(rows);
});

app.get('/api/players/all', requireAdmin, async (req, res) => {
  const p = getPool();
  const { rows } = await p.query(`
    SELECT pl.id, pl.name, pl.avatar, pl.is_test_account AS "isTestAccount",
      COALESCE(prog.completed_count, 0)::int AS "completedLevels",
      COALESCE(att.attempts_count, 0)::int AS "attemptsCount"
    FROM players pl
    LEFT JOIN (SELECT player_id, COUNT(*) AS completed_count FROM progress WHERE completed=true GROUP BY player_id) prog ON prog.player_id = pl.id
    LEFT JOIN (SELECT player_id, COUNT(*) AS attempts_count FROM attempts GROUP BY player_id) att ON att.player_id = pl.id
    ORDER BY pl.created_at ASC
  `);
  res.json(rows);
});

app.post('/api/players', async (req, res) => {
  const { name, avatar } = req.body || {};
  if (!name || !avatar) return res.status(400).json({ error: 'Faltan datos' });
  const p = getPool();
  const id = uid();
  await p.query('INSERT INTO players (id, name, avatar, is_test_account) VALUES ($1,$2,$3,false)', [id, name, avatar]);
  res.json({ id, name, avatar });
});

app.delete('/api/players/:id', requireAdmin, async (req, res) => {
  const p = getPool();
  await p.query('DELETE FROM progress WHERE player_id=$1', [req.params.id]);
  await p.query('DELETE FROM attempts WHERE player_id=$1', [req.params.id]);
  await p.query('DELETE FROM players WHERE id=$1', [req.params.id]);
  res.json({ ok: true });
});

app.post('/api/players/test-account', requireAdmin, async (req, res) => {
  const p = getPool();
  const { rows } = await p.query('SELECT id, name, avatar FROM players WHERE is_test_account=true AND owner_admin_id=$1', [req.admin.id]);
  if (rows.length > 0) return res.json(rows[0]);
  const id = uid();
  const name = `${req.admin.name} (Prueba)`;
  const avatar = '🧪';
  await p.query('INSERT INTO players (id, name, avatar, is_test_account, owner_admin_id) VALUES ($1,$2,$3,true,$4)', [id, name, avatar, req.admin.id]);
  res.json({ id, name, avatar });
});

// =====================================================================
// RUTAS: PROGRESO
// =====================================================================
async function loadProgress(playerId) {
  const p = getPool();
  const { rows } = await p.query('SELECT * FROM progress WHERE player_id=$1', [playerId]);
  const out = {};
  for (const r of rows) {
    out[r.scenario_id] = out[r.scenario_id] || {};
    out[r.scenario_id][r.level] = {
      completed: r.completed,
      bestEff: r.best_eff,
      bestTimeSec: r.best_time_sec,
      achievements: { time: r.achievement_time, eff: r.achievement_eff },
      attemptsCount: r.attempts_count,
      recentPrompts: r.recent_prompts || [],
    };
  }
  return out;
}

app.get('/api/progress/:playerId', async (req, res) => {
  res.json(await loadProgress(req.params.playerId));
});

app.post('/api/skip-level', requireAdmin, async (req, res) => {
  const { playerId, scenarioId, level } = req.body || {};
  if (!playerId || !scenarioId || !level) return res.status(400).json({ error: 'Faltan datos' });
  const p = getPool();
  await p.query(`
    INSERT INTO progress (player_id, scenario_id, level, completed)
    VALUES ($1,$2,$3,true)
    ON CONFLICT (player_id, scenario_id, level) DO UPDATE SET completed=true
  `, [playerId, scenarioId, String(level)]);
  res.json({ ok: true });
});

// =====================================================================
// RUTAS: RESULTADO DE NIVEL (fin de partida)
// =====================================================================
app.post('/api/level-result', async (req, res) => {
  const { playerId, playerName, scenarioId, level, records } = req.body || {};
  if (!playerId || !scenarioId || !level || !Array.isArray(records) || records.length === 0) {
    return res.status(400).json({ error: 'Datos incompletos' });
  }
  const p = getPool();
  const total = records.length;
  const correct = records.filter(r => r.isCorrect).length;
  const effPct = Math.round((correct / total) * 100);
  const totalTimeSec = Math.round(records.reduce((a, r) => a + (r.timeMs || 0), 0) / 1000);

  const { rows: cfgRows } = await p.query('SELECT eff_pct, time_sec FROM config WHERE scenario_id=$1 AND level=$2', [scenarioId, String(level)]);
  const cfg = cfgRows[0] ? { effPct: cfgRows[0].eff_pct, timeSec: cfgRows[0].time_sec } : { effPct: 75, timeSec: total * 25 };
  const earnedEff = effPct >= cfg.effPct;
  const earnedTime = totalTimeSec <= cfg.timeSec;

  const { rows: progRows } = await p.query('SELECT * FROM progress WHERE player_id=$1 AND scenario_id=$2 AND level=$3', [playerId, scenarioId, String(level)]);
  const prev = progRows[0];
  const newBestEff = Math.max(prev ? prev.best_eff : 0, effPct);
  const newBestTime = prev && prev.best_time_sec !== null ? Math.min(prev.best_time_sec, totalTimeSec) : totalTimeSec;
  const newAchTime = (prev ? prev.achievement_time : false) || earnedTime;
  const newAchEff = (prev ? prev.achievement_eff : false) || earnedEff;
  const newAttemptsCount = (prev ? prev.attempts_count : 0) + 1;
  const newPrompts = records.map(r => r.prompt).concat(prev ? (prev.recent_prompts || []) : []).slice(0, Math.max(30, total * 4));

  await p.query(`
    INSERT INTO progress (player_id, scenario_id, level, completed, best_eff, best_time_sec, achievement_time, achievement_eff, attempts_count, recent_prompts)
    VALUES ($1,$2,$3,true,$4,$5,$6,$7,$8,$9)
    ON CONFLICT (player_id, scenario_id, level) DO UPDATE SET
      completed=true, best_eff=$4, best_time_sec=$5, achievement_time=$6, achievement_eff=$7, attempts_count=$8, recent_prompts=$9
  `, [playerId, scenarioId, String(level), newBestEff, newBestTime, newAchTime, newAchEff, newAttemptsCount, JSON.stringify(newPrompts)]);

  const now = new Date();
  for (const r of records) {
    await p.query(`
      INSERT INTO attempts (id, player_id, player_name, scenario_id, level, prompt, correct_answer, given_answer, is_correct, attempts, time_ms, ts)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
    `, [uid(), playerId, playerName || '', scenarioId, String(level), r.prompt, String(r.correctAnswer), r.givenAnswer === null || r.givenAnswer === undefined ? null : String(r.givenAnswer), !!r.isCorrect, r.attempts || 1, r.timeMs || 0, now]);
  }

  res.json({ effPct, totalTimeSec, correct, total, earnedEff, earnedTime, cfg });
});

// =====================================================================
// RUTAS: CONFIGURACION
// =====================================================================
app.get('/api/config', async (req, res) => {
  const p = getPool();
  const { rows } = await p.query('SELECT scenario_id, level, eff_pct, time_sec FROM config');
  const out = {};
  for (const r of rows) {
    out[r.scenario_id] = out[r.scenario_id] || {};
    out[r.scenario_id][r.level] = { effPct: r.eff_pct, timeSec: r.time_sec };
  }
  res.json(out);
});

app.put('/api/config', requireAdmin, async (req, res) => {
  const cfg = req.body || {};
  const p = getPool();
  for (const scenarioId of Object.keys(cfg)) {
    for (const level of Object.keys(cfg[scenarioId])) {
      const { effPct, timeSec } = cfg[scenarioId][level];
      const eff = Math.max(0, Math.min(100, Number(effPct) || 0));
      const time = Math.max(1, Number(timeSec) || 1);
      await p.query(`
        INSERT INTO config (scenario_id, level, eff_pct, time_sec) VALUES ($1,$2,$3,$4)
        ON CONFLICT (scenario_id, level) DO UPDATE SET eff_pct=$3, time_sec=$4
      `, [scenarioId, String(level), eff, time]);
    }
  }
  res.json({ ok: true });
});

// =====================================================================
// RUTAS: REPORTES (ADMIN)
// =====================================================================
app.get('/api/summary', requireAdmin, async (req, res) => {
  const p = getPool();
  const { rows: playerRows } = await p.query('SELECT COUNT(*)::int AS c FROM players WHERE is_test_account=false');
  const { rows: totals } = await p.query(`
    SELECT COUNT(*)::int AS total, COALESCE(SUM(CASE WHEN a.is_correct THEN 1 ELSE 0 END),0)::int AS correct, COALESCE(SUM(a.time_ms),0)::bigint AS time_ms
    FROM attempts a JOIN players pl ON pl.id = a.player_id WHERE pl.is_test_account = false
  `);
  const { rows: byScenario } = await p.query(`
    SELECT a.scenario_id, COUNT(*)::int AS total, COALESCE(SUM(CASE WHEN a.is_correct THEN 1 ELSE 0 END),0)::int AS correct
    FROM attempts a JOIN players pl ON pl.id = a.player_id WHERE pl.is_test_account = false
    GROUP BY a.scenario_id
  `);
  res.json({
    totalPlayers: playerRows[0].c,
    totalAttempts: totals[0].total,
    totalCorrect: totals[0].correct,
    totalTimeMs: Number(totals[0].time_ms),
    byScenario: byScenario.map(r => ({ scenarioId: r.scenario_id, total: r.total, correct: r.correct })),
  });
});

app.get('/api/players/:id/summary', requireAdmin, async (req, res) => {
  const p = getPool();
  const { rows: totals } = await p.query(`
    SELECT COUNT(*)::int AS total, COALESCE(SUM(CASE WHEN is_correct THEN 1 ELSE 0 END),0)::int AS correct, COALESCE(SUM(time_ms),0)::bigint AS time_ms
    FROM attempts WHERE player_id=$1
  `, [req.params.id]);
  const { rows: byScenario } = await p.query(`
    SELECT scenario_id, COUNT(*)::int AS total, COALESCE(SUM(CASE WHEN is_correct THEN 1 ELSE 0 END),0)::int AS correct
    FROM attempts WHERE player_id=$1 GROUP BY scenario_id
  `, [req.params.id]);
  res.json({
    totalAttempts: totals[0].total,
    totalCorrect: totals[0].correct,
    totalTimeMs: Number(totals[0].time_ms),
    byScenario: byScenario.map(r => ({ scenarioId: r.scenario_id, total: r.total, correct: r.correct })),
  });
});

app.get('/api/report', requireAdmin, async (req, res) => {
  const { player, scenario, level } = req.query;
  const p = getPool();
  const clauses = ['pl.is_test_account = false'];
  const params = [];
  if (player && player !== 'all') { params.push(player); clauses.push(`a.player_id = $${params.length}`); }
  if (scenario && scenario !== 'all') { params.push(scenario); clauses.push(`a.scenario_id = $${params.length}`); }
  if (level && level !== 'all') { params.push(String(level)); clauses.push(`a.level = $${params.length}`); }
  const where = clauses.length ? 'WHERE ' + clauses.join(' AND ') : '';
  const { rows } = await p.query(`
    SELECT a.id, a.player_id AS "playerId", a.player_name AS "playerName", a.scenario_id AS "scenarioId", a.level, a.prompt,
           a.correct_answer AS "correctAnswer", a.given_answer AS "givenAnswer", a.is_correct AS "isCorrect", a.attempts, a.time_ms AS "timeMs", a.ts AS "timestamp"
    FROM attempts a JOIN players pl ON pl.id = a.player_id
    ${where}
    ORDER BY a.ts DESC
    LIMIT 300
  `, params);
  res.json(rows);
});

app.get('/api/export', requireAdmin, async (req, res) => {
  const p = getPool();
  const [users, players, progress, config, attempts] = await Promise.all([
    p.query('SELECT id, username, name FROM admin_users'),
    p.query('SELECT * FROM players'),
    p.query('SELECT * FROM progress'),
    p.query('SELECT * FROM config'),
    p.query('SELECT * FROM attempts'),
  ]);
  res.json({
    exportedAt: new Date().toISOString(),
    users: users.rows, players: players.rows, progress: progress.rows, config: config.rows, attempts: attempts.rows,
  });
});

// =====================================================================
// SALUD + ESTATICOS
// =====================================================================
app.get('/api/health', (req, res) => res.json({ ok: true }));
app.use(express.static(path.join(__dirname, 'public')));
app.use((req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));

// =====================================================================
// ARRANQUE
// =====================================================================
async function start() {
  await initSchema();
  await ensureDefaults();
  app.listen(PORT, () => console.log(`Math Crash server escuchando en puerto ${PORT}`));
}

if (require.main === module) {
  start().catch(err => { console.error('Error al iniciar el servidor:', err); process.exit(1); });
}

module.exports = { app, start };
