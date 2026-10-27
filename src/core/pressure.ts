import { Poly, Pt, bbox, clipHalfPlane, convexHull, pointInPolygon, polyProps } from './geometry';

export interface Plane {
  q0: number;
  a: number;
  b: number;
}

export interface PressureSolution {
  ok: boolean;
  /** razón del fallo cuando ok = false */
  reason?: 'sin-carga' | 'tension' | 'fuera' | 'contacto-insuficiente';
  plane: Plane;
  /** región en contacto con el suelo (puede tener varios lóbulos si el polígono es cóncavo) */
  contact: Poly;
  contactArea: number;
  area: number;
  /** presión máxima y su posición */
  qmax: number;
  qmaxAt: Pt;
  /** presión mínima en la zapata (0 si hay levantamiento) */
  qmin: number;
  uplift: boolean;
  iterations: number;
}

function solve3(m: number[][], r: number[]): number[] | null {
  // Cramer / eliminación gaussiana con pivoteo
  const a = m.map((row, i) => [...row, r[i]]);
  for (let i = 0; i < 3; i++) {
    let p = i;
    for (let k = i + 1; k < 3; k++) if (Math.abs(a[k][i]) > Math.abs(a[p][i])) p = k;
    if (Math.abs(a[p][i]) < 1e-14) return null;
    [a[i], a[p]] = [a[p], a[i]];
    for (let k = i + 1; k < 3; k++) {
      const f = a[k][i] / a[i][i];
      for (let j = i; j < 4; j++) a[k][j] -= f * a[i][j];
    }
  }
  const x = [0, 0, 0];
  for (let i = 2; i >= 0; i--) {
    let s = a[i][3];
    for (let j = i + 1; j < 3; j++) s -= a[i][j] * x[j];
    x[i] = s / a[i][i];
  }
  return x;
}

/**
 * Presión de contacto lineal q = q0 + a·x + b·y bajo una zapata rígida de forma arbitraria,
 * sin tracción entre suelo y zapata.
 *
 * Equilibrio: ∫q dA = P, ∫q·x dA = Qx, ∫q·y dA = Qy  (momentos de la resultante respecto al origen).
 * Se itera sobre la región en contacto (q > 0); cada paso es exactamente Newton porque el término de
 * frontera se anula donde q = 0.
 */
export function solvePressure(poly: Poly, P: number, Qx: number, Qy: number): PressureSolution {
  const area = polyProps(poly).A;
  const empty: PressureSolution = {
    ok: false,
    plane: { q0: 0, a: 0, b: 0 },
    contact: [],
    contactArea: 0,
    area,
    qmax: 0,
    qmaxAt: { x: 0, y: 0 },
    qmin: 0,
    uplift: false,
    iterations: 0,
  };
  if (P <= 1e-9) return { ...empty, reason: Math.abs(P) < 1e-9 && Math.abs(Qx) < 1e-9 && Math.abs(Qy) < 1e-9 ? 'sin-carga' : 'tension' };

  // La resultante debe caer dentro del cierre convexo para que exista equilibrio.
  const hull = convexHull(poly);
  const rx = Qx / P;
  const ry = Qy / P;
  if (!pointInPolygon({ x: rx, y: ry }, hull)) {
    // tolerancia: sobre el borde
    const bb = bbox(hull);
    const tol = 1e-9 * Math.max(bb.xmax - bb.xmin, bb.ymax - bb.ymin, 1);
    let near = false;
    for (let i = 0; i < hull.length && !near; i++) {
      const a = hull[i];
      const b = hull[(i + 1) % hull.length];
      const dx = b.x - a.x, dy = b.y - a.y;
      const l2 = dx * dx + dy * dy || 1;
      const t = Math.max(0, Math.min(1, ((rx - a.x) * dx + (ry - a.y) * dy) / l2));
      if (Math.hypot(a.x + t * dx - rx, a.y + t * dy - ry) < tol) near = true;
    }
    if (!near) return { ...empty, reason: 'fuera' };
  }

  const rhs = [P, Qx, Qy];
  let region: Poly = poly;
  let params = [0, 0, 0];
  let iters = 0;
  let prevArea = -1;
  for (; iters < 200; iters++) {
    const pp = polyProps(region);
    if (pp.A < 1e-10 * Math.max(area, 1e-12)) return { ...empty, reason: 'contacto-insuficiente', iterations: iters };
    const J = [
      [pp.A, pp.Sx, pp.Sy],
      [pp.Sx, pp.Ixx0, pp.Ixy0],
      [pp.Sy, pp.Ixy0, pp.Iyy0],
    ];
    const sol = solve3(J, rhs);
    if (!sol) return { ...empty, reason: 'contacto-insuficiente', iterations: iters };
    const damp = iters > 40 ? 0.5 : 1;
    params = params.map((p0, i) => p0 + damp * (sol[i] - p0));
    const next = clipHalfPlane(poly, params[1], params[2], params[0]);
    const nA = polyProps(next).A;
    if (Math.abs(nA - polyProps(region).A) < 1e-12 * Math.max(area, 1) && Math.abs(nA - prevArea) < 1e-12 * Math.max(area, 1)) {
      region = next;
      break;
    }
    prevArea = polyProps(region).A;
    region = next;
    if (iters > 0 && Math.abs(nA - prevArea) < 1e-14 * Math.max(area, 1) && damp === 1) {
      break;
    }
  }
  const [q0, a, b] = params;
  const plane: Plane = { q0, a, b };
  let qmax = -Infinity;
  let qmaxAt: Pt = { x: 0, y: 0 };
  for (const v of region) {
    const q = q0 + a * v.x + b * v.y;
    if (q > qmax) {
      qmax = q;
      qmaxAt = v;
    }
  }
  let qminAll = Infinity;
  for (const v of poly) qminAll = Math.min(qminAll, q0 + a * v.x + b * v.y);
  const contactArea = polyProps(region).A;
  const uplift = contactArea < area * (1 - 1e-6);
  return {
    ok: true,
    plane,
    contact: region,
    contactArea,
    area,
    qmax,
    qmaxAt,
    qmin: uplift ? 0 : qminAll,
    uplift,
    iterations: iters,
  };
}

export function planeAt(pl: Plane, x: number, y: number): number {
  return pl.q0 + pl.a * x + pl.b * y;
}
