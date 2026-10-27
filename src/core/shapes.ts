import { Poly, Pt, polyProps, regularPolygon, rotatePoly, translatePoly, ccw } from './geometry';

// ---------------------------------------------------------------------------
// Columnas
// ---------------------------------------------------------------------------
export type ColumnShape = 'rect' | 'circle' | 'ngon' | 'L' | 'T' | 'I' | 'cross' | 'poly';

export interface ColumnGeom {
  shape: ColumnShape;
  /** rect: b (x), h (y). circle: D. ngon: D, n. L/T/I/cross: b, h, t (ala/espesor), tw (alma) */
  b: number;
  h: number;
  D: number;
  n: number;
  t: number;
  tw: number;
  /** vértices locales cuando shape = 'poly' */
  vertices: Pt[];
  /** giro en grados (antihorario) alrededor del centroide */
  rotation: number;
}

export const COLUMN_SHAPES: { id: ColumnShape; label: string }[] = [
  { id: 'rect', label: 'Rectangular' },
  { id: 'circle', label: 'Circular' },
  { id: 'ngon', label: 'Poligonal regular' },
  { id: 'L', label: 'En L' },
  { id: 'T', label: 'En T' },
  { id: 'I', label: 'En I / H' },
  { id: 'cross', label: 'En cruz (+)' },
  { id: 'poly', label: 'Libre (vértices)' },
];

export function defaultColumnGeom(shape: ColumnShape = 'rect'): ColumnGeom {
  return { shape, b: 0.4, h: 0.4, D: 0.45, n: 8, t: 0.15, tw: 0.15, vertices: [{ x: -0.2, y: -0.2 }, { x: 0.2, y: -0.2 }, { x: 0.2, y: 0.2 }, { x: -0.2, y: 0.2 }], rotation: 0 };
}

function rawColumn(g: ColumnGeom): Poly {
  const { b, h, t, tw } = g;
  switch (g.shape) {
    case 'rect':
      return [{ x: 0, y: 0 }, { x: b, y: 0 }, { x: b, y: h }, { x: 0, y: h }];
    case 'circle':
      return regularPolygon(64, g.D / 2);
    case 'ngon':
      return regularPolygon(Math.max(3, Math.round(g.n)), g.D / 2);
    case 'L':
      return [{ x: 0, y: 0 }, { x: b, y: 0 }, { x: b, y: t }, { x: t, y: t }, { x: t, y: h }, { x: 0, y: h }];
    case 'T': {
      // ala arriba (ancho b, espesor t), alma centrada (espesor tw)
      const x0 = (b - tw) / 2;
      return [{ x: x0, y: 0 }, { x: x0 + tw, y: 0 }, { x: x0 + tw, y: h - t }, { x: b, y: h - t }, { x: b, y: h }, { x: 0, y: h }, { x: 0, y: h - t }, { x: x0, y: h - t }];
    }
    case 'I': {
      const x0 = (b - tw) / 2;
      return [
        { x: 0, y: 0 }, { x: b, y: 0 }, { x: b, y: t }, { x: x0 + tw, y: t }, { x: x0 + tw, y: h - t }, { x: b, y: h - t },
        { x: b, y: h }, { x: 0, y: h }, { x: 0, y: h - t }, { x: x0, y: h - t }, { x: x0, y: t }, { x: 0, y: t },
      ];
    }
    case 'cross': {
      const x0 = (b - tw) / 2;
      const y0 = (h - tw) / 2;
      return [
        { x: x0, y: 0 }, { x: x0 + tw, y: 0 }, { x: x0 + tw, y: y0 }, { x: b, y: y0 }, { x: b, y: y0 + tw }, { x: x0 + tw, y: y0 + tw },
        { x: x0 + tw, y: h }, { x: x0, y: h }, { x: x0, y: y0 + tw }, { x: 0, y: y0 + tw }, { x: 0, y: y0 }, { x: x0, y: y0 },
      ];
    }
    case 'poly':
      return g.vertices.length >= 3 ? g.vertices : [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 0, y: 1 }];
  }
}

/** Polígono local de la columna, centrado en su centroide y girado. */
export function columnLocalPoly(g: ColumnGeom): Poly {
  let p = ccw(rawColumn(g));
  const pp = polyProps(p);
  p = translatePoly(p, -pp.cx, -pp.cy);
  if (g.rotation) p = rotatePoly(p, g.rotation);
  return p;
}

export function columnPoly(g: ColumnGeom, x: number, y: number): Poly {
  return translatePoly(columnLocalPoly(g), x, y);
}

// ---------------------------------------------------------------------------
// Fundaciones (presets)
// ---------------------------------------------------------------------------
export type FootingPreset = 'rect' | 'circle' | 'ngon' | 'L' | 'T' | 'trapezoid' | 'triangle' | 'poly';

export const FOOTING_PRESETS: { id: FootingPreset; label: string }[] = [
  { id: 'rect', label: 'Rectangular' },
  { id: 'circle', label: 'Circular' },
  { id: 'ngon', label: 'Poligonal regular' },
  { id: 'L', label: 'En L' },
  { id: 'T', label: 'En T' },
  { id: 'trapezoid', label: 'Trapezoidal' },
  { id: 'triangle', label: 'Triangular' },
  { id: 'poly', label: 'Libre (vértices)' },
];

export interface FootingPresetParams {
  B: number; // ancho (x)
  L: number; // largo (y)
  D: number; // diámetro
  n: number;
  t1: number;
  t2: number;
  b2: number; // ancho superior del trapecio
}

export function defaultPresetParams(): FootingPresetParams {
  return { B: 2.0, L: 2.0, D: 2.2, n: 6, t1: 0.8, t2: 0.8, b2: 1.2 };
}

/** Genera vértices (m) con el origen en el centro de la caja envolvente. */
export function footingPresetPoly(kind: FootingPreset, p: FootingPresetParams): Poly {
  let pts: Poly;
  switch (kind) {
    case 'rect':
      pts = [{ x: 0, y: 0 }, { x: p.B, y: 0 }, { x: p.B, y: p.L }, { x: 0, y: p.L }];
      break;
    case 'circle':
      pts = regularPolygon(64, p.D / 2).map((v) => ({ x: v.x + p.D / 2, y: v.y + p.D / 2 }));
      break;
    case 'ngon':
      pts = regularPolygon(Math.max(3, Math.round(p.n)), p.D / 2).map((v) => ({ x: v.x + p.D / 2, y: v.y + p.D / 2 }));
      break;
    case 'L':
      pts = [{ x: 0, y: 0 }, { x: p.B, y: 0 }, { x: p.B, y: p.t2 }, { x: p.t1, y: p.t2 }, { x: p.t1, y: p.L }, { x: 0, y: p.L }];
      break;
    case 'T': {
      const x0 = (p.B - p.t1) / 2;
      pts = [{ x: x0, y: 0 }, { x: x0 + p.t1, y: 0 }, { x: x0 + p.t1, y: p.L - p.t2 }, { x: p.B, y: p.L - p.t2 }, { x: p.B, y: p.L }, { x: 0, y: p.L }, { x: 0, y: p.L - p.t2 }, { x: x0, y: p.L - p.t2 }];
      break;
    }
    case 'trapezoid': {
      const o = (p.B - p.b2) / 2;
      pts = [{ x: 0, y: 0 }, { x: p.B, y: 0 }, { x: p.B - o, y: p.L }, { x: o, y: p.L }];
      break;
    }
    case 'triangle':
      pts = [{ x: 0, y: 0 }, { x: p.B, y: 0 }, { x: p.B / 2, y: p.L }];
      break;
    default:
      pts = [{ x: 0, y: 0 }, { x: p.B, y: 0 }, { x: p.B, y: p.L }, { x: 0, y: p.L }];
  }
  let xmin = Infinity, xmax = -Infinity, ymin = Infinity, ymax = -Infinity;
  for (const v of pts) {
    xmin = Math.min(xmin, v.x); xmax = Math.max(xmax, v.x);
    ymin = Math.min(ymin, v.y); ymax = Math.max(ymax, v.y);
  }
  const cx = (xmin + xmax) / 2;
  const cy = (ymin + ymax) / 2;
  return ccw(pts.map((v) => ({ x: +(v.x - cx).toFixed(6), y: +(v.y - cy).toFixed(6) })));
}
