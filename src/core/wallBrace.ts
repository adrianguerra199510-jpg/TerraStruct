// Pantalla arriostrada lateralmente por losas (muro de sótano): viga continua vertical.
// La pantalla se modela como una viga de rigidez EI(y) ∝ t(y)³ apoyada en la zapata (empotrada o articulada)
// y en cada losa (apoyo simple, rígido en su plano). Se resuelve por el método de rigidez con elementos de viga
// de Euler–Bernoulli y cargas nodales consistentes (carga lineal en cada elemento).

export interface BeamSupports {
  /** altura del apoyo de cada losa sobre la base de la pantalla, m (0 < y ≤ H) */
  levels: number[];
  base: 'fixed' | 'pinned';
}

export interface BeamReactions {
  /** fuerza de cada losa sobre la pantalla, positiva hacia el relleno (se opone al empuje), kN/m */
  R: number[];
  /** fuerza horizontal en la base, positiva hacia el relleno, kN/m */
  V0: number;
}

/** Malla de nodos que incluye los apoyos. */
function meshNodes(H: number, levels: number[], n: number): number[] {
  const pts = new Set<number>();
  for (let k = 0; k <= n; k++) pts.add(+((H * k) / n).toFixed(9));
  for (const y of levels) pts.add(+y.toFixed(9));
  return [...pts].sort((a, b) => a - b).filter((y, i, a) => i === 0 || y - a[i - 1] > 1e-6);
}

/** Resuelve A·x = b para varias columnas de b (eliminación de Gauss con pivoteo parcial). */
function solveMulti(A: number[][], B: number[][]): number[][] {
  const n = A.length;
  const m = B[0]?.length ?? 0;
  const a = A.map((r) => r.slice());
  const b = B.map((r) => r.slice());
  for (let c = 0; c < n; c++) {
    let p = c;
    for (let r = c + 1; r < n; r++) if (Math.abs(a[r][c]) > Math.abs(a[p][c])) p = r;
    if (Math.abs(a[p][c]) < 1e-14) throw new Error('Viga continua: sistema singular (apoyos insuficientes).');
    [a[c], a[p]] = [a[p], a[c]];
    [b[c], b[p]] = [b[p], b[c]];
    for (let r = c + 1; r < n; r++) {
      const f = a[r][c] / a[c][c];
      if (f === 0) continue;
      for (let k = c; k < n; k++) a[r][k] -= f * a[c][k];
      for (let k = 0; k < m; k++) b[r][k] -= f * b[c][k];
    }
  }
  const x = Array.from({ length: n }, () => new Array(m).fill(0));
  for (let r = n - 1; r >= 0; r--) {
    for (let k = 0; k < m; k++) {
      let s = b[r][k];
      for (let j = r + 1; j < n; j++) s -= a[r][j] * x[j][k];
      x[r][k] = s / a[r][r];
    }
  }
  return x;
}

/**
 * Reacciones de la pantalla arriostrada para varias cargas a la vez.
 * @param H altura de la pantalla
 * @param t espesor de la pantalla a la altura y (para EI ∝ t³; E se cancela)
 * @param loads presiones horizontales p(y) en kPa (positivas hacia el frente, empujando la pantalla)
 */
export function braceReactions(H: number, t: (y: number) => number, sup: BeamSupports, loads: ((y: number) => number)[], n = 96): BeamReactions[] {
  const ys = meshNodes(H, sup.levels, n);
  const N = ys.length;
  const ndof = 2 * N;
  const K = Array.from({ length: ndof }, () => new Array(ndof).fill(0));
  const F = Array.from({ length: ndof }, () => new Array(loads.length).fill(0));
  for (let e = 0; e < N - 1; e++) {
    const L = ys[e + 1] - ys[e];
    const tm = t((ys[e] + ys[e + 1]) / 2);
    const EI = Math.max(tm, 1e-3) ** 3 / 12;
    const k = EI / L ** 3;
    const ke = [
      [12 * k, 6 * L * k, -12 * k, 6 * L * k],
      [6 * L * k, 4 * L * L * k, -6 * L * k, 2 * L * L * k],
      [-12 * k, -6 * L * k, 12 * k, -6 * L * k],
      [6 * L * k, 2 * L * L * k, -6 * L * k, 4 * L * L * k],
    ];
    const dofs = [2 * e, 2 * e + 1, 2 * e + 2, 2 * e + 3];
    for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) K[dofs[i]][dofs[j]] += ke[i][j];
    loads.forEach((p, c) => {
      const w1 = p(ys[e]), w2 = p(ys[e + 1]);
      const fe = [(L * (7 * w1 + 3 * w2)) / 20, (L * L * (3 * w1 + 2 * w2)) / 60, (L * (3 * w1 + 7 * w2)) / 20, -(L * L * (2 * w1 + 3 * w2)) / 60];
      for (let i = 0; i < 4; i++) F[dofs[i]][c] += fe[i];
    });
  }
  // grados de libertad restringidos: desplazamiento en la base y en cada losa; giro en la base si está empotrada
  const idxOf = (y: number) => ys.findIndex((q) => Math.abs(q - y) < 1e-6);
  const fixed = new Set<number>([0]);
  if (sup.base === 'fixed') fixed.add(1);
  const levelDof = sup.levels.map((y) => 2 * idxOf(+y.toFixed(9)));
  levelDof.forEach((d) => fixed.add(d));
  const free = Array.from({ length: ndof }, (_, i) => i).filter((i) => !fixed.has(i));
  const Kff = free.map((i) => free.map((j) => K[i][j]));
  const Ff = free.map((i) => F[i]);
  const uf = solveMulti(Kff, Ff);
  const u = Array.from({ length: ndof }, () => new Array(loads.length).fill(0));
  free.forEach((i, k) => (u[i] = uf[k]));
  // reacción en un g.d.l. restringido = K·u − F (fuerza del apoyo sobre la viga, en el sentido de la carga)
  const react = (d: number, c: number) => {
    let s = -F[d][c];
    for (let j = 0; j < ndof; j++) s += K[d][j] * u[j][c];
    return s;
  };
  return loads.map((_, c) => ({
    // signo: la reacción del apoyo en el sentido de la carga es negativa; se reporta positiva hacia el relleno
    R: levelDof.map((d) => -react(d, c)),
    V0: -react(0, c),
  }));
}
