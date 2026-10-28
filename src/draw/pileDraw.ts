import { PileInput } from '../core/pileTypes';
import { PileResults, ComboRes } from '../core/pile';
import { columnPoly } from '../core/shapes';
import { findBar } from '../core/materials';
import { hpShape } from '../core/pileStruct';
import { Fmt } from '../core/units';
import { Pt } from '../core/geometry';
import { Theme, LIGHT, dimLine, line, poly, svgWrap, text, niceStep } from './svg';
import { makePlanView, PlanView } from './footingDraw';

export function pilePlanPoints(inp: PileInput, res: PileResults): Pt[] {
  const r = res.capRect;
  return [{ x: r.x0, y: r.y0 }, { x: r.x1, y: r.y1 }, ...columnPoly(inp.column.geom, inp.column.x, inp.column.y)];
}

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
  s += `<rect x="${A.x.toFixed(1)}" y="${A.y.toFixed(1)}" width="${(B.x - A.x).toFixed(1)}" height="${(B.y - A.y).toFixed(1)}" fill="${th.concrete}" fill-opacity="0.55" stroke="${th.concreteStroke}" stroke-width="2"/>`;
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
  let s = `<rect x="${A.x.toFixed(1)}" y="${A.y.toFixed(1)}" width="${(B.x - A.x).toFixed(1)}" height="${(B.y - A.y).toFixed(1)}" fill="${th.concrete}" fill-opacity="0.35" stroke="${th.concreteStroke}" stroke-width="2"/>`;
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
      const a = axis === 'x' ? view.toSvg(r.x0 + cv, v) : view.toSvg(v, r.y0 + cv);
      const b = axis === 'x' ? view.toSvg(r.x1 - cv, v) : view.toSvg(v, r.y1 - cv);
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
  const r = res.capRect;
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
