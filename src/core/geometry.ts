// Geometría plana: polígonos arbitrarios, propiedades de área, recortes y offsets.
// Todas las unidades son las del llamador (el resto del programa usa metros).

export interface Pt {
  x: number;
  y: number;
}
export type Poly = Pt[];

export const EPS = 1e-9;

/** Área con signo (positiva si el polígono es antihorario). */
export function signedArea(p: Poly): number {
  let s = 0;
  for (let i = 0; i < p.length; i++) {
    const a = p[i];
    const b = p[(i + 1) % p.length];
    s += a.x * b.y - b.x * a.y;
  }
  return s / 2;
}

/** Devuelve el polígono en sentido antihorario (copia). */
export function ccw(p: Poly): Poly {
  const q = p.map((v) => ({ x: v.x, y: v.y }));
  return signedArea(q) < 0 ? q.reverse() : q;
}

export interface PolyProps {
  A: number;
  /** ∫x dA y ∫y dA respecto al origen */
  Sx: number;
  Sy: number;
  /** ∫x² dA, ∫y² dA, ∫xy dA respecto al origen */
  Ixx0: number; // ∫x²
  Iyy0: number; // ∫y²
  Ixy0: number; // ∫xy
  cx: number;
  cy: number;
  /** Inercias centroidales: Ix=∫y² dA, Iy=∫x² dA, Ixy=∫xy dA */
  Ix: number;
  Iy: number;
  Ixy: number;
}

/** Propiedades de área de un polígono (cualquier forma simple, también cóncava). */
export function polyProps(p: Poly): PolyProps {
  let A = 0,
    Sx = 0,
    Sy = 0,
    Ixx0 = 0,
    Iyy0 = 0,
    Ixy0 = 0;
  const n = p.length;
  for (let i = 0; i < n; i++) {
    const a = p[i];
    const b = p[(i + 1) % n];
    const c = a.x * b.y - b.x * a.y;
    A += c;
    Sx += c * (a.x + b.x);
    Sy += c * (a.y + b.y);
    Ixx0 += c * (a.x * a.x + a.x * b.x + b.x * b.x);
    Iyy0 += c * (a.y * a.y + a.y * b.y + b.y * b.y);
    Ixy0 += c * (a.x * b.y + 2 * a.x * a.y + 2 * b.x * b.y + b.x * a.y);
  }
  A /= 2;
  Sx /= 6;
  Sy /= 6;
  Ixx0 /= 12;
  Iyy0 /= 12;
  Ixy0 /= 24;
  const cx = Math.abs(A) > EPS ? Sx / A : 0;
  const cy = Math.abs(A) > EPS ? Sy / A : 0;
  return {
    A,
    Sx,
    Sy,
    Ixx0,
    Iyy0,
    Ixy0,
    cx,
    cy,
    Iy: Ixx0 - A * cx * cx,
    Ix: Iyy0 - A * cy * cy,
    Ixy: Ixy0 - A * cx * cy,
  };
}

export function bbox(p: Poly): { xmin: number; xmax: number; ymin: number; ymax: number } {
  let xmin = Infinity,
    xmax = -Infinity,
    ymin = Infinity,
    ymax = -Infinity;
  for (const v of p) {
    xmin = Math.min(xmin, v.x);
    xmax = Math.max(xmax, v.x);
    ymin = Math.min(ymin, v.y);
    ymax = Math.max(ymax, v.y);
  }
  return { xmin, xmax, ymin, ymax };
}

/** Recorta el polígono conservando la región a·x + b·y + c >= 0 (Sutherland–Hodgman). */
export function clipHalfPlane(p: Poly, a: number, b: number, c: number): Poly {
  const out: Poly = [];
  const n = p.length;
  if (n === 0) return out;
  for (let i = 0; i < n; i++) {
    const cur = p[i];
    const nxt = p[(i + 1) % n];
    const dc = a * cur.x + b * cur.y + c;
    const dn = a * nxt.x + b * nxt.y + c;
    const inC = dc >= 0;
    const inN = dn >= 0;
    if (inC) out.push(cur);
    if (inC !== inN) {
      const t = dc / (dc - dn);
      out.push({ x: cur.x + t * (nxt.x - cur.x), y: cur.y + t * (nxt.y - cur.y) });
    }
  }
  return out;
}

/** Recorta un polígono cualquiera (sujeto) con un polígono convexo antihorario. */
export function clipByConvex(subject: Poly, clip: Poly): Poly {
  let out = subject;
  const n = clip.length;
  for (let i = 0; i < n && out.length > 0; i++) {
    const a = clip[i];
    const b = clip[(i + 1) % n];
    // semiplano a la izquierda de a→b
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    // izquierda: (-dy)(x-a.x) + dx (y-a.y) >= 0
    out = clipHalfPlane(out, -dy, dx, dy * a.x - dx * a.y);
  }
  return out;
}

/** Cierre convexo (Andrew). Devuelve antihorario. */
export function convexHull(pts: Poly): Poly {
  const p = pts
    .map((v) => ({ x: v.x, y: v.y }))
    .sort((a, b) => (a.x === b.x ? a.y - b.y : a.x - b.x));
  if (p.length < 3) return p;
  const cross = (o: Pt, a: Pt, b: Pt) => (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
  const lower: Poly = [];
  for (const v of p) {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], v) <= 0) lower.pop();
    lower.push(v);
  }
  const upper: Poly = [];
  for (let i = p.length - 1; i >= 0; i--) {
    const v = p[i];
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], v) <= 0) upper.pop();
    upper.push(v);
  }
  lower.pop();
  upper.pop();
  return lower.concat(upper);
}

export function pointInPolygon(pt: Pt, p: Poly): boolean {
  let inside = false;
  const n = p.length;
  for (let i = 0, j = n - 1; i < n; j = i++) {
    const a = p[i];
    const b = p[j];
    if (a.y > pt.y !== b.y > pt.y && pt.x < ((b.x - a.x) * (pt.y - a.y)) / (b.y - a.y) + a.x) inside = !inside;
  }
  return inside;
}

export function perimeter(p: Poly): number {
  let s = 0;
  for (let i = 0; i < p.length; i++) {
    const a = p[i];
    const b = p[(i + 1) % p.length];
    s += Math.hypot(b.x - a.x, b.y - a.y);
  }
  return s;
}

/**
 * Offset exterior (suma de Minkowski con un círculo) de un polígono CONVEXO antihorario.
 * Las esquinas se redondean con arcos; sirve para el perímetro crítico de punzonamiento a d/2.
 */
export function offsetConvex(hull: Poly, dist: number, arcStep = Math.PI / 48): Poly {
  const n = hull.length;
  const out: Poly = [];
  if (n < 3) return out;
  const normals: Pt[] = [];
  for (let i = 0; i < n; i++) {
    const a = hull[i];
    const b = hull[(i + 1) % n];
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const l = Math.hypot(dx, dy) || 1;
    normals.push({ x: dy / l, y: -dx / l }); // normal exterior (antihorario)
  }
  for (let i = 0; i < n; i++) {
    const prev = normals[(i - 1 + n) % n];
    const next = normals[i];
    const a0 = Math.atan2(prev.y, prev.x);
    let a1 = Math.atan2(next.y, next.x);
    while (a1 < a0) a1 += 2 * Math.PI;
    const steps = Math.max(1, Math.ceil((a1 - a0) / arcStep));
    for (let k = 0; k <= steps; k++) {
      const t = a0 + ((a1 - a0) * k) / steps;
      out.push({ x: hull[i].x + dist * Math.cos(t), y: hull[i].y + dist * Math.sin(t) });
    }
  }
  return out;
}

export interface Piece {
  x: number;
  y: number;
  len: number;
}

/** Divide una poligonal cerrada en trozos cortos (punto medio y longitud). */
export function samplePolyline(p: Poly, maxLen: number): Piece[] {
  const out: Piece[] = [];
  const n = p.length;
  for (let i = 0; i < n; i++) {
    const a = p[i];
    const b = p[(i + 1) % n];
    const L = Math.hypot(b.x - a.x, b.y - a.y);
    if (L < 1e-12) continue;
    const k = Math.max(1, Math.ceil(L / maxLen));
    for (let j = 0; j < k; j++) {
      const t = (j + 0.5) / k;
      out.push({ x: a.x + t * (b.x - a.x), y: a.y + t * (b.y - a.y), len: L / k });
    }
  }
  return out;
}

/** Longitud total de la intersección del polígono con la recta x = v (axis 'x') o y = v (axis 'y'). */
export function chordLength(p: Poly, axis: 'x' | 'y', v: number): number {
  // Área de una franja muy delgada centrada en la recta, dividida por su ancho.
  const h = 1e-6;
  const a = axis === 'x' ? 1 : 0;
  const b = axis === 'x' ? 0 : 1;
  let s = clipHalfPlane(p, a, b, -(v - h / 2));
  s = clipHalfPlane(s, -a, -b, v + h / 2);
  return Math.max(0, polyProps(s).A / h);
}

export interface PlaneIntegral {
  /** ∫ q dA */
  F: number;
  /** ∫ q·x dA */
  Qx: number;
  /** ∫ q·y dA */
  Qy: number;
}

/** Integra el plano q = q0 + a·x + b·y sobre un polígono. */
export function integratePlane(p: Poly, q0: number, a: number, b: number): PlaneIntegral {
  if (p.length < 3) return { F: 0, Qx: 0, Qy: 0 };
  const pp = polyProps(p);
  return {
    F: q0 * pp.A + a * pp.Sx + b * pp.Sy,
    Qx: q0 * pp.Sx + a * pp.Ixx0 + b * pp.Ixy0,
    Qy: q0 * pp.Sy + a * pp.Ixy0 + b * pp.Iyy0,
  };
}

export function rotatePoly(p: Poly, angleDeg: number, about: Pt = { x: 0, y: 0 }): Poly {
  const t = (angleDeg * Math.PI) / 180;
  const c = Math.cos(t);
  const s = Math.sin(t);
  return p.map((v) => ({
    x: about.x + (v.x - about.x) * c - (v.y - about.y) * s,
    y: about.y + (v.x - about.x) * s + (v.y - about.y) * c,
  }));
}

export function translatePoly(p: Poly, dx: number, dy: number): Poly {
  return p.map((v) => ({ x: v.x + dx, y: v.y + dy }));
}

export function regularPolygon(n: number, radius: number): Poly {
  const out: Poly = [];
  for (let i = 0; i < n; i++) {
    const t = (2 * Math.PI * i) / n;
    out.push({ x: radius * Math.cos(t), y: radius * Math.sin(t) });
  }
  return out;
}

/** Verifica si un polígono es simple (sin autointersecciones). */
export function isSimple(p: Poly): boolean {
  const n = p.length;
  if (n < 3) return false;
  const ccwTest = (a: Pt, b: Pt, c: Pt) => (c.y - a.y) * (b.x - a.x) - (b.y - a.y) * (c.x - a.x);
  const inter = (a: Pt, b: Pt, c: Pt, d: Pt) =>
    ccwTest(a, c, d) * ccwTest(b, c, d) < -1e-12 && ccwTest(a, b, c) * ccwTest(a, b, d) < -1e-12;
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      if (Math.abs(i - j) <= 1 || (i === 0 && j === n - 1)) continue;
      if (inter(p[i], p[(i + 1) % n], p[j], p[(j + 1) % n])) return false;
    }
  }
  return true;
}
