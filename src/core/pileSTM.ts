// Método de puntales y tirantes (ACI 318-19, cap. 23) para cabezales sobre pilotes, con una o varias columnas.
// Unidades: kN, m, MPa.
//
// Modelo espacial:
//  · un nudo superior por columna (en su centroide, a la profundidad del nodo hidrostático) y un nudo inferior por
//    pilote (al nivel del acero inferior);
//  · cada reacción de pilote se reparte entre las columnas (αik ≥ 0) de modo que cada columna recibe su carga y su
//    momento (equilibrio de cada nudo superior) con la mínima trayectoria de carga Σ αik²·(lik² + z²);
//  · si ese reparto no existe (p. ej. una columna fuera del grupo de pilotes), se reparte solo la carga vertical y la
//    fuerza horizontal que queda en los nudos superiores se lleva con cordones horizontales entre columnas
//    (tirante superior o puntal superior);
//  · en cada nudo de pilote las componentes horizontales de los puntales se equilibran con los tirantes en X y en Y de
//    la banda de pilotes que pasa por él; la fuerza de cada tramo de tirante sale del equilibrio de los nudos.
import { Pt } from './geometry';

export interface StmColumn {
  name: string;
  x: number;
  y: number;
  /** área de la sección y dimensiones de la caja envolvente, m², m */
  A: number;
  wx: number;
  wy: number;
}

export interface StmArgs {
  pts: Pt[];
  /** reacciones últimas de los pilotes (solo cargas de las columnas) y cargas de cada columna por combinación; Mbx/Mby = momento en el plano de los pilotes */
  combos: { name: string; R: number[]; cols: { P: number; Mbx: number; Mby: number }[] }[];
  cols: StmColumn[];
  Dp: number;
  /** área de apoyo de cada pilote en el cabezal, m² */
  Apile: number;
  rect: { x0: number; x1: number; y0: number; y1: number; B: number; L: number };
  h: number;
  dX: number;
  dY: number;
  /** acero inferior colocado, cm²/m, en las barras X y Y */
  asX: number;
  asY: number;
  /** acero superior colocado, cm²/m (0 si no hay) */
  asTopX?: number;
  asTopY?: number;
  fc: number;
  fy: number;
  lambda: number;
  crackMesh: boolean;
  cover: number;
  dbX: number;
  dbY: number;
}

export interface StmStrut {
  /** pilote */
  i: number;
  /** columna */
  k: number;
  /** componente vertical que lleva el puntal (parte de la reacción del pilote que va a la columna k), kN */
  R: number;
  l: number;
  theta: number;
  C: number;
  AcsCol: number;
  AcsPile: number;
  phiFns: number;
  ratio: number;
  nodeColStress: number;
  nodePileStress: number;
}
/** Tirante (o puntal) inferior entre dos nudos de pilote, a nivel del acero inferior (F > 0 tracción). */
export interface StmBottomTie {
  a: number;
  b: number;
  F: number;
  /** dirección y longitud del elemento */
  ux: number;
  uy: number;
  L: number;
  /** ancho de la banda de acero y acero efectivo en la dirección del tirante (parrilla ortogonal), cm² */
  width: number;
  asProv: number;
  cap: number;
  ratio: number;
  axis: 'x' | 'y';
}
export interface StmTie {
  axis: 'x' | 'y';
  /** suma de las tracciones de los tirantes inferiores orientados en este eje, kN */
  T: number;
  /** índices en StmResult.ties */
  members: number[];
  AsReq: number;
  ratio: number;
}
/** Cordón horizontal superior entre dos columnas (F > 0 tracción). */
export interface StmTopChord {
  a: number;
  b: number;
  F: number;
  width: number;
  cap: number;
  ratio: number;
}
export interface StmResult {
  combo: string;
  zx: number;
  zy: number;
  z: number;
  /** profundidad del bloque de compresión por flexión y del nodo superior (hidrostático), m */
  ax: number;
  ay: number;
  hTie: number;
  hNode: number;
  struts: StmStrut[];
  /** tirantes inferiores entre pilotes vecinos */
  ties: StmBottomTie[];
  tieX: StmTie;
  tieY: StmTie;
  /** nudos superiores (columnas) con su carga en la combinación gobernante; (nx, ny) = punto de aplicación de la
   *  resultante de la columna (centroide desplazado M/P), donde se ubica el nudo */
  cols: { name: string; x: number; y: number; P: number; nx: number; ny: number }[];
  /** empuje horizontal de los puntales en cada nudo de pilote (hacia afuera), kN */
  thrust: { hx: number; hy: number }[];
  topChords: StmTopChord[];
  /** true si cada nudo de columna quedó en equilibrio solo con sus puntales (sin cordones superiores) */
  balanced: boolean;
  /** fuerza horizontal que no se pudo equilibrar en los nudos superiores o inferiores, kN */
  unbalanced: number;
  fce: number;
  betaS: number;
  betaNPile: number;
  nodeColLimit: number;
  nodePileLimit: number;
  ratioStrut: number;
  ratioNodeCol: number;
  ratioNodePile: number;
  ratioTie: number;
  ratioTop: number;
  ratio: number;
  uplift: boolean;
  /** relación a/d (luz de cortante) */
  aOverD: number;
  deep: boolean;
}

const PHI = 0.75;

/**
 * Red de tirantes inferiores: pares de pilotes vecinos (grafo de Gabriel: ningún otro pilote dentro ni sobre el
 * círculo de diámetro ij) más los lados del contorno convexo que no pasan por otro pilote.
 */
export function pileTieGraph(pts: Pt[]): [number, number][] {
  const n = pts.length;
  const out: [number, number][] = [];
  const has = new Set<string>();
  const add = (i: number, j: number) => { const k = i < j ? `${i}-${j}` : `${j}-${i}`; if (!has.has(k)) { has.add(k); out.push(i < j ? [i, j] : [j, i]); } };
  for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) {
    const mx = (pts[i].x + pts[j].x) / 2, my = (pts[i].y + pts[j].y) / 2;
    const r = Math.hypot(pts[i].x - pts[j].x, pts[i].y - pts[j].y) / 2;
    if (r < 1e-9) continue;
    if (!pts.some((q, k) => k !== i && k !== j && Math.hypot(q.x - mx, q.y - my) <= r * (1 + 1e-6))) add(i, j);
  }
  // contorno convexo (envolvente de los pilotes)
  if (n >= 3) {
    const idx = pts.map((_, i) => i).sort((p, q) => pts[p].x - pts[q].x || pts[p].y - pts[q].y);
    const cross = (o: number, a: number, b: number) => (pts[a].x - pts[o].x) * (pts[b].y - pts[o].y) - (pts[a].y - pts[o].y) * (pts[b].x - pts[o].x);
    const lower: number[] = [], upper: number[] = [];
    for (const i of idx) { while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], i) <= 1e-12) lower.pop(); lower.push(i); }
    for (const i of [...idx].reverse()) { while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], i) <= 1e-12) upper.pop(); upper.push(i); }
    const hull = [...lower.slice(0, -1), ...upper.slice(0, -1)];
    for (let h = 0; h < hull.length; h++) {
      const i = hull[h], j = hull[(h + 1) % hull.length];
      const dx = pts[j].x - pts[i].x, dy = pts[j].y - pts[i].y, L2 = dx * dx + dy * dy;
      const through = pts.some((q, k) => {
        if (k === i || k === j) return false;
        const t = ((q.x - pts[i].x) * dx + (q.y - pts[i].y) * dy) / L2;
        return t > 1e-6 && t < 1 - 1e-6 && Math.abs((q.x - pts[i].x) * dy - (q.y - pts[i].y) * dx) / Math.sqrt(L2) < 1e-6;
      });
      if (!through) add(i, j);
    }
  }
  // rigidez: se agregan las barras más cortas (sin cruzar otras ni pasar por un pilote) hasta tener 2n − 3 barras
  // independientes; sin ellas un anillo es un mecanismo y no equilibra empujes no radiales
  const collinear = n < 3 || pts.every((q) => Math.abs((pts[1].x - pts[0].x) * (q.y - pts[0].y) - (pts[1].y - pts[0].y) * (q.x - pts[0].x)) < 1e-9);
  const target = collinear ? Math.max(n - 1, 0) : 2 * n - 3;
  const rowsOf = (i: number, j: number) => {
    const dx = pts[j].x - pts[i].x, dy = pts[j].y - pts[i].y, L = Math.hypot(dx, dy) || 1;
    const r = new Array(2 * n).fill(0);
    r[2 * i] = -dx / L; r[2 * i + 1] = -dy / L; r[2 * j] = dx / L; r[2 * j + 1] = dy / L;
    return r;
  };
  // base ortogonalizada (Gram–Schmidt) de las filas de la matriz de compatibilidad
  const basis: number[][] = [];
  const tryAdd = (r: number[]) => {
    const v = [...r];
    for (const b of basis) { const d = v.reduce((acc, x, k) => acc + x * b[k], 0); for (let k = 0; k < v.length; k++) v[k] -= d * b[k]; }
    const nv = Math.sqrt(v.reduce((acc, x) => acc + x * x, 0));
    if (nv < 1e-7) return false;
    basis.push(v.map((x) => x / nv));
    return true;
  };
  for (const [i, j] of out) tryAdd(rowsOf(i, j));
  if (basis.length < target) {
    const segX = (p1: Pt, p2: Pt, p3: Pt, p4: Pt) => {
      const d = (a: Pt, b: Pt, c: Pt) => (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
      return d(p1, p2, p3) * d(p1, p2, p4) < -1e-12 && d(p3, p4, p1) * d(p3, p4, p2) < -1e-12;
    };
    const cand: [number, number, number][] = [];
    for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) if (!has.has(`${i}-${j}`)) cand.push([i, j, Math.hypot(pts[i].x - pts[j].x, pts[i].y - pts[j].y)]);
    cand.sort((p, q) => p[2] - q[2]);
    for (const [i, j] of cand) {
      if (basis.length >= target) break;
      const dx = pts[j].x - pts[i].x, dy = pts[j].y - pts[i].y, L2 = dx * dx + dy * dy;
      const through = pts.some((q, k) => k !== i && k !== j && (() => { const t = ((q.x - pts[i].x) * dx + (q.y - pts[i].y) * dy) / L2; return t > 1e-6 && t < 1 - 1e-6 && Math.abs((q.x - pts[i].x) * dy - (q.y - pts[i].y) * dx) / Math.sqrt(L2) < 1e-6; })());
      if (through || out.some(([a, b]) => a !== i && a !== j && b !== i && b !== j && segX(pts[i], pts[j], pts[a], pts[b]))) continue;
      if (tryAdd(rowsOf(i, j))) add(i, j);
    }
  }
  return out;
}

/** Fuerzas en barras horizontales entre nudos (F > 0 tracción) que equilibran las fuerzas F0 aplicadas a cada nudo; mínimo Σ L·F². */
function planarTrussForces(nodes: Pt[], members: [number, number][], F0: { x: number; y: number }[]): { F: number[]; resid: number } {
  const ne = members.length;
  if (!ne) return { F: [], resid: Math.max(0, ...F0.map((f) => Math.hypot(f.x, f.y))) };
  const u = members.map(([a, b]) => {
    const dx = nodes[b].x - nodes[a].x, dy = nodes[b].y - nodes[a].y;
    const L = Math.hypot(dx, dy) || 1;
    return { ux: dx / L, uy: dy / L, L };
  });
  const rows: number[][] = [];
  const rhs: number[] = [];
  nodes.forEach((_, k) => {
    rows.push(members.map(([a, b], e) => (a === k ? u[e].ux : b === k ? -u[e].ux : 0)));
    rhs.push(-F0[k].x);
    rows.push(members.map(([a, b], e) => (a === k ? u[e].uy : b === k ? -u[e].uy : 0)));
    rhs.push(-F0[k].y);
  });
  const N = Array.from({ length: ne }, (_, p) => Array.from({ length: ne }, (_, q) => rows.reduce((acc, r) => acc + r[p] * r[q], 0) + (p === q ? 1e-9 * u[p].L : 0)));
  const g = Array.from({ length: ne }, (_, p) => rows.reduce((acc, r, j) => acc + r[p] * rhs[j], 0));
  const F = solveSym(N, g);
  let resid = 0;
  for (let k = 0; k < nodes.length; k++) {
    const rx = rows[2 * k].reduce((acc, c, e) => acc + c * F[e], 0) - rhs[2 * k];
    const ry = rows[2 * k + 1].reduce((acc, c, e) => acc + c * F[e], 0) - rhs[2 * k + 1];
    resid = Math.max(resid, Math.hypot(rx, ry));
  }
  return { F, resid };
}

/** Resuelve M·x = b (M simétrica semidefinida) por eliminación con pivoteo; las ecuaciones dependientes se omiten. */
export function solveSym(M: number[][], b: number[]): number[] {
  const n = b.length;
  const A = M.map((r, i) => [...r, b[i]]);
  const scale = Math.max(...M.map((r, i) => Math.abs(r[i])), 1e-30);
  const piv: number[] = new Array(n).fill(-1);
  const used = new Array(n).fill(false);
  for (let c = 0; c < n; c++) {
    let best = -1, bv = 1e-11 * scale;
    for (let r = 0; r < n; r++) if (!used[r] && Math.abs(A[r][c]) > bv) { bv = Math.abs(A[r][c]); best = r; }
    if (best < 0) continue;
    used[best] = true;
    piv[c] = best;
    for (let r = 0; r < n; r++) {
      if (r === best || A[r][c] === 0) continue;
      const f = A[r][c] / A[best][c];
      for (let j = c; j <= n; j++) A[r][j] -= f * A[best][j];
    }
  }
  return piv.map((r, c) => (r < 0 ? 0 : A[r][n] / A[r][c]));
}

/**
 * Reparto de mínima trayectoria de carga: min Σ v²/w  sujeto a  A·v = b,  v ≥ 0 donde nonneg (conjunto activo).
 * Devuelve null si no hay solución que cumpla las restricciones.
 */
function minLoadPath(A: number[][], b: number[], w: number[], nonneg?: boolean[]): number[] | null {
  const nv = w.length;
  const free = new Array(nv).fill(true);
  const bScale = Math.max(...b.map(Math.abs), 1e-9);
  let v = new Array(nv).fill(0);
  for (let it = 0; it <= nv; it++) {
    const rows = A.length;
    const M = Array.from({ length: rows }, () => new Array(rows).fill(0));
    for (let r = 0; r < rows; r++) for (let s = r; s < rows; s++) {
      let acc = 0;
      for (let j = 0; j < nv; j++) if (free[j]) acc += A[r][j] * w[j] * A[s][j];
      M[r][s] = acc;
      M[s][r] = acc;
    }
    const lam = solveSym(M, b);
    v = w.map((wj, j) => (free[j] ? wj * A.reduce((acc, row, r) => acc + row[j] * lam[r], 0) : 0));
    let worst = -1, wv = -1e-9 * bScale;
    v.forEach((x, j) => { if (free[j] && (nonneg?.[j] ?? true) && x < wv) { wv = x; worst = j; } });
    if (worst < 0) break;
    free[worst] = false;
  }
  v = v.map((x, j) => ((nonneg?.[j] ?? true) ? Math.max(x, 0) : x));
  const res = A.reduce((m, row, r) => Math.max(m, Math.abs(row.reduce((acc, a, j) => acc + a * v[j], 0) - b[r])), 0);
  return res <= 1e-6 * bScale ? v : null;
}

/**
 * Reparte las reacciones de los pilotes (Rp ≥ 0) entre las columnas (Pk ≥ 0, ΣPk = ΣRp) con la mínima trayectoria de
 * carga. Con momentos (Mb) se busca además el equilibrio de momentos de cada columna; si no es posible con αik ≥ 0, se
 * acepta el menor desequilibrio (que luego llevan los cordones superiores entre columnas).
 */
export function allocateStm(pts: Pt[], Rp: number[], cols: { x: number; y: number }[], P: number[], Mb: { x: number; y: number }[] | null, z: number): number[][] | null {
  const n = pts.length, m = cols.length;
  const alpha = pts.map(() => new Array(m).fill(0));
  if (m === 1) {
    pts.forEach((_, i) => { alpha[i][0] = Rp[i]; });
    return alpha;
  }
  const tol = 1e-9 * Math.max(...Rp, ...P, 1);
  const vars: { i: number; k: number }[] = [];
  for (let i = 0; i < n; i++) if (Rp[i] > tol) for (let k = 0; k < m; k++) if (P[k] > tol) vars.push({ i, k });
  if (!vars.length) return alpha;
  const piles = [...new Set(vars.map((q) => q.i))];
  const colsOn = [...new Set(vars.map((q) => q.k))];
  // variables: αik (≥ 0) y, si hay momentos, holguras libres de las ecuaciones de momento (muy penalizadas)
  const nMom = Mb ? 2 * colsOn.length : 0;
  const nv = vars.length + nMom;
  const A: number[][] = [];
  const b: number[] = [];
  const row = (f: (j: number) => number, slack = -1) => Array.from({ length: nv }, (_, j) => (j < vars.length ? f(j) : j - vars.length === slack ? 1 : 0));
  for (const i of piles) { A.push(row((j) => (vars[j].i === i ? 1 : 0))); b.push(Rp[i]); }
  for (const k of colsOn) { A.push(row((j) => (vars[j].k === k ? 1 : 0))); b.push(P[k]); }
  if (Mb) {
    colsOn.forEach((k, kk) => {
      A.push(row((j) => (vars[j].k === k ? pts[vars[j].i].x - cols[k].x : 0), 2 * kk)); b.push(Mb[k].y);
      A.push(row((j) => (vars[j].k === k ? pts[vars[j].i].y - cols[k].y : 0), 2 * kk + 1)); b.push(Mb[k].x);
    });
  }
  const w = [
    ...vars.map((q) => 1 / ((pts[q.i].x - cols[q.k].x) ** 2 + (pts[q.i].y - cols[q.k].y) ** 2 + z * z)),
    ...new Array(nMom).fill(1e-5),
  ];
  const nonneg = Array.from({ length: nv }, (_, j) => j < vars.length);
  let v = minLoadPath(A, b, w, nonneg);
  if (!v) return null;
  // depuración: se eliminan los puntales con fuerza despreciable (< 6 % de la reacción del pilote y de la carga de la
  // columna) y se vuelve a repartir, siempre que el equilibrio no empeore
  const imb = (x: number[]) => (Mb ? x.slice(vars.length).reduce((acc, t) => acc + Math.abs(t), 0) : 0);
  for (let pass = 0; pass < 4; pass++) {
    const small = vars.map((q, j) => v![j] > 0 && v![j] < 0.06 * Math.min(Rp[q.i], P[q.k]));
    if (!small.some(Boolean)) break;
    const keep = Array.from({ length: nv }, (_, j) => j >= vars.length || (!small[j] && v![j] > 0));
    const A2 = A.map((r) => r.filter((_, j) => keep[j]));
    const v2 = minLoadPath(A2, b, w.filter((_, j) => keep[j]), nonneg.filter((_, j) => keep[j]));
    if (!v2) break;
    let t = 0;
    const full = keep.map((kk) => (kk ? v2[t++] : 0));
    if (imb(full) > imb(v) + 1e-6 * Math.max(...b.map(Math.abs), 1)) break;
    v = full;
  }
  vars.forEach((q, j) => { alpha[q.i][q.k] = v![j]; });
  return alpha;
}

/** Fuerzas en cordones superiores entre columnas que equilibran las fuerzas horizontales H (sobre cada nudo). */
function topChordForces(cols: { x: number; y: number }[], H: { x: number; y: number }[]): { a: number; b: number; F: number }[] {
  const m = cols.length;
  const mem: { a: number; b: number; ux: number; uy: number }[] = [];
  for (let a = 0; a < m; a++) for (let b = a + 1; b < m; b++) {
    const dx = cols[b].x - cols[a].x, dy = cols[b].y - cols[a].y;
    const L = Math.hypot(dx, dy);
    if (L <= 1e-6) continue;
    // solo columnas vecinas: se omite el cordón si otra columna queda sobre él
    const blocked = cols.some((c, k) => {
      if (k === a || k === b) return false;
      const t = ((c.x - cols[a].x) * dx + (c.y - cols[a].y) * dy) / (L * L);
      if (t <= 0.02 || t >= 0.98) return false;
      return Math.hypot(c.x - (cols[a].x + t * dx), c.y - (cols[a].y + t * dy)) < 0.2 * L;
    });
    if (!blocked) mem.push({ a, b, ux: dx / L, uy: dy / L });
  }
  if (!mem.length) return [];
  const { F } = planarTrussForces(cols, mem.map((e) => [e.a, e.b] as [number, number]), H);
  return mem.map((e, j) => ({ a: e.a, b: e.b, F: F[j] })).filter((q) => Math.abs(q.F) > 1e-6);
}

export function stmDesign(a: StmArgs): StmResult {
  const betaS = a.crackMesh ? 0.75 : 0.6 * a.lambda;
  const fce = 0.85 * 1.0 * betaS * a.fc;
  const nx = new Set(a.pts.map((p) => Math.round(p.x * 20))).size;
  const ny = new Set(a.pts.map((p) => Math.round(p.y * 20))).size;
  const betaNPile = nx > 1 && ny > 1 ? 0.6 : 0.8;
  const nodeColLimit = PHI * 0.85 * 1.0 * a.fc;
  const nodePileLimit = PHI * 0.85 * betaNPile * a.fc;
  const m = a.cols.length;

  const dMin = Math.min(a.dX, a.dY);
  const hTie = a.cover + Math.max(a.dbX, a.dbY) / 2;
  // profundidad mínima de la zona de compresión por flexión (bloque rectangular con el acero colocado)
  const flexA = (d: number, asPerM: number, b: number, colPerp: number) => {
    const bc = Math.min(b, colPerp + d);
    return (((asPerM * b) / 1e4) * a.fy) / (0.85 * a.fc * Math.max(bc, 1e-3));
  };
  const cwx = Math.max(...a.cols.map((c) => c.wx), 0.1), cwy = Math.max(...a.cols.map((c) => c.wy), 0.1);
  const aFlex = Math.max(flexA(a.dX, a.asX, a.rect.L, cwy), flexA(a.dY, a.asY, a.rect.B, cwx));
  const wtPile = 2 * hTie;

  let best: StmResult | null = null;
  for (const cb of a.combos) {
    const uplift = cb.R.some((r) => r < -1e-6);
    const Rp = cb.R.map((r) => Math.max(r, 0));
    const sumR = Rp.reduce((s, v) => s + v, 0);
    const Pk = cb.cols.map((c) => Math.max(c.P, 0));
    const sumP = Pk.reduce((s, v) => s + v, 0);
    if (sumR <= 1e-9 || sumP <= 1e-9) continue;
    // con pilotes en tracción la suma de compresiones supera la carga: se escala la carga de las columnas
    const Pn = Pk.map((p) => (p * sumR) / sumP);
    const Mb = cb.cols.map((c) => ({ x: c.Mbx, y: c.Mby }));
    let z = dMin - aFlex / 2;
    const z0 = Math.max(z, 0.5 * dMin);
    let alpha = allocateStm(a.pts, Rp, a.cols, Pn, uplift ? null : Mb, z0);
    if (!alpha) alpha = allocateStm(a.pts, Rp, a.cols, Pn, null, z0) ?? a.pts.map((_, i) => Pn.map((p) => (Rp[i] * p) / sumR));
    const A = alpha;
    // nudo superior de cada columna en el punto de aplicación de su resultante (e = M/P, dentro de la columna)
    const nodes = a.cols.map((c, k) => {
      const P = cb.cols[k].P;
      if (uplift || P <= 1e-9) return { x: c.x, y: c.y };
      const ex = Math.max(-c.wx / 2, Math.min(c.wx / 2, Mb[k].y / P));
      const ey = Math.max(-c.wy / 2, Math.min(c.wy / 2, Mb[k].x / P));
      return { x: c.x + ex, y: c.y + ey };
    });
    const lens = a.pts.map((q) => nodes.map((c) => Math.hypot(q.x - c.x, q.y - c.y)));
    // la profundidad del nodo superior (hidrostático) y el brazo z dependen entre sí: iteración
    let wt = aFlex;
    for (let it = 0; it < 12; it++) {
      let w = aFlex;
      a.pts.forEach((_, i) => a.cols.forEach((c, k) => {
        if (A[i][k] <= 1e-9) return;
        const lb = Math.sqrt((c.A * A[i][k]) / Math.max(Pn[k], 1e-9));
        w = Math.max(w, (lb * lens[i][k]) / Math.max(z, 1e-6));
      }));
      wt = w;
      z = Math.max(dMin - wt / 2, 0.5 * dMin);
    }
    const hNode = hTie + z;
    const struts: StmStrut[] = [];
    a.pts.forEach((_, i) => a.cols.forEach((c, k) => {
      const Rk = A[i][k];
      if (Rk <= 1e-9 * sumR) return;
      const l = lens[i][k];
      const theta = Math.atan2(z, Math.max(l, 1e-6));
      const sinT = Math.sin(theta), cosT = Math.cos(theta);
      const C = Rk / sinT;
      const lbC = Math.sqrt((c.A * Rk) / Math.max(Pn[k], 1e-9));
      const lbP = Math.sqrt((a.Apile * Rk) / Math.max(Rp[i], 1e-9));
      const AcsCol = (lbC * sinT + wt * cosT) * lbC;
      const AcsPile = (lbP * sinT + wtPile * cosT) * lbP;
      const phiFns = PHI * fce * Math.min(AcsCol, AcsPile) * 1000;
      struts.push({
        i, k, R: Rk, l, theta, C, AcsCol, AcsPile, phiFns, ratio: C / Math.max(phiFns, 1e-9),
        nodeColStress: C / Math.max(AcsCol, 1e-9) / 1000, nodePileStress: C / Math.max(AcsPile, 1e-9) / 1000,
      });
    }));

    // empuje horizontal de los puntales sobre cada nudo de pilote (positivo hacia afuera de la columna)
    const thrust = a.pts.map((q, i) => {
      let hx = 0, hy = 0;
      nodes.forEach((c, k) => { hx += (A[i][k] * (q.x - c.x)) / z; hy += (A[i][k] * (q.y - c.y)) / z; });
      return { hx, hy };
    });

    // cordones superiores: fuerza horizontal en los nudos de columna no equilibrada por el momento de la columna
    let topChords: StmTopChord[] = [];
    let unbalanced = 0;
    const H = nodes.map((c, k) => {
      let hx = 0, hy = 0;
      a.pts.forEach((q, i) => { hx += (A[i][k] * (c.x - q.x)) / z; hy += (A[i][k] * (c.y - q.y)) / z; });
      return { x: hx, y: hy };
    });
    const balancedAlloc = uplift || m === 1 || Math.max(...H.map((q) => Math.hypot(q.x, q.y))) <= 1e-3 * Math.max(...Pn, 1);
    if (!balancedAlloc && m > 1) {
      const f = topChordForces(nodes, H);
      // fuerza residual (sin equilibrar) en los nudos
      const resid = H.map((h) => ({ ...h }));
      for (const e of f) {
        const ca = nodes[e.a], cbb = nodes[e.b];
        const L = Math.hypot(cbb.x - ca.x, cbb.y - ca.y);
        const ux = (cbb.x - ca.x) / L, uy = (cbb.y - ca.y) / L;
        resid[e.a].x += e.F * ux; resid[e.a].y += e.F * uy;
        resid[e.b].x -= e.F * ux; resid[e.b].y -= e.F * uy;
      }
      unbalanced = Math.max(0, ...resid.map((r) => Math.hypot(r.x, r.y)));
      topChords = f.map((e) => {
        const ca = a.cols[e.a], cbb = a.cols[e.b];
        const L = Math.hypot(nodes[e.b].x - nodes[e.a].x, nodes[e.b].y - nodes[e.a].y);
        const ux = (nodes[e.b].x - nodes[e.a].x) / L, uy = (nodes[e.b].y - nodes[e.a].y) / L;
        // ancho efectivo: la columna más ancha en dirección perpendicular al cordón más un peralte
        const wPerp = Math.max(...[ca, cbb].map((c) => Math.abs(uy) * c.wx + Math.abs(ux) * c.wy));
        const width = Math.min(wPerp + dMin, Math.max(a.rect.B, a.rect.L));
        let cap: number;
        if (e.F > 0) {
          const asDir = (a.asTopX ?? 0) * ux * ux + (a.asTopY ?? 0) * uy * uy; // cm²/m
          cap = PHI * ((asDir * width) / 1e4) * a.fy * 1000;
        } else cap = PHI * fce * width * wt * 1000;
        return { a: e.a, b: e.b, F: e.F, width, cap, ratio: Math.abs(e.F) / Math.max(cap, 1e-9) };
      });
    }

    // tirantes inferiores: barras entre pilotes vecinos que equilibran el empuje de los puntales en cada nudo de pilote
    const graph = pileTieGraph(a.pts);
    const bt = planarTrussForces(a.pts, graph, thrust.map((t) => ({ x: t.hx, y: t.hy })));
    unbalanced = Math.max(unbalanced, bt.resid);
    const ties: StmBottomTie[] = graph.map(([i, j], e) => {
      const dx = a.pts[j].x - a.pts[i].x, dy = a.pts[j].y - a.pts[i].y;
      const L = Math.hypot(dx, dy);
      const ux = dx / L, uy = dy / L;
      // ancho de la banda: pilote + peralte, sin pasar de la distancia a los pilotes vecinos fuera del elemento
      const dDir = a.dX * ux * ux + a.dY * uy * uy;
      let sPerp = Infinity;
      a.pts.forEach((q, k) => {
        if (k === i || k === j) return;
        const t = ((q.x - a.pts[i].x) * ux + (q.y - a.pts[i].y) * uy) / L;
        if (t < -0.25 || t > 1.25) return;
        const dp = Math.abs((q.x - a.pts[i].x) * uy - (q.y - a.pts[i].y) * ux);
        if (dp > 0.25 * a.Dp) sPerp = Math.min(sPerp, dp);
      });
      const width = Math.min(a.Dp + dDir, sPerp);
      // parrilla ortogonal: acero efectivo en la dirección del tirante = asX·cos²θ + asY·sen²θ
      const asProv = (a.asX * ux * ux + a.asY * uy * uy) * width;
      const F = bt.F[e];
      const cap = F >= 0 ? PHI * (asProv / 1e4) * a.fy * 1000 : PHI * fce * width * wtPile * 1000;
      const t: StmBottomTie = { a: i, b: j, F, ux, uy, L, width, asProv, cap, ratio: Math.abs(F) / Math.max(cap, 1e-9), axis: Math.abs(ux) >= Math.abs(uy) ? 'x' : 'y' };
      return t;
    }).filter((t) => Math.abs(t.F) > 1e-6 * Math.max(sumR, 1));
    const mkTie = (axis: 'x' | 'y'): StmTie => {
      const members = ties.map((t, e) => (t.axis === axis ? e : -1)).filter((e) => e >= 0);
      const T = members.reduce((acc, e) => acc + Math.max(ties[e].F, 0), 0);
      return { axis, T, members, AsReq: (T / (PHI * a.fy * 1000)) * 1e4, ratio: Math.max(0, ...members.map((e) => ties[e].ratio)) };
    };
    const tieX = mkTie('x');
    const tieY = mkTie('y');
    const ratioStrut = Math.max(...struts.map((s) => s.ratio), 0);
    const ratioNodeCol = Math.max(...struts.map((s) => s.nodeColStress / nodeColLimit), ...a.cols.map((c, k) => cb.cols[k].P / c.A / 1000 / nodeColLimit), 0);
    const ratioNodePile = Math.max(...struts.map((s) => s.nodePileStress / nodePileLimit), ...Rp.map((r) => r / a.Apile / 1000 / nodePileLimit), 0);
    const ratioTie = Math.max(tieX.ratio, tieY.ratio);
    const ratioTop = Math.max(0, ...topChords.map((t) => t.ratio));
    const res: StmResult = {
      combo: cb.name, zx: z, zy: z, z, ax: aFlex, ay: wt, hTie, hNode, struts, ties, tieX, tieY,
      cols: a.cols.map((c, k) => ({ name: c.name, x: c.x, y: c.y, P: cb.cols[k].P, nx: nodes[k].x, ny: nodes[k].y })), thrust, topChords, balanced: balancedAlloc || m === 1, unbalanced,
      fce, betaS, betaNPile, nodeColLimit, nodePileLimit,
      ratioStrut, ratioNodeCol, ratioNodePile, ratioTie, ratioTop, ratio: Math.max(ratioStrut, ratioNodeCol, ratioNodePile, ratioTie, ratioTop), uplift, aOverD: 0, deep: false,
    };
    if (!best || res.ratio > best.ratio) best = res;
  }
  if (!best) {
    const z0 = dMin - aFlex / 2;
    return {
      combo: '—', zx: z0, zy: z0, z: z0, ax: aFlex, ay: aFlex, hTie, hNode: hTie + z0, struts: [], ties: [], tieX: { axis: 'x', T: 0, members: [], AsReq: 0, ratio: 0 }, tieY: { axis: 'y', T: 0, members: [], AsReq: 0, ratio: 0 },
      cols: a.cols.map((c) => ({ name: c.name, x: c.x, y: c.y, P: 0, nx: c.x, ny: c.y })), thrust: a.pts.map(() => ({ hx: 0, hy: 0 })), topChords: [], balanced: true, unbalanced: 0,
      fce, betaS, betaNPile, nodeColLimit, nodePileLimit, ratioStrut: 0, ratioNodeCol: 0, ratioNodePile: 0, ratioTie: 0, ratioTop: 0, ratio: 0, uplift: false, aOverD: 0, deep: false,
    };
  }
  return best;
}
