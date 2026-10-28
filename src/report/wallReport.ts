import { WallResults } from '../core/wall';
import { WALL_TYPES, WallInput, gabionGamma, gabionWidths, isCounterfort, isGravity, isMasonry, isMasonryStem } from '../core/wallTypes';
import { Fmt } from '../core/units';
import { PHI_FLEX, PHI_SHEAR, PHI_PLAIN } from '../core/concrete';
import { ProjectInfo } from '../state';
import { DocBuilder, ReportDoc } from './model';
import { DARK, LIGHT, lineChart } from '../draw/svg';
import { wallPlanSvg, wallSectionSvg } from '../draw/wallDraw';
import { CaseResult } from '../core/wallStability';
import { rad } from '../core/earth';

export function wallBlocks(res: WallResults, fmt: Fmt, d: DocBuilder) {
  const inp: WallInput = res.inp;
  const g = res.geom;
  const u = fmt.u;
  const n = fmt.n;
  const f = fmt.d;
  const th = LIGHT;
  void DARK;
  const typeLabel = WALL_TYPES.find((t) => t.id === inp.type)!.label;
  const des = res.design;
  const cm = (v: number) => `${f(v * 100, 1)} cm`;

  // ------------------------------------------------------------------ 1
  d.h1('Generalidades');
  d.h2('Objeto y alcance');
  d.p(
    `Esta memoria presenta el análisis de estabilidad y el diseño estructural del muro de retención «${inp.name}», tipología: ${typeLabel.toLowerCase()}. ` +
      `Se determinan los empujes de tierra (${res.earth.mode === 'virtual' ? 'Rankine' : 'Coulomb'}${inp.seismic.on ? ' y Mononobe–Okabe para sismo' : ''}), se verifican el volcamiento, el deslizamiento y las presiones sobre el suelo, y se dimensiona el refuerzo o se verifican los esfuerzos de cada elemento. ` +
      'Todos los valores son por metro lineal de muro.',
    { align: 'justify' },
  );
  d.h2('Normas y referencias');
  const refs = ['ACI 318 (diseño de concreto reforzado y concreto simple) y ASCE 7 (combinaciones de carga).', 'Bowles, J.E., Foundation Analysis and Design; Das, B.M., Principles of Foundation Engineering (empuje de tierras, estabilidad y capacidad portante).'];
  if (isMasonry(inp.type)) refs.push('TMS 402 / ACI 530 (diseño de mampostería).');
  if (inp.seismic.on) refs.push('Okabe (1926), Mononobe y Matsuo (1929); Seed y Whitman (1970): empuje sísmico del suelo.');
  d.bullets(refs);
  d.h2('Hipótesis de cálculo');
  const hyp = [
    'Problema plano por metro de muro. Los momentos se toman respecto a la punta del pie en la cara inferior de la zapata.',
    res.earth.mode === 'virtual'
      ? 'Empuje activo de Rankine sobre un plano vertical virtual que pasa por el extremo del talón; el peso del suelo sobre el talón se suma a las cargas verticales.'
      : 'Empuje activo de Coulomb sobre la cara posterior real del muro con fricción muro–suelo δ; su componente vertical colabora a la estabilidad.',
    'El empuje pasivo frontal se usa únicamente en el deslizamiento (reducido por un factor) y no en el volcamiento ni en las presiones de contacto.',
    'Presión de contacto lineal; si la resultante cae fuera del tercio medio se supone contacto parcial sin tracción.',
    'Las combinaciones de resistencia usan factores de carga editables (por defecto 1.2D + 1.6L + 1.6H; 0.9D + 1.6H; y con sismo 1.2D + L + 1.6H + 1.0E).',
    'No se verifica la estabilidad global (talud, deslizamiento profundo) ni asentamientos.',
  ];
  if (inp.hw > 0) hyp.push('Se considera un nivel freático en el relleno: empuje hidrostático, pesos saturados y subpresión lineal bajo la base.');
  if (inp.key.enabled) hyp.push('La llave de corte se calcula con empuje pasivo reducido y, si se indica, con fricción suelo–suelo (tan φ) en la interfaz de deslizamiento.');
  d.bullets(hyp);
  d.p(`Unidades: ${fmt.sys === 'SI' ? 'kN, m, kPa, MPa' : 'tonf, m, tonf/m², kgf/cm²'}. Las fórmulas del ACI se evalúan internamente en MPa.`, { small: true });

  // ------------------------------------------------------------------ 2
  d.h1('Datos de entrada');
  d.h2('Geometría');
  d.kv(
    [
      ['Altura de la pantalla H', u('len', inp.H, 2)],
      ['Espesor en la corona', u('len', inp.tTop, 2)],
      ['Espesor en la base', u('len', inp.tBot, 2)],
      ['Longitud del pie', u('len', g.xFb, 2)],
      ['Longitud del talón', u('len', g.B - g.xBb, 2)],
      ['Espesor de la zapata', u('len', g.hb, 2)],
      ['Ancho total de la base B', u('len', g.B, 2)],
      ['Altura de terreno al frente Df', u('len', inp.Df, 2)],
      ...(inp.key.enabled ? ([['Llave: posición / ancho / profundidad', `${u('len', inp.key.x, 2)} / ${u('len', inp.key.b, 2)} / ${u('len', inp.key.d, 2)}`]] as [string, string][]) : []),
      ...(isCounterfort(inp.type)
        ? ([
            ['Separación de contrafuertes s', u('len', inp.cf.s, 2)],
            ['Espesor de contrafuertes', u('len', inp.cf.t, 2)],
            ['Proyección base / corona', `${u('len', inp.cf.proj, 2)} / ${u('len', inp.cf.projTop, 2)}`],
          ] as [string, string][])
        : []),
    ],
    2,
  );
  d.img(wallSectionSvg(res, { W: 860, H: 560, theme: th, fmt, showPressure: false, showLoads: false }), 'Figura 1. Sección transversal del muro y cotas.');
  if (isCounterfort(inp.type)) d.img(wallPlanSvg(res, { W: 820, H: 320, theme: th, fmt }), 'Figura 2. Planta con contrafuertes.', 0.9);

  d.h2('Suelos y cargas');
  d.kv(
    [
      ['Relleno: peso unitario γ', u('uw', inp.fill.gamma, 2)],
      ['Relleno: γ saturado', u('uw', inp.fill.gammaSat, 2)],
      ['Relleno: ángulo de fricción φ', `${f(inp.fill.phi, 1)}°`],
      ['Talud del relleno β', `${f(inp.fill.beta, 1)}°`],
      ['Sobrecarga q', u('press', inp.fill.q, 1)],
      ['Nivel freático sobre la base', inp.hw > 0 ? u('len', inp.hw, 2) : 'Sin agua'],
      ['Suelo de cimentación: γ', u('uw', inp.found.gamma, 2)],
      ['Suelo de cimentación: φ / c', `${f(inp.found.phi, 1)}° / ${u('press', inp.found.c, 1)}`],
      ['Capacidad portante', inp.found.bearingMode === 'qa' ? `Admisible dada: ${u('press', inp.found.qa, 1)}` : `Calculada (FS = ${f(inp.found.fsBearing, 1)})`],
      ['Fricción base μ / adhesión', `${f(inp.found.mu, 2)} / ${u('press', inp.found.ca, 1)}`],
      ['Empuje pasivo', inp.passive.use ? `Sí (factor ${f(inp.passive.factor, 2)}, ignora ${u('len', inp.passive.ignoreTop, 2)})` : 'No'],
      ['Sismo', inp.seismic.on ? `kh = ${f(inp.seismic.kh, 3)}; kv = ${f(inp.seismic.kv, 3)}` : 'No considerado'],
    ],
    2,
  );
  d.h2('Materiales');
  const mat = inp.mat;
  d.kv(
    [
      ...((!isGravity(inp.type) || inp.type === 'gravityConcrete')
        ? ([
            ['f′c', u('stress', mat.fc, 1) + (fmt.sys === 'TEC' ? ` (${f(mat.fc, 1)} MPa)` : '')],
            ['fy', u('stress', mat.fy, 0) + (fmt.sys === 'TEC' ? ` (${f(mat.fy, 0)} MPa)` : '')],
          ] as [string, string][])
        : []),
      ...(inp.type === 'gabion' ? ([['Piedra: peso unitario / porosidad', `${u('uw', inp.gab.gammaStone, 1)} / ${f(inp.gab.porosity, 2)}`], ['Peso unitario del gavión', u('uw', gabionGamma(inp.gab), 2)]] as [string, string][]) : ([['Peso unitario del concreto', u('uw', mat.gammaC, 2)]] as [string, string][])),
      ...(isMasonry(inp.type)
        ? ([
            ['f′m de la mampostería', u('stress', mat.fm, 1)],
            ['Peso unitario de la mampostería', u('uw', mat.gammaM, 2)],
          ] as [string, string][])
        : []),
      ['Recubrimiento pantalla / zapata', `${cm(mat.cover)} / ${cm(mat.coverFound)}`],
    ],
    2,
  );
  d.h2('Factores de seguridad y de carga');
  d.table(
    ['Parámetro', 'Valor'],
    [
      ['FS volcamiento (estático / sismo)', `${f(inp.factors.fsOT, 2)} / ${f(inp.factors.fsOTe, 2)}`],
      ['FS deslizamiento (estático / sismo)', `${f(inp.factors.fsSL, 2)} / ${f(inp.factors.fsSLe, 2)}`],
      ['Aumento de la presión admisible con sismo', f(inp.factors.qaIncE, 2)],
      ['Carga muerta (máx. / mín.)', `${f(inp.factors.dead, 2)} / ${f(inp.factors.deadMin, 2)}`],
      ['Sobrecarga', f(inp.factors.live, 2)],
      ['Empuje de tierra H', f(inp.factors.lateral, 2)],
      ['Sismo E', f(inp.factors.eq, 2)],
    ],
    { align: ['l', 'r'], widths: [10, 6] },
  );

  // ------------------------------------------------------------------ 3
  d.h1('Empuje de tierras');
  d.h2('Coeficientes');
  const em = res.earth;
  const phi = inp.fill.phi;
  const eqs: string[] = [];
  if (em.mode === 'virtual') {
    eqs.push('Rankine (plano vertical virtual, empuje paralelo al talud):');
    eqs.push('Ka = cosβ·(cosβ − √(cos²β − cos²φ)) / (cosβ + √(cos²β − cos²φ))');
    eqs.push(`Ka = ${f(em.Ka, 4)}   (φ = ${f(phi, 1)}°, β = ${f(inp.fill.beta, 1)}°)`);
  } else {
    eqs.push('Coulomb (cara posterior inclinada ψ = ' + f(em.psiDeg, 2) + '° respecto a la vertical, δ = ' + f(em.deltaDeg, 1) + '°):');
    eqs.push('Ka = sin²(α + φ) / { sin²α·sin(α − δ)·[1 + √( sin(φ + δ)·sin(φ − β) / (sin(α − δ)·sin(α + β)) )]² },   α = 90° − ψ');
    eqs.push(`Ka = ${f(em.Ka, 4)};   Pa = ½·Ka·γ·H² con H vertical;   Ph = Pa·cos(δ + ψ), Pv = Pa·sin(δ + ψ)`);
  }
  eqs.push(`Kp (Rankine, suelo frontal) = tan²(45° + φ/2) = ${f(em.kpFront, 3)}`);
  if (res.earthSeismic && res.earthSeismic.Kae !== null) {
    const psiE = (Math.atan2(inp.seismic.kh, 1 - inp.seismic.kv) * 180) / Math.PI;
    eqs.push(`Mononobe–Okabe: ψE = atan(kh/(1 − kv)) = ${f(psiE, 2)}° ;  Kae = ${f(res.earthSeismic.Kae, 4)} ;  ΔPae = ½·γ·(1 − kv)·(Kae − Ka)·H² , aplicado a 0.6·H`);
  }
  d.eq(eqs, 'Fórmulas');
  d.table(
    ['Parámetro', 'Valor'],
    [
      ['Teoría adoptada', em.theoryLabel],
      ['Altura del plano de empuje', u('len', em.Hv, 3)],
      ['Ka', f(em.Ka, 4)],
      ...(res.earthSeismic?.Kae !== null && res.earthSeismic ? ([['Kae (sismo)', f(res.earthSeismic.Kae ?? NaN, 4)]] as string[][]) : []),
      ['Kp frontal', f(em.kpFront, 3)],
    ],
    { align: ['l', 'r'], widths: [10, 6] },
  );

  // ------------------------------------------------------------------ 4
  d.h1('Estabilidad del muro');
  const cases: CaseResult[] = [res.staticCase, ...(res.seismicCase ? [res.seismicCase] : [])];
  let idx = 0;
  for (const c of cases) {
    idx++;
    d.h2(c.label);
    d.table(
      ['Fuerza vertical', `V (${fmt.l('lforce')})`, 'x (m)', `M (${fmt.l('lmoment')})`],
      [
        ...c.v.map((v) => [v.name, n('lforce', v.V, 2), f(v.x, 3), n('lmoment', v.M, 2)]),
        ['ΣV  /  ΣMr (momento resistente)', n('lforce', c.SumV, 2), '', n('lmoment', c.Mres, 2)],
      ],
      { align: ['l', 'r', 'r', 'r'], boldLast: true, caption: `Tabla. Fuerzas verticales — ${c.label}` },
    );
    d.table(
      ['Fuerza horizontal', `H (${fmt.l('lforce')})`, 'y (m)', `M (${fmt.l('lmoment')})`],
      [
        ...c.h.map((h) => [h.name, n('lforce', h.H, 2), f(h.y, 3), n('lmoment', h.M, 2)]),
        ['ΣH  /  ΣMo (momento de vuelco)', n('lforce', c.SumH, 2), '', n('lmoment', c.Mot, 2)],
      ],
      { align: ['l', 'r', 'r', 'r'], boldLast: true, caption: `Tabla. Fuerzas horizontales — ${c.label}` },
    );
    const lines = [
      `Volcamiento: FS = ΣMr / ΣMo = ${n('lmoment', c.Mres, 2)} / ${n('lmoment', c.Mot, 2)} = ${isFinite(c.FSot) ? f(c.FSot, 2) : '∞'}  ${c.ok.ot ? '≥' : '<'}  ${f(c.fsOTreq, 2)}`,
      `Deslizamiento: FS = (μ·ΣV + c·B + Pp) / ΣH = (${f(c.mu, 3)} × ${n('lforce', c.SumV, 2)} + ${n('lforce', c.Rcoh, 2)} + ${n('lforce', c.Rpass, 2)}) / ${n('lforce', c.SumH, 2)} = ${isFinite(c.FSsl) ? f(c.FSsl, 2) : '∞'}  ${c.ok.sl ? '≥' : '<'}  ${f(c.fsSLreq, 2)}`,
    ];
    if (c.passive) lines.push(`Pp = ∫ (Kp·γ·z + 2c√Kp) dz  entre z = ${f(c.passive.z1, 2)} y ${f(c.passive.z2, 2)} m = ${u('lforce', c.passive.Fall, 2)};  Pp usado = ${f(inp.passive.factor, 2)} × Pp = ${u('lforce', c.passive.F, 2)}`);
    lines.push(`Posición de la resultante: x̄ = (ΣMr − ΣMo)/ΣV = ${f(c.xbar, 3)} m ;  excentricidad e = B/2 − x̄ = ${f(c.e, 3)} m  (B/6 = ${f(c.B / 6, 3)} m)`);
    if (isFinite(c.qmax)) {
      lines.push(
        c.fullContact
          ? `q = ΣV/B·(1 ± 6e/B):  qmáx = ${u('press', c.qmax, 1)} ,  qmín = ${u('press', c.qmin, 1)}`
          : `Contacto parcial (resultante fuera del tercio medio): longitud en contacto = ${f(c.contactLen, 3)} m ;  qmáx = 2ΣV/Lc = ${u('press', c.qmax, 1)}`,
      );
      lines.push(`qmáx ${c.ok.q ? '≤' : '>'} qadm = ${u('press', c.qaAllow, 1)}${c.seismic ? ` (incluye aumento ${f(inp.factors.qaIncE, 2)})` : ''}   (relación ${f(c.qmax / c.qaAllow, 2)})`);
    } else lines.push('La resultante cae fuera de la base: no hay equilibrio.');
    d.eq(lines, `Verificaciones — ${c.label}`);
    if (c.bearing) {
      const b = c.bearing;
      d.eq(
        [
          `B′ = B − 2e = ${f(b.Bp, 3)} m ;  q = γ·Df = ${u('press', b.qSur, 1)}`,
          `Nq = e^(π·tanφ)·tan²(45° + φ/2) = ${f(b.Nq, 2)} ;  Nc = (Nq − 1)/tanφ = ${f(b.Nc, 2)} ;  Nγ = 2(Nq + 1)·tanφ = ${f(b.Ng, 2)}`,
          `Factores de profundidad: dq = ${f(b.dq, 3)}, dc = ${f(b.dc, 3)};  de inclinación: iq = ic = ${f(b.iq, 3)}, iγ = ${f(b.ig, 3)}`,
          `qult = c·Nc·dc·ic + q·Nq·dq·iq + ½·γ·B′·Nγ·iγ = ${u('press', b.qult, 1)}  →  qadm = qult/FS = ${u('press', b.qa, 1)}`,
        ],
        'Capacidad portante (Meyerhof / Vesic)',
      );
    }
    d.img(wallSectionSvg(res, { W: 860, H: 560, theme: th, fmt, seismic: c.seismic }), `Figura ${idx + 2}. Empujes y presión de contacto — ${c.label}.`);
  }

  // ------------------------------------------------------------------ 5
  d.h1('Diseño estructural');
  d.h2('Combinaciones de resistencia y presión de contacto mayorada');
  d.table(
    ['Combinación', `ΣV (${fmt.l('lforce')})`, `ΣH (${fmt.l('lforce')})`, 'x̄ (m)', `qtoe (${fmt.l('press')})`, `qheel (${fmt.l('press')})`],
    des.uls.map((x) => [x.label, n('lforce', x.res.SumV, 1), n('lforce', x.res.SumH, 1), f(x.res.xbar, 3), n('press', x.res.qAt(0), 1), n('press', x.res.qAt(g.B), 1)]),
    { align: ['l', 'r', 'r', 'r', 'r', 'r'], caption: 'Tabla. Presiones de contacto con cargas mayoradas (sin pasivo)' },
  );

  if (des.stem) {
    const st = des.stem;
    d.h2(st.masonry ? 'Pantalla de mampostería reforzada' : 'Pantalla en voladizo');
    d.eq(
      [
        'Mu(y) = ∫ pu(z)·(zs − z) dz  con zs = H − y  (presión horizontal mayorada del suelo, sobrecarga' + (inp.hw > 0 ? ', agua' : '') + (inp.seismic.on ? ', incremento sísmico e inercia del muro' : '') + ')',
        'pu(z) = H_factor·Ka·cos(δ + ψ)·σ′v(z) + factor_sobrecarga·Ka·q',
        st.masonry
          ? 'Mampostería (TMS 402, resistencia): a = d − √(d² − 2·Mu/(φ·0.80·f′m·b)) ;  As = 0.80·f′m·b·a/fy ;  φ = 0.90'
          : 'Concreto: Rn = Mu/(φ·b·d²) ;  ρ = (0.85·f′c/fy)·[1 − √(1 − 2Rn/(0.85·f′c))] ;  As = ρ·b·d ;  As,diseño = máx(As ; mín(4/3·As ; As,mín))',
      ],
      'Método',
    );
    const s0 = st.sections[0];
    d.eq(
      [
        `Sección crítica en la base de la pantalla (${st.governing}): t = ${f(s0.t * 1000, 0)} mm, d = ${f(s0.d * 1000, 1)} mm`,
        `Mu = ${u('lmoment', s0.Mu, 2)} ;  b = 1.00 m`,
        `As,req = ${f(s0.AsReq, 2)} cm²/m ;  As,mín = ${f(s0.AsMin, 2)} cm²/m ;  As,diseño = ${f(s0.AsDes, 2)} cm²/m`,
        `Armado vertical: ${st.base.text} → As = ${f(st.base.asProv, 2)} cm²/m ;  φMn = ${u('lmoment', s0.phiMn, 2)}`,
        `Cortante a d de la base: Vu = ${u('lforce', st.critical.Vu, 2)} ;  φVc = ${u('lforce', st.critical.phiVc, 2)}  (relación ${f(st.critical.ratio, 2)})`,
        `Capas de acero vertical: ${st.layers}${st.centered ? ' (barra centrada en la celda, d = t/2)' : st.layers === 2 && st.masonry ? ' (d medido a la barra del lado del relleno; la capa frontal se desprecia en flexión)' : ''}; separación ${st.vertAuto ? 'calculada' : 'elegida'}`,
        st.horizOn ? `Armado horizontal: ρh,mín = ${st.rhoH.toFixed(4)} → As = ${f(st.AsH, 2)} cm²/m → ${st.horizontalDet.text}${st.horizLayers === 2 ? ' en cada cara' : ''} (${st.horizAuto ? 'separación calculada' : 'separación elegida'})${st.layers === 2 && !st.masonry ? '; vertical en la cara frontal: ' + st.frontVertDet.text : ''}` : 'Sin barras horizontales (no se cubre el acero mínimo de retracción y temperatura).',
        `Anclaje en la zapata: ldh = ${f(st.anchorage.ldh, 2)} m  ${st.anchorage.ok ? '≤' : '>'}  disponible ${f(st.anchorage.available, 2)} m`,
      ],
      'Cálculo en la base',
    );
    d.p(st.cutNote);
    d.table(
      ['y (m)', 't (m)', 'd (m)', `Mu (${fmt.l('lmoment')})`, `Vu (${fmt.l('lforce')})`, 'As req (cm²/m)', 'As mín', 'As diseño', `φMn (${fmt.l('lmoment')})`],
      st.sections.filter((_, i) => i % 2 === 0).map((s) => [f(s.y, 2), f(s.t, 3), f(s.d, 3), n('lmoment', s.Mu, 1), n('lforce', s.Vu, 1), f(s.AsReq, 2), f(s.AsMin, 2), f(s.AsDes, 2), n('lmoment', s.phiMn, 1)]),
      { align: ['r', 'r', 'r', 'r', 'r', 'r', 'r', 'r', 'r'], caption: 'Tabla. Diseño a flexión a lo largo de la pantalla' },
    );
    d.img(
      lineChart({
        w: 760, h: 270, theme: th, xLabel: 'Altura sobre la base de la pantalla y (m)', yLabel: `Momento (${fmt.l('lmoment')})`, title: 'Mu frente a φMn (con el armado de la base)',
        series: [
          { name: 'Mu', xs: st.sections.map((s) => s.y), ys: st.sections.map((s) => (fmt.sys === 'SI' ? s.Mu : s.Mu / 9.80665)), color: th.accent },
          { name: 'φMn', xs: st.sections.map((s) => s.y), ys: st.sections.map((s) => (fmt.sys === 'SI' ? s.phiMn : s.phiMn / 9.80665)), color: th.ok, dash: '6 4' },
        ],
      }),
      'Figura. Momento último y resistencia de diseño en la pantalla.',
      0.9,
    );
  }

  if (des.toe || des.heel) {
    d.h2('Zapata: pie y talón');
    d.eq(
      [
        'Pie: Mu = ∫ (qu + u − peso mayorado) (Lt − x) dx   hasta la cara frontal de la pantalla ;  cortante a d de la cara.',
        'Talón: Mu = ∫ (peso mayorado del suelo y sobrecarga − qu − u) (x − xcara) dx  hasta el extremo ;  cortante en la cara posterior de la pantalla.',
        'Se toma la envolvente de las combinaciones de resistencia; qu = presión de contacto mayorada y u = subpresión.',
      ],
      'Método',
    );
    for (const s of [des.toe, des.heel]) {
      if (!s) continue;
      d.eq(
        [
          `Combinación: ${s.caseLabel};  cara en tracción: ${s.face};  h = ${f(g.hb * 1000, 0)} mm,  d = ${f(s.d * 1000, 1)} mm`,
          `Mu = ${u('lmoment', s.Mu, 2)} ;  As,req = ${f(s.AsReq, 2)} cm²/m ;  As,mín = ${f(s.AsMin, 2)} cm²/m ;  As,diseño = ${f(s.AsDes, 2)} cm²/m`,
          `Armado: ${s.det.text} → As = ${f(s.det.asProv, 2)} cm²/m ;  φMn = ${u('lmoment', s.phiMn, 2)}  (relación ${f(s.ratioM, 2)})`,
          `Cortante: Vu = ${u('lforce', s.Vu, 2)} ;  φVc = ${u('lforce', s.phiVc, 2)}  (relación ${f(s.ratioV, 2)})`,
          `Barras longitudinales (paralelas al muro): ${s.shrinkDet.text} en cada cara (As total = 0.0018·b·h = ${f(s.shrinkAs, 2)} cm²/m)`,
          `Desarrollo: ld = ${f(s.ldReq, 2)} m  ${s.hook ? '>' : '≤'}  disponible ${f(s.ldAvail, 2)} m${s.hook ? ' → usar gancho estándar' : ''}`,
        ],
        s.name,
      );
    }
  }

  if (des.key) {
    const k = des.key;
    d.h2('Llave de corte');
    d.eq(
      [
        `Empuje pasivo sobre la llave: Pp = ${u('lforce', k.Pp, 2)} ;  usado (× ${f(inp.passive.factor, 2)}) = ${u('lforce', k.PpUsed, 2)}`,
        `Mu en la unión con la zapata (× ${f(inp.factors.lateral, 2)}) = ${u('lmoment', k.slab.Mu, 2)} ;  Vu = ${u('lforce', k.slab.Vu, 2)}`,
        `Armado vertical: ${k.slab.det.text} → As = ${f(k.slab.det.asProv, 2)} cm²/m ;  φMn = ${u('lmoment', k.slab.phiMn, 2)}  (relación ${f(k.slab.ratioM, 2)})`,
      ],
      'Cálculo',
    );
  }

  if (des.gravity) {
    const mas = des.gravityMaterial === 'mamposteria';
    const gabm = des.gravityMaterial === 'gaviones';
    d.h2(gabm ? 'Secciones de los gaviones (base de cada cuerpo)' : mas ? 'Secciones de la pantalla (mampostería sin refuerzo)' : 'Secciones de la pantalla (concreto simple)');
    if (gabm) {
      const G = inp.gab;
      const gw = gabionWidths(G);
      d.table(
        ['Cuerpo', 'Ancho (m)', 'Altura (m)', 'Piedra (m³/m)', 'Peso (kN/m)'],
        gw.map((w, k) => [String(k + 1), f(w, 2), f(G.hc, 2), f(w * G.hc, 2), f(w * G.hc * gabionGamma(G), 1)]),
        { align: ['c', 'r', 'r', 'r', 'r'], caption: `Tabla. Cuerpos de gavión (γ gavión = γ piedra·(1 − n) = ${f(G.gammaStone, 1)} × ${f(1 - G.porosity, 2)} = ${f(gabionGamma(G), 1)} kN/m³)` },
      );
    }
    d.eq(
      gabm
        ? [
            'Cada cuerpo se verifica en su base con las fuerzas de servicio del muro por encima: peso de los cuerpos superiores, empuje de tierra (con su componente vertical), sobrecarga y, con sismo, ΔPae e inercia.',
            `Excentricidad e = M/N ;  si e ≤ t/6:  σ = N/t·(1 ± 6e/t) ;  si e > t/6:  σmáx = 2N/(3·(t/2 − e)) (sin tracción)`,
            `Compresión: σmáx ≤ σadm = ${u('press', inp.gab.sigmaAllow, 0)} (× ${f(inp.factors.qaIncE, 2)} con sismo) ;  excentricidad: e ≤ ${f(inp.gab.eFrac, 2)}·t`,
            `Deslizamiento entre cuerpos: V ≤ (μ·N + c·t)/FS = (${f(inp.gab.muG, 2)}·N + ${u('press', inp.gab.cG, 0)}·t)/${f(inp.gab.fsSlide, 2)}`,
          ]
        : mas
        ? [
            'Esfuerzos de servicio: σ = N/A ± M·6/t²  (compresión positiva);  se admite σc ≤ Fa = ' + f(inp.mat.fcAllowRatio, 2) + '·f′m y σt ≤ ft = ' + f(inp.mat.ftAllow, 2) + ' MPa',
            `Cortante en juntas: V ≤ (cJ·A + μJ·N)/FS = (${f(inp.mat.cJ, 2)} MPa·A + ${f(inp.mat.muJ, 2)}·N)/${f(inp.mat.fsJoint, 1)}`,
          ]
        : [
            `Concreto simple (ACI 318, cap. 14): φ = ${PHI_PLAIN};  tracción por flexión σt ≤ φ·0.42·λ·√f′c ;  compresión σc ≤ φ·0.85·f′c ;  cortante φVn = φ·0.11·λ·√f′c·b·h`,
            `Combinación: ${f(inp.factors.deadMin, 2)}D + ${f(inp.factors.lateral, 2)}H (+ sismo): carga axial mínima y empuje máximo`,
          ],
      'Criterios',
    );
    d.table(
      ['y (m)', 't (m)', `N (${fmt.l('lforce')})`, `M (${fmt.l('lmoment')})`, `V (${fmt.l('lforce')})`, `σ dorso (${fmt.l('press')})`, `σ frente (${fmt.l('press')})`, 'Compr.', gabm ? 'Excentr.' : 'Tracc.', 'Cort.', 'Estado'],
      des.gravity.map((s) => [f(s.y, 2), f(s.t, 2), n('lforce', s.N, 1), n('lmoment', s.M, 1), n('lforce', s.V, 1), n('press', s.sigBack, 1), n('press', s.sigFront, 1), f(s.ratioC, 2), isFinite(s.ratioT) ? f(s.ratioT, 2) : '∞', f(s.ratioV, 2), s.ok ? 'Cumple' : 'No cumple']),
      { align: ['r', 'r', 'r', 'r', 'r', 'r', 'r', 'r', 'r', 'r', 'c'], caption: 'Tabla. Verificación por secciones (relaciones demanda/capacidad)' },
    );
    if (des.baseCheck && des.baseCheck.length) {
      d.table(['Elemento de la zapata', 'Relación', 'Detalle'], des.baseCheck.map((b) => [b.name, f(b.ratio, 2), b.detail]), { align: ['l', 'r', 'l'], caption: 'Tabla. Zapata sin refuerzo' });
    }
  }

  if (des.counterfort) {
    const c = des.counterfort;
    d.h2(`Contrafuertes ${c.kind}s`);
    d.eq(
      [
        `Separación entre ejes s = ${f(c.s, 2)} m ;  luz libre de las losas Ls = s − tc = ${f(c.Ls, 2)} m`,
        'Pantalla y losa de zapata: franjas continuas entre contrafuertes;  Mu(−) = wu·Ls²/12 (sobre el contrafuerte) ;  Mu(+) = wu·Ls²/16 (centro de la luz)',
        'Contrafuerte: viga en voladizo de profundidad variable;  Mcf(y) = s·∫ pu(z)·(zs − z) dz ;  As = Mcf/(φ·fy·z), aumentada por 1/cosθ por la inclinación de la barra',
        'Amarres: pantalla–contrafuerte  As = pu·s/(φ·fy) por metro de altura ;  zapata–contrafuerte  As = wu·s/(φ·fy) por metro',
        ...(isMasonryStem(inp.type)
          ? [
              'Mampostería (TMS 402, diseño por resistencia):  φMn = 0.9·As·fy·(d − a/2),  a = As·fy/(0.8·f′m·b),  d = t/2 en la pantalla (barra al centro de la celda);  ancho de ala del contrafuerte ≤ tc + 12·t',
              'Cortante:  φVn = 0.8·(Vnm + Vns),  Vnm = [4.0 − 1.75·(Mu/(Vu·dv))]·An·√f′m,  Vns = 0.5·(Av/s)·fy·dv;  acero mínimo 0.0007·b·t;  separación de las barras horizontales en múltiplos de 20 cm (hiladas)',
            ]
          : []),
      ],
      'Modelo',
    );
    d.table(
      ['y (m)', 'Proyección (m)', 'd (m)', `Mcf (${fmt.l('moment')})`, `Vcf (${fmt.l('force')})`, 'As horiz. (cm²)', 'As inclinada (cm²)', 'Av/s (cm²/m)'],
      c.sections.map((s) => [f(s.y, 2), f(s.proj, 2), f(s.dcf, 2), n('moment', s.Mcf, 1), n('force', s.Vcf, 1), f(s.AsReq, 2), f(s.AsIncl, 2), f(s.AvReq, 2)]),
      { align: ['r', 'r', 'r', 'r', 'r', 'r', 'r', 'r'], caption: 'Tabla. Contrafuerte como viga en voladizo' },
    );
    d.table(
      ['Elemento', 'Adoptado', 'Requerido', 'Relación', 'Estado'],
      [
        ['Acero principal del contrafuerte', `${c.nBars} × ${c.bar.id} = ${f(c.AsProv, 1)} cm²`, `${f(c.req.AsMain, 1)} cm²`, c.ratios.main],
        ['Estribos horizontales (2 ramas)', `${c.stirrup.id} @ ${f(c.stirrupSpacing * 100, 0)} cm`, `Vu ${u('force', c.critical.Vu, 1)} ≤ φVn ${u('force', c.critical.phiVc, 1)}`, Math.max(c.ratios.stirrup, c.ratios.stirMin)],
        ['Amarres pantalla–contrafuerte', c.tieStem.text, `${f(c.req.tieStem, 2)} cm²/m`, c.ratios.tieStem],
        ['Amarres zapata–contrafuerte', c.tieSlab.text, `${f(c.req.tieSlab, 2)} cm²/m`, c.ratios.tieSlab],
        ['Pantalla horizontal (cada cara)', c.stemNegDet.text, `${f(Math.max(c.req.stemNeg, c.req.stemPos), 2)} cm²/m`, Math.max(c.ratios.stemNeg, c.ratios.stemPos)],
        ['Pantalla vertical (cada cara)', c.vertDet.text, `${f(c.req.vert, 2)} cm²/m`, c.ratios.vert],
        [`${c.slabLabel}: longitudinal`, c.slabPosDet.text, `${f(Math.max(c.req.slabNeg, c.req.slabPos), 2)} cm²/m`, Math.max(c.ratios.slabNeg, c.ratios.slabPos)],
      ].map((r) => [r[0] as string, r[1] as string, r[2] as string, isFinite(r[3] as number) ? f(r[3] as number, 2) : '∞', (r[3] as number) <= 1.0001 ? 'Cumple' : 'No cumple']),
      { align: ['l', 'l', 'r', 'r', 'c'], caption: 'Tabla. Verificación del armado del contrafuerte definido por el usuario' },
    );
    d.eq(
      [
        `Acero principal: ${c.nBars} barras ${c.bar.id}  (As,prov = ${f(c.AsProv, 2)} cm² ≥ As,máx = ${f(c.AsMax, 2)} cm²)`,
        `Estribos horizontales (2 ramas): ${c.stirrup.id} @ ${f(c.stirrupSpacing * 100, 1)} cm ;  φVn = ${u('force', c.critical.phiVc, 1)} ≥ Vu = ${u('force', c.critical.Vu, 1)}`,
        `Amarres pantalla–contrafuerte: ${c.tieStem.text} ;  amarres zapata–contrafuerte: ${c.tieSlab.text}`,
      ],
      'Armado adoptado del contrafuerte',
    );
    d.table(
      ['y (m)', 't (m)', `wu (${fmt.l('press')})`, `Mu(−) (${fmt.l('lmoment')})`, `Mu(+) (${fmt.l('lmoment')})`, 'As(−) (cm²/m)', 'As(+) (cm²/m)'],
      c.stemSlab.map((s) => [f(s.y, 2), f(s.t, 2), n('press', s.wu, 1), n('lmoment', s.MuNeg, 1), n('lmoment', s.MuPos, 1), f(s.AsNeg, 2), f(s.AsPos, 2)]),
      { align: ['r', 'r', 'r', 'r', 'r', 'r', 'r'], caption: 'Tabla. Pantalla entre contrafuertes (acero horizontal)' },
    );
    d.eq(
      [
        `Acero horizontal — ${c.stemFacePos}: ${c.stemPosDet.text}`,
        `Acero horizontal — ${c.stemFaceNeg}: ${c.stemNegDet.text}`,
        `Acero vertical mínimo (cada cara): ${c.vertDet.text}; franja inferior: ${c.vertBottomDet.text}`,
        `${c.slabLabel} — ${c.slabFacePos}: ${c.slabPosDet.text};  ${c.slabFaceNeg}: ${c.slabNegDet.text}`,
      ],
      'Armado de las losas',
    );
    for (const nn of c.notes) d.p(nn, { small: true });
  }

  for (const nn of des.notes) d.p(nn, { small: true });

  // ------------------------------------------------------------------ 6
  d.h1('Resumen del armado');
  const rows: string[][] = [];
  if (des.stem) {
    const st2 = des.stem;
    rows.push([st2.centered ? 'Pantalla: vertical (barra al centro de la celda)' : st2.layers === 2 ? 'Pantalla: vertical (cara del relleno)' : 'Pantalla: vertical (una capa, cara del relleno)', st2.base.text, f(st2.base.asProv, 2), st2.cutNote]);
    if (st2.layers === 2) rows.push(['Pantalla: vertical (cara frontal)', st2.masonry ? st2.base.text : st2.frontVertDet.text, f((st2.masonry ? st2.base : st2.frontVertDet).asProv, 2), st2.masonry ? 'Segunda capa, igual a la del relleno' : 'Acero mínimo']);
    rows.push([`Pantalla: horizontal${st2.horizOn && st2.horizLayers === 2 ? ' (cada cara)' : ''}`, st2.horizontalDet.text, st2.horizOn ? f(st2.horizontalDet.asProv * st2.horizLayers, 2) : '—', st2.horizOn ? `Requerido ${f(st2.AsH, 2)} cm²/m` : 'Sin barras horizontales']);
  }
  if (des.mesh) {
    const mm = des.mesh;
    rows.push(['Zapata: transversal inferior', mm.botDet.text, f(mm.botDet.asProv, 2), `Perpendicular al muro; mínimo ${f(0.0018 * g.hb * 1e4, 2)} cm²/m`]);
    rows.push(['Zapata: transversal superior', mm.top ? mm.top.det.text : 'No se coloca', mm.top ? f(mm.top.det.asProv, 2) : '—', mm.top ? 'Perpendicular al muro' : 'Sin malla superior']);
    rows.push(['Zapata: longitudinal (cada capa)', mm.long ? mm.long.det.text : 'No se coloca', mm.long ? f(mm.long.det.asProv, 2) : '—', mm.long ? `Paralela al muro; ${mm.long.layers} capa(s), total ${f(mm.long.AsTotal, 2)} cm²/m (mín. ${f(mm.long.AsMin, 2)})` : 'Sin acero longitudinal']);
  }
  if (des.key) rows.push(['Llave de corte (vertical)', des.key.slab.det.text, f(des.key.slab.det.asProv, 2), 'Anclada en la zapata']);
  if (des.counterfort) {
    const c = des.counterfort;
    rows.push(['Contrafuerte: acero principal', `${c.nBars} × ${c.bar.id}`, f(c.AsProv, 2), 'A lo largo del borde inclinado']);
    rows.push(['Contrafuerte: estribos', `${c.stirrup.id} @ ${f(c.stirrupSpacing * 100, 1)} cm`, '—', '2 ramas horizontales']);
    rows.push([`Pantalla horizontal — ${c.stemFacePos}`, c.stemPosDet.text, f(c.stemPosDet.asProv, 2), '']);
    rows.push([`Pantalla horizontal — ${c.stemFaceNeg}`, c.stemNegDet.text, f(c.stemNegDet.asProv, 2), '']);
    rows.push(['Pantalla vertical (cada cara)', c.vertDet.text, f(c.vertDet.asProv, 2), `Franja inferior: ${c.vertBottomDet.text}`]);
    rows.push([`${c.slabLabel} — ${c.slabFacePos}`, c.slabPosDet.text, f(c.slabPosDet.asProv, 2), '']);
    rows.push([`${c.slabLabel} — ${c.slabFaceNeg}`, c.slabNegDet.text, f(c.slabNegDet.asProv, 2), '']);
    rows.push(['Amarres pantalla–contrafuerte', c.tieStem.text, f(c.tieStem.asProv, 2), 'Horizontales']);
    rows.push(['Amarres zapata–contrafuerte', c.tieSlab.text, f(c.tieSlab.asProv, 2), 'Verticales']);
  }
  if (inp.type === 'gabion') {
    gabionWidths(inp.gab).forEach((w, k) => rows.push([`Gavión: cuerpo ${k + 1}`, `${f(w, 2)} × ${f(inp.gab.hc, 2)} m`, '—', `Piedra ${f(w * inp.gab.hc, 2)} m³ por metro de muro; diafragmas cada 1.0 m y amarres entre cuerpos`]));
  } else if (des.gravity) rows.push(['Muro de gravedad', 'Sin refuerzo estructural', '—', 'Se verifica por esfuerzos; puede añadirse acero de retracción']);
  d.table(['Elemento', 'Armado', 'As prov (cm²/m)', 'Observación'], rows, { align: ['l', 'l', 'r', 'l'], caption: 'Tabla. Cuadro de armado por metro de muro' });
  d.img(wallSectionSvg(res, { W: 860, H: 560, theme: th, fmt, showRebar: true, showPressure: false, showLoads: false }), 'Figura. Esquema de armado.');

  // ------------------------------------------------------------------ 7
  d.h1('Resumen de verificaciones');
  d.status(res.checks.map((c) => ({ name: c.name, detail: c.detail, ratio: c.ratio, ok: c.ok, advisory: c.advisory })));
  d.p(res.ok ? 'CONCLUSIÓN: el muro cumple todas las verificaciones realizadas.' : 'CONCLUSIÓN: el muro NO cumple alguna verificación; debe modificarse la geometría o el armado.', { bold: true });
  if (res.warnings.length) {
    d.h2('Advertencias');
    d.bullets(res.warnings);
  }
  d.h2('Limitaciones');
  d.bullets([
    'No se verifica la estabilidad global del conjunto muro–terreno (superficies de falla profundas) ni los asentamientos.',
    'El drenaje del relleno debe asegurarse en obra; si no existe drenaje deben usarse las opciones de nivel freático.',
    'El detallado (traslapes, ganchos, juntas de dilatación, llorones) debe completarse en planos.',
  ]);
  void rad;
  void PHI_FLEX;
  void PHI_SHEAR;
}

export function buildWallReport(res: WallResults, fmt: Fmt, info: ProjectInfo): ReportDoc {
  const d = new DocBuilder();
  wallBlocks(res, fmt, d);
  return { title: `Diseño del muro de retención ${res.inp.name}`, subtitle: 'Muro de retención — estabilidad y diseño estructural', info, blocks: d.blocks, footer: `TerraStruct · ${res.inp.name}` };
}
