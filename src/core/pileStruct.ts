// Capacidad estructural del pilote: concreto reforzado (ACI 318) y acero (AISC 360). Unidades: kN, m, MPa.
import { PileDef, HP_SHAPES } from './pileTypes';
import { findBar } from './materials';
import { beta1 } from './concrete';

const IN = 0.0254;
const ES = 200000; // MPa

export interface PileProps {
  /** ancho de referencia para reglas de apoyo del cabezal, m */
  Dp: number;
  /** área transversal estructural, m² */
  A: number;
  /** perímetro para fricción lateral, m */
  perim: number;
  /** área de punta, m² */
  Atip: number;
  /** inercia y módulo plástico en el eje de flexión, m⁴ / m³ */
  I: number;
  Z: number;
  /** radio de giro del eje débil / eje de flexión, m */
  r: number;
  /** EI de la sección para el análisis lateral, kN·m² */
  EI: number;
  /** peso por metro, kN/m */
  w: number;
  label: string;
  /** relación D/t (tubo) o b/t del ala (H) */
  slender?: number;
}

export function hpShape(id: string) {
  return HP_SHAPES.find((h) => h.id === id) ?? HP_SHAPES[2];
}

function ibeam(d: number, bf: number, tf: number, tw: number, axis: 'weak' | 'strong') {
  const hw = d - 2 * tf;
  const A = 2 * bf * tf + hw * tw;
  const Ix = (bf * d ** 3 - (bf - tw) * hw ** 3) / 12;
  const Iy = (2 * tf * bf ** 3 + hw * tw ** 3) / 12;
  const Zx = bf * tf * (d - tf) + (tw * hw * hw) / 4;
  const Zy = (tf * bf * bf) / 2 + (hw * tw * tw) / 4;
  return { A, Ix, Iy, Zx, Zy, I: axis === 'weak' ? Iy : Ix, Z: axis === 'weak' ? Zy : Zx, rmin: Math.sqrt(Math.min(Ix, Iy) / A), rb: Math.sqrt((axis === 'weak' ? Iy : Ix) / A) };
}

export function pileProps(p: PileDef): PileProps {
  if (p.kind === 'concrete') {
    const A = p.shape === 'circle' ? (Math.PI * p.D ** 2) / 4 : p.D ** 2;
    const I = p.shape === 'circle' ? (Math.PI * p.D ** 4) / 64 : p.D ** 4 / 12;
    const Ec = 4700 * Math.sqrt(p.fc);
    const bar = findBar(p.bar);
    const Ast = (p.nBars * bar.area) / 1e4;
    return {
      Dp: p.D, A, perim: p.shape === 'circle' ? Math.PI * p.D : 4 * p.D, Atip: A, I, Z: p.shape === 'circle' ? p.D ** 3 / 6 : p.D ** 3 / 4, r: Math.sqrt(I / A),
      EI: 0.5 * Ec * 1000 * I, w: 24 * A + 0 * Ast, label: p.shape === 'circle' ? `Ø ${(p.D * 100).toFixed(0)} cm` : `${(p.D * 100).toFixed(0)} × ${(p.D * 100).toFixed(0)} cm`,
    };
  }
  if (p.kind === 'pipe') {
    const Dn = p.D - 2 * p.tc;
    const tn = Math.max(p.t - p.tc, 1e-4);
    const Di = Dn - 2 * tn;
    const A = (Math.PI * (Dn ** 2 - Di ** 2)) / 4;
    const I = (Math.PI * (Dn ** 4 - Di ** 4)) / 64;
    const Z = (Dn ** 3 - Di ** 3) / 6;
    return {
      Dp: p.D, A, perim: Math.PI * p.D, Atip: p.plug ? (Math.PI * p.D ** 2) / 4 : (Math.PI * (p.D ** 2 - (p.D - 2 * p.t) ** 2)) / 4, I, Z, r: Math.sqrt(I / A),
      EI: (ES * 1000) * I, w: 77 * A, label: `Tubo Ø ${(p.D * 1000).toFixed(0)} × ${(p.t * 1000).toFixed(1)} mm`, slender: Dn / tn,
    };
  }
  const h = hpShape(p.hp);
  const d = h.d * IN - 2 * p.tc, bf = h.bf * IN - 2 * p.tc, tf = h.tf * IN - 2 * p.tc, tw = h.tw * IN - 2 * p.tc;
  const s = ibeam(d, bf, tf, tw, p.axis);
  return {
    Dp: Math.sqrt(h.d * IN * h.bf * IN), A: s.A, perim: 2 * (h.d * IN + h.bf * IN), Atip: p.plug ? h.d * IN * h.bf * IN : s.A, I: s.I, Z: s.Z, r: s.rmin,
    EI: ES * 1000 * s.I, w: 77 * s.A, label: `${h.id} (eje ${p.axis === 'weak' ? 'débil' : 'fuerte'})`, slender: bf / 2 / tf,
  };
}

// ---------------------------------------------------------------- concreto
export interface PMPoint {
  c: number;
  Pn: number;
  Mn: number;
  phi: number;
}

function barLayout(p: PileDef): { y: number; a: number }[] {
  // coordenadas y medidas desde el centro, m; a en m²
  const bar = findBar(p.bar);
  const tie = findBar(p.tieBar);
  const a = bar.area / 1e4;
  const out: { y: number; a: number }[] = [];
  const inset = p.cover + tie.db / 1000 + bar.db / 2000;
  if (p.shape === 'circle') {
    const R = p.D / 2 - inset;
    for (let i = 0; i < p.nBars; i++) out.push({ y: R * Math.cos((2 * Math.PI * i) / p.nBars), a });
  } else {
    const half = p.D / 2 - inset;
    const per = 8 * half;
    for (let i = 0; i < p.nBars; i++) {
      let s = (per * i) / p.nBars; // distancia a lo largo del perímetro desde la esquina (-h,-h)
      let y: number;
      if (s < 2 * half) y = -half;
      else if (s < 4 * half) { s -= 2 * half; y = -half + s; }
      else if (s < 6 * half) y = half;
      else { s -= 6 * half; y = half - s; }
      out.push({ y, a });
    }
  }
  return out;
}

/** Área comprimida y su centroide (desde la fibra superior) para una profundidad a del bloque. */
function compBlock(p: PileDef, a: number): { A: number; yc: number } {
  const D = p.D;
  if (a <= 0) return { A: 0, yc: 0 };
  if (p.shape === 'square') {
    const aa = Math.min(a, D);
    return { A: D * aa, yc: aa / 2 };
  }
  const R = D / 2;
  if (a >= D) return { A: Math.PI * R * R, yc: R };
  // segmento circular de altura a
  const th = 2 * Math.acos((R - a) / R);
  const A = (R * R * (th - Math.sin(th))) / 2;
  // distancia del centroide del segmento al centro del círculo: 4R·sin³(θ/2) / (3(θ − sinθ)); desde el borde superior: R − dist
  const dist = (4 * R * Math.sin(th / 2) ** 3) / (3 * (th - Math.sin(th)));
  return { A, yc: R - dist };
}

export function concreteCurve(p: PileDef, n = 90): { pts: PMPoint[]; PnMax: number; Pt: number; phiPo: number } {
  const D = p.D;
  const fc = p.fc;
  const fy = p.fy;
  const b1 = beta1(fc);
  const bars = barLayout(p);
  const Ag = p.shape === 'circle' ? (Math.PI * D * D) / 4 : D * D;
  const Ast = bars.reduce((s, b) => s + b.a, 0);
  const phiC = p.spiral ? 0.75 : 0.65;
  const Po = 0.85 * fc * (Ag - Ast) * 1000 + fy * Ast * 1000;
  const PnMax = (p.spiral ? 0.85 : 0.8) * Po;
  const pts: PMPoint[] = [];
  const epsY = fy / ES;
  for (let i = 0; i <= n; i++) {
    const c = D * (0.04 + (i / n) ** 1.6 * 2.2);
    const a = Math.min(b1 * c, D);
    const blk = compBlock(p, a);
    let Pn = 0.85 * fc * blk.A * 1000;
    let Mn = Pn * (D / 2 - blk.yc);
    let epsT = 0;
    for (const b of bars) {
      const depth = D / 2 + b.y; // desde la fibra superior (y positivo hacia abajo)
      const eps = (0.003 * (c - depth)) / c; // + compresión
      epsT = Math.max(epsT, -eps);
      const fs = Math.max(-fy, Math.min(fy, ES * eps));
      const inBlock = depth <= a ? 0.85 * fc : 0;
      const F = (fs - inBlock) * b.a * 1000;
      Pn += F;
      Mn += F * (D / 2 - depth);
    }
    const phi = epsT <= epsY ? phiC : epsT >= epsY + 0.003 ? 0.9 : phiC + ((0.9 - phiC) * (epsT - epsY)) / 0.003;
    pts.push({ c, Pn, Mn: Math.abs(Mn), phi });
  }
  return { pts, PnMax, Pt: -fy * Ast * 1000, phiPo: phiC * PnMax };
}

/** φMn disponible para una carga axial Pu (compresión +). Devuelve 0 si Pu excede la capacidad axial. */
export function concretePhiMn(p: PileDef, Pu: number): { phiMn: number; phiPnMax: number; phiPt: number } {
  const cv = concreteCurve(p);
  const phiC = p.spiral ? 0.75 : 0.65;
  const phiPnMax = phiC * cv.PnMax;
  const phiPt = 0.9 * cv.Pt; // negativo
  if (Pu > phiPnMax + 1e-9 || Pu < phiPt - 1e-9) return { phiMn: 0, phiPnMax, phiPt };
  // curva φPn–φMn desde tracción pura (c→0) hasta compresión
  const curve = [{ P: phiPt, M: 0 }, ...cv.pts.map((q) => ({ P: Math.min(q.phi * q.Pn, phiPnMax), M: q.phi * q.Mn })), { P: phiPnMax, M: 0 }];
  let best = 0;
  for (let i = 0; i < curve.length - 1; i++) {
    const a = curve[i], b = curve[i + 1];
    if ((a.P - Pu) * (b.P - Pu) <= 0 && Math.abs(b.P - a.P) > 1e-9) {
      const t = (Pu - a.P) / (b.P - a.P);
      best = Math.max(best, a.M + t * (b.M - a.M));
    }
  }
  return { phiMn: best, phiPnMax, phiPt };
}

export function concreteShear(p: PileDef, Vu: number, Pu: number): { phiVc: number; phiVs: number; phiVn: number; ratio: number; Av: number; text: string } {
  const bw = p.D;
  const d = 0.8 * p.D;
  const Ag = p.shape === 'circle' ? (Math.PI * p.D ** 2) / 4 : p.D ** 2;
  const Nu = Math.max(Pu, 0);
  const Vc = (0.17 * (1 + Nu / (14 * Ag * 1000)) * Math.sqrt(p.fc) * bw * d) * 1000;
  const tie = findBar(p.tieBar);
  // circular con espiral: dos ramas por corte; cuadrado: dos ramas del estribo
  const Av = 2 * tie.area / 1e4;
  const Vs = (Av * 420 * d * 1000) / Math.max(p.tieS, 0.02);
  const phiVc = 0.75 * Vc;
  const phiVs = 0.75 * Math.min(Vs, 0.66 * Math.sqrt(p.fc) * bw * d * 1000);
  const phiVn = phiVc + phiVs;
  return { phiVc, phiVs, phiVn, ratio: phiVn > 0 ? Vu / phiVn : Infinity, Av: Av * 1e4, text: `${p.tieBar} @ ${(p.tieS * 100).toFixed(0)} cm` };
}

export function concreteSteelRatio(p: PileDef): { Ast: number; rho: number; ok: boolean } {
  const Ag = p.shape === 'circle' ? (Math.PI * p.D ** 2) / 4 : p.D ** 2;
  const Ast = (p.nBars * findBar(p.bar).area) / 1e4;
  const rho = Ast / Ag;
  return { Ast: Ast * 1e4, rho, ok: rho >= 0.005 && rho <= 0.08 };
}

// ---------------------------------------------------------------- acero (AISC 360, LRFD)
export interface SteelCap {
  KLr: number;
  Fe: number;
  Fcr: number;
  phiPn: number;
  phiPt: number;
  phiMn: number;
  Ag: number;
  compact: boolean;
  limit: number;
}

export function steelCapacity(p: PileDef, props: PileProps, T: number): SteelCap {
  const Fy = p.Fy;
  // longitud de pandeo: tramo libre + profundidad al empotramiento aparente (1.8 T)
  const Lk = p.K * (p.Lu + (p.Lu > 0 ? 1.8 * T : 0));
  const KLr = props.r > 0 ? Lk / props.r : 0;
  const Fe = KLr > 1e-9 ? (Math.PI ** 2 * ES) / KLr ** 2 : Infinity;
  const Fcr = KLr <= 4.71 * Math.sqrt(ES / Fy) ? Math.pow(0.658, Fy / Fe) * Fy : 0.877 * Fe;
  const lim = p.kind === 'pipe' ? 0.07 * (ES / Fy) : 0.38 * Math.sqrt(ES / Fy);
  const compact = (props.slender ?? 0) <= lim;
  return {
    KLr, Fe, Fcr, Ag: props.A, phiPn: 0.9 * Fcr * props.A * 1000, phiPt: 0.9 * Fy * props.A * 1000, phiMn: 0.9 * Fy * props.Z * 1000, compact, limit: lim,
  };
}

/** Interacción AISC H1-1 (a/b). */
export function steelInteraction(Pu: number, Mu: number, phiPn: number, phiPt: number, phiMn: number): { ratio: number; eq: string } {
  const Pc = Pu >= 0 ? phiPn : phiPt;
  const r = Math.abs(Pu) / Math.max(Pc, 1e-9);
  const m = Mu / Math.max(phiMn, 1e-9);
  return r >= 0.2 ? { ratio: r + (8 / 9) * m, eq: 'H1-1a: Pr/Pc + 8/9·Mr/Mc' } : { ratio: r / 2 + m, eq: 'H1-1b: Pr/(2Pc) + Mr/Mc' };
}

// ---------------------------------------------------------------- análisis lateral
export interface Lateral {
  T: number;
  y: number;
  M: number;
  /** longitud de fijación aparente, m */
  Ld: number;
}

/** Pilote cargado lateralmente en suelo con nh (Matlock–Reese): T = (EI/nh)^(1/5). H en kN. */
export function lateralPile(p: PileDef, EI: number, H: number): Lateral {
  const nh = Math.max(p.nh, 1);
  const T = Math.pow(EI / nh, 0.2);
  const fixed = p.head === 'fixed';
  const Ay = fixed ? 0.93 : 2.435;
  let y = (Ay * H * T ** 3) / EI;
  let M = fixed ? 0.93 * H * T : 0.772 * H * T;
  if (p.Lu > 0) {
    // tramo libre sobre el terreno (cabeza fija: ménsula doble empotrada)
    y += fixed ? (H * p.Lu ** 3) / (12 * EI) : (H * p.Lu ** 3) / (3 * EI);
    M = fixed ? (H * (p.Lu + 1.85 * T)) / 2 : H * (p.Lu + 0.772 * T);
  }
  return { T, y, M, Ld: 1.8 * T };
}
