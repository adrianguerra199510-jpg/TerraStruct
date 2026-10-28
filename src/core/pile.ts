// Análisis y diseño de grupos de pilotes y cabezales (ACI 318 / AISC 360). Unidades: kN, m, MPa.
import { Pt, bbox, convexHull, offsetConvex, perimeter, pointInPolygon, polyProps } from './geometry';
import { columnPoly } from './shapes';
import { chooseSpacing, findBar, developmentLength, hookDevelopment, barList, Detailing } from './materials';
import { flexureAs, flexureCapacity, oneWayVc, punchingVc, rhoMinSlab, PHI_FLEX, PHI_SHEAR } from './concrete';
import { PileInput, PileCombo, PileDef, SoilLayer, pilePositions, standardLayout } from './pileTypes';
import { stmDesign, StmResult } from './pileSTM';
import { liquefaction, settlement, groupLateral, effectiveStressProfile, layerIndexAt, LiqResult, SettleResult, GroupLateral } from './pileExtra';
import { PileProps, pileProps, concretePhiMn, concreteShear, concreteSteelRatio, steelCapacity, steelInteraction, lateralPile, SteelCap, Lateral } from './pileStruct';

export interface PCheck {
  name: string;
  ratio: number;
  ok: boolean;
  detail: string;
  advisory?: boolean;
}

// ---------------------------------------------------------------- reacciones
export function solveReactions(pts: Pt[], P: number, Qx: number, Qy: number): { R: number[]; unresolved: boolean } {
  const n = pts.length;
  if (!n) return { R: [], unresolved: false };
  const cx = pts.reduce((s, p) => s + p.x, 0) / n;
  const cy = pts.reduce((s, p) => s + p.y, 0) / n;
  let Sxx = 0, Syy = 0, Sxy = 0;
  for (const p of pts) {
    Sxx += (p.x - cx) ** 2;
    Syy += (p.y - cy) ** 2;
    Sxy += (p.x - cx) * (p.y - cy);
  }
  const mx = Qx - P * cx;
  const my = Qy - P * cy;
  const tr = Sxx + Syy;
  const det = Sxx * Syy - Sxy * Sxy;
  let a = 0, b = 0, unresolved = false;
  if (tr < 1e-9) unresolved = Math.hypot(mx, my) > 1e-6;
  else if (det > 1e-9 * tr * tr) {
    a = (mx * Syy - my * Sxy) / det;
    b = (my * Sxx - mx * Sxy) / det;
  } else {
    // grupo alineado: solo resiste momento en su propia dirección
    const l1 = tr / 2 + Math.sqrt(((Sxx - Syy) / 2) ** 2 + Sxy ** 2);
    let ux = 1, uy = 0;
    if (Math.abs(Sxy) > 1e-12) { ux = Sxy; uy = l1 - Sxx; const m = Math.hypot(ux, uy); ux /= m; uy /= m; }
    else if (Syy > Sxx) { ux = 0; uy = 1; }
    const mu = mx * ux + my * uy;
    const mp = -mx * uy + my * ux;
    a = (mu / l1) * ux;
    b = (mu / l1) * uy;
    unresolved = Math.abs(mp) > 1e-6 * Math.max(1, Math.abs(mu));
  }
  return { R: pts.map((p) => P / n + a * (p.x - cx) + b * (p.y - cy)), unresolved };
}

// ---------------------------------------------------------------- geotecnia
export interface GeoRow {
  layer: string;
  z0: number;
  z1: number;
  fs: number;
  Qs: number;
  note: string;
}
export interface GeoResult {
  mode: 'static' | 'user';
  rows: GeoRow[];
  Qs: number;
  Qb: number;
  qb: number;
  qbNote: string;
  Qult: number;
  QaC: number;
  QaT: number;
  Wpile: number;
  perim: number;
  Atip: number;
  /** fricción negativa total (kN) y su zona; capacidad con fricción negativa y post-licuación */
  Qneg: number;
  QaDD: number;
  QaLiq: number;
  QsLiq: number;
}

function nqOf(phi: number): number {
  const t = Math.tan((phi * Math.PI) / 180);
  return Math.exp(Math.PI * t) * Math.tan(Math.PI / 4 + (phi * Math.PI) / 360) ** 2;
}

export function geoCapacity(inp: PileInput, props: PileProps, liq?: LiqResult): GeoResult {
  const g = inp.geo;
  const p = inp.pile;
  const W = props.w * p.L;
  if (g.mode === 'user') {
    return { mode: 'user', rows: [], Qs: 0, Qb: 0, qb: 0, qbNote: '', Qult: 0, QaC: g.QaC, QaT: g.QaT, Wpile: W, perim: props.perim, Atip: props.Atip, Qneg: 0, QaDD: g.QaC, QaLiq: g.QaC, QsLiq: 0 };
  }
  const layers = g.layers.length ? g.layers : [];
  const dz = 0.25;
  const nS = Math.max(Math.ceil(p.L / dz), 1);
  const dzz = p.L / nS;
  const layerAt = (z: number): SoilLayer => {
    let acc = 0;
    for (const l of layers) {
      acc += l.thk;
      if (z <= acc + 1e-9) return l;
    }
    return layers[layers.length - 1];
  };
  const layerIdx = (z: number) => {
    let acc = 0;
    for (let i = 0; i < layers.length; i++) {
      acc += layers[i].thk;
      if (z <= acc + 1e-9) return i;
    }
    return layers.length - 1;
  };
  const sv = effectiveStressProfile(inp, nS * dzz, dzz).sv;
  const zc = 15 * props.Dp;
  const kc = Math.min(nS - 1, Math.max(0, Math.floor(zc / dzz)));
  const rowsMap = new Map<number, GeoRow>();
  let Qs = 0;
  let Qdd = 0;
  let QsLiq = 0;
  const zn = g.neutralFrac * p.L;
  const deltaOf = (phi: number) => (p.kind === 'concrete' ? 0.75 * phi : Math.max(phi - 5, 1));
  for (let k = 0; k < nS; k++) {
    const z = (k + 0.5) * dzz;
    const li = layerIdx(z);
    const l = layers[li];
    const svk = sv[Math.min(k, kc)];
    let fs = 0;
    let note = '';
    if (l.kind === 'cohesive') {
      const psi = l.su / Math.max(svk, 1e-6);
      const al = l.alpha > 0 ? l.alpha : Math.min(1, psi <= 1 ? 0.5 * Math.pow(psi, -0.5) : 0.5 * Math.pow(psi, -0.25));
      fs = Math.min(al * l.su, l.fsMax);
      note = `α = ${al.toFixed(2)}${l.alpha > 0 ? '' : ' (API)'}, su = ${l.su}`;
    } else if (l.kind === 'granular') {
      fs = Math.min(l.K * svk * Math.tan((deltaOf(l.phi) * Math.PI) / 180), l.fsMax);
      note = `K·tanδ·σ′v, δ = ${deltaOf(l.phi).toFixed(1)}°, φ = ${l.phi}°`;
    } else {
      fs = l.fs;
      note = 'fs ingresado';
    }
    const qs = fs * props.perim * dzz;
    Qs += qs;
    QsLiq += liq?.liquefied[li] ? qs * g.liqResid : qs;
    if (l.downdrag && z <= zn) Qdd += qs;
    const r = rowsMap.get(li) ?? { layer: l.name, z0: z - dzz / 2, z1: z + dzz / 2, fs: 0, Qs: 0, note };
    r.z1 = z + dzz / 2;
    r.fs += (fs * dzz); // se normaliza abajo
    r.Qs += qs;
    rowsMap.set(li, r);
  }
  const rows = [...rowsMap.values()].map((r) => ({ ...r, fs: r.fs / Math.max(r.z1 - r.z0, 1e-9) }));
  const lt = layerAt(p.L);
  const svTip = sv[Math.min(nS - 1, kc)];
  let qb = 0;
  let qbNote = '';
  if (lt.kind === 'cohesive') {
    qb = Math.min(9 * lt.su, g.qbMax);
    qbNote = `qb = 9·su = ${(9 * lt.su).toFixed(0)} kPa`;
  } else if (lt.kind === 'granular') {
    const Nq = lt.Nq > 0 ? lt.Nq : nqOf(lt.phi);
    qb = Math.min(Nq * svTip, g.qbMax);
    qbNote = `qb = Nq·σ′v = ${Nq.toFixed(1)}·${svTip.toFixed(0)}`;
  } else {
    qb = Math.min(lt.qb, g.qbMax);
    qbNote = 'qb ingresado';
  }
  const Qb = qb * props.Atip;
  const Qult = Qs + Qb;
  const QaC = Qult / g.FS;
  const QaT = (g.etaT * Qs) / g.FSt + W;
  const QaDD = Math.max(Qs - Qdd + Qb, 0) / g.FS;
  const QaLiq = (QsLiq + Qb) / 1.5;
  return { mode: 'static', rows, Qs, Qb, qb, qbNote, Qult, QaC, QaT, Wpile: W, perim: props.perim, Atip: props.Atip, Qneg: Qdd, QaDD, QaLiq, QsLiq };
}

/** Eficiencia de grupo de Converse–Labarre (solo distribuciones en malla). */
export function groupEfficiency(inp: PileInput, Dp: number): { Eg: number; applicable: boolean } {
  const l = inp.layout;
  if (l.mode !== 'grid' || l.nx * l.ny < 2) return { Eg: 1, applicable: false };
  const m = l.ny, n = l.nx;
  const s = Math.min(n > 1 ? l.sx : Infinity, m > 1 ? l.sy : Infinity);
  const th = (Math.atan(Dp / s) * 180) / Math.PI;
  const Eg = 1 - (th * ((n - 1) * m + (m - 1) * n)) / (90 * m * n);
  return { Eg: Math.min(1, Math.max(Eg, 0.3)), applicable: true };
}

// ---------------------------------------------------------------- resultados
export interface ComboRes {
  combo: PileCombo;
  Pcol: number;
  Ptot: number;
  R: number[];
  Rmax: number;
  Rmin: number;
  H: number;
  Hpile: number;
  unresolved: boolean;
  ratioC: number;
  ratioT: number;
  lat: Lateral;
  /** efecto de grupo lateral: multiplicadores p, fuerza por pilote y momento máximo */
  pm: number[];
  Hi: number[];
  Mmax: number;
  /** última: reacciones con peso propio factorizado para el pilote */
  Pu?: { max: number; min: number };
  Mu?: number;
}

export interface CapFlex {
  Mpos: number;
  Mneg: number;
  b: number;
  d: number;
  dTop: number;
  AsReq: number;
  AsMin: number;
  det: Detailing;
  asProv: number;
  phiMn: number;
  ratio: number;
  ok: boolean;
  bar: string;
  xs: number;
  top?: { AsReq: number; det: Detailing; asProv: number; Mu: number; ratio: number; ok: boolean; bar: string };
  ld: number;
  ldh: number;
  la: number;
  devOk: boolean;
  devText: string;
}
export interface CapShear {
  Vu: number;
  phiVc: number;
  ratio: number;
  bw: number;
  d: number;
  Vc: number;
  rho: number;
  xs: number;
  combo: string;
  ok: boolean;
  aOverD: number;
}
export interface CapPunch {
  Vu: number;
  bo: number;
  d: number;
  vu: number;
  phivc: number;
  ratio: number;
  ok: boolean;
  combo: string;
  vc: { vcA: number; vcB: number; vcC: number };
  beta: number;
  alphaS: number;
}
export interface PilePunch {
  i: number;
  Ru: number;
  bo: number;
  vu: number;
  phivc: number;
  ratio: number;
  ok: boolean;
  alphaS: number;
}

export interface PileResults {
  ok: boolean;
  checks: PCheck[];
  warnings: string[];
  pts: Pt[];
  n: number;
  capRect: { x0: number; x1: number; y0: number; y1: number; B: number; L: number };
  Wcap: number;
  props: PileProps;
  geo: GeoResult;
  Eg: { Eg: number; applicable: boolean };
  QaCeff: number;
  service: ComboRes[];
  ultimate: ComboRes[];
  steel?: SteelCap;
  conc?: { phiPnMax: number; phiPt: number; ratio: ReturnType<typeof concreteSteelRatio>; phiMn: number };
  worstC?: { res: ComboRes; Pu: number; Mu: number; ratio: number; phiMn: number; eq?: string };
  worstT?: { res: ComboRes; Pu: number; Mu: number; ratio: number; phiMn: number; eq?: string };
  shear?: { Vu: number; phiVn: number; ratio: number; text: string };
  lateral: { y: number; combo: string; T: number };
  minSpacing: number;
  flexX?: CapFlex;
  flexY?: CapFlex;
  shearX?: CapShear;
  shearY?: CapShear;
  punch?: CapPunch;
  pilePunch: PilePunch[];
  stm?: StmResult;
  liq: LiqResult;
  settle?: SettleResult;
  deep: boolean;
  dX: number;
  dY: number;
  concreteVolume: number;
  pileLength: number;
}

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));

function distToEdges(pt: Pt, poly: Pt[]): number {
  let m = Infinity;
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i], b = poly[(i + 1) % poly.length];
    const dx = b.x - a.x, dy = b.y - a.y;
    const L2 = dx * dx + dy * dy || 1e-12;
    const t = clamp01(((pt.x - a.x) * dx + (pt.y - a.y) * dy) / L2);
    m = Math.min(m, Math.hypot(pt.x - (a.x + t * dx), pt.y - (a.y + t * dy)));
  }
  return m;
}
const sdist = (pt: Pt, poly: Pt[]) => (pointInPolygon(pt, poly) ? -distToEdges(pt, poly) : distToEdges(pt, poly));

function capRect(inp: PileInput, pts: Pt[]) {
  const bb = bbox(pts.length ? pts : [{ x: 0, y: 0 }]);
  const cx = (bb.xmin + bb.xmax) / 2, cy = (bb.ymin + bb.ymax) / 2;
  const B = inp.cap.manualSize ? inp.cap.B : bb.xmax - bb.xmin + 2 * inp.cap.edge;
  const L = inp.cap.manualSize ? inp.cap.L : bb.ymax - bb.ymin + 2 * inp.cap.edge;
  return { x0: cx - B / 2, x1: cx + B / 2, y0: cy - L / 2, y1: cy + L / 2, B, L };
}

export function analyzePile(inp: PileInput): PileResults {
  const p = inp.pile;
  const cap = inp.cap;
  const pts = pilePositions(inp.layout);
  const n = pts.length;
  const warnings: string[] = [];
  const checks: PCheck[] = [];
  const props = pileProps(p);
  const rect = capRect(inp, pts);
  const Wcap = cap.gammaC * rect.B * rect.L * cap.h;
  const liq = liquefaction(inp);
  const geo = geoCapacity(inp, props, liq);
  const Eg = groupEfficiency(inp, props.Dp);
  const QaCeff = geo.QaC * (inp.geo.groupEff && Eg.applicable ? Eg.Eg : 1);
  const fcap = { x: (rect.x0 + rect.x1) / 2, y: (rect.y0 + rect.y1) / 2 };
  const col = inp.column;
  const colPoly = columnPoly(col.geom, col.x, col.y);
  const cbb = bbox(colPoly);

  // ---------- reacciones por combinación
  const combine = (cb: PileCombo): ComboRes => {
    const Mxb = cb.Mx + cb.Vy * cap.h;
    const Myb = cb.My + cb.Vx * cap.h;
    const Pt0 = cb.P + Wcap;
    const sol = solveReactions(pts, Pt0, cb.P * col.x + Myb + Wcap * fcap.x, cb.P * col.y + Mxb + Wcap * fcap.y);
    const H = Math.hypot(cb.Vx, cb.Vy);
    // reparto lateral con efecto de grupo: mismo desplazamiento en todos los pilotes, rigidez ∝ (p·nh)^0.6
    const gl = groupLateral(pts, props.Dp, cb.Vx, cb.Vy);
    const wts = gl.pm.map((m) => Math.pow(m, 0.6));
    const sw = wts.reduce((a, b) => a + b, 0) || 1;
    const Hi = wts.map((w) => (H * w) / sw);
    const lats = Hi.map((h, i) => lateralPile({ ...p, nh: p.nh * gl.pm[i] }, props.EI, h));
    let kmax = 0;
    lats.forEach((l, i) => { if (l.M > (lats[kmax]?.M ?? 0)) kmax = i; });
    const latC = lats[kmax] ?? lateralPile(p, props.EI, 0);
    const Hpile = n ? Math.max(...Hi, 0) : 0;
    const R = sol.R;
    const Rmax = n ? Math.max(...R) : 0;
    const Rmin = n ? Math.min(...R) : 0;
    const qf = cb.kind === 'service' ? cb.qaFactor : 1;
    return {
      combo: cb, Pcol: cb.P, Ptot: Pt0, R, Rmax, Rmin, H, Hpile, unresolved: sol.unresolved,
      ratioC: Rmax / Math.max(QaCeff * qf, 1e-9), ratioT: Math.max(-Rmin, 0) / Math.max(geo.QaT * qf, 1e-9),
      lat: latC, pm: gl.pm, Hi, Mmax: latC.M,
    };
  };
  const service = inp.combos.filter((c) => c.kind === 'service').map(combine);
  const ultimate = inp.combos.filter((c) => c.kind === 'ultimate').map(combine);
  if (service.some((s) => s.unresolved) || ultimate.some((s) => s.unresolved)) warnings.push('El grupo de pilotes no puede resistir el momento aplicado en alguna dirección (pilotes alineados o un solo pilote). Modifique la distribución.');

  // ---------- grupo y geometría
  let minSp = Infinity;
  for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) minSp = Math.min(minSp, Math.hypot(pts[i].x - pts[j].x, pts[i].y - pts[j].y));
  if (n > 1) checks.push({ name: 'Pilotes · separación mínima', ratio: (2.5 * props.Dp) / minSp, ok: minSp >= 2.5 * props.Dp - 1e-9, detail: `s mín = ${minSp.toFixed(2)} m ≥ 2.5·D = ${(2.5 * props.Dp).toFixed(2)} m` });
  const edgeMin = props.Dp / 2 + 0.15;
  checks.push({ name: 'Cabezal · distancia al borde', ratio: edgeMin / Math.max(inp.cap.manualSize ? Math.min(...pts.flatMap((q) => [q.x - rect.x0, rect.x1 - q.x, q.y - rect.y0, rect.y1 - q.y])) : cap.edge, 1e-9), ok: (inp.cap.manualSize ? Math.min(...pts.flatMap((q) => [q.x - rect.x0, rect.x1 - q.x, q.y - rect.y0, rect.y1 - q.y])) : cap.edge) >= edgeMin - 1e-9, detail: `≥ D/2 + 15 cm = ${edgeMin.toFixed(2)} m` });

  // ---------- servicio (geotecnia)
  const worstS = service.reduce<ComboRes | null>((a, b) => (!a || b.ratioC > a.ratioC ? b : a), null);
  if (worstS) checks.push({ name: 'Pilotes · compresión (servicio)', ratio: worstS.ratioC, ok: worstS.ratioC <= 1 + 1e-9, detail: `${worstS.combo.name}: R máx = ${worstS.Rmax.toFixed(0)} kN ≤ Qa = ${(QaCeff * worstS.combo.qaFactor).toFixed(0)} kN` });
  const anyT = [...service].some((s) => s.Rmin < -1e-9);
  if (anyT) {
    const wt = service.reduce<ComboRes | null>((a, b) => (!a || b.ratioT > a.ratioT ? b : a), null)!;
    checks.push({ name: 'Pilotes · tracción (servicio)', ratio: wt.ratioT, ok: wt.ratioT <= 1 + 1e-9, detail: `${wt.combo.name}: T = ${(-wt.Rmin).toFixed(0)} kN ≤ Qta = ${(geo.QaT * wt.combo.qaFactor).toFixed(0)} kN` });
  }
  const worstY = service.reduce<ComboRes | null>((a, b) => (!a || b.lat.y > a.lat.y ? b : a), null);
  if (worstY && worstY.Hpile > 0) checks.push({ name: 'Pilotes · deflexión lateral', ratio: worstY.lat.y / p.yAllow, ok: worstY.lat.y <= p.yAllow + 1e-9, detail: `${worstY.combo.name}: y = ${(worstY.lat.y * 1000).toFixed(1)} mm ≤ ${(p.yAllow * 1000).toFixed(1)} mm (T = ${worstY.lat.T.toFixed(2)} m)` });

  // ---------- reacciones del peso propio del cabezal (para la parte estructural del pilote)
  const rw = solveReactions(pts, Wcap, Wcap * fcap.x, Wcap * fcap.y).R;
  const rc = (cb: PileCombo) => solveReactions(pts, cb.P, cb.P * col.x + cb.My + cb.Vx * cap.h, cb.P * col.y + cb.Mx + cb.Vy * cap.h).R;
  for (const u of ultimate) {
    const Rc = rc(u.combo);
    const mx = Rc.map((v, i) => v + 1.2 * (rw[i] ?? 0));
    const mn = Rc.map((v, i) => v + 0.9 * (rw[i] ?? 0));
    u.Pu = { max: Math.max(...mx), min: Math.min(...mn) };
    u.Mu = u.lat.M;
  }

  // ---------- estructura del pilote
  let steel: SteelCap | undefined;
  let conc: PileResults['conc'];
  let worstC: PileResults['worstC'];
  let worstT: PileResults['worstT'];
  let shear: PileResults['shear'];
  const Tlen = ultimate[0]?.lat.T ?? lateralPile(p, props.EI, 1).T;
  if (p.kind === 'concrete') {
    const r = concreteSteelRatio(p);
    const base = concretePhiMn(p, 0);
    conc = { phiPnMax: base.phiPnMax, phiPt: base.phiPt, ratio: r, phiMn: base.phiMn };
    checks.push({ name: 'Pilote · cuantía longitudinal', ratio: r.rho < 0.005 ? 0.005 / r.rho : r.rho / 0.08, ok: r.ok, detail: `ρ = ${(r.rho * 100).toFixed(2)} % (0.5 % a 8 %)`, advisory: false });
  } else {
    steel = steelCapacity(p, props, Tlen);
    if (!steel.compact) warnings.push(`La sección del pilote de acero es esbelta localmente (${(props.slender ?? 0).toFixed(1)} > ${steel.limit.toFixed(1)}): las resistencias calculadas no incluyen reducción por pandeo local.`);
  }
  const evalPile = (Pu: number, Mu: number, Vu: number): { ratio: number; phiMn: number; eq?: string } => {
    if (p.kind === 'concrete') {
      const c = concretePhiMn(p, Pu);
      const ax = Pu >= 0 ? Pu / c.phiPnMax : -Pu / -c.phiPt;
      if (Pu > c.phiPnMax || Pu < c.phiPt) return { ratio: Math.max(ax, 1.0001), phiMn: 0 };
      return { ratio: Math.max(ax, c.phiMn > 0 ? Mu / c.phiMn : Mu > 0 ? 9.99 : 0), phiMn: c.phiMn };
    }
    const s = steel!;
    const it = steelInteraction(Pu, Mu, s.phiPn, s.phiPt, s.phiMn);
    return { ratio: it.ratio, phiMn: s.phiMn, eq: it.eq };
  };
  for (const u of ultimate) {
    if (!u.Pu) continue;
    const c = evalPile(u.Pu.max, u.Mu ?? 0, u.Hpile);
    if (!worstC || c.ratio > worstC.ratio) worstC = { res: u, Pu: u.Pu.max, Mu: u.Mu ?? 0, ratio: c.ratio, phiMn: c.phiMn, eq: c.eq };
    if (u.Pu.min < 0) {
      const t = evalPile(u.Pu.min, u.Mu ?? 0, u.Hpile);
      if (!worstT || t.ratio > worstT.ratio) worstT = { res: u, Pu: u.Pu.min, Mu: u.Mu ?? 0, ratio: t.ratio, phiMn: t.phiMn, eq: t.eq };
    }
  }
  if (worstC) checks.push({ name: p.kind === 'concrete' ? 'Pilote · axial + flexión (última)' : 'Pilote · compresión + flexión (última)', ratio: worstC.ratio, ok: worstC.ratio <= 1 + 1e-9, detail: `${worstC.res.combo.name}: Pu = ${worstC.Pu.toFixed(0)} kN, Mu = ${worstC.Mu.toFixed(1)} kN·m` });
  if (worstT) checks.push({ name: 'Pilote · tracción + flexión (última)', ratio: worstT.ratio, ok: worstT.ratio <= 1 + 1e-9, detail: `${worstT.res.combo.name}: Pu = ${worstT.Pu.toFixed(0)} kN (tracción), Mu = ${worstT.Mu.toFixed(1)} kN·m` });
  if (p.kind === 'concrete') {
    let wv: { Vu: number; phiVn: number; ratio: number; text: string } | undefined;
    for (const u of ultimate) {
      const sh = concreteShear(p, u.Hpile, u.Pu?.max ?? 0);
      if (!wv || sh.ratio > wv.ratio) wv = { Vu: u.Hpile, phiVn: sh.phiVn, ratio: sh.ratio, text: sh.text };
    }
    shear = wv;
    if (wv) checks.push({ name: 'Pilote · cortante', ratio: wv.ratio, ok: wv.ratio <= 1 + 1e-9, detail: `Vu = ${wv.Vu.toFixed(1)} kN ≤ φVn = ${wv.phiVn.toFixed(0)} kN (${wv.text})` });
  }

  // ---------- cabezal
  const bX = findBar(cap.barX), bY = findBar(cap.barY);
  const lowerX = cap.lowerLayer === 'x';
  const dX = cap.h - cap.cover - (lowerX ? bX.db / 2000 : bY.db / 1000 + bX.db / 2000);
  const dY = cap.h - cap.cover - (lowerX ? bX.db / 1000 + bY.db / 2000 : bY.db / 2000);
  const half = (n2: number) => n2;
  void half;

  type Side = 'pos' | 'neg';
  const dir = (axis: 'x' | 'y') => {
    const bar = axis === 'x' ? bX : bY;
    const d = axis === 'x' ? dX : dY;
    const b = axis === 'x' ? rect.L : rect.B;
    const c0 = axis === 'x' ? cbb.xmin : cbb.ymin;
    const c1 = axis === 'x' ? cbb.xmax : cbb.ymax;
    const lo = axis === 'x' ? rect.x0 : rect.y0;
    const hi = axis === 'x' ? rect.x1 : rect.y1;
    const coord = (q: Pt) => (axis === 'x' ? q.x : q.y);
    let Mpos = 0, Mneg = 0, xsPos = c1;
    let Vu = 0, comboV = ultimate[0]?.combo.name ?? '', xsV = 0;
    let aMin = Infinity;
    for (const u of ultimate) {
      const R = rc(u.combo);
      for (const side of ['pos', 'neg'] as Side[]) {
        const face = side === 'pos' ? c1 : c0;
        const sign = side === 'pos' ? 1 : -1;
        let M = 0;
        let V = 0;
        const xv = face + sign * d;
        for (let i = 0; i < n; i++) {
          const arm = sign * (coord(pts[i]) - face);
          const f = clamp01(arm / props.Dp + 0.5);
          M += R[i] * f * arm;
          const fv = clamp01((sign * (coord(pts[i]) - xv)) / props.Dp + 0.5);
          V += R[i] * fv;
          if (arm > 0) aMin = Math.min(aMin, arm);
        }
        if (M > Mpos) { Mpos = M; xsPos = face; }
        if (-M > Mneg) Mneg = -M;
        if (Math.abs(V) > Math.abs(Vu)) { Vu = V; comboV = u.combo.name; xsV = xv; }
      }
    }
    // flexión
    const fc = cap.fc, fy = cap.fy;
    const fl = flexureAs(Mpos, b, d, fc, fy);
    const AsMin = rhoMinSlab(fy) * b * cap.h * 1e4;
    const AsReq = Math.max(fl.As, AsMin);
    const sMax = Math.min(3 * cap.h, 0.45);
    const ms = axis === 'x' ? cap.manual.sBotX : cap.manual.sBotY;
    let det: Detailing;
    if (cap.manual.on) {
      det = { text: `${bar.id} @ ${(ms * 100).toFixed(1).replace(/\.0$/, '')} cm`, spacing: ms, asProv: bar.area / ms, ok: ms <= sMax + 1e-9 && ms >= bar.db / 1000 + 0.025, note: ms > sMax ? 'Separación mayor que el máximo (3h ó 45 cm).' : undefined };
    } else det = chooseSpacing(AsReq / b, bar, sMax, 0.075);
    const asProv = det.asProv * b;
    const phiMn = flexureCapacity(asProv, b, d, fc, fy);
    const sectionOk = fl.ok && asProv >= AsReq - 1e-6 && det.ok;
    const ratio = Math.max(Mpos / Math.max(phiMn, 1e-9), AsReq / Math.max(asProv, 1e-9));
    // desarrollo
    const ld = developmentLength(bar.db, fy, fc, { lambda: cap.lambda });
    const ldh = hookDevelopment(bar.db, fy, fc, cap.lambda);
    const la = hi - c1 - cap.cover;
    const la2 = c0 - lo - cap.cover;
    const laMin = Math.min(la, la2) < 0 ? Math.min(la, la2) : Math.min(la, la2);
    const devStraight = ld <= laMin + 1e-9;
    const devHook = ldh <= laMin + 1e-9;
    const devOk = devStraight || devHook;
    const devText = devStraight ? 'barra recta' : devHook ? 'requiere gancho estándar a 90°' : 'no desarrolla';
    // acero superior
    let top: CapFlex['top'];
    const dTopDepth = cap.h - cap.cover - (axis === 'x' ? (lowerX ? findBar(cap.barTopX).db / 2000 : findBar(cap.barTopY).db / 1000 + findBar(cap.barTopX).db / 2000) : (lowerX ? findBar(cap.barTopY).db / 1000 + findBar(cap.barTopX).db / 2000 : findBar(cap.barTopY).db / 2000));
    if (cap.topSteel) {
      const tb = findBar(axis === 'x' ? cap.barTopX : cap.barTopY);
      const flt = flexureAs(Mneg, b, dTopDepth, fc, fy);
      const AsReqT = Math.max(flt.As, AsMin);
      const tms = axis === 'x' ? cap.manual.sTopX : cap.manual.sTopY;
      const tdet: Detailing = cap.manual.on ? { text: `${tb.id} @ ${(tms * 100).toFixed(1).replace(/\.0$/, '')} cm`, spacing: tms, asProv: tb.area / tms, ok: tms <= sMax + 1e-9 } : chooseSpacing(AsReqT / b, tb, sMax, 0.075);
      const aT = tdet.asProv * b;
      const pm = flexureCapacity(aT, b, dTopDepth, fc, fy);
      top = { AsReq: AsReqT, det: tdet, asProv: aT, Mu: Mneg, ratio: Math.max(Mneg / Math.max(pm, 1e-9), AsReqT / Math.max(aT, 1e-9)), ok: flt.ok && aT >= AsReqT - 1e-6 && tdet.ok, bar: tb.id };
    } else if (Mneg > 1e-6) {
      warnings.push(`Hay momento negativo (tracción superior) de ${Mneg.toFixed(0)} kN·m en la dirección ${axis.toUpperCase()}: active el acero superior.`);
    }
    const flex: CapFlex = { Mpos, Mneg, b, d, dTop: dTopDepth, AsReq, AsMin, det, asProv, phiMn, ratio, ok: sectionOk && (top ? top.ok : true), bar: bar.id, xs: xsPos, top, ld, ldh, la: laMin, devOk, devText };
    // cortante en una dirección
    const rho = asProv / (b * d * 1e4);
    const vc = oneWayVc(b, d, fc, rho, cap.code, cap.lambda);
    const phiVc = PHI_SHEAR * vc.Vc;
    const sh: CapShear = { Vu: Math.abs(Vu), phiVc, ratio: Math.abs(Vu) / Math.max(phiVc, 1e-9), bw: b, d, Vc: vc.Vc, rho, xs: xsV, combo: comboV, ok: Math.abs(Vu) <= phiVc + 1e-9, aOverD: isFinite(aMin) ? aMin / d : Infinity };
    return { flex, sh };
  };
  const dx = dir('x');
  const dy = dir('y');
  const bw2 = (axis: string, f: CapFlex) => {
    checks.push({ name: `Cabezal · flexión en ${axis.toUpperCase()}`, ratio: f.ratio, ok: f.ok, detail: `Mu = ${f.Mpos.toFixed(0)} kN·m; As req = ${f.AsReq.toFixed(1)} cm² ≤ As prov = ${f.asProv.toFixed(1)} cm² (${f.det.text})` });
    if (f.top) checks.push({ name: `Cabezal · acero superior en ${axis.toUpperCase()}`, ratio: f.top.ratio, ok: f.top.ok, detail: `Mu⁻ = ${f.top.Mu.toFixed(0)} kN·m; As req = ${f.top.AsReq.toFixed(1)} cm² ≤ ${f.top.asProv.toFixed(1)} cm² (${f.top.det.text})` });
    checks.push({ name: `Cabezal · desarrollo del acero en ${axis.toUpperCase()}`, ratio: Math.min(f.ld, f.la > 0 ? f.ldh : Infinity) / Math.max(f.la, 1e-9), ok: f.devOk, detail: `ld = ${(f.ld * 100).toFixed(0)} cm, ldh = ${(f.ldh * 100).toFixed(0)} cm; disponible ${(f.la * 100).toFixed(0)} cm: ${f.devText}`, advisory: f.devOk && f.la < f.ld });
  };
  bw2('x', dx.flex);
  bw2('y', dy.flex);
  const deep = Math.min(dx.sh.aOverD, dy.sh.aOverD) < 2;
  checks.push({ name: 'Cabezal · cortante en dirección X', ratio: dx.sh.ratio, ok: dx.sh.ok, advisory: deep, detail: `${dx.sh.combo}: Vu = ${dx.sh.Vu.toFixed(0)} kN ≤ φVc = ${dx.sh.phiVc.toFixed(0)} kN${deep ? ' (cabezal profundo: rige puntal–tirante)' : ''}` });
  checks.push({ name: 'Cabezal · cortante en dirección Y', ratio: dy.sh.ratio, ok: dy.sh.ok, advisory: deep, detail: `${dy.sh.combo}: Vu = ${dy.sh.Vu.toFixed(0)} kN ≤ φVc = ${dy.sh.phiVc.toFixed(0)} kN${deep ? ' (cabezal profundo: rige puntal–tirante)' : ''}` });

  // puntales y tirantes (ACI 318-19 cap. 23): rige en cabezales profundos (a/d < 2) y se muestra siempre
  const cpp = polyProps(colPoly);
  const apile = p.kind === 'concrete' ? (p.shape === 'circle' ? (Math.PI * p.D ** 2) / 4 : p.D ** 2) : p.kind === 'pipe' ? (Math.PI * p.D ** 2) / 4 : props.Dp ** 2;
  const stm = stmDesign({
    pts, combos: ultimate.map((u) => ({ name: u.combo.name, R: rc(u.combo), P: u.combo.P })), col: { x: cpp.cx, y: cpp.cy, A: cpp.A }, Dp: props.Dp, Apile: apile, rect, h: cap.h,
    dX, dY, asX: dx.flex.det.asProv, asY: dy.flex.det.asProv, fc: cap.fc, fy: cap.fy, lambda: cap.lambda, crackMesh: cap.crackMesh,
    colW: { x: cbb.xmax - cbb.xmin, y: cbb.ymax - cbb.ymin }, cover: cap.cover, dbX: bX.db / 1000, dbY: bY.db / 1000,
  });
  stm.aOverD = Math.min(dx.sh.aOverD, dy.sh.aOverD);
  stm.deep = deep;
  if (ultimate.length) {
    const adv = !deep;
    const tag = deep ? '' : ' (informativo: cabezal no profundo)';
    checks.push({ name: 'Cabezal · puntales (STM)', ratio: stm.ratioStrut, ok: stm.ratioStrut <= 1 + 1e-9, advisory: adv, detail: `${stm.combo}: C máx = ${Math.max(...stm.struts.map((q) => q.C), 0).toFixed(0)} kN; fce = ${stm.fce.toFixed(1)} MPa (βs = ${stm.betaS.toFixed(2)})${tag}` });
    checks.push({ name: 'Cabezal · tirantes (STM)', ratio: stm.ratioTie, ok: stm.ratioTie <= 1 + 1e-9, advisory: adv, detail: `T x = ${stm.tieX.T.toFixed(0)} kN, T y = ${stm.tieY.T.toFixed(0)} kN; As req = ${stm.tieX.AsReq.toFixed(1)} / ${stm.tieY.AsReq.toFixed(1)} cm²${tag}` });
    checks.push({ name: 'Cabezal · zonas nodales (STM)', ratio: Math.max(stm.ratioNodeCol, stm.ratioNodePile), ok: Math.max(stm.ratioNodeCol, stm.ratioNodePile) <= 1 + 1e-9, advisory: adv, detail: `columna ${(stm.ratioNodeCol).toFixed(2)}, pilote ${(stm.ratioNodePile).toFixed(2)} (βn pilote = ${stm.betaNPile})${tag}` });
    if (stm.uplift) warnings.push('Hay pilotes en tracción: el modelo de puntales y tirantes del programa solo considera reacciones de compresión; revise el cabezal con un modelo propio.');
  }
  if (deep) warnings.push(`Cabezal profundo (a/d = ${stm.aOverD.toFixed(2)} < 2): el diseño se rige por el método de puntales y tirantes (ACI 318-19 cap. 23); el cortante como viga se muestra solo como referencia.`);

  // punzonamiento de la columna
  const dAvg = (dX + dY) / 2;
  const hull = convexHull(colPoly);
  const crit = offsetConvex(hull, dAvg / 2);
  const bo = perimeter(crit);
  const cw = cbb.xmax - cbb.xmin, ch = cbb.ymax - cbb.ymin;
  const beta = col.geom.shape === 'circle' ? 1 : Math.max(cw, ch) / Math.max(Math.min(cw, ch), 1e-9);
  let pu: CapPunch | undefined;
  for (const u of ultimate) {
    const R = rc(u.combo);
    let V = u.combo.P;
    for (let i = 0; i < n; i++) V -= R[i] * (1 - clamp01(sdist(pts[i], crit) / props.Dp + 0.5));
    const vu = Math.max(V, 0) / (bo * dAvg) / 1000;
    const alphaS = 40;
    const vcs = punchingVc(beta, alphaS, bo, dAvg, cap.fc, cap.code, cap.lambda);
    const phivc = PHI_SHEAR * vcs.vc;
    const cand: CapPunch = { Vu: Math.max(V, 0), bo, d: dAvg, vu, phivc, ratio: vu / phivc, ok: vu <= phivc + 1e-9, combo: u.combo.name, vc: vcs, beta, alphaS };
    if (!pu || cand.ratio > pu.ratio) pu = cand;
  }
  if (pu) checks.push({ name: 'Cabezal · punzonamiento de la columna', ratio: pu.ratio, ok: pu.ok, detail: `${pu.combo}: vu = ${pu.vu.toFixed(2)} MPa ≤ φvc = ${pu.phivc.toFixed(2)} MPa` });

  // punzonamiento por pilote
  const pilePunch: PilePunch[] = [];
  for (let i = 0; i < n; i++) {
    let Ru = 0;
    for (const u of ultimate) Ru = Math.max(Ru, rc(u.combo)[i]);
    const e = props.Dp + dAvg;
    const sideCut = [
      pts[i].x + e / 2 > rect.x1 + 1e-9, pts[i].x - e / 2 < rect.x0 - 1e-9, pts[i].y + e / 2 > rect.y1 + 1e-9, pts[i].y - e / 2 < rect.y0 - 1e-9,
    ].filter(Boolean).length;
    // longitud efectiva dentro del cabezal (muestreo del contorno circular o cuadrado equivalente)
    const Pcirc = p.kind === 'concrete' && p.shape === 'circle' || p.kind === 'pipe' ? Math.PI * e : 4 * e;
    let inside = 0;
    const NS = 72;
    for (let k = 0; k < NS; k++) {
      const a = (2 * Math.PI * (k + 0.5)) / NS;
      const q = { x: pts[i].x + (e / 2) * Math.cos(a), y: pts[i].y + (e / 2) * Math.sin(a) };
      if (q.x <= rect.x1 && q.x >= rect.x0 && q.y <= rect.y1 && q.y >= rect.y0) inside++;
    }
    const boE = (Pcirc * inside) / NS;
    const alphaS = Math.max(40 - 10 * sideCut, 20);
    const vcs = punchingVc(1, alphaS, boE, dAvg, cap.fc, cap.code, cap.lambda);
    const phivc = PHI_SHEAR * vcs.vc;
    const vu = Ru / (boE * dAvg) / 1000;
    pilePunch.push({ i, Ru, bo: boE, vu, phivc, ratio: vu / phivc, ok: vu <= phivc + 1e-9, alphaS });
  }
  if (pilePunch.length) {
    const w = pilePunch.reduce((a, b) => (b.ratio > a.ratio ? b : a));
    checks.push({ name: 'Cabezal · punzonamiento por pilote', ratio: w.ratio, ok: w.ok, detail: `Pilote ${w.i + 1}: Ru = ${w.Ru.toFixed(0)} kN, vu = ${w.vu.toFixed(2)} MPa ≤ φvc = ${w.phivc.toFixed(2)} MPa` });
  }

  // ---------- fricción negativa
  const sustained = service.filter((x) => !x.combo.eq);
  const sus = sustained.length ? sustained : service;
  if (geo.mode === 'static' && geo.Qneg > 1e-6 && sus.length) {
    const ws = sus.reduce((a, b) => (b.Rmax > a.Rmax ? b : a));
    checks.push({ name: 'Pilotes · fricción negativa (servicio)', ratio: (ws.Rmax + geo.Qneg) / Math.max(geo.QaDD, 1e-9), ok: ws.Rmax + geo.Qneg <= geo.QaDD + 1e-9, detail: `${ws.combo.name}: R + Qneg = ${(ws.Rmax + geo.Qneg).toFixed(0)} kN ≤ Qa (bajo el plano neutro) = ${geo.QaDD.toFixed(0)} kN; Qneg = ${geo.Qneg.toFixed(0)} kN` });
    if (worstC) {
      const pu = worstC.Pu + geo.Qneg;
      const e = evalPile(pu, worstC.Mu, 0);
      checks.push({ name: 'Pilote · estructural con fricción negativa', ratio: e.ratio, ok: e.ratio <= 1 + 1e-9, detail: `Pu + Qneg = ${pu.toFixed(0)} kN con Mu = ${worstC.Mu.toFixed(1)} kN·m en el plano neutro` });
    }
  }

  // ---------- licuación
  if (liq.enabled && liq.rows.length) {
    const minFS = Math.min(...liq.rows.map((r) => r.FS));
    checks.push({ name: 'Suelo · potencial de licuación', ratio: inp.geo.fsLiq / Math.max(minFS, 1e-9), ok: minFS >= inp.geo.fsLiq, advisory: true, detail: `FS mín = ${minFS.toFixed(2)} (requerido ≥ ${inp.geo.fsLiq}); espesor licuable = ${liq.Lliq.toFixed(1)} m; asentamiento del terreno ≈ ${(liq.settlement * 1000).toFixed(0)} mm` });
    const eqS = service.filter((x) => x.combo.eq);
    if (geo.mode === 'static' && liq.Lliq > 0 && eqS.length) {
      const w = eqS.reduce((a, b) => (b.Rmax > a.Rmax ? b : a));
      checks.push({ name: 'Pilotes · compresión con suelo licuado', ratio: w.Rmax / Math.max(geo.QaLiq, 1e-9), ok: w.Rmax <= geo.QaLiq + 1e-9, detail: `${w.combo.name}: R máx = ${w.Rmax.toFixed(0)} kN ≤ (Qs,res + Qb)/1.5 = ${geo.QaLiq.toFixed(0)} kN` });
    }
    if (liq.Lliq > 0) {
      const eqU = ultimate.filter((x) => x.combo.eq && x.Pu);
      let wl: { r: number; name: string; Pu: number; M: number } | null = null;
      for (const u of eqU) {
        const pl = { ...p, Lu: p.Lu + liq.Lliq, nh: p.nh };
        const lt = lateralPile(pl, props.EI, u.Hpile);
        const c = evalPile(u.Pu!.max, lt.M, 0);
        // pandeo en el tramo licuado
        let buck = 0;
        if (p.kind === 'concrete') buck = u.Pu!.max / Math.max(0.25 * ((Math.PI ** 2 * props.EI) / (p.K * (p.Lu + liq.Lliq)) ** 2), 1e-9);
        else buck = u.Pu!.max / Math.max(steelCapacity(pl, props, lt.T).phiPn, 1e-9);
        const r = Math.max(c.ratio, buck);
        if (!wl || r > wl.r) wl = { r, name: u.combo.name, Pu: u.Pu!.max, M: lt.M };
      }
      if (wl) checks.push({ name: 'Pilote · condición licuada (pandeo + flexión)', ratio: wl.r, ok: wl.r <= 1 + 1e-9, detail: `${wl.name}: Pu = ${wl.Pu.toFixed(0)} kN, Mu = ${wl.M.toFixed(1)} kN·m con ${liq.Lliq.toFixed(1)} m sin apoyo lateral` });
    }
  }

  // ---------- asentamiento
  let settle: SettleResult | undefined;
  if (inp.geo.layers.length && sus.length) {
    const wt = sus.reduce((a, b) => (b.Ptot > a.Ptot ? b : a));
    const bbp = bbox(pts.length ? pts : [{ x: 0, y: 0 }]);
    const Ep = (p.kind === 'concrete' ? 4700 * Math.sqrt(p.fc) : 200000) * 1000;
    const tipL = inp.geo.layers[layerIndexAt(inp.geo.layers, p.L)];
    const qbEst = geo.mode === 'static' ? geo.qb : (geo.QaC * inp.geo.FS * 0.5) / Math.max(props.Atip, 1e-9);
    settle = settlement(inp, {
      Qpile: wt.Ptot / Math.max(n, 1), Qgroup: wt.Ptot, Qs: geo.mode === 'static' ? geo.Qs : 0.5, Qult: geo.mode === 'static' ? geo.Qult : 1, qb: qbEst,
      Ap: props.A, Ep, D: props.Dp, Bg: bbp.xmax - bbp.xmin + props.Dp, Lg: bbp.ymax - bbp.ymin + props.Dp, tipKind: tipL?.kind ?? 'granular',
    });
    checks.push({ name: 'Pilotes · asentamiento del grupo', ratio: settle.total / Math.max(inp.geo.sAllow, 1e-9), ok: settle.total <= inp.geo.sAllow + 1e-9, detail: `Grupo = ${(settle.group.total * 1000).toFixed(1)} mm, pilote = ${(settle.pile.total * 1000).toFixed(1)} mm ≤ ${(inp.geo.sAllow * 1000).toFixed(0)} mm (${wt.combo.name})` });
  }

  const ok = checks.every((c) => c.ok || c.advisory);
  return {
    ok, checks, warnings, pts, n, capRect: rect, Wcap, props, geo, Eg, QaCeff, service, ultimate, steel, conc, worstC, worstT, shear,
    lateral: { y: worstY?.lat.y ?? 0, combo: worstY?.combo.name ?? '—', T: worstY?.lat.T ?? Tlen },
    minSpacing: isFinite(minSp) ? minSp : 0, flexX: dx.flex, flexY: dy.flex, shearX: dx.sh, shearY: dy.sh, punch: pu, pilePunch, stm, liq, settle, deep, dX, dY,
    concreteVolume: rect.B * rect.L * cap.h, pileLength: n * p.L,
  };
}

// ---------------------------------------------------------------- dimensionamiento automático
const isPileCheck = (c: PCheck) => /^Pilot/.test(c.name);
const isCapCheck = (c: PCheck) => /^Cabezal/.test(c.name) && !/borde/.test(c.name);

/** Menor espesor del cabezal (múltiplo de 5 cm) y barra que cumplen flexión, cortante, punzonamiento y puntales y tirantes. */
export function findCapDesign(inp: PileInput, tryBars = true): { h: number; bar: string } | null {
  const order = inp.cap.barSystem === 'astm' ? ['#6', '#7', '#8', '#9', '#10', '#11'] : ['Ø16', 'Ø20', 'Ø25', 'Ø32', 'Ø36'];
  const avail = barList(inp.cap.barSystem).map((b) => b.id);
  const bars = tryBars ? order.filter((b) => avail.includes(b)) : [inp.cap.barX];
  for (let h = 0.5; h <= 3.5 + 1e-9; h += 0.05) {
    for (const bar of bars) {
      const t = { ...inp, cap: { ...inp.cap, h: +h.toFixed(2), barX: bar, barY: bar, barTopX: bar, barTopY: bar, manual: { ...inp.cap.manual, on: false } } };
      const r = analyzePile(t);
      if (r.checks.filter((c) => isCapCheck(c) && !c.advisory && !/desarrollo/.test(c.name)).every((c) => c.ok) && (r.flexX?.det.ok ?? true) && (r.flexY?.det.ok ?? true)) return { h: +h.toFixed(2), bar };
    }
  }
  return null;
}

export function findCapThickness(inp: PileInput): number | null {
  return findCapDesign(inp, false)?.h ?? null;
}

export interface PileAutoResult {
  input: PileInput;
  ok: boolean;
  note: string;
}

/** Elige el número de pilotes (distribución usual con s = 3D), el espesor del cabezal y el acero. */
export function autoSizePile(inp0: PileInput, minN = 1, maxN = 20): PileAutoResult {
  let inp: PileInput = { ...inp0, cap: { ...inp0.cap, manual: { ...inp0.cap.manual, on: false }, manualSize: false } };
  const props = pileProps(inp.pile);
  const s = Math.ceil((3 * props.Dp) / 0.05 - 1e-9) * 0.05;
  const edge = Math.max(Math.ceil((props.Dp / 2 + 0.25) / 0.05 - 1e-9) * 0.05, 0.4);
  let done: PileInput | null = null;
  let anyPilePass = false;
  for (let n = minN; n <= maxN && !done; n++) {
    const t: PileInput = { ...inp, layout: standardLayout(n, s), cap: { ...inp.cap, edge, h: Math.max(inp.cap.h, 0.8) } };
    const r = analyzePile(t);
    if (r.warnings.some((w) => /no puede resistir/.test(w))) continue;
    if (!r.checks.filter((c) => (isPileCheck(c) && !c.advisory) || /separación/.test(c.name)).every((c) => c.ok)) continue;
    anyPilePass = true;
    const des = findCapDesign(t, true);
    if (!des) continue;
    const t2: PileInput = { ...t, cap: { ...t.cap, h: des.h, barX: des.bar, barY: des.bar, barTopX: des.bar, barTopY: des.bar } };
    // el mayor peso del cabezal puede exigir más pilotes: se acepta solo si todo cumple
    if (analyzePile(t2).ok) done = t2;
  }
  if (!done) return { input: inp, ok: false, note: anyPilePass ? `Con hasta ${maxN} pilotes no se logra un cabezal que cumpla: revise la sección del cabezal o las cargas.` : `Con hasta ${maxN} pilotes no se cumplen las verificaciones de los pilotes: aumente la longitud o la sección.` };
  inp = done;
  const fin = analyzePile(inp);
  return { input: inp, ok: fin.ok, note: fin.ok ? `Cumple con ${fin.n} pilotes.` : `No cumple: ${fin.checks.filter((c) => !c.ok && !c.advisory).map((c) => c.name).join(', ')}` };
}
