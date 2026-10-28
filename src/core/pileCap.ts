// Geometría del cabezal: contorno poligonal de cualquier forma.
import { Pt, Poly, bbox, ccw, convexHull, polyProps, regularPolygon } from './geometry';
import { footingPresetPoly } from './shapes';
import { PileInput } from './pileTypes';

export interface CapGeom {
  poly: Poly;
  bb: { x0: number; x1: number; y0: number; y1: number; B: number; L: number };
  area: number;
  cx: number;
  cy: number;
}

/** Desplazamiento de un polígono convexo (antihorario) con esquinas vivas. */
function miterOffset(p: Poly, d: number): Poly {
  const n = p.length;
  const lines = p.map((a, i) => {
    const b = p[(i + 1) % n];
    const dx = b.x - a.x, dy = b.y - a.y;
    const L = Math.hypot(dx, dy) || 1;
    const nx = dy / L, ny = -dx / L; // normal hacia afuera (polígono antihorario)
    return { px: a.x + nx * d, py: a.y + ny * d, dx: dx / L, dy: dy / L };
  });
  const out: Poly = [];
  for (let i = 0; i < n; i++) {
    const a = lines[(i + n - 1) % n], b = lines[i];
    const den = a.dx * b.dy - a.dy * b.dx;
    if (Math.abs(den) < 1e-9) { out.push({ x: b.px, y: b.py }); continue; }
    const t = ((b.px - a.px) * b.dy - (b.py - a.py) * b.dx) / den;
    out.push({ x: a.px + a.dx * t, y: a.py + a.dy * t });
  }
  return out;
}

/**
 * Redondea las esquinas de un polígono con arcos tangentes de radio r. El radio se limita para que los arcos de
 * esquinas vecinas no se solapen (tangentes ≤ la mitad de cada lado). Los vértices casi colineales (p. ej. los de un
 * círculo discretizado) no se tocan.
 */
export function roundCorners(p: Poly, r: number): Poly {
  if (r <= 1e-6 || p.length < 3) return p;
  const n = p.length;
  const out: Poly = [];
  for (let i = 0; i < n; i++) {
    const A = p[(i + n - 1) % n], B = p[i], C = p[(i + 1) % n];
    const lu = Math.hypot(A.x - B.x, A.y - B.y), lv = Math.hypot(C.x - B.x, C.y - B.y);
    if (lu < 1e-9 || lv < 1e-9) { out.push(B); continue; }
    const u = { x: (A.x - B.x) / lu, y: (A.y - B.y) / lu }, v = { x: (C.x - B.x) / lv, y: (C.y - B.y) / lv };
    const cosT = Math.max(-1, Math.min(1, u.x * v.x + u.y * v.y));
    const theta = Math.acos(cosT); // ángulo interior entre los lados
    if (Math.PI - theta < (8 * Math.PI) / 180 || theta < 1e-3) { out.push(B); continue; }
    const t = Math.min(r / Math.tan(theta / 2), Math.min(lu, lv) / 2);
    const rr = t * Math.tan(theta / 2);
    const P1 = { x: B.x + u.x * t, y: B.y + u.y * t }, P2 = { x: B.x + v.x * t, y: B.y + v.y * t };
    const bis = { x: u.x + v.x, y: u.y + v.y };
    const lb = Math.hypot(bis.x, bis.y) || 1;
    const c = { x: B.x + (bis.x / lb) * (rr / Math.sin(theta / 2)), y: B.y + (bis.y / lb) * (rr / Math.sin(theta / 2)) };
    const a1 = Math.atan2(P1.y - c.y, P1.x - c.x);
    let d = Math.atan2(P2.y - c.y, P2.x - c.x) - a1;
    while (d > Math.PI) d -= 2 * Math.PI;
    while (d < -Math.PI) d += 2 * Math.PI;
    const steps = Math.max(3, Math.ceil(Math.abs(d) / ((10 * Math.PI) / 180)));
    for (let k = 0; k <= steps; k++) {
      const a = a1 + (d * k) / steps;
      out.push({ x: c.x + rr * Math.cos(a), y: c.y + rr * Math.sin(a) });
    }
  }
  return out;
}

const circlePoly = (cx: number, cy: number, R: number, n = 72): Poly => regularPolygon(n, R).map((v) => ({ x: v.x + cx, y: v.y + cy }));

export function capGeometry(inp: PileInput, pts: Pt[]): CapGeom {
  const c = inp.cap;
  const P = pts.length ? pts : [{ x: 0, y: 0 }];
  const bbp = bbox(P);
  const cx0 = (bbp.xmin + bbp.xmax) / 2, cy0 = (bbp.ymin + bbp.ymax) / 2;
  const rMax = Math.max(...P.map((q) => Math.hypot(q.x - cx0, q.y - cy0)), 0);
  let poly: Poly;
  switch (c.shape) {
    case 'hull': {
      const cloud: Pt[] = P.flatMap((q) => regularPolygon(48, Math.max(c.edge, 0.05)).map((v) => ({ x: v.x + q.x, y: v.y + q.y })));
      poly = ccw(convexHull(cloud));
      break;
    }
    case 'miter': {
      const h = convexHull(P);
      poly = h.length >= 3 ? miterOffset(ccw(h), c.edge) : rectOf(inp, bbp);
      break;
    }
    case 'circle':
      poly = circlePoly(cx0, cy0, c.manualSize ? c.preset.D / 2 : rMax + c.edge);
      break;
    case 'ngon': {
      const N = Math.max(3, Math.round(c.nSides));
      const R = c.manualSize ? c.preset.D / 2 : (rMax + c.edge) / Math.cos(Math.PI / N);
      poly = regularPolygon(N, R).map((v) => ({ x: v.x + cx0, y: v.y + cy0 }));
      break;
    }
    case 'L':
    case 'T':
    case 'trapezoid':
    case 'triangle':
      poly = footingPresetPoly(c.shape, c.preset).map((v) => ({ x: v.x + c.dx, y: v.y + c.dy }));
      break;
    case 'poly':
      poly = ccw(c.vertices.map((v) => ({ x: v.x + c.dx, y: v.y + c.dy })));
      break;
    default:
      poly = rectOf(inp, bbp);
  }
  poly = ccw(roundCorners(ccw(poly), c.cornerR ?? 0));
  const b = bbox(poly);
  const pp = polyProps(poly);
  return { poly, bb: { x0: b.xmin, x1: b.xmax, y0: b.ymin, y1: b.ymax, B: b.xmax - b.xmin, L: b.ymax - b.ymin }, area: pp.A, cx: pp.cx, cy: pp.cy };
}

function rectOf(inp: PileInput, bbp: { xmin: number; xmax: number; ymin: number; ymax: number }): Poly {
  const c = inp.cap;
  const cx = (bbp.xmin + bbp.xmax) / 2, cy = (bbp.ymin + bbp.ymax) / 2;
  const B = c.manualSize ? c.B : bbp.xmax - bbp.xmin + 2 * c.edge;
  const L = c.manualSize ? c.L : bbp.ymax - bbp.ymin + 2 * c.edge;
  return [{ x: cx - B / 2, y: cy - L / 2 }, { x: cx + B / 2, y: cy - L / 2 }, { x: cx + B / 2, y: cy + L / 2 }, { x: cx - B / 2, y: cy + L / 2 }];
}

/** Extremos del segmento del polígono que contiene el punto `at` sobre la recta y = v (axis 'x') o x = v (axis 'y'). */
export function lineSpan(poly: Poly, axis: 'x' | 'y', v: number, at: number): [number, number] {
  const xs: number[] = [];
  const n = poly.length;
  for (let i = 0; i < n; i++) {
    const a = poly[i], b = poly[(i + 1) % n];
    const a1 = axis === 'x' ? a.y : a.x, b1 = axis === 'x' ? b.y : b.x;
    if ((a1 - v) * (b1 - v) > 0 || a1 === b1) continue;
    const t = (v - a1) / (b1 - a1);
    xs.push(axis === 'x' ? a.x + t * (b.x - a.x) : a.y + t * (b.y - a.y));
  }
  xs.sort((p, q) => p - q);
  for (let i = 0; i + 1 < xs.length; i += 2) if (at >= xs[i] - 1e-9 && at <= xs[i + 1] + 1e-9) return [xs[i], xs[i + 1]];
  return xs.length >= 2 ? [xs[0], xs[xs.length - 1]] : [at, at];
}
