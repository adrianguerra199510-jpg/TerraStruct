import { Poly, Pt, polyProps, clipHalfPlane, ccw } from './geometry';
import { WallInput, isCounterfort, gabionGamma, gabionWidths } from './wallTypes';
import { rad } from './earth';

export interface WallPart {
  id: 'stem' | 'base' | 'key' | 'cf';
  name: string;
  poly: Poly;
  /** peso unitario del material, kN/m³ */
  gamma: number;
  /** factor de distribución a lo largo del muro (contrafuertes: t/s) */
  scale: number;
  /** peso por metro lineal de muro, kN/m */
  W: number;
  x: number;
  y: number;
  area: number;
}

export interface WallGeom {
  inp: WallInput;
  B: number;
  hb: number;
  hbTip: number;
  xFb: number;
  xBb: number;
  xFt: number;
  xBt: number;
  yTop: number;
  /** inclinación de la cara posterior respecto a la vertical (grados, + = sube alejándose del relleno) */
  psiDeg: number;
  /** elevación del terreno del relleno en la abscisa x */
  surfaceY: (x: number) => number;
  /** altura de la superficie del relleno en el plano posterior de la zapata (x = B) */
  yPlane: number;
  parts: WallPart[];
  stemPoly: Poly;
  basePoly: Poly | null;
  keyPoly: Poly | null;
  cfPoly: Poly | null;
  /** nivel freático en elevación absoluta desde la cara inferior de la zapata (−Infinity = sin agua) */
  yWater: number;
  /** suelo sobre el talón (según el modelo de empuje) */
  heelSoilPoly: Poly;
  toeSoilPoly: Poly | null;
  /** espesor horizontal de la pantalla a la altura y sobre la base de la pantalla */
  stemT: (y: number) => number;
  /** abscisas de la cara frontal y posterior de la pantalla a la altura y sobre su base */
  stemFrontX: (y: number) => number;
  stemBackX: (y: number) => number;
}

function partOf(id: WallPart['id'], name: string, poly: Poly, gamma: number, scale = 1): WallPart {
  const p = polyProps(poly);
  return { id, name, poly, gamma, scale, W: gamma * p.A * scale, x: p.cx, y: p.cy, area: p.A };
}

export function buildWallGeom(inp: WallInput): WallGeom {
  const hasBase = inp.hb > 1e-6;
  const hb = hasBase ? inp.hb : 0;
  const hbTip = hasBase ? Math.min(inp.hbTip > 0 ? inp.hbTip : inp.hb, inp.hb) : 0;
  const xFb = hasBase ? inp.Lt : 0;
  const xBb = xFb + inp.tBot;
  let xFt: number, xBt: number;
  if (inp.stemFace === 'front') {
    xFt = xFb;
    xBt = xFb + inp.tTop;
  } else if (inp.stemFace === 'back') {
    xBt = xBb;
    xFt = xBb - inp.tTop;
  } else {
    xFt = xFb + inp.fb;
    xBt = xFt + inp.tTop;
  }
  const Lh = hasBase ? inp.Lh : 0;
  const B = xBb + Lh;
  const yTop = hb + inp.H;
  const tanB = Math.tan(rad(inp.fill.beta));
  const surfaceY = (x: number) => yTop + Math.max(0, x - xBt) * tanB;
  const yPlane = surfaceY(B);
  const psiDeg = (Math.atan2(xBb - xBt, inp.H) * 180) / Math.PI;

  const concreteGamma = inp.mat.gammaC;
  const masonryStem = inp.type === 'gravityMasonry' || inp.type === 'masonryReinforced';
  const isGab = inp.type === 'gabion';
  const stemGamma = isGab ? gabionGamma(inp.gab) : masonryStem ? inp.mat.gammaM : concreteGamma;
  const baseGamma = inp.type === 'gravityMasonry' ? inp.mat.gammaM : concreteGamma;

  // Gaviones: contorno escalonado por cuerpos
  const gw = isGab ? gabionWidths(inp.gab) : [];
  const gFront = (k: number) => (inp.gab.side === 'front' ? gw[0] - gw[k] : inp.gab.side === 'back' ? 0 : (gw[0] - gw[k]) / 2);
  const gBack = (k: number) => gFront(k) + gw[k];
  let stemPoly: Poly = ccw([{ x: xFb, y: hb }, { x: xBb, y: hb }, { x: xBt, y: yTop }, { x: xFt, y: yTop }]);
  if (isGab) {
    const pts: Poly = [];
    gw.forEach((_, k) => pts.push({ x: gFront(k), y: k * inp.gab.hc }, { x: gFront(k), y: (k + 1) * inp.gab.hc }));
    for (let k = gw.length - 1; k >= 0; k--) pts.push({ x: gBack(k), y: (k + 1) * inp.gab.hc }, { x: gBack(k), y: k * inp.gab.hc });
    stemPoly = ccw(pts);
  }
  const basePoly: Poly | null = hasBase
    ? ccw([{ x: 0, y: 0 }, { x: B, y: 0 }, { x: B, y: hb }, { x: xFb, y: hb }, { x: 0, y: hbTip }])
    : null;
  const keyPoly: Poly | null = inp.key.enabled
    ? ccw([{ x: inp.key.x, y: -inp.key.d }, { x: inp.key.x + inp.key.b, y: -inp.key.d }, { x: inp.key.x + inp.key.b, y: 0 }, { x: inp.key.x, y: 0 }])
    : null;

  let cfPoly: Poly | null = null;
  if (inp.type === 'counterfortInt') {
    cfPoly = ccw([
      { x: xBb, y: hb },
      { x: xBb + inp.cf.proj, y: hb },
      { x: xBt + inp.cf.projTop, y: yTop },
      { x: xBt, y: yTop },
    ]);
  } else if (inp.type === 'counterfortExt') {
    const p = Math.min(inp.cf.proj, xFb);
    cfPoly = ccw([
      { x: xFb - p, y: hb },
      { x: xFb, y: hb },
      { x: xFt, y: yTop },
      { x: xFt - Math.min(inp.cf.projTop, xFt), y: yTop },
    ]);
  }

  const parts: WallPart[] = [];
  parts.push(partOf('stem', 'Pantalla', stemPoly, stemGamma));
  if (basePoly) parts.push(partOf('base', 'Zapata', basePoly, baseGamma));
  if (keyPoly) parts.push(partOf('key', 'Llave de corte', keyPoly, baseGamma));
  if (cfPoly && isCounterfort(inp.type)) {
    parts.push(partOf('cf', inp.type === 'counterfortInt' ? 'Contrafuertes internos' : 'Contrafuertes externos', cfPoly, concreteGamma, inp.cf.t / inp.cf.s));
  }

  const coulomb = inp.theory === 'coulomb' && (inp.type === 'gravityConcrete' || inp.type === 'gravityMasonry' || inp.type === 'gabion');
  let heelSoilPoly: Poly;
  if (coulomb) {
    heelSoilPoly = ccw([{ x: xBb, y: hb }, { x: B, y: hb }, { x: B, y: yPlane }, { x: xBb, y: surfaceY(xBb) }]);
  } else {
    heelSoilPoly = ccw([{ x: xBb, y: hb }, { x: B, y: hb }, { x: B, y: yPlane }, { x: xBt, y: yTop }]);
  }
  let toeSoilPoly: Poly | null = null;
  const toeTop = Math.max(inp.Df, hb);
  if (xFb > 1e-6 && toeTop > hbTip + 1e-6) {
    toeSoilPoly = ccw([{ x: 0, y: hbTip }, { x: xFb, y: hb }, { x: xFb, y: toeTop }, { x: 0, y: toeTop }]);
  }

  const stemT = (y: number) => xBackAt(y) - xFrontAt(y);
  const course = (y: number) => Math.min(Math.max(Math.floor((y + 1e-7) / inp.gab.hc), 0), gw.length - 1);
  const xFrontAt = (y: number) => (isGab ? gFront(course(y)) : xFb + ((xFt - xFb) * y) / inp.H);
  const xBackAt = (y: number) => (isGab ? gBack(course(y)) : xBb + ((xBt - xBb) * y) / inp.H);

  return {
    inp, B, hb, hbTip, xFb, xBb, xFt, xBt, yTop, psiDeg, surfaceY, yPlane, parts, stemPoly, basePoly, keyPoly, cfPoly,
    yWater: inp.hw > 0 ? inp.hw : -Infinity, heelSoilPoly, toeSoilPoly, stemT, stemFrontX: xFrontAt, stemBackX: xBackAt,
  };
}

/** Peso y centroide de un polígono de suelo con peso unitario γ sobre y bajo el nivel freático. */
export function soilWeight(poly: Poly | null, gamma: number, gammaSat: number, yWater: number): { W: number; x: number; y: number } {
  if (!poly || poly.length < 3) return { W: 0, x: 0, y: 0 };
  let W = 0, Mx = 0, My = 0;
  const pieces: [Poly, number][] = [];
  if (isFinite(yWater)) {
    pieces.push([clipHalfPlane(poly, 0, 1, -yWater), gamma]); // y ≥ yWater
    pieces.push([clipHalfPlane(poly, 0, -1, yWater), gammaSat]); // y ≤ yWater
  } else {
    pieces.push([poly, gamma]);
  }
  for (const [pc, g] of pieces) {
    if (pc.length < 3) continue;
    const p = polyProps(pc);
    W += g * p.A;
    Mx += g * p.A * p.cx;
    My += g * p.A * p.cy;
  }
  return W > 0 ? { W, x: Mx / W, y: My / W } : { W: 0, x: 0, y: 0 };
}

export function pointsToString(p: Pt[]): string {
  return p.map((v) => `${v.x.toFixed(3)},${v.y.toFixed(3)}`).join(' ');
}
