'use strict';
const { Pool } = require('pg');

let pool;

function getPool() {
  if (pool) return pool;
  if (process.env.TEST_MODE === '1') {
    // Modo de prueba local: usa pg-mem (Postgres en memoria) en vez de una BD real.
    const { newDb } = require('pg-mem');
    const db = newDb({ autoCreateForeignKeyIndices: true });
    db.public.registerFunction({
      name: 'gen_random_uuid',
      returns: 'uuid',
      implementation: () => require('crypto').randomUUID(),
    });
    const adapter = db.adapters.createPg();
    pool = new adapter.Pool();
  } else {
    pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: process.env.PGSSL === '0' ? false : { rejectUnauthorized: false },
    });
  }
  return pool;
}

async function initSchema() {
  const p = getPool();
  await p.query(`
    CREATE TABLE IF NOT EXISTS admin_users (
      id TEXT PRIMARY KEY,
      username TEXT UNIQUE NOT NULL,
      password TEXT NOT NULL,
      name TEXT NOT NULL,
      created_at TIMESTAMPTZ DEFAULT now()
    );
    CREATE TABLE IF NOT EXISTS players (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      avatar TEXT NOT NULL,
      is_test_account BOOLEAN DEFAULT false,
      owner_admin_id TEXT,
      created_at TIMESTAMPTZ DEFAULT now()
    );
    CREATE TABLE IF NOT EXISTS progress (
      player_id TEXT NOT NULL,
      scenario_id TEXT NOT NULL,
      level TEXT NOT NULL,
      completed BOOLEAN DEFAULT false,
      best_eff INT DEFAULT 0,
      best_time_sec INT,
      achievement_time BOOLEAN DEFAULT false,
      achievement_eff BOOLEAN DEFAULT false,
      attempts_count INT DEFAULT 0,
      recent_prompts JSONB DEFAULT '[]',
      PRIMARY KEY (player_id, scenario_id, level)
    );
    CREATE TABLE IF NOT EXISTS config (
      scenario_id TEXT NOT NULL,
      level TEXT NOT NULL,
      eff_pct INT NOT NULL,
      time_sec INT NOT NULL,
      PRIMARY KEY (scenario_id, level)
    );
    CREATE TABLE IF NOT EXISTS attempts (
      id TEXT PRIMARY KEY,
      player_id TEXT NOT NULL,
      player_name TEXT NOT NULL,
      scenario_id TEXT NOT NULL,
      level TEXT NOT NULL,
      prompt TEXT NOT NULL,
      correct_answer TEXT NOT NULL,
      given_answer TEXT,
      is_correct BOOLEAN NOT NULL,
      attempts INT NOT NULL,
      time_ms INT NOT NULL,
      ts TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    CREATE INDEX IF NOT EXISTS idx_attempts_player ON attempts(player_id);
    CREATE INDEX IF NOT EXISTS idx_attempts_scenario ON attempts(scenario_id);
  `);
}

module.exports = { getPool, initSchema };
