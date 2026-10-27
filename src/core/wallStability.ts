// Estabilidad de muros de retención: volcamiento, deslizamiento y presiones sobre el suelo.
// Referencia de momentos: punta del pie (x = 0) en la cara inferior de la zapata (y = 0). Valores por metro de muro.

import { WallGeom, soilWeight } from './wallGeom';
import { FaceThrust, faceThrust, kaCoulomb, kaRankine, kaeMononobe, kpRankine, passiveForce, rad, GAMMA_W, Thrust } from './earth';
import { isGravity } from './wallTypes';
import { clipHalfPlane, polyProps } from './geometry';

export interface Factors {
  dead: number;
  /** factor de la sobrecarga como peso vertical */
  liveV: number;
  soilH: number;
  liveH: number;
  water: number;
  eq: number;
}

export interface VForce {
  name: string;
  V: number; // kN/m, positivo hacia abajo
  x: number;
  M: number;
}
export interface HForce {
  name: string;
  H: number; // kN/m, positivo hacia el frente (empuja al muro)
  y: number;
  M: number;
}

export interface EarthModel {
  mode: 'virtual' | 'face';
  theoryLabel: string;
  Ka: number;
  Kae: number | null;
  deltaDeg: number;
  psiDeg: number;
  /** altura vertical del plano de empuje */
  Hv: number;
  /** ordenada de la base del plano de empuje sobre la cara inferior de la zapata */
  y0: number;
  zw: number;
  face: FaceThrust;
  /** empuje sobre la cara posterior de la zapata (solo modelo de cara) */
  band: { Ph: number; Pv: number; y: number } | null;
  kpFront: number;
}

export function earthModel(g: WallGeom, seismic: boolean): EarthModel {
  const inp = g.inp;
  const phi = inp.fill.phi;
  const beta = inp.fill.beta;
  const faceMode = inp.theory === 'coulomb' && isGravity(inp.type);
  const kh = seismic ? inp.seismic.kh : 0;
  const kv = seismic ? inp.seismic.kv : 0;
  if (!faceMode) {
    const Ka = kaRankine(phi, beta);
    const delta = beta;
    const Kae = seismic ? kaeMononobe(phi, delta, 90, beta, kh, kv) : null;
    const Hv = g.yPlane;
    const zw = inp.hw > 0 ? Math.max(g.yPlane - inp.hw, 0) : Infinity;
    const face = faceThrust({ Ka, deltaDeg: delta, psiDeg: 0, Hv, q: inp.fill.q, gamma: inp.fill.gamma, gammaSat: inp.fill.gammaSat, zw, kae: Kae ?? undefined, kv });
    return { mode: 'virtual', theoryLabel: 'Rankine (plano vertical virtual en el extremo del talón)', Ka, Kae, deltaDeg: delta, psiDeg: 0, Hv, y0: 0, zw, face, band: null, kpFront: kpRankine(inp.found.phi) };
  }
  const psi = g.psiDeg;
  const alpha = 90 - psi;
  const delta = inp.delta;
  const Ka = kaCoulomb(phi, delta, alpha, beta);
  const Kae = seismic ? kaeMononobe(phi, delta, alpha, beta, kh, kv) : null;
  const Hv = inp.H;
  const zw = inp.hw > g.hb ? Math.max(g.yTop - inp.hw, 0) : Infinity;
  const kappa = Math.sin(rad(alpha)) / Math.sin(rad(alpha + beta));
  const face = faceThrust({ Ka, deltaDeg: delta, psiDeg: psi, Hv, q: inp.fill.q, gamma: inp.fill.gamma, gammaSat: inp.fill.gammaSat, zw, kae: Kae ?? undefined, kv, surchargeFactor: kappa });
  // Banda de la cara posterior de la zapata (Rankine, plano vertical)
  let band: EarthModel['band'] = null;
  if (g.hb > 1e-6) {
    const KaR = kaRankine(phi, beta);
    const zwR = inp.hw > 0 ? Math.max(g.yPlane - inp.hw, 0) : Infinity;
    const mk = (Hv2: number) =>
      faceThrust({ Ka: KaR, deltaDeg: beta, psiDeg: 0, Hv: Hv2, q: inp.fill.q, gamma: inp.fill.gamma, gammaSat: inp.fill.gammaSat, zw: zwR });
    const full = mk(g.yPlane).total;
    const upper = mk(Math.max(g.yPlane - g.hb, 0)).total;
    const Ph = full.Ph - upper.Ph;
    const Pv = full.Pv - upper.Pv;
    const M = full.Ph * full.y - upper.Ph * (upper.y + g.hb);
    band = { Ph, Pv, y: Ph > 1e-12 ? M / Ph : g.hb / 2 };
  }
  return { mode: 'face', theoryLabel: 'Coulomb (sobre la cara posterior real)', Ka, Kae, deltaDeg: delta, psiDeg: psi, Hv, y0: g.hb, zw, face, band, kpFront: kpRankine(inp.found.phi) };
}

export interface BearingCapacity {
  Nq: number;
  Nc: number;
  Ng: number;
  dq: number;
  dc: number;
  iq: number;
  ic: number;
  ig: number;
  Bp: number;
  qSur: number;
  qult: number;
  qa: number;
}

export interface CaseResult {
  label: string;
  seismic: boolean;
  factors: Factors;
  v: VForce[];
  h: HForce[];
  passive: { F: number; Fall: number; z1: number; z2: number; y: number; Kp: number } | null;
  SumV: number;
  SumH: number;
  Mres: number;
  Mot: number;
  FSot: number;
  mu: number;
  cohesion: number;
  Rfric: number;
  Rcoh: number;
  Rpass: number;
  FSsl: number;
  xbar: number;
  e: number;
  B: number;
  fullContact: boolean;
  contactLen: number;
  qToe: number;
  qHeel: number;
  qmax: number;
  qmin: number;
  qaAllow: number;
  bearing: BearingCapacity | null;
  fsOTreq: number;
  fsSLreq: number;
  uplift: number;
  ok: { ot: boolean; sl: boolean; q: boolean; e: boolean };
  /** presión de contacto q(x) para x desde la punta del pie */
  qAt: (x: number) => number;
  /** subpresión u(x) */
  uAt: (x: number) => number;
}

export function bearingCapacity(g: WallGeom, SumV: number, SumH: number, e: number): BearingCapacity | null {
  const f = g.inp.found;
  const phi = rad(f.phi);
  const Bp = Math.max(g.B - 2 * Math.abs(e), 0.05);
  const Nq = Math.exp(Math.PI * Math.tan(phi)) * Math.tan(rad(45 + f.phi / 2)) ** 2;
  const Nc = f.phi > 0.01 ? (Nq - 1) / Math.tan(phi) : 5.14;
  const Ng = 2 * (Nq + 1) * Math.tan(phi);
  const D = Math.max(g.inp.Df, 0);
  const qSur = f.gamma * D;
  const k = Math.atan(D / Bp);
  const dq = 1 + 2 * Math.tan(phi) * (1 - Math.sin(phi)) ** 2 * k;
  const dc = f.phi > 0.01 ? dq - (1 - dq) / (Nc * Math.tan(phi)) : 1 + 0.4 * k;
  const theta = (Math.atan2(SumH, Math.max(SumV, 1e-9)) * 180) / Math.PI;
  const iq = Math.max(1 - theta / 90, 0) ** 2;
  const ic = iq;
  const ig = f.phi > 0.01 ? Math.max(1 - theta / f.phi, 0) ** 2 : 0;
  const qult = f.c * Nc * dc * ic + qSur * Nq * dq * iq + 0.5 * f.gamma * Bp * Ng * ig;
  return { Nq, Nc, Ng, dq, dc, iq, ic, ig, Bp, qSur, qult, qa: qult / f.fsBearing };
}

export function evalCase(
  g: WallGeom,
  label: string,
  fac: Factors,
  seismic: boolean,
  opts: { passive: boolean; surchargeV: boolean; strength?: boolean },
): CaseResult {
  const inp = g.inp;
  const em = earthModel(g, seismic);
  const kv = seismic ? inp.seismic.kv : 0;
  const kh = seismic ? inp.seismic.kh : 0;
  const dead = fac.dead * (1 - kv);
  const v: VForce[] = [];
  const h: HForce[] = [];
  const addV = (name: string, V: number, x: number) => {
    if (Math.abs(V) > 1e-9) v.push({ name, V, x, M: V * x });
  };
  const addH = (name: string, H: number, y: number) => {
    if (Math.abs(H) > 1e-9) h.push({ name, H, y, M: H * y });
  };

  // Peso propio
  let Wwall = 0, WwallY = 0;
  for (const p of g.parts) {
    addV(`Peso de ${p.name.toLowerCase()}`, p.W * dead, p.x);
    Wwall += p.W;
    WwallY += p.W * p.y;
  }
  // Suelo sobre el talón y sobre el pie
  const hs = soilWeight(g.heelSoilPoly, inp.fill.gamma, inp.fill.gammaSat, g.yWater);
  let heelW = hs.W;
  // El suelo desplazado por contrafuertes internos
  const cf = g.parts.find((p) => p.id === 'cf');
  if (cf && inp.type === 'counterfortInt') heelW -= cf.W * (inp.fill.gamma / inp.mat.gammaC);
  addV('Suelo sobre el talón', heelW * dead, hs.x);
  if (inp.includeToeSoil && g.toeSoilPoly) {
    const ts = soilWeight(g.toeSoilPoly, inp.found.gamma, inp.found.gamma, -Infinity);
    let toeW = ts.W;
    if (cf && inp.type === 'counterfortExt') {
      // descontar el suelo que ocupa el contrafuerte exterior (parte del contrafuerte bajo el terreno)
      const below = clipHalfPlane(cf.poly, 0, -1, Math.max(inp.Df, g.hb));
      toeW -= polyProps(below).A * (inp.cf.t / inp.cf.s) * inp.found.gamma;
    }
    addV('Suelo sobre el pie', toeW * dead, ts.x);
  }
  // Sobrecarga sobre el relleno
  if (opts.surchargeV && inp.fill.q > 0 && fac.liveV > 0) {
    const x0 = em.mode === 'virtual' ? g.xBt : g.xBb;
    const w = Math.max(g.B - x0, 0);
    addV('Sobrecarga sobre el relleno', inp.fill.q * w * fac.liveV, x0 + w / 2);
  }

  // Empuje de tierras
  const f = em.face;
  const mk = (name: string, t: Thrust, factor: number, vertKind: 'soil' | 'sur' | 'water') => {
    void vertKind;
    const yAbs = em.y0 + t.y;
    addH(name, t.Ph * factor, yAbs);
    if (Math.abs(t.Pv) > 1e-9) {
      const xv = em.mode === 'virtual' ? g.B : g.stemBackX(Math.max(Math.min(t.y, inp.H), 0));
      addV(`${name} (componente vertical)`, t.Pv * factor, xv);
    }
  };
  mk('Empuje activo del suelo', f.soil, fac.soilH, 'soil');
  if (inp.fill.q > 0) mk('Empuje por sobrecarga', f.surcharge, fac.liveH, 'sur');
  if (f.water.Ph > 1e-9) mk('Empuje hidrostático', f.water, fac.water, 'water');
  if (seismic && f.seismic.Ph > 1e-9) mk('Incremento sísmico ΔPae', f.seismic, fac.eq, 'soil');
  if (em.band && (em.band.Ph > 1e-9 || Math.abs(em.band.Pv) > 1e-9)) {
    addH('Empuje sobre el talón (cara de la zapata)', em.band.Ph * fac.soilH, em.band.y);
    if (Math.abs(em.band.Pv) > 1e-9) addV('Empuje sobre el talón (componente vertical)', em.band.Pv * fac.soilH, g.B);
  }
  if (seismic) {
    const inertia = kh * Wwall;
    addH('Inercia sísmica del muro', inertia * fac.eq, Wwall > 0 ? WwallY / Wwall : 0);
  }

  // Subpresión
  let uplift = 0;
  if (inp.hw > 0) {
    uplift = 0.5 * GAMMA_W * inp.hw * g.B * fac.water;
    addV('Subpresión del agua', -uplift, (2 * g.B) / 3);
  }

  const SumV = v.reduce((s, a) => s + a.V, 0);
  const SumH = h.reduce((s, a) => s + a.H, 0);
  const Mres = v.reduce((s, a) => s + a.M, 0);
  const Mot = h.reduce((s, a) => s + a.M, 0);
  const FSot = Mot > 1e-9 ? Mres / Mot : Infinity;

  // Pasivo (solo comprobación de servicio al deslizamiento)
  let passive: CaseResult['passive'] = null;
  let Rpass = 0;
  if (opts.passive && inp.passive.use) {
    const Kp = em.kpFront;
    const z2 = Math.max(inp.Df, g.hb) + (inp.key.enabled ? inp.key.d : 0);
    const z1 = Math.min(inp.passive.ignoreTop, z2);
    const pf = passiveForce(Kp, inp.found.gamma, inp.found.c, z1, z2);
    // altura sobre la cara inferior de la zapata
    const yAction = Math.max(Math.max(inp.Df, g.hb) - pf.zBar, -inp.key.d);
    passive = { F: pf.F * inp.passive.factor, Fall: pf.F, z1, z2, y: yAction, Kp };
    Rpass = passive.F;
  }

  // Fricción en la base
  const useSoil = inp.key.enabled && inp.found.useSoilFriction;
  const mu = useSoil ? Math.tan(rad(inp.found.phi)) : inp.found.mu;
  const cohesion = useSoil ? inp.found.c : inp.found.ca;

  // Posición de la resultante y presiones
  const xbar = SumV > 1e-9 ? (Mres - Mot) / SumV : -1;
  const e = g.B / 2 - xbar;
  let fullContact = true;
  let contactLen = g.B;
  let qToe = 0, qHeel = 0, qmax = Infinity, qmin = 0;
  if (SumV > 1e-9 && xbar > 0) {
    if (xbar >= g.B / 3) {
      qToe = (SumV / g.B) * (1 + (6 * e) / g.B);
      qHeel = (SumV / g.B) * (1 - (6 * e) / g.B);
      qmax = Math.max(qToe, qHeel);
      qmin = Math.min(qToe, qHeel);
      if (xbar > (2 * g.B) / 3) {
        // resultante hacia el talón con tracción en el pie: contacto parcial desde el talón
        const lc = 3 * (g.B - xbar);
        fullContact = false;
        contactLen = lc;
        qHeel = (2 * SumV) / lc;
        qToe = 0;
        qmax = qHeel;
        qmin = 0;
      }
    } else {
      fullContact = false;
      contactLen = 3 * xbar;
      qToe = (2 * SumV) / contactLen;
      qHeel = 0;
      qmax = qToe;
      qmin = 0;
    }
  } else {
    fullContact = false;
    contactLen = 0;
    qmax = Infinity;
  }
  const Bc = fullContact ? g.B : contactLen;
  const Rfric = mu * Math.max(SumV, 0);
  const Rcoh = cohesion * Bc;
  const FSsl = SumH > 1e-9 ? (Rfric + Rcoh + Rpass) / SumH : Infinity;

  const qAt = (x: number) => {
    if (SumV <= 1e-9 || xbar <= 0) return 0;
    if (fullContact) return qToe + ((qHeel - qToe) * x) / g.B;
    if (xbar < g.B / 3) return x <= contactLen ? qToe * (1 - x / contactLen) : 0;
    const x0 = g.B - contactLen;
    return x >= x0 ? qHeel * ((x - x0) / contactLen) : 0;
  };
  const uAt = (x: number) => (inp.hw > 0 ? (GAMMA_W * inp.hw * x * fac.water) / g.B : 0);

  const bearing = inp.found.bearingMode === 'calc' && SumV > 0 ? bearingCapacity(g, SumV, SumH, e) : null;
  const qaBase = bearing ? bearing.qa : inp.found.qa;
  const qaAllow = seismic ? qaBase * inp.factors.qaIncE : qaBase;
  const fsOTreq = seismic ? inp.factors.fsOTe : inp.factors.fsOT;
  const fsSLreq = seismic ? inp.factors.fsSLe : inp.factors.fsSL;
  return {
    label, seismic, factors: fac, v, h, passive, SumV, SumH, Mres, Mot, FSot, mu, cohesion, Rfric, Rcoh, Rpass, FSsl, xbar, e, B: g.B, fullContact, contactLen,
    qToe, qHeel, qmax, qmin, qaAllow, bearing, fsOTreq, fsSLreq, uplift,
    ok: {
      ot: FSot >= fsOTreq,
      sl: FSsl >= fsSLreq,
      q: qmax <= qaAllow + 1e-9,
      e: Math.abs(e) <= (seismic ? g.B / 3 : g.B / 6) + 1e-9,
    },
    qAt, uAt,
  };
}

export const SERVICE_FACTORS: Factors = { dead: 1, liveV: 1, soilH: 1, liveH: 1, water: 1, eq: 1 };
