// Diagramas de momento y de cortante del cabezal rígido a lo largo de los ejes X e Y (cargas últimas, sin peso propio).
import { PileInput } from './pileTypes';
import { PileResults, solveReactions } from './pile';
import { columnPoly } from './shapes';
import { bbox } from './geometry';

export interface DiagramCombo {
  name: string;
  /** momento (kN·m) y cortante (kN) en cada abscisa; M positivo = tracción abajo (sagging) */
  M: number[];
  V: number[];
}
export interface Diagram {
  axis: 'x' | 'y';
  s: number[];
  combos: DiagramCombo[];
  envMax: number[];
  envMin: number[];
  /** extremos del momento sobre todas las combinaciones */
  Mpos: { v: number; s: number; combo: string };
  Mneg: { v: number; s: number; combo: string };
  /** extremos del cortante */
  Vpos: { v: number; s: number };
  Vneg: { v: number; s: number };
  lo: number;
  hi: number;
  /** caras de la columna y posición de los pilotes sobre el eje */
  face: [number, number];
  piles: number[];
}

export function cabezalDiagram(inp: PileInput, res: PileResults, axis: 'x' | 'y', N = 240): Diagram {
  const pts = res.pts;
  const cap = inp.cap;
  const col = inp.column;
  const cb = bbox(columnPoly(col.geom, col.x, col.y));
  const cmin = axis === 'x' ? cb.xmin : cb.ymin;
  const cmax = axis === 'x' ? cb.xmax : cb.ymax;
  const cc = (cmin + cmax) / 2;
  const wC = Math.max(cmax - cmin, 1e-6);
  const Dp = res.props.Dp;
  const lo = axis === 'x' ? res.capRect.x0 : res.capRect.y0;
  const hi = axis === 'x' ? res.capRect.x1 : res.capRect.y1;
  const s = Array.from({ length: N + 1 }, (_, k) => lo + ((hi - lo) * k) / N);
  const coord = (q: { x: number; y: number }) => (axis === 'x' ? q.x : q.y);
  // aporte de una carga uniformemente repartida en un ancho w centrado en c: momento y cortante hasta la abscisa x
  const part = (x: number, c: number, w: number, F: number) => {
    const a = c - w / 2;
    if (x <= a) return { V: 0, M: 0 };
    if (x >= a + w) return { V: F, M: F * (x - c) };
    const f = (x - a) / w;
    return { V: F * f, M: (F * (x - a) * (x - a)) / (2 * w) };
  };
  const ramp = (x: number) => Math.min(1, Math.max(0, (x - (cc - wC / 2)) / wC));
  const combos: DiagramCombo[] = [];
  const ult = inp.combos.filter((c) => c.kind === 'ultimate');
  for (const u of ult) {
    const Mxb = u.Mx + u.Vy * cap.h;
    const Myb = u.My + u.Vx * cap.h;
    const R = solveReactions(pts, u.P, u.P * col.x + Myb, u.P * col.y + Mxb).R;
    const Mapp = axis === 'x' ? Myb : Mxb;
    const at = (x: number) => {
      let m = 0, v = 0;
      pts.forEach((q, i) => {
        const p = part(x, coord(q), Dp, R[i]);
        m += p.M;
        v += p.V;
      });
      const pc = part(x, cc, wC, u.P);
      m += -pc.M + Mapp * ramp(x);
      v += -pc.V;
      return { m, v };
    };
    // la columna es rígida: dentro de su ancho se interpola entre los valores en sus caras (los momentos de diseño son los de las caras)
    const f0 = at(cmin), f1 = at(cmax);
    const M: number[] = [];
    const V: number[] = [];
    for (const x of s) {
      if (x > cmin && x < cmax) {
        const t = (x - cmin) / wC;
        M.push(f0.m + (f1.m - f0.m) * t);
        V.push(f0.v + (f1.v - f0.v) * t);
      } else {
        const r = at(x);
        M.push(r.m);
        V.push(r.v);
      }
    }
    combos.push({ name: u.name, M, V });
  }
  const envMax = s.map((_, k) => Math.max(0, ...combos.map((c) => c.M[k])));
  const envMin = s.map((_, k) => Math.min(0, ...combos.map((c) => c.M[k])));
  let Mpos = { v: 0, s: lo, combo: '—' }, Mneg = { v: 0, s: lo, combo: '—' };
  let Vpos = { v: 0, s: lo }, Vneg = { v: 0, s: lo };
  for (const c of combos) {
    c.M.forEach((m, k) => {
      if (m > Mpos.v) Mpos = { v: m, s: s[k], combo: c.name };
      if (m < Mneg.v) Mneg = { v: m, s: s[k], combo: c.name };
    });
    c.V.forEach((v, k) => {
      if (v > Vpos.v) Vpos = { v, s: s[k] };
      if (v < Vneg.v) Vneg = { v, s: s[k] };
    });
  }
  return { axis, s, combos, envMax, envMin, Mpos, Mneg, Vpos, Vneg, lo, hi, face: [cmin, cmax], piles: pts.map(coord) };
}
