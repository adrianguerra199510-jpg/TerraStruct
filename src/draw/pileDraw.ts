import { PileInput } from '../core/pileTypes';
import { PileResults, ComboRes } from '../core/pile';
import { columnPoly } from '../core/shapes';
import { findBar } from '../core/materials';
import { hpShape } from '../core/pileStruct';
import { Fmt } from '../core/units';
import { Pt } from '../core/geometry';
import { Theme, LIGHT, dimLine, line, poly, svgWrap, text, niceStep } from './svg';
import { makePlanView, PlanView } from './footingDraw';
import { lineSpan } from '../core/pileCap';

export function pilePlanPoints(inp: PileInput, res: PileResults): Pt[] {
  return [...res.capPoly, ...columnPoly(inp.column.geom, inp.column.x, inp.column.y)];
}

const pathOf = (res: PileResults, view: PlanView) => res.capPoly.map((q) => { const t = view.toSvg(q.x, q.y); return `${t.x.toFixed(1)},${t.y.toFixed(1)}`; }).join(' ');

function pileGlyph(inp: PileInput, res: PileResults, view: PlanView, c: Pt, th: Theme, fill: string): string {
  const p = inp.pile;
  const s = view.s;
  const q = view.toSvg(c.x, c.y);
  const stroke = th.concreteStroke;
  if (p.kind === 'concrete') {
    if (p.shape === 'circle') return `<circle cx="${q.x.toFixed(1)}" cy="${q.y.toFixed(1)}" r="${((p.D / 2) * s).toFixed(1)}" fill="${fill}" stroke="${stroke}" stroke-width="1.6"/>`;
    const h = (p.D / 2) * s;
    return `<rect x="${(q.x - h).toFixed(1)}" y="${(q.y - h).toFixed(1)}" width="${(2 * h).toFixed(1)}" height="${(2 * h).toFixed(1)}" fill="${fill}" stroke="${stroke}" stroke-width="1.6"/>`;
  }
  if (p.kind === 'pipe') {
    const ro = (p.D / 2) * s, ri = Math.max(((p.D - 2 * p.t) / 2) * s, 1);
    return `<circle cx="${q.x.toFixed(1)}" cy="${q.y.toFixed(1)}" r="${ro.toFixed(1)}" fill="${fill}" stroke="${stroke}" stroke-width="1.6"/><circle cx="${q.x.toFixed(1)}" cy="${q.y.toFixed(1)}" r="${ri.toFixed(1)}" fill="${th.bg}" stroke="${stroke}" stroke-width="1"/><circle cx="${q.x.toFixed(1)}" cy="${q.y.toFixed(1)}" r="${ro.toFixed(1)}" fill="none" stroke="${stroke}" stroke-width="3"/>`;
  }
  const h = hpShape(p.hp);
  const d = h.d * 0.0254 * s, bf = h.bf * 0.0254 * s, tf = h.tf * 0.0254 * s, tw = h.tw * 0.0254 * s;
  // eje débil: el alma queda paralela a x (la flexión es en y); eje fuerte: alma paralela a y
  const weak = p.axis === 'weak';
  const W = weak ? bf : d, Hh = weak ? d : bf;
  void W; void Hh;
  const rect = (x: number, y: number, w: number, hh: number) => `<rect x="${(q.x + x).toFixed(1)}" y="${(q.y + y).toFixed(1)}" width="${w.toFixed(1)}" height="${hh.toFixed(1)}" fill="${stroke}"/>`;
  return weak
    ? rect(-d / 2, -bf / 2, tf, bf) + rect(d / 2 - tf, -bf / 2, tf, bf) + rect(-d / 2, -tw / 2, d, tw)
    : rect(-bf / 2, -d / 2, bf, tf) + rect(-bf / 2, d / 2 - tf, bf, tf) + rect(-tw / 2, -d / 2, tw, d);
}

export function pilePlanSvg(inp: PileInput, res: PileResults, o: { W?: number; H?: number; theme?: Theme; fmt: Fmt; combo?: ComboRes | null; view?: PlanView; showDims?: boolean; showLoads?: boolean }): string {
  const W = o.W ?? 760, H = o.H ?? 540;
  const th = o.theme ?? LIGHT;
  const view = o.view ?? makePlanView(pilePlanPoints(inp, res), W, H, 62);
  const r = res.capRect;
  const A = view.toSvg(r.x0, r.y1), B = view.toSvg(r.x1, r.y0);
  let s = '';
  const st = niceStep(Math.max(r.B, r.L), 10);
  for (let x = Math.ceil((r.x0 - 1) / st) * st; x <= r.x1 + 1; x += st) {
    const a = view.toSvg(x, r.y0 - 1), b = view.toSvg(x, r.y1 + 1);
    s += line(a.x, a.y, b.x, b.y, th.grid, 1);
  }
  s += `<polygon points="${pathOf(res, view)}" fill="${th.concrete}" fill-opacity="0.55" stroke="${th.concreteStroke}" stroke-width="2" stroke-linejoin="round"/>`;
  const combo = o.combo ?? null;
  const Rs = combo?.R ?? [];
  const rmax = Math.max(...Rs.map((v) => Math.abs(v)), 1e-9);
  res.pts.forEach((p, i) => {
    const v = Rs[i];
    const t = v === undefined ? 0 : Math.max(0, Math.min(1, v / (res.QaCeff * (combo!.combo.qaFactor || 1))));
    const fill = v === undefined ? th.concrete : v < 0 ? th.water : `hsl(${(120 - 120 * Math.min(t, 1)).toFixed(0)},62%,${th.bg === '#ffffff' ? 70 : 42}%)`;
    s += pileGlyph(inp, res, view, p, th, fill);
    const q = view.toSvg(p.x, p.y);
    s += text(q.x, q.y + 4, String(i + 1), { size: 12, fill: th.ink, anchor: 'middle', weight: 700, halo: th.bg });
    if (v !== undefined) s += text(q.x, q.y + (inp.pile.D * view.s) / 2 + 15, `${o.fmt.n('force', v, 0)}`, { size: 11, fill: v < 0 ? th.water : th.ink, anchor: 'middle', weight: 600, halo: th.bg });
  });
  void rmax;
  const cp = columnPoly(inp.column.geom, inp.column.x, inp.column.y).map((p) => view.toSvg(p.x, p.y));
  s += poly(cp, th.col, th.ink, 1.4, 'fill-opacity="0.85"');
  if (o.showDims !== false) {
    s += dimLine(A.x, B.y, B.x, B.y, `${o.fmt.n('len', r.B, 2)} ${o.fmt.l('len')}`, th.dim, 26);
    s += dimLine(A.x, B.y, A.x, A.y, `${o.fmt.n('len', r.L, 2)} ${o.fmt.l('len')}`, th.dim, 28, 11, -1);
  }
  if (combo) s += text(10, 18, `Reacciones por pilote (${o.fmt.l('force')}) — ${combo.combo.name}`, { size: 12, fill: th.muted });
  s += text(W - 10, 18, 'x →', { size: 11, fill: th.muted, anchor: 'end' }) + text(W - 10, 34, 'y ↑', { size: 11, fill: th.muted, anchor: 'end' });
  return svgWrap(W, H, s, th.bg);
}

export function pileRebarPlanSvg(inp: PileInput, res: PileResults, o: { W?: number; H?: number; theme?: Theme; fmt: Fmt; layer?: 'bottom' | 'top' }): string {
  const W = o.W ?? 760, H = o.H ?? 540;
  const th = o.theme ?? LIGHT;
  const view = makePlanView(pilePlanPoints(inp, res), W, H, 62);
  const r = res.capRect;
  const A = view.toSvg(r.x0, r.y1), B = view.toSvg(r.x1, r.y0);
  const top = o.layer === 'top';
  let s = `<polygon points="${pathOf(res, view)}" fill="${th.concrete}" fill-opacity="0.35" stroke="${th.concreteStroke}" stroke-width="2" stroke-linejoin="round"/>`;
  res.pts.forEach((p) => {
    const q = view.toSvg(p.x, p.y);
    s += `<circle cx="${q.x.toFixed(1)}" cy="${q.y.toFixed(1)}" r="${((res.props.Dp / 2) * view.s).toFixed(1)}" fill="none" stroke="${th.muted}" stroke-dasharray="4 3"/>`;
  });
  const cv = inp.cap.cover;
  const f = top ? { x: res.flexX?.top, y: res.flexY?.top } : { x: res.flexX, y: res.flexY };
  const drawBars = (axis: 'x' | 'y', spacing: number, label: string) => {
    const lo = axis === 'x' ? r.y0 + cv : r.x0 + cv, hi = axis === 'x' ? r.y1 - cv : r.x1 - cv;
    const n = Math.max(Math.floor((hi - lo) / spacing + 1e-9), 1);
    const used = (n - 1) * spacing;
    const start = (lo + hi) / 2 - used / 2;
    let out = '';
    for (let k = 0; k < n; k++) {
      const v = start + k * spacing;
      const sp = lineSpan(res.capPoly, axis, v, axis === 'x' ? (r.x0 + r.x1) / 2 : (r.y0 + r.y1) / 2);
      if (sp[1] - sp[0] < 2 * cv) continue;
      const a = axis === 'x' ? view.toSvg(sp[0] + cv, v) : view.toSvg(v, sp[0] + cv);
      const b = axis === 'x' ? view.toSvg(sp[1] - cv, v) : view.toSvg(v, sp[1] - cv);
      out += line(a.x, a.y, b.x, b.y, axis === 'x' ? th.rebar : th.accent, 1.6);
    }
    const m = axis === 'x' ? view.toSvg(r.x1, (r.y0 + r.y1) / 2) : view.toSvg((r.x0 + r.x1) / 2, r.y1);
    out += axis === 'x' ? text(m.x + 8, m.y, label, { size: 11.5, fill: th.rebar, weight: 600 }) : text(m.x, m.y - 10, label, { size: 11.5, fill: th.accent, weight: 600, anchor: 'middle' });
    return out;
  };
  if (f.x) s += drawBars('x', (f.x as any).det?.spacing ?? (f.x as any).spacing ?? 0.2, `${(f.x as any).det?.text ?? ''} (X)`);
  if (f.y) s += drawBars('y', (f.y as any).det?.spacing ?? 0.2, `${(f.y as any).det?.text ?? ''} (Y)`);
  s += dimLine(A.x, B.y, B.x, B.y, `${o.fmt.n('len', r.B, 2)} ${o.fmt.l('len')}`, th.dim, 22);
  s += text(10, 18, top ? 'Parrilla superior' : 'Parrilla inferior', { size: 12, fill: th.muted });
  return svgWrap(W, H, s, th.bg);
}

export function pileSectionSvg(inp: PileInput, res: PileResults, o: { W?: number; H?: number; theme?: Theme; fmt: Fmt }): string {
  const W = o.W ?? 820, H = o.H ?? 520;
  const th = o.theme ?? LIGHT;
  const r = { x0: res.spanX[0], x1: res.spanX[1], B: res.spanX[1] - res.spanX[0] };
  const p = inp.pile;
  const cap = inp.cap;
  const Lshow = Math.min(p.L, Math.max(5 * res.props.Dp, 4));
  const colH = Math.max(0.6, cap.h * 0.7);
  const totH = colH + cap.h + Lshow + 0.6;
  const s = Math.min((W - 130) / (r.B + 1.2), (H - 70) / totH);
  const ox = (W - r.B * s) / 2;
  const yTopCol = 30;
  const X = (x: number) => ox + (x - r.x0) * s;
  const yCapTop = yTopCol + colH * s;
  const yCapBot = yCapTop + cap.h * s;
  const yTip = yCapBot + Lshow * s;
  let g = '';
  // estratos
  const ground = yCapBot - inp.geo.Df * s;
  g += `<rect x="${(X(r.x0) - 60).toFixed(1)}" y="${Math.max(ground, yTopCol).toFixed(1)}" width="${(r.B * s + 120).toFixed(1)}" height="${(yTip + 40 - Math.max(ground, yTopCol)).toFixed(1)}" fill="${th.soil}" fill-opacity="0.35"/>`;
  g += line(X(r.x0) - 60, ground, X(r.x1) + 60, ground, th.soilStroke, 1.6);
  if (inp.geo.mode === 'static') {
    let z = 0;
    for (const l of inp.geo.layers) {
      z += l.thk;
      const y = yCapBot + z * s;
      if (y < yTip + 40) {
        g += line(X(r.x0) - 60, y, X(r.x1) + 60, y, th.soilStroke, 1, '6 4');
        g += text(X(r.x1) + 64, y - 4, l.name, { size: 10.5, fill: th.muted });
      }
    }
  }
  // pilotes (sección por el eje, x)
  const pw = res.props.Dp * s;
  for (const q of res.pts) {
    const x = X(q.x - res.props.Dp / 2);
    g += `<rect x="${x.toFixed(1)}" y="${yCapBot.toFixed(1)}" width="${pw.toFixed(1)}" height="${(Lshow * s).toFixed(1)}" fill="${th.concrete}" stroke="${th.concreteStroke}" stroke-width="1.4"/>`;
    // interrupción
    g += line(x - 3, yTip - 6, x + pw + 3, yTip + 2, th.bg, 5);
  }
  // cabezal y columna
  g += `<rect x="${X(r.x0).toFixed(1)}" y="${yCapTop.toFixed(1)}" width="${(r.B * s).toFixed(1)}" height="${(cap.h * s).toFixed(1)}" fill="${th.concrete}" stroke="${th.concreteStroke}" stroke-width="2"/>`;
  const cb = columnPoly(inp.column.geom, inp.column.x, inp.column.y);
  const cx0 = Math.min(...cb.map((v) => v.x)), cx1 = Math.max(...cb.map((v) => v.x));
  g += `<rect x="${X(cx0).toFixed(1)}" y="${yTopCol.toFixed(1)}" width="${((cx1 - cx0) * s).toFixed(1)}" height="${(colH * s).toFixed(1)}" fill="${th.col}" fill-opacity="0.85" stroke="${th.ink}"/>`;
  // acero inferior
  const bd = findBar(cap.barX).db / 1000;
  const yb = yCapBot - cap.cover - bd / 2;
  g += line(X(r.x0 + cap.cover), yb, X(r.x1 - cap.cover), yb, th.rebar, Math.max(2.2, bd * s));
  if (cap.topSteel) g += line(X(r.x0 + cap.cover), yCapTop + cap.cover * s + 2, X(r.x1 - cap.cover), yCapTop + cap.cover * s + 2, th.rebar, 2);
  if (res.flexX) g += text(X(r.x0) + 6, yCapBot - 8 - 12, `Inf.: ${res.flexX.det.text}`, { size: 11, fill: th.rebar, weight: 600 });
  // cotas
  g += dimLine(X(r.x1) + 24, yCapTop, X(r.x1) + 24, yCapBot, `${o.fmt.n('len', cap.h, 2)}`, th.dim, 0, 11);
  g += dimLine(X(r.x0), yCapBot + 4, X(r.x1), yCapBot + 4, `${o.fmt.n('len', r.B, 2)} ${o.fmt.l('len')}`, th.dim, 20 + Lshow * s * 0 + 0);
  g += dimLine(X(r.x0) - 34, yCapBot, X(r.x0) - 34, yTip, `L = ${o.fmt.n('len', p.L, 1)} ${o.fmt.l('len')}`, th.dim, 0, 11);
  g += text(X(r.x0), 18, `Sección en X — ${res.props.label}`, { size: 12, fill: th.muted });
  return svgWrap(W, H, g, th.bg);
}

// ---------------------------------------------------------------- puntales y tirantes
import { StmResult } from '../core/pileSTM';
import { arrow, lineChart } from './svg';

/** Elevación del modelo de puntales y tirantes proyectado sobre el eje indicado. */
export function pileStmElevationSvg(inp: PileInput, res: PileResults, o: { axis: 'x' | 'y'; W?: number; H?: number; theme?: Theme; fmt: Fmt }): string {
  const stm = res.stm as StmResult;
  const W = o.W ?? 820, H = o.H ?? 470;
  const th = o.theme ?? LIGHT;
  const ax = o.axis;
  const sp = ax === 'x' ? res.spanX : res.spanY;
  const lo = sp[0], hi = sp[1];
  const cap = inp.cap;
  const colPoly = columnPoly(inp.column.geom, inp.column.x, inp.column.y);
  const cc = ax === 'x' ? colPoly.reduce((s, q) => s + q.x, 0) / colPoly.length : colPoly.reduce((s, q) => s + q.y, 0) / colPoly.length;
  const colMin = Math.min(...colPoly.map((q) => (ax === 'x' ? q.x : q.y))), colMax = Math.max(...colPoly.map((q) => (ax === 'x' ? q.x : q.y)));
  const span = hi - lo;
  const s = Math.min((W - 150) / span, (H - 150) / (cap.h + 0.8));
  const ox = (W - span * s) / 2;
  const X = (v: number) => ox + (v - lo) * s;
  const yBot = H - 100;
  const Y = (hh: number) => yBot - hh * s;
  let g = '';
  g += `<rect x="${X(lo).toFixed(1)}" y="${Y(cap.h).toFixed(1)}" width="${(span * s).toFixed(1)}" height="${(cap.h * s).toFixed(1)}" fill="${th.concrete}" fill-opacity="0.5" stroke="${th.concreteStroke}" stroke-width="2"/>`;
  g += `<rect x="${X(colMin).toFixed(1)}" y="${(Y(cap.h) - 50).toFixed(1)}" width="${((colMax - colMin) * s).toFixed(1)}" height="50" fill="${th.col}" fill-opacity="0.85" stroke="${th.ink}"/>`;
  // pilotes (agrupados por coordenada proyectada)
  const groups = new Map<number, { v: number; idx: number[] }>();
  res.pts.forEach((q, i) => {
    const v = ax === 'x' ? q.x : q.y;
    const k = Math.round(v * 20);
    const gr = groups.get(k) ?? { v, idx: [] };
    gr.idx.push(i);
    groups.set(k, gr);
  });
  const pw = res.props.Dp * s;
  for (const gr of groups.values()) g += `<rect x="${(X(gr.v) - pw / 2).toFixed(1)}" y="${yBot.toFixed(1)}" width="${pw.toFixed(1)}" height="46" fill="${th.concrete}" stroke="${th.concreteStroke}" stroke-dasharray="3 3"/>`;
  // nodos
  const zT = stm.hTie;
  const zN = stm.hNode;
  const maxC = Math.max(...stm.struts.map((q) => q.C), 1);
  const nodeTop = { x: X(cc), y: Y(zN) };
  for (const gr of groups.values()) {
    const sts = gr.idx.map((i) => stm.struts[i]);
    const C = Math.max(...sts.map((q) => q.C));
    const ratio = Math.max(...sts.map((q) => q.ratio));
    const pn = { x: X(gr.v), y: Y(zT) };
    const col = ratio > 1 ? th.bad : th.concreteStroke;
    g += line(nodeTop.x, nodeTop.y, pn.x, pn.y, col, 2 + (6 * C) / maxC);
    const mx = (nodeTop.x + pn.x) / 2, my = (nodeTop.y + pn.y) / 2;
    g += text(mx + (pn.x >= nodeTop.x ? 8 : -8), my - 4, `C = ${o.fmt.n('force', C, 0)}${gr.idx.length > 1 ? ` (×${gr.idx.length})` : ''}`, { size: 11, fill: col, weight: 600, anchor: pn.x >= nodeTop.x ? 'start' : 'end', halo: th.bg });
    g += `<circle cx="${pn.x.toFixed(1)}" cy="${pn.y.toFixed(1)}" r="5" fill="${th.rebar}"/>`;
  }
  // tirante
  const xsAll = [...groups.values()].map((q) => q.v);
  const t = ax === 'x' ? stm.tieX : stm.tieY;
  g += line(X(Math.min(...xsAll)), Y(zT), X(Math.max(...xsAll)), Y(zT), th.rebar, 3.2);
  g += text(X((Math.min(...xsAll) + Math.max(...xsAll)) / 2), yBot + 84, `Tirante T = ${o.fmt.n('force', t.T, 0)} ${o.fmt.l('force')}  (As req = ${t.AsReq.toFixed(1)} cm²)`, { size: 12, fill: th.rebar, weight: 700, anchor: 'middle' });
  g += `<circle cx="${nodeTop.x.toFixed(1)}" cy="${nodeTop.y.toFixed(1)}" r="6" fill="${th.ink}"/>`;
  g += text(nodeTop.x + 10, nodeTop.y - 6, `Nodo superior (prof. ${o.fmt.n('len', stm.ay, 2)} m)`, { size: 11, fill: th.ink, halo: th.bg });
  g += dimLine(X(hi) + 20, Y(zN), X(hi) + 20, Y(zT), `z = ${o.fmt.n('len', stm.z, 2)}`, th.dim, 0, 11);
  g += dimLine(X(lo), yBot + 56, X(hi), yBot + 56, `${o.fmt.n('len', span, 2)} ${o.fmt.l('len')}`, th.dim, 0);
  g += arrow(nodeTop.x, Y(cap.h) - 70, nodeTop.x, Y(cap.h) - 52, th.accent, 2.4, 9);
  g += text(nodeTop.x + 10, Y(cap.h) - 58, `Pu = ${o.fmt.n('force', Math.max(0, ...res.ultimate.map((q) => q.combo.P)), 0)}`, { size: 11, fill: th.accent, weight: 700 });
  g += text(12, 20, `Modelo de puntales y tirantes — eje ${ax.toUpperCase()} — ${stm.combo}${stm.deep ? '' : ' (cabezal no profundo: informativo)'}`, { size: 12.5, fill: th.muted });
  return svgWrap(W, H, g, th.bg);
}

/** Planta del modelo: puntales de la columna a cada pilote y tirantes por bandas. */
export function pileStmPlanSvg(inp: PileInput, res: PileResults, o: { W?: number; H?: number; theme?: Theme; fmt: Fmt }): string {
  const stm = res.stm as StmResult;
  const W = o.W ?? 820, H = o.H ?? 560;
  const th = o.theme ?? LIGHT;
  const view = makePlanView(pilePlanPoints(inp, res), W, H, 70);
  let g = `<polygon points="${pathOf(res, view)}" fill="${th.concrete}" fill-opacity="0.3" stroke="${th.concreteStroke}" stroke-width="2" stroke-linejoin="round"/>`;
  const colPoly = columnPoly(inp.column.geom, inp.column.x, inp.column.y);
  const cx = colPoly.reduce((s, q) => s + q.x, 0) / colPoly.length, cy = colPoly.reduce((s, q) => s + q.y, 0) / colPoly.length;
  const cs = view.toSvg(cx, cy);
  const maxC = Math.max(...stm.struts.map((q) => q.C), 1);
  // tirantes
  for (const t of [stm.tieX, stm.tieY]) {
    for (const b of t.bands) {
      const idx = res.pts.map((q, i) => ({ v: t.axis === 'x' ? q.y : q.x, i })).filter((q) => Math.abs(q.v - b.pos) <= 0.5 * res.props.Dp + 1e-6).map((q) => q.i);
      const ps = idx.map((i) => res.pts[i]);
      if (ps.length < 2) continue;
      const a1 = ps.reduce((m, q) => (t.axis === 'x' ? (q.x < m.x ? q : m) : q.y < m.y ? q : m));
      const a2 = ps.reduce((m, q) => (t.axis === 'x' ? (q.x > m.x ? q : m) : q.y > m.y ? q : m));
      const p1 = view.toSvg(a1.x, a1.y), p2 = view.toSvg(a2.x, a2.y);
      g += line(p1.x, p1.y, p2.x, p2.y, th.rebar, 3.2);
      g += text((p1.x + p2.x) / 2, (p1.y + p2.y) / 2 - 8 - (t.axis === 'y' ? 0 : 0), `T ${t.axis} = ${o.fmt.n('force', b.T, 0)}`, { size: 11, fill: th.rebar, weight: 700, anchor: 'middle', halo: th.bg, rotate: t.axis === 'y' ? -90 : 0 });
    }
  }
  // puntales
  stm.struts.forEach((st) => {
    const q = res.pts[st.i];
    const p = view.toSvg(q.x, q.y);
    const col = st.ratio > 1 ? th.bad : th.concreteStroke;
    g += line(cs.x, cs.y, p.x, p.y, col, 1.6 + (5 * st.C) / maxC, '7 4');
    g += text((cs.x + p.x) / 2, (cs.y + p.y) / 2 - 5, `${o.fmt.n('force', st.C, 0)}`, { size: 11, fill: col, weight: 600, anchor: 'middle', halo: th.bg });
  });
  res.pts.forEach((q, i) => {
    const p = view.toSvg(q.x, q.y);
    g += `<circle cx="${p.x.toFixed(1)}" cy="${p.y.toFixed(1)}" r="${((res.props.Dp / 2) * view.s).toFixed(1)}" fill="${th.concrete}" fill-opacity="0.8" stroke="${th.concreteStroke}" stroke-width="1.5"/>`;
    g += text(p.x, p.y + 4, String(i + 1), { size: 12, fill: th.ink, anchor: 'middle', weight: 700 });
  });
  g += poly(colPoly.map((q) => view.toSvg(q.x, q.y)), th.col, th.ink, 1.4, 'fill-opacity="0.85"');
  g += `<circle cx="${cs.x.toFixed(1)}" cy="${cs.y.toFixed(1)}" r="5" fill="${th.bg}" stroke="${th.ink}" stroke-width="2"/>`;
  g += text(12, 20, `Planta del modelo — puntales (discontinuo, ${o.fmt.l('force')}) y tirantes (rojo) — ${stm.combo}`, { size: 12.5, fill: th.muted });
  return svgWrap(W, H, g, th.bg);
}

// ---------------------------------------------------------------- suelo: perfil, licuación y asentamiento
/** Perfil estratigráfico con el pilote, la zona de fricción negativa, el plano neutro y los estratos licuables. */
export function pileProfileSvg(inp: PileInput, res: PileResults, o: { W?: number; H?: number; theme?: Theme; fmt: Fmt }): string {
  const W = o.W ?? 640, H = o.H ?? 520;
  const th = o.theme ?? LIGHT;
  const g0 = inp.geo;
  const p = inp.pile;
  const layers = g0.layers;
  const total = Math.max(layers.reduce((s, l) => s + l.thk, 0), p.L) + g0.Df;
  const top = 36, bot = H - 24;
  const sy = (bot - top) / total;
  const Y = (zg: number) => top + zg * sy; // zg desde el terreno
  const x0 = 110, x1 = W - 190;
  let s = '';
  const palette = ['#e9c58f', '#cfd9a8', '#b8c9dd', '#d9b8a0', '#c4b8d9'];
  const rockFill = '#9aa3ad';
  let z = 0;
  layers.forEach((l, i) => {
    const za = g0.Df + z, zb = g0.Df + z + l.thk;
    const liq = res.liq.enabled && res.liq.liquefied[i];
    s += `<rect x="${x0}" y="${Y(za).toFixed(1)}" width="${x1 - x0}" height="${((zb - za) * sy).toFixed(1)}" fill="${l.kind === 'rock' ? rockFill : palette[i % palette.length]}" fill-opacity="0.8" stroke="${th.soilStroke}"/>`;
    if (liq) s += `<rect x="${x0}" y="${Y(za).toFixed(1)}" width="${x1 - x0}" height="${((zb - za) * sy).toFixed(1)}" fill="${th.water}" fill-opacity="0.35"/>`;
    s += text(x1 + 8, Y(za) + 14, `${l.name}${liq ? ' — LICUA' : ''}`, { size: 11, fill: liq ? th.bad : th.ink, weight: liq ? 700 : 500 });
    s += text(x1 + 8, Y(za) + 28, `${l.kind === 'rock' ? `roca qu = ${l.qu} MPa · RQD ${l.rqd}%` : l.kind === 'cohesive' ? `su = ${o.fmt.n('press', l.su, 0)}` : l.kind === 'granular' ? `φ = ${l.phi}°` : `fs = ${o.fmt.n('press', l.fs, 0)}`}${l.downdrag ? ' · arrastre' : ''}`, { size: 10.5, fill: th.muted });
    z += l.thk;
  });
  s += line(x0 - 20, Y(0), x1, Y(0), th.soilStroke, 2);
  s += text(x0 - 24, Y(0) - 4, 'Terreno', { size: 10.5, fill: th.muted, anchor: 'end' });
  if (g0.liqOn) {
    s += line(x0 - 20, Y(g0.gwt), x1, Y(g0.gwt), th.water, 1.6, '6 4');
    s += text(x0 - 24, Y(g0.gwt) + 4, 'N.F.', { size: 10.5, fill: th.water, anchor: 'end', weight: 600 });
  }
  // cabezal y pilote
  const pxc = (x0 + x1) / 2;
  const pw = 26;
  s += `<rect x="${pxc - 50}" y="${Y(0).toFixed(1)}" width="100" height="${(Y(g0.Df) - Y(0)).toFixed(1)}" fill="${th.concrete}" stroke="${th.concreteStroke}" stroke-width="1.6"/>`;
  s += `<rect x="${pxc - pw / 2}" y="${Y(g0.Df).toFixed(1)}" width="${pw}" height="${(p.L * sy).toFixed(1)}" fill="${th.concrete}" stroke="${th.concreteStroke}" stroke-width="2"/>`;
  // plano neutro y arrastre
  if (res.geo.Qneg > 0) {
    const zn = g0.Df + g0.neutralFrac * p.L;
    s += line(x0, Y(zn), x1, Y(zn), th.bad, 1.6, '7 4');
    s += text(x0 + 4, Y(zn) - 4, `Plano neutro (${(g0.neutralFrac * 100).toFixed(0)}% L)`, { size: 10.5, fill: th.bad, weight: 600 });
    let zz = 0;
    layers.forEach((l) => {
      const za = g0.Df + zz, zb = Math.min(g0.Df + zz + l.thk, zn);
      if (l.downdrag && zb > za) {
        for (let y = za + 0.4; y < zb; y += 0.8) s += arrow(pxc - pw / 2 - 18, Y(y) - 8, pxc - pw / 2 - 18, Y(y) + 8, th.bad, 2, 7);
        s += text(pxc - pw / 2 - 26, (Y(za) + Y(zb)) / 2, `Qneg`, { size: 10.5, fill: th.bad, anchor: 'end', weight: 700 });
      }
      zz += l.thk;
    });
  }
  s += dimLine(x0 - 52, Y(g0.Df), x0 - 52, Y(g0.Df + p.L), `L = ${o.fmt.n('len', p.L, 1)}`, th.dim, 0, 11);
  s += text(12, 20, 'Perfil geotécnico y pilote', { size: 12.5, fill: th.muted });
  return svgWrap(W, H, s, th.bg);
}

export function liquefactionChartSvg(res: PileResults, o: { W?: number; H?: number; theme?: Theme }): string {
  const th = o.theme ?? LIGHT;
  const pr = res.liq.profile;
  if (!pr.length) return svgWrap(o.W ?? 560, 60, text(12, 30, 'Licuación no evaluada.', { size: 12, fill: th.muted }), th.bg);
  const zmax = Math.max(...pr.map((q) => q.zGround));
  const xs = pr.map((q) => Math.min(q.FS, 4));
  return lineChart({
    w: o.W ?? 560, h: o.H ?? 420, theme: th, xLabel: 'Factor de seguridad FS (CRR·MSF/CSR)', yLabel: 'Profundidad desde el terreno (m)', invertY: true, zeroLine: false,
    title: 'Potencial de licuación', series: [
      { name: 'FS', xs, ys: pr.map((q) => q.zGround), color: th.concreteStroke },
      { name: 'FS = 1', xs: [1, 1], ys: [0, zmax], color: th.bad, dash: '5 4' },
    ],
  });
}

export function settlementChartSvg(res: PileResults, o: { W?: number; H?: number; theme?: Theme; fmt: Fmt }): string {
  const th = o.theme ?? LIGHT;
  const st = res.settle;
  if (!st || !st.group.slices.length) return svgWrap(o.W ?? 560, 60, text(12, 30, 'Sin datos de asentamiento.', { size: 12, fill: th.muted }), th.bg);
  const sl = st.group.slices;
  let acc = 0;
  const cum = sl.map((q) => (acc += q.dH * 1000));
  return lineChart({
    w: o.W ?? 560, h: o.H ?? 420, theme: th, xLabel: 'Asentamiento acumulado del grupo (mm)', yLabel: 'Profundidad bajo la zapata equivalente (m)', invertY: true, zeroLine: false,
    title: 'Asentamiento del grupo', series: [{ name: 'S acum.', xs: cum, ys: sl.map((q) => q.zBelow), color: th.accent }],
  });
}

// ---------------------------------------------------------------- diagramas de momento y cortante del cabezal
import { Diagram } from '../core/pileDiagram';

/** Diagrama de momento (kind = 'M') o de cortante (kind = 'V') del cabezal. Momentos dibujados del lado de la tracción (positivo = abajo). */
export function pileDiagramSvg(inp: PileInput, res: PileResults, dg: Diagram, o: { kind: 'M' | 'V'; W?: number; H?: number; theme?: Theme; fmt: Fmt; combo?: string | null }): string {
  const W = o.W ?? 820, H = o.H ?? 380;
  const th = o.theme ?? LIGHT;
  const isM = o.kind === 'M';
  const unitQ = isM ? 'moment' : 'force';
  const label = isM ? 'Momento' : 'Cortante';
  const m = { l: 64, r: 24, t: 74, b: 48 };
  const plotW = W - m.l - m.r;
  const strip = 38; // franja del cabezal sobre el diagrama
  const X = (v: number) => m.l + ((v - dg.lo) / Math.max(dg.hi - dg.lo, 1e-9)) * plotW;
  const series = dg.combos.map((c) => (isM ? c.M : c.V));
  const envMax = dg.s.map((_, k) => Math.max(0, ...series.map((a) => a[k])));
  const envMin = dg.s.map((_, k) => Math.min(0, ...series.map((a) => a[k])));
  const top = Math.max(...envMax, 1e-9), bot = Math.min(...envMin, -1e-9);
  const span = top - bot;
  const y0 = m.t + strip + 14;
  const hPlot = H - y0 - m.b;
  // convención: valores positivos hacia abajo (lado de la tracción inferior)
  const Ydraw = (v: number) => y0 + ((v - bot) / span) * hPlot; // abajo = positivo
  let s = '';
  // franja del cabezal con pilotes y columna
  s += `<rect x="${X(dg.lo).toFixed(1)}" y="${m.t - 6}" width="${plotW.toFixed(1)}" height="${strip}" fill="${th.concrete}" fill-opacity=".55" stroke="${th.concreteStroke}" stroke-width="1.6"/>`;
  dg.piles.forEach((p, i) => {
    s += `<rect x="${(X(p - res.props.Dp / 2)).toFixed(1)}" y="${m.t + strip - 6}" width="${(res.props.Dp / Math.max(dg.hi - dg.lo, 1e-9) * plotW).toFixed(1)}" height="14" fill="${th.concrete}" stroke="${th.concreteStroke}" stroke-dasharray="3 2"/>`;
    s += text(X(p), m.t + strip + 22, `P${i + 1}`, { size: 10, fill: th.muted, anchor: 'middle' });
  });
  s += `<rect x="${X(dg.face[0]).toFixed(1)}" y="${m.t - 24}" width="${((dg.face[1] - dg.face[0]) / Math.max(dg.hi - dg.lo, 1e-9) * plotW).toFixed(1)}" height="22" fill="${th.col}" fill-opacity=".85" stroke="${th.ink}"/>`;
  // cuadrícula y eje cero
  const step = niceStep(span, 5);
  for (let v = Math.ceil(bot / step) * step; v <= top + 1e-9; v += step) {
    s += line(m.l, Ydraw(v), W - m.r, Ydraw(v), th.grid, 1);
    s += text(m.l - 6, Ydraw(v) + 3.5, o.fmt.n(unitQ, v, 0), { size: 10.5, fill: th.muted, anchor: 'end' });
  }
  s += line(m.l, Ydraw(0), W - m.r, Ydraw(0), th.muted, 1.4);
  // caras de la columna
  for (const f of dg.face) s += line(X(f), m.t + strip + 8, X(f), H - m.b, th.accent, 1, '5 4');
  // envolvente (relleno)
  const ptsTop = dg.s.map((x, k) => `${X(x).toFixed(1)},${Ydraw(envMax[k]).toFixed(1)}`);
  const ptsBot = dg.s.map((x, k) => `${X(x).toFixed(1)},${Ydraw(envMin[k]).toFixed(1)}`).reverse();
  s += `<polygon points="${ptsTop.join(' ')} ${ptsBot.join(' ')}" fill="${th.concreteStroke}" fill-opacity="0.1"/>`;
  s += `<polyline points="${ptsTop.join(' ')}" fill="none" stroke="${th.concreteStroke}" stroke-width="2.2"/>`;
  s += `<polyline points="${dg.s.map((x, k) => `${X(x).toFixed(1)},${Ydraw(envMin[k]).toFixed(1)}`).join(' ')}" fill="none" stroke="${th.bad}" stroke-width="2.2"/>`;
  // combinación seleccionada
  const sel = o.combo ? dg.combos.find((c) => c.name === o.combo) : null;
  if (sel) s += `<polyline points="${dg.s.map((x, k) => `${X(x).toFixed(1)},${Ydraw((isM ? sel.M : sel.V)[k]).toFixed(1)}`).join(' ')}" fill="none" stroke="${th.accent}" stroke-width="2.6"/>`;
  else dg.combos.forEach((c) => (s += `<polyline points="${dg.s.map((x, k) => `${X(x).toFixed(1)},${Ydraw((isM ? c.M : c.V)[k]).toFixed(1)}`).join(' ')}" fill="none" stroke="${th.muted}" stroke-width="1" opacity=".55"/>`));
  // valores extremos
  const peak = (v: number, x: number, c: string) => `<circle cx="${X(x).toFixed(1)}" cy="${Ydraw(v).toFixed(1)}" r="4" fill="${c}"/>${text(X(x) + 8, Ydraw(v) + (v >= 0 ? -6 : 14), `${o.fmt.n(unitQ, v, 0)}`, { size: 11, fill: c, anchor: 'start', weight: 700, halo: th.bg })}`;
  const pos = isM ? dg.Mpos : dg.Vpos, neg = isM ? dg.Mneg : dg.Vneg;
  if (pos.v > 1e-6) s += peak(pos.v, pos.s, th.concreteStroke);
  if (neg.v < -1e-6) s += peak(neg.v, neg.s, th.bad);
  s += text(m.l, 18, `${label} en ${dg.axis.toUpperCase()} (${o.fmt.l(unitQ)}) — envolvente de combinaciones últimas${sel ? ` — ${sel.name}` : ''}`, { size: 12.5, fill: th.ink, weight: 600 });
  s += text(W - m.r, 18, isM ? 'positivo abajo (tracción inferior)' : 'positivo hacia abajo', { size: 10.5, fill: th.muted, anchor: 'end' });
  s += text((m.l + W - m.r) / 2, H - 10, `Posición ${dg.axis} (m)`, { size: 10.5, fill: th.muted, anchor: 'middle' });
  for (let v = Math.ceil(dg.lo); v <= dg.hi + 1e-9; v += niceStep(dg.hi - dg.lo, 8)) s += text(X(v), H - m.b + 14, o.fmt.n('len', v, 1), { size: 10, fill: th.muted, anchor: 'middle' });
  return svgWrap(W, H, s, th.bg);
}
