// Diagramas de momento y de cortante del cabezal rígido a lo largo de los ejes X e Y (cargas últimas, sin peso propio).
import { PileInput, capColumns, comboColumnLoads, comboResultant } from './pileTypes';
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
  /** caras de la columna principal, caras de todas las columnas (con su nombre) y posición de los pilotes sobre el eje */
  face: [number, number];
  faces: { name: string; c0: number; c1: number }[];
  piles: number[];
}

export function cabezalDiagram(inp: PileInput, res: PileResults, axis: 'x' | 'y', N = 240): Diagram {
  const pts = res.pts;
  const cap = inp.cap;
  const cols = capColumns(inp).map((c) => {
    const cb = bbox(columnPoly(c.geom, c.x, c.y));
    const cmin = axis === 'x' ? cb.xmin : cb.ymin;
    const cmax = axis === 'x' ? cb.xmax : cb.ymax;
    return { name: c.name, cmin, cmax, cc: (cmin + cmax) / 2, wC: Math.max(cmax - cmin, 1e-6) };
  });
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
  const ramp = (x: number, c: (typeof cols)[number]) => Math.min(1, Math.max(0, (x - (c.cc - c.wC / 2)) / c.wC));
  const combos: DiagramCombo[] = [];
  const ult = inp.combos.filter((c) => c.kind === 'ultimate');
  for (const u of ult) {
    const rs = comboResultant(inp, u, cap.h);
    const L = comboColumnLoads(inp, u);
    const R = solveReactions(pts, rs.P, rs.Qx, rs.Qy).R;
    const at = (x: number) => {
      let m = 0, v = 0;
      pts.forEach((q, i) => {
        const p = part(x, coord(q), Dp, R[i]);
        m += p.M;
        v += p.V;
      });
      cols.forEach((c, k) => {
        const Mapp = axis === 'x' ? L[k].My + L[k].Vx * cap.h : L[k].Mx + L[k].Vy * cap.h;
        const pc = part(x, c.cc, c.wC, L[k].P);
        m += -pc.M + Mapp * ramp(x, c);
        v += -pc.V;
      });
      return { m, v };
    };
    // las columnas son rígidas: dentro de su ancho se interpola entre los valores en sus caras (los momentos de diseño son los de las caras)
    const fc = cols.map((c) => ({ c, f0: at(c.cmin), f1: at(c.cmax) }));
    const M: number[] = [];
    const V: number[] = [];
    for (const x of s) {
      const inC = fc.find((q) => x > q.c.cmin && x < q.c.cmax);
      if (inC) {
        const t = (x - inC.c.cmin) / inC.c.wC;
        M.push(inC.f0.m + (inC.f1.m - inC.f0.m) * t);
        V.push(inC.f0.v + (inC.f1.v - inC.f0.v) * t);
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
  return { axis, s, combos, envMax, envMin, Mpos, Mneg, Vpos, Vneg, lo, hi, face: [cols[0].cmin, cols[0].cmax], faces: cols.map((c) => ({ name: c.name, c0: c.cmin, c1: c.cmax })), piles: pts.map(coord) };
}
