import { PileInput } from '../core/pileTypes';
import { PileResults, ComboRes } from '../core/pile';
import { PILE_KINDS } from '../core/pileTypes';
import { concreteCurve, hpShape } from '../core/pileStruct';
import { COLUMN_SHAPES, columnPoly } from '../core/shapes';
import { findBar } from '../core/materials';
import { bbox } from '../core/geometry';
import { Fmt } from '../core/units';
import { ProjectInfo } from '../state';
import { DocBuilder, ReportDoc } from './model';
import { LIGHT, lineChart } from '../draw/svg';
import { pilePlanSvg, pileRebarPlanSvg, pileSectionSvg } from '../draw/pileDraw';

export function pileBlocks(inp: PileInput, res: PileResults, fmt: Fmt, d: DocBuilder) {
  const u = fmt.u;
  const n = fmt.n;
  const f = fmt.d;
  const th = LIGHT;
  const p = inp.pile;
  const cap = inp.cap;
  const kind = PILE_KINDS.find((k) => k.id === p.kind)!.label.toLowerCase();
  const steel = p.kind !== 'concrete';
  const rect = res.capRect;

  // ------------------------------------------------------------------ 1
  d.h1('Generalidades');
  d.h2('Objeto y alcance');
  d.p(
    `Esta memoria presenta el análisis y diseño del grupo de ${res.n} ${kind}${res.n > 1 ? 's' : ''} y del cabezal «${inp.name}». Se determina la reacción de cada pilote con el método elástico del cabezal rígido, se verifican la capacidad geotécnica y estructural de los pilotes (compresión, tracción, flexión por carga lateral y cortante) y se diseña el cabezal por flexión, cortante y punzonamiento según ACI 318.`,
    { align: 'justify' },
  );
  d.h2('Normas y referencias');
  d.bullets([
    'ACI 318-14 / 318-19: concreto estructural; cap. 13 (cimentaciones sobre pilotes) y cap. 22 (cortante y punzonamiento).',
    steel ? 'AISC 360: Specification for Structural Steel Buildings, método LRFD (cap. E, F, H).' : 'ACI 318: resistencia de elementos a compresión con flexión (diagrama de interacción por compatibilidad de deformaciones).',
    'API RP 2GEO / Bowles / Das: capacidad de carga axial de pilotes (método α para arcillas, método β / K·tanδ para arenas).',
    'Matlock y Reese (1961): pilotes cargados lateralmente con módulo de reacción creciente linealmente nh.',
  ]);
  d.h2('Hipótesis de cálculo');
  d.bullets([
    'El cabezal es infinitamente rígido y los pilotes se comportan elásticamente: Ri = P/n + Mx·(yi−ȳ)/… (ecuaciones de flexión biaxial del grupo).',
    'Las cargas se aplican en la cara superior del cabezal; el cortante genera un momento adicional V·h respecto al plano de las cabezas de los pilotes.',
    'La fuerza horizontal se reparte por igual entre los pilotes (cabezal rígido, mismo comportamiento lateral).',
    'La capacidad geotécnica a compresión es Qa = (Qs + Qb)/FS; en tracción solo interviene la fricción lateral reducida más el peso del pilote.',
    'El diseño del cabezal usa las reacciones producidas por las cargas mayoradas de la columna (sin peso propio). Se aplica la regla de ACI 318 de contribución fraccionada de los pilotes que cruzan la sección crítica.',
    'No se consideran asentamientos del grupo ni efectos de pandeo del pilote por licuación; la flexión del pilote se estima con el modelo lineal de Matlock y Reese.',
  ]);
  d.h2('Convención de signos y unidades');
  d.p(`Unidades: ${fmt.sys === 'SI' ? 'kN, m, kPa, MPa' : 'tonf, m, tonf/m², kgf/cm²'}. P positiva hacia abajo; Mx (My) aumenta la reacción de los pilotes con y (x) positiva. R positiva = compresión en el pilote; negativa = tracción.`);

  // ------------------------------------------------------------------ 2
  d.h1('Datos de entrada');
  d.h2('Pilote');
  const pk: [string, string][] = [['Tipo', PILE_KINDS.find((k) => k.id === p.kind)!.label], ['Sección', res.props.label], ['Longitud embebida L', u('len', p.L, 2)], ['Longitud libre sobre el terreno', u('len', p.Lu, 2)]];
  if (p.kind === 'concrete') {
    const bar = findBar(p.bar);
    pk.push(['f′c del pilote', u('stress', p.fc, 1)], ['fy del refuerzo', u('stress', p.fy, 0)], ['Refuerzo longitudinal', `${p.nBars} ${bar.id} (${f(res.conc!.ratio.Ast, 1)} cm², ρ = ${f(res.conc!.ratio.rho * 100, 2)} %)`], ['Refuerzo transversal', `${p.tieBar} @ ${f(p.tieS * 100, 0)} cm (${p.spiral ? 'espiral' : 'estribos'})`], ['Recubrimiento', u('lencm', p.cover, 1)]);
  } else {
    pk.push(['Fy del acero', u('stress', p.Fy, 0)], ['Pérdida por corrosión por cara', `${f(p.tc * 1000, 1)} mm`], ['Área neta A', `${f(res.props.A * 1e4, 1)} cm²`], ['Módulo plástico Z', `${f(res.props.Z * 1e6, 0)} cm³`], ['Radio de giro r', `${f(res.props.r * 100, 2)} cm`]);
    if (p.kind === 'hpile') pk.push(['Perfil', `${p.hp} (d = ${f(hpShape(p.hp).d * 25.4, 0)} mm, bf = ${f(hpShape(p.hp).bf * 25.4, 0)} mm); propiedades sin filetes`]);
  }
  pk.push(['Cabeza', p.head === 'fixed' ? 'Empotrada en el cabezal' : 'Libre'], ['nh (reacción horizontal del suelo)', `${f(p.nh, 0)} kN/m³`], ['Deflexión lateral admisible', `${f(p.yAllow * 1000, 1)} mm`]);
  d.kv(pk, 2);

  d.h2('Distribución de los pilotes y cabezal');
  d.table(
    ['Pilote', `x (${fmt.l('len')})`, `y (${fmt.l('len')})`],
    res.pts.map((q, i) => [String(i + 1), n('len', q.x, 3), n('len', q.y, 3)]),
    { align: ['c', 'r', 'r'], widths: [4, 8, 8], caption: 'Tabla. Coordenadas de los pilotes' },
  );
  d.kv(
    [
      ['Dimensiones del cabezal B × L', `${u('len', rect.B, 2)} × ${u('len', rect.L, 2)}`],
      ['Espesor h', u('len', cap.h, 2)],
      ['f′c / fy del cabezal', `${u('stress', cap.fc, 1)} / ${u('stress', cap.fy, 0)}`],
      ['Recubrimiento / penetración del pilote', `${u('lencm', cap.cover, 1)} / ${u('lencm', cap.embed, 1)}`],
      ['Peso propio del cabezal', u('force', res.Wcap, 1)],
      ['Separación mínima entre pilotes', `${u('len', res.minSpacing, 2)} (${f(res.minSpacing / res.props.Dp, 1)}·D)`],
    ],
    2,
  );
  const cg = inp.column.geom;
  const cb = bbox(columnPoly(cg, inp.column.x, inp.column.y));
  d.p(`Columna: ${COLUMN_SHAPES.find((c) => c.id === cg.shape)?.label ?? cg.shape}, de ${f((cb.xmax - cb.xmin) * 100, 0)} × ${f((cb.ymax - cb.ymin) * 100, 0)} cm, ubicada en (${n('len', inp.column.x, 2)}; ${n('len', inp.column.y, 2)}) ${fmt.l('len')}.`);
  d.img(pilePlanSvg(inp, res, { W: 800, H: 560, theme: th, fmt, showDims: true }), 'Figura 1. Planta del cabezal, pilotes y columna.');
  d.h2('Cargas (envolvente de servicio y última)');
  d.table(
    ['Combinación', 'Tipo', `P (${fmt.l('force')})`, `Vx (${fmt.l('force')})`, `Vy (${fmt.l('force')})`, `Mx (${fmt.l('moment')})`, `My (${fmt.l('moment')})`, 'Aum. Qa'],
    inp.combos.map((c) => [c.name, c.kind === 'service' ? 'ES' : 'EU', n('force', c.P, 1), n('force', c.Vx, 1), n('force', c.Vy, 1), n('moment', c.Mx, 1), n('moment', c.My, 1), c.kind === 'service' ? f(c.qaFactor, 2) : '—']),
    { align: ['l', 'l', 'r', 'r', 'r', 'r', 'r', 'r'], caption: 'Tabla. Cargas de la columna en la cara superior del cabezal' },
  );

  // ------------------------------------------------------------------ 3
  d.h1('Capacidad geotécnica del pilote');
  const g = res.geo;
  if (g.mode === 'user') {
    d.p(`Se adoptan las capacidades admisibles suministradas por el estudio geotécnico: a compresión Qa = ${u('force', g.QaC, 0)} y a tracción Qta = ${u('force', g.QaT, 0)} por pilote.`);
  } else {
    d.h2('Método estático');
    d.eq(
      [
        'Qs = Σ fs · p · Δz   (p = perímetro, Δz = 0.25 m)',
        'Arcilla:  fs = α · su   (α por API: 0.5·(su/σ′v)^-0.5 si su/σ′v ≤ 1; 0.5·(su/σ′v)^-0.25 si > 1)',
        `Arena:  fs = K · σ′v · tan δ ≤ fs,máx   (δ = ${p.kind === 'concrete' ? '0.75 φ' : 'φ − 5°'}; σ′v limitada a la profundidad crítica 15·D)`,
        'Qb = qb · Ab   (arcilla: qb = 9·su; arena: qb = Nq·σ′v ≤ qb,máx)',
        'Qa = (Qs + Qb) / FS      Qta = η·Qs / FSt + Wpilote',
      ],
      'Ecuaciones',
    );
    d.table(
      ['Estrato', `z desde (${fmt.l('len')})`, `z hasta (${fmt.l('len')})`, `fs medio (${fmt.l('press')})`, `Qs (${fmt.l('force')})`, 'Criterio'],
      g.rows.map((r) => [r.layer, n('len', r.z0, 2), n('len', r.z1, 2), n('press', r.fs, 1), n('force', r.Qs, 0), r.note]),
      { align: ['l', 'r', 'r', 'r', 'r', 'l'], caption: 'Tabla. Fricción lateral por estrato' },
    );
    d.kv(
      [
        ['Perímetro p', u('len', g.perim, 3)],
        ['Área de punta Ab', `${f(g.Atip, 4)} m²`],
        ['Resistencia lateral Qs', u('force', g.Qs, 0)],
        ['Resistencia por punta Qb', `${u('force', g.Qb, 0)} (${g.qbNote})`],
        ['Capacidad última Qu', u('force', g.Qult, 0)],
        [`Qa = Qu / ${f(inp.geo.FS, 1)}`, u('force', g.QaC, 0)],
        [`Qta = ${f(inp.geo.etaT, 2)}·Qs / ${f(inp.geo.FSt, 1)} + W`, `${u('force', g.QaT, 0)} (W = ${u('force', g.Wpile, 0)})`],
      ],
      1,
    );
  }
  if (res.Eg.applicable) {
    d.p(`Eficiencia de grupo (Converse–Labarre): Eg = ${f(res.Eg.Eg, 3)}${inp.geo.groupEff ? `; Qa del grupo = ${u('force', res.QaCeff, 0)} por pilote.` : ' (informativa, no aplicada a la capacidad).'}`);
  }

  // ------------------------------------------------------------------ 4
  d.h1('Reacciones en los pilotes');
  d.eq(
    [
      'Ptot = P + Wcabezal',
      'Ri = Ptot/n + a·(xi − x̄) + b·(yi − ȳ)',
      'Σ Ri (xi − x̄) = Qx − Ptot·x̄ ;  Σ Ri (yi − ȳ) = Qy − Ptot·ȳ',
      'Qx = P·xc + My + Vx·h + W·xW ;  Qy = P·yc + Mx + Vy·h + W·yW',
    ],
    'Método elástico del cabezal rígido',
  );
  d.h2('Combinaciones de servicio');
  d.table(
    ['Combinación', `Ptot (${fmt.l('force')})`, `R máx (${fmt.l('force')})`, `R mín (${fmt.l('force')})`, `Qa adm. (${fmt.l('force')})`, 'R máx / Qa'],
    res.service.map((s) => [s.combo.name, n('force', s.Ptot, 0), n('force', s.Rmax, 0), n('force', s.Rmin, 0), n('force', res.QaCeff * s.combo.qaFactor, 0), f(s.ratioC, 2)]),
    { align: ['l', 'r', 'r', 'r', 'r', 'r'], caption: 'Tabla. Reacciones de servicio' },
  );
  const gs = res.service.reduce<ComboRes | null>((a, b) => (!a || b.ratioC > a.ratioC ? b : a), null);
  if (gs) d.img(pilePlanSvg(inp, res, { W: 800, H: 560, theme: th, fmt, combo: gs, showDims: false }), `Figura 2. Reacciones de los pilotes — ${gs.combo.name} (azul = tracción).`);
  d.h2('Combinaciones últimas');
  d.table(
    ['Combinación', `Pu máx (${fmt.l('force')})`, `Pu mín (${fmt.l('force')})`, `Hu por pilote (${fmt.l('force')})`, `Mu cabeza (${fmt.l('moment')})`],
    res.ultimate.map((s) => [s.combo.name, n('force', s.Pu?.max ?? 0, 0), n('force', s.Pu?.min ?? 0, 0), n('force', s.Hpile, 1), n('moment', s.Mu ?? 0, 1)]),
    { align: ['l', 'r', 'r', 'r', 'r'], caption: 'Tabla. Reacciones últimas (incluye 1.2·W del cabezal en compresión y 0.9·W en tracción)' },
  );

  // ------------------------------------------------------------------ 5
  d.h1('Análisis lateral y diseño estructural del pilote');
  d.h2('Comportamiento lateral (Matlock–Reese)');
  d.eq(
    [
      `T = (EI / nh)^(1/5) = (${f(res.props.EI, 0)} / ${f(p.nh, 0)})^0.2 = ${f(res.lateral.T, 2)} m`,
      `y = ${p.head === 'fixed' ? '0.93' : '2.435'}·H·T³ / EI${p.Lu > 0 ? ' + deformación del tramo libre' : ''}`,
      `M = ${p.head === 'fixed' ? '0.93·H·T (en la cabeza, empotrada)' : '0.77·H·T (máximo en el fuste)'}${p.Lu > 0 ? ' — con tramo libre: M = H·(Lu + 1.85·T)/2' : ''}`,
    ],
    'Ecuaciones',
  );
  d.p(`Deflexión máxima de servicio: ${f(res.lateral.y * 1000, 2)} mm (${res.lateral.combo}); admisible ${f(p.yAllow * 1000, 1)} mm.`);
  if (p.kind === 'concrete') {
    d.h2('Pilote de concreto reforzado');
    d.eq(
      [
        `φPn,máx = ${p.spiral ? '0.75·0.85' : '0.65·0.80'}·[0.85·f′c·(Ag − Ast) + fy·Ast] = ${n('force', res.conc!.phiPnMax, 0)} ${fmt.l('force')}`,
        `φPt = 0.90·fy·Ast = ${n('force', -res.conc!.phiPt, 0)} ${fmt.l('force')} (tracción)`,
        'Interacción P–M: compatibilidad de deformaciones, εcu = 0.003, bloque de Whitney, φ variable según εt.',
        'φVn = φ·[0.17·(1 + Nu/14Ag)·√f′c·bw·d + Av·fyt·d/s],  bw = D,  d = 0.8·D',
      ],
      'Resistencias',
    );
    const cv = concreteCurve(p);
    const phiC = p.spiral ? 0.75 : 0.65;
    const xs = [0, ...cv.pts.map((q) => q.phi * q.Mn), 0];
    const ys = [res.conc!.phiPt, ...cv.pts.map((q) => Math.min(q.phi * q.Pn, phiC * cv.PnMax)), phiC * cv.PnMax];
    const dispF = (v: number) => fmt.n('force', v, 0);
    const dispM = (v: number) => fmt.n('moment', v, 0);
    const ser = [{ name: 'φPn–φMn', xs: xs.map((v) => +dispM(v)), ys: ys.map((v) => +dispF(v)), color: th.concreteStroke }];
    const pts = res.ultimate.flatMap((s) => (s.Pu ? [{ P: s.Pu.max, M: s.Mu ?? 0 }] : []));
    if (pts.length) ser.push({ name: 'Demanda (Pu máx)', xs: pts.map((q) => +dispM(q.M)).concat(+dispM(pts[0].M)), ys: pts.map((q) => +dispF(q.P)).concat(+dispF(pts[0].P)), color: th.bad });
    d.img(lineChart({ w: 640, h: 360, theme: th, series: ser, xLabel: `φMn (${fmt.l('moment')})`, yLabel: `φPn (${fmt.l('force')})`, title: 'Diagrama de interacción del pilote' }), 'Figura 3. Diagrama de interacción φPn–φMn del pilote.', 0.8);
    if (res.worstC) d.p(`Condición crítica a compresión: ${res.worstC.res.combo.name}, Pu = ${n('force', res.worstC.Pu, 0)} ${fmt.l('force')}, Mu = ${n('moment', res.worstC.Mu, 1)} ${fmt.l('moment')}, φMn(Pu) = ${n('moment', res.worstC.phiMn, 1)} ${fmt.l('moment')} → relación ${f(res.worstC.ratio, 2)}.`);
    if (res.worstT) d.p(`Condición crítica a tracción: ${res.worstT.res.combo.name}, Pu = ${n('force', res.worstT.Pu, 0)} ${fmt.l('force')}, relación ${f(res.worstT.ratio, 2)}.`);
    if (res.shear) d.p(`Cortante: Vu = ${n('force', res.shear.Vu, 1)} ${fmt.l('force')} ≤ φVn = ${n('force', res.shear.phiVn, 0)} ${fmt.l('force')} con ${res.shear.text}.`);
  } else {
    const s = res.steel!;
    d.h2('Pilote de acero');
    d.eq(
      [
        `KL/r = ${f(s.KLr, 1)} ;  Fe = π²·E/(KL/r)² = ${s.Fe === Infinity ? '∞' : f(s.Fe, 0)} MPa`,
        'Fcr = 0.658^(Fy/Fe)·Fy  si KL/r ≤ 4.71·√(E/Fy);  Fcr = 0.877·Fe  en otro caso',
        `φPn = 0.90·Fcr·Ag = ${n('force', s.phiPn, 0)} ${fmt.l('force')} ;  φPt = 0.90·Fy·Ag = ${n('force', s.phiPt, 0)} ${fmt.l('force')}`,
        `φMn = 0.90·Fy·Z = ${n('moment', s.phiMn, 1)} ${fmt.l('moment')} (sección compacta: ${s.compact ? 'sí' : 'no'})`,
        'Interacción AISC H1-1:  Pr/Pc ≥ 0.2 → Pr/Pc + (8/9)·Mr/Mc ≤ 1;  Pr/Pc < 0.2 → Pr/(2Pc) + Mr/Mc ≤ 1',
      ],
      'Resistencias',
    );
    if (res.worstC) d.p(`Condición crítica a compresión: ${res.worstC.res.combo.name}, Pu = ${n('force', res.worstC.Pu, 0)} ${fmt.l('force')}, Mu = ${n('moment', res.worstC.Mu, 1)} ${fmt.l('moment')} → ${res.worstC.eq}: relación ${f(res.worstC.ratio, 2)}.`);
    if (res.worstT) d.p(`Condición crítica a tracción: ${res.worstT.res.combo.name}, Pu = ${n('force', res.worstT.Pu, 0)} ${fmt.l('force')} → relación ${f(res.worstT.ratio, 2)}.`);
  }

  // ------------------------------------------------------------------ 6
  d.h1('Diseño del cabezal');
  d.h2('Flexión');
  d.eq(
    [
      'Mu = Σ Ri · fi · (xi − x_cara)   (pilotes fuera de la cara de la columna; fi = fracción por ACI 318)',
      'Rn = Mu/(φ·b·d²) ;  ρ = (0.85f′c/fy)·(1 − √(1 − 2Rn/0.85f′c)) ;  As = ρ·b·d',
      `As,mín = ${f(0.0018 * 420 / cap.fy > 0.0014 ? 0.0018 * 420 / cap.fy : 0.0014, 5)}·b·h (retracción y temperatura) ;  s máx = mín(3h, 45 cm)`,
    ],
    'Ecuaciones',
  );
  const rows: string[][] = [];
  for (const [a, fl] of [['X', res.flexX], ['Y', res.flexY]] as const) {
    if (!fl) continue;
    rows.push([`Barras en ${a} (inferior)`, f(fl.d, 3), n('moment', fl.Mpos, 0), f(fl.AsReq, 1), f(fl.AsMin, 1), fl.det.text, f(fl.asProv, 1), f(fl.ratio, 2), fl.ok ? 'Cumple' : 'No cumple']);
    if (fl.top) rows.push([`Barras en ${a} (superior)`, f(fl.dTop, 3), n('moment', fl.top.Mu, 0), f(fl.top.AsReq, 1), f(fl.AsMin, 1), fl.top.det.text, f(fl.top.asProv, 1), f(fl.top.ratio, 2), fl.top.ok ? 'Cumple' : 'No cumple']);
  }
  d.table(['Refuerzo', 'd (m)', `Mu (${fmt.l('moment')})`, 'As req (cm²)', 'As mín (cm²)', 'Colocado', 'As prov (cm²)', 'Relación', 'Estado'], rows, { align: ['l', 'r', 'r', 'r', 'r', 'l', 'r', 'r', 'c'], small: true, caption: 'Tabla. Diseño por flexión del cabezal' });
  d.h2('Cortante en una dirección');
  d.eq(['Vu = Σ Ri · fi  (pilotes más allá de la sección a d de la cara)', 'φVc = 0.75·0.17·λ·√f′c·bw·d  (ACI 318-14)  ó  0.66·λs·λ·ρw^(1/3)·√f′c·bw·d  (ACI 318-19)'], 'Ecuaciones');
  d.table(
    ['Dirección', 'bw (m)', 'd (m)', `Vu (${fmt.l('force')})`, `φVc (${fmt.l('force')})`, 'Relación', 'Estado'],
    ([['X', res.shearX], ['Y', res.shearY]] as const).filter((x) => x[1]).map(([a, s]) => [a, f(s!.bw, 2), f(s!.d, 3), n('force', s!.Vu, 0), n('force', s!.phiVc, 0), f(s!.ratio, 2), s!.ok ? 'Cumple' : 'No cumple']),
    { align: ['l', 'r', 'r', 'r', 'r', 'r', 'c'], caption: 'Tabla. Cortante en una dirección' },
  );
  d.h2('Punzonamiento');
  d.eq(['Columna: perímetro crítico a d/2;  Vu = Pu − Σ Ri·(1 − fi) (pilotes dentro del perímetro)', 'vu = Vu/(bo·d) ≤ φ·vc,  vc = mín[0.33λ√f′c ; 0.17(1 + 2/β)λ√f′c ; 0.083(αs·d/bo + 2)λ√f′c]', 'Pilote: perímetro a d/2 del pilote, recortado por los bordes del cabezal; Ru = reacción última del pilote.'], 'Ecuaciones');
  const pr: string[][] = [];
  if (res.punch) pr.push(['Columna', f(res.punch.bo, 2), f(res.punch.d, 3), n('force', res.punch.Vu, 0), f(res.punch.vu, 2), f(res.punch.phivc, 2), f(res.punch.ratio, 2), res.punch.ok ? 'Cumple' : 'No cumple']);
  const wp = res.pilePunch.reduce<(typeof res.pilePunch)[number] | null>((a, b) => (!a || b.ratio > a.ratio ? b : a), null);
  if (wp) pr.push([`Pilote ${wp.i + 1} (crítico)`, f(wp.bo, 2), f(res.punch?.d ?? 0, 3), n('force', wp.Ru, 0), f(wp.vu, 2), f(wp.phivc, 2), f(wp.ratio, 2), wp.ok ? 'Cumple' : 'No cumple']);
  d.table(['Elemento', 'bo (m)', 'd (m)', `V (${fmt.l('force')})`, 'vu (MPa)', 'φvc (MPa)', 'Relación', 'Estado'], pr, { align: ['l', 'r', 'r', 'r', 'r', 'r', 'r', 'c'], caption: 'Tabla. Punzonamiento' });
  d.p('El efecto del momento no balanceado en el punzonamiento ya está incluido en las reacciones diferenciales de los pilotes que se usan para calcular Vu.', { small: true, italic: true });
  d.h2('Desarrollo del refuerzo');
  d.table(
    ['Dirección', 'ld recto (cm)', 'ldh gancho (cm)', 'Disponible (cm)', 'Resultado'],
    ([['X', res.flexX], ['Y', res.flexY]] as const).filter((x) => x[1]).map(([a, fl]) => [a, f(fl!.ld * 100, 0), f(fl!.ldh * 100, 0), f(fl!.la * 100, 0), fl!.devText]),
    { align: ['l', 'r', 'r', 'r', 'l'], caption: 'Tabla. Longitud de desarrollo desde la cara de la columna hasta el borde del cabezal' },
  );

  // ------------------------------------------------------------------ 7
  d.h1('Cuadro de armado y planos');
  const arm: string[][] = [];
  if (res.flexX) arm.push(['Cabezal — inferior en X', res.flexX.det.text, f(res.flexX.asProv, 1)]);
  if (res.flexY) arm.push(['Cabezal — inferior en Y', res.flexY.det.text, f(res.flexY.asProv, 1)]);
  if (res.flexX?.top) arm.push(['Cabezal — superior en X', res.flexX.top.det.text, f(res.flexX.top.asProv, 1)]);
  if (res.flexY?.top) arm.push(['Cabezal — superior en Y', res.flexY.top.det.text, f(res.flexY.top.asProv, 1)]);
  if (p.kind === 'concrete') {
    arm.push(['Pilote — longitudinal', `${p.nBars} ${p.bar}`, f(res.conc!.ratio.Ast, 1)], ['Pilote — transversal', `${p.tieBar} @ ${f(p.tieS * 100, 0)} cm (${p.spiral ? 'espiral' : 'estribos'})`, '—']);
  } else arm.push(['Pilote', res.props.label, f(res.props.A * 1e4, 1)]);
  d.table(['Elemento', 'Armado', 'As (cm²) / cm² por m'], arm, { align: ['l', 'l', 'r'], caption: 'Tabla. Cuadro de armado' });
  d.img(pileRebarPlanSvg(inp, res, { W: 800, H: 560, theme: th, fmt }), 'Figura. Planta de armado inferior del cabezal.');
  if (cap.topSteel) d.img(pileRebarPlanSvg(inp, res, { W: 800, H: 560, theme: th, fmt, layer: 'top' }), 'Figura. Planta de armado superior del cabezal.');
  d.img(pileSectionSvg(inp, res, { W: 800, H: 520, theme: th, fmt }), 'Figura. Sección del cabezal y pilotes.', 0.92);
  d.kv([['Volumen de concreto del cabezal', `${f(res.concreteVolume, 2)} m³`], ['Longitud total de pilotes', `${f(res.pileLength, 1)} m`]], 1);

  d.h1('Resumen de verificaciones');
  d.status(res.checks.map((c) => ({ name: c.name, detail: c.detail, ratio: c.ratio, ok: c.ok, advisory: c.advisory })));
  d.p(res.ok ? 'CONCLUSIÓN: el grupo de pilotes y el cabezal cumplen todas las verificaciones realizadas.' : 'CONCLUSIÓN: alguna verificación NO se cumple; modifique el número de pilotes, la sección, la longitud o el armado.', { bold: true });
  if (res.warnings.length) {
    d.h2('Advertencias');
    d.bullets(res.warnings);
  }
  d.h2('Limitaciones');
  d.bullets([
    'La capacidad geotécnica es una estimación estática con parámetros ingresados; debe contrastarse con el estudio geotécnico y, de ser posible, con pruebas de carga.',
    'No se calculan asentamientos del grupo, fricción negativa ni licuación.',
    'La interacción lateral entre pilotes (efecto sombra) no se incluye; para separaciones menores de 8D conviene reducir la reacción lateral con factores p-múltiples.',
    'El método de flexión y cortante del cabezal es el de viga; para cabezales profundos (a/d < 2) debe verificarse con puntales y tirantes.',
  ]);
}

export function buildPileReport(inp: PileInput, res: PileResults, fmt: Fmt, info: ProjectInfo): ReportDoc {
  const d = new DocBuilder();
  pileBlocks(inp, res, fmt, d);
  return { title: `Diseño de pilotes y cabezal ${inp.name}`, subtitle: 'Cimentación profunda — ACI 318 / AISC 360', info, blocks: d.blocks, footer: `TerraStruct · ${inp.name}` };
}
