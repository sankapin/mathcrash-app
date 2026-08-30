'use strict';
// =====================================================================
// UTILIDADES
// =====================================================================
function randInt(min, max) { return Math.floor(Math.random() * (max - min + 1)) + min; }
function randChoice(arr) { return arr[randInt(0, arr.length - 1)]; }
function shuffle(arr) { const a = arr.slice(); for (let i = a.length - 1; i > 0; i--) { const j = randInt(0, i);[a[i], a[j]] = [a[j], a[i]]; } return a; }
function gcd(a, b) { a = Math.abs(a); b = Math.abs(b); while (b) { [a, b] = [b, a % b]; } return a; }
function lcm(a, b) { return Math.abs(a * b) / gcd(a, b); }
function toSuper(n) {
  const map = { '0':'⁰','1':'¹','2':'²','3':'³','4':'⁴','5':'⁵','6':'⁶','7':'⁷','8':'⁸','9':'⁹','-':'⁻' };
  return String(n).split('').map(c => map[c] || c).join('');
}
function fmtNum(n) { return n < 0 ? `(${n})` : `${n}`; }
function makeChoiceOptions(correctValue, distractorFn, count = 4) {
  const set = new Set([correctValue]);
  let guard = 0;
  while (set.size < count && guard < 100) { set.add(distractorFn()); guard++; }
  const options = shuffle(Array.from(set));
  return { options, correctIndex: options.indexOf(correctValue) };
}
function lvlIdx(level) { return level === 'boss' ? 6 : level; }
function esc(s){ return String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
function fmtTime(sec){
  sec = Math.round(sec);
  const m = Math.floor(sec/60), s = sec%60;
  return m>0 ? `${m}m ${s}s` : `${s}s`;
}
function fmtDate(ts){
  const d = new Date(ts);
  return d.toLocaleString('es-ES', {day:'2-digit', month:'2-digit', year:'2-digit', hour:'2-digit', minute:'2-digit'});
}

// =====================================================================
// GENERADORES DE EJERCICIOS (probados con fuzz-testing)
// =====================================================================
function buildCombinedTerms(numTerms, maxNum, allowNeg, allowParen, allowDiv) {
  const values = [];
  const ops = [];
  for (let i = 0; i < numTerms; i++) {
    let v = randInt(1, maxNum);
    if (allowNeg && Math.random() < 0.3) v = -v;
    values.push(v);
  }
  for (let i = 0; i < numTerms - 1; i++) ops.push(randChoice(['+', '-', '*']));
  if (allowDiv && numTerms >= 2 && Math.random() < 0.6) {
    const idx = randInt(0, numTerms - 2);
    const b = randInt(2, 9); const k = randInt(1, 9); const a = b * k;
    values[idx] = a; values[idx + 1] = b; ops[idx] = '/';
  }
  const dispVals = values.map(v => fmtNum(v));
  let parenRange = null;
  if (allowParen && numTerms >= 3 && Math.random() < 0.7) {
    const start = randInt(0, numTerms - 3);
    const end = randInt(start + 1, Math.min(start + 2, numTerms - 1));
    parenRange = [start, end];
  }
  let evalStr = '', dispStr = '';
  for (let i = 0; i < numTerms; i++) {
    const openParen = parenRange && i === parenRange[0] ? '(' : '';
    const closeParen = parenRange && i === parenRange[1] ? ')' : '';
    evalStr += openParen + `(${values[i]})` + closeParen;
    dispStr += openParen + dispVals[i] + closeParen;
    if (i < numTerms - 1) {
      evalStr += ` ${ops[i]} `;
      dispStr += ` ${ops[i] === '*' ? '×' : ops[i] === '/' ? '÷' : ops[i]} `;
    }
  }
  return { evalStr, dispStr };
}
function genCombinada(level) {
  const L = lvlIdx(level);
  const numTerms = [3, 4, 4, 5, 6, 7][L - 1];
  const maxNum = [15, 20, 30, 40, 50, 60][L - 1];
  const allowNeg = L >= 3, allowParen = L >= 2, allowDiv = L >= 2;
  const { evalStr, dispStr } = buildCombinedTerms(numTerms, maxNum, allowNeg, allowParen, allowDiv);
  const answer = Function(`"use strict"; return (${evalStr});`)();
  if (!Number.isInteger(answer)) return genCombinada(level);
  return { type: 'numeric', prompt: `Resuelve: ${dispStr}`, answer };
}
function genPotencia(level) {
  const L = lvlIdx(level);
  const numTerms = [3, 3, 4, 4, 5, 6][L - 1];
  const maxNum = [10, 15, 20, 25, 30, 35][L - 1];
  const allowNeg = L >= 3, allowParen = L >= 2, allowDiv = L >= 3;
  const values = [];
  for (let i = 0; i < numTerms; i++) { let v = randInt(1, maxNum); if (allowNeg && Math.random() < 0.3) v = -v; values.push(v); }
  const ops = [];
  for (let i = 0; i < numTerms - 1; i++) ops.push(randChoice(['+', '-', '*']));
  if (allowDiv && numTerms >= 2 && Math.random() < 0.5) {
    const idx = randInt(0, numTerms - 2); const b = randInt(2, 9), k = randInt(1, 9);
    values[idx] = b * k; values[idx + 1] = b; ops[idx] = '/';
  }
  const powCount = L >= 4 ? 2 : 1;
  const powIdxs = shuffle([...Array(numTerms).keys()]).slice(0, powCount);
  const dispVals = values.map(v => fmtNum(v));
  const evalVals = values.slice();
  for (const idx of powIdxs) {
    let base = randInt(2, L >= 3 ? 9 : 6);
    if (Math.random() < 0.3) base = -base;
    const exp = randChoice([2, 3]);
    evalVals[idx] = Math.pow(base, exp);
    dispVals[idx] = `${base < 0 ? `(${base})` : base}${toSuper(exp)}`;
  }
  let parenRange = null;
  if (allowParen && numTerms >= 3 && Math.random() < 0.6) {
    const start = randInt(0, numTerms - 3);
    const end = randInt(start + 1, Math.min(start + 2, numTerms - 1));
    parenRange = [start, end];
  }
  let evalStr = '', dispStr = '';
  for (let i = 0; i < numTerms; i++) {
    const openParen = parenRange && i === parenRange[0] ? '(' : '';
    const closeParen = parenRange && i === parenRange[1] ? ')' : '';
    evalStr += openParen + `(${evalVals[i]})` + closeParen;
    dispStr += openParen + dispVals[i] + closeParen;
    if (i < numTerms - 1) { evalStr += ` ${ops[i]} `; dispStr += ` ${ops[i] === '*' ? '×' : ops[i] === '/' ? '÷' : ops[i]} `; }
  }
  const answer = Function(`"use strict"; return (${evalStr});`)();
  if (!Number.isInteger(answer)) return genPotencia(level);
  return { type: 'numeric', prompt: `Resuelve: ${dispStr}`, answer };
}
function quadrantOf(x, y) {
  if (x === 0 || y === 0) return 'Sobre un eje';
  if (x > 0 && y > 0) return 'I'; if (x < 0 && y > 0) return 'II';
  if (x < 0 && y < 0) return 'III'; return 'IV';
}
function genCartesianos(level) {
  const L = lvlIdx(level);
  const type = L <= 2 ? randChoice(['quadrant', 'coords']) : L === 3 ? 'distance' : L === 4 ? 'midpoint' : L === 5 ? 'reflect' : randChoice(['quadrant', 'coords', 'distance', 'midpoint', 'reflect']);
  const range = L <= 2 ? 6 : 9;
  if (type === 'quadrant') {
    let x, y;
    if (L === 1) { do { x = randInt(-range, range); y = randInt(-range, range); } while (x === 0 || y === 0); }
    else { x = randInt(-range, range); y = randInt(-range, range); }
    const correct = quadrantOf(x, y);
    const allOpts = ['I', 'II', 'III', 'IV', 'Sobre un eje'];
    const opts = shuffle([correct, ...shuffle(allOpts.filter(o => o !== correct)).slice(0, 3)]);
    return { type: 'choice', prompt: `¿En qué cuadrante (o eje) se encuentra el punto (${x}, ${y})?`, points: [{ x, y, label: 'A' }], options: opts, correctIndex: opts.indexOf(correct) };
  }
  if (type === 'coords') {
    let x, y;
    do { x = randInt(-range, range); y = randInt(-range, range); } while (x === 0 || y === 0);
    const correct = `(${x}, ${y})`;
    const candidates = new Set([correct]);
    const baseVariants = shuffle([
      `(${-x}, ${y})`,
      `(${x}, ${-y})`,
      `(${-x}, ${-y})`,
      `(${y}, ${x})`,
      `(${-y}, ${x})`,
      `(${y}, ${-x})`,
      `(${-y}, ${-x})`,
    ]);
    for (const v of baseVariants) { if (candidates.size >= 4) break; candidates.add(v); }
    let guard = 0;
    while (candidates.size < 4 && guard < 50) {
      const jx = x + randInt(1, 4) * randChoice([1, -1]);
      const jy = y + randInt(1, 4) * randChoice([1, -1]);
      candidates.add(`(${jx}, ${jy})`);
      guard++;
    }
    const options = shuffle(Array.from(candidates));
    return { type: 'choice', prompt: `Observa el punto marcado en el plano. ¿Cuáles son sus coordenadas?`, points: [{ x, y, label: 'P' }], hidePointLabel: true, options, correctIndex: options.indexOf(correct) };
  }
  if (type === 'distance') {
    const triples = [[3, 4, 5], [6, 8, 10], [5, 12, 13], [8, 15, 17], [9, 12, 15]];
    const [dx0, dy0, d] = randChoice(triples);
    const dx = randChoice([dx0, dy0]); const dy = dx === dx0 ? dy0 : dx0;
    const x1 = randInt(-range, range), y1 = randInt(-range, range);
    const sx = randChoice([1, -1]), sy = randChoice([1, -1]);
    const x2 = x1 + sx * dx, y2 = y1 + sy * dy;
    return { type: 'numeric', prompt: `¿Cuál es la distancia entre A(${x1}, ${y1}) y B(${x2}, ${y2})?`, points: [{ x: x1, y: y1, label: 'A' }, { x: x2, y: y2, label: 'B' }], answer: d };
  }
  if (type === 'midpoint') {
    const x1 = randInt(-range, range), y1 = randInt(-range, range);
    let x2 = randInt(-range, range), y2 = randInt(-range, range);
    if ((x1 + x2) % 2 !== 0) x2 += 1;
    if ((y1 + y2) % 2 !== 0) y2 += 1;
    const mx = (x1 + x2) / 2, my = (y1 + y2) / 2;
    const correct = `(${mx}, ${my})`;
    const { options, correctIndex } = makeChoiceOptions(correct, () => `(${mx + randInt(-3, 3)}, ${my + randInt(-3, 3)})`);
    return { type: 'choice', prompt: `¿Cuál es el punto medio entre A(${x1}, ${y1}) y B(${x2}, ${y2})?`, points: [{ x: x1, y: y1, label: 'A' }, { x: x2, y: y2, label: 'B' }], options, correctIndex };
  }
  const x = randInt(-range, range) || 1, y = randInt(-range, range) || 1;
  const axis = randChoice(['X', 'Y']);
  const rx = axis === 'X' ? x : -x; const ry = axis === 'X' ? -y : y;
  const correct = `(${rx}, ${ry})`;
  const { options, correctIndex } = makeChoiceOptions(correct, () => `(${rx + randInt(-3, 3)}, ${ry + randInt(-3, 3)})`);
  return { type: 'choice', prompt: `¿Cuál es el punto simétrico de A(${x}, ${y}) al reflejarlo sobre el eje ${axis}?`, points: [{ x, y, label: 'A' }], options, correctIndex };
}
function genMCM(level) {
  const L = lvlIdx(level);
  const maxNum = [12, 20, 30, 40, 60, 80][L - 1];
  const count = L >= 3 ? 3 : 2;
  const nums = new Set(); while (nums.size < count) nums.add(randInt(2, maxNum));
  const arr = Array.from(nums);
  const answer = arr.reduce((a, b) => lcm(a, b));
  return { type: 'numeric', prompt: `Halla el Mínimo Común Múltiplo (m.c.m.) de: ${arr.join(', ')}`, answer };
}
function genMCD(level) {
  const L = lvlIdx(level);
  const maxNum = [40, 60, 90, 120, 160, 200][L - 1];
  const count = L >= 3 ? 3 : 2;
  const nums = new Set(); while (nums.size < count) nums.add(randInt(4, maxNum));
  const arr = Array.from(nums);
  const answer = arr.reduce((a, b) => gcd(a, b));
  return { type: 'numeric', prompt: `Halla el Máximo Común Divisor (M.C.D.) de: ${arr.join(', ')}`, answer };
}
function genDivisionEnteros(level) {
  const L = lvlIdx(level);
  if (L <= 2) {
    const b = randInt(2, L === 1 ? 9 : 12); const k = randInt(2, L === 1 ? 9 : 12);
    let a = b * k; const sa = randChoice([1, -1]), sb = randChoice([1, -1]);
    a *= sa; const bb = b * sb; const answer = a / bb;
    return { type: 'numeric', prompt: `Resuelve: ${fmtNum(a)} ÷ ${fmtNum(bb)}`, answer };
  }
  if (L === 3) {
    const c = randInt(2, 9), k = randInt(2, 9); const ab = c * k;
    const a = randInt(2, 9); const bReal = ab / a;
    if (!Number.isInteger(bReal)) return genDivisionEnteros(level);
    const sa = randChoice([1, -1]), sb = randChoice([1, -1]), sc = randChoice([1, -1]);
    const A = a * sa, B = bReal * sb, C = c * sc;
    const answer = (A * B) / C;
    if (!Number.isInteger(answer)) return genDivisionEnteros(level);
    return { type: 'numeric', prompt: `Resuelve: (${fmtNum(A)} × ${fmtNum(B)}) ÷ ${fmtNum(C)}`, answer };
  }
  if (L === 4) {
    const b = randInt(3, 15), k = randInt(3, 15); let a = b * k;
    const sa = randChoice([1, -1]), sb = randChoice([1, -1]);
    a *= sa; const bb = b * sb; const answer = a / bb;
    return { type: 'numeric', prompt: `Resuelve: ${fmtNum(a)} ÷ ${fmtNum(bb)}`, answer };
  }
  // Nivel 5 (y nivel 6, usado por el mini-jefe/jefe final): division inexacta, resto distinto de 0.
  // Se pide el cociente entero (numeros positivos, para evitar ambiguedad con el resto en negativos).
  const maxA = L >= 6 ? 300 : 150;
  const b = randInt(3, L >= 6 ? 18 : 12);
  let a;
  do { a = randInt(15, maxA); } while (a % b === 0);
  const answer = Math.trunc(a / b);
  return { type: 'numeric', prompt: `Resuelve la división entera (indicá el cociente): ${a} ÷ ${b}`, answer };
}
function genRaices(level) {
  const L = lvlIdx(level);
  if (L === 1) { const base = randInt(2, 12); return { type: 'numeric', prompt: `Calcula: √${base * base}`, answer: base }; }
  if (L === 2) {
    if (Math.random() < 0.5) { const base = randInt(6, 20); return { type: 'numeric', prompt: `Calcula: √${base * base}`, answer: base }; }
    const base = randInt(2, 5); return { type: 'numeric', prompt: `Calcula: ∛${base * base * base}`, answer: base };
  }
  if (L === 3) {
    if (Math.random() < 0.5) { const base = randInt(15, 30); return { type: 'numeric', prompt: `Calcula: √${base * base}`, answer: base }; }
    const base = randInt(4, 8); return { type: 'numeric', prompt: `Calcula: ∛${base * base * base}`, answer: base };
  }
  if (L === 4) { const base = randInt(2, 9) * randChoice([1, -1]); return { type: 'numeric', prompt: `Calcula: ∛${base * base * base}`, answer: base }; }
  const b1 = randInt(2, 12), b2 = randInt(2, 6) * randChoice([1, -1]);
  const op = randChoice(['+', '-']); const val1 = b1 * b1; const val2 = b2 * b2 * b2;
  const answer = op === '+' ? b1 + b2 : b1 - b2;
  return { type: 'numeric', prompt: `Calcula: √${val1} ${op} ∛${val2}`, answer };
}
function genFaltante(level) {
  const L = lvlIdx(level);
  const maxD = [12, 20, 25, 30, 40, 50][L - 1];
  const d = randInt(2, maxD); const c = randInt(2, maxD); const r = L === 1 ? 0 : randInt(0, d - 1);
  const D = d * c + r;
  const missing = L === 1 ? 'D' : randChoice(['D', 'd', 'c', 'r']);
  let prompt, answer;
  if (missing === 'D') { prompt = `En una división: divisor = ${d}, cociente = ${c}, resto = ${r}. ¿Cuál es el dividendo?`; answer = D; }
  else if (missing === 'd') { prompt = `En una división: dividendo = ${D}, cociente = ${c}, resto = ${r}. ¿Cuál es el divisor?`; answer = d; }
  else if (missing === 'c') { prompt = `En una división: dividendo = ${D}, divisor = ${d}, resto = ${r}. ¿Cuál es el cociente?`; answer = c; }
  else { prompt = `En una división: dividendo = ${D}, divisor = ${d}, cociente = ${c}. ¿Cuál es el resto?`; answer = r; }
  return { type: 'numeric', prompt, answer };
}
// ---- Numeros Primos (descomposicion en factores primos) ----
const PRIME_POOL = [2, 3, 5, 7, 11, 13, 17, 19];
function buildFactorization(numPrimes, maxExpByPrimeCount) {
  const chosen = shuffle(PRIME_POOL.slice(0, Math.min(PRIME_POOL.length, numPrimes + 2))).slice(0, numPrimes).sort((a, b) => a - b);
  const pairs = chosen.map(p => {
    const cap = p <= 5 ? maxExpByPrimeCount : (p <= 11 ? Math.max(1, maxExpByPrimeCount - 1) : 1);
    return [p, randInt(1, cap)];
  });
  const n = pairs.reduce((acc, [p, e]) => acc * Math.pow(p, e), 1);
  return { n, pairs };
}
function fmtFactorization(pairs) {
  return pairs.map(([p, e]) => e === 1 ? `${p}` : `${p}${toSuper(e)}`).join(' × ');
}
function collapseSequence(seq) {
  const pairs = [];
  for (const p of seq) {
    const last = pairs[pairs.length - 1];
    if (last && last[0] === p) last[1]++; else pairs.push([p, 1]);
  }
  return pairs;
}
// Genera un ejercicio de "escalerita": el jugador hace la division sucesiva por primos
// paso a paso (igual que en el cuaderno), siempre dividiendo por el menor primo posible.
function genPrimosLadder(level) {
  const L = lvlIdx(level);
  const [numPrimes, maxExp] = ({ 1: [2, 1], 2: [2, 2], 3: [3, 1], 4: [3, 2], 5: [3, 3], 6: [4, 3] })[L];
  const { n, pairs } = buildFactorization(numPrimes, maxExp);
  const sequence = [];
  for (const [p, e] of pairs) { for (let i = 0; i < e; i++) sequence.push(p); }
  return {
    type: 'ladder',
    prompt: `Descomponé ${n} en factores primos usando el método de las divisiones sucesivas. Dividí siempre por el menor primo posible.`,
    n,
    sequence,
    remaining: n,
    stepIdx: 0,
    rows: [],
    wrongAttempts: 0,
  };
}
// Version rapida (una sola pregunta derivada de la descomposicion), usada dentro de las
// hojas de ejercicios (Parciales y Repaso Prueba) donde no entra la escalerita paso a paso.
function genPrimosQuick(level) {
  const L = lvlIdx(level);
  if (L === 1) {
    const { n, pairs } = buildFactorization(2, 1);
    return { type: 'numeric', prompt: `¿Cuál es el menor factor primo de ${n}?`, answer: pairs[0][0] };
  }
  if (L === 2) {
    const { n, pairs } = buildFactorization(2, 2);
    return { type: 'numeric', prompt: `¿Cuál es el mayor factor primo de ${n}?`, answer: pairs[pairs.length - 1][0] };
  }
  if (L === 3) {
    const { n, pairs } = buildFactorization(3, 2);
    return { type: 'numeric', prompt: `¿Cuántos factores primos DISTINTOS tiene ${n}?`, answer: pairs.length };
  }
  if (L === 4) {
    const { n, pairs } = buildFactorization(3, 3);
    const total = pairs.reduce((a, [, e]) => a + e, 0);
    return { type: 'numeric', prompt: `¿Cuántos factores primos tiene ${n} en total (contando los repetidos)?`, answer: total };
  }
  // L 5 y L 6 (mini-jefe / jefe): eleccion multiple de la descomposicion completa
  const numPrimes = L >= 6 ? 4 : 3;
  const maxExp = L >= 6 ? 3 : 2;
  const { n, pairs } = buildFactorization(numPrimes, maxExp);
  const correct = fmtFactorization(pairs);
  const candidates = new Set([correct]);
  let guard = 0;
  while (candidates.size < 4 && guard < 40) {
    const variant = pairs.map(([p, e]) => [p, e]);
    const idx = randInt(0, variant.length - 1);
    if (Math.random() < 0.5) {
      variant[idx][1] = Math.max(1, variant[idx][1] + randChoice([1, -1]));
    } else {
      const poolIdx = PRIME_POOL.indexOf(variant[idx][0]);
      const newIdx = Math.max(0, Math.min(PRIME_POOL.length - 1, poolIdx + randChoice([1, -1])));
      variant[idx][0] = PRIME_POOL[newIdx];
    }
    variant.sort((a, b) => a[0] - b[0]);
    candidates.add(fmtFactorization(variant));
    guard++;
  }
  const options = shuffle(Array.from(candidates));
  return { type: 'choice', prompt: `¿Cuál es la descomposición en factores primos de ${n}?`, options, correctIndex: options.indexOf(correct) };
}
// ---- Generadores simples de raiz, usados solo por "Repaso Prueba" ----
function genRaizCuadradaSimple(level) {
  const L = lvlIdx(level);
  const base = L <= 2 ? randInt(2, 12) : L <= 4 ? randInt(8, 25) : randInt(15, 40);
  return { type: 'numeric', prompt: `Calcula: √${base * base}`, answer: base };
}
function genRaizCubicaSimple(level) {
  const L = lvlIdx(level);
  const magnitude = L <= 2 ? randInt(2, 6) : L <= 4 ? randInt(3, 9) : randInt(4, 12);
  const base = L >= 4 ? magnitude * randChoice([1, -1]) : magnitude;
  return { type: 'numeric', prompt: `Calcula: ∛${base * base * base}`, answer: base };
}

// =====================================================================
// DATOS DEL JUEGO
// =====================================================================
const SCENARIOS = [
  { id: 'combinadas', name: 'Operaciones Combinadas', emoji: '🔢', gen: genCombinada, levels: [1, 2, 3, 4, 5, 'boss'] },
  { id: 'potencias', name: 'Combinadas con Potencia', emoji: '⚡', gen: genPotencia, levels: [1, 2, 3, 4, 5, 'boss'] },
  { id: 'cartesianos', name: 'Ejes Cartesianos', emoji: '🗺️', gen: genCartesianos, levels: [1, 2, 3, 4, 5, 'boss'] },
  { id: 'mcm', name: 'Mínimo Común Múltiplo', emoji: '🔗', gen: genMCM, levels: [1, 2, 3, 4, 5, 'boss'] },
  { id: 'mcd', name: 'Máximo Común Divisor', emoji: '💎', gen: genMCD, levels: [1, 2, 3, 4, 5, 'boss'] },
  { id: 'entera', name: 'División de Enteros', emoji: '➗', gen: genDivisionEnteros, levels: [1, 2, 3, 4, 5, 'boss'] },
  { id: 'raices', name: 'Raíz Cuadrada y Cúbica', emoji: '√', gen: genRaices, levels: [1, 2, 3, 4, 5, 'boss'] },
  { id: 'faltante', name: 'Número Faltante', emoji: '❓', gen: genFaltante, levels: [1, 2, 3, 4, 5, 'boss'] },
  { id: 'primos', name: 'Números Primos', emoji: '🔑', gen: genPrimosLadder, genWorksheet: genPrimosQuick, levels: [1, 2, 3, 4, 5, 'boss'] },
  {
    id: 'parciales', name: 'Parciales', emoji: '📝', mode: 'worksheet', perTopic: 2, levels: [1, 2, 3, 4, 5],
    topicsFn: () => SCENARIOS.filter(s => s.mode !== 'worksheet').map(s => ({ id: s.id, name: s.name, emoji: s.emoji, gen: s.genWorksheet || s.gen })),
    subtitle: '5 niveles de prueba integradora, con ejercicios de todos los temas mezclados, todos juntos en una hoja. Cada nivel otorga 2 logros: ⏱️ velocidad y 🎯 efectividad.',
  },
  {
    id: 'repaso', name: 'Repaso Prueba', emoji: '📚', mode: 'worksheet', perTopic: 4, levels: [1, 2, 3, 4, 5],
    topicsFn: () => REPASO_TOPICS,
    subtitle: '5 niveles de repaso para la prueba: Números Primos, m.c.m., M.C.D., Raíz Cuadrada y Raíz Cúbica, todos juntos en una hoja. Cada nivel otorga 2 logros: ⏱️ velocidad y 🎯 efectividad.',
  },
];
const REPASO_TOPICS = [
  { id: 'primos', name: 'Números Primos', emoji: '🔑', gen: genPrimosQuick },
  { id: 'mcm', name: 'Mínimo Común Múltiplo', emoji: '🔗', gen: genMCM },
  { id: 'mcd', name: 'Máximo Común Divisor', emoji: '💎', gen: genMCD },
  { id: 'raiz_cuadrada', name: 'Raíz Cuadrada', emoji: '√', gen: genRaizCuadradaSimple },
  { id: 'raiz_cubica', name: 'Raíz Cúbica', emoji: '∛', gen: genRaizCubicaSimple },
];
// Para jugar el escenario normal (camino de niveles): usa sc.gen tal cual (por ej. la escalerita de primos).
function findTopic(topicId) { return SCENARIOS.find(s => s.id === topicId) || REPASO_TOPICS.find(s => s.id === topicId); }
// Para hojas de ejercicios (Parciales/Repaso): usa la version "rapida" de un tema si existe (por ej. primos
// nunca debe generar la escalerita paso a paso dentro de una hoja, porque no entra en el formato de fila unica).
function findWorksheetTopic(topicId) {
  const sc = SCENARIOS.find(s => s.id === topicId);
  if (sc) return { id: sc.id, name: sc.name, emoji: sc.emoji, gen: sc.genWorksheet || sc.gen };
  return REPASO_TOPICS.find(s => s.id === topicId);
}
const LEVELS = [1, 2, 3, 4, 5, 'boss'];
function qCount(level) { return level === 'boss' ? 10 : 6; }
function levelQuestionCount(sc, level) { return sc.mode === 'worksheet' ? sc.topicsFn().length * sc.perTopic : qCount(level); }
function levelLabel(level) { return level === 'boss' ? 'JEFE FINAL' : `Nivel ${level}`; }

// =====================================================================
// CLIENTE API
// =====================================================================
function getAdminToken() { return localStorage.getItem('mc_admin_token'); }
function setAdminToken(t) { if (t) localStorage.setItem('mc_admin_token', t); else localStorage.removeItem('mc_admin_token'); }
function getAdminUser() { try { return JSON.parse(localStorage.getItem('mc_admin_user') || 'null'); } catch (e) { return null; } }
function setAdminUser(u) { if (u) localStorage.setItem('mc_admin_user', JSON.stringify(u)); else localStorage.removeItem('mc_admin_user'); }

async function api(method, path, body) {
  const headers = { 'Content-Type': 'application/json' };
  const token = getAdminToken();
  if (token) headers.Authorization = 'Bearer ' + token;
  const res = await fetch(path, { method, headers, body: body !== undefined ? JSON.stringify(body) : undefined });
  let data = null;
  try { data = await res.json(); } catch (e) { /* sin cuerpo */ }
  if (!res.ok) {
    const err = new Error((data && data.error) || `Error ${res.status}`);
    err.status = res.status;
    throw err;
  }
  return data;
}

function showToast(msg) {
  let t = document.getElementById('toastMsg');
  if (!t) { t = document.createElement('div'); t.id = 'toastMsg'; t.className = 'toast'; document.body.appendChild(t); }
  t.textContent = msg;
  t.style.display = 'block';
  clearTimeout(showToast._timer);
  showToast._timer = setTimeout(() => { t.style.display = 'none'; }, 4000);
}

// =====================================================================
// ESTADO DE APP (transitorio)
// =====================================================================
let app = {
  view: 'role', currentUser: null, currentPlayer: null, currentScenario: null, session: null,
  adminTab: 'resumen', adminPlayerDetail: null, reportFilter: { player: 'all', scenario: 'all', level: 'all' },
  tempError: '', testMode: false, freeLevelPick: 1, postCreateReturnToAdmin: false,
  cache: {}, progressCache: {}, medalsCache: {},
};
const root = document.getElementById('app');

// =====================================================================
// PROGRESO (cacheado en cliente, sincronizado con el servidor)
// =====================================================================
async function refreshProgress() {
  if (!app.currentPlayer) return;
  const [progress, medals] = await Promise.all([
    api('GET', `/api/progress/${app.currentPlayer.id}`),
    api('GET', `/api/medals/${app.currentPlayer.id}`),
  ]);
  app.progressCache = progress;
  app.medalsCache = medals;
}
function getMedalCount(scenarioId) { return app.medalsCache[scenarioId] || 0; }
function getProgress(scenarioId, level) {
  const byScenario = app.progressCache[scenarioId] || {};
  return byScenario[String(level)] || { completed: false, bestEff: 0, bestTimeSec: null, achievements: { time: false, eff: false }, attemptsCount: 0, recentPrompts: [] };
}
function isLevelUnlocked(scenarioId, level) {
  if (level === 1) return true;
  const prevLevel = level === 'boss' ? 5 : level - 1;
  return getProgress(scenarioId, prevLevel).completed;
}

// =====================================================================
// SVG PLANO CARTESIANO
// =====================================================================
function renderPlane(points, range, hideCoords) {
  range = range || 9;
  const size = 300, cx = size / 2, cy = size / 2, scale = (size / 2 - 20) / range;
  const px = c => cx + c * scale, py = c => cy - c * scale;
  let lines = '';
  for (let i = -range; i <= range; i++) {
    if (i === 0) continue;
    lines += `<line x1="${px(i)}" y1="${py(-range)}" x2="${px(i)}" y2="${py(range)}" stroke="#332e5c" stroke-width="1"/>`;
    lines += `<line x1="${px(-range)}" y1="${py(i)}" x2="${px(range)}" y2="${py(i)}" stroke="#332e5c" stroke-width="1"/>`;
  }
  let dots = '';
  const colors = ['#ffd23f', '#4cc9f0'];
  points.forEach((p, i) => {
    dots += `<circle cx="${px(p.x)}" cy="${py(p.y)}" r="6" fill="${colors[i % 2]}" stroke="#151327" stroke-width="2"/>`;
    const labelText = hideCoords ? p.label : `${p.label}(${p.x},${p.y})`;
    dots += `<text x="${px(p.x) + 10}" y="${py(p.y) - 8}" fill="${colors[i % 2]}" font-size="14" font-weight="bold">${labelText}</text>`;
  });
  return `<svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
    <rect width="${size}" height="${size}" fill="#100e21" rx="12"/>
    ${lines}
    <line x1="${px(-range)}" y1="${cy}" x2="${px(range)}" y2="${cy}" stroke="#9b5de5" stroke-width="2"/>
    <line x1="${cx}" y1="${py(-range)}" x2="${cx}" y2="${py(range)}" stroke="#9b5de5" stroke-width="2"/>
    ${dots}
  </svg>`;
}

// =====================================================================
// VISTA: SELECCION DE ROL
// =====================================================================
function viewRoleSelect() {
  return `
  <div class="content center-screen">
    <h1>🚀 MATH CRASH</h1>
    <p class="subtitle">Aventura matemática por niveles</p>
    <div class="role-grid">
      <div class="role-card" onclick="onSelectRole('player')">
        <div class="emoji">🎮</div>
        <h3>Soy Jugador</h3>
        <p class="subtitle">Practica y sube de nivel</p>
      </div>
      <div class="role-card" onclick="onSelectRole('admin')">
        <div class="emoji">🛠️</div>
        <h3>Soy Administrador</h3>
        <p class="subtitle">Panel de control y reportes</p>
      </div>
    </div>
  </div>`;
}
async function onSelectRole(role) {
  if (role === 'admin') {
    const token = getAdminToken();
    if (token) {
      try {
        await api('GET', '/api/admin/users');
        app.currentUser = getAdminUser();
        await enterAdmin('resumen');
        return;
      } catch (e) { setAdminToken(null); setAdminUser(null); }
    }
    app.view = 'adminLogin'; app.tempError = ''; render();
  } else {
    await enterPlayerSelect();
  }
}

// =====================================================================
// VISTA: LOGIN ADMIN
// =====================================================================
function viewAdminLogin() {
  return `
  <div class="content center-screen">
    <div class="card" style="width:320px;">
      <h2>🛠️ Acceso Admin</h2>
      <div class="form-field"><label>Usuario</label><input id="admUser" placeholder="admin"></div>
      <div class="form-field"><label>Contraseña</label><input id="admPass" type="password" placeholder="••••••••"></div>
      <div class="error-msg">${esc(app.tempError)}</div>
      <button class="btn" style="width:100%" onclick="onAdminLogin()">Entrar</button>
      <p class="hint">Usuario por defecto: <b>admin</b> / <b>admin123</b></p>
    </div>
    <a class="linklike" onclick="app.view='role'; render();">&larr; Volver</a>
  </div>`;
}
async function onAdminLogin() {
  const u = document.getElementById('admUser').value.trim();
  const pass = document.getElementById('admPass').value;
  try {
    const r = await api('POST', '/api/admin/login', { username: u, password: pass });
    setAdminToken(r.token); setAdminUser(r.user);
    app.currentUser = r.user;
    await enterAdmin('resumen');
  } catch (e) {
    app.tempError = e.message; render();
  }
}

// =====================================================================
// VISTA: SELECCION / CREACION DE JUGADOR
// =====================================================================
const AVATARS = ['🦖','🐯','🦊','🐸','🐵','🐼','🦄','🐲','🐺','🦁','🐨','🐱'];
async function enterPlayerSelect() {
  app.view = 'playerSelect'; app.tempError = ''; render();
  try { app.cache.players = await api('GET', '/api/players'); } catch (e) { showToast(e.message); }
  render();
}
function viewPlayerSelect() {
  const players = app.cache.players;
  if (!players) return '<div class="content center-screen"><div class="loading">Cargando jugadores...</div></div>';
  const chips = players.map(p => `
    <div class="player-chip" onclick="onSelectPlayer('${p.id}')">
      <div class="avatar">${p.avatar}</div>
      <div>${esc(p.name)}</div>
    </div>`).join('');
  return `
  <div class="content center-screen">
    <h2>🎮 ¿Quién juega?</h2>
    <div class="player-grid">${chips || '<p class="subtitle">Aún no hay jugadores creados.</p>'}</div>
    <button class="btn green" onclick="app.view='playerCreate'; app.tempError=''; render();">+ Crear jugador nuevo</button>
    <a class="linklike" onclick="app.view='role'; render();">&larr; Volver</a>
  </div>`;
}
async function onSelectPlayer(id) {
  const p = (app.cache.players || []).find(x => x.id === id);
  if (!p) return;
  app.currentPlayer = p;
  await enterWorldMap();
}
let pickedAvatar = AVATARS[0];
function viewPlayerCreate() {
  const avatarHtml = AVATARS.map(a => `<span class="${a === pickedAvatar ? 'sel' : ''}" onclick="pickedAvatar='${a}'; render();">${a}</span>`).join('');
  return `
  <div class="content center-screen">
    <div class="card" style="width:320px;">
      <h2>Crear jugador</h2>
      <div class="form-field"><label>Nombre</label><input id="newPlayerName" placeholder="Ej: Mateo"></div>
      <div class="form-field"><label>Elige un avatar</label><div class="avatar-pick">${avatarHtml}</div></div>
      <div class="error-msg">${esc(app.tempError)}</div>
      <button class="btn green" style="width:100%" onclick="onCreatePlayer()">Crear</button>
    </div>
    <a class="linklike" onclick="app.postCreateReturnToAdmin ? enterAdmin('jugadores') : enterPlayerSelect()">&larr; Volver</a>
  </div>`;
}
async function onCreatePlayer() {
  const name = document.getElementById('newPlayerName').value.trim();
  if (!name) { app.tempError = 'Escribe un nombre'; render(); return; }
  try {
    const p = await api('POST', '/api/players', { name, avatar: pickedAvatar });
    if (app.postCreateReturnToAdmin) { app.postCreateReturnToAdmin = false; await enterAdmin('jugadores'); }
    else { app.currentPlayer = p; await enterWorldMap(); }
  } catch (e) { app.tempError = e.message; render(); }
}

// =====================================================================
// VISTA: MAPA DE ESCENARIOS (jugador)
// =====================================================================
function scenarioProgressPct(scenarioId) {
  const sc = SCENARIOS.find(s => s.id === scenarioId);
  let done = 0;
  for (const lv of sc.levels) if (getProgress(scenarioId, lv).completed) done++;
  return Math.round((done / sc.levels.length) * 100);
}
async function enterWorldMap() {
  app.view = 'worldMap'; render();
  try { await refreshProgress(); } catch (e) { showToast('No se pudo cargar el progreso: ' + e.message); }
  render();
}
function viewWorldMap() {
  const cards = SCENARIOS.map(sc => {
    const pct = scenarioProgressPct(sc.id);
    const medals = getMedalCount(sc.id);
    return `
    <div class="scenario-card" onclick="enterScenarioPath('${sc.id}')">
      <div class="emoji">${sc.emoji}</div>
      <div class="name">${esc(sc.name)}</div>
      <div class="progress-bar"><div class="fill" style="width:${pct}%"></div></div>
      <div class="pct">${pct}% completado</div>
      ${medals > 0 ? `<div class="medal-badge">🏅 ×${medals}</div>` : ''}
    </div>`;
  }).join('');
  return `
  <div class="content">
    <h2>Hola, ${esc(app.currentPlayer.name)} ${app.currentPlayer.avatar}</h2>
    <p class="subtitle">Elige un escenario para practicar</p>
    <div class="scenario-grid">${cards}</div>
  </div>`;
}
function enterScenarioPath(scenarioId) {
  app.currentScenario = scenarioId;
  app.view = 'scenarioPath';
  render();
}
async function onResetScenario() {
  if (!confirm('¿Seguro que querés empezar este tema de nuevo desde cero? Se van a volver a bloquear los niveles (tus medallas 🏅 no se pierden).')) return;
  try {
    await api('POST', '/api/reset-scenario', { playerId: app.currentPlayer.id, scenarioId: app.currentScenario });
    await refreshProgress();
    render();
  } catch (e) { showToast(e.message); }
}

// =====================================================================
// VISTA: CAMINO DE NIVELES DE UN ESCENARIO
// =====================================================================
function viewScenarioPath() {
  const sc = SCENARIOS.find(s => s.id === app.currentScenario);
  const nodes = sc.levels.map((lv, i) => {
    const prog = getProgress(sc.id, lv);
    const unlocked = app.testMode || isLevelUnlocked(sc.id, lv);
    const isBoss = lv === 'boss';
    let cls = 'level-node' + (isBoss ? ' boss' : '');
    if (!unlocked) cls += ' locked';
    else if (!prog.completed) cls += ' current';
    const badges = [];
    if (prog.achievements.time) badges.push('⏱️');
    if (prog.achievements.eff) badges.push('🎯');
    const label = isBoss ? '💀' : lv;
    const node = `
      <div style="position:relative;">
        <div class="node-badges">${badges.map(b => `<span>${b}</span>`).join('')}</div>
        <div class="${cls}" onclick="${unlocked ? `onStartLevel('${lv}')` : ''}" title="${unlocked ? levelLabel(lv) : 'Bloqueado'}">
          ${unlocked ? label : '🔒'}
        </div>
      </div>`;
    const connector = i < sc.levels.length - 1 ? '<div class="connector"></div>' : '';
    return node + connector;
  }).join('');
  const diffOpts = [1, 2, 3, 4, 5].map(lv => `<option value="${lv}" ${app.freeLevelPick === lv ? 'selected' : ''}>Nivel ${lv}</option>`).join('');
  const subtitle = sc.levels.includes('boss')
    ? '5 niveles + Jefe final. Cada nivel otorga 2 logros: ⏱️ velocidad y 🎯 efectividad.'
    : '5 niveles de prueba integradora, con ejercicios de todos los temas mezclados. Cada nivel otorga 2 logros: ⏱️ velocidad y 🎯 efectividad.';
  const pct = scenarioProgressPct(sc.id);
  const medals = getMedalCount(sc.id);
  const medalsHtml = medals > 0 ? `<p class="medal-badge">🏅 Completaste este tema al 100% ${medals} ${medals === 1 ? 'vez' : 'veces'}</p>` : '';
  const resetHtml = pct === 100 ? `
    <div class="card" style="max-width:420px; margin:14px auto 0; text-align:center;">
      <h3 style="margin-bottom:10px;">🔄 ¡Tema completado al 100%!</h3>
      <p class="hint">Podés empezar de nuevo este tema desde cero (se vuelven a bloquear los niveles). Tus medallas 🏅 no se pierden.</p>
      <button class="btn secondary" onclick="onResetScenario()">🔄 Empezar de 0</button>
    </div>` : '';
  return `
  <div class="content">
    <div class="back-row"><a class="linklike" onclick="app.view='worldMap'; render();">&larr; Volver al mapa</a></div>
    <h2>${sc.emoji} ${esc(sc.name)}</h2>
    <p class="subtitle">${subtitle}</p>
    ${medalsHtml}
    <div class="level-path">${nodes}</div>
    <div class="card" style="max-width:420px; margin:10px auto 0; text-align:center;">
      <h3 style="margin-bottom:10px;">🎚️ Practicar una dificultad específica</h3>
      <div class="filters" style="justify-content:center;">
        <select id="freeLevelSelect" onchange="app.freeLevelPick=Number(this.value);">${diffOpts}</select>
        <button class="btn purple" onclick="onStartLevel(document.getElementById('freeLevelSelect').value)">▶ Jugar este nivel</button>
      </div>
      <p class="hint">Elige el nivel (1 al 5) y practica las veces que quieras, sin importar si está bloqueado en el camino de arriba.</p>
    </div>
    ${resetHtml}
    ${app.testMode && sc.levels.includes('boss') ? `
    <div class="card" style="max-width:420px; margin:14px auto 0; text-align:center; border:2px dashed var(--accent-purple);">
      <h3 style="margin-bottom:10px;">🧪 Modo Prueba activo</h3>
      <p class="hint">Todos los niveles están desbloqueados para que revises el contenido y la dificultad. También podés marcar el 1-5 como completados e ir directo al Jefe final.</p>
      <button class="btn purple" onclick="onSkipToBoss()">⏭️⏭️ Marcar niveles 1-5 completados y jugar el Jefe</button>
    </div>` : app.testMode ? `
    <div class="card" style="max-width:420px; margin:14px auto 0; text-align:center; border:2px dashed var(--accent-purple);">
      <h3 style="margin-bottom:10px;">🧪 Modo Prueba activo</h3>
      <p class="hint">Todos los niveles están desbloqueados para que revises el contenido y la dificultad.</p>
    </div>` : ''}
  </div>`;
}
// La ultima pregunta de un nivel 1-5 usa la dificultad del nivel siguiente (mini-jefe).
function miniBossLevelFor(level) { return Math.min(Number(level) + 1, 6); }
function generateUniqueQuestions(sc, level, n, excludeSet) {
  const questions = [];
  const usedPrompts = new Set();
  const hasMiniBoss = level !== 'boss' && sc.levels.includes('boss');
  for (let i = 0; i < n; i++) {
    const isLast = i === n - 1;
    const genLevel = (isLast && hasMiniBoss) ? miniBossLevelFor(level) : level;
    let q, tries = 0;
    do {
      q = sc.gen(genLevel);
      tries++;
    } while (tries < 25 && (usedPrompts.has(q.prompt) || excludeSet.has(q.prompt)));
    usedPrompts.add(q.prompt);
    q.topicId = sc.id;
    if (isLast && hasMiniBoss) q.isMiniBoss = true;
    questions.push(q);
  }
  return questions;
}
function onStartLevel(level) {
  const levelParam = level === 'boss' ? 'boss' : Number(level);
  const sc = SCENARIOS.find(s => s.id === app.currentScenario);
  const prog = getProgress(sc.id, levelParam);
  const excludeSet = new Set(prog.recentPrompts || []);
  if (sc.mode === 'worksheet') {
    const topics = sc.topicsFn();
    const questions = [];
    for (const t of topics) {
      for (let k = 0; k < sc.perTopic; k++) {
        let q, tries = 0;
        do { q = t.gen(levelParam); tries++; } while (tries < 15 && (excludeSet.has(q.prompt) || questions.some(x => x.prompt === q.prompt)));
        q.topicId = t.id; q.topicEmoji = t.emoji; q.topicName = t.name;
        q.rowAnswered = false; q.rowWrong = false; q.rowAttempts = 0; q.rowStartTime = Date.now();
        questions.push(q);
      }
    }
    app.session = { scenarioId: sc.id, level: levelParam, mode: 'worksheet', questions, records: [] };
    app.view = 'levelPlay';
    render();
    return;
  }
  const n = qCount(levelParam);
  const questions = generateUniqueQuestions(sc, levelParam, n, excludeSet);
  app.session = { scenarioId: sc.id, level: levelParam, questions, idx: 0, correct: 0, records: [], qStartTime: Date.now(), feedback: null, lastWrongIdx: null, attemptsForCurrent: 0, firstGivenAnswer: undefined, firstAttemptCorrect: false };
  app.view = 'levelPlay';
  render();
}
// Descarta la pregunta actual (sin penalizar) y genera una nueva del mismo tema/nivel.
function onChangeQuestion() {
  const s = app.session;
  const cur = s.questions[s.idx];
  const t = SCENARIOS.find(x => x.id === cur.topicId);
  const prog = getProgress(s.scenarioId, s.level);
  const exclude = new Set([...(prog.recentPrompts || []), ...s.questions.map(x => x.prompt)]);
  const genLevel = cur.isMiniBoss ? miniBossLevelFor(s.level) : s.level;
  let q, tries = 0;
  do { q = t.gen(genLevel); tries++; } while (tries < 25 && exclude.has(q.prompt));
  q.topicId = t.id;
  if (cur.isMiniBoss) q.isMiniBoss = true;
  s.questions[s.idx] = q;
  s.feedback = null; s.lastWrongIdx = null; s.attemptsForCurrent = 0; s.firstGivenAnswer = undefined; s.firstAttemptCorrect = false; s.qStartTime = Date.now();
  render();
}

// =====================================================================
// VISTA: JUGANDO UN NIVEL
// =====================================================================
function viewLevelPlay() {
  const s = app.session;
  if (s.mode === 'worksheet') return viewLevelPlayWorksheet();
  const sc = SCENARIOS.find(x => x.id === s.scenarioId);
  const q = s.questions[s.idx];
  const solved = s.feedback && s.feedback.status === 'correct';
  let answerHtml = '';
  if (q.type === 'ladder') {
    const doneRows = q.rows.map(r => `
      <div class="ladder-row">
        <span class="ladder-value">${r.value}</span>
        <span class="ladder-bar"><span class="ladder-divisor">${r.divisor}</span></span>
      </div>`).join('');
    const finished = q.stepIdx === q.sequence.length;
    const activeRow = finished
      ? `<div class="ladder-row ladder-final"><span class="ladder-value">1</span></div>`
      : `<div class="ladder-row ladder-active">
          <span class="ladder-value">${q.remaining}</span>
          <span class="ladder-bar">
            <input id="ladderDivisor" type="number" inputmode="numeric" placeholder="÷" onkeydown="if(event.key==='Enter') onSubmitLadderStep();" autofocus>
            <button class="btn small" onclick="onSubmitLadderStep()">✔</button>
          </span>
        </div>`;
    answerHtml = `<div class="ladder">${doneRows}${activeRow}</div>`;
  } else if (q.type === 'numeric') {
    answerHtml = `
      <input id="numAnswer" type="number" inputmode="numeric" ${solved ? 'disabled' : ''} placeholder="tu respuesta" onkeydown="if(event.key==='Enter') onSubmitAnswer();" autofocus>
      <button class="btn" ${solved ? 'disabled' : ''} onclick="onSubmitAnswer()">Responder</button>`;
  } else {
    const btns = q.options.map((opt, i) => {
      let cls = 'choice-btn';
      if (solved && i === q.correctIndex) cls += ' correct';
      else if (!solved && s.lastWrongIdx === i) cls += ' incorrect';
      return `<button class="${cls}" ${solved ? 'disabled' : ''} onclick="onSubmitAnswer(${i})">${esc(opt)}</button>`;
    }).join('');
    answerHtml = `<div class="choice-grid">${btns}</div>`;
  }
  const planeHtml = q.points ? `<div class="plane-wrap">${renderPlane(q.points, s.level === 1 || s.level === 2 ? 6 : 9, !!q.hidePointLabel)}</div>` : '';
  const fb = s.feedback;
  let feedbackHtml = '<div class="feedback"></div>';
  if (fb && fb.status === 'correct') feedbackHtml = `<div class="feedback ok">¡Correcto! 🎉</div>`;
  else if (fb && fb.status === 'wrong') feedbackHtml = `<div class="feedback bad">❌ No es correcto, ¡intenta de nuevo!</div>`;
  const nextBtn = solved ? `<button class="btn green" onclick="onNextQuestion()">${s.idx === s.questions.length - 1 ? 'Ver resultados' : 'Siguiente'} →</button>` : '';
  const changeBtn = !solved ? `<button class="btn secondary" onclick="onChangeQuestion()">🔁 Cambiar cuenta</button>` : '';
  const miniBossBadge = q.isMiniBoss ? `<div class="pill" style="background:var(--accent-purple); margin-bottom:8px; display:inline-block;">💀 ¡Desafío extra! Esta pregunta es más difícil</div>` : '';
  return `
  <div class="content">
    <div class="play-wrap">
      <div class="play-progress">
        <span>${sc.emoji} ${esc(sc.name)} · ${levelLabel(s.level)}</span>
        <span>Pregunta ${s.idx + 1} / ${s.questions.length}</span>
      </div>
      ${miniBossBadge}
      <div class="question-box">${q.prompt}</div>
      ${planeHtml}
      <div class="answer-area">
        ${answerHtml}
        ${feedbackHtml}
        ${nextBtn}
        ${changeBtn}
      </div>
    </div>
  </div>`;
}
function onSubmitAnswer(choiceIdx) {
  const s = app.session;
  if (s.feedback && s.feedback.status === 'correct') return;
  const q = s.questions[s.idx];
  let isCorrect = false, given;
  if (q.type === 'numeric') {
    const el = document.getElementById('numAnswer');
    const raw = el ? el.value : '';
    given = raw === '' ? null : Number(raw);
    isCorrect = given !== null && given === q.answer;
  } else {
    given = q.options[choiceIdx];
    isCorrect = choiceIdx === q.correctIndex;
    s.lastWrongIdx = isCorrect ? null : choiceIdx;
  }
  if (s.attemptsForCurrent === 0) { s.firstGivenAnswer = given; s.firstAttemptCorrect = isCorrect; }
  s.attemptsForCurrent++;
  if (isCorrect) {
    const timeMs = Date.now() - s.qStartTime;
    if (s.firstAttemptCorrect) s.correct++;
    s.records.push({
      prompt: q.prompt,
      correctAnswer: q.type === 'numeric' ? q.answer : q.options[q.correctIndex],
      givenAnswer: s.firstGivenAnswer,
      isCorrect: s.firstAttemptCorrect,
      attempts: s.attemptsForCurrent,
      timeMs,
    });
    s.feedback = { status: 'correct' };
  } else {
    s.feedback = { status: 'wrong' };
  }
  render();
}
// Escalerita de Numeros Primos: se envia un divisor por vez, sin revelar el correcto si falla.
function onSubmitLadderStep() {
  const s = app.session;
  const q = s.questions[s.idx];
  if (q.stepIdx >= q.sequence.length) return;
  const el = document.getElementById('ladderDivisor');
  const raw = el ? el.value : '';
  if (raw === '') return;
  const given = Number(raw);
  const expected = q.sequence[q.stepIdx];
  if (given === expected) {
    q.rows.push({ value: q.remaining, divisor: given });
    q.remaining = q.remaining / given;
    q.stepIdx++;
    s.feedback = null;
    if (q.stepIdx === q.sequence.length) {
      const timeMs = Date.now() - s.qStartTime;
      const correctStr = fmtFactorization(collapseSequence(q.sequence));
      const firstTry = q.wrongAttempts === 0;
      if (firstTry) s.correct++;
      s.records.push({
        prompt: q.prompt,
        correctAnswer: correctStr,
        givenAnswer: correctStr,
        isCorrect: firstTry,
        attempts: q.wrongAttempts + q.sequence.length,
        timeMs,
      });
      s.feedback = { status: 'correct' };
    }
  } else {
    q.wrongAttempts++;
    s.feedback = { status: 'wrong' };
  }
  render();
}
async function onNextQuestion() {
  const s = app.session;
  if (s.idx < s.questions.length - 1) {
    s.idx++; s.feedback = null; s.lastWrongIdx = null; s.attemptsForCurrent = 0; s.firstGivenAnswer = undefined; s.firstAttemptCorrect = false; s.qStartTime = Date.now();
    render();
  } else {
    await finishLevel();
  }
}

// =====================================================================
// VISTA: HOJA DE PARCIALES (worksheet - todos los ejercicios juntos)
// =====================================================================
function viewLevelPlayWorksheet() {
  const s = app.session;
  const sc = SCENARIOS.find(x => x.id === s.scenarioId);
  const answeredCount = s.questions.filter(q => q.rowAnswered).length;
  let lastTopic = null;
  const rows = s.questions.map((q, idx) => {
    let groupHeader = '';
    if (q.topicId !== lastTopic) {
      lastTopic = q.topicId;
      groupHeader = `<div class="ws-group-header">${q.topicEmoji} ${esc(q.topicName)}</div>`;
    }
    let inputHtml;
    if (q.rowAnswered) {
      inputHtml = `<span class="ws-answered">✅</span>`;
    } else if (q.type === 'numeric') {
      inputHtml = `
        <input id="ws_${idx}" type="number" inputmode="numeric" class="${q.rowWrong ? 'ws-wrong' : ''}" placeholder="?" onkeydown="if(event.key==='Enter'){ onConfirmRow(${idx}); }">
        <button class="btn small" onclick="onConfirmRow(${idx})">✔</button>
        <button class="btn small secondary" onclick="onChangeWorksheetRow(${idx})">🔁</button>`;
    } else {
      const opts = q.options.map((opt, i) => `<option value="${i}">${esc(opt)}</option>`).join('');
      inputHtml = `
        <select id="ws_${idx}" class="${q.rowWrong ? 'ws-wrong' : ''}"><option value="">Elegí...</option>${opts}</select>
        <button class="btn small" onclick="onConfirmRow(${idx})">✔</button>
        <button class="btn small secondary" onclick="onChangeWorksheetRow(${idx})">🔁</button>`;
    }
    return `${groupHeader}
    <div class="ws-row ${q.rowAnswered ? 'ws-row-done' : ''}">
      <div class="ws-prompt">${idx + 1}. ${q.prompt} = </div>
      <div class="ws-input">${inputHtml}</div>
    </div>`;
  }).join('');
  return `
  <div class="content">
    <div class="play-wrap" style="max-width:720px;">
      <div class="play-progress">
        <span>${sc.emoji} ${esc(sc.name)} · ${levelLabel(s.level)}</span>
        <span>${answeredCount} / ${s.questions.length} confirmados</span>
      </div>
      <p class="hint">Resolvé cada ejercicio y escribí el resultado al lado del "=". Apretá ✔ para confirmarlo. Si te equivocás no pasa nada, podés reintentar las veces que quieras (el resultado nunca se revela). Con 🔁 podés cambiar un ejercicio por otro del mismo tema.</p>
      <div class="worksheet">${rows}</div>
    </div>
  </div>`;
}
async function onConfirmRow(idx) {
  const s = app.session;
  const q = s.questions[idx];
  if (q.rowAnswered) return;
  const el = document.getElementById('ws_' + idx);
  const raw = el ? el.value : '';
  if (raw === '') return;
  let isCorrect = false, given;
  if (q.type === 'numeric') {
    given = Number(raw);
    isCorrect = given === q.answer;
  } else {
    const choiceIdx = Number(raw);
    given = q.options[choiceIdx];
    isCorrect = choiceIdx === q.correctIndex;
  }
  q.rowAttempts++;
  if (isCorrect) {
    q.rowAnswered = true;
    q.rowWrong = false;
    const timeMs = Date.now() - q.rowStartTime;
    s.records.push({
      prompt: q.prompt,
      correctAnswer: q.type === 'numeric' ? q.answer : q.options[q.correctIndex],
      givenAnswer: given,
      isCorrect: q.rowAttempts === 1,
      attempts: q.rowAttempts,
      timeMs,
    });
  } else {
    q.rowWrong = true;
  }
  render();
  if (s.questions.every(x => x.rowAnswered)) await finishLevel();
}
function onChangeWorksheetRow(idx) {
  const s = app.session;
  const cur = s.questions[idx];
  const t = findWorksheetTopic(cur.topicId);
  const exclude = new Set(s.questions.map(x => x.prompt));
  let q, tries = 0;
  do { q = t.gen(s.level); tries++; } while (tries < 25 && exclude.has(q.prompt));
  q.topicId = t.id; q.topicEmoji = t.emoji; q.topicName = t.name;
  q.rowAnswered = false; q.rowWrong = false; q.rowAttempts = 0; q.rowStartTime = Date.now();
  s.questions[idx] = q;
  render();
}

// =====================================================================
// FIN DE NIVEL
// =====================================================================
async function finishLevel() {
  const s = app.session;
  try {
    const result = await api('POST', '/api/level-result', {
      playerId: app.currentPlayer.id, playerName: app.currentPlayer.name,
      scenarioId: s.scenarioId, level: s.level, records: s.records,
    });
    app.lastResult = result;
    await refreshProgress();
    app.view = 'levelResults';
    render();
  } catch (e) {
    showToast('No se pudo guardar el resultado: ' + e.message);
    app.view = 'scenarioPath';
    render();
  }
}
function viewLevelResults() {
  const r = app.lastResult;
  const s = app.session;
  const sc = SCENARIOS.find(x => x.id === s.scenarioId);
  const medalHtml = r.earnedMedal ? `<div class="medal-badge" style="font-size:18px;">🏅 ¡Completaste "${esc(sc.name)}" al 100%! (medalla n.º ${r.medalCount})</div>` : '';
  return `
  <div class="content center-screen">
    <h2>${r.correct === r.total ? '🏆 ¡Nivel perfecto!' : '✅ ¡Nivel completado!'}</h2>
    <p class="subtitle">${sc.emoji} ${esc(sc.name)} · ${levelLabel(s.level)}</p>
    ${medalHtml}
    <div class="results-grid">
      <div class="stat-box"><div class="big">${r.correct}/${r.total}</div><div>Aciertos directos</div></div>
      <div class="stat-box"><div class="big">${r.effPct}%</div><div>Efectividad</div></div>
      <div class="stat-box"><div class="big">${fmtTime(r.totalTimeSec)}</div><div>Tiempo total</div></div>
      <div class="stat-box"><div class="big">${s.questions.length}</div><div>Ejercicios</div></div>
    </div>
    <div class="achv-row">
      <div class="achv ${r.earnedTime ? 'earned' : ''}"><div class="icon">⏱️</div><div>Velocidad</div><div class="hint">meta: ${r.cfg.timeSec}s</div></div>
      <div class="achv ${r.earnedEff ? 'earned' : ''}"><div class="icon">🎯</div><div>Efectividad</div><div class="hint">meta: ${r.cfg.effPct}%</div></div>
    </div>
    <div style="display:flex; gap:12px;">
      <button class="btn" onclick="onStartLevel('${s.level}')">🔄 Reintentar</button>
      <button class="btn secondary" onclick="app.view='scenarioPath'; render();">Volver al escenario</button>
    </div>
  </div>`;
}

// =====================================================================
// ADMIN DASHBOARD
// =====================================================================
async function enterAdmin(tab) {
  app.view = 'admin';
  app.adminTab = tab || app.adminTab || 'resumen';
  app.adminPlayerDetail = null;
  render();
  await loadAdminTabData(app.adminTab);
  render();
}
async function switchAdminTab(tab) {
  app.adminTab = tab; app.adminPlayerDetail = null;
  render();
  await loadAdminTabData(tab);
  render();
}
async function loadAdminTabData(tab) {
  try {
    if (tab === 'resumen') app.cache.summary = await api('GET', '/api/summary');
    else if (tab === 'jugadores') app.cache.playersAll = await api('GET', '/api/players/all');
    else if (tab === 'reporte') { app.cache.reportPlayers = await api('GET', '/api/players'); await loadReport(); }
    else if (tab === 'config') app.cache.config = await api('GET', '/api/config');
    else if (tab === 'usuarios') app.cache.adminUsers = await api('GET', '/api/admin/users');
  } catch (e) {
    showToast(e.message);
    if (e.status === 401) onLogout();
  }
}
function viewAdmin() {
  const tabs = [
    ['resumen', '📊 Resumen'], ['jugadores', '👥 Jugadores'], ['reporte', '📋 Reporte'], ['config', '⚙️ Configuración'], ['usuarios', '🔑 Administradores'],
  ];
  const tabBtns = tabs.map(([id, label]) => `<button class="tab-btn ${app.adminTab === id ? 'active' : ''}" onclick="switchAdminTab('${id}')">${label}</button>`).join('');
  let body = '';
  if (app.adminTab === 'resumen') body = adminResumen();
  else if (app.adminTab === 'jugadores') body = adminJugadores();
  else if (app.adminTab === 'reporte') body = adminReporte();
  else if (app.adminTab === 'config') body = adminConfig();
  else if (app.adminTab === 'usuarios') body = adminUsuarios();
  return `
  <div class="content">
    <h2>🛠️ Panel de Administración</h2>
    <div class="tabs">${tabBtns}</div>
    <div class="card">${body}</div>
  </div>`;
}
function adminResumen() {
  const s = app.cache.summary;
  if (!s) return '<div class="loading">Cargando resumen...</div>';
  const globalEff = s.totalAttempts ? Math.round((s.totalCorrect / s.totalAttempts) * 100) : 0;
  const totalTimeMin = Math.round(s.totalTimeMs / 60000);
  const bars = SCENARIOS.map(sc => {
    const row = s.byScenario.find(b => b.scenarioId === sc.id);
    const eff = row && row.total ? Math.round((row.correct / row.total) * 100) : 0;
    return `<div class="bar-row"><div class="label">${sc.emoji} ${esc(sc.name)}</div><div class="bar-bg"><div class="bar-fg" style="width:${eff}%"></div></div><span>${row && row.total ? eff + '%' : 'sin datos'}</span></div>`;
  }).join('');
  return `
  <div class="cfg-section" style="margin-bottom:20px;">
    <h3>🧪 Modo Prueba (jugar como admin)</h3>
    <p class="hint">Entrá como jugador de prueba para revisar el contenido y la dificultad de cada nivel, incluido el Jefe final de cada escenario, sin afectar el progreso ni los reportes de tu hijo.</p>
    <button class="btn purple" onclick="onEnterTestMode()">🧪 Entrar en modo prueba</button>
  </div>
  <div class="cfg-section" style="margin-bottom:20px;">
    <h3>⬇️ Exportar datos</h3>
    <p class="hint">Descarga un respaldo completo de todos los jugadores, progreso y reportes en un archivo JSON.</p>
    <button class="btn purple" onclick="onExportData()">⬇️ Exportar datos (backup)</button>
  </div>
  <div class="stat-cards">
    <div class="stat-box"><div class="big">${s.totalPlayers}</div><div>Jugadores</div></div>
    <div class="stat-box"><div class="big">${s.totalAttempts}</div><div>Ejercicios resueltos</div></div>
    <div class="stat-box"><div class="big">${globalEff}%</div><div>Efectividad global</div></div>
    <div class="stat-box"><div class="big">${totalTimeMin}m</div><div>Tiempo total practicado</div></div>
  </div>
  <h3>Efectividad por escenario</h3>
  ${bars}`;
}
async function onExportData() {
  try {
    const data = await api('GET', '/api/export');
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `mathcrash_backup_${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    URL.revokeObjectURL(url);
  } catch (e) { showToast(e.message); }
}

// ---- Modo prueba ----
async function onEnterTestMode() {
  try {
    const tp = await api('POST', '/api/players/test-account', {});
    app.currentPlayer = tp;
    app.testMode = true;
    await enterWorldMap();
  } catch (e) { showToast(e.message); }
}
async function onExitTestMode() {
  app.testMode = false;
  app.currentPlayer = null;
  await enterAdmin('resumen');
}
async function onSkipToBoss() {
  try {
    for (const lv of [1, 2, 3, 4, 5]) {
      await api('POST', '/api/skip-level', { playerId: app.currentPlayer.id, scenarioId: app.currentScenario, level: lv });
    }
    await refreshProgress();
    onStartLevel('boss');
  } catch (e) { showToast(e.message); }
}

// ---- Jugadores ----
function adminJugadores() {
  if (app.adminPlayerDetail) return adminPlayerDetailView();
  const list = app.cache.playersAll;
  if (!list) return '<div class="loading">Cargando jugadores...</div>';
  const real = list.filter(p => !p.isTestAccount);
  const totalLevels = SCENARIOS.reduce((a, sc) => a + sc.levels.length, 0);
  const selectOpts = real.map(p => `<option value="${p.id}">${p.avatar} ${esc(p.name)}</option>`).join('');
  const rows = real.map(p => `<tr>
      <td>${p.avatar} ${esc(p.name)}</td>
      <td>${p.completedLevels}/${totalLevels} niveles</td>
      <td>${p.attemptsCount} ejercicios</td>
      <td><a class="linklike" onclick="openPlayerDetail('${p.id}')">Ver detalle</a></td>
      <td><a class="linklike" onclick="onDeletePlayer('${p.id}')">Eliminar</a></td>
    </tr>`).join('');
  return `
  <div class="cfg-section" style="margin-bottom:18px;">
    <h3>🔎 Ver datos de un jugador específico</h3>
    <p class="hint">Elegí un jugador para ver solo su información: efectividad, tiempo practicado y progreso por nivel, de forma independiente del resto.</p>
    <div class="filters" style="align-items:center;">
      <select id="quickPlayerSelect">${selectOpts || '<option value="">(sin jugadores todavía)</option>'}</select>
      <button class="btn purple" ${real.length === 0 ? 'disabled' : ''} onclick="openPlayerDetail(document.getElementById('quickPlayerSelect').value)">👁️ Ver datos de este jugador</button>
    </div>
  </div>
  <div style="margin-bottom:14px;"><button class="btn green" onclick="app.postCreateReturnToAdmin=true; app.view='playerCreate'; app.tempError=''; render();">+ Crear jugador</button></div>
  <div class="table-wrap"><table>
    <thead><tr><th>Jugador</th><th>Progreso</th><th>Actividad</th><th></th><th></th></tr></thead>
    <tbody>${rows || '<tr><td colspan="5">No hay jugadores todavía.</td></tr>'}</tbody>
  </table></div>`;
}
async function onDeletePlayer(id) {
  if (!confirm('¿Eliminar este jugador y todo su progreso?')) return;
  try {
    await api('DELETE', `/api/players/${id}`);
    app.cache.playersAll = await api('GET', '/api/players/all');
    render();
  } catch (e) { showToast(e.message); }
}
async function openPlayerDetail(pid) {
  if (!pid) return;
  app.adminPlayerDetail = pid;
  render();
  try {
    const [summary, progress, medals] = await Promise.all([
      api('GET', `/api/players/${pid}/summary`),
      api('GET', `/api/progress/${pid}`),
      api('GET', `/api/medals/${pid}`),
    ]);
    app.cache.playerDetail = { pid, summary, progress, medals };
  } catch (e) { showToast(e.message); }
  render();
}
function adminPlayerDetailView() {
  const d = app.cache.playerDetail;
  if (!d || d.pid !== app.adminPlayerDetail) return '<div class="loading">Cargando datos del jugador...</div>';
  const list = app.cache.playersAll || [];
  const p = list.find(x => x.id === d.pid);
  if (!p) { app.adminPlayerDetail = null; return adminJugadores(); }
  const totalAttempts = d.summary.totalAttempts;
  const eff = totalAttempts ? Math.round((d.summary.totalCorrect / totalAttempts) * 100) : 0;
  const totalTimeMin = Math.round(d.summary.totalTimeMs / 60000);
  const bars = SCENARIOS.map(sc => {
    const row = d.summary.byScenario.find(b => b.scenarioId === sc.id);
    const e = row && row.total ? Math.round((row.correct / row.total) * 100) : 0;
    return `<div class="bar-row"><div class="label">${sc.emoji} ${esc(sc.name)}</div><div class="bar-bg"><div class="bar-fg" style="width:${e}%"></div></div><span>${row && row.total ? e + '%' : 'sin datos'}</span></div>`;
  }).join('');
  const rows = SCENARIOS.map(sc => {
    const cells = LEVELS.map(lv => {
      if (!sc.levels.includes(lv)) return `<td style="text-align:center; color:var(--text-dim);">—</td>`;
      const prog = (d.progress[sc.id] || {})[String(lv)];
      const badges = prog ? (prog.achievements.time ? '⏱️' : '') + (prog.achievements.eff ? '🎯' : '') : '';
      return `<td style="text-align:center;">${prog && prog.completed ? `${prog.bestEff}% / ${fmtTime(prog.bestTimeSec)} ${badges}` : '—'}</td>`;
    }).join('');
    const medalCount = (d.medals || {})[sc.id] || 0;
    const medalCell = `<td style="text-align:center;">${medalCount > 0 ? `🏅×${medalCount}` : '—'}</td>`;
    return `<tr><td>${sc.emoji} ${esc(sc.name)}</td>${cells}${medalCell}</tr>`;
  }).join('');
  const header = LEVELS.map(lv => `<th>${levelLabel(lv)}</th>`).join('') + '<th>Medallas</th>';
  return `
  <a class="linklike" onclick="app.adminPlayerDetail=null; render();">&larr; Volver a jugadores</a>
  <h3 style="margin-top:14px;">${p.avatar} ${esc(p.name)}</h3>
  <div class="stat-cards">
    <div class="stat-box"><div class="big">${totalAttempts}</div><div>Ejercicios resueltos</div></div>
    <div class="stat-box"><div class="big">${eff}%</div><div>Efectividad (1er intento)</div></div>
    <div class="stat-box"><div class="big">${totalTimeMin}m</div><div>Tiempo practicado</div></div>
  </div>
  <h3>Efectividad por escenario</h3>
  ${bars}
  <h3 style="margin-top:22px;">Progreso por nivel</h3>
  <div class="table-wrap"><table><thead><tr><th>Escenario</th>${header}</tr></thead><tbody>${rows}</tbody></table></div>
  <button class="btn secondary" style="margin-top:16px;" onclick="app.adminPlayerDetail=null; app.reportFilter={player:'${d.pid}', scenario:'all', level:'all'}; switchAdminTab('reporte');">📋 Ver reporte detallado de ${esc(p.name)}</button>`;
}

// ---- Reporte ----
async function loadReport() {
  const f = app.reportFilter;
  const qs = new URLSearchParams({ player: f.player, scenario: f.scenario, level: f.level }).toString();
  app.cache.report = await api('GET', `/api/report?${qs}`);
}
async function onReportFilterChange(field, value) {
  app.reportFilter[field] = value;
  render();
  try { await loadReport(); } catch (e) { showToast(e.message); }
  render();
}
function adminReporte() {
  const rows = app.cache.report;
  const players = app.cache.reportPlayers || [];
  const f = app.reportFilter;
  const playerOpts = players.map(p => `<option value="${p.id}" ${f.player === p.id ? 'selected' : ''}>${esc(p.name)}</option>`).join('');
  const scOpts = SCENARIOS.map(sc => `<option value="${sc.id}" ${f.scenario === sc.id ? 'selected' : ''}>${esc(sc.name)}</option>`).join('');
  const lvOpts = LEVELS.map(lv => `<option value="${lv}" ${f.level === String(lv) ? 'selected' : ''}>${levelLabel(lv)}</option>`).join('');
  const filtersHtml = `
  <div class="filters">
    <select onchange="onReportFilterChange('player', this.value)"><option value="all">Todos los jugadores</option>${playerOpts}</select>
    <select onchange="onReportFilterChange('scenario', this.value)"><option value="all">Todos los escenarios</option>${scOpts}</select>
    <select onchange="onReportFilterChange('level', this.value)"><option value="all">Todos los niveles</option>${lvOpts}</select>
  </div>`;
  if (!rows) return filtersHtml + '<div class="loading">Cargando reporte...</div>';
  const trs = rows.map(a => {
    const sc = SCENARIOS.find(s => s.id === a.scenarioId);
    return `<tr>
      <td>${fmtDate(a.timestamp)}</td>
      <td>${esc(a.playerName)}</td>
      <td>${sc ? sc.emoji : ''} ${sc ? esc(sc.name) : a.scenarioId}</td>
      <td>${levelLabel(a.level)}</td>
      <td>${esc(a.prompt)}</td>
      <td>${esc(String(a.givenAnswer))}</td>
      <td>${esc(String(a.correctAnswer))}</td>
      <td>${a.isCorrect ? '<span class="pill ok">1er intento</span>' : '<span class="pill bad">Con reintentos</span>'}</td>
      <td>${a.attempts || 1}</td>
      <td>${(a.timeMs / 1000).toFixed(1)}s</td>
    </tr>`;
  }).join('');
  return `
  ${filtersHtml}
  <p class="hint">Mostrando ${rows.length} registros (más recientes primero). "1er intento" significa que acertó sin errores; "Con reintentos" significa que falló una o más veces antes de acertar.</p>
  <div class="table-wrap"><table>
    <thead><tr><th>Fecha</th><th>Jugador</th><th>Escenario</th><th>Nivel</th><th>Ejercicio</th><th>Respuesta dada</th><th>Correcta</th><th>Resultado</th><th>Intentos</th><th>Tiempo</th></tr></thead>
    <tbody>${trs || '<tr><td colspan="10">Sin registros.</td></tr>'}</tbody>
  </table></div>`;
}

// ---- Configuracion ----
function adminConfig() {
  const cfg = app.cache.config;
  if (!cfg) return '<div class="loading">Cargando configuración...</div>';
  const sections = SCENARIOS.map(sc => {
    const rows = sc.levels.map(lv => {
      const c = (cfg[sc.id] && cfg[sc.id][String(lv)]) || { effPct: 75, timeSec: levelQuestionCount(sc, lv) * 25 };
      return `<div class="cfg-row">
        <div>${levelLabel(lv)}</div>
        <div class="badge-count">${levelQuestionCount(sc, lv)} ejercicios</div>
        <div>🎯 Efectividad % <input type="number" min="0" max="100" id="eff_${sc.id}_${lv}" value="${c.effPct}"></div>
        <div>⏱️ Tiempo (seg) <input type="number" min="1" id="time_${sc.id}_${lv}" value="${c.timeSec}"></div>
      </div>`;
    }).join('');
    return `<div class="cfg-section"><h3>${sc.emoji} ${esc(sc.name)}</h3>${rows}</div>`;
  }).join('');
  return `
  <p class="hint">Define el % de efectividad y el tiempo máximo (segundos) requeridos para ganar cada logro, por escenario y nivel.</p>
  ${sections}
  <button class="btn green" onclick="onSaveConfig()">💾 Guardar cambios</button>
  <span id="cfgSavedMsg" class="hint"></span>`;
}
async function onSaveConfig() {
  const payload = {};
  for (const sc of SCENARIOS) {
    payload[sc.id] = {};
    for (const lv of sc.levels) {
      const effEl = document.getElementById(`eff_${sc.id}_${lv}`);
      const timeEl = document.getElementById(`time_${sc.id}_${lv}`);
      const eff = Math.max(0, Math.min(100, Number(effEl.value) || 0));
      const time = Math.max(1, Number(timeEl.value) || 1);
      payload[sc.id][lv] = { effPct: eff, timeSec: time };
    }
  }
  try {
    await api('PUT', '/api/config', payload);
    app.cache.config = await api('GET', '/api/config');
    render();
    const msg = document.getElementById('cfgSavedMsg');
    if (msg) msg.textContent = '✅ Guardado';
  } catch (e) { showToast(e.message); }
}

// ---- Administradores ----
function adminUsuarios() {
  const admins = app.cache.adminUsers;
  if (!admins) return '<div class="loading">Cargando administradores...</div>';
  const rows = admins.map(u => `
    <tr>
      <td>${esc(u.name)}</td>
      <td>${esc(u.username)}</td>
      <td>${u.id === (app.currentUser && app.currentUser.id) ? '<span class="pill ok">Sesión actual</span>' : ''}</td>
      <td>${admins.length > 1 ? `<a class="linklike" onclick="onDeleteAdminUser('${u.id}')">Eliminar</a>` : '<span class="hint">no se puede eliminar el único admin</span>'}</td>
    </tr>`).join('');
  return `
  <h3>Cuentas de administrador</h3>
  <div class="table-wrap"><table>
    <thead><tr><th>Nombre</th><th>Usuario</th><th></th><th></th></tr></thead>
    <tbody>${rows || '<tr><td colspan="4">No hay administradores.</td></tr>'}</tbody>
  </table></div>
  <h3 style="margin-top:22px;">Crear nuevo administrador</h3>
  <div class="form-field"><label>Nombre</label><input id="newAdminName" placeholder="Ej: Mamá"></div>
  <div class="form-field"><label>Usuario</label><input id="newAdminUser" placeholder="usuario"></div>
  <div class="form-field"><label>Contraseña</label><input id="newAdminPass" type="password" placeholder="mínimo 4 caracteres"></div>
  <div class="error-msg" id="newAdminErr"></div>
  <button class="btn green" onclick="onCreateAdminUser()">+ Crear administrador</button>`;
}
async function onCreateAdminUser() {
  const name = document.getElementById('newAdminName').value.trim();
  const username = document.getElementById('newAdminUser').value.trim();
  const password = document.getElementById('newAdminPass').value;
  const errEl = document.getElementById('newAdminErr');
  try {
    await api('POST', '/api/admin/users', { name, username, password });
    app.cache.adminUsers = await api('GET', '/api/admin/users');
    errEl.textContent = '';
    render();
  } catch (e) { errEl.textContent = e.message; }
}
async function onDeleteAdminUser(id) {
  if (!confirm('¿Eliminar esta cuenta de administrador?')) return;
  try {
    const r = await api('DELETE', `/api/admin/users/${id}`);
    if (r.wasSelf) { onLogout(); return; }
    app.cache.adminUsers = await api('GET', '/api/admin/users');
    render();
  } catch (e) { showToast(e.message); }
}

// =====================================================================
// LOGOUT / RENDER PRINCIPAL
// =====================================================================
function onLogout() {
  setAdminToken(null); setAdminUser(null);
  app = {
    view: 'role', currentUser: null, currentPlayer: null, currentScenario: null, session: null,
    adminTab: 'resumen', adminPlayerDetail: null, reportFilter: { player: 'all', scenario: 'all', level: 'all' },
    tempError: '', testMode: false, freeLevelPick: 1, postCreateReturnToAdmin: false,
    cache: {}, progressCache: {}, medalsCache: {},
  };
  render();
}
function topbar() {
  if (app.view === 'role') return '';
  let who = '';
  if (app.testMode) who = `🧪 Modo Prueba — ${esc(app.currentPlayer.name)}`;
  else if (app.currentUser) who = `🛠️ ${esc(app.currentUser.name)}`;
  else if (app.currentPlayer) who = `${app.currentPlayer.avatar} ${esc(app.currentPlayer.name)}`;
  const testModeBtn = app.testMode ? `<button class="btn secondary" onclick="onExitTestMode()">🛠️ Volver al panel admin</button>` : '';
  return `
  <div class="topbar">
    <div class="brand">🚀 MATH CRASH</div>
    <div class="who"><span>${who}</span>${testModeBtn}<button class="btn danger" onclick="onLogout()">Salir</button></div>
  </div>`;
}
function render() {
  let body = '';
  if (app.view === 'role') body = viewRoleSelect();
  else if (app.view === 'adminLogin') body = viewAdminLogin();
  else if (app.view === 'playerSelect') body = viewPlayerSelect();
  else if (app.view === 'playerCreate') body = viewPlayerCreate();
  else if (app.view === 'worldMap') body = viewWorldMap();
  else if (app.view === 'scenarioPath') body = viewScenarioPath();
  else if (app.view === 'levelPlay') body = viewLevelPlay();
  else if (app.view === 'levelResults') body = viewLevelResults();
  else if (app.view === 'admin') body = viewAdmin();
  root.innerHTML = topbar() + body;
}

// =====================================================================
// INIT
// =====================================================================
function __mcGetApp() { return app; } // utilidad interna de depuracion (no visible para el usuario)
function __mcGetGenerators() { return { genPrimosQuick, genPrimosLadder, genRaizCuadradaSimple, genRaizCubicaSimple, findTopic, findWorksheetTopic, SCENARIOS, REPASO_TOPICS }; } // utilidad interna de depuracion
render();
