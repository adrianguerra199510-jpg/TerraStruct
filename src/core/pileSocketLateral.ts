// Análisis lateral de un pilote con socket en roca: viga de Euler–Bernoulli sobre resortes de Winkler
// (elementos finitos). Suelo: Es = p·nh·z (mismo modelo que Matlock–Reese). Roca: Es = 0.65·(Em·D⁴/EI)^(1/12)·Em/(1 − ν²)
// (Vesic, 1961). Resistencia lateral de la roca: Reese (1997), roca débil. Unidades: kN, m, kPa.
import { PileDef, SoilLayer } from './pileTypes';

export const NU_ROCK = 0.25;

export interface SocketLatUnit {
  /** desplazamiento en la cabeza por unidad de H (m/kN) */
  y: number;
  /** momento y cortante máximos (valor absoluto) por unidad de H */
  M: number;
  V: number;
  /** profundidad del momento máximo bajo el terreno (negativa en el tramo libre), m */
  zM: number;
  /** profundidad del techo de la roca y momento allí por unidad de H */
  zRock: number;
  Mrock: number;
  /** máx. de p/pur en la roca por unidad de H, y valores en ese punto (p por unidad de H, pur en kN/m, profundidad) */
  pRatio: number;
  pUnit: number;
  pur: number;
  zP: number;
  /** módulo de reacción de la roca (kN/m²) */
  kRock: number;
  /** perfil por unidad de H: profundidad bajo el terreno (m), deflexión (m/kN) y momento (kN·m/kN) */
  prof: { z: number[]; y: number[]; M: number[] };
}

/** Rigidez lateral de la roca por unidad de longitud (Vesic). Em en kPa. */
export function rockSpring(Em: number, D: number, EI: number): number {
  return (0.65 * Math.pow((Em * D ** 4) / Math.max(EI, 1e-9), 1 / 12) * Em) / (1 - NU_ROCK ** 2);
}

/** Resistencia lateral última de la roca débil (Reese, 1997), kN/m. xr = profundidad bajo el techo de la roca. */
export function rockPur(quKpa: number, rqd: number, D: number, xr: number): number {
  const ar = 1 - (2 / 3) * (rqd / 100);
  return xr <= 3 * D ? ar * quKpa * D * (1 + (1.4 * xr) / D) : 5.2 * ar * quKpa * D;
}

/**
 * Solución para H = 1 kN en la cabeza. `pm` reduce todos los resortes (efecto de grupo);
 * `noSupport(i)` anula los resortes del estrato i (p. ej., licuado).
 */
export function socketLateralUnit(p: PileDef, EI: number, D: number, layers: SoilLayer[], pm: number, noSupport?: (i: number) => boolean): SocketLatUnit {
  const L = p.L, Lu = Math.max(p.Lu, 0);
  const tops: number[] = [];
  let acc = 0;
  for (const l of layers) { tops.push(acc); acc += l.thk; }
  const idxAt = (z: number) => {
    for (let i = 0; i < layers.length; i++) if (z <= tops[i] + layers[i].thk + 1e-9) return i;
    return layers.length - 1;
  };
  // techo de la roca continua a la que pertenece cada estrato
  const rockTop: number[] = layers.map(() => 0);
  for (let i = 0; i < layers.length; i++) rockTop[i] = layers[i].kind === 'rock' && i > 0 && layers[i - 1].kind === 'rock' ? rockTop[i - 1] : tops[i];
  let kRock = 0;
  const kAt = (z: number): number => {
    if (z <= 0 || !layers.length) return 0;
    const i = idxAt(z);
    if (noSupport?.(i)) return 0;
    const l = layers[i];
    if (l.kind === 'rock') {
      const k = rockSpring(l.Es, D, EI);
      kRock = Math.max(kRock, k);
      return pm * k;
    }
    return pm * Math.max(p.nh, 1) * z;
  };
  // malla: h ≤ 0.2 m y ≤ λ/10 en la roca, λ = (4EI/k)^(1/4)
  const kMax = Math.max(...layers.map((l) => (l.kind === 'rock' ? rockSpring(l.Es, D, EI) : Math.max(p.nh, 1) * L)), 1);
  const lam = Math.pow((4 * EI) / kMax, 0.25);
  const Ltot = Lu + L;
  const ne = Math.min(Math.max(Math.ceil(Ltot / Math.min(0.2, lam / 10)), 40), 3000);
  const h = Ltot / ne;
  const nn = ne + 1;
  const N = 2 * nn;
  const BW = 3;
  const W = 2 * BW + 1;
  const K = new Float64Array(N * W);
  const at = (i: number, j: number) => i * W + (j - i + BW);
  const add = (i: number, j: number, v: number) => { K[at(i, j)] += v; };
  const c = EI / h ** 3;
  const ke = [
    [12, 6 * h, -12, 6 * h],
    [6 * h, 4 * h * h, -6 * h, 2 * h * h],
    [-12, -6 * h, 12, -6 * h],
    [6 * h, 2 * h * h, -6 * h, 4 * h * h],
  ];
  const zOf = (node: number) => node * h - Lu; // profundidad bajo el terreno
  const kNode = new Float64Array(nn);
  for (let e = 0; e < ne; e++) {
    const d = [2 * e, 2 * e + 1, 2 * e + 2, 2 * e + 3];
    for (let a = 0; a < 4; a++) for (let b = 0; b < 4; b++) add(d[a], d[b], c * ke[a][b]);
    // resortes concentrados: media longitud de cada mitad del elemento
    const zA = zOf(e) + h / 4, zB = zOf(e) + (3 * h) / 4;
    kNode[e] += (kAt(zA) * h) / 2;
    kNode[e + 1] += (kAt(zB) * h) / 2;
  }
  for (let i = 0; i < nn; i++) add(2 * i, 2 * i, kNode[i]);
  const F = new Float64Array(N);
  F[0] = 1;
  if (p.head === 'fixed') {
    // giro nulo en la cabeza
    for (let j = Math.max(0, 1 - BW); j <= Math.min(N - 1, 1 + BW); j++) { K[at(1, j)] = 0; if (j !== 1) K[at(j, 1)] = 0; }
    K[at(1, 1)] = 1;
  }
  // eliminación gaussiana en banda (simétrica definida positiva, sin pivoteo)
  for (let k = 0; k < N; k++) {
    const piv = K[at(k, k)];
    for (let i = k + 1; i <= Math.min(N - 1, k + BW); i++) {
      const f = K[at(i, k)] / piv;
      if (f === 0) continue;
      for (let j = k; j <= Math.min(N - 1, k + BW); j++) K[at(i, j)] -= f * K[at(k, j)];
      F[i] -= f * F[k];
    }
  }
  const u = new Float64Array(N);
  for (let i = N - 1; i >= 0; i--) {
    let s = F[i];
    for (let j = i + 1; j <= Math.min(N - 1, i + BW); j++) s -= K[at(i, j)] * u[j];
    u[i] = s / K[at(i, i)];
  }
  // esfuerzos internos por elemento
  let M = 0, V = 0, zM = 0, Mrock = 0;
  const step = Math.max(1, Math.round(ne / 150));
  const prof = { z: [] as number[], y: [] as number[], M: [] as number[] };
  const zRock = (() => { for (let i = 0; i < layers.length; i++) if (layers[i].kind === 'rock' && tops[i] < L) return tops[i]; return L; })();
  for (let e = 0; e < ne; e++) {
    const ue = [u[2 * e], u[2 * e + 1], u[2 * e + 2], u[2 * e + 3]];
    const fe = ke.map((row) => c * row.reduce((s, v, j) => s + v * ue[j], 0));
    const Ma = Math.abs(fe[1]), Mb = Math.abs(fe[3]);
    if (Ma > M) { M = Ma; zM = zOf(e); }
    if (Mb > M) { M = Mb; zM = zOf(e + 1); }
    V = Math.max(V, Math.abs(fe[0]));
    if (e % step === 0) { prof.z.push(zOf(e)); prof.y.push(u[2 * e]); prof.M.push(-fe[1]); }
    if (e === ne - 1) { prof.z.push(zOf(ne)); prof.y.push(u[2 * ne]); prof.M.push(fe[3]); }
    if (zOf(e) <= zRock + 1e-9 && zOf(e + 1) > zRock + 1e-9) Mrock = Math.abs(zRock - zOf(e) < zOf(e + 1) - zRock ? fe[1] : fe[3]);
  }
  // presión sobre la roca frente a su resistencia última
  let pRatio = 0, pUnit = 0, pur = 0, zP = zRock;
  for (let i = 0; i < nn; i++) {
    const z = zOf(i);
    if (z <= 0) continue;
    const li = idxAt(z);
    const l = layers[li];
    if (!l || l.kind !== 'rock' || noSupport?.(li)) continue;
    const pk = Math.abs(pm * rockSpring(l.Es, D, EI) * u[2 * i]);
    const pu = rockPur(l.qu * 1000, l.rqd, D, Math.max(z - rockTop[li], 0));
    if (pk / pu > pRatio) { pRatio = pk / pu; pUnit = pk; pur = pu; zP = z; }
  }
  return { y: Math.abs(u[0]), M, V, zM, zRock, Mrock, pRatio, pUnit, pur, zP, kRock, prof };
}
