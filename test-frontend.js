'use strict';
process.env.TEST_MODE = '1';
process.env.JWT_SECRET = 'test-secret';
const PORT = 4001;
process.env.PORT = String(PORT);
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { start } = require('./server');

const BASE = `http://localhost:${PORT}`;
let failures = 0;
function assert(cond, msg) {
  const line = (cond ? 'OK: ' : 'FALLO: ') + msg + '\n';
  fs.writeSync(2, line); // escritura sincronica sin buffer
  if (!cond) failures++;
}
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function main() {
  await start();
  await sleep(300);

  // ===== Stub minimo de DOM (misma tecnica usada antes para MathCrash.html) =====
  const elements = {};
  function makeEl(id) {
    return { id, _value: '', get value() { return this._value; }, set value(v) { this._value = v; },
      textContent: '', style: {}, disabled: false, innerHTML: '', appendChild() {}, removeChild() {}, click() {} };
  }
  const appDiv = { innerHTML: '' };
  const documentStub = {
    getElementById(id) { if (id === 'app') return appDiv; if (!elements[id]) elements[id] = makeEl(id); return elements[id]; },
    createElement(tag) { return makeEl('created-' + tag); },
    body: { appendChild() {}, removeChild() {} },
  };
  const localStorageStub = (() => {
    const store = {};
    return { getItem: k => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); }, removeItem: k => { delete store[k]; } };
  })();
  const fetchStub = (input, opts) => {
    const url = typeof input === 'string' && input.startsWith('/') ? BASE + input : input;
    return fetch(url, opts);
  };
  const sandbox = {
    document: documentStub,
    localStorage: localStorageStub,
    fetch: fetchStub,
    confirm: () => true,
    console,
    setTimeout, clearTimeout,
    URL: { createObjectURL: () => 'blob://x', revokeObjectURL: () => {} },
    Blob: function Blob() {},
    URLSearchParams,
  };
  const ctx = vm.createContext(sandbox);
  const code = fs.readFileSync(path.join(__dirname, 'public', 'app.js'), 'utf8');
  vm.runInContext(code, ctx, { filename: 'app.js' });
  await sleep(50);
  ctx.showToast = (msg) => fs.writeSync(2, 'DEBUG TOAST: ' + msg + '\n'); // revela errores silenciados normalmente en un toast visual

  const html = () => appDiv.innerHTML;
  const getApp = () => ctx.__mcGetApp();
  const setVal = (id, v) => { documentStub.getElementById(id).value = v; };

  // ===== Pantalla inicial =====
  assert(html().includes('MATH CRASH') && html().includes('Soy Jugador') && html().includes('Soy Administrador'), 'pantalla inicial de seleccion de rol se renderiza');

  // ===== Login admin incorrecto =====
  await ctx.onSelectRole('admin');
  assert(html().includes('Acceso Admin'), 'formulario de login admin visible');
  setVal('admUser', 'admin'); setVal('admPass', 'mal');
  await ctx.onAdminLogin();
  await sleep(30);
  assert(html().includes('Acceso Admin') && html().toLowerCase().includes('incorrect'), 'login admin con clave incorrecta muestra error y no avanza');

  // ===== Login admin correcto =====
  setVal('admUser', 'admin'); setVal('admPass', 'admin123');
  await ctx.onAdminLogin();
  await sleep(50);
  assert(html().includes('Panel de Administración'), 'login admin correcto entra al panel');
  assert(html().includes('Modo Prueba'), 'tab resumen muestra tarjeta de modo prueba tras cargar datos async');
  assert(getApp().currentUser && getApp().currentUser.username === 'admin', 'app.currentUser guarda el usuario admin');
  assert(!!getApp().cache.summary, 'resumen quedo cacheado tras la carga async');

  // ===== Tabs de admin cargan datos sin errores =====
  for (const tab of ['jugadores', 'reporte', 'config', 'usuarios']) {
    await ctx.switchAdminTab(tab);
    await sleep(50);
    assert(getApp().adminTab === tab, `tab ${tab} activo tras el cambio`);
    if (tab === 'config') assert(html().includes('Efectividad %') && html().includes('eff_combinadas_1'), 'tab config muestra inputs de configuracion');
  }
  assert(html().includes('Cuentas de administrador'), 'tab usuarios muestra las cuentas admin');

  // ===== Crear jugador desde el admin =====
  await ctx.switchAdminTab('jugadores');
  await sleep(30);
  assert(html().includes('+ Crear jugador'), 'boton crear jugador visible en tab jugadores');
  getApp().postCreateReturnToAdmin = true;
  getApp().view = 'playerCreate';
  ctx.render();
  await sleep(20);
  assert(html().includes('Crear jugador'), 'formulario de creacion de jugador visible');
  setVal('newPlayerName', 'Mateo');
  await ctx.onCreatePlayer();
  await sleep(50);
  assert(getApp().view === 'admin' && getApp().adminTab === 'jugadores', 'tras crear jugador vuelve al tab jugadores del admin');
  assert(html().includes('Mateo'), 'el jugador recien creado aparece en la tabla de jugadores');

  // ===== Ver detalle individual del jugador =====
  const playersAll = getApp().cache.playersAll;
  const mateo = playersAll.find(p => p.name === 'Mateo');
  assert(!!mateo, 'Mateo aparece en playersAll');
  await ctx.openPlayerDetail(mateo.id);
  await sleep(50);
  assert(html().includes('Mateo') && html().includes('Efectividad por escenario'), 'vista de detalle individual del jugador se renderiza');
  getApp().adminPlayerDetail = null;
  ctx.render();

  // ===== Configuracion: editar y guardar =====
  await ctx.switchAdminTab('config');
  await sleep(50);
  setVal('eff_combinadas_1', '60');
  setVal('time_combinadas_1', '999');
  await ctx.onSaveConfig();
  await sleep(50);
  assert(getApp().cache.config.combinadas['1'].effPct === 60, 'config guardada refleja el nuevo valor de efectividad');

  // ===== Cerrar sesion admin =====
  ctx.onLogout();
  await sleep(20);
  assert(getApp().view === 'role' && getApp().currentUser === null, 'logout vuelve a la pantalla de rol y limpia el usuario');

  // ===== Flujo jugador: seleccionar, jugar un nivel completo, ver resultados =====
  await ctx.onSelectRole('player');
  await sleep(50);
  assert(html().includes('Mateo'), 'jugador Mateo aparece en la seleccion de jugadores');
  const players = getApp().cache.players;
  const mateoId = players.find(p => p.name === 'Mateo').id;
  await ctx.onSelectPlayer(mateoId);
  await sleep(50);
  assert(getApp().view === 'worldMap', 'tras elegir jugador entra al mapa de escenarios');
  assert(html().includes('Operaciones Combinadas'), 'mapa muestra los escenarios');

  ctx.enterScenarioPath('combinadas');
  await sleep(20);
  assert(getApp().view === 'scenarioPath', 'entra al camino de niveles del escenario');
  ctx.onStartLevel(1);
  await sleep(20);
  assert(getApp().view === 'levelPlay', 'inicia el nivel 1 y entra a la vista de juego');

  let guard = 0;
  while (getApp().view === 'levelPlay' && guard < 20) {
    const s = getApp().session;
    const q = s.questions[s.idx];
    if (q.type === 'numeric') { setVal('numAnswer', String(q.answer)); ctx.onSubmitAnswer(); }
    else ctx.onSubmitAnswer(q.correctIndex);
    assert(s.feedback && s.feedback.status === 'correct', `pregunta ${s.idx + 1} respondida correctamente al primer intento`);
    await ctx.onNextQuestion();
    await sleep(30);
    guard++;
  }
  assert(getApp().view === 'levelResults', 'tras responder todas las preguntas se muestra la vista de resultados');
  assert(getApp().lastResult && getApp().lastResult.effPct === 100, 'resultado del nivel calcula 100% de efectividad');
  assert(html().includes('Nivel perfecto') || html().includes('completado'), 'la vista de resultados muestra un mensaje de exito');

  getApp().view = 'scenarioPath';
  ctx.render();
  await sleep(20);
  assert(html().includes('⏱️') || html().includes('🎯'), 'el nodo del nivel 1 muestra al menos un logro ganado');

  // ===== Respuesta incorrecta: no revela la respuesta, permite reintentar =====
  ctx.onStartLevel(2);
  await sleep(20);
  const s2 = getApp().session;
  const q2 = s2.questions[0];
  if (q2.type === 'numeric') { setVal('numAnswer', String(q2.answer + 999999)); ctx.onSubmitAnswer(); }
  else { const wrongIdx = q2.correctIndex === 0 ? 1 : 0; ctx.onSubmitAnswer(wrongIdx); }
  assert(s2.feedback.status === 'wrong', 'una respuesta incorrecta marca feedback wrong');
  assert(getApp().view === 'levelPlay', 'tras fallar, el jugador permanece en la misma pregunta para reintentar');

  // ===== Modo prueba del admin: saltar niveles y llegar al jefe =====
  ctx.onLogout();
  await sleep(20);
  await ctx.onSelectRole('admin');
  setVal('admUser', 'admin'); setVal('admPass', 'admin123');
  await ctx.onAdminLogin();
  await sleep(50);
  await ctx.onEnterTestMode();
  await sleep(50);
  assert(getApp().testMode === true, 'modo prueba queda activado');
  assert(getApp().view === 'worldMap', 'modo prueba entra directo al mapa como jugador de prueba');
  ctx.enterScenarioPath('potencias');
  await sleep(20);
  assert(html().includes('Modo Prueba activo'), 'camino de niveles muestra tarjeta de modo prueba');
  await ctx.onSkipToBoss();
  await sleep(80);
  assert(getApp().view === 'levelPlay' && getApp().session.level === 'boss', 'skip to boss lleva directo al nivel Jefe');
  const progAfterSkip = getApp().progressCache['potencias'];
  assert(progAfterSkip && progAfterSkip['1'] && progAfterSkip['1'].completed, 'niveles 1-5 quedan marcados como completados tras el salto');

  // ===== Escenario Parciales (mezcla todos los temas) =====
  ctx.enterScenarioPath('parciales');
  await sleep(20);
  ctx.onStartLevel(1);
  await sleep(20);
  assert(getApp().session.questions.length === 8, 'nivel de parciales trae 8 preguntas (una por cada otro escenario)');
  let guardP = 0;
  while (getApp().view === 'levelPlay' && guardP < 15) {
    const s = getApp().session;
    const q = s.questions[s.idx];
    if (q.type === 'numeric') { setVal('numAnswer', String(q.answer)); ctx.onSubmitAnswer(); }
    else ctx.onSubmitAnswer(q.correctIndex);
    await ctx.onNextQuestion();
    await sleep(20);
    guardP++;
  }
  assert(getApp().view === 'levelResults' && getApp().lastResult.effPct === 100, 'nivel de parciales completo con 100% de efectividad');

  // ===== Ejercicio de coordenadas en Ejes Cartesianos (multiple choice, sin revelar coordenadas) =====
  let foundCoords = false;
  for (let attempt = 0; attempt < 30 && !foundCoords; attempt++) {
    ctx.enterScenarioPath('cartesianos');
    await sleep(10);
    ctx.onStartLevel(1);
    await sleep(10);
    const s = getApp().session;
    for (let i = 0; i < s.questions.length; i++) {
      const q = s.questions[i];
      if (q.hidePointLabel) {
        foundCoords = true;
        assert(q.prompt.includes('coordenadas'), 'pregunta de coordenadas tiene el enunciado esperado');
        assert(q.options.length === 4, 'pregunta de coordenadas ofrece 4 opciones');
        assert(!q.prompt.includes(`(${q.points[0].x}`), 'el enunciado no revela las coordenadas del punto');
        break;
      }
    }
  }
  assert(foundCoords, 'el generador de Ejes Cartesianos produce el ejercicio de leer coordenadas del punto');

  await ctx.onExitTestMode();
  await sleep(50);
  assert(getApp().testMode === false && getApp().view === 'admin', 'salir del modo prueba vuelve al panel admin');

  // ===== Eliminar jugador =====
  await ctx.switchAdminTab('jugadores');
  await sleep(50);
  await ctx.onDeletePlayer(mateoId);
  await sleep(50);
  assert(!getApp().cache.playersAll.some(p => p.id === mateoId), 'jugador eliminado ya no aparece en la lista del admin');

  // ===== Reporte filtrado =====
  await ctx.switchAdminTab('reporte');
  await sleep(150);
  assert(Array.isArray(getApp().cache.report), 'reporte se carga como arreglo');

  fs.writeSync(2, '\n=== RESULTADO FRONTEND: ' + (failures === 0 ? 'TODAS LAS PRUEBAS PASARON' : failures + ' FALLO(S)') + ' ===\n');
  process.exit(failures === 0 ? 0 : 1);
}

main().catch(e => { fs.writeSync(2, 'ERROR FATAL EN TEST: ' + (e && e.stack || e) + '\n'); process.exit(1); });
