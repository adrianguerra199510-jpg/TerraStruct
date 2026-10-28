// Análisis completo de un muro de retención.
import { WallInput, isGravity, normalizeWall } from './wallTypes';
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

export interface WallResults {
  inp: WallInput;
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

export function analyzeWall(input: WallInput): WallResults {
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
    add({ group: 'Estabilidad', name: `Deslizamiento ${tag}`, ratio: c.fsSLreq / c.FSsl, detail: `FS = ${isFinite(c.FSsl) ? c.FSsl.toFixed(2) : '∞'} (mín. ${c.fsSLreq})`, ok: c.ok.sl });
    add({ group: 'Estabilidad', name: `Presión sobre el suelo ${tag}`, ratio: c.qmax / c.qaAllow, detail: `qmax = ${isFinite(c.qmax) ? c.qmax.toFixed(1) : '∞'} kPa (q adm. = ${c.qaAllow.toFixed(1)} kPa)`, ok: c.ok.q });
    add({ group: 'Estabilidad', name: `Excentricidad ${tag}`, ratio: Math.abs(c.e) / (c.B / (c.seismic ? 3 : 6)), detail: `e = ${c.e.toFixed(3)} m (límite B/${c.seismic ? 3 : 6} = ${(c.B / (c.seismic ? 3 : 6)).toFixed(3)} m)`, ok: c.ok.e, advisory: true });
  };
  stab(staticCase, '(estático)');
  if (seismicCase) stab(seismicCase, '(sísmico)');

  const d = design;
  if (d.stem) {
    const worst = Math.max(...d.stem.sections.map((s) => (s.phiMn > 0 ? s.Mu / s.phiMn : 0)));
    add({ group: 'Estructural', name: 'Pantalla: flexión', ratio: worst, detail: `Acero ${d.stem.base.text} en la base`, ok: d.stem.sections.every((s) => s.ok) && worst <= 1.0001 });
    add({ group: 'Estructural', name: 'Pantalla: cortante', ratio: d.stem.critical.ratio, detail: `Vu = ${d.stem.critical.Vu.toFixed(1)} kN/m, φVc = ${d.stem.critical.phiVc.toFixed(1)} kN/m`, ok: d.stem.critical.ratio <= 1 });
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
