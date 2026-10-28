import { FootingInput, FootingResults, CASE_KEYS, CASE_LABEL, ServiceResult } from '../core/footing';
import { COLUMN_SHAPES, FOOTING_PRESETS, columnPoly } from '../core/shapes';
import { Fmt } from '../core/units';
import { polyProps, ccw } from '../core/geometry';
import { rhoMinSlab, PHI_FLEX, PHI_SHEAR, PHI_BEARING } from '../core/concrete';
import { ProjectInfo } from '../state';
import { DocBuilder, ReportDoc } from './model';
import { LIGHT } from '../draw/svg';
import { footingDiagramSvg, footingPlanSvg, footingRebarPlanSvg, footingSectionSvg } from '../draw/footingDraw';
import { lineChart } from '../draw/svg';

const shapeLabel = (s: string) => COLUMN_SHAPES.find((x) => x.id === s)?.label ?? s;

export function footingBlocks(inp: FootingInput, res: FootingResults, fmt: Fmt, d: DocBuilder) {
  const u = fmt.u;
  const n = fmt.n;
  const f = fmt.d;
  const th = LIGHT;
  const poly = ccw(inp.vertices);
  const pp = polyProps(poly);
  const sol = (s: ServiceResult) => s.sol;
  const gov = res.govPressure;

  // ------------------------------------------------------------------ 1
  d.h1('Generalidades');
  d.h2('Objeto y alcance');
  d.p(
    `Esta memoria presenta el análisis y diseño estructural de la fundación superficial «${inp.name}», de forma ${FOOTING_PRESETS.find((p) => p.id === inp.preset)?.label.toLowerCase() ?? 'poligonal'} con ${poly.length} vértices y ${inp.columns.length} columna${inp.columns.length > 1 ? 's' : ''}. ` +
      'Se verifican las presiones sobre el suelo, el deslizamiento y el volcamiento en condición de servicio, y se diseña el refuerzo por flexión, cortante en una dirección y punzonamiento con los métodos de resistencia última del ACI 318.',
    { align: 'justify' },
  );
  d.h2('Normas y referencias');
  d.bullets([
    inp.code === 'ACI318_19' ? 'ACI 318-19: Requisitos de reglamento para concreto estructural (cortante con efecto de tamaño).' : 'ACI 318-14 / NSR-10: Requisitos de reglamento para concreto estructural.',
    'ASCE 7: combinaciones de carga por resistencia última y por esfuerzos admisibles (valores por defecto, editables).',
    'Bowles, J.E., Foundation Analysis and Design: presiones de contacto, zapatas combinadas y de forma irregular.',
  ]);
  d.h2('Hipótesis de cálculo');
  d.bullets([
    'La zapata se comporta como un sólido rígido; la presión de contacto con el suelo varía linealmente: q(x, y) = q0 + a·x + b·y.',
    'No se admite tracción entre el suelo y la zapata: si la resultante cae fuera del núcleo central se determina por iteración la zona realmente comprimida (equilibrio de fuerza y de momentos en dos ejes).',
    'Las presiones de servicio incluyen cargas de las columnas, peso de la zapata, del relleno y de la sobrecarga. El diseño estructural usa la presión neta producida solo por las cargas mayoradas de las columnas.',
    'Las cargas se aplican en el nivel del terreno; sus fuerzas cortantes generan un momento adicional V·Df respecto a la base.',
    'Flexión: secciones de corte barridas en las dos direcciones; en las columnas se toma la sección en la cara (cuadrado equivalente de igual área para columnas circulares o poligonales regulares).',
    'Cortante en una dirección a una distancia d de la cara de la columna; punzonamiento en el perímetro crítico a d/2 del contorno (envolvente convexa) de cada columna, descontando los lados que quedan fuera de la zapata.',
    'No se consideran asentamientos ni interacción suelo–estructura. Cada estado de carga se evalúa con las combinaciones definidas por el usuario.',
  ]);
  d.h2('Convención de signos y unidades');
  d.p(
    `Unidades: ${fmt.sys === 'SI' ? 'kN, m, kPa, MPa' : 'tonf, m, tonf/m², kgf/cm²'}. P es positiva hacia abajo; Vx, Vy son positivas en +x, +y; Mx (My) es el momento que aumenta la presión del suelo hacia +y (+x). Las resistencias del concreto y del acero se dan en ${fmt.l('stress')}; las fórmulas del ACI se evalúan internamente en MPa.`,
  );

  // ------------------------------------------------------------------ 2
  d.h1('Datos de entrada');
  d.h2('Geometría de la fundación');
  d.p(`Espesor h = ${u('len', inp.h, 2)}; profundidad de desplante Df = ${u('len', inp.Df, 2)}.`);
  d.table(
    ['Vértice', `x (${fmt.l('len')})`, `y (${fmt.l('len')})`],
    poly.map((v, i) => [String(i + 1), n('len', v.x, 3), n('len', v.y, 3)]),
    { align: ['c', 'r', 'r'], widths: [4, 8, 8], caption: 'Tabla 1. Vértices de la zapata (sentido antihorario)' },
  );
  d.kv(
    [
      ['Área A', `${f(pp.A, 3)} m²`],
      ['Centroide (x, y)', `${f(pp.cx, 3)} ; ${f(pp.cy, 3)} m`],
      ['Inercia Ix (∫y²dA)', `${f(pp.Ix, 3)} m⁴`],
      ['Inercia Iy (∫x²dA)', `${f(pp.Iy, 3)} m⁴`],
      ['Producto de inercia Ixy', `${f(pp.Ixy, 3)} m⁴`],
      ['Volumen de concreto', `${f(res.concreteVolume, 2)} m³`],
    ],
    2,
  );
  d.img(footingPlanSvg(inp, res, { W: 800, H: 560, theme: th, fmt, combo: null, showPressure: false, showCritical: false, showVertexLabels: true, idPrefix: 'r1' }), 'Figura 1. Planta de la fundación y columnas.');

  d.h2('Columnas');
  d.table(
    ['Columna', 'Forma', 'Dimensiones', `Área (${'m²'})`, `x (${fmt.l('len')})`, `y (${fmt.l('len')})`],
    inp.columns.map((c) => {
      const g = c.geom;
      const dims =
        g.shape === 'rect' ? `${f(g.b * 100, 0)} × ${f(g.h * 100, 0)} cm` : g.shape === 'circle' ? `Ø ${f(g.D * 100, 0)} cm` : g.shape === 'ngon' ? `${g.n} lados, Ø ${f(g.D * 100, 0)} cm` : g.shape === 'poly' ? `${g.vertices.length} vértices` : `${f(g.b * 100, 0)} × ${f(g.h * 100, 0)} cm, t = ${f(g.t * 100, 0)} cm${g.shape === 'L' ? '' : `, tw = ${f(g.tw * 100, 0)} cm`}`;
      return [c.name, shapeLabel(g.shape) + (g.rotation ? ` (giro ${g.rotation}°)` : ''), dims, f(polyProps(columnPoly(g, c.x, c.y)).A, 4), n('len', c.x, 3), n('len', c.y, 3)];
    }),
    { align: ['l', 'l', 'l', 'r', 'r', 'r'], caption: 'Tabla 2. Columnas' },
  );
  if (inp.loadMode === 'envelope') {
    d.h2('Envolvente de cargas por columna (nivel del terreno)');
    d.p('Las cargas se ingresaron directamente como envolvente de servicio (ES) y última (EU); no se aplican factores de combinación.');
    for (const c of inp.columns) {
      d.table(
        ['Combinación', 'Tipo', `P (${fmt.l('force')})`, `Vx (${fmt.l('force')})`, `Vy (${fmt.l('force')})`, `Mx (${fmt.l('moment')})`, `My (${fmt.l('moment')})`, 'Aum. de qa'],
        inp.combos.map((cb) => {
          const l = c.env?.[cb.id] ?? { P: 0, Vx: 0, Vy: 0, Mx: 0, My: 0 };
          return [cb.name, cb.kind === 'service' ? 'ES' : 'EU', n('force', l.P, 2), n('force', l.Vx, 2), n('force', l.Vy, 2), n('moment', l.Mx, 2), n('moment', l.My, 2), cb.kind === 'service' ? f(cb.qaFactor, 2) : '—'];
        }),
        { align: ['l', 'l', 'r', 'r', 'r', 'r', 'r', 'r'], caption: `Tabla. Envolvente de la columna ${c.name}` },
      );
    }
  } else {
  d.h2('Cargas de servicio por columna (nivel del terreno)');
  for (const c of inp.columns) {
    d.table(
      ['Caso', `P (${fmt.l('force')})`, `Vx (${fmt.l('force')})`, `Vy (${fmt.l('force')})`, `Mx (${fmt.l('moment')})`, `My (${fmt.l('moment')})`],
      CASE_KEYS.map((k) => [CASE_LABEL[k], n('force', c.loads[k].P, 2), n('force', c.loads[k].Vx, 2), n('force', c.loads[k].Vy, 2), n('moment', c.loads[k].Mx, 2), n('moment', c.loads[k].My, 2)]),
      { align: ['l', 'r', 'r', 'r', 'r', 'r'], caption: `Tabla. Cargas de la columna ${c.name}` },
    );
  }
  }
  d.h2('Materiales y suelo');
  d.kv(
    [
      ['Resistencia del concreto f′c', u('stress', inp.fc, 1) + (fmt.sys === 'TEC' ? ` (${f(inp.fc, 1)} MPa)` : '')],
      ['Fluencia del acero fy', u('stress', inp.fy, 0) + (fmt.sys === 'TEC' ? ` (${f(inp.fy, 0)} MPa)` : '')],
      ['Recubrimiento libre', u('lencm', inp.cover, 1)],
      ['Peso unit. del concreto', u('uw', inp.gammaC, 2)],
      ['Barras en X', inp.barX],
      ['Barras en Y', inp.barY],
      ['Capa inferior', inp.lowerLayer === 'x' ? 'Barras en X' : 'Barras en Y'],
      ['Esfuerzo admisible qa', u('press', inp.qa, 1)],
      ['Peso unit. del relleno', u('uw', inp.gammaS, 2)],
      ['Sobrecarga en el terreno', u('press', inp.surcharge, 1)],
      ['Fricción base–suelo μ', f(inp.mu, 2)],
      ['Adhesión base–suelo', u('press', inp.adhesion, 1)],
      ['FS mínimo al deslizamiento', f(inp.fsSliding, 2)],
      ['FS mínimo al volcamiento', f(inp.fsOverturning, 2)],
    ],
    2,
  );
  if (inp.loadMode !== 'envelope') {
  d.h2('Combinaciones de carga');
  d.table(
    ['Combinación', 'Tipo', 'D', 'L', 'W', 'E', 'Aum. de qa'],
    inp.combos.map((c) => [c.name, c.kind === 'service' ? 'Servicio' : 'Última', f(c.D, 3), f(c.L, 3), f(c.W, 3), f(c.E, 3), c.kind === 'service' ? f(c.qaFactor, 2) : '—']),
    { align: ['l', 'l', 'r', 'r', 'r', 'r', 'r'], caption: 'Tabla 3. Combinaciones de carga' },
  );
  }
  if (inp.manual.on) d.p(`Armado definido por el usuario: separaciones inferiores ${f(inp.manual.sBotX * 100, 1)} cm (X) y ${f(inp.manual.sBotY * 100, 1)} cm (Y)${inp.topSteel ? `; superiores ${f(inp.manual.sTopX * 100, 1)} cm (X) y ${f(inp.manual.sTopY * 100, 1)} cm (Y)` : ''}. El programa verifica la resistencia, el acero mínimo y la separación máxima.`);

  // ------------------------------------------------------------------ 3
  d.h1('Presiones sobre el suelo y estabilidad (servicio)');
  d.h2('Procedimiento');
  d.eq(
    [
      'ΣV = ΣPcol + Wzapata + Wrelleno + Wsobrecarga',
      'ΣQx = Σ(P·x + My + Vx·Df) + Σ(W·x_W)      ΣQy = Σ(P·y + Mx + Vy·Df) + Σ(W·y_W)',
      'Equilibrio: ∫q dA = ΣV ;  ∫q·x dA = ΣQx ;  ∫q·y dA = ΣQy ,  con q = q0 + a·x + b·y  y  q ≥ 0',
      'Deslizamiento: FS = (μ·ΣV + c·Ac) / √(ΣVx² + ΣVy²)',
      'Volcamiento: FS = Σ(P·brazo respecto a la arista de volcamiento) / M_vuelco  (la arista es la tangente al cierre convexo de la zapata en la dirección del momento de vuelco)',
    ],
    'Fórmulas',
  );
  d.h2('Resultados por combinación');
  d.table(
    ['Combinación', `ΣV (${fmt.l('force')})`, 'ex (m)', 'ey (m)', `qmáx (${fmt.l('press')})`, `qmín (${fmt.l('press')})`, 'Contacto', `qadm (${fmt.l('press')})`, 'q/qadm', 'FS desl.', 'FS volc.', 'Estado'],
    res.service.map((s) => [
      s.combo.name,
      n('force', s.Ptot, 1),
      f(s.ex, 3),
      f(s.ey, 3),
      sol(s).ok ? n('press', sol(s).qmax, 1) : '—',
      sol(s).ok ? n('press', sol(s).qmin, 1) : '—',
      sol(s).ok ? `${f((100 * sol(s).contactArea) / sol(s).area, 0)} %` : '—',
      n('press', s.qaAllow, 1),
      sol(s).ok ? f(s.ratio, 2) : '—',
      isFinite(s.FSsl) ? f(s.FSsl, 2) : '∞',
      isFinite(s.FSot) ? f(s.FSot, 2) : '∞',
      s.ok ? 'Cumple' : 'No cumple',
    ]),
    { align: ['l', 'r', 'r', 'r', 'r', 'r', 'r', 'r', 'r', 'r', 'r', 'c'], caption: 'Tabla 4. Verificación en servicio' },
  );
  if (gov) {
    d.h2(`Combinación crítica de presión: ${gov.combo.name}`);
    d.table(
      ['Concepto', `Carga (${fmt.l('force')})`, `x (${fmt.l('len')})`, `y (${fmt.l('len')})`],
      [
        ...gov.cols.map((c) => [`Cargas de ${c.col.name} (P)`, n('force', c.P, 1), n('len', c.col.x, 3), n('len', c.col.y, 3)]),
        ...gov.weights.map((w) => [w.name, n('force', w.W, 1), n('len', w.x, 3), n('len', w.y, 3)]),
        ['ΣV total', n('force', gov.Ptot, 1), '', ''],
      ],
      { align: ['l', 'r', 'r', 'r'], boldLast: true, caption: 'Tabla 5. Cargas verticales y puntos de aplicación' },
    );
    const s = sol(gov);
    d.eq(
      [
        `ΣQx = ${n('moment', gov.Qx, 1)} ${fmt.l('moment')}      ΣQy = ${n('moment', gov.Qy, 1)} ${fmt.l('moment')}`,
        `Resultante: x_R = ΣQx/ΣV = ${f(gov.Qx / gov.Ptot, 3)} m ;  y_R = ΣQy/ΣV = ${f(gov.Qy / gov.Ptot, 3)} m   (excentricidades ex = ${f(gov.ex, 3)} m, ey = ${f(gov.ey, 3)} m)`,
        ...(s.ok
          ? [
              `Plano de presión: q0 = ${n('press', s.plane.q0, 2)} ${fmt.l('press')} ;  a = ${n('press', s.plane.a, 2)} ${fmt.l('press')}/m ;  b = ${n('press', s.plane.b, 2)} ${fmt.l('press')}/m`,
              `q máx = ${u('press', s.qmax, 1)} en (${f(s.qmaxAt.x, 2)} ; ${f(s.qmaxAt.y, 2)})  ≤  qadm = ${u('press', gov.qaAllow, 1)}   (qa = ${u('press', inp.qa, 1)} × ${f(gov.combo.qaFactor, 2)})`,
              `Área en contacto = ${f(s.contactArea, 2)} m² de ${f(s.area, 2)} m² (${f((100 * s.contactArea) / s.area, 0)} %)${s.uplift ? ' — hay levantamiento parcial' : ''}`,
            ]
          : ['No existe equilibrio con presiones de compresión.']),
      ],
      'Cálculo',
    );
    d.img(footingPlanSvg(inp, res, { W: 800, H: 560, theme: th, fmt, combo: gov, showPressure: true, showCritical: false, idPrefix: 'r2' }), `Figura 2. Presión de contacto — ${gov.combo.name}. R = resultante.`);
  }
  const worstSl = res.service.filter((s) => isFinite(s.FSsl)).sort((a, b) => a.FSsl - b.FSsl)[0];
  const worstOt = res.service.filter((s) => isFinite(s.FSot)).sort((a, b) => a.FSot - b.FSot)[0];
  if (worstSl) {
    d.h2('Deslizamiento y volcamiento');
    d.eq([
      `Deslizamiento (${worstSl.combo.name}): FS = (μ·ΣV + c·Ac)/H = (${f(inp.mu, 2)} × ${n('force', worstSl.Ptot, 1)} + ${n('press', inp.adhesion, 1)} × ${f(worstSl.sol.contactArea, 2)}) / ${n('force', worstSl.H, 1)} = ${f(worstSl.FSsl, 2)}  ${worstSl.FSsl >= inp.fsSliding ? '≥' : '<'}  ${f(inp.fsSliding, 2)}`,
      ...(worstOt ? [`Volcamiento (${worstOt.combo.name}): FS = ${f(worstOt.FSot, 2)}  ${worstOt.FSot >= inp.fsOverturning ? '≥' : '<'}  ${f(inp.fsOverturning, 2)}`] : []),
    ]);
  }

  // ------------------------------------------------------------------ 4
  d.h1('Diseño estructural del concreto reforzado');
  d.h2('Peralte efectivo y cuantías mínimas');
  d.eq(
    [
      `Capa inferior (${inp.lowerLayer.toUpperCase()}): d = h − r − db/2 ;  capa superior: d = h − r − db(inferior) − db/2`,
      `d_x = ${f(res.dx * 1000, 1)} mm ;  d_y = ${f(res.dy * 1000, 1)} mm ;  d_prom = ${f(res.dAvg * 1000, 1)} mm  ${res.thicknessOk ? '≥' : '<'}  150 mm`,
      `ρmín = máx(0.0018·420/fy ; 0.0014) = ${rhoMinSlab(inp.fy).toFixed(4)}  →  As,mín = ρmín·b·h = ${f(rhoMinSlab(inp.fy) * 100 * inp.h * 100, 2)} cm²/m`,
      `φ flexión = ${PHI_FLEX} ;  φ cortante = ${PHI_SHEAR}`,
    ],
    'Parámetros',
  );
  d.h2('Presiones últimas (cargas mayoradas de las columnas, sin peso propio)');
  d.table(
    ['Combinación', `Pu (${fmt.l('force')})`, 'xR (m)', 'yR (m)', `qu máx (${fmt.l('press')})`, `qu mín (${fmt.l('press')})`, 'Contacto'],
    res.ultimate.map((x) => {
      if (!x.sol.ok) return [x.combo.name, n('force', x.Pu, 1), '—', '—', '—', '—', x.note ?? 'sin equilibrio'];
      const sx = x.cols.reduce((a, c) => a + c.P * c.col.x + c.My + c.Vx * inp.Df, 0) / x.Pu;
      const sy = x.cols.reduce((a, c) => a + c.P * c.col.y + c.Mx + c.Vy * inp.Df, 0) / x.Pu;
      return [x.combo.name, n('force', x.Pu, 1), f(sx, 3), f(sy, 3), n('press', x.sol.qmax, 1), n('press', x.sol.qmin, 1), `${f((100 * x.sol.contactArea) / x.sol.area, 0)} %`];
    }),
    { align: ['l', 'r', 'r', 'r', 'r', 'r', 'r'], caption: 'Tabla 6. Presiones netas para el diseño' },
  );

  d.h2('Flexión');
  for (const dir of ['x', 'y'] as const) {
    const fx = dir === 'x' ? res.flexX : res.flexY;
    if (!fx) continue;
    const Rn = fx.Mu / (PHI_FLEX * fx.chord * fx.d * fx.d) / 1000;
    const side = fx.side === 'int' ? 'sección interior' : fx.side === 'izq' ? 'borde de menor coordenada' : 'borde de mayor coordenada';
    d.h3(`Dirección ${dir.toUpperCase()} (barras paralelas a ${dir.toUpperCase()})`);
    d.eq(
      [
        `Sección crítica: ${dir} = ${f(fx.pos, 3)} m (${side}); combinación ${fx.comboName}`,
        `Mu = ${u('moment', fx.Mu, 2)}  (tracción en la cara ${fx.face});  ancho de la sección b = ${f(fx.chord, 3)} m ;  d = ${f(fx.d * 1000, 1)} mm`,
        `Rn = Mu / (φ·b·d²) = ${n('moment', fx.Mu, 2)} / (${PHI_FLEX} × ${f(fx.chord, 3)} × ${f(fx.d, 4)}²) = ${f(Rn, 3)} MPa`,
        `ρ = (0.85·f′c/fy)·[1 − √(1 − 2·Rn/(0.85·f′c))] = ${fx.rho.toFixed(5)}`,
        `As,req = ρ·b·d = ${f(fx.AsReq * fx.chord, 2)} cm²   →   ${f(fx.AsReq, 2)} cm²/m`,
        `As,mín = ${f(fx.AsMin, 2)} cm²/m ;  As de diseño = máx(As,req ; As,mín) = ${f(fx.AsDesign, 2)} cm²/m`,
        `Armado adoptado: ${fx.det.text}  →  As,prov = ${f(fx.det.asProv, 2)} cm²/m`,
        `φMn = φ·As·fy·(d − a/2) = ${u('moment', fx.phiMn, 2)}  ${fx.phiMn >= fx.Mu ? '≥' : '<'}  Mu   (relación ${f(fx.ratio, 2)};  c/d = ${f(fx.cOverD, 3)} ${fx.cOverD <= 0.375 ? '≤' : '>'} 0.375, sección controlada por tracción)`,
        `Longitud de desarrollo: ld = ${f(fx.ldReq, 2)} m  ${fx.hookNeeded ? '>' : '≤'}  disponible = ${isFinite(fx.ldAvail) ? f(fx.ldAvail, 2) + ' m' : 'sección interior'}${fx.hookNeeded ? ' → usar gancho estándar, ldh = ' + f(fx.hookLen, 2) + ' m' : ''}`,
      ],
      `Flexión en ${dir.toUpperCase()}`,
    );
    d.img(footingDiagramSvg(inp, res, { dir, kind: 'M', W: 800, H: 370, theme: th, fmt }), `Figura. Diagrama de momento a lo largo de ${dir.toUpperCase()} — envolvente de combinaciones últimas (positivo = tracción inferior).`, 0.95);
    d.img(footingDiagramSvg(inp, res, { dir, kind: 'V', W: 800, H: 340, theme: th, fmt }), `Figura. Diagrama de cortante a lo largo de ${dir.toUpperCase()} — envolvente de combinaciones últimas.`, 0.95);
  }

  if (inp.topSteel) {
    d.h2('Acero superior (momentos negativos)');
    for (const dir of ['x', 'y'] as const) {
      const fx = dir === 'x' ? res.flexTopX : res.flexTopY;
      if (!fx) continue;
      d.eq(
        [
          `Dirección ${dir.toUpperCase()}: Mu(−) = ${u('moment', fx.Mu, 2)} (combinación ${fx.comboName}); d = ${f(fx.d * 1000, 1)} mm; b = ${f(fx.chord, 3)} m`,
          `As,req = ${f(fx.AsReq, 2)} cm²/m ;  As,mín = ${f(fx.AsMin, 2)} cm²/m ;  armado: ${fx.det.text} → As,prov = ${f(fx.det.asProv, 2)} cm²/m ;  φMn = ${u('moment', fx.phiMn, 2)} (relación ${f(fx.ratio, 2)})`,
        ],
        `Acero superior ${dir.toUpperCase()}`,
      );
    }
  } else if (res.hogging.length) {
    d.h2('Momentos negativos sin acero superior');
    d.eq(res.hogging.map((h) => `Dirección ${h.dir.toUpperCase()}: Mu(−) = ${u('moment', h.Mu, 2)} frente a φMn,simple = φ·0.42·λ·√f′c·S = ${u('moment', h.capPlain, 2)} (${h.comboName}) → relación ${f(h.Mu / Math.max(h.capPlain, 1e-9), 2)}`), 'Concreto simple');
  }
  d.h2('Cortante en una dirección');
  d.eq(
    [
      'Sección crítica a una distancia d de la cara de la columna (envolvente de las dos direcciones y de todas las combinaciones).',
      inp.code === 'ACI318_19' ? 'φVc = φ·min[0.66·λs·λ·ρw^(1/3)·√f′c ; 0.42·λ·√f′c]·bw·d' : 'φVc = φ·0.17·λ·√f′c·bw·d',
    ],
    'Fórmula',
  );
  d.table(
    ['Dir.', 'Combinación', `Posición (${fmt.l('len')})`, `Vu (${fmt.l('force')})`, 'bw (m)', 'd (mm)', `φVc (${fmt.l('force')})`, 'Vu/φVc', 'Estado'],
    (['x', 'y'] as const).map((dir) => {
      const s = dir === 'x' ? res.shearX : res.shearY;
      return s ? [dir.toUpperCase(), s.comboName, f(s.pos, 3), n('force', s.Vu, 1), f(s.bw, 3), f(s.d * 1000, 1), n('force', s.phiVc, 1), f(s.ratio, 2), s.ok ? 'Cumple' : 'No cumple'] : [dir.toUpperCase(), '—', '—', '—', '—', '—', '—', '—', '—'];
    }),
    { align: ['c', 'l', 'r', 'r', 'r', 'r', 'r', 'r', 'c'], caption: 'Tabla 7. Cortante en una dirección' },
  );

  d.h2('Punzonamiento');
  for (const p of res.punching) {
    d.h3(`Columna ${p.col.name}`);
    if (!p.applicable) {
      d.p('El perímetro crítico queda fuera de la zapata o no existe carga neta de punzonamiento; no se requiere verificación.');
      continue;
    }
    d.eq(
      [
        `Combinación crítica: ${p.comboName};  d = ${f(p.d * 1000, 1)} mm (promedio de las dos capas)`,
        `Perímetro crítico a d/2 de la columna: bo = ${f(p.bo, 3)} m ;  Ac = bo·d = ${f(p.Ac, 4)} m² ;  centroide (${f(p.centroid.x, 3)} ; ${f(p.centroid.y, 3)})`,
        `Pu = ${u('force', p.Pu, 1)} ;  presión neta dentro del perímetro = ${u('force', p.Fq, 1)}  →  Vu = Pu − ∫qu dA = ${u('force', p.Vu, 1)}`,
        `Momentos desbalanceados respecto al centroide: Mx = ${u('moment', p.MxU, 1)} ;  My = ${u('moment', p.MyU, 1)}`,
        `γv = 1 − 1/(1 + (2/3)·√(b1/b2)):  γv,x = ${f(p.gammaVx, 3)} ;  γv,y = ${f(p.gammaVy, 3)}`,
        `vu,máx = Vu/Ac + γv·M·c/J  (integración numérica sobre el perímetro) = ${f(p.vuMax, 3)} MPa en (${f(p.vuAt.x, 2)} ; ${f(p.vuAt.y, 2)})`,
        `β = ${f(p.beta, 2)} ;  αs = ${p.alphaS} (${p.openSides === 0 ? 'columna interior' : p.openSides === 1 ? 'columna de borde' : 'columna de esquina'})`,
        `vc = mín[0.33·λ·√f′c ; 0.17·(1 + 2/β)·λ·√f′c ; 0.083·(αs·d/bo + 2)·λ·√f′c] = mín[${f(p.vcA, 3)} ; ${f(p.vcB, 3)} ; ${f(p.vcC, 3)}] = ${f(p.vc, 3)} MPa`,
        `φ·vc = ${PHI_SHEAR} × ${f(p.vc, 3)} = ${f(p.phiVc, 3)} MPa  ${p.vuMax <= p.phiVc ? '≥' : '<'}  vu,máx   (relación ${f(p.ratio, 2)})`,
      ],
      `Punzonamiento — ${p.col.name}`,
    );
  }
  d.img(footingPlanSvg(inp, res, { W: 800, H: 560, theme: th, fmt, combo: null, showPressure: false, showCritical: true, idPrefix: 'r3' }), 'Figura. Perímetros críticos de punzonamiento (línea discontinua).');

  d.h2('Aplastamiento y barras de espera');
  d.table(
    ['Columna', `Pu máx (${fmt.l('force')})`, 'A1 (m²)', `φ·0.85·f′c·A1 (${fmt.l('force')})`, 'Relación', 'As,mín espera (cm²)'],
    res.punching.map((p) => {
      const A1 = polyProps(columnPoly(p.col.geom, p.col.x, p.col.y)).A;
      const cap = PHI_BEARING * 0.85 * inp.fc * A1 * 1000;
      return [p.col.name, n('force', p.Pu, 1), f(A1, 4), n('force', cap, 1), f(p.Pu / cap, 2), f(p.dowelAs, 1)];
    }),
    { align: ['l', 'r', 'r', 'r', 'r', 'r'], caption: 'Se supone A2/A1 = 1 (conservador). As,mín de las barras de espera = 0.005·Ag (ACI 16.3.4.1).' },
  );

  // ------------------------------------------------------------------ 5
  d.h1('Resumen del armado');
  d.table(
    ['Elemento', 'Armado', 'As prov (cm²/m)', 'As req (cm²/m)', 'Observación'],
    [
      ...(['x', 'y'] as const).map((dir) => {
        const fx = dir === 'x' ? res.flexX : res.flexY;
        return [
          `Barras en ${dir.toUpperCase()} (${inp.lowerLayer === dir ? 'capa inferior' : 'capa superior de la parrilla'})`,
          fx?.det.text ?? '—',
          fx ? f(fx.det.asProv, 2) : '—',
          fx ? f(fx.AsReq, 2) : '—',
          fx ? (fx.hookNeeded ? `Gancho estándar, ldh ≥ ${f(fx.hookLen, 2)} m` : `Desarrollo recto (ld = ${f(fx.ldReq, 2)} m)`) : '',
        ];
      }),
      ...(inp.topSteel
        ? (['x', 'y'] as const).map((dir) => {
            const fx = dir === 'x' ? res.flexTopX : res.flexTopY;
            return [`Barras superiores en ${dir.toUpperCase()}`, fx?.det.text ?? '—', fx ? f(fx.det.asProv, 2) : '—', fx ? f(fx.AsReq, 2) : '—', fx ? (fx.Mu > 0 ? `Momento negativo Mu = ${u('moment', fx.Mu, 1)}` : 'Acero mínimo') : ''];
          })
        : [['Acero superior', 'No se coloca', '—', '—', 'Se verifica el concreto simple a tracción por flexión']]),
      ...res.punching.map((p) => [`Barras de espera ${p.col.name}`, 'Según columna', '—', '—', `As ≥ ${f(p.dowelAs, 1)} cm²; anclar con gancho en la zapata`]),
    ],
    { align: ['l', 'l', 'r', 'r', 'l'], caption: 'Tabla 8. Cuadro de armado' },
  );
  d.img(footingRebarPlanSvg(inp, res, { W: 800, H: 560, theme: th, fmt }), 'Figura. Planta de armado inferior.');
  if (inp.topSteel) d.img(footingRebarPlanSvg(inp, res, { W: 800, H: 560, theme: th, fmt, layer: 'top' }), 'Figura. Planta de armado superior.');
  d.img(footingSectionSvg(inp, res, { W: 800, H: 360, theme: th, fmt, dir: 'x' }), 'Figura. Sección a lo largo de X.', 0.92);
  d.img(footingSectionSvg(inp, res, { W: 800, H: 360, theme: th, fmt, dir: 'y' }), 'Figura. Sección a lo largo de Y.', 0.92);
  d.kv(
    [
      ['Volumen de concreto', `${f(res.concreteVolume, 2)} m³`],
      ['Acero estimado', `${f(res.steelKg, 0)} kg (sin ganchos ni traslapes)`],
      ['Cuantía de acero', `${f(res.steelKg / Math.max(res.concreteVolume, 1e-6), 0)} kg/m³`],
    ],
    1,
  );

  // ------------------------------------------------------------------ 6
  d.h1('Resumen de verificaciones');
  d.status(res.checks.map((c) => ({ name: c.name, detail: c.detail, ratio: c.ratio, ok: c.ok })));
  d.p(res.ok ? 'CONCLUSIÓN: la fundación cumple todas las verificaciones realizadas.' : 'CONCLUSIÓN: la fundación NO cumple alguna verificación; debe modificarse la geometría o el armado.', { bold: true });
  if (res.warnings.length) {
    d.h2('Advertencias');
    d.bullets(res.warnings);
  }
  d.h2('Limitaciones');
  d.bullets([
    'No se evalúa la capacidad portante a partir de parámetros de resistencia del suelo (se usa el esfuerzo admisible dado) ni los asentamientos.',
    'La zapata se supone rígida; para zapatas combinadas muy flexibles se recomienda un análisis sobre base elástica.',
    'El refuerzo mínimo, el desarrollo y los detalles constructivos deben verificarse en planos. El aplastamiento se verifica con A2/A1 = 1.',
  ]);
}

export function buildFootingReport(inp: FootingInput, res: FootingResults, fmt: Fmt, info: ProjectInfo): ReportDoc {
  const d = new DocBuilder();
  footingBlocks(inp, res, fmt, d);
  return { title: `Diseño de la fundación ${inp.name}`, subtitle: 'Fundación superficial — ACI 318', info, blocks: d.blocks, footer: `TerraStruct · ${inp.name}` };
}
