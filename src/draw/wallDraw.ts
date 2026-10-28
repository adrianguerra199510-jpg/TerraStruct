import { WallResults } from '../core/wall';
import { WallType, gabionWidths } from '../core/wallTypes';
import { Fmt } from '../core/units';
import { Pt } from '../core/geometry';
import { Theme, LIGHT, arrow, dimLine, line, poly, polyline, svgWrap, text, heat } from './svg';

export interface WallDrawOpts {
  W?: number;
  H?: number;
  theme?: Theme;
  fmt: Fmt;
  showLoads?: boolean;
  showPressure?: boolean;
  showRebar?: boolean;
  showDims?: boolean;
  seismic?: boolean;
}

export function wallSectionSvg(res: WallResults, o: WallDrawOpts): string {
  const W = o.W ?? 820, H = o.H ?? 560;
  const th = o.theme ?? LIGHT;
  const g = res.geom;
  const inp = res.inp;
  const kd = inp.key.enabled ? inp.key.d : 0;
  const showPress = o.showPressure !== false;
  const caseRes = o.seismic && res.seismicCase ? res.seismicCase : res.staticCase;

  const xL = -Math.max(0.9, 0.25 * g.B);
  const backExt = Math.max(1.6, 0.55 * inp.H);
  const xR = g.B + backExt;
  const yTopW = g.surfaceY(xR);
  const pressH = showPress ? 56 : 0;
  const dimsH = o.showDims !== false ? 58 : 12;
  const topPad = 58;
  const spanX = xR - xL, spanY = yTopW + kd;
  const m = { l: 30, r: 30 };
  const sc = Math.min((W - m.l - m.r) / spanX, (H - topPad - pressH - dimsH - 22) / spanY);
  const ox = m.l + ((W - m.l - m.r) - spanX * sc) / 2;
  const X = (x: number) => ox + (x - xL) * sc;
  const Y = (y: number) => topPad + (yTopW - y) * sc;
  const yBot = -kd - 40 / sc; // el suelo se extiende un poco bajo la zapata / llave
  const P = (p: Pt) => ({ x: X(p.x), y: Y(p.y) });
  const fx = (n: number, q: any = 'len') => o.fmt.u(q, n, 2);
  let s = '';

  s += `<defs><pattern id="wsoil" width="10" height="10" patternUnits="userSpaceOnUse"><rect width="10" height="10" fill="${th.soil}" opacity=".38"/><path d="M0 10 L10 0" stroke="${th.soilStroke}" stroke-width="0.8" opacity=".55"/></pattern>
   <pattern id="wgab" width="16" height="14" patternUnits="userSpaceOnUse"><rect width="16" height="14" fill="#c9c2b6"/><circle cx="4" cy="4" r="3.2" fill="#9d9488"/><circle cx="12" cy="3" r="2.6" fill="#b3ab9e"/><circle cx="8" cy="10" r="3.4" fill="#8a8277"/><circle cx="1" cy="11" r="2.4" fill="#a39b8f"/><circle cx="14" cy="11" r="2.6" fill="#958d81"/></pattern>
  <pattern id="wmas" width="14" height="8" patternUnits="userSpaceOnUse"><rect width="14" height="8" fill="#d7b8a0"/><path d="M0 4 H14 M0 0 V4 M7 4 V8" stroke="#8c5b3f" stroke-width="0.7" fill="none"/></pattern></defs>`;

  // Suelo (perfil del terreno)
  const dep = yBot;
  const ground: Pt[] = [
    { x: xL, y: dep }, { x: xR, y: dep }, { x: xR, y: g.surfaceY(xR) }, { x: g.xBt, y: g.yTop }, { x: g.xFt, y: g.yTop }, { x: g.xFt, y: Math.min(Math.max(inp.Df, g.hb), g.yTop) },
  ];
  // frente: del pie de la pantalla hacia la izquierda a nivel Df
  ground.push({ x: g.xFb, y: Math.max(inp.Df, g.hb) }, { x: xL, y: Math.max(inp.Df, g.hb) });
  s += poly(ground.map(P), 'url(#wsoil)', th.soilStroke, 1.6);

  // Agua
  if (inp.hw > 0) {
    const yw = inp.hw;
    s += `<rect x="${X(g.xBt - 0.0).toFixed(1)}" y="${Y(yw).toFixed(1)}" width="${(X(xR) - X(g.xBb)).toFixed(1)}" height="${((yw - 0) * sc).toFixed(1)}" fill="${th.water}" opacity=".16"/>`;
    s += line(X(g.xBb), Y(yw), X(xR), Y(yw), th.water, 1.8, '7 4');
    s += text(X(xR) - 4, Y(yw) - 5, `N.F. (${fx(yw)})`, { size: 11, fill: th.water, anchor: 'end', weight: 600 });
  }

  // Elementos
  const masonryStem = inp.type === 'gravityMasonry' || inp.type === 'masonryReinforced';
  if (g.basePoly) s += poly(g.basePoly.map(P), inp.type === 'gravityMasonry' ? 'url(#wmas)' : th.concrete, th.concreteStroke, 2);
  if (g.keyPoly) s += poly(g.keyPoly.map(P), th.concrete, th.concreteStroke, 2);
  s += poly(g.stemPoly.map(P), inp.type === 'gabion' ? 'url(#wgab)' : masonryStem ? 'url(#wmas)' : th.concrete, th.concreteStroke, 2);
  if (inp.type === 'gabion') {
    const gw = gabionWidths(inp.gab);
    gw.forEach((w, k) => {
      const xf = g.stemFrontX(k * inp.gab.hc), xb = g.stemBackX(k * inp.gab.hc);
      s += line(X(xf), Y(k * inp.gab.hc), X(xb), Y(k * inp.gab.hc), '#3b362f', 2.2);
      s += `<rect x="${(X((xf + xb) / 2) - 24).toFixed(1)}" y="${(Y((k + 0.5) * inp.gab.hc) - 8).toFixed(1)}" width="48" height="16" rx="4" fill="${th.bg}" opacity=".9"/>`;
      s += text(X((xf + xb) / 2), Y((k + 0.5) * inp.gab.hc) + 4, `${fx(w)}`, { size: 11, fill: th.ink, anchor: 'middle', weight: 700 });
    });
    s += line(X(g.xFt), Y(g.yTop), X(g.xBt), Y(g.yTop), '#3b362f', 2.2);
  }
  if (g.basePoly && g.hb > 0) {
    // oculta la línea de unión pantalla/zapata
    s += line(X(g.xFb) + 1.2, Y(g.hb), X(g.xBb) - 1.2, Y(g.hb), masonryStem ? 'url(#wmas)' : th.concrete, 2.6);
  }
  if (g.cfPoly) {
    s += poly(g.cfPoly.map(P), 'none', th.accent, 2, 'stroke-dasharray="7 4"');
    const c = g.cfPoly;
    const cx = c.reduce((a, p) => a + p.x, 0) / c.length, cy = c.reduce((a, p) => a + p.y, 0) / c.length;
    s += text(X(cx), Y(cy), inp.type === 'counterfortInt' ? 'contrafuerte' : 'contrafuerte', { size: 11, fill: th.accent, anchor: 'middle', weight: 600 });
    s += text(X(cx), Y(cy) + 13, '(fuera del plano)', { size: 9.5, fill: th.accent, anchor: 'middle' });
  }

  // Sobrecarga
  if (inp.fill.q > 0) {
    const n = Math.max(4, Math.round((xR - g.xBt) / 0.5));
    for (let i = 0; i <= n; i++) {
      const x = g.xBt + ((xR - g.xBt - 0.2) * i) / n + 0.1;
      const yS = g.surfaceY(x);
      s += arrow(X(x), Y(yS) - 28, X(x), Y(yS) - 3, th.accent, 1.3, 5);
    }
    s += line(X(g.xBt), Y(g.surfaceY(g.xBt)) - 30, X(xR), Y(g.surfaceY(xR)) - 30, th.accent, 1.2);
    s += text(X((g.xBt + xR) / 2), Y(g.surfaceY((g.xBt + xR) / 2)) - 36, `q = ${o.fmt.u('press', inp.fill.q, 1)}`, { size: 11.5, fill: th.accent, anchor: 'middle', weight: 600 });
  }

  // Empuje (resultantes)
  if (o.showLoads !== false) {
    const plane = res.earth.mode === 'virtual' ? g.B : g.xBb;
    const f = caseRes.h.filter((h) => /Empuje activo|sobrecarga|hidrost|sísmico/i.test(h.name));
    const x0 = Math.max(plane, g.xBb) + 0.9;
    let i = 0;
    for (const h of f) {
      const yy = Y(h.y);
      const xr = (res.earth.mode === 'virtual' ? g.B : g.stemBackX(Math.max(Math.min(h.y - res.earth.y0, inp.H), 0))) + 0.02;
      const dx = Math.min(0.9 + 0.35 * i, 1.7);
      s += arrow(X(xr + dx), yy, X(xr), yy, th.bad, 2, 8);
      s += text(X(xr + dx) + 4, yy + (i % 2 ? 14 : 4), `${h.name.replace('Empuje ', '').replace(' del suelo', '')} = ${o.fmt.u('lforce', h.H, 1)}`, { size: 10.5, fill: th.bad, weight: 600 });
      i++;
    }
    void x0;
  }

  // Presión en la base
  const yb0 = Y(-kd) + 3;
  if (showPress && isFinite(caseRes.qmax) && caseRes.qmax > 0) {
    const qs = caseRes.qmax;
    const nn = 24;
    const top: Pt[] = [];
    for (let i = 0; i <= nn; i++) {
      const x = (g.B * i) / nn;
      top.push({ x: X(x), y: yb0 + (caseRes.qAt(x) / qs) * pressH });
    }
    const pg = [{ x: X(0), y: yb0 }, ...top, { x: X(g.B), y: yb0 }];
    s += poly(pg, heat(0.45), th.concreteStroke, 1.2, 'fill-opacity=".55"');
    for (let i = 1; i < 8; i++) {
      const x = (g.B * i) / 8;
      const q = caseRes.qAt(x);
      if (q > 0.04 * qs) s += arrow(X(x), yb0 + (q / qs) * pressH, X(x), yb0 + 1, th.concreteStroke, 0.9, 4);
    }
    const qT = caseRes.qAt(0), qH = caseRes.qAt(g.B);
    s += text(X(0) + 3, yb0 + (qT / qs) * pressH + 12, o.fmt.u('press', qT, 1), { size: 10.5, fill: th.ink, weight: 600 });
    s += text(X(g.B) - 3, yb0 + (qH / qs) * pressH + 12, o.fmt.u('press', qH, 1), { size: 10.5, fill: th.ink, anchor: 'end', weight: 600 });
  }

  // Armado
  if (o.showRebar) {
    const st = res.design.stem;
    const cov = inp.mat.cover;
    const covF = inp.mat.coverFound;
    const MAIN = th.rebar, SKIN = '#2a9d5c', DIST = '#1d63c7';
    const halo = th.bg;
    const pt = (x: number, y: number) => ({ x: X(x), y: Y(y) });
    const dot = (x: number, y: number, c: string) => `<circle cx="${X(x).toFixed(1)}" cy="${Y(y).toFixed(1)}" r="3" fill="${c}"/>`;
    if (st) {
      const masonry = !!st.masonry;
      const c0 = masonry ? 0.05 : cov; // distancia del eje de la barra a la cara
      const bx = (y: number) => g.stemBackX(y) - c0;
      const fxs = (y: number) => g.stemFrontX(y) + c0;
      const mid = (y: number) => (g.stemBackX(y) + g.stemFrontX(y)) / 2;
      const xv = (y: number) => (st.centered ? mid(y) : bx(y)); // barra vertical principal
      const hook = Math.max(Math.min(st.anchorage.ldh, xv(0) - covF - 0.02), 0.1);
      // barra vertical principal (una sola si hay una capa; del lado del relleno si hay dos)
      s += polyline([pt(xv(inp.H), g.yTop - cov), pt(xv(0), covF + 0.035), pt(xv(0) - hook, covF + 0.035)], MAIN, 3.2);
      // segunda capa: barra de la cara frontal
      if (st.layers === 2) {
        const hk2 = Math.max(Math.min(0.25, xv(0) - fxs(0) - 0.06), 0.08);
        s += polyline([pt(fxs(inp.H), g.yTop - cov), pt(fxs(0), covF + 0.075), pt(fxs(0) + hk2, covF + 0.075)], SKIN, 2.6);
      }
      if (st.yCut) {
        const yc = g.hb + st.yCut;
        const xc = xv(st.yCut);
        s += polyline([pt(xc - 0.05, yc), pt(xc + 0.05, yc)], th.ink, 2);
        s += text(X(xc) + 12, Y(yc) + 4, 'la mitad de las barras se corta aquí', { size: 10, fill: th.muted, halo });
      }
      const ym = g.hb + inp.H * 0.55;
      const vtxt = `Vertical ${st.base.text}${st.centered ? ' (al centro)' : st.layers === 2 ? ' (cada cara)' : ''}`;
      s += text(X(g.stemBackX(inp.H * 0.55)) + 14, Y(ym), vtxt, { size: 11, fill: MAIN, weight: 700, halo });
      if (st.horizOn) s += text(X(g.stemBackX(inp.H * 0.55)) + 14, Y(ym) + 14, `Horizontal ${st.horizontalDet.text}${st.horizLayers === 2 ? ' (cada cara)' : ''}`, { size: 11, fill: DIST, weight: 700, halo });
      else s += text(X(g.stemBackX(inp.H * 0.55)) + 14, Y(ym) + 14, 'Sin barras horizontales', { size: 11, fill: th.muted, weight: 700, halo });
      // barras horizontales (puntos) según capas y separación
      if (st.horizOn) {
        const sp = Math.max(st.horizontalDet.spacing, 0.12);
        for (let y = 0.2; y < inp.H - 0.1; y += sp) {
          if (st.centered) s += dot(mid(y) + 0.03, g.hb + y, DIST);
          else if (st.layers === 2) {
            s += dot(bx(y) - 0.035, g.hb + y, DIST);
            s += dot(fxs(y) + 0.035, g.hb + y, DIST);
          } else s += dot(bx(y) - 0.035, g.hb + y, DIST);
        }
      }
    }
    // zapata: barras principales y de reparto
    if (g.hb > 0.05) {
      const shr = (res.design.toe ?? res.design.heel)?.shrinkDet;
      const spL = Math.max(shr?.spacing ?? 0.3, 0.1);
      const OPP = '#d9822b';
      const dists = (yy: number) => {
        let k = '';
        for (let x = covF + 0.05; x < g.B - covF - 0.02; x += spL) k += dot(x, yy, DIST);
        return k;
      };
      if (res.design.toe && g.xFb > 0.05) {
        const t = res.design.toe;
        const yt = t.face === 'inferior' ? covF : g.hb - covF;
        s += polyline([pt(covF, yt), pt(Math.min(g.xBb + t.ldReq, g.B - covF), yt)], MAIN, 3.2);
        if (t.opp) {
          const yo = t.opp.face === 'inferior' ? covF : g.hb - covF;
          s += polyline([pt(covF, yo), pt(Math.max(g.xFb, covF + 0.1), yo)], OPP, 2.6);
          s += text(X(g.xFb / 2), Y(0) + 15, `Pie, cara opuesta ${t.opp.det.text}`, { size: 10, fill: OPP, weight: 700, anchor: 'middle', halo });
        }
        s += text(X(g.xFb / 2), Y(g.hb) - 9, `Pie ${t.det.text}`, { size: 11, fill: MAIN, weight: 700, anchor: 'middle', halo });
      }
      if (res.design.heel && g.B - g.xBb > 0.05) {
        const h = res.design.heel;
        const yh = h.face === 'superior' ? g.hb - covF : covF;
        s += polyline([pt(Math.max(covF, g.xFb - h.ldReq), yh), pt(g.B - covF, yh)], MAIN, 3.2);
        if (h.opp) {
          const yo = h.opp.face === 'inferior' ? covF : g.hb - covF;
          s += polyline([pt(g.xBb, yo), pt(g.B - covF, yo)], OPP, 2.6);
          s += text(X(g.xBb + (g.B - g.xBb) / 2), Y(0) + 15, `Talón, cara opuesta ${h.opp.det.text}`, { size: 10, fill: OPP, weight: 700, anchor: 'middle', halo });
        }
        s += text(X(g.xBb + (g.B - g.xBb) / 2), Y(g.hb) - 9, `Talón ${h.det.text}`, { size: 11, fill: MAIN, weight: 700, anchor: 'middle', halo });
      }
      if ((res.design.toe || res.design.heel) && inp.mat.footLong) {
        s += dists(covF + 0.06);
        s += dists(g.hb - covF - 0.06);
        s += text(X(g.B / 2) + 40, Y(0) + 30, `Barras longitudinales de la zapata: ${shr?.text ?? ''} (arriba y abajo)`, { size: 10.5, fill: DIST, weight: 700, anchor: 'middle', halo });
      }
    }
    if (res.design.key && g.keyPoly) {
      const kx = inp.key.x + inp.key.b / 2;
      s += polyline([pt(kx, -inp.key.d + covF), pt(kx, g.hb - covF - 0.04)], MAIN, 3);
      s += text(X(kx) + 8, Y(-inp.key.d / 2), `Llave ${res.design.key.slab.det.text}`, { size: 10.5, fill: MAIN, weight: 700, halo });
    }
    // leyenda
    const ly = 44;
    s += polyline([{ x: 16, y: ly }, { x: 46, y: ly }], MAIN, 3.2) + text(54, ly + 4, 'Armadura principal (tracción)', { size: 10.5, fill: th.ink });
    s += polyline([{ x: 16, y: ly + 16 }, { x: 46, y: ly + 16 }], SKIN, 2.6) + text(54, ly + 20, 'Segunda capa (cara frontal)', { size: 10.5, fill: th.ink });
    s += `<circle cx="31" cy="${ly + 32}" r="3" fill="${DIST}"/>` + text(54, ly + 36, 'Armadura horizontal / de reparto (en sección)', { size: 10.5, fill: th.ink });
  }

  // Cotas
  if (o.showDims !== false) {
    const ybd = yb0 + pressH + 22 + (o.showRebar ? 22 : 0);
    // Línea inferior: Lt | tBot | Lh
    if (g.hb > 0) {
      s += dimLine(X(0), ybd, X(g.xFb), ybd, fx(inp.Lt), th.dim, 0, 11);
      s += dimLine(X(g.xFb), ybd, X(g.xBb), ybd, fx(inp.tBot), th.dim, 0, 11);
      if (g.B - g.xBb > 0.01) s += dimLine(X(g.xBb), ybd, X(g.B), ybd, fx(inp.Lh), th.dim, 0, 11);
    } else {
      s += dimLine(X(0), ybd, X(g.xBb), ybd, `B = ${fx(g.xBb)}`, th.dim, 0, 11);
    }
    if (g.hb > 0 && !o.showRebar) s += dimLine(X(0), ybd + 20, X(g.B), ybd + 20, `B = ${fx(g.B)}`, th.dim, 0, 11.5);
    // Altura de la pantalla
    const xh = g.xFt - 0.0;
    if (!o.showRebar && inp.type !== 'gabion') s += dimLine(X(xh) - 22, Y(g.hb), X(xh) - 22, Y(g.yTop), `H = ${fx(inp.H)}`, th.dim, 0, 11.5);
    if (g.hb > 0) s += dimLine(X(g.B) + 14, Y(0), X(g.B) + 14, Y(g.hb), fx(g.hb), th.dim, 0, 10.5);
    if (inp.type !== 'gabion') s += dimLine(X(g.xFt), Y(g.yTop) - 12, X(g.xBt), Y(g.yTop) - 12, fx(inp.tTop), th.dim, 0, 10.5);
    else s += dimLine(X(0) - 26, Y(0), X(0) - 26, Y(g.yTop), `H = ${fx(inp.H)}`, th.dim, 0, 11.5);
    if (inp.Df > 0) s += dimLine(X(xL) + 12, Y(0), X(xL) + 12, Y(Math.max(inp.Df, g.hb)), `Df = ${fx(inp.Df)}`, th.muted, 0, 10.5);
    if (inp.key.enabled) s += dimLine(X(inp.key.x + inp.key.b) + 14, Y(-inp.key.d), X(inp.key.x + inp.key.b) + 14, Y(0), fx(inp.key.d), th.dim, 0, 10);
    if (inp.fill.beta > 0) s += text(X(g.B + backExt * 0.55), Y(g.surfaceY(g.B + backExt * 0.55)) + 20, `β = ${inp.fill.beta}°`, { size: 11, fill: th.soilStroke, weight: 600 });
  }

  s += text(14, 22, `${inp.name} — ${WALL_LABEL[inp.type]}${o.seismic && res.seismicCase ? ' (con sismo)' : ''}`, { size: 13, fill: th.ink, weight: 600 });
  s += text(W - 14, H - 12, 'Valores por metro de muro', { size: 10, fill: th.muted, anchor: 'end' });
  return svgWrap(W, H, s, th.bg);
}

const WALL_LABEL: Record<WallType, string> = {
  cantilever: 'Muro en voladizo',
  counterfortInt: 'Muro con contrafuertes internos',
  counterfortExt: 'Muro con contrafuertes externos',
  gravityConcrete: 'Muro de gravedad de concreto',
  gravityMasonry: 'Muro de gravedad de mampostería',
  masonryReinforced: 'Muro de mampostería reforzada',
  gabion: 'Muro de gaviones',
};

// ---------------------------------------------------------------------------
// Planta de muros con contrafuertes
// ---------------------------------------------------------------------------
export function wallPlanSvg(res: WallResults, o: { W?: number; H?: number; theme?: Theme; fmt: Fmt }): string {
  const W = o.W ?? 820, H = o.H ?? 320;
  const th = o.theme ?? LIGHT;
  const g = res.geom;
  const inp = res.inp;
  const nCf = 4;
  const len = inp.cf.s * (nCf - 1) + inp.cf.t + 2 * Math.min(1.2, inp.cf.s * 0.4);
  const spanY = g.B + 0.8;
  const sc = Math.min((W - 90) / len, (H - 80) / spanY);
  const ox = (W - len * sc) / 2;
  const oy = 46;
  const X = (x: number) => ox + x * sc;
  // y planta: 0 = punta del pie (frente, abajo del dibujo), crece hacia el relleno (arriba)
  const Y = (y: number) => H - 30 - y * sc;
  let s = '';
  s += poly([{ x: X(0), y: Y(g.B) }, { x: X(len), y: Y(g.B) }, { x: X(len), y: Y(0) }, { x: X(0), y: Y(0) }], th.concrete, th.concreteStroke, 1.4, 'fill-opacity=".45"');
  s += `<rect x="${X(0)}" y="${Y(g.xBb)}" width="${(len * sc).toFixed(1)}" height="${((g.xBb - g.xFb) * sc).toFixed(1)}" fill="${th.concrete}" stroke="${th.concreteStroke}" stroke-width="2"/>`;
  const x0 = Math.min(1.2, inp.cf.s * 0.4);
  for (let i = 0; i < nCf; i++) {
    const cx = x0 + i * inp.cf.s;
    if (inp.type === 'counterfortInt') {
      const yb = g.xBb, ye = g.xBb + Math.min(inp.cf.proj, g.B - g.xBb);
      s += `<rect x="${X(cx).toFixed(1)}" y="${Y(ye).toFixed(1)}" width="${(inp.cf.t * sc).toFixed(1)}" height="${((ye - yb) * sc).toFixed(1)}" fill="${th.concrete}" stroke="${th.concreteStroke}" stroke-width="2"/>`;
    } else {
      const yb = g.xFb, ye = g.xFb - Math.min(inp.cf.proj, g.xFb);
      s += `<rect x="${X(cx).toFixed(1)}" y="${Y(yb).toFixed(1)}" width="${(inp.cf.t * sc).toFixed(1)}" height="${((yb - ye) * sc).toFixed(1)}" fill="${th.concrete}" stroke="${th.concreteStroke}" stroke-width="2"/>`;
    }
  }
  const c0 = x0 + inp.cf.t / 2;
  s += dimLine(X(c0), Y(g.B) - 4, X(c0 + inp.cf.s), Y(g.B) - 4, `s = ${o.fmt.u('len', inp.cf.s, 2)}`, th.dim, 16, 11.5, -1);
  s += dimLine(X(x0), Y(g.xBb) + 20, X(x0 + inp.cf.t), Y(g.xBb) + 20, `t = ${o.fmt.u('len', inp.cf.t, 2)}`, th.dim, 0, 10.5);
  s += text(14, 22, 'Planta (vista superior)', { size: 13, fill: th.ink, weight: 600 });
  s += text(14, H - 8, inp.type === 'counterfortInt' ? 'Relleno hacia arriba del dibujo; contrafuertes dentro del relleno.' : 'Relleno hacia arriba del dibujo; contrafuertes en la cara visible.', { size: 10.5, fill: th.muted });
  return svgWrap(W, H, s, th.bg);
}

// ---------------------------------------------------------------------------
// Íconos esquemáticos de cada tipología
// ---------------------------------------------------------------------------
export function wallTypeIcon(t: WallType): string {
  const C = 'var(--primary-soft)';
  const S = 'var(--primary)';
  const soil = 'var(--accent-soft)';
  const so = 'var(--accent)';
  const ground = `<rect x="0" y="62" width="120" height="12" fill="${soil}"/><path d="M0 62H120" stroke="${so}" stroke-width="1.5"/>`;
  const fillR = (x: number) => `<path d="M${x} 20 L120 14 V62 H${x} Z" fill="${soil}" stroke="${so}" stroke-width="1"/>`;
  let body = '';
  switch (t) {
    case 'cantilever':
      body = fillR(66) + `<path d="M52 12 H66 V54 H92 V62 H30 V54 H52 Z" fill="${C}" stroke="${S}" stroke-width="2" stroke-linejoin="round"/>`;
      break;
    case 'counterfortInt':
      body = fillR(66) + `<path d="M52 12 H62 V54 H100 V62 H30 V54 H52 Z" fill="${C}" stroke="${S}" stroke-width="2" stroke-linejoin="round"/><path d="M62 14 L98 54 H62 Z" fill="none" stroke="${S}" stroke-width="1.6" stroke-dasharray="4 3"/>`;
      break;
    case 'counterfortExt':
      body = fillR(70) + `<path d="M58 12 H70 V54 H98 V62 H20 V54 H58 Z" fill="${C}" stroke="${S}" stroke-width="2" stroke-linejoin="round"/><path d="M58 14 L26 54 H58 Z" fill="none" stroke="${S}" stroke-width="1.6" stroke-dasharray="4 3"/>`;
      break;
    case 'gravityConcrete':
      body = fillR(76) + `<path d="M50 14 H66 L80 62 H40 Z" fill="${C}" stroke="${S}" stroke-width="2" stroke-linejoin="round"/><path d="M52 24 l6 -4 M46 40 l10 -5 M56 52 l10 -5" stroke="${S}" stroke-width="1" opacity=".6"/>`;
      break;
    case 'gravityMasonry':
      body = fillR(76) + `<path d="M50 14 H66 L80 62 H40 Z" fill="${C}" stroke="${S}" stroke-width="2" stroke-linejoin="round"/><path d="M46 26 H68 M43 38 H72 M41 50 H76 M56 14 V26 M50 26 V38 M62 26 V38 M46 38 V50 M58 38 V50 M68 38 V50 M54 50 V62 M66 50 V62" stroke="${S}" stroke-width="0.9" opacity=".8"/>`;
      break;
    case 'gabion':
      body = fillR(80) + `<path d="M44 62 V50 H54 V38 H64 V26 H74 V14 H82 L90 62 Z" fill="#cfc8bc" stroke="#5b554c" stroke-width="1.8" stroke-linejoin="round"/><circle cx="58" cy="56" r="3" fill="#8a8277"/><circle cx="70" cy="56" r="3" fill="#8a8277"/><circle cx="68" cy="43" r="3" fill="#8a8277"/><circle cx="78" cy="31" r="3" fill="#8a8277"/><circle cx="58" cy="44" r="2.5" fill="#9d9488"/>`;
      break;
    case 'masonryReinforced':
      body = fillR(64) + `<path d="M52 12 H64 V56 H88 V62 H32 V56 H52 Z" fill="${C}" stroke="${S}" stroke-width="2" stroke-linejoin="round"/><path d="M52 20 H64 M52 28 H64 M52 36 H64 M52 44 H64" stroke="${S}" stroke-width="1" opacity=".7"/><path d="M60 12 V56" stroke="var(--bad)" stroke-width="1.6"/>`;
      break;
  }
  return `<svg viewBox="0 0 120 74" xmlns="http://www.w3.org/2000/svg">${ground}${body}</svg>`;
}
