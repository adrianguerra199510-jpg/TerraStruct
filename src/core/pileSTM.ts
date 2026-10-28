// Método de puntales y tirantes (ACI 318-19, cap. 23) para cabezales sobre pilotes. Unidades: kN, m, MPa.
import { Pt } from './geometry';

export interface StmArgs {
  pts: Pt[];
  /** reacciones últimas (solo cargas de la columna) por combinación */
  combos: { name: string; R: number[]; P: number }[];
  col: { x: number; y: number; A: number };
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
  fc: number;
  fy: number;
  lambda: number;
  crackMesh: boolean;
  colW: { x: number; y: number };
  cover: number;
  dbX: number;
  dbY: number;
}

export interface StmStrut {
  i: number;
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
export interface StmTie {
  axis: 'x' | 'y';
  /** fuerza total del tirante en la sección del eje de la columna, kN */
  T: number;
  /** filas (bandas) de pilotes y fuerza por banda */
  bands: { pos: number; T: number; width: number; asProv: number; phiTn: number; ratio: number; x0: number; x1: number }[];
  AsReq: number;
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
  tieX: StmTie;
  tieY: StmTie;
  fce: number;
  betaS: number;
  betaNPile: number;
  nodeColLimit: number;
  nodePileLimit: number;
  ratioStrut: number;
  ratioNodeCol: number;
  ratioNodePile: number;
  ratioTie: number;
  ratio: number;
  uplift: boolean;
  /** relación a/d (luz de cortante) */
  aOverD: number;
  deep: boolean;
}

const PHI = 0.75;

function bands(pts: Pt[], R: number[], axis: 'x' | 'y', Dp: number): { pos: number; idx: number[]; sumR: number }[] {
  const key = (p: Pt) => (axis === 'x' ? p.y : p.x);
  const order = pts.map((p, i) => ({ v: key(p), i })).sort((a, b) => a.v - b.v);
  const out: { pos: number; idx: number[]; sumR: number }[] = [];
  for (const o of order) {
    const last = out[out.length - 1];
    if (last && Math.abs(o.v - last.pos) <= 0.5 * Dp) {
      last.idx.push(o.i);
      last.pos = (last.pos * (last.idx.length - 1) + o.v) / last.idx.length;
      last.sumR += Math.max(R[o.i], 0);
    } else out.push({ pos: o.v, idx: [o.i], sumR: Math.max(R[o.i], 0) });
  }
  return out;
}

export function stmDesign(a: StmArgs): StmResult {
  const betaS = a.crackMesh ? 0.75 : 0.6 * a.lambda;
  const fce = 0.85 * 1.0 * betaS * a.fc;
  const nx = new Set(a.pts.map((p) => Math.round(p.x * 20))).size;
  const ny = new Set(a.pts.map((p) => Math.round(p.y * 20))).size;
  const betaNPile = nx > 1 && ny > 1 ? 0.6 : 0.8;
  const nodeColLimit = PHI * 0.85 * 1.0 * a.fc;
  const nodePileLimit = PHI * 0.85 * betaNPile * a.fc;

  const dMin = Math.min(a.dX, a.dY);
  const hTie = a.cover + Math.max(a.dbX, a.dbY) / 2;
  // profundidad mínima de la zona de compresión por flexión (bloque rectangular con el acero colocado)
  const flexA = (d: number, asPerM: number, b: number, colPerp: number) => {
    const bc = Math.min(b, colPerp + d);
    return (((asPerM * b) / 1e4) * a.fy) / (0.85 * a.fc * Math.max(bc, 1e-3));
  };
  const aFlex = Math.max(flexA(a.dX, a.asX, a.rect.L, a.colW.y), flexA(a.dY, a.asY, a.rect.B, a.colW.x));
  const wtPile = 2 * hTie;
  const lbPile = Math.sqrt(a.Apile);

  let best: StmResult | null = null;
  for (const cb of a.combos) {
    const uplift = cb.R.some((r) => r < -1e-6);
    const Rp = cb.R.map((r) => Math.max(r, 0));
    const sumR = Rp.reduce((s, v) => s + v, 0) || 1;
    const ls = a.pts.map((q) => Math.hypot(q.x - a.col.x, q.y - a.col.y));
    // la profundidad del nodo superior (hidrostático) y el brazo z dependen entre sí: iteración
    let z = dMin - aFlex / 2;
    let wt = aFlex;
    for (let k = 0; k < 12; k++) {
      let w = aFlex;
      a.pts.forEach((_, i) => {
        const lb = Math.sqrt((a.col.A * Rp[i]) / sumR);
        w = Math.max(w, (lb * ls[i]) / Math.max(z, 1e-6));
      });
      wt = w;
      z = Math.max(dMin - wt / 2, 0.5 * dMin);
    }
    const hNode = hTie + z;
    const struts: StmStrut[] = a.pts.map((q, i) => {
      const l = ls[i];
      const theta = Math.atan2(z, Math.max(l, 1e-6));
      const sinT = Math.sin(theta), cosT = Math.cos(theta);
      const C = Rp[i] / sinT;
      const lbC = Math.sqrt((a.col.A * Rp[i]) / sumR);
      const AcsCol = (lbC * sinT + wt * cosT) * lbC;
      const AcsPile = (lbPile * sinT + wtPile * cosT) * lbPile;
      const Acs = Math.min(AcsCol, AcsPile);
      const phiFns = PHI * fce * Acs * 1000;
      return {
        i, R: Rp[i], l, theta, C, AcsCol, AcsPile, phiFns, ratio: C / Math.max(phiFns, 1e-9),
        nodeColStress: C / Math.max(AcsCol, 1e-9) / 1000, nodePileStress: C / Math.max(AcsPile, 1e-9) / 1000,
      };
    });
    const mkTie = (axis: 'x' | 'y'): StmTie => {
      const c0 = axis === 'x' ? a.col.x : a.col.y;
      let pos = 0, neg = 0;
      a.pts.forEach((q, i) => {
        const dxy = (axis === 'x' ? q.x : q.y) - c0;
        const f = (Rp[i] * Math.abs(dxy)) / z;
        if (dxy > 0) pos += f; else neg += f;
      });
      const T = Math.max(pos, neg);
      const bs = bands(a.pts, Rp, axis, a.Dp);
      const asM = axis === 'x' ? a.asX : a.asY;
      const dd = axis === 'x' ? a.dX : a.dY;
      const out = bs.map((b, k) => {
        const gapPrev = k > 0 ? b.pos - bs[k - 1].pos : Infinity;
        const gapNext = k < bs.length - 1 ? bs[k + 1].pos - b.pos : Infinity;
        const w = Math.min(a.Dp + dd, Math.min(gapPrev, gapNext));
        const asProv = asM * w; // cm² (asM en cm²/m, w en m)
        const Tb = T * (b.sumR / sumR);
        const phiTn = PHI * (asProv / 1e4) * a.fy * 1000;
        return { pos: b.pos, T: Tb, width: w, asProv, phiTn, ratio: Tb / Math.max(phiTn, 1e-9), x0: 0, x1: 0 };
      });
      const AsReq = (T / (PHI * a.fy * 1000)) * 1e4;
      return { axis, T, bands: out, AsReq, ratio: Math.max(...out.map((o) => o.ratio), 0) };
    };
    const tieX = mkTie('x');
    const tieY = mkTie('y');
    const ratioStrut = Math.max(...struts.map((s) => s.ratio), 0);
    const ratioNodeCol = Math.max(...struts.map((s) => s.nodeColStress / nodeColLimit), cb.P / a.col.A / 1000 / nodeColLimit);
    const ratioNodePile = Math.max(...struts.map((s) => s.nodePileStress / nodePileLimit), ...struts.map((s) => s.R / a.Apile / 1000 / nodePileLimit), 0);
    const ratioTie = Math.max(tieX.ratio, tieY.ratio);
    const res: StmResult = {
      combo: cb.name, zx: z, zy: z, z, ax: aFlex, ay: wt, hTie, hNode, struts, tieX, tieY, fce, betaS, betaNPile, nodeColLimit, nodePileLimit,
      ratioStrut, ratioNodeCol, ratioNodePile, ratioTie, ratio: Math.max(ratioStrut, ratioNodeCol, ratioNodePile, ratioTie), uplift, aOverD: 0, deep: false,
    };
    if (!best || res.ratio > best.ratio) best = res;
  }
  if (!best) {
    const z0 = dMin - aFlex / 2;
    return {
      combo: '—', zx: z0, zy: z0, z: z0, ax: aFlex, ay: aFlex, hTie, hNode: hTie + z0, struts: [], tieX: { axis: 'x', T: 0, bands: [], AsReq: 0, ratio: 0 }, tieY: { axis: 'y', T: 0, bands: [], AsReq: 0, ratio: 0 },
      fce, betaS, betaNPile, nodeColLimit, nodePileLimit, ratioStrut: 0, ratioNodeCol: 0, ratioNodePile: 0, ratioTie: 0, ratio: 0, uplift: false, aOverD: 0, deep: false,
    };
  }
  return best;
}
