// Diagramas de momento y de cortante genéricos (SVG). Convención: los valores positivos se dibujan hacia abajo
// (orientación horizontal) o hacia la derecha (orientación vertical, altura hacia arriba).
import { Theme, LIGHT, line, niceStep, svgWrap, text } from './svg';

export interface DgSeries {
  /** abscisas (posición o altura) y valores; NaN corta la línea */
  s: number[];
  v: number[];
  color: string;
  width?: number;
  opacity?: number;
  dash?: string;
  /** rellena entre la curva y el eje cero */
  fill?: boolean;
}
export interface DgPeak {
  s: number;
  v: number;
  color: string;
  label: string;
}
export interface DgMarker {
  s: number;
  label?: string;
  color?: string;
}

export interface DgOptions {
  W?: number;
  H?: number;
  theme?: Theme;
  orient?: 'h' | 'v';
  title: string;
  note?: string;
  sLabel: string;
  vLabel: string;
  series: DgSeries[];
  peaks?: DgPeak[];
  markers?: DgMarker[];
  /** intervalo del eje de posición y, opcionalmente, de los valores */
  sRange: [number, number];
  /** formato de números */
  fmtS: (v: number) => string;
  fmtV: (v: number) => string;
  /** SVG que se dibuja encima del gráfico en la franja superior (orientación horizontal) */
  stripSvg?: (X: (s: number) => number, y0: number) => string;
  stripH?: number;
}

export function diagramSvg(o: DgOptions): string {
  const th = o.theme ?? LIGHT;
  const horiz = (o.orient ?? 'h') === 'h';
  const W = o.W ?? 820, H = o.H ?? 360;
  const strip = horiz ? o.stripH ?? 0 : 0;
  const m = horiz ? { l: 64, r: 24, t: 40 + strip, b: 48 } : { l: 64, r: 30, t: 40, b: 46 };
  const plotW = W - m.l - m.r, plotH = H - m.t - m.b;
  const all = o.series.flatMap((x) => x.v.filter((q) => isFinite(q)));
  const vmax = Math.max(0, ...all), vmin = Math.min(0, ...all);
  const span = Math.max(vmax - vmin, 1e-9);
  const pad = span * 0.08;
  const v0 = vmin - (vmin < 0 ? pad : 0), v1 = vmax + (vmax > 0 ? pad : 0);
  const [s0, s1] = o.sRange;
  const sS = Math.max(s1 - s0, 1e-9);
  // transformaciones
  const Sx = (s: number) => (horiz ? m.l + ((s - s0) / sS) * plotW : 0);
  const Vx = (v: number) => m.l + ((v - v0) / (v1 - v0)) * plotW; // orientación vertical: valor → x
  const Vy = (v: number) => m.t + ((v - v0) / (v1 - v0)) * plotH; // orientación horizontal: valor → y (positivo abajo)
  const Sy = (s: number) => m.t + plotH - ((s - s0) / sS) * plotH; // orientación vertical: altura → y
  const P = (s: number, v: number) => (horiz ? { x: Sx(s), y: Vy(v) } : { x: Vx(v), y: Sy(s) });
  let g = '';
  if (o.stripSvg && horiz) g += o.stripSvg(Sx, m.t - strip + 10);
  // cuadrícula de valores
  const step = niceStep(v1 - v0, 5);
  for (let v = Math.ceil(v0 / step) * step; v <= v1 + 1e-9; v += step) {
    if (horiz) {
      g += line(m.l, Vy(v), W - m.r, Vy(v), th.grid, 1) + text(m.l - 6, Vy(v) + 3.5, o.fmtV(v), { size: 10.5, fill: th.muted, anchor: 'end' });
    } else {
      g += line(Vx(v), m.t, Vx(v), H - m.b, th.grid, 1) + text(Vx(v), H - m.b + 15, o.fmtV(v), { size: 10.5, fill: th.muted, anchor: 'middle' });
    }
  }
  // ticks de posición
  const sstep = niceStep(sS, horiz ? 8 : 6);
  for (let s = Math.ceil(s0 / sstep) * sstep; s <= s1 + 1e-9; s += sstep) {
    if (horiz) g += text(Sx(s), H - m.b + 15, o.fmtS(s), { size: 10, fill: th.muted, anchor: 'middle' });
    else g += line(m.l, Sy(s), W - m.r, Sy(s), th.grid, 1) + text(m.l - 6, Sy(s) + 3.5, o.fmtS(s), { size: 10, fill: th.muted, anchor: 'end' });
  }
  // eje cero
  if (horiz) g += line(m.l, Vy(0), W - m.r, Vy(0), th.muted, 1.4);
  else g += line(Vx(0), m.t, Vx(0), H - m.b, th.muted, 1.4);
  // marcadores
  for (const mk of o.markers ?? []) {
    const c = mk.color ?? th.accent;
    if (horiz) g += line(Sx(mk.s), m.t - 4, Sx(mk.s), H - m.b, c, 1, '5 4');
    else g += line(m.l, Sy(mk.s), W - m.r, Sy(mk.s), c, 1, '5 4');
    if (mk.label) g += horiz ? text(Sx(mk.s), H - m.b + 28, mk.label, { size: 9.5, fill: c, anchor: 'middle' }) : text(W - m.r - 2, Sy(mk.s) - 4, mk.label, { size: 9.5, fill: c, anchor: 'end' });
  }
  // series
  for (const se of o.series) {
    let seg: string[] = [];
    const flush = () => {
      if (seg.length > 1) {
        g += `<polyline points="${seg.join(' ')}" fill="none" stroke="${se.color}" stroke-width="${se.width ?? 2}" stroke-linejoin="round"${se.dash ? ` stroke-dasharray="${se.dash}"` : ''} opacity="${se.opacity ?? 1}"/>`;
        if (se.fill) {
          const first = seg[0].split(',').map(Number), last = seg[seg.length - 1].split(',').map(Number);
          const z = horiz ? Vy(0) : Vx(0);
          const base = horiz ? [`${last[0]},${z}`, `${first[0]},${z}`] : [`${z},${last[1]}`, `${z},${first[1]}`];
          g += `<polygon points="${seg.join(' ')} ${base.join(' ')}" fill="${se.color}" opacity="0.13"/>`;
        }
      }
      seg = [];
    };
    se.s.forEach((s, i) => {
      const v = se.v[i];
      if (!isFinite(v)) return flush();
      const p = P(s, v);
      seg.push(`${p.x.toFixed(1)},${p.y.toFixed(1)}`);
    });
    flush();
  }
  // valores extremos
  for (const pk of o.peaks ?? []) {
    const p = P(pk.s, pk.v);
    g += `<circle cx="${p.x.toFixed(1)}" cy="${p.y.toFixed(1)}" r="4" fill="${pk.color}"/>`;
    g += horiz
      ? text(p.x + 8, p.y + (pk.v >= 0 ? -6 : 14), pk.label, { size: 11, fill: pk.color, weight: 700, halo: th.bg })
      : text(p.x + (pk.v >= 0 ? 8 : -8), p.y - 6, pk.label, { size: 11, fill: pk.color, weight: 700, anchor: pk.v >= 0 ? 'start' : 'end', halo: th.bg });
  }
  g += text(m.l, 18, o.title, { size: 12.5, fill: th.ink, weight: 600 });
  if (o.note) g += text(W - m.r, 18, o.note, { size: 10.5, fill: th.muted, anchor: 'end' });
  if (horiz) {
    g += text((m.l + W - m.r) / 2, H - 6, o.sLabel, { size: 10.5, fill: th.muted, anchor: 'middle' });
    g += text(13, (m.t + H - m.b) / 2, o.vLabel, { size: 10.5, fill: th.muted, anchor: 'middle', rotate: -90 });
  } else {
    g += text((m.l + W - m.r) / 2, H - 6, o.vLabel, { size: 10.5, fill: th.muted, anchor: 'middle' });
    g += text(13, (m.t + H - m.b) / 2, o.sLabel, { size: 10.5, fill: th.muted, anchor: 'middle', rotate: -90 });
  }
  return svgWrap(W, H, g, th.bg);
}
