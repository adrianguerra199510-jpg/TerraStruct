// Vista 3D (proyección ortográfica en SVG) del cabezal con el modelo de puntales y tirantes.
import { PileInput } from '../core/pileTypes';
import { PileResults } from '../core/pile';
import { StmResult } from '../core/pileSTM';
import { Fmt } from '../core/units';
import { Pt, regularPolygon } from '../core/geometry';
import { Theme, LIGHT, esc, svgWrap } from './svg';

export interface View3d {
  /** giro alrededor del eje vertical y elevación de la cámara, grados */
  yaw: number;
  pitch: number;
  /** factor de acercamiento (1 = ajustado) */
  zoom?: number;
}

export const VIEWS_3D: { id: string; label: string; view: View3d }[] = [
  { id: 'iso', label: 'Isométrica', view: { yaw: -35, pitch: 28 } },
  { id: 'x', label: 'Frente (eje X)', view: { yaw: 0, pitch: 4 } },
  { id: 'y', label: 'Lado (eje Y)', view: { yaw: -90, pitch: 4 } },
  { id: 'top', label: 'Planta', view: { yaw: 0, pitch: 89.5 } },
];

type V3 = { x: number; y: number; z: number };

interface Item {
  depth: number;
  svg: string;
}

export function pileStm3dSvg(inp: PileInput, res: PileResults, o: { W?: number; H?: number; theme?: Theme; fmt: Fmt; view?: View3d; labels?: boolean; concrete?: boolean; title?: boolean }): string {
  const stm = res.stm as StmResult;
  const W = o.W ?? 820, H = o.H ?? 560;
  const th = o.theme ?? LIGHT;
  const v = o.view ?? VIEWS_3D[0].view;
  const labels = o.labels !== false;
  const showConc = o.concrete !== false;
  const h = inp.cap.h;
  const Dp = res.props.Dp;
  const pileStub = Math.max(1.6 * h, 2.5 * Dp);
  const colH = Math.max(0.9 * h, 0.8);
  const a = (v.yaw * Math.PI) / 180, b = (v.pitch * Math.PI) / 180;
  const ca = Math.cos(a), sa = Math.sin(a), cb = Math.cos(b), sb = Math.sin(b);
  const proj0 = (p: V3) => {
    const u = p.x * ca - p.y * sa;
    const w = p.x * sa + p.y * ca;
    return { u, v: p.z * cb + w * sb, d: w * cb - p.z * sb };
  };
  // encuadre: caja de todo el modelo
  const box: V3[] = [];
  for (const q of res.capPoly) box.push({ x: q.x, y: q.y, z: 0 }, { x: q.x, y: q.y, z: h });
  for (const q of res.pts) box.push({ x: q.x, y: q.y, z: -pileStub });
  for (const c of res.cols) for (const q of c.poly) box.push({ x: q.x, y: q.y, z: h + colH });
  const pr = box.map(proj0);
  const u0 = Math.min(...pr.map((q) => q.u)), u1 = Math.max(...pr.map((q) => q.u));
  const v0 = Math.min(...pr.map((q) => q.v)), v1 = Math.max(...pr.map((q) => q.v));
  const top = 46, bot = 46, side = 30;
  const s = Math.min((W - 2 * side) / Math.max(u1 - u0, 1e-6), (H - top - bot) / Math.max(v1 - v0, 1e-6)) * (v.zoom ?? 1);
  const cxs = W / 2 - ((u0 + u1) / 2) * s, cys = top + (H - top - bot) / 2 + ((v0 + v1) / 2) * s;
  const P = (p: V3) => {
    const q = proj0(p);
    return { X: cxs + q.u * s, Y: cys - q.v * s, d: q.d };
  };
  const items: Item[] = [];
  const f1 = (n: number) => n.toFixed(1);
  const face = (pts: V3[], fill: string, fop: number, stroke: string, sop: number, sw = 1, bias = 0) => {
    const q = pts.map(P);
    const depth = q.reduce((acc, t) => acc + t.d, 0) / q.length + bias;
    items.push({ depth, svg: `<polygon points="${q.map((t) => `${f1(t.X)},${f1(t.Y)}`).join(' ')}" fill="${fill}" fill-opacity="${fop}" stroke="${stroke}" stroke-opacity="${sop}" stroke-width="${sw}" stroke-linejoin="round"/>` });
  };
  const seg = (p1: V3, p2: V3, stroke: string, w: number, extra = '', bias = 0) => {
    const A = P(p1), B = P(p2);
    items.push({ depth: (A.d + B.d) / 2 + bias, svg: `<line x1="${f1(A.X)}" y1="${f1(A.Y)}" x2="${f1(B.X)}" y2="${f1(B.Y)}" stroke="${stroke}" stroke-width="${w.toFixed(2)}" stroke-linecap="round" ${extra}/>` });
  };
  const dot = (p: V3, r: number, fill: string, stroke = 'none', bias = -0.02) => {
    const A = P(p);
    items.push({ depth: A.d + bias, svg: `<circle cx="${f1(A.X)}" cy="${f1(A.Y)}" r="${r}" fill="${fill}" stroke="${stroke}" stroke-width="1.5"/>` });
  };
  const label = (p: V3, t: string, fill: string, size = 11, weight = 600) => {
    const A = P(p);
    items.push({ depth: -1e9, svg: `<text x="${f1(A.X)}" y="${f1(A.Y - 4)}" font-size="${size}" fill="${fill}" font-weight="${weight}" text-anchor="middle" paint-order="stroke" stroke="${th.bg}" stroke-width="3">${esc(t)}</text>` });
  };
  /** prisma vertical de base poligonal */
  const prism = (base: Pt[], z0: number, z1: number, fill: string, fop: number, stroke: string, sop: number) => {
    const n = base.length;
    for (let i = 0; i < n; i++) {
      const p = base[i], q = base[(i + 1) % n];
      face([{ x: p.x, y: p.y, z: z0 }, { x: q.x, y: q.y, z: z0 }, { x: q.x, y: q.y, z: z1 }, { x: p.x, y: p.y, z: z1 }], fill, fop, stroke, n > 16 ? 0 : sop, 1);
    }
    face(base.map((p) => ({ x: p.x, y: p.y, z: z0 })), fill, fop, stroke, sop, 1);
    face(base.map((p) => ({ x: p.x, y: p.y, z: z1 })), fill, fop, stroke, sop, 1);
  };

  // concreto
  if (showConc) {
    prism(res.capPoly, 0, h, th.concrete, 0.13, th.concreteStroke, 0.55);
    const circ = inp.pile.kind === 'hpile' || (inp.pile.kind === 'concrete' && inp.pile.shape === 'square') ? null : regularPolygon(20, Dp / 2);
    for (const q of res.pts) {
      const base = circ ? circ.map((t) => ({ x: t.x + q.x, y: t.y + q.y })) : [{ x: q.x - Dp / 2, y: q.y - Dp / 2 }, { x: q.x + Dp / 2, y: q.y - Dp / 2 }, { x: q.x + Dp / 2, y: q.y + Dp / 2 }, { x: q.x - Dp / 2, y: q.y + Dp / 2 }];
      prism(base, -pileStub, 0, th.concrete, 0.3, th.concreteStroke, 0.5);
    }
    for (const c of res.cols) prism(c.poly, h, h + colH, th.col, 0.32, th.ink, 0.6);
  }

  const zT = stm.hTie, zN = stm.hNode;
  const maxC = Math.max(...stm.struts.map((q) => q.C), 1);
  const strutCol = th.concreteStroke;
  const over = th.bg === '#ffffff' ? '#e8590c' : '#ffa94d';
  // con muchos puntales solo se rotulan los más cargados
  const labelMin = stm.struts.length > 12 ? 0.35 * maxC : 0;
  // puntales
  for (const st of stm.struts) {
    const c0 = stm.cols[st.k], q = res.pts[st.i];
    const c = { x: c0.nx, y: c0.ny };
    const col = st.ratio > 1 ? over : strutCol;
    seg({ x: c.x, y: c.y, z: zN }, { x: q.x, y: q.y, z: zT }, col, 1.8 + (6 * st.C) / maxC, 'stroke-opacity="0.9"');
    if (labels && st.C >= labelMin) label({ x: c.x + 0.55 * (q.x - c.x), y: c.y + 0.55 * (q.y - c.y), z: zN + 0.55 * (zT - zN) }, o.fmt.n('force', st.C, 0), col, 10.5);
  }
  // tirantes inferiores entre pilotes (en compresión: puntal inferior, discontinuo)
  for (const t of stm.ties) {
    const p1 = { x: res.pts[t.a].x, y: res.pts[t.a].y, z: zT }, p2 = { x: res.pts[t.b].x, y: res.pts[t.b].y, z: zT };
    const tens = t.F > 0;
    const col = t.ratio > 1 ? over : tens ? th.rebar : strutCol;
    seg(p1, p2, col, 3.4, tens ? '' : 'stroke-dasharray="8 5"', -0.01);
    if (labels) label({ x: (p1.x + p2.x) / 2, y: (p1.y + p2.y) / 2, z: zT }, `${tens ? 'T' : 'C'} ${o.fmt.n('force', Math.abs(t.F), 0)}`, col, 11, 700);
  }
  // cordones superiores entre columnas
  for (const tc of stm.topChords) {
    const A = { x: stm.cols[tc.a].nx, y: stm.cols[tc.a].ny }, B = { x: stm.cols[tc.b].nx, y: stm.cols[tc.b].ny };
    const tens = tc.F > 0;
    const col = tc.ratio > 1 ? over : tens ? th.rebar : strutCol;
    seg({ x: A.x, y: A.y, z: zN }, { x: B.x, y: B.y, z: zN }, col, 3.2, tens ? '' : 'stroke-dasharray="8 5"', -0.01);
    if (labels) label({ x: (A.x + B.x) / 2, y: (A.y + B.y) / 2, z: zN }, `${tens ? 'T' : 'C'} sup. ${o.fmt.n('force', Math.abs(tc.F), 0)}`, col, 11, 700);
  }
  // nudos
  res.pts.forEach((q, i) => {
    dot({ x: q.x, y: q.y, z: zT }, 4.5, th.rebar);
    if (labels) label({ x: q.x, y: q.y, z: -0.35 * pileStub }, `P${i + 1}`, th.muted, 10.5, 700);
  });
  stm.cols.forEach((c) => {
    dot({ x: c.nx, y: c.ny, z: zN }, 5.5, th.ink, th.bg);
    if (labels) label({ x: c.x, y: c.y, z: h + colH + 0.08 }, `${c.name} · Pu ${o.fmt.n('force', c.P, 0)}`, th.ink, 11, 700);
  });

  // ejes de referencia
  const L = Math.max(res.capRect.B, res.capRect.L) * 0.18;
  const o0 = { x: res.capRect.x0 - 0.15 * L, y: res.capRect.y0 - 0.15 * L, z: 0 };
  const axes: [V3, string][] = [[{ x: o0.x + L, y: o0.y, z: 0 }, 'x'], [{ x: o0.x, y: o0.y + L, z: 0 }, 'y'], [{ x: o0.x, y: o0.y, z: L }, 'z']];
  for (const [p, n] of axes) {
    seg(o0, p, th.muted, 1.4, '', 1e6);
    const A = P(p);
    if (Math.hypot(A.X - P(o0).X, A.Y - P(o0).Y) > 6) items.push({ depth: -1e9, svg: `<text x="${f1(A.X + 3)}" y="${f1(A.Y - 3)}" font-size="11" fill="${th.muted}">${n}</text>` });
  }

  items.sort((p, q) => q.depth - p.depth);
  let g = items.map((it) => it.svg).join('');
  if (o.title !== false) {
    g += `<text x="12" y="20" font-size="12.5" fill="${th.muted}">${esc(`Modelo 3D de puntales y tirantes — ${stm.combo}${stm.deep ? '' : ' (cabezal no profundo: informativo)'}`)}</text>`;
    const lg = (x: number, col: string, dash: string, t: string) => `<line x1="${x}" y1="${H - 18}" x2="${x + 26}" y2="${H - 18}" stroke="${col}" stroke-width="3.4" ${dash}/><text x="${x + 32}" y="${H - 14}" font-size="11" fill="${th.ink}">${t}</text>`;
    g += lg(12, strutCol, '', 'Puntal (compresión)') + lg(170, th.rebar, '', 'Tirante (tracción)') + lg(318, over, '', 'Sobreesforzado (relación > 1)');
    if (stm.topChords.length || stm.ties.some((t) => t.F < 0)) g += lg(540, strutCol, 'stroke-dasharray="8 5"', 'Puntal horizontal (cordón)');
  }
  return svgWrap(W, H, g, th.bg);
}
