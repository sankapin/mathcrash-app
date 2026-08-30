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

  // ===== Generador de Divisiones: niveles 1,2,4 exactos (resto 0), nivel 5-6 inexactos (resto != 0) =====
  for (const lv of [1, 2, 4]) {
    for (let i = 0; i < 60; i++) {
      const q = ctx.genDivisionEnteros(lv);
      const m = q.prompt.match(/: \(?(-?\d+)\)? ÷ \(?(-?\d+)\)?$/);
      assert(m && Number(m[1]) % Number(m[2]) === 0, `division nivel ${lv}: siempre exacta, resto 0 (intento ${i})`);
    }
  }
  for (let i = 0; i < 60; i++) {
    const q = ctx.genDivisionEnteros(3);
    assert(Number.isInteger(q.answer), `division nivel 3: respuesta entera (intento ${i})`);
  }
  let foundNonExact5 = false;
  for (let i = 0; i < 60; i++) {
    const q = ctx.genDivisionEnteros(5);
    const m = q.prompt.match(/: (-?\d+) ÷ (-?\d+)$/);
    if (m) { const a = Number(m[1]), b = Number(m[2]); if (a % b !== 0) foundNonExact5 = true; }
  }
  assert(foundNonExact5, 'division nivel 5 genera divisiones con resto distinto de 0');
  for (let i = 0; i < 40; i++) {
    const q = ctx.genDivisionEnteros(6);
    const m = q.prompt.match(/: (-?\d+) ÷ (-?\d+)$/);
    if (m) assert(Number(m[1]) % Number(m[2]) !== 0, 'division nivel 6 (mini-jefe/jefe) siempre tiene resto distinto de 0');
  }

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
  const sessLvl1 = getApp().session;
  assert(sessLvl1.questions[sessLvl1.questions.length - 1].isMiniBoss === true, 'la ultima pregunta del nivel 1 esta marcada como mini-jefe (mas dificil)');
  assert(sessLvl1.questions.slice(0, -1).every(q => !q.isMiniBoss), 'solo la ultima pregunta del nivel es el mini-jefe');
  assert(html().includes('Desafío extra') === false, 'la insignia de mini-jefe no aparece todavia en la primera pregunta');

  // ===== Cambiar cuenta: descarta la pregunta actual y genera otra distinta =====
  const beforeChangePrompt = getApp().session.questions[getApp().session.idx].prompt;
  ctx.onChangeQuestion();
  const afterChangePrompt = getApp().session.questions[getApp().session.idx].prompt;
  assert(afterChangePrompt !== beforeChangePrompt, 'cambiar cuenta genera un ejercicio distinto al actual');
  assert(getApp().session.feedback === null && getApp().session.attemptsForCurrent === 0, 'cambiar cuenta reinicia el estado de la pregunta (sin penalizar)');

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

  // ===== Completar el Jefe: dispara la medalla de oro por completar el tema al 100% =====
  let guardBoss = 0;
  while (getApp().view === 'levelPlay' && guardBoss < 20) {
    const s = getApp().session;
    const q = s.questions[s.idx];
    if (q.type === 'numeric') { setVal('numAnswer', String(q.answer)); ctx.onSubmitAnswer(); }
    else ctx.onSubmitAnswer(q.correctIndex);
    await ctx.onNextQuestion();
    await sleep(20);
    guardBoss++;
  }
  assert(getApp().view === 'levelResults', 'el jefe de potencias se completa y muestra resultados');
  assert(getApp().lastResult.earnedMedal === true && getApp().lastResult.medalCount === 1, 'completar el jefe otorga la primera medalla de oro del tema');
  assert(html().includes('🏅'), 'la vista de resultados muestra la insignia de medalla');

  // ===== Empezar de 0: reiniciar el tema completado, la medalla se conserva =====
  getApp().view = 'scenarioPath';
  ctx.render();
  await sleep(10);
  assert(html().includes('Empezar de 0'), 'el boton de reiniciar aparece porque el tema esta 100% completo');
  await ctx.onResetScenario();
  await sleep(30);
  const progAfterReset = getApp().progressCache['potencias'];
  assert(!progAfterReset || !progAfterReset['1'] || !progAfterReset['1'].completed, 'el progreso de potencias se reinicio (nivel 1 vuelve a estar bloqueado)');
  assert(ctx.getMedalCount('potencias') === 1, 'la medalla ganada se conserva despues de reiniciar el tema');
  ctx.render();
  assert(html().includes('🏅'), 'el camino de niveles sigue mostrando la medalla ganada tras el reinicio');

  // ===== Escenario Parciales: hoja de ejercicios (worksheet) con 2 por tema =====
  ctx.enterScenarioPath('parciales');
  await sleep(20);
  ctx.onStartLevel(1);
  await sleep(20);
  assert(getApp().session.mode === 'worksheet', 'el nivel de parciales usa el modo hoja de ejercicios');
  assert(getApp().session.questions.length === 18, 'la hoja de parciales trae 18 ejercicios (2 por cada uno de los 9 temas)');
  assert(html().includes('confirmados'), 'la vista de la hoja muestra el contador de filas confirmadas');

  // cambiar cuenta dentro de la hoja: descarta la fila 0 y genera otro ejercicio del mismo tema
  const wsBeforePrompt = getApp().session.questions[0].prompt;
  const wsTopic = getApp().session.questions[0].topicId;
  ctx.onChangeWorksheetRow(0);
  assert(getApp().session.questions[0].prompt !== wsBeforePrompt, 'cambiar cuenta en la hoja genera un ejercicio distinto');
  assert(getApp().session.questions[0].topicId === wsTopic, 'cambiar cuenta en la hoja mantiene el mismo tema');
  assert(getApp().session.questions[0].rowAnswered === false, 'la fila cambiada queda sin responder');

  let guardWs = 0;
  while (getApp().view === 'levelPlay' && guardWs < 60) {
    const s = getApp().session;
    const idx = s.questions.findIndex(q => !q.rowAnswered);
    if (idx === -1) break;
    const q = s.questions[idx];
    if (q.type === 'numeric') setVal('ws_' + idx, String(q.answer));
    else setVal('ws_' + idx, String(q.correctIndex));
    await ctx.onConfirmRow(idx);
    await sleep(10);
    guardWs++;
  }
  assert(getApp().view === 'levelResults', 'la hoja de parciales se completa y muestra resultados');
  assert(getApp().lastResult && getApp().lastResult.effPct === 100, 'la hoja de parciales se completa con 100% de efectividad');
  assert(getApp().lastResult.total === 18, 'el resultado de parciales contabiliza los 18 ejercicios de la hoja');

  // ===== Fuzz test del generador rapido de Numeros Primos (usado dentro de las hojas): consistencia interna =====
  const gens = ctx.__mcGetGenerators();
  let primosOk = true;
  for (let lv = 1; lv <= 6; lv++) {
    for (let i = 0; i < 40; i++) {
      const q = gens.genPrimosQuick(lv === 6 ? 'boss' : lv);
      if (q.type === 'numeric') {
        if (!Number.isInteger(q.answer) || q.answer < 2) { primosOk = false; }
      } else {
        if (!(q.options.length >= 2 && q.options.length <= 4)) primosOk = false;
        if (q.correctIndex < 0 || q.correctIndex >= q.options.length) primosOk = false;
        if (new Set(q.options).size !== q.options.length) primosOk = false;
        // el numero reconstruido a partir de la opcion correcta debe coincidir con el enunciado
        const nInPrompt = Number(q.prompt.match(/de (\d+)/)[1]);
        const factors = q.options[q.correctIndex].split('×').map(f => f.trim());
        const reconstructed = factors.reduce((acc, f) => {
          const m = f.match(/^(\d+)([⁰¹²³⁴⁵⁶⁷⁸⁹]*)$/);
          const base = Number(m[1]);
          const supMap = { '⁰': 0, '¹': 1, '²': 2, '³': 3, '⁴': 4, '⁵': 5, '⁶': 6, '⁷': 7, '⁸': 8, '⁹': 9 };
          const exp = m[2] ? m[2].split('').reduce((e, c) => e * 10 + supMap[c], 0) : 1;
          return acc * Math.pow(base, exp);
        }, 1);
        if (reconstructed !== nInPrompt) primosOk = false;
      }
    }
  }
  assert(primosOk, 'genPrimosQuick produce respuestas y opciones internamente consistentes en todos los niveles (fuzz x40 por nivel)');

  // ===== Fuzz test de la escalerita de Numeros Primos (genPrimosLadder): secuencia consistente con n =====
  let ladderGenOk = true;
  for (let lv = 1; lv <= 6; lv++) {
    for (let i = 0; i < 40; i++) {
      const q = gens.genPrimosLadder(lv === 6 ? 'boss' : lv);
      if (q.type !== 'ladder') ladderGenOk = false;
      if (!Array.isArray(q.sequence) || q.sequence.length < 2) ladderGenOk = false;
      if (q.sequence.reduce((a, p) => a * p, 1) !== q.n) ladderGenOk = false;
      if (q.remaining !== q.n || q.stepIdx !== 0 || q.rows.length !== 0 || q.wrongAttempts !== 0) ladderGenOk = false;
      // la secuencia debe estar en orden no decreciente (siempre se divide por el menor primo posible primero)
      for (let k = 1; k < q.sequence.length; k++) { if (q.sequence[k] < q.sequence[k - 1]) ladderGenOk = false; }
    }
  }
  assert(ladderGenOk, 'genPrimosLadder produce una secuencia de divisiones consistente con el numero original en todos los niveles (fuzz x40 por nivel)');

  // ===== Fuzz test de genPrimosMixed: el escenario normal debe poder dar los DOS tipos de ejercicio =====
  const mixedTypes = new Set();
  for (let i = 0; i < 60; i++) mixedTypes.add(gens.genPrimosMixed(3).type);
  assert(mixedTypes.has('ladder'), 'genPrimosMixed puede generar el tipo escalerita');
  assert(mixedTypes.has('numeric') || mixedTypes.has('choice'), 'genPrimosMixed tambien puede generar el tipo de pregunta rapida (numeric/choice)');

  // Resuelve la pregunta actual correctamente al primer intento, sin importar el tipo (ladder/numeric/choice).
  function solveCurrentQuestion() {
    const q = getApp().session.questions[getApp().session.idx];
    if (q.type === 'ladder') {
      while (q.stepIdx < q.sequence.length) { setVal('ladderDivisor', String(q.sequence[q.stepIdx])); ctx.onSubmitLadderStep(); }
    } else if (q.type === 'numeric') {
      setVal('numAnswer', String(q.answer)); ctx.onSubmitAnswer();
    } else {
      ctx.onSubmitAnswer(q.correctIndex);
    }
  }

  // ===== Escenario Numeros Primos (juego lineal): mezcla de escalerita y pregunta rapida =====
  ctx.enterScenarioPath('primos');
  await sleep(20);
  ctx.onStartLevel(1);
  await sleep(20);
  assert(getApp().session.mode !== 'worksheet', 'el nivel de Numeros Primos usa el juego normal (no la hoja)');

  // forzamos (via cambiar cuenta) a que la primera pregunta sea del tipo escalerita, para probar su interaccion especifica
  let guardForceLadder = 0;
  while (getApp().session.questions[getApp().session.idx].type !== 'ladder' && guardForceLadder < 40) {
    ctx.onChangeQuestion();
    guardForceLadder++;
  }
  let qLadder = getApp().session.questions[getApp().session.idx];
  assert(qLadder.type === 'ladder', 'se puede forzar (cambiando cuenta) a obtener el tipo escalerita en Numeros Primos');

  // un divisor incorrecto no revela la respuesta ni avanza la escalerita, y permite reintentar
  const wrongDivisor = 999999; // no puede coincidir con ningun primo real usado por la escalerita
  setVal('ladderDivisor', String(wrongDivisor));
  ctx.onSubmitLadderStep();
  assert(getApp().session.feedback.status === 'wrong', 'un divisor incorrecto en la escalerita marca feedback wrong');
  assert(getApp().session.questions[getApp().session.idx].stepIdx === 0, 'un divisor incorrecto no avanza la escalerita');

  // completar la escalerita paso a paso con los divisores correctos
  while (qLadder.stepIdx < qLadder.sequence.length) {
    setVal('ladderDivisor', String(qLadder.sequence[qLadder.stepIdx]));
    ctx.onSubmitLadderStep();
  }
  assert(getApp().session.feedback.status === 'correct', 'completar la escalerita marca feedback correct');
  assert(qLadder.remaining === 1, 'la escalerita termina en 1');
  assert(qLadder.rows.length === qLadder.sequence.length, 'la escalerita muestra todos los pasos completados');

  // cambiar cuenta (con cualquier tipo de ejercicio): descarta el actual y genera uno distinto
  await ctx.onNextQuestion();
  await sleep(20);
  const primosBeforeChangePrompt = getApp().session.questions[getApp().session.idx].prompt;
  ctx.onChangeQuestion();
  const afterChangeQ = getApp().session.questions[getApp().session.idx];
  assert(afterChangeQ.prompt !== primosBeforeChangePrompt, 'cambiar cuenta en Numeros Primos genera un ejercicio distinto sin importar el tipo');
  if (afterChangeQ.type === 'ladder') {
    assert(afterChangeQ.stepIdx === 0 && afterChangeQ.rows.length === 0, 'cambiar cuenta a una escalerita nueva empieza con estado inicial limpio');
  }

  // jugar el resto del nivel completo (sin mas errores) hasta ver los resultados
  let guardMixed = 0;
  while (getApp().view === 'levelPlay' && guardMixed < 20) {
    solveCurrentQuestion();
    await ctx.onNextQuestion();
    await sleep(10);
    guardMixed++;
  }
  assert(getApp().view === 'levelResults', 'el nivel de Numeros Primos (mezcla de tipos) se completa y muestra resultados');
  assert(getApp().lastResult && getApp().lastResult.total === 6, 'el resultado del nivel de primos contabiliza los 6 ejercicios');
  assert(getApp().lastResult.correct === 5, 'el ejercicio con el error inicial no cuenta como acierto de primer intento (5 de 6)');

  // ===== Escenario Repaso Prueba: hoja con 4 ejercicios de cada uno de los 5 temas de la prueba =====
  ctx.enterScenarioPath('repaso');
  await sleep(20);
  ctx.onStartLevel(1);
  await sleep(20);
  assert(getApp().session.mode === 'worksheet', 'el nivel de repaso prueba usa el modo hoja de ejercicios');
  assert(getApp().session.questions.length === 20, 'la hoja de repaso trae 20 ejercicios (4 por cada uno de los 5 temas de la prueba)');
  assert(html().includes('Raíz Cuadrada') && html().includes('Raíz Cúbica'), 'la hoja de repaso muestra Raiz Cuadrada y Raiz Cubica como temas separados');

  // cambiar cuenta sobre una fila de raiz_cuadrada (tema que solo existe en REPASO_TOPICS, no en SCENARIOS)
  const raizRowIdx = getApp().session.questions.findIndex(q => q.topicId === 'raiz_cuadrada');
  assert(raizRowIdx !== -1, 'la hoja de repaso incluye filas del tema raiz_cuadrada');
  const raizBeforePrompt = getApp().session.questions[raizRowIdx].prompt;
  ctx.onChangeWorksheetRow(raizRowIdx);
  assert(getApp().session.questions[raizRowIdx].topicId === 'raiz_cuadrada', 'cambiar cuenta en una fila de raiz_cuadrada mantiene el mismo tema (findTopic resuelve temas fuera de SCENARIOS)');
  assert(getApp().session.questions[raizRowIdx].prompt !== raizBeforePrompt, 'cambiar cuenta en la fila de raiz_cuadrada genera un ejercicio distinto');

  let guardRepaso = 0;
  while (getApp().view === 'levelPlay' && guardRepaso < 60) {
    const s = getApp().session;
    const idx = s.questions.findIndex(q => !q.rowAnswered);
    if (idx === -1) break;
    const q = s.questions[idx];
    if (q.type === 'numeric') setVal('ws_' + idx, String(q.answer));
    else setVal('ws_' + idx, String(q.correctIndex));
    await ctx.onConfirmRow(idx);
    await sleep(10);
    guardRepaso++;
  }
  assert(getApp().view === 'levelResults', 'la hoja de repaso se completa y muestra resultados');
  assert(getApp().lastResult && getApp().lastResult.total === 20, 'el resultado de repaso contabiliza los 20 ejercicios de la hoja');

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
