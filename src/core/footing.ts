// Análisis y diseño de fundaciones superficiales de forma arbitraria con una o varias columnas.
// Hipótesis: zapata rígida, presión de contacto lineal sin tracción, diseño por ACI 318.

import {
  Poly, Pt, bbox, chordLength, clipByConvex, clipHalfPlane, convexHull, integratePlane, offsetConvex,
  pointInPolygon, polyProps, samplePolyline, ccw, perimeter,
} from './geometry';
import { solvePressure, PressureSolution, Plane, planeAt } from './pressure';
import {
  ColumnGeom, ColumnShape, columnPoly, defaultColumnGeom, FootingPreset, FootingPresetParams, defaultPresetParams, footingPresetPoly,
} from './shapes';
import {
  flexureAs, flexureCapacity, oneWayVc, punchingVc, PHI_FLEX, PHI_SHEAR, PHI_BEARING, rhoMinSlab, ShearCode, beta1,
} from './concrete';
import { Bar, BarSystem, chooseSpacing, Detailing, developmentLength, findBar, GAMMA_CONCRETE, hookDevelopment } from './materials';

export type CaseKey = 'D' | 'L' | 'W' | 'E';
export const CASE_KEYS: CaseKey[] = ['D', 'L', 'W', 'E'];
export const CASE_LABEL: Record<CaseKey, string> = { D: 'Muerta (D)', L: 'Viva (L)', W: 'Viento (W)', E: 'Sismo (E)' };

export interface LoadCase {
  /** carga axial de compresión, kN (positiva hacia abajo) */
  P: number;
  /** cortante en +x, +y, kN */
  Vx: number;
  Vy: number;
  /** momento que aumenta la presión hacia +y (Mx) y hacia +x (My), kN·m */
  Mx: number;
  My: number;
}

export interface FootingColumn {
  id: string;
  name: string;
  geom: ColumnGeom;
  x: number;
  y: number;
  loads: Record<CaseKey, LoadCase>;
}

export interface LoadCombo {
  id: string;
  name: string;
  kind: 'service' | 'ultimate';
  D: number;
  L: number;
  W: number;
  E: number;
  /** aumento del esfuerzo admisible del suelo (service) */
  qaFactor: number;
}

export interface FootingInput {
  name: string;
  preset: FootingPreset;
  presetParams: FootingPresetParams;
  vertices: Pt[];
  /** espesor de la zapata, m */
  h: number;
  /** profundidad de desplante (superficie de terreno a base de zapata), m */
  Df: number;
  cover: number; // m
  barSystem: BarSystem;
  barX: string;
  barY: string;
  /** barras de la capa inferior */
  lowerLayer: 'x' | 'y';
  /** parrilla superior opcional */
  topSteel: boolean;
  barTopX: string;
  barTopY: string;
  fc: number; // MPa
  fy: number; // MPa
  lambda: number;
  code: ShearCode;
  gammaC: number; // kN/m³
  gammaS: number; // kN/m³
  surcharge: number; // kPa
  qa: number; // kPa admisible
  mu: number; // coeficiente de fricción base-suelo
  adhesion: number; // kPa
  fsSliding: number;
  fsOverturning: number;
  columns: FootingColumn[];
  combos: LoadCombo[];
}

export const zeroLoad = (): LoadCase => ({ P: 0, Vx: 0, Vy: 0, Mx: 0, My: 0 });

export function defaultColumn(id: string, name: string, x = 0, y = 0, shape: ColumnShape = 'rect'): FootingColumn {
  return {
    id,
    name,
    geom: defaultColumnGeom(shape),
    x,
    y,
    loads: {
      D: { P: 600, Vx: 0, Vy: 0, Mx: 0, My: 0 },
      L: { P: 300, Vx: 0, Vy: 0, Mx: 0, My: 0 },
      W: zeroLoad(),
      E: { P: 0, Vx: 60, Vy: 0, Mx: 0, My: 40 },
    },
  };
}

export function defaultCombos(): LoadCombo[] {
  const s = (id: string, name: string, D: number, L: number, W: number, E: number, qaF: number): LoadCombo => ({ id, name, kind: 'service', D, L, W, E, qaFactor: qaF });
  const u = (id: string, name: string, D: number, L: number, W: number, E: number): LoadCombo => ({ id, name, kind: 'ultimate', D, L, W, E, qaFactor: 1 });
  return [
    s('S1', 'D', 1, 0, 0, 0, 1),
    s('S2', 'D + L', 1, 1, 0, 0, 1),
    s('S3', 'D + 0.6W', 1, 0, 0.6, 0, 1.33),
    s('S4', 'D + 0.7E', 1, 0, 0, 0.7, 1.33),
    s('S5', 'D − 0.7E', 1, 0, 0, -0.7, 1.33),
    s('S6', 'D + 0.75L + 0.525E', 1, 0.75, 0, 0.525, 1.33),
    u('U1', '1.4D', 1.4, 0, 0, 0),
    u('U2', '1.2D + 1.6L', 1.2, 1.6, 0, 0),
    u('U3', '1.2D + L + E', 1.2, 1, 0, 1),
    u('U4', '1.2D + L − E', 1.2, 1, 0, -1),
    u('U5', '0.9D + E', 0.9, 0, 0, 1),
    u('U6', '0.9D − E', 0.9, 0, 0, -1),
    u('U7', '1.2D + L + W', 1.2, 1, 1, 0),
    u('U8', '0.9D + W', 0.9, 0, 1, 0),
  ];
}

export function defaultFooting(): FootingInput {
  const presetParams = { ...defaultPresetParams(), B: 2.4, L: 2.4 };
  return {
    name: 'Zapata Z-1',
    preset: 'rect',
    presetParams,
    vertices: footingPresetPoly('rect', presetParams),
    h: 0.6,
    Df: 1.5,
    cover: 0.075,
    barSystem: 'astm',
    barX: '#6',
    barY: '#6',
    lowerLayer: 'x',
    topSteel: false,
    barTopX: '#5',
    barTopY: '#5',
    fc: 28,
    fy: 420,
    lambda: 1,
    code: 'ACI318_14',
    gammaC: GAMMA_CONCRETE,
    gammaS: 17,
    surcharge: 0,
    qa: 200,
    mu: 0.45,
    adhesion: 0,
    fsSliding: 1.5,
    fsOverturning: 2.0,
    columns: [defaultColumn('c1', 'C1')],
    combos: defaultCombos(),
  };
}

// ---------------------------------------------------------------------------
// Resultados
// ---------------------------------------------------------------------------
export interface WeightItem {
  name: string;
  W: number; // kN
  x: number;
  y: number;
}

export interface ColumnLoadsResult {
  col: FootingColumn;
  P: number;
  Vx: number;
  Vy: number;
  Mx: number;
  My: number;
}

export interface ServiceResult {
  combo: LoadCombo;
  cols: ColumnLoadsResult[];
  weights: WeightItem[];
  Pcol: number;
  Wtot: number;
  Ptot: number;
  Vx: number;
  Vy: number;
  H: number;
  /** momentos de la resultante vertical respecto al origen (∫q·x, ∫q·y) */
  Qx: number;
  Qy: number;
  /** posición de la resultante respecto al centroide de la zapata */
  ex: number;
  ey: number;
  sol: PressureSolution;
  qaAllow: number;
  ratio: number;
  FSsl: number;
  FSot: number;
  pressureOk: boolean;
  slidingOk: boolean;
  overturningOk: boolean;
  ok: boolean;
  /** dirección de vuelco usada (vector unitario) y arma */
  tipDir: Pt | null;
}

export interface FlexureDir {
  dir: 'x' | 'y';
  d: number;
  bar: Bar;
  comboName: string;
  pos: number;
  side: 'izq' | 'der' | 'int';
  Mu: number;
  face: 'inferior' | 'superior';
  chord: number;
  AsReq: number; // cm²/m
  AsMin: number; // cm²/m
  AsDesign: number;
  det: Detailing;
  phiMn: number; // kN·m (para el ancho de la sección)
  rho: number;
  cOverD: number;
  sectionOk: boolean;
  ratio: number;
  ldReq: number;
  ldAvail: number;
  hookNeeded: boolean;
  hookLen: number;
  diagram: { pos: number[]; M: number[]; V: number[]; chord: number[] };
  /** barras: longitud total estimada (m) por m de ancho */
  steelVolume: number;
}

export interface ShearDir {
  dir: 'x' | 'y';
  d: number;
  comboName: string;
  pos: number;
  Vu: number;
  bw: number;
  Vc: number;
  phiVc: number;
  ratio: number;
  formula: string;
  ok: boolean;
}

export interface PunchingResult {
  col: FootingColumn;
  comboName: string;
  d: number;
  /** polígono del perímetro crítico (completo) y tramo efectivo dentro de la zapata */
  critical: Poly;
  bo: number;
  Ac: number;
  centroid: Pt;
  alphaS: number;
  beta: number;
  Pu: number;
  Fq: number;
  Vu: number;
  MxU: number;
  MyU: number;
  gammaVx: number;
  gammaVy: number;
  vuMax: number;
  vuAt: Pt;
  vc: number;
  vcA: number;
  vcB: number;
  vcC: number;
  phiVc: number;
  ratio: number;
  ok: boolean;
  applicable: boolean;
  openSides: number;
  bearingOk: boolean;
  bearingRatio: number;
  dowelAs: number; // cm²
}

export interface UltimateResult {
  combo: LoadCombo;
  cols: ColumnLoadsResult[];
  Pu: number;
  sol: PressureSolution;
  usable: boolean;
  note?: string;
}

export interface FootingResults {
  area: number;
  centroid: Pt;
  Ix: number;
  Iy: number;
  Ixy: number;
  bbox: { xmin: number; xmax: number; ymin: number; ymax: number };
  dx: number;
  dy: number;
  dAvg: number;
  service: ServiceResult[];
  ultimate: UltimateResult[];
  flexX: FlexureDir | null;
  flexY: FlexureDir | null;
  /** acero superior (solo si se activa la parrilla superior) */
  flexTopX: FlexureDir | null;
  flexTopY: FlexureDir | null;
  /** mayor momento negativo por dirección y su relación con la resistencia del concreto simple (si no hay acero superior) */
  hogging: { dir: 'x' | 'y'; Mu: number; capPlain: number; comboName: string }[];
  shearX: ShearDir | null;
  shearY: ShearDir | null;
  punching: PunchingResult[];
  govService: ServiceResult | null;
  govPressure: ServiceResult | null;
  concreteVolume: number;
  steelKg: number;
  warnings: string[];
  checks: { name: string; ratio: number; ok: boolean; detail: string }[];
  ok: boolean;
  thicknessOk: boolean;
}

// ---------------------------------------------------------------------------
// Utilidades
// ---------------------------------------------------------------------------
export function combineLoad(col: FootingColumn, combo: LoadCombo): LoadCase {
  const f: Record<CaseKey, number> = { D: combo.D, L: combo.L, W: combo.W, E: combo.E };
  const out = zeroLoad();
  for (const k of CASE_KEYS) {
    const l = col.loads[k];
    out.P += f[k] * l.P;
    out.Vx += f[k] * l.Vx;
    out.Vy += f[k] * l.Vy;
    out.Mx += f[k] * l.Mx;
    out.My += f[k] * l.My;
  }
  return out;
}

/** Caja de sección crítica de flexión de la columna (cara de la columna; cuadrado equivalente en circulares/regulares). */
export function columnSectionBox(col: FootingColumn): { xmin: number; xmax: number; ymin: number; ymax: number } {
  const poly = columnPoly(col.geom, col.x, col.y);
  const bb = bbox(poly);
  if (col.geom.shape === 'circle' || col.geom.shape === 'ngon') {
    const s = Math.sqrt(polyProps(poly).A);
    return { xmin: col.x - s / 2, xmax: col.x + s / 2, ymin: col.y - s / 2, ymax: col.y + s / 2 };
  }
  return bb;
}

export function barDiameterM(bar: Bar): number {
  return bar.db / 1000;
}

export function effectiveDepths(inp: FootingInput): { dx: number; dy: number; barX: Bar; barY: Bar } {
  const bx = findBar(inp.barX);
  const by = findBar(inp.barY);
  const dbx = barDiameterM(bx);
  const dby = barDiameterM(by);
  if (inp.lowerLayer === 'x') {
    return { dx: inp.h - inp.cover - dbx / 2, dy: inp.h - inp.cover - dbx - dby / 2, barX: bx, barY: by };
  }
  return { dy: inp.h - inp.cover - dby / 2, dx: inp.h - inp.cover - dby - dbx / 2, barX: bx, barY: by };
}

export function effectiveDepthsTop(inp: FootingInput): { dx: number; dy: number; barX: Bar; barY: Bar } {
  const bx = findBar(inp.barTopX);
  const by = findBar(inp.barTopY);
  const dbx = barDiameterM(bx);
  const dby = barDiameterM(by);
  if (inp.lowerLayer === 'x') return { dx: inp.h - inp.cover - dbx / 2, dy: inp.h - inp.cover - dbx - dby / 2, barX: bx, barY: by };
  return { dy: inp.h - inp.cover - dby / 2, dx: inp.h - inp.cover - dby - dbx / 2, barX: bx, barY: by };
}

// ---------------------------------------------------------------------------
// Servicio: presiones, deslizamiento y volcamiento
// ---------------------------------------------------------------------------
function analyzeService(inp: FootingInput, poly: Poly, combo: LoadCombo): ServiceResult {
  const pp = polyProps(poly);
  const A = pp.A;
  const cols = inp.columns.map((col) => {
    const l = combineLoad(col, combo);
    return { col, ...l } as ColumnLoadsResult;
  });
  const colPolys = inp.columns.map((c) => polyProps(columnPoly(c.geom, c.x, c.y)));
  const Acol = colPolys.reduce((s, p) => s + p.A, 0);
  const hSoil = Math.max(inp.Df - inp.h, 0);
  const weights: WeightItem[] = [];
  weights.push({ name: 'Peso propio de la zapata', W: inp.gammaC * inp.h * A, x: pp.cx, y: pp.cy });
  const Asoil = Math.max(A - Acol, 0);
  const sx = pp.Sx - colPolys.reduce((s, p) => s + p.Sx, 0);
  const sy = pp.Sy - colPolys.reduce((s, p) => s + p.Sy, 0);
  const csx = Asoil > 1e-9 ? sx / Asoil : pp.cx;
  const csy = Asoil > 1e-9 ? sy / Asoil : pp.cy;
  if (hSoil > 0) {
    weights.push({ name: 'Relleno sobre la zapata', W: inp.gammaS * hSoil * Asoil, x: csx, y: csy });
    weights.push({ name: 'Columnas enterradas', W: inp.gammaC * hSoil * Acol, x: Acol > 0 ? colPolys.reduce((s, p) => s + p.Sx, 0) / Acol : pp.cx, y: Acol > 0 ? colPolys.reduce((s, p) => s + p.Sy, 0) / Acol : pp.cy });
  }
  if (inp.surcharge > 0) weights.push({ name: 'Sobrecarga en el terreno', W: inp.surcharge * Asoil, x: csx, y: csy });

  let Pcol = 0, Vx = 0, Vy = 0, Qx = 0, Qy = 0;
  for (const c of cols) {
    Pcol += c.P;
    Vx += c.Vx;
    Vy += c.Vy;
    Qx += c.P * c.col.x + c.My + c.Vx * inp.Df;
    Qy += c.P * c.col.y + c.Mx + c.Vy * inp.Df;
  }
  let Wtot = 0;
  for (const w of weights) {
    Wtot += w.W;
    Qx += w.W * w.x;
    Qy += w.W * w.y;
  }
  const Ptot = Pcol + Wtot;
  const sol = solvePressure(poly, Ptot, Qx, Qy);
  const qaAllow = inp.qa * combo.qaFactor;
  const H = Math.hypot(Vx, Vy);
  const ex = Ptot > 0 ? Qx / Ptot - pp.cx : 0;
  const ey = Ptot > 0 ? Qy / Ptot - pp.cy : 0;

  // Deslizamiento
  const FSsl = H < 1e-9 ? Infinity : (inp.mu * Math.max(Ptot, 0) + inp.adhesion * (sol.ok ? sol.contactArea : 0)) / H;

  // Volcamiento: momentos de vuelco (cargas horizontales y momentos aplicados)
  let MoX = 0, MoY = 0; // en el sentido "presión hacia +x / +y"
  for (const c of cols) {
    MoX += c.My + c.Vx * inp.Df;
    MoY += c.Mx + c.Vy * inp.Df;
  }
  const Mo = Math.hypot(MoX, MoY);
  let FSot = Infinity;
  let tipDir: Pt | null = null;
  if (Mo > 1e-9) {
    const n = { x: MoX / Mo, y: MoY / Mo };
    tipDir = n;
    const hull = convexHull(poly);
    const dSup = Math.max(...hull.map((v) => v.x * n.x + v.y * n.y));
    let Mres = 0;
    for (const c of cols) Mres += c.P * (dSup - (c.col.x * n.x + c.col.y * n.y));
    for (const w of weights) Mres += w.W * (dSup - (w.x * n.x + w.y * n.y));
    FSot = Mres / Mo;
  }

  const pressureOk = sol.ok && sol.qmax <= qaAllow + 1e-9;
  const slidingOk = FSsl >= inp.fsSliding - 1e-9;
  const overturningOk = FSot >= inp.fsOverturning - 1e-9;
  return {
    combo, cols, weights, Pcol, Wtot, Ptot, Vx, Vy, H, Qx, Qy, ex, ey, sol, qaAllow,
    ratio: sol.ok ? sol.qmax / qaAllow : Infinity, FSsl, FSot, pressureOk, slidingOk, overturningOk,
    ok: pressureOk && slidingOk && overturningOk, tipDir,
  };
}

// ---------------------------------------------------------------------------
// Secciones de corte (flexión y cortante en una dirección)
// ---------------------------------------------------------------------------
interface SectionForce {
  M: number; // kN·m, positivo = tracción abajo
  V: number; // kN
  chord: number;
  partMin: number; // extremo exterior de la parte analizada
  side: 'izq' | 'der';
  hasColumns: boolean;
}

function sectionForce(
  poly: Poly, plane: Plane, loads: ColumnLoadsResult[], dir: 'x' | 'y', pos: number, side: 'izq' | 'der', Df: number,
): SectionForce {
  // parte "izq" = coordenada ≤ pos ; "der" = coordenada ≥ pos
  const sgn = side === 'izq' ? 1 : -1;
  let part: Poly;
  if (dir === 'x') part = side === 'izq' ? clipHalfPlane(poly, -1, 0, pos) : clipHalfPlane(poly, 1, 0, -pos);
  else part = side === 'izq' ? clipHalfPlane(poly, 0, -1, pos) : clipHalfPlane(poly, 0, 1, -pos);
  const I = integratePlane(part, plane.q0, plane.a, plane.b);
  const coordSum = dir === 'x' ? I.Qx : I.Qy;
  // momento de la presión respecto a la línea de corte: ∫ q·(pos − c)·sgn
  let Mup = sgn * (I.F * pos - coordSum);
  let Vup = I.F;
  let Mdown = 0;
  let hasCols = false;
  for (const c of loads) {
    const cc = dir === 'x' ? c.col.x : c.col.y;
    const inside = side === 'izq' ? cc <= pos : cc >= pos;
    if (!inside) continue;
    hasCols = true;
    const mom = dir === 'x' ? c.My + c.Vx * Df : c.Mx + c.Vy * Df;
    Mdown += c.P * sgn * (pos - cc) - sgn * mom;
    Vup -= c.P;
  }
  const bb = bbox(part.length ? part : poly);
  return {
    M: Mup - Mdown,
    V: Vup,
    chord: chordLength(poly, dir, pos),
    partMin: dir === 'x' ? (side === 'izq' ? bb.xmin : bb.xmax) : side === 'izq' ? bb.ymin : bb.ymax,
    side,
    hasColumns: hasCols,
  };
}

// ---------------------------------------------------------------------------
// Punzonamiento
// ---------------------------------------------------------------------------
function analyzePunching(
  inp: FootingInput, poly: Poly, ult: UltimateResult, col: FootingColumn, d: number,
): PunchingResult {
  const cl = ult.cols.find((c) => c.col.id === col.id)!;
  const colPoly = columnPoly(col.geom, col.x, col.y);
  const hull = ccw(convexHull(colPoly));
  const crit = offsetConvex(hull, d / 2);
  const per = perimeter(crit);
  const pieces = samplePolyline(crit, Math.max(per / 800, 1e-4)).filter((p) => pointInPolygon(p, poly));
  const bo = pieces.reduce((s, p) => s + p.len, 0);
  const bbCol = bbox(colPoly);
  const cw = bbCol.xmax - bbCol.xmin;
  const ch = bbCol.ymax - bbCol.ymin;
  const beta = Math.max(cw, ch) / Math.max(Math.min(cw, ch), 1e-9);
  const empty: PunchingResult = {
    col, comboName: ult.combo.name, d, critical: crit, bo, Ac: bo * d, centroid: { x: col.x, y: col.y }, alphaS: 40, beta, Pu: cl.P, Fq: 0, Vu: 0,
    MxU: 0, MyU: 0, gammaVx: 0, gammaVy: 0, vuMax: 0, vuAt: { x: col.x, y: col.y }, vc: 0, vcA: 0, vcB: 0, vcC: 0, phiVc: 0, ratio: 0, ok: true,
    applicable: false, openSides: 0, bearingOk: true, bearingRatio: 0, dowelAs: 0,
  };
  if (!ult.sol.ok || cl.P <= 0 || bo < 0.1 * per) return empty;

  // Fuerza neta alrededor del perímetro
  const region = clipByConvex(poly, crit);
  const inside = clipHalfPlane(region, ult.sol.plane.a, ult.sol.plane.b, ult.sol.plane.q0);
  const Iq = integratePlane(inside, ult.sol.plane.q0, ult.sol.plane.a, ult.sol.plane.b);
  const Vu = cl.P - Iq.F;
  if (Vu <= 0) return { ...empty, Fq: Iq.F, bo, Ac: bo * d, applicable: true };

  // Propiedades de la sección crítica (integración numérica sobre el perímetro)
  const Ac = bo * d;
  let sx = 0, sy = 0;
  for (const p of pieces) {
    sx += p.x * p.len * d;
    sy += p.y * p.len * d;
  }
  const cx = sx / Ac;
  const cy = sy / Ac;
  let Ix = 0, Iy = 0, Ixy = 0;
  for (const p of pieces) {
    const w = p.len * d;
    Ix += w * (p.y - cy) ** 2;
    Iy += w * (p.x - cx) ** 2;
    Ixy += w * (p.x - cx) * (p.y - cy);
  }
  // Momento desbalanceado respecto al centroide de la sección crítica
  const Mxu = cl.Mx + cl.Vy * inp.Df + cl.P * (col.y - cy) - (Iq.Qy - Iq.F * cy);
  const Myu = cl.My + cl.Vx * inp.Df + cl.P * (col.x - cx) - (Iq.Qx - Iq.F * cx);
  const bb = bbox(pieces.map((p) => ({ x: p.x, y: p.y })));
  const bx = bb.xmax - bb.xmin;
  const by = bb.ymax - bb.ymin;
  const gv = (b1: number, b2: number) => 1 - 1 / (1 + (2 / 3) * Math.sqrt(b1 / Math.max(b2, 1e-9)));
  const gVx = gv(by, bx); // momento Mx → luz en y
  const gVy = gv(bx, by);
  const M1 = gVx * Mxu; // ∫ v·y dA
  const M2 = gVy * Myu; // ∫ v·x dA
  const det = Ix * Iy - Ixy * Ixy;
  let a = 0, b = 0;
  if (Math.abs(det) > 1e-18) {
    // ∫v y = a·Ixy + b·Ix ; ∫v x = a·Iy + b·Ixy
    a = (M1 * -Ixy + M2 * Ix) / (-(Ixy * Ixy) + Ix * Iy) ;
    b = (M1 * Iy - M2 * Ixy) / (Ix * Iy - Ixy * Ixy);
  }
  const v0 = Vu / Ac; // kN/m²
  let vmax = -Infinity;
  let vAt: Pt = { x: col.x, y: col.y };
  for (const p of pieces) {
    const v = v0 + a * (p.x - cx) + b * (p.y - cy);
    if (v > vmax) {
      vmax = v;
      vAt = { x: p.x, y: p.y };
    }
  }
  vmax /= 1000; // MPa

  // Lados abiertos (perímetro cortado por el borde de la zapata)
  let openSides = 0;
  const cbb = bbCol;
  const probes: Pt[] = [
    { x: (cbb.xmin + cbb.xmax) / 2, y: cbb.ymin - d / 2 },
    { x: (cbb.xmin + cbb.xmax) / 2, y: cbb.ymax + d / 2 },
    { x: cbb.xmin - d / 2, y: (cbb.ymin + cbb.ymax) / 2 },
    { x: cbb.xmax + d / 2, y: (cbb.ymin + cbb.ymax) / 2 },
  ];
  for (const pr of probes) if (!pointInPolygon(pr, poly)) openSides++;
  const alphaS = openSides === 0 ? 40 : openSides === 1 ? 30 : 20;
  const cap = punchingVc(beta, alphaS, bo, d, inp.fc, inp.code, inp.lambda);
  const phiVc = PHI_SHEAR * cap.vc;

  // Aplastamiento en la unión columna-zapata (A2/A1 = 1, conservador) y barras de espera
  const A1 = polyProps(colPoly).A;
  const bearing = PHI_BEARING * 0.85 * inp.fc * A1 * 1000; // kN
  const bearingRatio = cl.P / bearing;
  return {
    col, comboName: ult.combo.name, d, critical: crit, bo, Ac, centroid: { x: cx, y: cy }, alphaS, beta, Pu: cl.P, Fq: Iq.F, Vu, MxU: Mxu, MyU: Myu,
    gammaVx: gVx, gammaVy: gVy, vuMax: vmax, vuAt: vAt, vc: cap.vc, vcA: cap.vcA, vcB: cap.vcB, vcC: cap.vcC, phiVc,
    ratio: vmax / phiVc, ok: vmax <= phiVc + 1e-9, applicable: true, openSides, bearingOk: bearingRatio <= 1, bearingRatio,
    dowelAs: 0.005 * A1 * 1e4,
  };
}

// ---------------------------------------------------------------------------
// Análisis completo
// ---------------------------------------------------------------------------
export function analyzeFooting(inp: FootingInput): FootingResults {
  const poly = ccw(inp.vertices);
  const pp = polyProps(poly);
  const bb = bbox(poly);
  const { dx, dy, barX, barY } = effectiveDepths(inp);
  const top = effectiveDepthsTop(inp);
  const dAvg = (dx + dy) / 2;
  const warnings: string[] = [];

  const serviceCombos = inp.combos.filter((c) => c.kind === 'service');
  const ultimateCombos = inp.combos.filter((c) => c.kind === 'ultimate');
  const service = serviceCombos.map((c) => analyzeService(inp, poly, c));

  // --- Últimas: presión neta con cargas mayoradas de las columnas solamente
  const ultimate: UltimateResult[] = ultimateCombos.map((combo) => {
    const cols = inp.columns.map((col) => ({ col, ...combineLoad(col, combo) }) as ColumnLoadsResult);
    let Pu = 0, Qx = 0, Qy = 0;
    for (const c of cols) {
      Pu += c.P;
      Qx += c.P * c.col.x + c.My + c.Vx * inp.Df;
      Qy += c.P * c.col.y + c.Mx + c.Vy * inp.Df;
    }
    const sol = solvePressure(poly, Pu, Qx, Qy);
    let note: string | undefined;
    if (!sol.ok) {
      note = sol.reason === 'fuera' ? 'La resultante cae fuera de la zapata (vuelco).' : sol.reason === 'tension' ? 'Carga neta de tracción (levantamiento).' : 'Sin presión de contacto.';
    }
    return { combo, cols, Pu, sol, usable: sol.ok, note };
  });
  for (const u of ultimate) if (!u.usable) warnings.push(`Combinación ${u.combo.name}: ${u.note}`);

  // --- Flexión y cortante por barrido de secciones
  const boxes = inp.columns.map((c) => columnSectionBox(c));
  const sizeRef = Math.max(bb.xmax - bb.xmin, bb.ymax - bb.ymin);
  const N = 240;

  const flex: Record<'x' | 'y', FlexureDir | null> = { x: null, y: null };
  const flexTop: Record<'x' | 'y', FlexureDir | null> = { x: null, y: null };
  const hogging: FootingResults['hogging'] = [];
  const shear: Record<'x' | 'y', ShearDir | null> = { x: null, y: null };

  const dirInfo = (dir: 'x' | 'y') => ({
    d: dir === 'x' ? dx : dy,
    bar: dir === 'x' ? barX : barY,
    lo: dir === 'x' ? bb.xmin : bb.ymin,
    hi: dir === 'x' ? bb.xmax : bb.ymax,
    intervals: boxes.map((b) => (dir === 'x' ? [b.xmin, b.xmax] : [b.ymin, b.ymax])),
  });

  const usableU = ultimate.filter((u) => u.usable);
  const maxChord: Record<'x' | 'y', number> = { x: 0, y: 0 };
  for (const dir of ['x', 'y'] as const) {
    const info = dirInfo(dir);
    for (let i = 1; i < N; i++) maxChord[dir] = Math.max(maxChord[dir], chordLength(poly, dir, info.lo + ((info.hi - info.lo) * i) / N));
  }

  for (const dir of ['x', 'y'] as const) {
    const info = dirInfo(dir);
    const dd = info.d;
    // posiciones de flexión: barrido fuera de las columnas + caras
    const flexPos: number[] = [];
    for (let i = 1; i < N; i++) {
      const p = info.lo + ((info.hi - info.lo) * i) / N;
      if (info.intervals.some(([a, b]) => p > a + 1e-9 && p < b - 1e-9)) continue;
      flexPos.push(p);
    }
    for (const [a, b] of info.intervals) flexPos.push(a, b);
    flexPos.sort((p, q) => p - q);
    // posiciones de cortante: fuera de [cara − d, cara + d] + bordes
    const shearPos: number[] = [];
    for (let i = 1; i < N; i++) {
      const p = info.lo + ((info.hi - info.lo) * i) / N;
      if (info.intervals.some(([a, b]) => p > a - dd + 1e-9 && p < b + dd - 1e-9)) continue;
      shearPos.push(p);
    }
    for (const [a, b] of info.intervals) shearPos.push(a - dd, b + dd);

    type Best = { asPm: number; u: UltimateResult; pos: number; sf: SectionForce; Mu: number };
    let bestSag: Best | null = null;
    let bestHog: Best | null = null;
    let bestShear: { ratioKey: number; u: UltimateResult; pos: number; sf: SectionForce; Vu: number } | null = null;
    const mAbsByCombo: { u: UltimateResult; peak: number }[] = [];
    const ddT = dir === 'x' ? top.dx : top.dy;
    const barT = dir === 'x' ? top.barX : top.barY;

    for (const u of usableU) {
      let peak = 0;
      for (const p of flexPos) {
        const ch = chordLength(poly, dir, p);
        if (ch < 0.05 * maxChord[dir]) continue;
        let sf = sectionForce(poly, u.sol.plane, u.cols, dir, p, 'izq', inp.Df);
        if (sf.hasColumns) {
          const alt = sectionForce(poly, u.sol.plane, u.cols, dir, p, 'der', inp.Df);
          if (!alt.hasColumns) sf = alt;
        }
        const Mu = Math.abs(sf.M);
        peak = Math.max(peak, Mu / ch);
        const hog = sf.M < 0;
        const fr = flexureAs(Mu, ch, hog ? ddT : dd, inp.fc, inp.fy);
        const asPm = isFinite(fr.As) ? fr.As / ch : 1e9;
        const cur = hog ? bestHog : bestSag;
        if (!cur || asPm > cur.asPm + 1e-12 || (Math.abs(asPm - cur.asPm) < 1e-12 && Mu > cur.Mu)) {
          const nb = { asPm, u, pos: p, sf, Mu };
          if (hog) bestHog = nb;
          else bestSag = nb;
        }
      }
      mAbsByCombo.push({ u, peak });
    }

    // diagrama de momentos de la combinación más severa en esta dirección
    const peakU = [...mAbsByCombo].sort((p, q) => q.peak - p.peak)[0]?.u ?? usableU[0];
    const diagram = { pos: [] as number[], M: [] as number[], V: [] as number[], chord: [] as number[] };
    if (peakU) {
      for (let i = 0; i <= 120; i++) {
        const p = info.lo + ((info.hi - info.lo) * i) / 120;
        const sfa = sectionForce(poly, peakU.sol.plane, peakU.cols, dir, p, 'izq', inp.Df);
        diagram.pos.push(p);
        diagram.M.push(sfa.M);
        diagram.V.push(sfa.V);
        diagram.chord.push(sfa.chord);
      }
    }
    const designDir = (bf: Best | null, bar: Bar, dUse: number, face: 'inferior' | 'superior'): FlexureDir | null => {
      if (!peakU) return null;
      const b0: Best = bf ?? { asPm: 0, u: peakU, pos: (info.lo + info.hi) / 2, sf: { M: 0, V: 0, chord: maxChord[dir], partMin: info.lo, side: 'izq', hasColumns: true }, Mu: 0 };
      const ch = b0.sf.chord;
      const fr = flexureAs(b0.Mu, ch, dUse, inp.fc, inp.fy);
      const asMin = rhoMinSlab(inp.fy) * 1 * inp.h * 1e4; // cm²/m
      const asReq = isFinite(fr.As) ? fr.As / ch : Infinity;
      const asDes = Math.max(isFinite(asReq) ? asReq : 0, asMin);
      const det = chooseSpacing(asDes, bar, Math.min(3 * inp.h, 0.45));
      const phiMn = flexureCapacity(det.asProv * ch, ch, dUse, inp.fc, inp.fy);
      const side = b0.sf.hasColumns ? 'int' : b0.sf.side;
      const ldReq = developmentLength(bar.db, inp.fy, inp.fc, { lambda: inp.lambda });
      const ldAvail = side === 'int' ? Infinity : Math.abs(b0.pos - b0.sf.partMin) - inp.cover;
      return {
        dir, d: dUse, bar, comboName: b0.u.combo.name, pos: b0.pos, side, Mu: b0.Mu, face, chord: ch,
        AsReq: asReq, AsMin: asMin, AsDesign: asDes, det, phiMn, rho: fr.rho, cOverD: fr.cOverD, sectionOk: fr.ok && isFinite(fr.As),
        ratio: phiMn > 0 ? b0.Mu / phiMn : Infinity,
        ldReq, ldAvail, hookNeeded: ldAvail < ldReq, hookLen: hookDevelopment(bar.db, inp.fy, inp.fc, inp.lambda),
        diagram, steelVolume: det.asProv * 1e-4 * pp.A,
      };
    };
    flex[dir] = designDir(bestSag, info.bar, dd, 'inferior');
    if (inp.topSteel) flexTop[dir] = designDir(bestHog, barT, ddT, 'superior');
    else if (bestHog) {
      const hg: Best = bestHog;
      const capPlain = 0.6 * 0.42 * inp.lambda * Math.sqrt(inp.fc) * ((hg.sf.chord * inp.h * inp.h) / 6) * 1000;
      hogging.push({ dir, Mu: hg.Mu, capPlain, comboName: hg.u.combo.name });
    }

    // ---- cortante en una dirección (usa As provista)
    const asProvPm = flex[dir] ? flex[dir]!.det.asProv : rhoMinSlab(inp.fy) * inp.h * 1e4;
    for (const u of usableU) {
      for (const p of shearPos) {
        if (p <= info.lo + 1e-6 || p >= info.hi - 1e-6) continue;
        const ch = chordLength(poly, dir, p);
        if (ch < 0.05 * maxChord[dir]) continue;
        let sf = sectionForce(poly, u.sol.plane, u.cols, dir, p, 'izq', inp.Df);
        if (sf.hasColumns) {
          const alt = sectionForce(poly, u.sol.plane, u.cols, dir, p, 'der', inp.Df);
          if (!alt.hasColumns) sf = alt;
        }
        const Vu = Math.abs(sf.V);
        const rhoW = (asProvPm * 1e-4) / dd;
        const cap = oneWayVc(ch, dd, inp.fc, rhoW, inp.code, inp.lambda);
        const key = Vu / (PHI_SHEAR * cap.Vc);
        if (!bestShear || key > bestShear.ratioKey) bestShear = { ratioKey: key, u, pos: p, sf, Vu };
      }
    }
    if (bestShear) {
      const bs = bestShear;
      const rhoW = (asProvPm * 1e-4) / dd;
      const cap = oneWayVc(bs.sf.chord, dd, inp.fc, rhoW, inp.code, inp.lambda);
      shear[dir] = {
        dir, d: dd, comboName: bs.u.combo.name, pos: bs.pos, Vu: bs.Vu, bw: bs.sf.chord, Vc: cap.Vc, phiVc: PHI_SHEAR * cap.Vc, ratio: bs.ratioKey,
        formula: cap.formula, ok: bs.ratioKey <= 1 + 1e-9,
      };
    }
  }

  // --- Punzonamiento
  const punching: PunchingResult[] = [];
  for (const col of inp.columns) {
    let worst: PunchingResult | null = null;
    for (const u of usableU) {
      const r = analyzePunching(inp, poly, u, col, dAvg);
      if (!worst || (r.applicable && r.ratio > worst.ratio) || (!worst.applicable && r.applicable)) worst = r;
    }
    if (worst) punching.push(worst);
  }

  // --- Resumen
  const checks: FootingResults['checks'] = [];
  const govPressure = service.filter((s) => s.sol.ok).sort((a, b) => b.ratio - a.ratio)[0] ?? null;
  const failedSol = service.find((s) => !s.sol.ok);
  if (failedSol) warnings.push(`Servicio ${failedSol.combo.name}: sin equilibrio de presiones (${failedSol.sol.reason ?? 'inestable'}).`);
  if (govPressure) {
    checks.push({ name: 'Presión máxima en el suelo', ratio: govPressure.ratio, ok: govPressure.pressureOk, detail: govPressure.combo.name });
  }
  const worstSl = service.filter((s) => isFinite(s.FSsl)).sort((a, b) => a.FSsl - b.FSsl)[0];
  if (worstSl) checks.push({ name: 'Deslizamiento', ratio: inp.fsSliding / worstSl.FSsl, ok: worstSl.slidingOk, detail: `${worstSl.combo.name}: FS = ${worstSl.FSsl.toFixed(2)}` });
  const worstOt = service.filter((s) => isFinite(s.FSot)).sort((a, b) => a.FSot - b.FSot)[0];
  if (worstOt) checks.push({ name: 'Volcamiento', ratio: inp.fsOverturning / worstOt.FSot, ok: worstOt.overturningOk, detail: `${worstOt.combo.name}: FS = ${worstOt.FSot.toFixed(2)}` });
  for (const dir of ['x', 'y'] as const) {
    const f = flex[dir];
    if (f) checks.push({ name: `Flexión dirección ${dir.toUpperCase()}`, ratio: f.ratio, ok: f.sectionOk && f.ratio <= 1 + 1e-9, detail: f.comboName });
    const s = shear[dir];
    if (s) checks.push({ name: `Cortante en una dirección (${dir.toUpperCase()})`, ratio: s.ratio, ok: s.ok, detail: s.comboName });
  }
  for (const dir of ['x', 'y'] as const) {
    const t = dir === 'x' ? flexTop.x : flexTop.y;
    if (t && t.Mu > 0) checks.push({ name: `Flexión superior dirección ${dir.toUpperCase()}`, ratio: t.ratio, ok: t.sectionOk && t.ratio <= 1 + 1e-9, detail: t.comboName });
  }
  for (const h of hogging) {
    const ratio = h.Mu / Math.max(h.capPlain, 1e-9);
    if (ratio > 0.02) checks.push({ name: `Momento negativo ${h.dir.toUpperCase()} sin acero superior`, ratio, ok: ratio <= 1, detail: `Mu = ${h.Mu.toFixed(1)} kN·m (${h.comboName}); activar la parrilla superior` });
  }
  for (const p of punching) {
    if (p.applicable) checks.push({ name: `Punzonamiento ${p.col.name}`, ratio: p.ratio, ok: p.ok, detail: p.comboName });
    if (p.applicable && !p.bearingOk) warnings.push(`${p.col.name}: aplastamiento columna-zapata supera φ·0.85·f′c·A₁; verificar con pedestal o A₂/A₁.`);
  }
  const thicknessOk = dAvg >= 0.15;
  if (!thicknessOk) warnings.push('d < 150 mm: ACI 318 exige al menos 150 mm sobre el refuerzo inferior en zapatas sobre suelo.');
  for (const dir of ['x', 'y'] as const) {
    const f = flex[dir];
    if (f && f.hookNeeded) warnings.push(`Dirección ${dir.toUpperCase()}: longitud de desarrollo disponible (${f.ldAvail.toFixed(2)} m) menor que la requerida (${f.ldReq.toFixed(2)} m); usar ganchos estándar.`);
    if (f && !f.det.ok) warnings.push(`Dirección ${dir.toUpperCase()}: ${f.det.note}`);
  }
  if (!service.length) warnings.push('No hay combinaciones de servicio definidas.');
  if (!ultimate.length) warnings.push('No hay combinaciones últimas definidas: no se puede diseñar el refuerzo.');

  const steelKg = 7850 * ((flex.x?.steelVolume ?? 0) + (flex.y?.steelVolume ?? 0) + (flexTop.x?.steelVolume ?? 0) + (flexTop.y?.steelVolume ?? 0));
  return {
    area: pp.A, centroid: { x: pp.cx, y: pp.cy }, Ix: pp.Ix, Iy: pp.Iy, Ixy: pp.Ixy, bbox: bb, dx, dy, dAvg, service, ultimate,
    flexX: flex.x, flexY: flex.y, flexTopX: flexTop.x, flexTopY: flexTop.y, hogging, shearX: shear.x, shearY: shear.y, punching, govService: govPressure, govPressure,
    concreteVolume: pp.A * inp.h, steelKg, warnings, checks, ok: checks.every((c) => c.ok) && thicknessOk, thicknessOk,
  };
}

/** Búsqueda del menor espesor (múltiplos de 5 cm) que cumple todas las verificaciones. */
export function findMinThickness(inp: FootingInput, hMax = 2.5): number | null {
  for (let h = 0.3; h <= hMax + 1e-9; h += 0.05) {
    const r = analyzeFooting({ ...inp, h: +h.toFixed(3) });
    const shearPunch = r.checks.filter((c) => /Punz|Cortante|Flexi/.test(c.name));
    if (shearPunch.every((c) => c.ok) && r.thicknessOk) return +h.toFixed(3);
  }
  return null;
}

/** Escala la zapata respecto a su centroide (alrededor de columnas fijas) hasta cumplir presión de suelo. */
export function findScaleForPressure(inp: FootingInput, maxScale = 3): number | null {
  const base = ccw(inp.vertices);
  const pp = polyProps(base);
  for (let s = 1; s <= maxScale + 1e-9; s += 0.02) {
    const verts = base.map((v) => ({ x: pp.cx + (v.x - pp.cx) * s, y: pp.cy + (v.y - pp.cy) * s }));
    const r = analyzeFooting({ ...inp, vertices: verts });
    const c = r.checks.filter((c) => /Presión|Desliz|Volc/.test(c.name));
    if (c.length && c.every((k) => k.ok)) return s;
  }
  return null;
}
