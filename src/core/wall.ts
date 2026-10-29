// Análisis completo de un muro de retención.
import { WallInput, isGravity, normalizeWall, canPool } from './wallTypes';
import { WallGeom, buildWallGeom } from './wallGeom';
import { CaseResult, EarthModel, SERVICE_FACTORS, earthModel, evalCase } from './wallStability';
import { WallDesign, designWall } from './wallDesign';

export interface WallCheck {
  group: 'Estabilidad' | 'Estructural';
  name: string;
  /** demanda / capacidad (o FS requerido / FS obtenido) */
  ratio: number;
  detail: string;
  ok: boolean;
  advisory?: boolean;
}

/** Condición de la piscina: vacía (solo relleno) o llena (agua interior + relleno) */
export interface PoolState {
  id: 'vacia' | 'llena' | 'llenaSinRelleno';
  label: string;
  res: WallResults;
}

export interface WallResults {
  inp: WallInput;
  /** con piscina: resultados completos de cada condición; los campos principales corresponden a la condición mostrada */
  pool?: { states: PoolState[]; view: PoolState['id']; hwi: number };
  geom: WallGeom;
  earth: EarthModel;
  earthSeismic: EarthModel | null;
  staticCase: CaseResult;
  seismicCase: CaseResult | null;
  design: WallDesign;
  checks: WallCheck[];
  warnings: string[];
  ok: boolean;
  concreteVolume: number; // m³/m
  weightWall: number; // kN/m
}

const res0h = (g: { hb: number }) => g.hb * 1e4;

/** Análisis con piscina: se evalúan las condiciones vacía y llena y se combinan las verificaciones. */
export function analyzeWall(input: WallInput, view: PoolState['id'] = 'llena'): WallResults {
  const inp0 = normalizeWall(input);
  if (!inp0.pool.on || !canPool(inp0.type)) return analyzeWallCore({ ...inp0, poolDepth: 0 });
  const hwi = Math.min(Math.max(inp0.pool.hwi, 0.05), inp0.H);
  // Piscina llena sin relleno: se anula el suelo, la sobrecarga y el agua freática detrás del muro
  const noFillInp = { ...inp0, poolDepth: hwi, poolNoFill: true, hw: 0, fill: { ...inp0.fill, gamma: 0, gammaSat: 0, q: 0, beta: 0 } };
  const sinRelleno = analyzeWallCore(noFillInp);
  // el acero de la cara frontal debe cubrir también la condición sin relleno
  const frontMin = sinRelleno.design.stem?.front?.req ?? 0;
  const states: PoolState[] = [
    { id: 'vacia', label: 'Piscina vacía', res: analyzeWallCore({ ...inp0, poolDepth: 0, poolFrontMin: frontMin }) },
    { id: 'llena', label: 'Piscina llena', res: analyzeWallCore({ ...inp0, poolDepth: hwi, poolFrontMin: frontMin }) },
    { id: 'llenaSinRelleno', label: 'Piscina llena sin relleno', res: analyzeWallCore({ ...noFillInp, poolFrontMin: frontMin }) },
  ];
  const main = states.find((q) => q.id === view)?.res ?? states[1].res;
  const checks: WallCheck[] = states.flatMap((q) => q.res.checks.map((c) => ({ ...c, name: `${q.label} — ${c.name}` })));
  const warnings = [...new Set(states.flatMap((q) => q.res.warnings.map((w) => (states.length ? `${q.label}: ${w}` : w))))];
  return { ...main, pool: { states, view, hwi }, checks, warnings, ok: checks.filter((c) => !c.advisory).every((c) => c.ok) };
}

function analyzeWallCore(input: WallInput): WallResults {
  const inp = normalizeWall(input);
  const geom = buildWallGeom(inp);
  const warnings: string[] = [];
  const surchargeV = !inp.ignoreSurchargeWeight && inp.fill.q > 0;
  const staticCase = evalCase(geom, 'Servicio (estático)', SERVICE_FACTORS, false, { passive: true, surchargeV });
  const seismicCase = inp.seismic.on
    ? evalCase(geom, 'Servicio con sismo', SERVICE_FACTORS, true, { passive: true, surchargeV })
    : null;
  const design = designWall(geom);
  const checks: WallCheck[] = [];
  const add = (c: WallCheck) => checks.push(c);

  const stab = (c: CaseResult, tag: string) => {
    add({ group: 'Estabilidad', name: `Volcamiento ${tag}`, ratio: c.fsOTreq / c.FSot, detail: `FS = ${isFinite(c.FSot) ? c.FSot.toFixed(2) : '∞'} (mín. ${c.fsOTreq})`, ok: c.ok.ot });
    if (isFinite(c.FSotBack)) add({ group: 'Estabilidad', name: `Volcamiento hacia el relleno ${tag}`, ratio: c.fsOTreq / c.FSotBack, detail: `FS = ${c.FSotBack.toFixed(2)} (mín. ${c.fsOTreq}) respecto al extremo del talón`, ok: c.FSotBack >= c.fsOTreq });
    add({ group: 'Estabilidad', name: `Deslizamiento ${tag}`, ratio: c.fsSLreq / c.FSsl, detail: `FS = ${isFinite(c.FSsl) ? c.FSsl.toFixed(2) : '∞'} (mín. ${c.fsSLreq})`, ok: c.ok.sl });
    add({ group: 'Estabilidad', name: `Presión sobre el suelo ${tag}`, ratio: c.qmax / c.qaAllow, detail: `qmax = ${isFinite(c.qmax) ? c.qmax.toFixed(1) : '∞'} kPa (q adm. = ${c.qaAllow.toFixed(1)} kPa)`, ok: c.ok.q });
    add({ group: 'Estabilidad', name: `Excentricidad ${tag}`, ratio: Math.abs(c.e) / (c.B / (c.seismic ? 3 : 6)), detail: `e = ${c.e.toFixed(3)} m (límite B/${c.seismic ? 3 : 6} = ${(c.B / (c.seismic ? 3 : 6)).toFixed(3)} m)`, ok: c.ok.e, advisory: true });
  };
  stab(staticCase, '(estático)');
  if (seismicCase) stab(seismicCase, '(sísmico)');

  // Flotación del fondo con la piscina vacía: subpresión uniforme del nivel freático vs. peso estabilizante
  if (inp.pool.on && inp.poolDepth <= 0 && inp.hw > 0) {
    const Wstab = staticCase.uplift > 0 ? staticCase.SumV + staticCase.uplift : 0;
    const FSf = staticCase.uplift > 0 ? Wstab / staticCase.uplift : Infinity;
    add({ group: 'Estabilidad', name: 'Flotación del fondo (subpresión)', ratio: 1.1 / FSf, detail: `FS = ΣW / U = ${Wstab.toFixed(1)} / ${staticCase.uplift.toFixed(1)} = ${isFinite(FSf) ? FSf.toFixed(2) : '∞'} (mín. 1.10)`, ok: FSf >= 1.1 });
  }
  const d = design;
  if (d.stem) {
    const worst = Math.max(...d.stem.sections.map((s) => (s.phiMn > 0 ? s.Mu / s.phiMn : 0)));
    add({ group: 'Estructural', name: 'Pantalla: flexión', ratio: worst, detail: `Acero ${d.stem.base.text} en la base`, ok: d.stem.sections.every((s) => s.ok) && worst <= 1.0001 });
    add({ group: 'Estructural', name: 'Pantalla: cortante', ratio: d.stem.critical.ratio, detail: `Vu = ${d.stem.critical.Vu.toFixed(1)} kN/m, φVc = ${d.stem.critical.phiVc.toFixed(1)} kN/m`, ok: d.stem.critical.ratio <= 1 });
  }
  if (d.stem?.front) {
    const fr = d.stem.front;
    add({ group: 'Estructural', name: 'Pantalla: acero de la cara frontal (momento invertido)', ratio: fr.ratio, detail: `Mu(−) máx. = ${fr.maxMu.toFixed(1)} kN·m/m; requerido ${fr.req.toFixed(2)} cm²/m, colocado ${fr.prov.toFixed(2)} cm²/m${d.stem.layers === 1 && !d.stem.centered ? ' (active dos capas de acero vertical)' : ''}`, ok: fr.ok });
  }
  if (d.stem) {
    add({ group: 'Estructural', name: 'Pantalla: acero vertical adoptado', ratio: d.stem.vertRatio, detail: `${d.stem.base.text}${d.stem.layers === 2 ? ' en cada cara' : d.stem.centered ? ' (barra centrada)' : ''}`, ok: d.stem.vertRatio <= 1.0001 });
    if (d.stem.horizOn) add({ group: 'Estructural', name: 'Pantalla: acero horizontal mínimo', ratio: d.stem.horizRatio, detail: `${d.stem.horizontalDet.text}${d.stem.horizLayers === 2 ? ' en cada cara' : ''} (ρ mín. ${d.stem.rhoH})`, ok: d.stem.horizRatio <= 1.0001 });
    else warnings.push('Sin barras horizontales en la pantalla: no se cubre el acero mínimo de retracción y temperatura.');
  }
  if (d.toe) {
    add({ group: 'Estructural', name: 'Pie: flexión', ratio: d.toe.ratioM, detail: `Mu = ${d.toe.Mu.toFixed(1)} kN·m/m (cara ${d.toe.face})`, ok: d.toe.sectionOk && d.toe.ratioM <= 1 });
    add({ group: 'Estructural', name: 'Pie: cortante', ratio: d.toe.ratioV, detail: `Vu = ${d.toe.Vu.toFixed(1)} kN/m`, ok: d.toe.ratioV <= 1 });
  }
  if (d.heel) {
    add({ group: 'Estructural', name: 'Talón: flexión', ratio: d.heel.ratioM, detail: `Mu = ${d.heel.Mu.toFixed(1)} kN·m/m (cara ${d.heel.face})`, ok: d.heel.sectionOk && d.heel.ratioM <= 1 });
    add({ group: 'Estructural', name: 'Talón: cortante', ratio: d.heel.ratioV, detail: `Vu = ${d.heel.Vu.toFixed(1)} kN/m`, ok: d.heel.ratioV <= 1 });
  }
  for (const sl of [d.toe, d.heel]) {
    if (sl?.opp && sl.opp.Mu > 0.01) add({ group: 'Estructural', name: `${sl.name}: flexión cara ${sl.opp.face}`, ratio: sl.opp.ratioM, detail: `Mu = ${sl.opp.Mu.toFixed(1)} kN·m/m con ${sl.opp.det.text}`, ok: sl.opp.sectionOk && sl.opp.ratioM <= 1 });
  }
  if (d.mesh) {
    const mm = d.mesh;
    add({ group: 'Estructural', name: 'Zapata: acero transversal mínimo', ratio: Math.max(mm.minBot, mm.minTop ?? 0), detail: `0.0018·b·h = ${(0.0018 * res0h(geom)).toFixed(2)} cm²/m por capa`, ok: Math.max(mm.minBot, mm.minTop ?? 0) <= 1.0001 });
    if (mm.long) add({ group: 'Estructural', name: 'Zapata: acero longitudinal mínimo', ratio: mm.long.ratio, detail: `${mm.long.det.text} × ${mm.long.layers} capa(s) = ${mm.long.AsTotal.toFixed(2)} cm²/m (mín. ${mm.long.AsMin.toFixed(2)})`, ok: mm.long.ratio <= 1.0001 });
    add({ group: 'Estructural', name: 'Zapata: separación máxima de barras', ratio: Math.max(inp.mat.mesh.botS, inp.mat.mesh.topOn ? inp.mat.mesh.topS : 0, inp.mat.mesh.longOn ? inp.mat.mesh.longS : 0) / mm.sMax, detail: `máx. ${(mm.sMax * 100).toFixed(0)} cm (menor de 3h y 45 cm)`, ok: mm.spacingOk });
  }
  if (d.key) {
    add({ group: 'Estructural', name: 'Llave de corte: flexión', ratio: d.key.slab.ratioM, detail: `Mu = ${d.key.slab.Mu.toFixed(1)} kN·m/m`, ok: d.key.slab.sectionOk && d.key.slab.ratioM <= 1 });
  }
  if (d.gravity) {
    const wc = Math.max(...d.gravity.map((s) => Math.max(s.ratioC, s.ratioT, s.ratioV)));
    const mat = d.gravityMaterial === 'mamposteria' ? 'mampostería' : d.gravityMaterial === 'gaviones' ? 'gaviones' : 'concreto simple';
    add({ group: 'Estructural', name: `Secciones de la pantalla (${mat})`, ratio: wc, detail: d.gravityMaterial === 'gaviones' ? 'Compresión, excentricidad y deslizamiento entre cuerpos' : 'Compresión, tracción y cortante en 11 secciones', ok: d.gravity.every((s) => s.ok) });
  }
  if (d.baseCheck) {
    for (const b of d.baseCheck) add({ group: 'Estructural', name: `Zapata: ${b.name}`, ratio: b.ratio, detail: b.detail, ok: b.ratio <= 1 });
  }
  if (d.counterfort) {
    const c = d.counterfort;
    const mx = Math.max(...c.sections.map((s) => (s.AsReq > 1e5 ? Infinity : 0)));
    add({ group: 'Estructural', name: 'Contrafuerte: flexión', ratio: isFinite(mx) ? c.AsMax / Math.max(c.AsProv, 1e-9) : Infinity, detail: `${c.nBars} barras ${c.bar.id}`, ok: c.sectionOk && c.AsMax <= c.AsProv + 1e-9 });
    add({ group: 'Estructural', name: 'Contrafuerte: cortante', ratio: c.critical.ratio, detail: `Vu = ${c.critical.Vu.toFixed(1)} kN`, ok: c.critical.ratio <= 1 });
    const rr = c.ratios;
    add({ group: 'Estructural', name: 'Contrafuerte: acero principal adoptado', ratio: rr.main, detail: `${c.nBars} × ${c.bar.id} = ${c.AsProv.toFixed(1)} cm² (req. ${c.AsMax.toFixed(1)})`, ok: rr.main <= 1.0001 });
    add({ group: 'Estructural', name: 'Contrafuerte: estribos', ratio: Math.max(rr.stirrup, rr.stirMin), detail: `${c.stirrup.id} @ ${(c.stirrupSpacing * 100).toFixed(0)} cm (2 ramas)`, ok: Math.max(rr.stirrup, rr.stirMin) <= 1.0001 });
    add({ group: 'Estructural', name: 'Amarres pantalla–contrafuerte', ratio: rr.tieStem, detail: c.tieStem.text, ok: rr.tieStem <= 1.0001 });
    add({ group: 'Estructural', name: 'Amarres zapata–contrafuerte', ratio: rr.tieSlab, detail: c.tieSlab.text, ok: rr.tieSlab <= 1.0001 });
    add({ group: 'Estructural', name: 'Pantalla entre contrafuertes: acero horizontal', ratio: Math.max(rr.stemNeg, rr.stemPos), detail: `${c.stemNegDet.text} en cada cara`, ok: Math.max(rr.stemNeg, rr.stemPos) <= 1.0001 });
    add({ group: 'Estructural', name: 'Pantalla entre contrafuertes: acero vertical', ratio: rr.vert, detail: `${c.vertDet.text}; requerido ${c.req.vert.toFixed(2)} cm²/m (flexión en dos direcciones ${c.AsVertCalc.toFixed(2)}, mínimo ${c.AsVertMin.toFixed(2)})`, ok: rr.vert <= 1.0001 });
    add({ group: 'Estructural', name: `${c.slabLabel}: acero longitudinal`, ratio: Math.max(rr.slabNeg, rr.slabPos), detail: c.slabPosDet.text, ok: Math.max(rr.slabNeg, rr.slabPos) <= 1.0001 });
    for (const b of c.beams) {
      add({ group: 'Estructural', name: `Viga corona ${b.i + 1}: flexión (cara del relleno / frontal)`, ratio: Math.max(b.ratios.back, b.ratios.front, b.ratios.flexBack, b.ratios.flexFront), detail: `${b.textBack} / ${b.textFront}; Mu(−) = ${b.Mneg.toFixed(1)}, Mu(+) = ${b.Mpos.toFixed(1)} kN·m`, ok: Math.max(b.ratios.back, b.ratios.front, b.ratios.flexBack, b.ratios.flexFront) <= 1.0001 });
      add({ group: 'Estructural', name: `Viga corona ${b.i + 1}: cortante y estribos`, ratio: Math.max(b.ratios.shear, b.ratios.stir), detail: `${b.textStir}; Vu = ${b.Vu.toFixed(1)} kN ≤ φVn = ${b.phiVn.toFixed(1)} kN`, ok: Math.max(b.ratios.shear, b.ratios.stir) <= 1.0001 });
    }
    add({ group: 'Estructural', name: 'Pantalla entre contrafuertes: cortante', ratio: c.stemShear.ratio, detail: `Vu = ${c.stemShear.Vu.toFixed(1)} kN/m`, ok: c.stemShear.ratio <= 1 });
  }

  warnings.push(...d.warnings);
  if (inp.theory === 'coulomb' && isGravity(inp.type) && inp.Lh > 0.001) warnings.push('Con talón y Coulomb el suelo sobre el talón se suma al empuje: se recomienda Rankine con plano virtual.');
  if (inp.key.enabled && inp.key.x + inp.key.b > geom.B + 1e-6) warnings.push('La llave de corte se sale de la base.');
  if (inp.found.bearingMode === 'calc' && inp.found.phi <= 0 && inp.found.c <= 0) warnings.push('Capacidad portante calculada con c = 0 y φ = 0.');
  if (isFinite(staticCase.qmax) === false) warnings.push('Sin equilibrio: la resultante cae fuera de la base.');
  if (staticCase.xbar > 0 && !staticCase.fullContact) warnings.push('La resultante queda fuera del tercio medio: hay levantamiento parcial de la base.');

  const concreteVolume = geom.parts.filter((p) => p.id !== 'stem' || (inp.type !== 'gravityMasonry' && inp.type !== 'gabion')).reduce((s, p) => s + p.area * p.scale, 0);
  const weightWall = geom.parts.reduce((s, p) => s + p.W, 0);
  const ok = checks.filter((c) => !c.advisory).every((c) => c.ok);
  return {
    inp, geom, earth: earthModel(geom, false), earthSeismic: inp.seismic.on ? earthModel(geom, true) : null, staticCase, seismicCase, design, checks, warnings, ok, concreteVolume, weightWall,
  };
}
