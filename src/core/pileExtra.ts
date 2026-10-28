// Efectos adicionales en cimentaciones profundas: licuación, asentamiento del grupo y efecto de grupo lateral (p-múltiples).
import { Pt } from './geometry';
import { PileInput, SoilLayer } from './pileTypes';

const GW = 9.81;

export function layerIndexAt(layers: SoilLayer[], z: number): number {
  let acc = 0;
  for (let i = 0; i < layers.length; i++) {
    acc += layers[i].thk;
    if (z <= acc + 1e-9) return i;
  }
  return layers.length - 1;
}

/** Esfuerzo vertical efectivo (kPa) en el punto medio de cada franja de espesor dz, medido desde la base del cabezal. */
export function effectiveStressProfile(inp: PileInput, zMax: number, dz = 0.25): { z: number[]; sv: number[]; dz: number } {
  const layers = inp.geo.layers;
  const n = Math.max(Math.ceil(zMax / dz), 1);
  const d = zMax / n;
  let acc = inp.geo.Df * (layers[0]?.gamma ?? 18);
  const z: number[] = [];
  const sv: number[] = [];
  for (let k = 0; k < n; k++) {
    const zm = (k + 0.5) * d;
    const g = layers[layerIndexAt(layers, zm)]?.gamma ?? 18;
    z.push(zm);
    sv.push(acc + (g * d) / 2);
    acc += g * d;
  }
  return { z, sv, dz: d };
}

export const totalLayerDepth = (layers: SoilLayer[]) => layers.reduce((s, l) => s + l.thk, 0);

// ---------------------------------------------------------------- licuación (Seed–Idriss simplificado, Youd et al. 2001)
export interface LiqRow {
  layer: number;
  name: string;
  /** profundidad medida desde el terreno, m */
  zGround: number;
  sv: number;
  svEff: number;
  rd: number;
  CSR: number;
  N1cs: number;
  CRR: number;
  MSF: number;
  FS: number;
  liquefies: boolean;
  /** deformación volumétrica post-licuación, % */
  evPct: number;
  thk: number;
}
export interface LiqResult {
  enabled: boolean;
  rows: LiqRow[];
  /** asentamiento del terreno por licuación, m */
  settlement: number;
  /** espesor total licuable (FS < FS mín.), m */
  Lliq: number;
  /** por estrato: ¿licúa? */
  liquefied: boolean[];
  /** perfil de FS, CSR y CRR por franja de 0.25 m (profundidad desde el terreno) */
  profile: { zGround: number; FS: number; CSR: number; CRR: number }[];
}

function crr75(N: number): number {
  const n = Math.min(Math.max(N, 1), 29.99);
  return 1 / (34 - n) + n / 135 + 50 / (10 * n + 45) ** 2 - 1 / 200;
}

const EV: [number, number][] = [[0, 5.5], [5, 4.5], [10, 3], [15, 1.9], [20, 1], [30, 0.3], [40, 0]];
function evOf(N: number): number {
  if (N <= EV[0][0]) return EV[0][1];
  for (let i = 0; i < EV.length - 1; i++) {
    if (N <= EV[i + 1][0]) {
      const t = (N - EV[i][0]) / (EV[i + 1][0] - EV[i][0]);
      return EV[i][1] + t * (EV[i + 1][1] - EV[i][1]);
    }
  }
  return 0;
}

export function liquefaction(inp: PileInput): LiqResult {
  const g = inp.geo;
  const layers = g.layers;
  const none = (): LiqResult => ({ enabled: false, rows: [], settlement: 0, Lliq: 0, liquefied: layers.map(() => false), profile: [] });
  if (!g.liqOn || !layers.length) return none();
  const prof = effectiveStressProfile(inp, totalLayerDepth(layers), 0.25);
  const rows: LiqRow[] = [];
  const liquefied = layers.map(() => false);
  let settlement = 0;
  let Lliq = 0;
  let z0 = 0;
  const profile: LiqResult['profile'] = [];
  layers.forEach((l, i) => {
    const z1 = z0 + l.thk;
    if (l.liq) {
      // franjas del estrato: se evalúa en el punto medio de cada franja y se toma el FS mínimo
      let worst: LiqRow | null = null;
      let evSum = 0;
      let nLiq = 0;
      let cnt = 0;
      for (let k = 0; k < prof.z.length; k++) {
        if (prof.z[k] < z0 || prof.z[k] > z1) continue;
        cnt++;
        const zg = g.Df + prof.z[k];
        const u = Math.max(zg - g.gwt, 0) * GW;
        const svEff = prof.sv[k];
        const sv = svEff + u;
        if (zg <= g.gwt || svEff <= 0) continue;
        const rd = zg <= 9.15 ? 1 - 0.00765 * zg : zg <= 23 ? 1.174 - 0.0267 * zg : 0.744 - 0.008 * zg;
        const CSR = 0.65 * g.amax * (sv / svEff) * Math.max(rd, 0.3);
        const FC = l.FC;
        const alpha = FC <= 5 ? 0 : FC < 35 ? Math.exp(1.76 - 190 / FC ** 2) : 5;
        const beta = FC <= 5 ? 1 : FC < 35 ? 0.99 + FC ** 1.5 / 1000 : 1.2;
        const N1cs = alpha + beta * l.N160;
        const CRR = N1cs >= 30 ? 2 : crr75(N1cs);
        const MSF = Math.pow(10, 2.24) / Math.pow(g.Mw, 2.56);
        const FS = (CRR * MSF) / Math.max(CSR, 1e-9);
        profile.push({ zGround: zg, FS, CSR, CRR: CRR * MSF });
        const row: LiqRow = { layer: i, name: l.name, zGround: zg, sv, svEff, rd, CSR, N1cs, CRR, MSF, FS, liquefies: FS < g.fsLiq, evPct: evOf(N1cs), thk: prof.dz };
        if (!worst || FS < worst.FS) worst = row;
        if (FS < 1) {
          nLiq++;
          evSum += evOf(N1cs) * prof.dz;
        }
      }
      if (worst) {
        rows.push(worst);
        liquefied[i] = worst.liquefies;
        // la licuación abarca el estrato si la franja crítica no cumple (conservador)
        if (worst.liquefies) Lliq += l.thk;
        settlement += (evSum / 100);
      }
      void nLiq; void cnt;
    }
    z0 = z1;
  });
  return { enabled: true, rows, settlement, Lliq, liquefied, profile };
}

// ---------------------------------------------------------------- asentamiento
export interface SettleSlice {
  zBelow: number;
  layer: string;
  dSigma: number;
  svEff: number;
  dH: number;
  mode: 'Cc' | 'Es';
}
export interface SettleResult {
  /** pilote individual: acortamiento elástico + punta + fuste, m */
  pile: { Q: number; de: number; dp: number; ds: number; total: number };
  group: { Q: number; zRaft: number; Beq: number; Leq: number; slices: SettleSlice[]; total: number };
  total: number;
}

/** Asentamiento del pilote (Vesic) y del grupo (zapata equivalente con distribución 2:1). */
export function settlement(inp: PileInput, o: { Qpile: number; Qgroup: number; Qs: number; Qult: number; qb: number; Ap: number; Ep: number; D: number; Bg: number; Lg: number; tipKind: SoilLayer['kind'] }): SettleResult {
  const p = inp.pile;
  const g = inp.geo;
  const frictionShare = o.Qult > 0 ? Math.min(Math.max(o.Qs / o.Qult, 0), 1) : 0.5;
  const Qs = o.Qpile * frictionShare;
  const Qp = o.Qpile - Qs;
  const de = ((Qp + 0.5 * Qs) * p.L) / (o.Ap * o.Ep);
  const sand = o.tipKind === 'granular';
  const Cp = sand ? (p.install === 'driven' ? 0.03 : 0.13) : p.install === 'driven' ? 0.03 : 0.045;
  const qbU = Math.max(o.qb, 1);
  const dp = (Cp * Qp) / (o.D * qbU);
  const Cs = (0.93 + 0.16 * Math.sqrt(p.L / o.D)) * Cp;
  const ds = (Cs * Qs) / (p.L * qbU);
  const pile = { Q: o.Qpile, de, dp: Math.max(dp, 0), ds, total: de + Math.max(dp, 0) + ds };

  const zRaft = p.L * (1 - frictionShare / 3);
  const Beq = o.Bg + zRaft;
  const Leq = o.Lg + zRaft;
  const layers = g.layers;
  const depthMax = totalLayerDepth(layers);
  const prof = effectiveStressProfile(inp, depthMax, 0.25);
  const slices: SettleSlice[] = [];
  let total = 0;
  const zEnd = Math.min(depthMax, zRaft + 2 * Beq);
  for (let k = 0; k < prof.z.length; k++) {
    const zb = prof.z[k] - zRaft;
    if (zb <= 0 || prof.z[k] > zEnd) continue;
    const l = layers[layerIndexAt(layers, prof.z[k])];
    const dS = o.Qgroup / ((Beq + zb) * (Leq + zb));
    const sv = prof.sv[k];
    let dH: number;
    let mode: 'Cc' | 'Es';
    if (l.Cc > 0) {
      dH = ((l.Cc * prof.dz) / (1 + l.e0)) * Math.log10((sv + dS) / sv);
      mode = 'Cc';
    } else {
      dH = (dS * prof.dz) / Math.max(l.Es, 1);
      mode = 'Es';
    }
    total += dH;
    slices.push({ zBelow: zb, layer: l.name, dSigma: dS, svEff: sv, dH, mode });
  }
  const group = { Q: o.Qgroup, zRaft, Beq, Leq, slices, total };
  return { pile, group, total: Math.max(group.total, pile.total) };
}

// ---------------------------------------------------------------- efecto de grupo lateral
export interface GroupLateral {
  /** multiplicador p por pilote (1 = sin reducción) */
  pm: number[];
  rows: number[];
  /** reparto de la fuerza horizontal por pilote, kN */
  H: number[];
  /** dirección de la carga */
  dir: Pt;
}

/** Multiplicadores p (Brown et al. 1988; AASHTO/FHWA) según la fila y la separación s/D en la dirección de la carga. */
export function pMultiplier(row: number, sD: number): number {
  const at3 = [0.8, 0.4, 0.3];
  const at5 = [1.0, 0.85, 0.7];
  const i = Math.min(row, 2);
  if (sD >= 8) return 1;
  if (sD >= 5) return at5[i] + ((1 - at5[i]) * (sD - 5)) / 3;
  if (sD <= 3) return at3[i];
  return at3[i] + ((at5[i] - at3[i]) * (sD - 3)) / 2;
}

export function groupLateral(pts: Pt[], Dp: number, Vx: number, Vy: number): GroupLateral {
  const n = pts.length;
  const H = Math.hypot(Vx, Vy);
  if (!n || H < 1e-9) return { pm: pts.map(() => 1), rows: pts.map(() => 0), H: pts.map(() => 0), dir: { x: 1, y: 0 } };
  const u = { x: Vx / H, y: Vy / H };
  // proyección sobre la dirección de la carga; fila 0 = la más adelantada
  const proj = pts.map((q) => q.x * u.x + q.y * u.y);
  const order = proj.map((v, i) => ({ v, i })).sort((a, b) => b.v - a.v);
  const rows = new Array<number>(n).fill(0);
  const rowPos: number[] = [];
  let r = -1;
  let last = Infinity;
  for (const o of order) {
    if (last - o.v > 0.5 * Dp) { r++; rowPos.push(o.v); }
    rows[o.i] = r;
    last = o.v;
  }
  const nRows = r + 1;
  const spacing = nRows > 1 ? (rowPos[0] - rowPos[nRows - 1]) / (nRows - 1) : Infinity;
  const sD = spacing / Dp;
  const pm = rows.map((rr) => (nRows > 1 ? pMultiplier(rr, sD) : 1));
  return { pm, rows, H: pts.map(() => 0), dir: u };
}
