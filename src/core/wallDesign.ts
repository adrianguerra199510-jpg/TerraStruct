// Diseño estructural de muros de retención: pantalla, zapata, llave, contrafuertes, concreto simple y mampostería.

import { WallGeom, soilWeight, stemHookSide } from './wallGeom';
import { CaseResult, Factors, evalCase, earthModel } from './wallStability';
import { GAMMA_W, rad, sigmaV, passiveForce, kpRankine, faceThrust } from './earth';
import { flexureAs, flexureCapacity, oneWayVc, PHI_FLEX, PHI_SHEAR, PHI_PLAIN, beta1 } from './concrete';
import { Bar, Detailing, chooseSpacing, findBar, developmentLength, hookDevelopment } from './materials';
import { polyProps, clipHalfPlane } from './geometry';
import { isCounterfort, isGravity, isMasonry, cfInternal, cfExternal, isMasonryStem } from './wallTypes';

// ---------------------------------------------------------------------------
// Utilidades numéricas
// ---------------------------------------------------------------------------
export function simpson(f: (x: number) => number, a: number, b: number, n = 120): number {
  if (b - a < 1e-12) return 0;
  if (n % 2) n++;
  const h = (b - a) / n;
  let s = f(a) + f(b);
  for (let i = 1; i < n; i++) s += f(a + i * h) * (i % 2 ? 4 : 2);
  return (s * h) / 3;
}

// ---------------------------------------------------------------------------
// Perfil de presiones sobre la pantalla (horizontal, kPa), a la profundidad z bajo la corona
// ---------------------------------------------------------------------------
export interface StemLateral {
  /** componentes de servicio (densidad horizontal de presión) */
  soil: (z: number) => number;
  sur: (z: number) => number;
  water: (z: number) => number;
  seis: (z: number) => number;
  Ka: number;
  Kae: number | null;
  /** coeficiente horizontal efectivo = Ka·cos(δ+ψ) */
  kaH: number;
  deltaPlusPsi: number;
  /** resultante sísmica horizontal sobre la pantalla */
  dPh: number;
}

export function stemLateral(g: WallGeom): StemLateral {
  const inp = g.inp;
  const em = earthModel(g, inp.seismic.on);
  const H = inp.H;
  const theta = rad(em.deltaDeg + em.psiDeg);
  const Ka = em.Ka;
  const kaH = Ka * Math.cos(theta);
  const zw = inp.hw > g.hb ? Math.max(g.yTop - inp.hw, 0) : Infinity;
  const kappa = em.mode === 'face' ? Math.sin(rad(90 - em.psiDeg)) / Math.sin(rad(90 - em.psiDeg + inp.fill.beta)) : 1;
  // Incremento sísmico sobre la pantalla (plano de la pantalla)
  let dPh = 0;
  if (inp.seismic.on && em.Kae !== null && isFinite(em.Kae)) {
    const ft = faceThrust({
      Ka, deltaDeg: em.deltaDeg, psiDeg: em.mode === 'face' ? em.psiDeg : 0, Hv: H, q: 0, gamma: inp.fill.gamma, gammaSat: inp.fill.gammaSat, zw,
      kae: em.Kae, kv: inp.seismic.kv,
    });
    dPh = ft.seismic.Ph;
  }
  return {
    soil: (z) => kaH * sigmaV(z, inp.fill.gamma, inp.fill.gammaSat, zw),
    sur: () => kaH * kappa * inp.fill.q,
    water: (z) => (isFinite(zw) && z > zw ? GAMMA_W * (z - zw) : 0),
    seis: (z) => (dPh > 0 ? Math.max(0, ((2 * dPh) / H) * (1 - z / H)) : 0),
    Ka, Kae: em.Kae, kaH, deltaPlusPsi: em.deltaDeg + em.psiDeg, dPh,
  };
}

export interface SectionLoad {
  /** altura sobre la base de la pantalla */
  y: number;
  /** profundidad bajo la corona */
  zs: number;
  /** cortante y momento de servicio por componente (kN/m, kN·m/m) */
  V: { soil: number; sur: number; water: number; seis: number; inertia: number };
  M: { soil: number; sur: number; water: number; seis: number; inertia: number };
}

export function sectionLoad(g: WallGeom, lat: StemLateral, y: number): SectionLoad {
  const H = g.inp.H;
  const zs = H - y;
  const kh = g.inp.seismic.on ? g.inp.seismic.kh : 0;
  const gammaStem = g.parts.find((p) => p.id === 'stem')!.gamma;
  const comp = (fn: (z: number) => number) => ({
    V: simpson(fn, 0, zs, 60),
    M: simpson((z) => fn(z) * (zs - z), 0, zs, 60),
  });
  const s = comp(lat.soil), q = comp(lat.sur), w = comp(lat.water), e = comp(lat.seis);
  const inertia = comp((z) => kh * gammaStem * g.stemT(H - z));
  return {
    y, zs,
    V: { soil: s.V, sur: q.V, water: w.V, seis: e.V, inertia: inertia.V },
    M: { soil: s.M, sur: q.M, water: w.M, seis: e.M, inertia: inertia.M },
  };
}

// ---------------------------------------------------------------------------
// Tipos de resultados
// ---------------------------------------------------------------------------
export interface StemSection {
  y: number;
  t: number;
  d: number;
  MuStatic: number;
  MuSeismic: number;
  Mu: number;
  Vu: number;
  AsReq: number;
  AsMin: number;
  AsDes: number;
  phiMn: number;
  /** relación demanda/capacidad con el acero adoptado en la base */
  ok: boolean;
}

export interface StemDesign {
  sections: StemSection[];
  bar: Bar;
  barH: Bar;
  base: Detailing;
  /** altura (sobre la base de la pantalla) hasta la cual llega el 100 % de las barras */
  yCut: number | null;
  cutNote: string;
  AsH: number; // cm²/m de altura, total
  horizontalDet: Detailing;
  frontVertDet: Detailing;
  rhoV: number;
  rhoH: number;
  critical: { y: number; d: number; Vu: number; phiVc: number; ratio: number; formula: string };
  anchorage: { ldh: number; ld: number; available: number; ok: boolean };
  masonry?: boolean;
  /** capas de acero vertical (1 o 2 caras); en mampostería con 1 capa la barra va centrada en la celda */
  layers: 1 | 2;
  centered: boolean;
  vertAuto: boolean;
  /** relación acero requerido / adoptado en la base (vertical) */
  vertRatio: number;
  horizOn: boolean;
  horizAuto: boolean;
  horizLayers: number;
  /** relación acero horizontal requerido / adoptado */
  horizRatio: number;
  governing: 'estático' | 'sísmico';
  sectionOk: boolean;
}

export interface SlabDesign {
  name: string;
  caseLabel: string;
  face: 'superior' | 'inferior';
  Mu: number;
  d: number;
  b: number;
  AsReq: number;
  AsMin: number;
  AsDes: number;
  det: Detailing;
  bar: Bar;
  phiMn: number;
  Vu: number;
  phiVc: number;
  ratioM: number;
  ratioV: number;
  ldReq: number;
  ldAvail: number;
  hook: boolean;
  shrinkAs: number;
  shrinkDet: Detailing;
  /** acero transversal de la cara opuesta (si se activa) */
  opp?: SlabDesign | null;
  sectionOk: boolean;
  note?: string;
}

export interface GravitySection {
  y: number;
  t: number;
  N: number; // kN/m
  M: number; // kN·m/m (tracción en la cara posterior)
  V: number;
  sigBack: number; // kPa, compresión +
  sigFront: number;
  ratioC: number;
  ratioT: number;
  ratioV: number;
  ok: boolean;
}

export interface CounterfortSection {
  y: number;
  proj: number;
  dcf: number;
  Mcf: number;
  Vcf: number;
  AsReq: number; // cm² horizontal, antes de inclinar
  AsIncl: number; // cm² a lo largo de la barra inclinada
  AvReq: number; // cm²/m (estribos horizontales / separación)
  tiesStem: number; // cm²/m de altura
}

export interface CounterfortDesign {
  kind: 'interno' | 'externo';
  s: number;
  Ls: number;
  sections: CounterfortSection[];
  bar: Bar;
  nBars: number;
  AsMax: number;
  AsProv: number;
  stirrup: Bar;
  stirrupSpacing: number;
  tieStem: Detailing;
  tieSlab: Detailing;
  tieSlabForce: number;
  stemSlab: {
    y: number;
    t: number;
    d: number;
    wu: number;
    MuNeg: number;
    MuPos: number;
    AsNeg: number;
    AsPos: number;
  }[];
  stemNegDet: Detailing;
  stemPosDet: Detailing;
  stemFaceNeg: string;
  stemFacePos: string;
  slabLabel: string;
  slab: {
    x: number;
    wu: number;
    MuNeg: number;
    MuPos: number;
    AsNeg: number;
    AsPos: number;
  }[];
  slabNegDet: Detailing;
  slabPosDet: Detailing;
  slabFaceNeg: string;
  slabFacePos: string;
  critical: { Vu: number; phiVc: number; ratio: number };
  stemShear: { Vu: number; phiVc: number; ratio: number };
  vertDet: Detailing;
  vertBottomDet: Detailing;
  /** relaciones requerido / adoptado del armado definido por el usuario */
  ratios: { main: number; stirrup: number; stirMin: number; tieStem: number; tieSlab: number; stemNeg: number; stemPos: number; vert: number; slabNeg: number; slabPos: number };
  /** valores requeridos del cálculo */
  req: { AsMain: number; AvMin: number; tieStem: number; tieSlab: number; stemNeg: number; stemPos: number; vert: number; slabNeg: number; slabPos: number };
  suggest: { nMain: number; stirS: number; tieStemS: number; tieSlabS: number; stemHS: number; stemVS: number; slabLongS: number };
  sectionOk: boolean;
  notes: string[];
}

export interface MeshSummary {
  botBar: Bar;
  botDet: Detailing;
  top: { bar: Bar; det: Detailing } | null;
  long: { bar: Bar; det: Detailing; layers: number; AsTotal: number; AsMin: number; ratio: number } | null;
  /** relación acero mínimo / acero adoptado en cada capa transversal */
  minBot: number;
  minTop: number | null;
  /** separación máxima admisible (menor de 3h y 45 cm) y si se cumple */
  sMax: number;
  spacingOk: boolean;
}

export interface WallSuggest {
  mesh: { botS: number; topS: number; topOn: boolean; longS: number };
  cf: { nMain: number; stirS: number; tieStemS: number; tieSlabS: number; stemHS: number; stemVS: number; slabLongS: number } | null;
}

export interface KeyDesign {
  slab: SlabDesign;
  Pp: number;
  PpUsed: number;
}

export interface WallDesign {
  uls: { label: string; res: CaseResult }[];
  stem: StemDesign | null;
  toe: SlabDesign | null;
  heel: SlabDesign | null;
  key: KeyDesign | null;
  gravity: GravitySection[] | null;
  gravityMaterial: 'concreto' | 'mamposteria' | 'gaviones' | null;
  baseCheck: { name: string; ratio: number; detail: string }[] | null;
  counterfort: CounterfortDesign | null;
  mesh: MeshSummary | null;
  suggest: WallSuggest | null;
  warnings: string[];
  notes: string[];
}

// ---------------------------------------------------------------------------
// ULS
// ---------------------------------------------------------------------------
export function ulsCases(g: WallGeom): { label: string; res: CaseResult }[] {
  const f = g.inp.factors;
  const q = g.inp.fill.q;
  const out: { label: string; res: CaseResult }[] = [];
  const mk = (label: string, fac: Factors, seismic: boolean) =>
    out.push({ label, res: evalCase(g, label, fac, seismic, { passive: false, surchargeV: fac.liveV > 0 && q > 0 }) });
  mk(`${f.dead}D + ${f.live}L + ${f.lateral}H`, { dead: f.dead, liveV: f.live, soilH: f.lateral, liveH: f.live, water: f.lateral, eq: 0 }, false);
  mk(`${f.deadMin}D + ${f.lateral}H`, { dead: f.deadMin, liveV: 0, soilH: f.lateral, liveH: f.live, water: f.lateral, eq: 0 }, false);
  if (g.inp.seismic.on) {
    mk(`${f.dead}D + L + ${f.lateral}H + ${f.eq}E`, { dead: f.dead, liveV: 1, soilH: f.lateral, liveH: 1, water: f.lateral, eq: f.eq }, true);
    mk(`${f.deadMin}D + ${f.lateral}H + ${f.eq}E`, { dead: f.deadMin, liveV: 0, soilH: f.lateral, liveH: 0, water: f.lateral, eq: f.eq }, true);
  }
  return out;
}

// ---------------------------------------------------------------------------
// Acero mínimo
// ---------------------------------------------------------------------------
function asMinFlex(d: number, fc: number, fy: number): number {
  return Math.max((0.25 * Math.sqrt(fc)) / fy, 1.4 / fy) * 1 * d * 1e4; // cm²/m
}

function rhoVertMin(db: number, fy: number): number {
  return db <= 16 && fy >= 420 ? 0.0012 : 0.0015;
}
function rhoHorizMin(db: number, fy: number): number {
  return db <= 16 && fy >= 420 ? 0.002 : 0.0025;
}

/** Acero de diseño: As_req, o el menor entre 4/3·As_req y el mínimo por flexión. */
function asDesign(asReq: number, asMinF: number, asMinOther: number): number {
  const a = Math.max(asReq, Math.min((4 / 3) * asReq, asMinF));
  return Math.max(a, asMinOther);
}

// ---------------------------------------------------------------------------
// Zapata: pie y talón (voladizo)
// ---------------------------------------------------------------------------
function baseThickness(g: WallGeom, x: number): number {
  if (g.xFb > 1e-9 && x < g.xFb) return g.hbTip + ((g.hb - g.hbTip) * x) / g.xFb;
  return g.hb;
}

function soilColumn(g: WallGeom, x: number): number {
  // peso por metro cuadrado del suelo sobre el talón en x (con nivel freático)
  const inp = g.inp;
  const ys = g.surfaceY(x);
  const yw = g.yWater;
  const hb = g.hb;
  let w = 0;
  if (!isFinite(yw) || yw <= hb) w = inp.fill.gamma * (ys - hb);
  else {
    const below = Math.max(Math.min(ys, yw) - hb, 0);
    const above = Math.max(ys - Math.max(hb, yw), 0);
    w = inp.fill.gammaSat * below + inp.fill.gamma * above;
  }
  return w;
}

function downward(g: WallGeom, res: CaseResult, x: number, region: 'toe' | 'heel'): number {
  const inp = g.inp;
  const fac = res.factors;
  const kv = res.seismic ? inp.seismic.kv : 0;
  const dead = fac.dead * (1 - kv);
  const tb = baseThickness(g, x);
  let w = inp.mat.gammaC * tb * dead;
  if (region === 'toe') {
    if (inp.includeToeSoil) w += inp.found.gamma * Math.max(Math.max(inp.Df, g.hb) - tb, 0) * dead;
  } else {
    w += soilColumn(g, x) * dead;
    if (inp.fill.q > 0 && fac.liveV > 0 && res.v.some((v) => v.name === 'Sobrecarga sobre el relleno')) w += inp.fill.q * fac.liveV;
  }
  return w;
}

interface SlabEnv {
  toeBot: { M: number; V: number; label: string };
  toeTop: { M: number; V: number; label: string };
  heelTop: { M: number; V: number; label: string };
  heelBot: { M: number; V: number; label: string };
}

function slabEnvelope(g: WallGeom, uls: { label: string; res: CaseResult }[], dToe: number, dHeel: number): SlabEnv {
  const env: SlabEnv = {
    toeBot: { M: 0, V: 0, label: '—' }, toeTop: { M: 0, V: 0, label: '—' },
    heelTop: { M: 0, V: 0, label: '—' }, heelBot: { M: 0, V: 0, label: '—' },
  };
  const Lt = g.xFb;
  let vToe = 0, vHeel = 0;
  void dHeel;
  for (const c of uls) {
    const up = (x: number) => c.res.qAt(x) + c.res.uAt(x);
    if (Lt > 1e-6) {
      const Mt = simpson((x) => (up(x) - downward(g, c.res, x, 'toe')) * (Lt - x), 0, Lt);
      const xv = Math.max(Lt - dToe, 0);
      const Vt = simpson((x) => up(x) - downward(g, c.res, x, 'toe'), 0, xv);
      vToe = Math.max(vToe, Math.abs(Vt));
      if (Mt > env.toeBot.M) env.toeBot = { M: Mt, V: 0, label: c.label };
      if (-Mt > env.toeTop.M) env.toeTop = { M: -Mt, V: 0, label: c.label };
    }
    const xb = g.xBb;
    if (g.B - xb > 1e-6) {
      const Mh = simpson((x) => (downward(g, c.res, x, 'heel') - up(x)) * (x - xb), xb, g.B);
      const Vh = simpson((x) => downward(g, c.res, x, 'heel') - up(x), xb, g.B);
      vHeel = Math.max(vHeel, Math.abs(Vh));
      if (Mh > env.heelTop.M) env.heelTop = { M: Mh, V: 0, label: c.label };
      if (-Mh > env.heelBot.M) env.heelBot = { M: -Mh, V: 0, label: c.label };
    }
  }
  env.toeBot.V = env.toeTop.V = vToe;
  env.heelTop.V = env.heelBot.V = vHeel;
  return env;
}

function slabDesign(
  g: WallGeom, name: string, label: string, face: 'superior' | 'inferior', M: number, V: number, h: number, bar: Bar, ldAvail: number, plain = false,
): SlabDesign {
  const inp = g.inp;
  const m = inp.mat;
  const d = h - m.coverFound - bar.db / 2000;
  const fr = flexureAs(M, 1, d, m.fc, m.fy);
  const asReq = isFinite(fr.As) ? fr.As : 0;
  const asMinF = asMinFlex(d, m.fc, m.fy);
  const asMinS = 0.0018 * h * 1e4 * (420 / Math.max(m.fy, 420));
  const asDes = plain ? 0 : asDesign(asReq, asMinF, Math.max(asMinS, 0.0014 * h * 1e4));
  const det = chooseSpacing(asDes, bar, Math.min(3 * h, 0.45));
  const phiMn = flexureCapacity(det.asProv, 1, d, m.fc, m.fy);
  const rhoW = det.asProv * 1e-4 / d;
  const cap = oneWayVc(1, d, m.fc, rhoW, m.code, m.lambda);
  const phiVc = PHI_SHEAR * cap.Vc;
  const ldReq = developmentLength(bar.db, m.fy, m.fc, { lambda: m.lambda });
  const shrink = 0.0018 * h * 1e4;
  return {
    name, caseLabel: label, face, Mu: M, d, b: 1, AsReq: asReq, AsMin: Math.max(asMinF, asMinS), AsDes: asDes, det, bar, phiMn, Vu: V, phiVc,
    ratioM: phiMn > 0 ? M / phiMn : 0, ratioV: phiVc > 0 ? V / phiVc : 0, ldReq, ldAvail, hook: ldAvail < ldReq,
    shrinkAs: shrink, shrinkDet: m.footLong ? chooseSpacing(shrink / 2, findBar(m.barLong), 0.45) : { text: 'No se coloca', spacing: 0.45, asProv: 0, ok: true },
    sectionOk: fr.ok && M <= phiMn + 1e-9 && V <= phiVc + 1e-9,
    note: fr.ok ? undefined : 'Sección insuficiente: aumentar el espesor.',
  };
}

function barDet(bar: Bar | null, spacing: number): Detailing {
  if (!bar || !(spacing > 0)) return { text: 'No se coloca', spacing: 0.45, asProv: 0, ok: true };
  return { text: `${bar.id} @ ${(spacing * 100).toFixed(1).replace(/\.0$/, '')} cm`, spacing, asProv: bar.area / spacing, ok: true };
}

/** Verificación de una sección de la zapata con el acero definido por el usuario (sin diseñarlo). */
function slabCheck(
  g: WallGeom, name: string, label: string, face: 'superior' | 'inferior', M: number, V: number, bar: Bar | null, spacing: number, ldAvail: number, dBarT: number,
): SlabDesign {
  const inp = g.inp;
  const m = inp.mat;
  const h = g.hb;
  const dUse = h - m.coverFound - (bar ? bar.db : dBarT) / 2000;
  const det = barDet(bar, spacing);
  const fr = flexureAs(M, 1, dUse, m.fc, m.fy);
  const asReq = M > 1e-9 ? (isFinite(fr.As) ? fr.As : Infinity) : 0;
  const asMin = 0.0018 * h * 1e4 * (420 / Math.max(m.fy, 420));
  const phiMn = det.asProv > 0 ? flexureCapacity(det.asProv, 1, dUse, m.fc, m.fy) : 0;
  const rhoW = (det.asProv * 1e-4) / dUse;
  const cap = oneWayVc(1, dUse, m.fc, rhoW, m.code, m.lambda);
  const phiVc = PHI_SHEAR * cap.Vc;
  const ldReq = bar ? developmentLength(bar.db, m.fy, m.fc, { lambda: m.lambda }) : 0;
  const ratioM = M <= 1e-9 ? 0 : phiMn > 0 ? M / phiMn : Infinity;
  const minOk = !bar || det.asProv + 1e-9 >= asMin;
  return {
    name, caseLabel: label, face, Mu: M, d: dUse, b: 1, AsReq: asReq, AsMin: asMin, AsDes: Math.max(asReq, bar ? asMin : 0), det, bar: bar ?? findBar(m.barToe), phiMn, Vu: V, phiVc,
    ratioM, ratioV: phiVc > 0 ? V / phiVc : 0, ldReq, ldAvail, hook: !!bar && ldAvail < ldReq,
    shrinkAs: 0.0018 * h * 1e4, shrinkDet: barDet(m.mesh.longOn ? findBar(m.mesh.longBar) : null, m.mesh.longS),
    sectionOk: minOk && (M <= 1e-9 || (fr.ok && M <= phiMn + 1e-9)) && V <= phiVc + 1e-9,
    note: !bar && M > 1e-9 ? 'No hay acero en esta cara: defina la malla correspondiente.' : !minOk ? 'Acero menor que el mínimo (0.0018·b·h).' : fr.ok || M <= 1e-9 ? undefined : 'Sección insuficiente: aumentar el espesor.',
  };
}

// ---------------------------------------------------------------------------
// Pantalla de concreto reforzado en voladizo
// ---------------------------------------------------------------------------
function stemDesignRC(g: WallGeom, uls: { label: string; res: CaseResult }[]): StemDesign {
  const inp = g.inp;
  const m = inp.mat;
  const f = inp.factors;
  const lat = stemLateral(g);
  const bar = findBar(m.barStem);
  const barH = findBar(m.barStemH);
  const N = 20;
  const secs: StemSection[] = [];
  let seismicGov = false;
  for (let k = 0; k <= N; k++) {
    const y = (inp.H * k) / N;
    const L = sectionLoad(g, lat, y);
    const t = g.stemT(y);
    const d = t - m.cover - bar.db / 2000;
    const Mst = f.lateral * (L.M.soil + L.M.water) + f.live * L.M.sur;
    const Mse = inp.seismic.on ? f.lateral * (L.M.soil + L.M.water) + 1 * L.M.sur + f.eq * (L.M.seis + L.M.inertia) : 0;
    const Vst = f.lateral * (L.V.soil + L.V.water) + f.live * L.V.sur;
    const Vse = inp.seismic.on ? f.lateral * (L.V.soil + L.V.water) + 1 * L.V.sur + f.eq * (L.V.seis + L.V.inertia) : 0;
    const Mu = Math.max(Mst, Mse);
    if (Mse > Mst && k === 0) seismicGov = true;
    const Vu = Math.max(Vst, Vse);
    const fr = flexureAs(Mu, 1, d, m.fc, m.fy);
    const asReq = isFinite(fr.As) ? fr.As : 1e6;
    const asMinF = asMinFlex(d, m.fc, m.fy);
    const asMinW = rhoVertMin(bar.db, m.fy) * t * 1e4;
    const asDes = asDesign(asReq, asMinF, asMinW);
    secs.push({ y, t, d, MuStatic: Mst, MuSeismic: Mse, Mu, Vu, AsReq: asReq, AsMin: Math.max(asMinF, asMinW), AsDes: asDes, phiMn: 0, ok: fr.ok });
  }
  const layers = m.stemLayers;
  const vertAuto = !(m.stemVertS > 0);
  const base: Detailing = vertAuto
    ? chooseSpacing(secs[0].AsDes, bar, Math.min(3 * secs[0].t, 0.45))
    : { text: `${bar.id} @ ${(m.stemVertS * 100).toFixed(1).replace(/\.0$/, '')} cm`, spacing: m.stemVertS, asProv: bar.area / m.stemVertS, ok: true };
  const vertRatio = secs[0].AsDes / Math.max(base.asProv, 1e-9);
  for (const s of secs) {
    s.phiMn = flexureCapacity(base.asProv, 1, s.d, m.fc, m.fy);
  }
  // Corte de la mitad de las barras
  let yCut: number | null = null;
  let cutNote = 'Se prolongan todas las barras hasta la corona.';
  for (const s of secs) {
    if (2 * s.AsDes <= base.asProv) {
      const ext = Math.max(s.d, 12 * bar.db / 1000);
      const yc = s.y + ext;
      if (yc < inp.H - 0.2) {
        yCut = yc;
        cutNote = `La mitad de las barras puede cortarse a ${yc.toFixed(2)} m sobre la base de la pantalla (punto teórico ${s.y.toFixed(2)} m + d o 12·db).`;
      }
      break;
    }
  }
  // Cortante crítico a d de la base
  const d0 = secs[0].d;
  const yCrit = Math.min(d0, inp.H);
  const Lc = sectionLoad(g, lat, yCrit);
  const Vst = f.lateral * (Lc.V.soil + Lc.V.water) + f.live * Lc.V.sur;
  const Vse = inp.seismic.on ? f.lateral * (Lc.V.soil + Lc.V.water) + Lc.V.sur + f.eq * (Lc.V.seis + Lc.V.inertia) : 0;
  const Vu = Math.max(Vst, Vse);
  const dC = g.stemT(yCrit) - m.cover - bar.db / 2000;
  const cap = oneWayVc(1, dC, m.fc, (base.asProv * 1e-4) / dC, m.code, m.lambda);
  const phiVc = PHI_SHEAR * cap.Vc;

  const tAvg = (inp.tTop + inp.tBot) / 2;
  const rhoH = rhoHorizMin(barH.db, m.fy);
  const AsH = rhoH * tAvg * 1e4;
  const rhoV = rhoVertMin(bar.db, m.fy);
  const front: Detailing = layers === 2 ? chooseSpacing(0.5 * rhoV * tAvg * 1e4, barH, 0.45) : { text: 'No se coloca', spacing: 0.45, asProv: 0, ok: true };
  const horizAuto = !(m.horizS > 0);
  const hDet: Detailing = !m.horizOn
    ? { text: 'No se coloca', spacing: 0.45, asProv: 0, ok: true }
    : horizAuto
      ? chooseSpacing(AsH / layers, barH, 0.45)
      : { text: `${barH.id} @ ${(m.horizS * 100).toFixed(1).replace(/\.0$/, '')} cm`, spacing: m.horizS, asProv: barH.area / m.horizS, ok: true };
  const horizRatio = m.horizOn ? AsH / Math.max(hDet.asProv * layers, 1e-9) : Infinity;
  // Anclaje de las barras de la pantalla en la zapata
  const ld = developmentLength(bar.db, m.fy, m.fc, { lambda: m.lambda });
  const ldh = hookDevelopment(bar.db, m.fy, m.fc, m.lambda);
  const avail = g.hb - m.coverFound;
  return {
    sections: secs, bar, barH, base, yCut, cutNote, AsH, horizontalDet: hDet, frontVertDet: front, rhoV, rhoH,
    layers, centered: false, vertAuto, vertRatio, horizOn: m.horizOn, horizAuto, horizLayers: layers, horizRatio,
    critical: { y: yCrit, d: dC, Vu, phiVc, ratio: Vu / phiVc, formula: cap.formula },
    anchorage: { ldh, ld, available: avail, ok: avail >= ldh },
    governing: seismicGov ? 'sísmico' : 'estático',
    sectionOk: secs.every((s) => s.ok) && Vu <= phiVc,
  };
}

// ---------------------------------------------------------------------------
// Pantalla de mampostería reforzada (diseño por resistencia, simplificado)
// ---------------------------------------------------------------------------
function chooseSpacingModule(asReq: number, bar: Bar, module = 0.2, maxS = 1.2): Detailing {
  const raw = bar.area / Math.max(asReq, 1e-9);
  let s = Math.floor((raw + 1e-9) / module) * module;
  let ok = true;
  let note: string | undefined;
  if (s > maxS) s = maxS;
  if (s < module - 1e-9) {
    ok = false;
    s = module;
    note = 'Con celdas cada 20 cm el acero no alcanza: usar una barra mayor o aumentar el espesor.';
  }
  return { text: `${bar.id} @ ${(s * 100).toFixed(0)} cm`, spacing: s, asProv: bar.area / s, ok, note };
}

function masonryFlexure(Mu: number, d: number, fm: number, fy: number, b = 1): { As: number; ok: boolean; aMax: number; a: number } {
  const k = 0.8 * fm * b * 1000; // kN/m por m de a
  const inner = d * d - (2 * Mu) / (PHI_FLEX * k);
  const epsY = fy / 200000;
  const cMax = (0.0025 * d) / (0.0025 + 1.5 * epsY);
  const aMax = 0.8 * cMax;
  if (inner <= 0) return { As: Infinity, ok: false, aMax, a: d };
  const a = d - Math.sqrt(inner);
  const As = ((0.8 * fm * b * a) / fy) * 1e4;
  return { As, ok: a <= aMax + 1e-9, aMax, a };
}

/** Resistencia nominal a cortante de la mampostería Vnm (TMS 402 SD, simplificado), kN, para un ancho b y peralte d (m). */
function masonryVn(b: number, d: number, Mu: number, Vu: number, fm: number): number {
  const mvd = Math.min(1, Math.max(Mu, 1e-6) / Math.max(Vu * d, 1e-6));
  const fmPsi = fm * 145.038;
  const AnIn2 = b * d * 1550.0031;
  const lbToKn = 4.44822 / 1000;
  const mvdC = Math.min(Math.max(mvd, 0.25), 1);
  const Vnm = (4.0 - 1.75 * mvd) * AnIn2 * Math.sqrt(fmPsi) * lbToKn;
  const VnMax = (6 - (2 * (mvdC - 0.25)) / 0.75) * AnIn2 * Math.sqrt(fmPsi) * lbToKn;
  return Math.min(Vnm, VnMax);
}

function stemDesignMasonry(g: WallGeom): StemDesign {
  const inp = g.inp;
  const m = inp.mat;
  const f = inp.factors;
  const lat = stemLateral(g);
  const bar = findBar(m.barStem);
  const barH = findBar(m.barStemH);
  const N = 20;
  const layers = m.stemLayers;
  const secs: StemSection[] = [];
  let seismicGov = false;
  for (let k = 0; k <= N; k++) {
    const y = (inp.H * k) / N;
    const L = sectionLoad(g, lat, y);
    const t = g.stemT(y);
    const d = layers === 1 ? t / 2 : t - 0.05 - bar.db / 2000; // 1 capa: barra centrada en la celda; 2 capas: barra del lado del relleno
    const Mst = f.lateral * (L.M.soil + L.M.water) + f.live * L.M.sur;
    const Mse = inp.seismic.on ? f.lateral * (L.M.soil + L.M.water) + L.M.sur + f.eq * (L.M.seis + L.M.inertia) : 0;
    const Vst = f.lateral * (L.V.soil + L.V.water) + f.live * L.V.sur;
    const Vse = inp.seismic.on ? f.lateral * (L.V.soil + L.V.water) + L.V.sur + f.eq * (L.V.seis + L.V.inertia) : 0;
    const Mu = Math.max(Mst, Mse);
    if (Mse > Mst && k === 0) seismicGov = true;
    const fr = masonryFlexure(Mu, d, m.fm, m.fy);
    const asReq = isFinite(fr.As) ? fr.As : 1e6;
    const asMinW = 0.0007 * t * 1e4;
    const asDes = Math.max(asReq, asMinW);
    secs.push({ y, t, d, MuStatic: Mst, MuSeismic: Mse, Mu, Vu: Math.max(Vst, Vse), AsReq: asReq, AsMin: asMinW, AsDes: asDes, phiMn: 0, ok: fr.ok });
  }
  const vertAuto = !(m.stemVertS > 0);
  const base: Detailing = vertAuto ? chooseSpacingModule(secs[0].AsDes, bar) : { text: `${bar.id} @ ${(m.stemVertS * 100).toFixed(0)} cm`, spacing: m.stemVertS, asProv: bar.area / m.stemVertS, ok: true };
  const vertRatio = secs[0].AsDes / Math.max(base.asProv, 1e-9);
  for (const s of secs) {
    const a = (base.asProv * 1e-4 * m.fy) / (0.8 * m.fm * 1000);
    s.phiMn = PHI_FLEX * base.asProv * 1e-4 * m.fy * (s.d - a / 2) * 1000;
  }
  let yCut: number | null = null;
  let cutNote = 'Se prolongan todas las barras hasta la corona.';
  for (const s of secs) {
    if (2 * s.AsDes <= base.asProv) {
      const ext = Math.max(s.d, 40 * bar.db / 1000);
      const yc = s.y + ext;
      if (yc < inp.H - 0.2) {
        yCut = yc;
        cutNote = `La mitad de las barras puede interrumpirse a ${yc.toFixed(2)} m sobre la base de la pantalla (punto teórico + d o 40·db).`;
      }
      break;
    }
  }
  // Cortante (TMS 402 SD simplificado, unidades en lb/psi para las constantes)
  const t0 = secs[0].t;
  const d0 = secs[0].d;
  const yCrit = Math.min(d0, inp.H);
  const Lc = sectionLoad(g, lat, yCrit);
  const Vst = f.lateral * (Lc.V.soil + Lc.V.water) + f.live * Lc.V.sur;
  const Vse = inp.seismic.on ? f.lateral * (Lc.V.soil + Lc.V.water) + Lc.V.sur + f.eq * (Lc.V.seis + Lc.V.inertia) : 0;
  const Vu = Math.max(Vst, Vse);
  const Mcrit = Math.max(secs[0].Mu, 1e-6);
  const mvd = Math.min(1, Mcrit / Math.max(Vu * d0, 1e-6));
  const fmPsi = m.fm * 145.038;
  const AnIn2 = t0 * 1550.0031; // in² por metro de muro (b = 1 m)
  const lbToKn = 4.44822 / 1000;
  const Vnm = (4.0 - 1.75 * mvd) * AnIn2 * Math.sqrt(fmPsi) * lbToKn; // kN
  const mvdC = Math.min(Math.max(mvd, 0.25), 1);
  const VnMax = (6 - (2 * (mvdC - 0.25)) / 0.75) * AnIn2 * Math.sqrt(fmPsi) * lbToKn;
  const phiVn = 0.8 * Math.min(Vnm, VnMax);
  const rhoH = 0.0007;
  const AsH = rhoH * ((inp.tTop + inp.tBot) / 2) * 1e4;
  const horizAuto = !(m.horizS > 0);
  const hDet: Detailing = !m.horizOn
    ? { text: 'No se coloca', spacing: 0.4, asProv: 0, ok: true }
    : horizAuto ? chooseSpacingModule(AsH, barH, 0.2, 1.2) : { text: `${barH.id} @ ${(m.horizS * 100).toFixed(0)} cm`, spacing: m.horizS, asProv: barH.area / m.horizS, ok: true };
  const horizRatio = m.horizOn ? AsH / Math.max(hDet.asProv, 1e-9) : Infinity;
  const ld = developmentLength(bar.db, m.fy, m.fc, { lambda: m.lambda });
  const ldh = hookDevelopment(bar.db, m.fy, m.fc, m.lambda);
  return {
    sections: secs, bar, barH, base, yCut, cutNote, AsH, horizontalDet: hDet,
    frontVertDet: layers === 2 ? base : { text: 'No se coloca', spacing: 0, asProv: 0, ok: true }, rhoV: 0.0007, rhoH,
    layers, centered: layers === 1, vertAuto, vertRatio, horizOn: m.horizOn, horizAuto, horizLayers: 1, horizRatio,
    critical: { y: yCrit, d: d0, Vu, phiVc: phiVn, ratio: Vu / phiVn, formula: 'φVn = 0.8·[(4.0 − 1.75·Mu/(Vu·dv))·An·√f′m] (TMS 402 SD, simplificado)' },
    anchorage: { ldh, ld, available: g.hb - m.coverFound, ok: g.hb - m.coverFound >= ldh },
    masonry: true, governing: seismicGov ? 'sísmico' : 'estático',
    sectionOk: secs.every((s) => s.ok) && Vu <= phiVn,
  };
}

// ---------------------------------------------------------------------------
// Muros de gravedad: secciones de concreto simple o mampostería sin refuerzo
// ---------------------------------------------------------------------------
function gravitySections(g: WallGeom): GravitySection[] {
  const inp = g.inp;
  const m = inp.mat;
  const f = inp.factors;
  const masonry = inp.type === 'gravityMasonry';
  const gab = inp.type === 'gabion';
  const lat = stemLateral(g);
  const gammaStem = g.parts.find((p) => p.id === 'stem')!.gamma;
  const out: GravitySection[] = [];
  const NS = 10;
  const em = earthModel(g, false);
  const virtual = em.mode === 'virtual';
  const levels = gab ? Array.from({ length: Math.round(inp.gab.n) }, (_, k) => k * inp.gab.hc) : Array.from({ length: NS + 1 }, (_, k) => (inp.H * k) / NS);
  for (const y of levels) {
    const ys = g.hb + y;
    const xf = g.stemFrontX(y);
    const xb = g.stemBackX(y);
    const t = xb - xf;
    const xm = (xf + xb) / 2;
    // Peso del tramo superior de la pantalla
    const above = clipHalfPlane(g.stemPoly, 0, 1, -ys);
    const pa = above.length >= 3 ? polyProps(above) : null;
    const Wst = pa ? pa.A * gammaStem : 0;
    const xW = pa ? pa.cx : xm;
    const L = sectionLoad(g, lat, y);
    const zs = L.zs;
    // Altura de las resultantes sobre la sección
    const arm = (V: number, M: number) => (V > 1e-9 ? M / V : 0);
    const compH = (V: number, M: number) => ({ H: V, a: arm(V, M) });
    const cs = compH(L.V.soil, L.M.soil), cq = compH(L.V.sur, L.M.sur), cw = compH(L.V.water, L.M.water);
    // Componente vertical del empuje
    const tanTh = Math.tan(rad(lat.deltaPlusPsi));
    const pvSoil = virtual ? L.V.soil * Math.tan(rad(inp.fill.beta)) : L.V.soil * tanTh;
    const pvSur = virtual ? L.V.sur * Math.tan(rad(inp.fill.beta)) : L.V.sur * tanTh;
    const pvWater = L.V.water * Math.tan(rad(em.psiDeg));
    // Cuña de suelo sobre la cara inclinada (modelo Rankine)
    let Wwedge = 0, xWedge = xb;
    if (virtual && xb > g.xBt + 1e-6) {
      const poly = [{ x: xb, y: ys }, { x: xb, y: g.yTop }, { x: g.xBt, y: g.yTop }];
      const sw = soilWeight(poly, inp.fill.gamma, inp.fill.gammaSat, g.yWater);
      Wwedge = sw.W;
      xWedge = sw.x;
    }
    void zs;
    const evalAt = (dead: number, lat1: number, liveH: number, water: number) => {
      const Vv = Wst * dead + Wwedge * dead + (pvSoil * lat1) + (pvSur * liveH) + pvWater * water;
      const Mt = // momento de tracción en la cara posterior respecto al centro de la sección
        cs.H * lat1 * cs.a + cq.H * liveH * cq.a + cw.H * water * cw.a -
        (Wst * dead * (xW - xm) + Wwedge * dead * (xWedge - xm) + pvSoil * lat1 * (xb - xm) + pvSur * liveH * (xb - xm) + pvWater * water * (xb - xm));
      const H = cs.H * lat1 + cq.H * liveH + cw.H * water;
      return { N: Vv, M: Mt, V: H };
    };
    if (gab) {
      const G = inp.gab;
      const r1 = evalAt(1, 1, 1, 1);
      const A = t;
      const sectionRatios = (r: { N: number; M: number; V: number }, sigAll: number) => {
        const e = Math.abs(r.M) / Math.max(r.N, 1e-9);
        let sigBack: number, sigFront: number;
        if (r.N <= 0 || e >= t / 2) {
          sigBack = sigFront = Infinity;
        } else if (e <= t / 6) {
          sigBack = r.N / A - (6 * r.M) / (A * A);
          sigFront = r.N / A + (6 * r.M) / (A * A);
        } else {
          const smax = (2 * r.N) / (3 * (t / 2 - e));
          sigFront = r.M > 0 ? smax : 0;
          sigBack = r.M > 0 ? 0 : smax;
        }
        const ratioC = Math.max(sigBack, sigFront) / sigAll;
        const ratioT = e / (G.eFrac * t);
        const vAll = (G.muG * Math.max(r.N, 0) + G.cG * A) / G.fsSlide;
        const ratioV = r.V / Math.max(vAll, 1e-9);
        return { sigBack, sigFront, ratioC, ratioT, ratioV, worst: Math.max(ratioC, ratioT, ratioV) };
      };
      let use: { N: number; M: number; V: number } = r1;
      let rr = sectionRatios(r1, G.sigmaAllow);
      if (inp.seismic.on) {
        const inertia = inp.seismic.kh * Wst;
        const yI = pa ? pa.cy - ys : 0;
        const r2 = { N: r1.N, M: r1.M + L.M.seis + inertia * Math.abs(yI), V: r1.V + L.V.seis + inertia };
        const q2 = sectionRatios(r2, G.sigmaAllow * f.qaIncE);
        if (q2.worst > rr.worst) {
          rr = q2;
          use = r2;
        }
      }
      out.push({ y, t, N: use.N, M: use.M, V: use.V, sigBack: rr.sigBack, sigFront: rr.sigFront, ratioC: rr.ratioC, ratioT: rr.ratioT, ratioV: rr.ratioV, ok: rr.worst <= 1 });
    } else if (masonry) {
      const r = evalAt(1, 1, 1, 1);
      const A = t, S = (t * t) / 6;
      const sigBack = r.N / A - r.M / S;
      const sigFront = r.N / A + r.M / S;
      const fcAll = m.fcAllowRatio * m.fm * 1000;
      const ftAll = m.ftAllow * 1000;
      const ratioC = Math.max(sigBack, sigFront) / fcAll;
      const ratioT = sigBack < 0 ? (ftAll > 0 ? -sigBack / ftAll : Infinity) : 0;
      const vAll = (m.cJ * 1000 * A + m.muJ * Math.max(r.N, 0)) / m.fsJoint;
      const ratioV = r.V / Math.max(vAll, 1e-9);
      out.push({ y, t, N: r.N, M: r.M, V: r.V, sigBack, sigFront, ratioC, ratioT, ratioV, ok: ratioC <= 1 && ratioT <= 1 && ratioV <= 1 });
    } else {
      const r = evalAt(f.deadMin, f.lateral, f.live, f.lateral);
      const rs = inp.seismic.on ? (() => {
        const e2 = evalAt(f.deadMin, f.lateral, 1, f.lateral);
        // incremento sísmico y masa del muro
        const inertia = inp.seismic.kh * Wst;
        const yI = pa ? pa.cy - ys : 0;
        const dMom = f.eq * (L.M.seis + inertia * Math.abs(yI));
        return { N: e2.N, M: e2.M + dMom, V: e2.V + f.eq * (L.V.seis + inertia) };
      })() : null;
      const use = rs && Math.abs(rs.M) > Math.abs(r.M) ? rs : r;
      const A = t, S = (t * t) / 6;
      const sigBack = use.N / A - use.M / S;
      const sigFront = use.N / A + use.M / S;
      const ftAll = PHI_PLAIN * 0.42 * m.lambda * Math.sqrt(m.fc) * 1000;
      const fcAll = PHI_PLAIN * 0.85 * m.fc * 1000;
      const ratioC = Math.max(sigBack, sigFront) / fcAll;
      const ratioT = sigBack < 0 ? -sigBack / ftAll : sigFront < 0 ? -sigFront / ftAll : 0;
      const phiVn = PHI_PLAIN * 0.11 * m.lambda * Math.sqrt(m.fc) * 1000 * t;
      const ratioV = use.V / phiVn;
      out.push({ y, t, N: use.N, M: use.M, V: use.V, sigBack, sigFront, ratioC, ratioT, ratioV, ok: ratioC <= 1 && ratioT <= 1 && ratioV <= 1 });
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// Llave de corte
// ---------------------------------------------------------------------------
function keyDesign(g: WallGeom): KeyDesign | null {
  const inp = g.inp;
  if (!inp.key.enabled) return null;
  const m = inp.mat;
  const Kp = kpRankine(inp.found.phi);
  const z1 = Math.max(inp.Df, g.hb);
  const z2 = z1 + inp.key.d;
  const pf = passiveForce(Kp, inp.found.gamma, inp.found.c, z1, z2);
  const factor = inp.passive.factor;
  const lat = inp.factors.lateral;
  const p = (z: number) => Kp * inp.found.gamma * z + 2 * inp.found.c * Math.sqrt(Kp);
  const Mkey = simpson((z) => p(z) * (z - z1), z1, z2) * factor * lat;
  const Vkey = pf.F * factor * lat;
  const bar = findBar(m.barKey);
  const d = inp.key.b - m.coverFound - bar.db / 2000;
  const tmp = slabDesign(g, 'Llave de corte', 'Empuje pasivo mayorado', 'inferior', Mkey, Vkey, inp.key.b, bar, g.hb - m.coverFound);
  // en la llave el brazo efectivo es el ancho de la llave
  void d;
  return { slab: { ...tmp, face: 'inferior' }, Pp: pf.F, PpUsed: pf.F * factor };
}

// ---------------------------------------------------------------------------
// Contrafuertes
// ---------------------------------------------------------------------------
function counterfortDesign(g: WallGeom, uls: { label: string; res: CaseResult }[]): CounterfortDesign {
  const inp = g.inp;
  const m = inp.mat;
  const f = inp.factors;
  const internal = cfInternal(inp.type);
  const mas = isMasonryStem(inp.type);
  const phiV = mas ? 0.8 : PHI_SHEAR;
  const flex = (Mu: number, b: number, d: number) => (mas ? masonryFlexure(Mu, d, m.fm, m.fy, b) : flexureAs(Mu, b, d, m.fc, m.fy));
  const lat = stemLateral(g);
  const s = inp.cf.s;
  const tc = inp.cf.t;
  const Ls = Math.max(s - tc, 0.1);
  const bar = findBar(inp.cf.rb.mainBar);
  const barH = findBar(inp.cf.rb.stemHBar);
  const barV = findBar(inp.cf.rb.stemVBar);
  const NS = 10;
  const notes: string[] = [];
  // Presión mayorada en función de la profundidad
  const pu = (z: number) => {
    const st = f.lateral * (lat.soil(z) + lat.water(z)) + f.live * lat.sur(z);
    const se = inp.seismic.on ? f.lateral * (lat.soil(z) + lat.water(z)) + lat.sur(z) + f.eq * lat.seis(z) : 0;
    return Math.max(st, se);
  };
  const H = inp.H;
  const dBar = bar.db / 1000;

  // Losa de la pantalla entre contrafuertes
  const stemSlab: CounterfortDesign['stemSlab'] = [];
  const tAt = (y: number) => g.stemT(y);
  for (let k = 0; k <= NS; k++) {
    const y = (H * k) / NS;
    const z = H - y;
    const t = tAt(y);
    const d = mas ? t / 2 : t - m.cover - dBar / 2;
    const w = pu(z);
    const Mneg = (w * Ls * Ls) / 12;
    const Mpos = (w * Ls * Ls) / 16;
    const fn = flex(Mneg, 1, d);
    const fp = flex(Mpos, 1, d);
    const asMinW = mas ? 0.0007 * t * 1e4 : rhoHorizMin(barH.db, m.fy) * t * 1e4 / 2;
    stemSlab.push({
      y, t, d, wu: w, MuNeg: Mneg, MuPos: Mpos,
      AsNeg: Math.max(isFinite(fn.As) ? fn.As : 1e6, asMinW), AsPos: Math.max(isFinite(fp.As) ? fp.As : 1e6, asMinW),
    });
  }
  // Cortante de la losa de la pantalla en el borde de los contrafuertes (a d de la cara)
  const sw = stemSlab[0];
  const stemVu = (sw.wu * (Ls / 2 - sw.d));
  const stemCapVc = mas ? masonryVn(1, sw.d, Math.max(sw.MuNeg, 1e-6), Math.max(stemVu, 1e-6), m.fm) : oneWayVc(1, sw.d, m.fc, 0.003, 'ACI318_14', m.lambda).Vc;
  const stemShear = { Vu: stemVu, phiVc: phiV * stemCapVc, ratio: stemVu / (phiV * stemCapVc) };
  const tAvg = (inp.tTop + inp.tBot) / 2;
  const vertDet = mas ? chooseSpacingModule(0.0007 * tAvg * 1e4, barV, 0.2, 1.2) : chooseSpacing(0.5 * rhoVertMin(barV.db, m.fy) * tAvg * 1e4, barV, 0.45);
  const vertBottomDet = mas ? chooseSpacingModule(0.25 * Math.max(...stemSlab.map((x) => Math.max(x.AsNeg, x.AsPos))), barV, 0.2, 1.2) : chooseSpacing(0.25 * Math.max(...stemSlab.map((x) => Math.max(x.AsNeg, x.AsPos))), barV, 0.45);
  const maxNeg = Math.max(...stemSlab.map((x) => x.AsNeg));
  const maxPos = Math.max(...stemSlab.map((x) => x.AsPos));
  const tMean = (inp.tTop + inp.tBot) / 2;
  const stemNegDet = mas ? chooseSpacingModule(maxNeg, barH, 0.2, 1.2) : chooseSpacing(maxNeg, barH, Math.min(3 * tMean, 0.45));
  const stemPosDet = mas ? chooseSpacingModule(maxPos, barH, 0.2, 1.2) : chooseSpacing(maxPos, barH, Math.min(3 * tMean, 0.45));

  // Contrafuerte como viga en voladizo
  const projAt = (y: number) => inp.cf.projTop + ((inp.cf.proj - inp.cf.projTop) * (H - y)) / H;
  const slope = Math.atan2(inp.cf.proj - inp.cf.projTop, H);
  const sections: CounterfortSection[] = [];
  const bf = Math.min(s, tc + (mas ? 12 : 16) * tMean);
  for (let k = 0; k <= NS; k++) {
    const y = (H * k) / NS;
    const L = sectionLoad(g, lat, y);
    const zs = L.zs;
    const Mst = f.lateral * (L.M.soil + L.M.water) + f.live * L.M.sur;
    const Mse = inp.seismic.on ? f.lateral * (L.M.soil + L.M.water) + L.M.sur + f.eq * (L.M.seis + L.M.inertia) : 0;
    const Vst = f.lateral * (L.V.soil + L.V.water) + f.live * L.V.sur;
    const Vse = inp.seismic.on ? f.lateral * (L.V.soil + L.V.water) + L.V.sur + f.eq * (L.V.seis + L.V.inertia) : 0;
    const Mcf = s * Math.max(Mst, Mse);
    const Vcf = s * Math.max(Vst, Vse);
    const proj = projAt(y);
    const dcf = tAt(y) + proj - m.coverFound;
    const b = internal ? bf : tc;
    const fr = flex(Mcf, b, dcf);
    const AsReq = isFinite(fr.As) ? fr.As : 1e6;
    const capVc = mas ? masonryVn(tc, dcf, Math.max(Mcf, 1e-6), Math.max(Vcf, 1e-6), m.fm) : oneWayVc(tc, dcf, m.fc, 0.005, 'ACI318_14', m.lambda).Vc;
    const Vs = Math.max(Vcf / phiV - capVc, 0);
    const AvMin = mas ? 0.0007 * tc * 1e4 : (Math.max(0.062 * Math.sqrt(m.fc), 0.35) * tc) / m.fy * 1e4; // cm²/m
    const AvReq = Math.max((Vs / ((mas ? 0.5 : 1) * m.fy * 1000 * dcf)) * 1e4, AvMin);
    const tie = (pu(zs) * s * 1e4) / (phiV * m.fy * 1000);
    sections.push({ y, proj, dcf, Mcf, Vcf, AsReq, AsIncl: AsReq / Math.cos(slope), AvReq, tiesStem: tie });
    void zs;
  }
  const AsMax = Math.max(...sections.map((x) => x.AsIncl));
  const nBars = Math.max(2, Math.ceil(AsMax / bar.area));
  // Estribos horizontales del contrafuerte
  const stirrup = findBar(inp.cf.rb.stirBar);
  const AvMax = Math.max(...sections.map((x) => x.AvReq));
  const sSt = Math.min(Math.floor((2 * stirrup.area / Math.max(AvMax, 1e-6)) * 40) / 40, 0.30);
  const stirrupSpacing = Math.max(sSt, 0.1);
  const vc = sections[0];
  const capcVc = mas ? masonryVn(tc, vc.dcf, Math.max(vc.Mcf, 1e-6), Math.max(vc.Vcf, 1e-6), m.fm) : oneWayVc(tc, vc.dcf, m.fc, 0.005, 'ACI318_14', m.lambda).Vc;
  // Amarres entre pantalla y contrafuerte
  const tieMax = Math.max(...sections.map((x) => x.tiesStem));
  const tieStem = chooseSpacing(tieMax, findBar(inp.cf.rb.tieStemBar), 0.3);

  // Losa de zapata entre contrafuertes
  const slabLabel = internal ? 'Talón entre contrafuertes' : 'Pie entre contrafuertes';
  const region = internal ? { a: g.xBb, b: g.B } : { a: 0, b: g.xFb };
  const slabArr: CounterfortDesign['slab'] = [];
  const hSlab = g.hb;
  const dSlab = hSlab - m.coverFound - dBar / 2;
  let tieForce = 0;
  const NX = 6;
  for (let k = 0; k <= NX; k++) {
    const x = region.a + ((region.b - region.a) * (k + 0.5)) / (NX + 1);
    let wmax = 0;
    for (const c of uls) {
      const up = c.res.qAt(x) + c.res.uAt(x);
      const dn = downward(g, c.res, x, internal ? 'heel' : 'toe');
      const net = internal ? dn - up : up - dn;
      wmax = Math.max(wmax, net);
    }
    const Mneg = (wmax * Ls * Ls) / 12;
    const Mpos = (wmax * Ls * Ls) / 16;
    const fn = flexureAs(Mneg, 1, dSlab, m.fc, m.fy);
    const fp = flexureAs(Mpos, 1, dSlab, m.fc, m.fy);
    const asMin = 0.0018 * hSlab * 1e4;
    slabArr.push({ x, wu: wmax, MuNeg: Mneg, MuPos: Mpos, AsNeg: Math.max(isFinite(fn.As) ? fn.As : 1e6, asMin), AsPos: Math.max(isFinite(fp.As) ? fp.As : 1e6, asMin) });
    tieForce = Math.max(tieForce, wmax * s);
  }
  const barS = findBar(m.mesh.longOn ? m.mesh.longBar : m.barHeel);
  const slabNegDet = chooseSpacing(Math.max(...slabArr.map((x) => x.AsNeg)), barS, Math.min(3 * hSlab, 0.45));
  const slabPosDet = chooseSpacing(Math.max(...slabArr.map((x) => x.AsPos)), barS, Math.min(3 * hSlab, 0.45));
  const tieSlabAs = (tieForce * 1e4) / (PHI_SHEAR * m.fy * 1000);
  const tieSlab = chooseSpacing(tieSlabAs, findBar(inp.cf.rb.tieSlabBar), 0.3);

  // ----- Armado definido por el usuario y verificación -----
  const rb = inp.cf.rb;
  const suggest = {
    nMain: nBars, stirS: stirrupSpacing, tieStemS: tieStem.spacing, tieSlabS: tieSlab.spacing,
    stemHS: Math.min(stemNegDet.spacing, stemPosDet.spacing), stemVS: vertDet.spacing, slabLongS: Math.min(slabNegDet.spacing, slabPosDet.spacing),
  };
  const uBar = findBar(rb.mainBar);
  const uN = Math.max(1, Math.round(rb.nMain));
  const uStir = findBar(rb.stirBar);
  const uTieStem = barDet(findBar(rb.tieStemBar), rb.tieStemS);
  const uTieSlab = barDet(findBar(rb.tieSlabBar), rb.tieSlabS);
  const uStemH = barDet(findBar(rb.stemHBar), rb.stemHS);
  const uStemV = barDet(findBar(rb.stemVBar), rb.stemVS);
  const uLong = barDet(m.mesh.longOn ? findBar(m.mesh.longBar) : null, m.mesh.longS);
  const phiVnUser = phiV * (capcVc + ((mas ? 0.5 : 1) * 2 * uStir.area * 1e-4 * m.fy * 1000 * vc.dcf) / Math.max(rb.stirS, 0.02));
  const AvMinC = mas ? 0.0007 * tc * 1e4 : (Math.max(0.062 * Math.sqrt(m.fc), 0.35) * tc) / m.fy * 1e4;
  const AvProv = (2 * uStir.area) / Math.max(rb.stirS, 0.02);
  const reqVert = mas ? 0.0007 * tAvg * 1e4 : 0.5 * rhoVertMin(barH.db, m.fy) * tAvg * 1e4;
  const maxSlabNeg = Math.max(...slabArr.map((x) => x.AsNeg));
  const maxSlabPos = Math.max(...slabArr.map((x) => x.AsPos));
  const rt = (req: number, prov: number) => (prov > 0 ? req / prov : Infinity);
  const ratios = {
    main: AsMax / Math.max(uN * uBar.area, 1e-9), stirrup: vc.Vcf / phiVnUser, stirMin: AvMinC / Math.max(AvProv, 1e-9),
    tieStem: rt(tieMax, uTieStem.asProv), tieSlab: rt(tieSlabAs, uTieSlab.asProv), stemNeg: rt(maxNeg, uStemH.asProv), stemPos: rt(maxPos, uStemH.asProv),
    vert: rt(reqVert, uStemV.asProv), slabNeg: rt(maxSlabNeg, uLong.asProv), slabPos: rt(maxSlabPos, uLong.asProv),
  };
  const req = { AsMain: AsMax, AvMin: AvMinC, tieStem: tieMax, tieSlab: tieSlabAs, stemNeg: maxNeg, stemPos: maxPos, vert: reqVert, slabNeg: maxSlabNeg, slabPos: maxSlabPos };
  const ratiosOk = Object.values(ratios).every((v) => v <= 1.0001);
  const sMaxStem = Math.min(3 * tMean, 0.45);
  if (rb.stemHS > sMaxStem + 1e-9 || rb.stemVS > sMaxStem + 1e-9) notes.push(`Separación del acero de la pantalla mayor que ${(sMaxStem * 100).toFixed(0)} cm (máximo recomendado: menor de 3·t y 45 cm).`);

  if (mas) {
    notes.push('Mampostería: la pantalla de bloque trabaja como losa horizontal entre contrafuertes; el acero horizontal va en vigas de amarre (bond beams) o hiladas con escalerilla, y el contrafuerte es una pilastra de bloque con celdas inyectadas.');
    notes.push('Resistencias por diseño por resistencia de TMS 402 (φ = 0.9 flexión, 0.8 cortante); la separación del acero horizontal es múltiplo de 20 cm (hiladas).');
  }
  if (internal) {
    notes.push('Contrafuerte interno: el acero principal va a lo largo del borde inclinado (cara del relleno); la pantalla es el ala comprimida (sección T).');
    notes.push('La pantalla actúa como losa continua horizontal entre contrafuertes: acero inferior de la cara frontal al centro de la luz; acero en la cara del relleno sobre los contrafuertes.');
  } else {
    notes.push('Contrafuerte externo (estribo): trabaja como viga en voladizo con la pantalla como ala traccionada; el acero principal se coloca junto a la cara del relleno, en la pantalla.');
    notes.push('La pantalla es una losa horizontal entre estribos: acero en la cara del relleno al centro de la luz; acero en la cara frontal sobre los estribos.');
  }
  notes.push('La zona inferior de la pantalla trabaja en dos direcciones: se recomienda acero vertical adicional del 25 % del horizontal en una franja de altura igual a la luz libre.');
  return {
    kind: internal ? 'interno' : 'externo', s, Ls, sections, bar: uBar, nBars: uN, AsMax, AsProv: uN * uBar.area, stirrup: uStir, stirrupSpacing: rb.stirS,
    tieStem: uTieStem, tieSlab: uTieSlab, tieSlabForce: tieForce, stemSlab, stemNegDet: uStemH, stemPosDet: uStemH,
    stemFaceNeg: internal ? 'cara del relleno (sobre el contrafuerte)' : 'cara frontal (sobre el contrafuerte)',
    stemFacePos: internal ? 'cara frontal (centro de la luz)' : 'cara del relleno (centro de la luz)',
    slabLabel, slab: slabArr, slabNegDet: uLong, slabPosDet: uLong,
    slabFaceNeg: internal ? 'superior (sobre el contrafuerte)' : 'inferior (sobre el contrafuerte)',
    slabFacePos: internal ? 'inferior (centro de la luz)' : 'superior (centro de la luz)',
    critical: { Vu: vc.Vcf, phiVc: phiVnUser, ratio: vc.Vcf / phiVnUser },
    stemShear,
    vertDet: uStemV,
    vertBottomDet,
    ratios, req, suggest,
    sectionOk: sections.every((x) => isFinite(x.AsReq) && x.AsReq < 1e5) && ratiosOk && stemShear.ratio <= 1 && stemSlab.every((x) => x.AsNeg < 1e5 && x.AsPos < 1e5),
    notes,
  };
}

// ---------------------------------------------------------------------------
// Orquestador
// ---------------------------------------------------------------------------
export function designWall(g: WallGeom): WallDesign {
  const inp = g.inp;
  const m = inp.mat;
  const warnings: string[] = [];
  const notes: string[] = [];
  const uls = ulsCases(g);
  for (const u of uls) {
    if (u.res.SumV <= 0 || u.res.xbar <= 0) warnings.push(`Combinación ${u.label}: la resultante cae fuera de la base (vuelco).`);
  }
  const out: WallDesign = { uls, stem: null, toe: null, heel: null, key: null, gravity: null, gravityMaterial: null, baseCheck: null, counterfort: null, mesh: null, suggest: null, warnings, notes };

  if (isGravity(inp.type)) {
    out.gravity = gravitySections(g);
    out.gravityMaterial = inp.type === 'gabion' ? 'gaviones' : inp.type === 'gravityMasonry' ? 'mamposteria' : 'concreto';
    // verificación de la zapata (si existe) como sección de concreto simple o mampostería
    if (g.hb > 1e-6 && (g.xFb > 1e-6 || inp.Lh > 1e-6)) {
      const env = slabEnvelope(g, uls, 0, 0);
      const baseT = g.hb;
      const S = (baseT * baseT) / 6;
      const out2: { name: string; ratio: number; detail: string }[] = [];
      const masonry = inp.type === 'gravityMasonry';
      const allow = masonry ? Math.max(m.ftAllow * 1000, 1e-9) : PHI_PLAIN * 0.42 * m.lambda * Math.sqrt(m.fc) * 1000;
      const items: [string, number][] = [['Pie (tracción inferior)', env.toeBot.M], ['Talón (tracción superior)', env.heelTop.M]];
      for (const [nm, Mx] of items) {
        if (Mx <= 1e-9) continue;
        const sigma = Mx / S;
        out2.push({ name: nm, ratio: sigma / allow, detail: `σt = ${sigma.toFixed(0)} kPa frente a ${allow.toFixed(0)} kPa` });
      }
      out.baseCheck = out2;
    }
  } else {
    // Malla de la zapata corrida: definida por el usuario y verificada contra el cálculo
    const mesh = m.mesh;
    const botBar = findBar(mesh.botBar);
    const topBar = mesh.topOn ? findBar(mesh.topBar) : null;
    const longBar = mesh.longOn ? findBar(mesh.longBar) : null;
    const dToe = g.hb - m.coverFound - botBar.db / 2000;
    const env = slabEnvelope(g, uls, dToe, 0);
    const sMax = Math.min(3 * g.hb, 0.45);
    const botDet = barDet(botBar, mesh.botS);
    const topDet = topBar ? barDet(topBar, mesh.topS) : null;
    const asMinSlab = 0.0018 * g.hb * 1e4 * (420 / Math.max(m.fy, 420));
    const layers = 1 + (mesh.topOn ? 1 : 0);
    const longDet = longBar ? barDet(longBar, mesh.longS) : null;
    const longTotal = longDet ? longDet.asProv * layers : 0;
    out.mesh = {
      botBar, botDet, top: topBar && topDet ? { bar: topBar, det: topDet } : null,
      long: longBar && longDet ? { bar: longBar, det: longDet, layers, AsTotal: longTotal, AsMin: asMinSlab, ratio: asMinSlab / Math.max(longTotal, 1e-9) } : null,
      minBot: asMinSlab / Math.max(botDet.asProv, 1e-9), minTop: topDet ? asMinSlab / Math.max(topDet.asProv, 1e-9) : null,
      sMax, spacingOk: mesh.botS <= sMax + 1e-9 && (!mesh.topOn || mesh.topS <= sMax + 1e-9) && (!mesh.longOn || mesh.longS <= sMax + 1e-9),
    };
    if (!mesh.longOn) warnings.push('Sin acero longitudinal en la zapata: no se cubre el acero mínimo de retracción y temperatura.');
    const meshOf = (face: 'superior' | 'inferior') => (face === 'inferior' ? { bar: botBar as Bar | null, s: mesh.botS } : { bar: topBar, s: mesh.topS });
    const mk = (nm: string, e: { M: number; V: number; label: string }, face: 'superior' | 'inferior', ld: number) => {
      const mm = meshOf(face);
      return slabCheck(g, nm, e.label, face, e.M, e.V, mm.bar, mm.s, ld, botBar.db);
    };
    if (g.xFb > 1e-6 && !cfExternal(inp.type)) {
      const isBot = env.toeBot.M >= env.toeTop.M;
      const ld = g.xFb - m.coverFound;
      out.toe = mk('Pie', isBot ? env.toeBot : env.toeTop, isBot ? 'inferior' : 'superior', ld);
      out.toe.opp = mk('Pie (cara opuesta)', isBot ? env.toeTop : env.toeBot, isBot ? 'superior' : 'inferior', ld);
    }
    if (inp.Lh > 1e-6 && !cfInternal(inp.type)) {
      const isTop = env.heelTop.M >= env.heelBot.M;
      const ld = inp.Lh - m.coverFound;
      out.heel = mk('Talón', isTop ? env.heelTop : env.heelBot, isTop ? 'superior' : 'inferior', ld);
      out.heel.opp = mk('Talón (cara opuesta)', isTop ? env.heelBot : env.heelTop, isTop ? 'inferior' : 'superior', ld);
    }
    // Sugerencia de malla según el cálculo
    {
      const reqAs = (M: number, d: number) => {
        const fr = flexureAs(M, 1, d, m.fc, m.fy);
        return isFinite(fr.As) ? fr.As : 1e3;
      };
      const reqBot = Math.max(g.xFb > 1e-6 && !cfExternal(inp.type) ? reqAs(env.toeBot.M, dToe) : 0, inp.Lh > 1e-6 && !cfInternal(inp.type) ? reqAs(env.heelBot.M, dToe) : 0, asMinSlab);
      const reqTop = Math.max(g.xFb > 1e-6 && !cfExternal(inp.type) ? reqAs(env.toeTop.M, dToe) : 0, inp.Lh > 1e-6 && !cfInternal(inp.type) ? reqAs(env.heelTop.M, dToe) : 0, asMinSlab);
      const sb = chooseSpacing(reqBot, botBar, sMax).spacing;
      const st = chooseSpacing(reqTop, findBar(mesh.topBar), sMax).spacing;
      const needTop = Math.max(g.xFb > 1e-6 && !cfExternal(inp.type) ? env.toeTop.M : 0, inp.Lh > 1e-6 && !cfInternal(inp.type) ? env.heelTop.M : 0) > 0.01;
      const sl = chooseSpacing((0.0018 * g.hb * 1e4) / (needTop || mesh.topOn ? 2 : 1), findBar(mesh.longBar), sMax).spacing;
      out.suggest = { mesh: { botS: sb, topS: st, topOn: needTop, longS: sl }, cf: null };
    }
    if (inp.type === 'masonryReinforced') out.stem = stemDesignMasonry(g);
    else if (isCounterfort(inp.type)) {
      out.counterfort = counterfortDesign(g, uls);
      if (out.suggest) out.suggest.cf = out.counterfort.suggest;
    } else out.stem = stemDesignRC(g, uls);
    if (isCounterfort(inp.type)) {
      notes.push('En muros con contrafuertes la pantalla (y la zapata del lado de los contrafuertes) se diseñan como losas apoyadas en los contrafuertes; los valores del voladizo de la pantalla solo se usan como acero vertical de referencia.');
    }
  }
  if (out.stem) notes.push(`Las barras verticales de la pantalla terminan en gancho estándar dentro de la zapata, orientado hacia el ${stemHookSide(g) === -1 ? 'pie' : 'talón'}${stemHookSide(g) === 1 ? ' (no hay pie, o no cabe el gancho)' : ''}.`);
  out.key = keyDesign(g);
  if (inp.hb > 1e-6 && inp.hb < 0.3 && !isGravity(inp.type)) warnings.push('El espesor de la zapata es menor que 0.30 m: verificar anclaje de las barras de la pantalla.');
  if (out.stem && !out.stem.anchorage.ok) warnings.push(`El espesor de la zapata no alcanza para el gancho estándar de las barras de la pantalla (${(out.stem.anchorage.ldh * 100).toFixed(0)} cm requeridos).`);
  void beta1;
  void isMasonry;
  return out;
}
