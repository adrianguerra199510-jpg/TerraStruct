import { FootingInput, FootingResults, ServiceResult, columnSectionBox } from '../core/footing';
import { Poly, Pt, bbox, ccw } from '../core/geometry';
import { columnPoly } from '../core/shapes';
import { Fmt } from '../core/units';
import { Theme, LIGHT, arrow, dimLine, heat, line, niceStep, poly, svgWrap, text } from './svg';

export interface PlanView {
  W: number;
  H: number;
  s: number;
  xmin: number;
  ymin: number;
  ox: number;
  oy: number;
  toSvg: (x: number, y: number) => Pt;
  toWorld: (X: number, Y: number) => Pt;
}

export function makePlanView(pts: Pt[], W: number, H: number, margin = 54): PlanView {
  const all = pts.length ? pts : [{ x: 0, y: 0 }];
  const bb = bbox([...all, { x: 0, y: 0 }]);
  const bw = Math.max(bb.xmax - bb.xmin, 0.5);
  const bh = Math.max(bb.ymax - bb.ymin, 0.5);
  const s = Math.min((W - 2 * margin) / bw, (H - 2 * margin) / bh);
  const ox = (W - bw * s) / 2;
  const oy = (H - bh * s) / 2;
  const view: PlanView = {
    W, H, s, xmin: bb.xmin, ymin: bb.ymin, ox, oy,
    toSvg: (x, y) => ({ x: ox + (x - bb.xmin) * s, y: H - oy - (y - bb.ymin) * s }),
    toWorld: (X, Y) => ({ x: (X - ox) / s + bb.xmin, y: (H - oy - Y) / s + bb.ymin }),
  };
  return view;
}

export function planPoints(inp: FootingInput): Pt[] {
  const pts: Pt[] = [...inp.vertices];
  for (const c of inp.columns) pts.push(...columnPoly(c.geom, c.x, c.y));
  return pts;
}

export interface PlanOptions {
  W?: number;
  H?: number;
  theme?: Theme;
  fmt: Fmt;
  view?: PlanView;
  combo?: ServiceResult | null;
  showCritical?: boolean;
  showDims?: boolean;
  showGrid?: boolean;
  showPressure?: boolean;
  showVertexLabels?: boolean;
  selectedColumn?: string | null;
  idPrefix?: string;
}

/** Segmentos [a,b] en que la recta v (eje horizontal 'h': y = v; vertical 'v': x = v) atraviesa el polígono. */
export function scanSegments(p: Poly, dir: 'h' | 'v', v: number): [number, number][] {
  const xs: number[] = [];
  const n = p.length;
  for (let i = 0; i < n; i++) {
    const a = p[i];
    const b = p[(i + 1) % n];
    const a1 = dir === 'h' ? a.y : a.x;
    const b1 = dir === 'h' ? b.y : b.x;
    if ((a1 <= v && b1 > v) || (b1 <= v && a1 > v)) {
      const t = (v - a1) / (b1 - a1);
      xs.push(dir === 'h' ? a.x + t * (b.x - a.x) : a.y + t * (b.y - a.y));
    }
  }
  xs.sort((p1, q1) => p1 - q1);
  const out: [number, number][] = [];
  for (let i = 0; i + 1 < xs.length; i += 2) out.push([xs[i], xs[i + 1]]);
  return out;
}

export function footingPlanSvg(inp: FootingInput, res: FootingResults | null, o: PlanOptions): string {
  const W = o.W ?? 760, H = o.H ?? 540;
  const th = o.theme ?? LIGHT;
  const view = o.view ?? makePlanView(planPoints(inp), W, H);
  const id = o.idPrefix ?? 'fp';
  const P = (p: Pt) => view.toSvg(p.x, p.y);
  const foot = ccw(inp.vertices);
  const fs = foot.map(P);
  const bb = bbox(foot);
  let s = '';

  // Cuadrícula
  if (o.showGrid !== false) {
    const wb = { x0: view.toWorld(0, H).x, x1: view.toWorld(W, 0).x, y0: view.toWorld(0, H).y, y1: view.toWorld(W, 0).y };
    const st = niceStep(Math.max(wb.x1 - wb.x0, wb.y1 - wb.y0), 10);
    for (let x = Math.ceil(wb.x0 / st) * st; x <= wb.x1; x += st) {
      const a = view.toSvg(x, wb.y0);
      const b = view.toSvg(x, wb.y1);
      s += line(a.x, a.y, b.x, b.y, th.grid, 1);
    }
    for (let y = Math.ceil(wb.y0 / st) * st; y <= wb.y1; y += st) {
      const a = view.toSvg(wb.x0, y);
      const b = view.toSvg(wb.x1, y);
      s += line(a.x, a.y, b.x, b.y, th.grid, 1);
    }
  }

  // Zapata
  const clipId = `${id}-clip`;
  s += `<defs><clipPath id="${clipId}"><polygon points="${fs.map((p) => `${p.x.toFixed(2)},${p.y.toFixed(2)}`).join(' ')}"/></clipPath>
  <pattern id="${id}-hatch" width="7" height="7" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="7" height="7" fill="${th.bg}"/><line x1="0" y1="0" x2="0" y2="7" stroke="${th.bad}" stroke-width="1.4"/></pattern></defs>`;
  const combo = o.combo && o.combo.sol.ok ? o.combo : null;
  if (o.showPressure !== false && combo) {
    const sol = combo.sol;
    const cells = 56;
    const cw = Math.max(bb.xmax - bb.xmin, bb.ymax - bb.ymin) / cells;
    const qmax = Math.max(sol.qmax, 1e-9);
    const qlo = sol.uplift ? 0 : Math.max(sol.qmin, 0);
    const span = qmax - qlo;
    const tOf = (q: number) => (span < 0.02 * qmax ? 0.55 : (q - qlo) / span);
    s += `<g clip-path="url(#${clipId})">`;
    for (let x = bb.xmin; x < bb.xmax; x += cw) {
      for (let y = bb.ymin; y < bb.ymax; y += cw) {
        const q = sol.plane.q0 + sol.plane.a * (x + cw / 2) + sol.plane.b * (y + cw / 2);
        const a = view.toSvg(x, y + cw);
        const wpx = cw * view.s + 0.6;
        const fill = q <= 0 ? `url(#${id}-hatch)` : heat(tOf(q));
        s += `<rect x="${a.x.toFixed(2)}" y="${a.y.toFixed(2)}" width="${wpx.toFixed(2)}" height="${wpx.toFixed(2)}" fill="${fill}"/>`;
      }
    }
    s += '</g>';
  } else {
    s += poly(fs, th.concrete, th.concrete);
  }
  s += poly(fs, 'none', th.concreteStroke, 2.2);

  // Armaduras / perímetros críticos
  if (o.showCritical && res) {
    s += `<g clip-path="url(#${clipId})">`;
    for (const p of res.punching) {
      if (!p.applicable) continue;
      const pts = p.critical.map(P);
      s += `<polygon points="${pts.map((q) => `${q.x.toFixed(1)},${q.y.toFixed(1)}`).join(' ')}" fill="none" stroke="${th.accent}" stroke-width="2" stroke-dasharray="6 4"/>`;
    }
    s += '</g>';
  }

  // Columnas
  for (const c of inp.columns) {
    const pts = columnPoly(c.geom, c.x, c.y).map(P);
    const sel = o.selectedColumn === c.id;
    s += poly(pts, th.col, sel ? th.accent : th.ink, sel ? 2.6 : 1.2, 'fill-opacity="0.92"');
    const cc = P({ x: c.x, y: c.y });
    s += text(cc.x, cc.y + 4, c.name, { size: 11, fill: '#fff', anchor: 'middle', weight: 600 });
  }

  // Resultante
  if (combo) {
    const r = P({ x: combo.Qx / combo.Ptot, y: combo.Qy / combo.Ptot });
    s += `<circle cx="${r.x.toFixed(1)}" cy="${r.y.toFixed(1)}" r="5.5" fill="none" stroke="${th.ink}" stroke-width="1.8"/>` + line(r.x - 9, r.y, r.x + 9, r.y, th.ink, 1.4) + line(r.x, r.y - 9, r.x, r.y + 9, th.ink, 1.4);
    s += text(r.x + 9, r.y - 8, 'R', { size: 11, fill: th.ink, weight: 700 });
  }

  // Ejes
  const o0 = view.toSvg(0, 0);
  const axLen = 34;
  s += arrow(o0.x, o0.y, o0.x + axLen, o0.y, th.bad, 1.6, 8) + text(o0.x + axLen + 5, o0.y + 4, 'x', { size: 12, fill: th.bad, weight: 700, italic: true });
  s += arrow(o0.x, o0.y, o0.x, o0.y - axLen, th.ok, 1.6, 8) + text(o0.x - 4, o0.y - axLen - 6, 'y', { size: 12, fill: th.ok, weight: 700, italic: true, anchor: 'middle' });

  // Cotas generales
  if (o.showDims !== false) {
    const bl = view.toSvg(bb.xmin, bb.ymin), br = view.toSvg(bb.xmax, bb.ymin), tl = view.toSvg(bb.xmin, bb.ymax);
    s += dimLine(bl.x, bl.y, br.x, br.y, o.fmt.u('len', bb.xmax - bb.xmin, 2), th.dim, 26, 11.5, 1);
    s += dimLine(bl.x, bl.y, tl.x, tl.y, o.fmt.u('len', bb.ymax - bb.ymin, 2), th.dim, 26, 11.5, -1);
  }
  if (o.showVertexLabels) {
    foot.forEach((v, i) => {
      const p = P(v);
      s += text(p.x + 7, p.y - 6, `${i + 1}`, { size: 10.5, fill: th.muted, weight: 600 });
    });
  }

  // Leyenda de presión
  if (o.showPressure !== false && combo) {
    const lx = W - 168, ly = H - 34;
    for (let i = 0; i < 60; i++) s += `<rect x="${(lx + i * 2.4).toFixed(1)}" y="${ly}" width="2.6" height="11" fill="${heat(i / 59)}"/>`;
    s += text(lx, ly - 5, 'Presión de contacto', { size: 10.5, fill: th.muted });
    s += text(lx, ly + 24, o.fmt.u('press', combo.sol.uplift ? 0 : Math.max(combo.sol.qmin, 0), 1), { size: 10.5, fill: th.muted });
    s += text(lx + 144, ly + 24, o.fmt.u('press', combo.sol.qmax, 1), { size: 10.5, fill: th.muted, anchor: 'end' });
    if (combo.sol.uplift) s += text(lx + 72, ly + 24, 'rayado: sin contacto', { size: 9.5, fill: th.bad, anchor: 'middle' });
  }
  return svgWrap(W, H, s, th.bg);
}

// ---------------------------------------------------------------------------
// Sección transversal
// ---------------------------------------------------------------------------
export function footingSectionSvg(inp: FootingInput, res: FootingResults | null, o: { W?: number; H?: number; theme?: Theme; fmt: Fmt; dir: 'x' | 'y' }): string {
  const W = o.W ?? 760, H = o.H ?? 360;
  const th = o.theme ?? LIGHT;
  const foot = ccw(inp.vertices);
  const bb = bbox(foot);
  const col = inp.columns[0];
  // Se corta por el centro de la primera columna, a lo largo del eje elegido.
  const cutAt = o.dir === 'x' ? col.y : col.x;
  const seg = scanSegments(foot, o.dir === 'x' ? 'h' : 'v', cutAt);
  const lo = seg.length ? Math.min(...seg.map((a) => a[0])) : o.dir === 'x' ? bb.xmin : bb.ymin;
  const hi = seg.length ? Math.max(...seg.map((a) => a[1])) : o.dir === 'x' ? bb.xmax : bb.ymax;
  const span = hi - lo;
  const margin = 60;
  const Dtot = Math.max(inp.Df, inp.h) + 0.6;
  const sc = Math.min((W - 2 * margin - 40) / span, (H - 90) / (Dtot + 0.4));
  const x0 = (W - span * sc) / 2;
  const groundY = 52;
  const X = (v: number) => x0 + (v - lo) * sc;
  const Y = (depth: number) => groundY + depth * sc; // profundidad bajo el terreno
  let s = '';
  // terreno
  s += `<defs><pattern id="soilh" width="9" height="9" patternUnits="userSpaceOnUse"><rect width="9" height="9" fill="${th.soil}" opacity=".35"/><path d="M0 9 L9 0" stroke="${th.soilStroke}" stroke-width="0.8" opacity=".6"/></pattern></defs>`;
  s += `<rect x="${(x0 - 44).toFixed(1)}" y="${groundY}" width="${(span * sc + 88).toFixed(1)}" height="${((Dtot + 0.1) * sc).toFixed(1)}" fill="url(#soilh)"/>`;
  s += line(x0 - 44, groundY, x0 + span * sc + 44, groundY, th.soilStroke, 2);
  // zapata
  const topF = inp.Df - inp.h;
  s += `<rect x="${X(lo).toFixed(1)}" y="${Y(topF).toFixed(1)}" width="${(span * sc).toFixed(1)}" height="${(inp.h * sc).toFixed(1)}" fill="${th.concrete}" stroke="${th.concreteStroke}" stroke-width="2"/>`;
  // columnas cortadas
  for (const c of inp.columns) {
    const cp = columnPoly(c.geom, c.x, c.y);
    const cs = scanSegments(cp, o.dir === 'x' ? 'h' : 'v', cutAt);
    for (const [a, b] of cs) {
      s += `<rect x="${X(a).toFixed(1)}" y="${Y(-0.35).toFixed(1)}" width="${((b - a) * sc).toFixed(1)}" height="${((inp.Df - inp.h + 0.35) * sc).toFixed(1)}" fill="${th.col}" fill-opacity=".85" stroke="${th.ink}" stroke-width="1.2"/>`;
    }
  }
  // refuerzo: capa inferior y capa superior de la otra dirección
  const flex = o.dir === 'x' ? res?.flexX : res?.flexY;
  const other = o.dir === 'x' ? res?.flexY : res?.flexX;
  const lowerIsThis = (inp.lowerLayer === 'x') === (o.dir === 'x');
  const cover = inp.cover;
  const dbThis = (flex?.bar.db ?? 16) / 1000;
  const dbOther = (other?.bar.db ?? 16) / 1000;
  const yLower = Y(inp.Df - cover - (lowerIsThis ? dbThis / 2 : dbOther / 2));
  const yUpper = Y(inp.Df - cover - (lowerIsThis ? dbThis : dbOther) - (lowerIsThis ? dbOther : dbThis) / 2);
  const thisY = lowerIsThis ? yLower : yUpper;
  const otherY = lowerIsThis ? yUpper : yLower;
  s += line(X(lo) + cover * sc, thisY, X(hi) - cover * sc, thisY, th.rebar, Math.max(2, dbThis * sc), undefined);
  const spOther = other?.det.spacing ?? 0.25;
  const nDots = Math.min(Math.floor(span / spOther), 60);
  for (let i = 0; i <= nDots; i++) {
    const cx = X(lo) + cover * sc + ((span - 2 * cover) * sc * i) / Math.max(nDots, 1);
    s += `<circle cx="${cx.toFixed(1)}" cy="${otherY.toFixed(1)}" r="${Math.max(2.4, (dbOther * sc) / 2).toFixed(1)}" fill="${th.rebar}" opacity=".85"/>`;
  }
  // cotas
  s += dimLine(X(lo), Y(inp.Df) + 2, X(hi), Y(inp.Df) + 2, o.fmt.u('len', span, 2), th.dim, 26, 11.5, 1);
  s += dimLine(X(hi), Y(topF), X(hi), Y(inp.Df), o.fmt.u('len', inp.h, 2), th.dim, 30, 11.5, -1);
  s += dimLine(x0 - 4, groundY, x0 - 4, Y(inp.Df), `Df = ${o.fmt.u('len', inp.Df, 2)}`, th.muted, 26, 11, 1);
  s += text(X(lo) + 6, Y(topF) - 6, 'Nivel de terreno ↑', { size: 10.5, fill: th.muted });
  if (flex) {
    s += text(W / 2, H - 12, `Barras ${o.dir === 'x' ? 'X' : 'Y'} (línea): ${flex.det.text}${other ? `   ·   Barras ${o.dir === 'x' ? 'Y' : 'X'} (puntos): ${other.det.text}` : ''}`, { size: 12, fill: th.rebar, anchor: 'middle', weight: 600 });
  }
  s += text(14, 22, `Sección a lo largo de ${o.dir === 'x' ? 'X' : 'Y'} (por ${col.name})`, { size: 12.5, fill: th.ink, weight: 600 });
  return svgWrap(W, H, s, th.bg);
}

// ---------------------------------------------------------------------------
// Planta de armado
// ---------------------------------------------------------------------------
export function footingRebarPlanSvg(inp: FootingInput, res: FootingResults | null, o: { W?: number; H?: number; theme?: Theme; fmt: Fmt }): string {
  const W = o.W ?? 760, H = o.H ?? 540;
  const th = o.theme ?? LIGHT;
  const view = makePlanView(planPoints(inp), W, H, 60);
  const foot = ccw(inp.vertices);
  const bb = bbox(foot);
  const P = (p: Pt) => view.toSvg(p.x, p.y);
  let s = poly(foot.map(P), th.concrete, th.concreteStroke, 2.2, 'fill-opacity=".55"');
  const spX = res?.flexX?.det.spacing ?? 0.25;
  const spY = res?.flexY?.det.spacing ?? 0.25;
  const cov = inp.cover;
  const clip = (a: number, b: number) => [a + cov, b - cov] as [number, number];
  // Barras X (horizontales) en azul, barras Y (verticales) en rojo
  const nY = Math.floor((bb.ymax - bb.ymin - 2 * cov) / spX);
  const stepY = Math.max(1, Math.ceil(nY / 36));
  for (let i = 0; i <= nY; i += stepY) {
    const y = bb.ymin + cov + (i * (bb.ymax - bb.ymin - 2 * cov)) / Math.max(nY, 1);
    for (const [a, b] of scanSegments(foot, 'h', y)) {
      const [c, d] = clip(a, b);
      if (d > c) {
        const p1 = view.toSvg(c, y), p2 = view.toSvg(d, y);
        s += line(p1.x, p1.y, p2.x, p2.y, '#1d63c7', 1.6);
      }
    }
  }
  const nX = Math.floor((bb.xmax - bb.xmin - 2 * cov) / spY);
  const stepX = Math.max(1, Math.ceil(nX / 36));
  for (let i = 0; i <= nX; i += stepX) {
    const x = bb.xmin + cov + (i * (bb.xmax - bb.xmin - 2 * cov)) / Math.max(nX, 1);
    for (const [a, b] of scanSegments(foot, 'v', x)) {
      const [c, d] = clip(a, b);
      if (d > c) {
        const p1 = view.toSvg(x, c), p2 = view.toSvg(x, d);
        s += line(p1.x, p1.y, p2.x, p2.y, th.rebar, 1.6);
      }
    }
  }
  for (const c of inp.columns) {
    const pts = columnPoly(c.geom, c.x, c.y).map(P);
    s += poly(pts, th.col, th.ink, 1.2, 'fill-opacity=".9"');
  }
  s += text(16, 24, 'Planta de armado inferior', { size: 13, fill: th.ink, weight: 600 });
  s += line(16, 42, 40, 42, '#1d63c7', 2.4) + text(46, 46, `Barras en X: ${res?.flexX?.det.text ?? '—'}`, { size: 11.5, fill: th.ink });
  s += line(16, 60, 40, 60, th.rebar, 2.4) + text(46, 64, `Barras en Y: ${res?.flexY?.det.text ?? '—'}`, { size: 11.5, fill: th.ink });
  const bl = view.toSvg(bb.xmin, bb.ymin), br = view.toSvg(bb.xmax, bb.ymin), tl = view.toSvg(bb.xmin, bb.ymax);
  s += dimLine(bl.x, bl.y, br.x, br.y, o.fmt.u('len', bb.xmax - bb.xmin, 2), th.dim, 24, 11.5, 1);
  s += dimLine(bl.x, bl.y, tl.x, tl.y, o.fmt.u('len', bb.ymax - bb.ymin, 2), th.dim, 24, 11.5, -1);
  void columnSectionBox;
  return svgWrap(W, H, s, th.bg);
}
