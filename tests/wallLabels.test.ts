import { expect, it } from 'vitest';
import { analyzeWall } from '../src/core/wall';
import { defaultWall, WallType } from '../src/core/wallTypes';
import { makeFmt } from '../src/core/units';
import { wallSectionSvg } from '../src/draw/wallDraw';

interface T { x: number; y: number; w: number; h: number; s: string }
function texts(svg: string): T[] {
  const out: T[] = [];
  const re = /<text x="([\d.\-]+)" y="([\d.\-]+)"[^>]*font-size="([\d.]+)"[^>]*text-anchor="(\w+)"[^>]*?(?:transform="rotate\(([\-\d.]+)[^"]*")?[^>]*>([^<]*)<\/text>/g;
  let m;
  while ((m = re.exec(svg))) {
    const [, xs, ys, fs, an, rot, str] = m;
    const size = +fs, x = +xs, y = +ys;
    const s = str.replace(/&[a-z]+;/g, 'x');
    const w = s.length * size * 0.54;
    let x0 = an === 'middle' ? x - w / 2 : an === 'end' ? x - w : x;
    if (rot && Math.abs(+rot) > 45) out.push({ x: x - size, y: y - w / 2, w: size, h: w, s });
    else out.push({ x: x0, y: y - size * 0.8, w, h: size, s });
  }
  return out;
}
const types: WallType[] = ['cantilever', 'counterfortInt', 'counterfortExt', 'gravityConcrete', 'gravityMasonry', 'masonryReinforced', 'masonryCfInt', 'masonryCfExt', 'gabion'];
it('rótulos de la sección del muro: ninguno fuera del lienzo ni solapado (configuraciones usuales)', () => {
  const fmt = makeFmt('SI');
  const issues = new Map<string, string>();
  const W = 860, H = 580;
  for (const t of types) for (const pool of [false, true]) for (const seis of [false, true]) for (const rebar of [false, true]) for (const view of ['vacia', 'llena', 'llenaSinRelleno'] as const) {
    if (pool && !(t === 'cantilever' || t === 'masonryReinforced')) continue;
    if (!pool && view !== 'llena') continue;
    const w = defaultWall(t);
    if (pool) w.pool = { on: true, hwi: Math.min(1.7, w.H), closed: true };
    if (seis) w.seismic = { on: true, kh: 0.15, kv: 0 };
    let res; try { res = analyzeWall(w, view); } catch { continue; }
    const svg = wallSectionSvg(res, rebar ? { fmt, W, H, showRebar: true, showPressure: false, showLoads: false } : { fmt, W, H, seismic: seis });
    const ts = texts(svg);
    const tag = `${t}${pool ? '+pool:' + view : ''}${seis ? '+sis' : ''}${rebar ? '+armado' : ''}`;
    for (const a of ts) if (a.x < 0 || a.x + a.w > W || a.y < 0 || a.y + a.h > H) issues.set(`${tag}|OUT|${a.s}`, `${tag} FUERA "${a.s}" x=${a.x.toFixed(0)}..${(a.x + a.w).toFixed(0)} y=${a.y.toFixed(0)}`);
    for (let i = 0; i < ts.length; i++) for (let j = i + 1; j < ts.length; j++) {
      const a = ts[i], b = ts[j];
      const ox = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x), oy = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
      if (ox > 3 && oy > 3) issues.set(`${tag}|OV|${a.s}|${b.s}`, `${tag} SOLAPE "${a.s}" × "${b.s}"`);
    }
  }
  expect([...issues.values()]).toEqual([]);
});
