// Utilidades para generar SVG como texto (se usan en pantalla y en las memorias PDF/Word).

export const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

export interface Theme {
  bg: string;
  ink: string;
  muted: string;
  line: string;
  grid: string;
  concrete: string;
  concreteStroke: string;
  col: string;
  soil: string;
  soilStroke: string;
  dim: string;
  accent: string;
  rebar: string;
  water: string;
  ok: string;
  bad: string;
}

export const LIGHT: Theme = {
  bg: '#ffffff', ink: '#12233d', muted: '#5a6b85', line: '#cbd5e4', grid: '#e8eef6', concrete: '#d9e3f0', concreteStroke: '#12335e', col: '#34445e',
  soil: '#e9c58f', soilStroke: '#b5894a', dim: '#c0392b', accent: '#d9822b', rebar: '#d62839', water: '#4da3ff', ok: '#138a48', bad: '#c62a2f',
};
export const DARK: Theme = {
  bg: '#0f1b31', ink: '#e6eefb', muted: '#93a6c4', line: '#33466a', grid: '#1a2a47', concrete: '#324a73', concreteStroke: '#a9c4ee', col: '#8fa7cf', soil: '#6b5330',
  soilStroke: '#b58a4a', dim: '#ff8a7a', accent: '#f0a050', rebar: '#ff6b7a', water: '#4da3ff', ok: '#4bd08a', bad: '#ff7b80',
};

export const FONT = "font-family=\"Segoe UI, Arial, Helvetica, sans-serif\"";

export function text(x: number, y: number, s: string, opts: { size?: number; fill?: string; anchor?: 'start' | 'middle' | 'end'; weight?: string | number; rotate?: number; italic?: boolean; baseline?: string; halo?: string } = {}): string {
  const { size = 12, fill = '#000', anchor = 'start', weight = 400, rotate, italic, baseline, halo } = opts;
  const tr = rotate ? ` transform="rotate(${rotate} ${x.toFixed(2)} ${y.toFixed(2)})"` : '';
  return `<text x="${x.toFixed(2)}" y="${y.toFixed(2)}" ${FONT} font-size="${size}" fill="${fill}" text-anchor="${anchor}" font-weight="${weight}"${italic ? ' font-style="italic"' : ''}${baseline ? ` dominant-baseline="${baseline}"` : ''}${halo ? ` stroke="${halo}" stroke-width="3.2" stroke-linejoin="round" paint-order="stroke"` : ''}${tr}>${esc(s)}</text>`;
}

export function line(x1: number, y1: number, x2: number, y2: number, stroke: string, w = 1, dash?: string): string {
  return `<line x1="${x1.toFixed(2)}" y1="${y1.toFixed(2)}" x2="${x2.toFixed(2)}" y2="${y2.toFixed(2)}" stroke="${stroke}" stroke-width="${w}"${dash ? ` stroke-dasharray="${dash}"` : ''}/>`;
}

export function poly(pts: { x: number; y: number }[], fill: string, stroke: string, w = 1, extra = ''): string {
  return `<polygon points="${pts.map((p) => `${p.x.toFixed(2)},${p.y.toFixed(2)}`).join(' ')}" fill="${fill}" stroke="${stroke}" stroke-width="${w}" stroke-linejoin="round" ${extra}/>`;
}

export function arrowHead(x: number, y: number, ang: number, size: number, fill: string): string {
  const a = Math.PI / 7;
  const p1 = { x: x - size * Math.cos(ang - a), y: y - size * Math.sin(ang - a) };
  const p2 = { x: x - size * Math.cos(ang + a), y: y - size * Math.sin(ang + a) };
  return `<polygon points="${x.toFixed(2)},${y.toFixed(2)} ${p1.x.toFixed(2)},${p1.y.toFixed(2)} ${p2.x.toFixed(2)},${p2.y.toFixed(2)}" fill="${fill}"/>`;
}

export function arrow(x1: number, y1: number, x2: number, y2: number, stroke: string, w = 1.4, head = 7): string {
  const ang = Math.atan2(y2 - y1, x2 - x1);
  return line(x1, y1, x2 - Math.cos(ang) * head * 0.6, y2 - Math.sin(ang) * head * 0.6, stroke, w) + arrowHead(x2, y2, ang, head, stroke);
}

/** Cota lineal con flechas en ambos extremos y texto centrado. */
export function dimLine(x1: number, y1: number, x2: number, y2: number, label: string, color: string, offset = 0, size = 11, side: 1 | -1 = 1): string {
  const ang = Math.atan2(y2 - y1, x2 - x1);
  const nx = -Math.sin(ang) * offset * side;
  const ny = Math.cos(ang) * offset * side;
  const ax = x1 + nx, ay = y1 + ny, bx = x2 + nx, by = y2 + ny;
  const ext = (px: number, py: number, qx: number, qy: number) => line(px, py, qx + (qx - px) * 0.08, qy + (qy - py) * 0.08, color, 0.6, '2 2');
  let s = '';
  if (offset !== 0) s += ext(x1, y1, ax, ay) + ext(x2, y2, bx, by);
  s += line(ax, ay, bx, by, color, 0.9);
  s += arrowHead(ax, ay, ang + Math.PI, 5.5, color) + arrowHead(bx, by, ang, 5.5, color);
  const mx = (ax + bx) / 2, my = (ay + by) / 2;
  let rot = (ang * 180) / Math.PI;
  if (rot > 90 || rot < -90) rot += 180;
  s += `<g>${text(mx, my - 3, label, { size, fill: color, anchor: 'middle', rotate: rot, weight: 500 })}</g>`;
  return s;
}

interface TBox { x: number; y: number; w: number; h: number; fixed: boolean; start: number; end: number; m: RegExpExecArray; rot: number }

/**
 * Evita que los rótulos queden fuera del recuadro o se solapen: estima el cuadro de cada <text> y lo desplaza
 * (primero hacia dentro del lienzo y luego en vertical u horizontal) hasta que no choque con los ya colocados.
 */
export function declutterText(body: string, W: number, H: number): string {
  const re = /<text x="([\d.\-]+)" y="([\d.\-]+)"([^>]*?)font-size="([\d.]+)"([^>]*?)text-anchor="(\w+)"([^>]*?)>([^<]*)<\/text>/g;
  const items: TBox[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(body))) {
    const x = +m[1], y = +m[2], size = +m[4], anchor = m[6];
    const rm = /rotate\(([\-\d.]+) /.exec(m[7]);
    const rot = rm ? +rm[1] : 0;
    const bold = /font-weight="(6|7|8|9)\d\d"/.test(m[3] + m[5] + m[7]);
    const len = m[8].replace(/&[a-z#0-9]+;/g, 'x').length * size * (bold ? 0.58 : 0.54);
    const vertical = Math.abs(rot) > 45;
    let box: { x: number; y: number; w: number; h: number };
    if (vertical) box = { x: x - size, y: anchor === 'middle' ? y - len / 2 : anchor === 'end' ? y - len : y, w: size, h: len };
    else box = { x: anchor === 'middle' ? x - len / 2 : anchor === 'end' ? x - len : x, y: y - size * 0.8, w: len, h: size };
    items.push({ ...box, fixed: size >= 13, start: m.index, end: m.index + m[0].length, m, rot });
  }
  if (!items.length) return body;
  const placed: TBox[] = [];
  const shifts: { dx: number; dy: number }[] = [];
  const hit = (a: TBox, b: TBox) => Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x) > 2 && Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y) > 2;
  const inside = (a: TBox) => a.x >= 3 && a.x + a.w <= W - 3 && a.y >= 3 && a.y + a.h <= H - 3;
  const free = (a: TBox) => !placed.some((b) => hit(a, b));
  for (const it of items) {
    let dx = 0, dy = 0;
    const cur = { ...it };
    // dentro del lienzo
    if (cur.x < 3) dx = 3 - cur.x;
    else if (cur.x + cur.w > W - 3) dx = W - 3 - cur.w - cur.x;
    if (cur.y < 3) dy = 3 - cur.y;
    else if (cur.y + cur.h > H - 3) dy = H - 3 - cur.h - cur.y;
    cur.x += dx; cur.y += dy;
    if (!it.fixed && !free(cur)) {
      const vert = Math.abs(it.rot) > 45;
      const step = vert ? it.w + 2 : it.h + 1;
      let found = false;
      for (let k = 1; k <= 16 && !found; k++) {
        const cands = vert
          ? [{ x: step * k, y: 0 }, { x: -step * k, y: 0 }, { x: 0, y: step * k }, { x: 0, y: -step * k }]
          : [{ x: 0, y: step * k }, { x: 0, y: -step * k }, { x: (it.w + 4) * Math.min(k, 2), y: 0 }, { x: -(it.w + 4) * Math.min(k, 2), y: 0 }, { x: (it.w / 2 + 4) * Math.min(k, 3), y: step * k }, { x: -(it.w / 2 + 4) * Math.min(k, 3), y: step * k }, { x: (it.w / 2 + 4) * Math.min(k, 3), y: -step * k }, { x: -(it.w / 2 + 4) * Math.min(k, 3), y: -step * k }];
        for (const c of cands) {
          const t = { ...cur, x: cur.x + c.x, y: cur.y + c.y };
          if (inside(t) && free(t)) { dx += c.x; dy += c.y; cur.x = t.x; cur.y = t.y; found = true; break; }
        }
      }
    }
    placed.push(cur);
    shifts.push({ dx, dy });
  }
  let out = '';
  let last = 0;
  items.forEach((it, i) => {
    const { dx, dy } = shifts[i];
    out += body.slice(last, it.start);
    last = it.end;
    if (Math.abs(dx) < 0.01 && Math.abs(dy) < 0.01) { out += it.m[0]; return; }
    let t = it.m[0].replace(/^<text x="([\d.\-]+)" y="([\d.\-]+)"/, (_, a, b) => `<text x="${(+a + dx).toFixed(2)}" y="${(+b + dy).toFixed(2)}"`);
    t = t.replace(/rotate\(([\-\d.]+) ([\d.\-]+) ([\d.\-]+)\)/, (_, r, a, b) => `rotate(${r} ${(+a + dx).toFixed(2)} ${(+b + dy).toFixed(2)})`);
    out += t;
  });
  return out + body.slice(last);
}

export function svgWrap(w: number, h: number, body: string, bg?: string): string {
  const b = declutterText(body, w, h);
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}" ${FONT}>${bg ? `<rect width="${w}" height="${h}" fill="${bg}"/>` : ''}${b}</svg>`;
}

/** Escala de colores secuencial (azul claro → naranja intenso) para presiones. */
export function heat(t: number): string {
  const c = Math.min(Math.max(t, 0), 1);
  const stops = [
    [0, [214, 234, 255]],
    [0.35, [150, 210, 225]],
    [0.6, [250, 224, 140]],
    [0.8, [244, 160, 80]],
    [1, [205, 70, 50]],
  ] as [number, number[]][];
  for (let i = 1; i < stops.length; i++) {
    if (c <= stops[i][0]) {
      const [t0, a] = stops[i - 1];
      const [t1, b] = stops[i];
      const k = (c - t0) / (t1 - t0);
      const r = Math.round(a[0] + (b[0] - a[0]) * k);
      const g = Math.round(a[1] + (b[1] - a[1]) * k);
      const bl = Math.round(a[2] + (b[2] - a[2]) * k);
      return `rgb(${r},${g},${bl})`;
    }
  }
  return 'rgb(205,70,50)';
}

/** Paso "bonito" para rejillas. */
export function niceStep(range: number, target = 8): number {
  const raw = range / target;
  const mag = Math.pow(10, Math.floor(Math.log10(raw)));
  const n = raw / mag;
  const step = n < 1.5 ? 1 : n < 3.5 ? 2 : n < 7.5 ? 5 : 10;
  return step * mag;
}

export interface Series {
  name: string;
  xs: number[];
  ys: number[];
  color: string;
  dash?: string;
}

/** Gráfico de líneas simple con ejes y cuadrícula. */
export function lineChart(opts: {
  w: number; h: number; theme: Theme; series: Series[]; xLabel: string; yLabel: string; title?: string; zeroLine?: boolean; fillArea?: boolean; invertY?: boolean;
  xFmt?: (v: number) => string; yFmt?: (v: number) => string;
}): string {
  const { w, h, theme, series, xLabel, yLabel } = opts;
  const m = { l: 56, r: 16, t: opts.title ? 34 : 14, b: 42 };
  const allX = series.flatMap((s) => s.xs), allY = series.flatMap((s) => s.ys);
  let xmin = Math.min(...allX), xmax = Math.max(...allX);
  let ymin = Math.min(0, ...allY), ymax = Math.max(0, ...allY);
  if (xmax - xmin < 1e-9) xmax = xmin + 1;
  if (ymax - ymin < 1e-9) ymax = ymin + 1;
  const pad = (ymax - ymin) * 0.06;
  ymax += pad;
  if (ymin < 0) ymin -= pad;
  const X = (x: number) => m.l + ((x - xmin) / (xmax - xmin)) * (w - m.l - m.r);
  const Y = (y: number) => (opts.invertY ? m.t + ((y - ymin) / (ymax - ymin)) * (h - m.t - m.b) : h - m.b - ((y - ymin) / (ymax - ymin)) * (h - m.t - m.b));
  let s = '';
  const sx = niceStep(xmax - xmin, 6), sy = niceStep(ymax - ymin, 5);
  const xf = opts.xFmt ?? ((v: number) => String(+v.toFixed(2)));
  const yf = opts.yFmt ?? ((v: number) => String(+v.toFixed(1)));
  for (let v = Math.ceil(xmin / sx) * sx; v <= xmax + 1e-9; v += sx) {
    s += line(X(v), m.t, X(v), h - m.b, theme.grid, 1);
    s += text(X(v), h - m.b + 15, xf(v), { size: 10.5, fill: theme.muted, anchor: 'middle' });
  }
  for (let v = Math.ceil(ymin / sy) * sy; v <= ymax + 1e-9; v += sy) {
    s += line(m.l, Y(v), w - m.r, Y(v), theme.grid, 1);
    s += text(m.l - 6, Y(v) + 3.5, yf(v), { size: 10.5, fill: theme.muted, anchor: 'end' });
  }
  s += line(m.l, m.t, m.l, h - m.b, theme.line, 1.2) + line(m.l, h - m.b, w - m.r, h - m.b, theme.line, 1.2);
  if (opts.zeroLine !== false && ymin < 0) s += line(m.l, Y(0), w - m.r, Y(0), theme.muted, 1, '4 3');
  for (const se of series) {
    const pts = se.xs.map((x, i) => `${X(x).toFixed(1)},${Y(se.ys[i]).toFixed(1)}`);
    if (opts.fillArea) {
      s += `<polygon points="${X(se.xs[0]).toFixed(1)},${Y(0).toFixed(1)} ${pts.join(' ')} ${X(se.xs[se.xs.length - 1]).toFixed(1)},${Y(0).toFixed(1)}" fill="${se.color}" opacity="0.14"/>`;
    }
    s += `<polyline points="${pts.join(' ')}" fill="none" stroke="${se.color}" stroke-width="2" stroke-linejoin="round"${se.dash ? ` stroke-dasharray="${se.dash}"` : ''}/>`;
  }
  s += text((m.l + w - m.r) / 2, h - 6, xLabel, { size: 11, fill: theme.muted, anchor: 'middle' });
  s += text(13, (m.t + h - m.b) / 2, yLabel, { size: 11, fill: theme.muted, anchor: 'middle', rotate: -90 });
  if (opts.title) s += text(m.l, 20, opts.title, { size: 12.5, fill: theme.ink, weight: 600 });
  if (series.length > 1) {
    let lx = w - m.r - 4;
    for (const se of [...series].reverse()) {
      const tw = se.name.length * 6 + 26;
      lx -= tw;
      s += line(lx, 16, lx + 16, 16, se.color, 2.4, se.dash) + text(lx + 20, 20, se.name, { size: 10.5, fill: theme.muted });
    }
  }
  return svgWrap(w, h, s, theme.bg);
}

export function polyline(pts: { x: number; y: number }[], stroke: string, w = 2, dash?: string): string {
  return `<polyline points="${pts.map((p) => `${p.x.toFixed(2)},${p.y.toFixed(2)}`).join(' ')}" fill="none" stroke="${stroke}" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round"${dash ? ` stroke-dasharray="${dash}"` : ''}/>`;
}
