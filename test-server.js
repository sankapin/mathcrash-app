'use strict';
process.env.TEST_MODE = '1';
process.env.JWT_SECRET = 'test-secret';
const PORT = 3999;
process.env.PORT = String(PORT);
const { start } = require('./server');
const BASE = `http://localhost:${PORT}`;

let failures = 0;
function assert(cond, msg) { if (!cond) { failures++; console.error('FALLO:', msg); } else console.log('OK:', msg); }

async function j(method, url, body, token) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(BASE + url, { method, headers, body: body ? JSON.stringify(body) : undefined });
  let data = null;
  try { data = await res.json(); } catch (e) { /* sin cuerpo */ }
  return { status: res.status, data };
}

async function main() {
  await start();
  await new Promise(r => setTimeout(r, 300));

  // ===== Salud =====
  let r = await j('GET', '/api/health');
  assert(r.status === 200 && r.data.ok === true, 'health check responde ok');

  // ===== Login admin por defecto =====
  r = await j('POST', '/api/admin/login', { username: 'admin', password: 'admin123' });
  assert(r.status === 200 && r.data.token, 'login admin por defecto funciona');
  const adminToken = r.data.token;

  r = await j('POST', '/api/admin/login', { username: 'admin', password: 'mala' });
  assert(r.status === 401, 'login con contraseña incorrecta rechazado');

  // ===== Endpoints protegidos sin token =====
  r = await j('GET', '/api/admin/users');
  assert(r.status === 401, 'endpoint admin protegido rechaza sin token');

  // ===== Crear jugador =====
  r = await j('POST', '/api/players', { name: 'Mateo', avatar: '🦖' });
  assert(r.status === 200 && r.data.id, 'se crea un jugador');
  const playerId = r.data.id;

  r = await j('GET', '/api/players');
  assert(r.status === 200 && r.data.some(p => p.id === playerId), 'el jugador aparece en la lista publica');

  // ===== Progreso inicial vacio =====
  r = await j('GET', `/api/progress/${playerId}`);
  assert(r.status === 200 && Object.keys(r.data).length === 0, 'progreso inicial vacio');

  // ===== Config por defecto =====
  r = await j('GET', '/api/config');
  assert(r.status === 200 && r.data.combinadas && r.data.combinadas['1'].effPct === 75, 'config por defecto de combinadas nivel1 es 75%');
  assert(r.data.parciales && r.data.parciales['1'].timeSec === 18 * 25, 'config por defecto de parciales usa 18 ejercicios (2 por cada uno de los 9 temas)');
  assert(!r.data.parciales['boss'], 'parciales no tiene config de nivel boss');
  assert(r.data.primos && r.data.primos['1'].effPct === 75, 'config por defecto de primos existe (nivel 1 al 75%)');
  assert(r.data.primos['boss'], 'primos tiene config de nivel boss');
  assert(r.data.repaso && r.data.repaso['1'].timeSec === 20 * 25, 'config por defecto de repaso usa 20 ejercicios (4 por cada uno de los 5 temas de la prueba)');
  assert(!r.data.repaso['boss'], 'repaso no tiene config de nivel boss');

  // ===== Enviar resultado de nivel: 100% correcto, rapido =====
  const records1 = Array.from({ length: 6 }, (_, i) => ({ prompt: `p${i}`, correctAnswer: 5, givenAnswer: 5, isCorrect: true, attempts: 1, timeMs: 1000 }));
  r = await j('POST', '/api/level-result', { playerId, playerName: 'Mateo', scenarioId: 'combinadas', level: 1, records: records1 });
  assert(r.status === 200, 'nivel-result responde 200');
  assert(r.data.effPct === 100, 'effPct calculado correctamente (100%)');
  assert(r.data.earnedEff === true && r.data.earnedTime === true, 'ambos logros ganados con buen desempeño');

  r = await j('GET', `/api/progress/${playerId}`);
  assert(r.data.combinadas['1'].completed === true, 'progreso refleja nivel completado');
  assert(r.data.combinadas['1'].achievements.eff === true, 'logro de efectividad guardado');
  assert(r.data.combinadas['1'].recentPrompts.length === 6, 'recentPrompts guardado (6 prompts)');

  // ===== Nivel 2 con bajo desempeño =====
  const records2 = Array.from({ length: 6 }, (_, i) => ({ prompt: `q${i}`, correctAnswer: 5, givenAnswer: i < 1 ? 5 : 2, isCorrect: i < 1, attempts: 2, timeMs: 40000 }));
  r = await j('POST', '/api/level-result', { playerId, playerName: 'Mateo', scenarioId: 'combinadas', level: 2, records: records2 });
  assert(r.data.earnedEff === false && r.data.earnedTime === false, 'bajo desempeño no gana logros');

  // ===== Reintentar nivel 2 con mejor desempeño: bestEff debe quedar con el maximo =====
  r = await j('POST', '/api/level-result', { playerId, playerName: 'Mateo', scenarioId: 'combinadas', level: 2, records: records1 });
  r = await j('GET', `/api/progress/${playerId}`);
  assert(r.data.combinadas['2'].bestEff === 100, 'bestEff guarda el mejor resultado entre intentos (100)');

  // ===== Reporte y resumen requieren admin =====
  r = await j('GET', '/api/report?player=all&scenario=all&level=all', null, adminToken);
  assert(r.status === 200 && Array.isArray(r.data) && r.data.length >= 12, 'reporte devuelve los intentos guardados (>=12)');

  r = await j('GET', '/api/summary', null, adminToken);
  assert(r.status === 200 && r.data.totalPlayers === 1, 'resumen cuenta 1 jugador real');
  assert(r.data.totalAttempts >= 12, 'resumen cuenta los intentos totales');

  r = await j(`GET`, `/api/players/${playerId}/summary`, null, adminToken);
  assert(r.status === 200 && r.data.totalAttempts >= 12, 'resumen individual del jugador correcto');

  // ===== Cuenta de prueba (modo admin) queda excluida del resumen =====
  r = await j('POST', '/api/players/test-account', null, adminToken);
  const testPlayerId = r.data.id;
  assert(!!testPlayerId, 'se crea/obtiene la cuenta de prueba del admin');
  r = await j('POST', '/api/players/test-account', null, adminToken);
  assert(r.data.id === testPlayerId, 'la cuenta de prueba es idempotente (no se duplica)');

  const recordsTest = Array.from({ length: 6 }, (_, i) => ({ prompt: `t${i}`, correctAnswer: 5, givenAnswer: 5, isCorrect: true, attempts: 1, timeMs: 500 }));
  await j('POST', '/api/level-result', { playerId: testPlayerId, playerName: 'Admin (Prueba)', scenarioId: 'mcd', level: 1, records: recordsTest });
  r = await j('GET', '/api/summary', null, adminToken);
  assert(r.data.totalPlayers === 1, 'la cuenta de prueba NO se cuenta en jugadores reales');
  r = await j('GET', '/api/players');
  assert(!r.data.some(p => p.id === testPlayerId), 'la cuenta de prueba no aparece en la lista publica de jugadores');

  // ===== Skip level (solo admin) =====
  r = await j('POST', '/api/skip-level', { playerId: testPlayerId, scenarioId: 'mcd', level: 2 }, adminToken);
  assert(r.status === 200, 'skip-level funciona con token admin');
  r = await j('POST', '/api/skip-level', { playerId: testPlayerId, scenarioId: 'mcd', level: 2 });
  assert(r.status === 401, 'skip-level rechaza sin token admin');

  // ===== Medallas por completar un tema al 100% =====
  r = await j('GET', `/api/medals/${playerId}`);
  assert(r.status === 200 && Object.keys(r.data).length === 0, 'sin medallas al principio');

  const recsOk = Array.from({ length: 6 }, (_, i) => ({ prompt: `mcd${i}`, correctAnswer: 5, givenAnswer: 5, isCorrect: true, attempts: 1, timeMs: 1000 }));
  for (const lv of [1, 2, 3, 4, 5]) {
    r = await j('POST', '/api/level-result', { playerId, playerName: 'Mateo', scenarioId: 'mcd', level: lv, records: recsOk });
    assert(r.data.earnedMedal === false, `nivel ${lv} de mcd todavia no completa el tema, no hay medalla`);
  }
  const recsBoss = Array.from({ length: 10 }, (_, i) => ({ prompt: `mcdboss${i}`, correctAnswer: 5, givenAnswer: 5, isCorrect: true, attempts: 1, timeMs: 1000 }));
  r = await j('POST', '/api/level-result', { playerId, playerName: 'Mateo', scenarioId: 'mcd', level: 'boss', records: recsBoss });
  assert(r.data.earnedMedal === true && r.data.medalCount === 1, 'al completar el boss se completa el tema al 100% y se gana la primera medalla');

  r = await j('POST', '/api/level-result', { playerId, playerName: 'Mateo', scenarioId: 'mcd', level: 'boss', records: recsBoss });
  assert(r.data.earnedMedal === false, 'reintentar el boss ya completado no otorga otra medalla');

  r = await j('GET', `/api/medals/${playerId}`);
  assert(r.data.mcd === 1, 'el endpoint de medallas refleja 1 medalla en mcd');

  // ===== Empezar de 0 (reset de escenario) =====
  r = await j('POST', '/api/reset-scenario', { playerId, scenarioId: 'combinadas' });
  assert(r.status === 400, 'no se puede reiniciar un tema que no esta 100% completo');

  r = await j('POST', '/api/reset-scenario', { playerId, scenarioId: 'mcd' });
  assert(r.status === 200, 'se puede reiniciar mcd porque esta 100% completo');
  r = await j('GET', `/api/progress/${playerId}`);
  assert(!r.data.mcd || Object.keys(r.data.mcd).length === 0, 'el progreso de mcd se borro tras el reinicio');
  r = await j('GET', `/api/medals/${playerId}`);
  assert(r.data.mcd === 1, 'la medalla de mcd se conserva despues del reinicio');

  // completar mcd de nuevo tras el reinicio debe otorgar una segunda medalla
  for (const lv of [1, 2, 3, 4, 5]) {
    await j('POST', '/api/level-result', { playerId, playerName: 'Mateo', scenarioId: 'mcd', level: lv, records: recsOk });
  }
  r = await j('POST', '/api/level-result', { playerId, playerName: 'Mateo', scenarioId: 'mcd', level: 'boss', records: recsBoss });
  assert(r.data.earnedMedal === true && r.data.medalCount === 2, 'completar el tema una segunda vez tras el reinicio otorga la segunda medalla');

  // ===== Config: guardar y verificar =====
  r = await j('PUT', '/api/config', { combinadas: { '1': { effPct: 90, timeSec: 50 } } }, adminToken);
  assert(r.status === 200, 'guardar config responde ok');
  r = await j('GET', '/api/config');
  assert(r.data.combinadas['1'].effPct === 90 && r.data.combinadas['1'].timeSec === 50, 'config actualizada persiste');

  r = await j('PUT', '/api/config', { combinadas: { '1': { effPct: 90, timeSec: 50 } } });
  assert(r.status === 401, 'guardar config rechaza sin token admin');

  // ===== Gestion de administradores =====
  r = await j('GET', '/api/admin/users', null, adminToken);
  assert(r.status === 200 && r.data.length === 1, 'hay 1 admin inicialmente');

  r = await j('POST', '/api/admin/users', { name: 'Mamá', username: 'mama', password: '1234' }, adminToken);
  assert(r.status === 200, 'se crea un segundo admin');
  const mamaId = r.data.id;

  r = await j('POST', '/api/admin/users', { name: 'Otra', username: 'mama', password: '5678' }, adminToken);
  assert(r.status === 400, 'no se permite username duplicado');

  r = await j('POST', '/api/admin/login', { username: 'mama', password: '1234' });
  assert(r.status === 200 && r.data.token, 'el nuevo admin puede loguearse');

  r = await j('DELETE', `/api/admin/users/${mamaId}`, null, adminToken);
  assert(r.status === 200, 'se elimina el segundo admin');

  r = await j('GET', '/api/admin/users', null, adminToken);
  const onlyAdminId = r.data[0].id;
  r = await j('DELETE', `/api/admin/users/${onlyAdminId}`, null, adminToken);
  assert(r.status === 400, 'no se puede eliminar el unico admin restante');

  // ===== Eliminar jugador =====
  r = await j('POST', '/api/players', { name: 'Borrame', avatar: '🐸' });
  const toDelete = r.data.id;
  r = await j('DELETE', `/api/players/${toDelete}`, null, adminToken);
  assert(r.status === 200, 'eliminar jugador responde ok');
  r = await j('GET', '/api/players');
  assert(!r.data.some(p => p.id === toDelete), 'el jugador eliminado ya no aparece');

  // ===== Reporte filtrado por jugador especifico no mezcla datos =====
  r = await j('POST', '/api/players', { name: 'Sofia', avatar: '🐸' });
  const sofiaId = r.data.id;
  const recSofia = [{ prompt: 'sofia-q', correctAnswer: 1, givenAnswer: 2, isCorrect: false, attempts: 3, timeMs: 9000 }];
  await j('POST', '/api/level-result', { playerId: sofiaId, playerName: 'Sofia', scenarioId: 'mcm', level: 1, records: recSofia });
  r = await j('GET', `/api/report?player=${playerId}&scenario=all&level=all`, null, adminToken);
  assert(!r.data.some(a => a.playerId === sofiaId), 'el reporte filtrado por Mateo no incluye intentos de Sofia');

  console.log('\n=== RESULTADO BACKEND: ' + (failures === 0 ? 'TODAS LAS PRUEBAS PASARON' : failures + ' FALLO(S)') + ' ===');
  process.exit(failures === 0 ? 0 : 1);
}

main().catch(e => { console.error('ERROR FATAL EN TEST:', e); process.exit(1); });
