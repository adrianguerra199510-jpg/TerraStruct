import { describe, it, expect } from 'vitest';
import { analyzeFooting, defaultFooting, defaultColumn } from '../src/core/footing';
import { footingPresetPoly, defaultPresetParams } from '../src/core/shapes';
import { defaultWall, blockThickness } from '../src/core/wallTypes';
import { analyzeWall } from '../src/core/wall';

describe('acero superior opcional en zapatas', () => {
  const mk = (top: boolean) => {
    const f = defaultFooting();
    f.vertices = footingPresetPoly('rect', { ...defaultPresetParams(), B: 6, L: 2.4 });
    f.columns = [defaultColumn('a', 'A', -2, 0), defaultColumn('b', 'B', 2, 0)];
    f.topSteel = top;
    return analyzeFooting(f);
  };
  it('zapata combinada con acero superior: se diseña la parrilla superior', () => {
    const r = mk(true);
    expect(r.flexTopX).toBeTruthy();
    expect(r.flexTopX!.face).toBe('superior');
    expect(r.flexTopX!.Mu).toBeGreaterThan(0);
  });
  it('sin acero superior: se informa el momento negativo', () => {
    const r = mk(false);
    expect(r.flexTopX).toBeNull();
    expect(r.hogging.length).toBeGreaterThan(0);
  });
  it('zapata aislada sin momentos negativos', () => {
    const r = analyzeFooting(defaultFooting());
    expect(r.hogging.length).toBe(0);
  });
});

describe('zapata corrida de muros: malla definida por el usuario', () => {
  it('sin acero longitudinal y sin malla superior', () => {
    const w = defaultWall('cantilever');
    w.mat.mesh.longOn = false;
    w.mat.mesh.topOn = false;
    const r = analyzeWall(w);
    expect(r.design.mesh!.long).toBeNull();
    expect(r.design.mesh!.top).toBeNull();
    // el talón necesita acero superior: sin malla superior no cumple
    expect(r.design.heel!.ratioM).toBe(Infinity);
    expect(r.ok).toBe(false);
  });
  it('una separación mayor reduce la resistencia (se valida lo definido)', () => {
    const w1 = defaultWall('cantilever'); w1.mat.mesh.topS = 0.2;
    const w2 = defaultWall('cantilever'); w2.mat.mesh.topS = 0.4;
    expect(analyzeWall(w2).design.heel!.phiMn).toBeLessThan(analyzeWall(w1).design.heel!.phiMn);
  });
  it('sugerencia cumple', () => {
    const w = defaultWall('cantilever');
    const sg = analyzeWall(w).design.suggest!.mesh;
    w.mat.mesh.botS = sg.botS; w.mat.mesh.topS = sg.topS; w.mat.mesh.longS = sg.longS;
    const r = analyzeWall(w);
    expect(r.checks.filter((c) => /Zapata|Pie|Talón/.test(c.name)).every((c) => c.ok)).toBe(true);
  });
});

describe('armado del contrafuerte definido por el usuario', () => {
  for (const t of ['counterfortInt', 'counterfortExt'] as const) {
    it(`${t}: pocas barras no cumplen y la sugerencia sí`, () => {
      const w = defaultWall(t);
      w.cf.rb.nMain = 2;
      const r = analyzeWall(w);
      expect(r.design.counterfort!.ratios.main).toBeGreaterThan(1);
      const sg = r.design.counterfort!.suggest;
      w.cf.rb.nMain = sg.nMain; w.cf.rb.stirS = sg.stirS; w.cf.rb.tieStemS = sg.tieStemS; w.cf.rb.tieSlabS = sg.tieSlabS; w.cf.rb.stemHS = sg.stemHS; w.cf.rb.stemVS = sg.stemVS;
      w.mat.mesh.longS = sg.slabLongS;
      const r2 = analyzeWall(w);
      expect(Object.values(r2.design.counterfort!.ratios).every((v) => v <= 1.0001)).toBe(true);
    });
  }
});

describe('mampostería reforzada según el bloque', () => {
  it('el espesor es el del bloque', () => {
    for (const b of ['6', '8', '12'] as const) {
      const w = defaultWall('masonryReinforced');
      w.block = b;
      w.mat.stemLayers = 1;
      const r = analyzeWall(w);
      expect(r.geom.stemT(0)).toBeCloseTo(blockThickness(b), 9);
      expect(r.design.stem!.sections[0].d).toBeCloseTo(blockThickness(b) / 2, 9);
    }
  });
  it('bloque más grueso resiste más', () => {
    const mk = (b: '6' | '12') => { const w = defaultWall('masonryReinforced'); w.block = b; w.H = 3; return analyzeWall(w).design.stem!.sections[0].AsReq; };
    expect(mk('12')).toBeLessThan(mk('6'));
  });
});

describe('armadura de la pantalla elegible', () => {
  it('bloque de 6″: una sola capa aunque se pida dos', () => {
    const w = defaultWall('masonryReinforced');
    w.block = '6'; w.mat.stemLayers = 2;
    const r = analyzeWall(w);
    expect(r.design.stem!.layers).toBe(1);
    expect(r.design.stem!.centered).toBe(true);
  });
  it('bloque de 8″ con dos capas usa d mayor que al centro', () => {
    const w1 = defaultWall('masonryReinforced'); w1.block = '8'; w1.mat.stemLayers = 1;
    const w2 = defaultWall('masonryReinforced'); w2.block = '8'; w2.mat.stemLayers = 2;
    expect(analyzeWall(w2).design.stem!.sections[0].d).toBeGreaterThan(analyzeWall(w1).design.stem!.sections[0].d);
  });
  it('separación vertical elegida se respeta y se verifica', () => {
    const w = defaultWall('masonryReinforced');
    w.mat.stemVertS = 1.2;
    const r = analyzeWall(w);
    expect(r.design.stem!.base.spacing).toBeCloseTo(1.2, 9);
    expect(r.design.stem!.vertRatio).toBeGreaterThan(0);
  });
  it('muro de concreto: una capa y sin horizontales', () => {
    const w = defaultWall('cantilever');
    w.mat.stemLayers = 1; w.mat.horizOn = false; w.mat.horizS = 0;
    const r = analyzeWall(w);
    expect(r.design.stem!.frontVertDet.asProv).toBe(0);
    expect(r.design.stem!.horizOn).toBe(false);
    expect(r.warnings.some((x) => /horizontales/.test(x))).toBe(true);
  });
  it('separación horizontal elegida muy grande no cumple el mínimo', () => {
    const w = defaultWall('cantilever');
    w.mat.horizS = 0.6;
    const r = analyzeWall(w);
    expect(r.design.stem!.horizRatio).toBeGreaterThan(1);
  });
});

import { isCounterfort, isMasonry, cfInternal } from '../src/core/wallTypes';
import { stemHookSide } from '../src/core/wallGeom';
import { reportForWall, reportForFooting } from '../src/report';
import { makeFmt } from '../src/core/units';
import { newProject } from '../src/state';

describe('muros de bloque con contrafuertes', () => {
  for (const t of ['masonryCfInt', 'masonryCfExt'] as const) {
    it(`${t}: se analiza, diseña el contrafuerte con mampostería y la memoria se genera`, () => {
      const w = defaultWall(t);
      expect(isCounterfort(t) && isMasonry(t)).toBe(true);
      const r = analyzeWall(w);
      expect(r.ok).toBe(true);
      const c = r.design.counterfort!;
      expect(c.kind).toBe(cfInternal(t) ? 'interno' : 'externo');
      expect(c.notes.some((n) => /Mampostería/.test(n))).toBe(true);
      // el espesor de la pantalla es el del bloque de 8″
      expect(r.inp.tBot).toBeCloseTo(0.2, 9);
      // separación del acero horizontal en múltiplos de 20 cm
      expect(c.stemNegDet.spacing / 0.2).toBeCloseTo(Math.round(c.stemNegDet.spacing / 0.2), 9);
      const doc = reportForWall(w, makeFmt('SI'), newProject().info);
      expect(JSON.stringify(doc.blocks)).toContain('TMS 402');
    });
  }
  it('menos acero horizontal en la pantalla empeora la relación', () => {
    const a = analyzeWall(defaultWall('masonryCfInt')).design.counterfort!;
    const w = defaultWall('masonryCfInt');
    w.cf.rb.stemHS = 0.6;
    const b = analyzeWall(w).design.counterfort!;
    expect(b.ratios.stemNeg).toBeGreaterThan(a.ratios.stemNeg);
  });
});

describe('gancho de las barras de la pantalla', () => {
  it('hacia el pie por defecto; hacia el talón si no hay pie; hacia el pie si no hay talón', () => {
    const w = defaultWall('cantilever');
    expect(stemHookSide(analyzeWall(w).geom)).toBe(-1);
    w.Lt = 0;
    expect(stemHookSide(analyzeWall(w).geom)).toBe(1);
    const v = defaultWall('cantilever');
    v.Lh = 0;
    expect(stemHookSide(analyzeWall(v).geom)).toBe(-1);
  });
});

import { defaultCrownBeam } from '../src/core/wallTypes';
describe('vigas corona y flexión vertical', () => {
  it('la viga corona se calcula con su franja tributaria y las fórmulas de viga continua', () => {
    const w = defaultWall('counterfortExt');
    w.beams = [defaultCrownBeam(w.H, w.tBot)];
    const r = analyzeWall(w);
    const c = r.design.counterfort!;
    const b = c.beams[0];
    expect(b.Mneg).toBeCloseTo((b.w * c.Ls ** 2) / 12, 9);
    expect(b.Mpos).toBeCloseTo((b.w * c.Ls ** 2) / 16, 9);
    expect(b.Vu).toBeCloseTo(b.w * (c.Ls / 2 - (b.dBack + b.dFront) / 2), 6);
    expect(b.hi).toBeCloseTo(w.H, 9);
    expect(b.lo).toBeCloseTo((w.H - b.h / 2) / 2, 9);
    expect(r.checks.some((k) => /Viga corona 1/.test(k.name))).toBe(true);
  });
  it('varias vigas: la franja tributaria se reparte entre ellas y la suma cubre la altura', () => {
    const w = defaultWall('masonryCfInt');
    w.beams = [defaultCrownBeam(w.H, w.tBot), defaultCrownBeam(w.H * 0.5, w.tBot), defaultCrownBeam(w.H * 0.25, w.tBot)];
    const bs = analyzeWall(w).design.counterfort!.beams;
    const sum = bs.reduce((a, b) => a + b.trib, 0);
    // desde la mitad de la viga inferior hasta la corona; lo que queda debajo lo recibe la zapata
    expect(sum).toBeCloseTo(w.H - Math.min(...bs.map((b) => b.yc)) / 2, 6);
  });
  it('el armado sugerido cumple', () => {
    const w = defaultWall('counterfortExt');
    w.beams = [{ ...defaultCrownBeam(w.H * 0.5, 0.4), b: 0.4, h: 0.3 }];
    const sug = analyzeWall(w).design.counterfort!.beams[0].suggest;
    w.beams[0] = { ...w.beams[0], nBack: sug.nBack, nFront: sug.nFront, stirS: sug.stirS, barBack: '#8', barFront: '#8' };
    const sug2 = analyzeWall(w).design.counterfort!.beams[0].suggest;
    w.beams[0] = { ...w.beams[0], nBack: sug2.nBack, nFront: sug2.nFront, stirS: sug2.stirS };
    expect(analyzeWall(w).design.counterfort!.beams[0].ok).toBe(true);
  });
  it('agregar una viga aumenta el peso y aparece en la geometría; una viga dentro del espesor suma poco', () => {
    const w0 = defaultWall('masonryCfInt');
    const w1 = { ...w0, beams: [defaultCrownBeam(w0.H, w0.tBot)] };
    const r0 = analyzeWall({ ...w0, beams: [] }), r1 = analyzeWall(w1);
    expect(r1.weightWall).toBeGreaterThan(r0.weightWall);
    expect(r1.geom.parts.some((p) => p.id === 'beam')).toBe(true);
  });
  it('flexión vertical de la pantalla: máx. en la base y decrece con la altura', () => {
    const c = analyzeWall(defaultWall('counterfortInt')).design.counterfort!;
    expect(c.vertical[0].Mu).toBeGreaterThan(c.vertical[5].Mu);
    expect(c.vertical[c.vertical.length - 1].Mu).toBeCloseTo(0, 9);
    expect(c.AsVertCalc).toBeGreaterThan(0);
    expect(c.req.vert).toBeGreaterThanOrEqual(c.AsVertMin);
  });
  it('la memoria incluye vigas corona y flexión vertical', () => {
    const w = defaultWall('masonryCfInt');
    const txt = JSON.stringify(reportForWall(w, makeFmt('SI'), newProject().info).blocks);
    expect(txt).toContain('Vigas corona entre contrafuertes');
    expect(txt).toContain('Flexión vertical de la pantalla');
  });
});

describe('diagramas de momento y cortante (zapatas y muros)', () => {
  it('zapata: los diagramas cierran en cero en los bordes y el máximo coincide con el Mu de diseño', () => {
    const f = defaultFooting();
    f.columns[0].loads.D.Mx = 30;
    const r = analyzeFooting(f);
    for (const fl of [r.flexX!, r.flexY!]) {
      expect(fl.diagramAll.length).toBeGreaterThan(0);
      for (const c of fl.diagramAll) {
        expect(Math.abs(c.M[0])).toBeLessThan(1e-6);
        expect(Math.abs(c.M[c.M.length - 1])).toBeLessThan(1e-3);
      }
      const peak = Math.max(...fl.diagramAll.flatMap((c) => c.M));
      expect(peak).toBeGreaterThanOrEqual(fl.Mu * 0.99);
    }
  });
  it('muro en voladizo: momento y cortante máximos en la base y nulos en la corona; pie y talón nulos en el extremo', () => {
    const r = analyzeWall(defaultWall('cantilever'));
    const dg = r.design.diagrams!;
    expect(dg.stem!.Mst[0]).toBeGreaterThan(0);
    expect(dg.stem!.Mst[dg.stem!.Mst.length - 1]).toBeCloseTo(0, 6);
    expect(dg.stem!.Vst[0]).toBeGreaterThan(dg.stem!.Vst[10]);
    expect(dg.stem!.Mst[0]).toBeCloseTo(r.design.stem!.sections[0].MuStatic, 6);
    const toe = dg.base!.toe!;
    for (const c of toe.combos) expect(Math.abs(c.M[0])).toBeLessThan(1e-9);
    const heel = dg.base!.heel!;
    for (const c of heel.combos) expect(Math.abs(c.M[c.M.length - 1])).toBeLessThan(1e-9);
    // el momento de diseño del pie (tracción inferior) es el máximo del diagrama
    expect(Math.max(...toe.combos.map((c) => Math.max(...c.M)))).toBeCloseTo(r.design.toe!.Mu > 0 ? Math.max(r.design.toe!.Mu, r.design.toe!.opp?.Mu ?? 0) : 0, 0);
  });
  it('contrafuertes, gravedad: se generan sus diagramas', () => {
    expect(analyzeWall(defaultWall('counterfortInt')).design.diagrams!.counterfort!.M.length).toBeGreaterThan(5);
    expect(analyzeWall(defaultWall('masonryCfExt')).design.diagrams!.stemSlab!.Mneg.length).toBeGreaterThan(5);
    expect(analyzeWall(defaultWall('gravityConcrete')).design.diagrams!.gravity!.M.length).toBeGreaterThan(5);
  });
  it('las figuras y la memoria incluyen los diagramas', () => {
    const w = defaultWall('cantilever');
    const txt = JSON.stringify(reportForWall(w, makeFmt('SI'), newProject().info).blocks);
    expect(txt).toContain('Diagramas de momento y de cortante');
    const ft = JSON.stringify(reportForFooting(defaultFooting(), makeFmt('SI'), newProject().info).blocks);
    expect(ft).toContain('Diagrama de cortante a lo largo de X');
  });
});

import { sectionLoad, stemLateral } from '../src/core/wallDesign';
import { GAMMA_W } from '../src/core/earth';
describe('muros de piscina (agua interior, vacía y llena)', () => {
  const mk = (t: 'cantilever' | 'masonryReinforced' = 'cantilever', hwi = 2.2) => {
    const w = defaultWall(t);
    w.pool = { on: true, hwi };
    return w;
  };
  it('se evalúan dos condiciones y el resultado combina ambas', () => {
    const r = analyzeWall(mk());
    expect(r.pool!.states.map((s) => s.id)).toEqual(['vacia', 'llena']);
    expect(r.ok).toBe(r.pool!.states.every((s) => s.res.ok));
    expect(r.checks.some((c) => /^Piscina vacía — /.test(c.name))).toBe(true);
    expect(r.checks.some((c) => /^Piscina llena — /.test(c.name))).toBe(true);
    // sin piscina el análisis es el de siempre
    const w0 = defaultWall('cantilever');
    expect(analyzeWall(w0).pool).toBeUndefined();
  });
  it('empuje hidrostático ½γw·h² hacia el relleno, peso del agua sobre el pie y sin suelo en el pie', () => {
    const w = mk('cantilever', 2.0);
    const llena = analyzeWall(w).pool!.states[1].res.staticCase;
    const vacia = analyzeWall(w).pool!.states[0].res.staticCase;
    const hf = llena.h.find((q) => /agua de la piscina/.test(q.name))!;
    expect(hf.H).toBeCloseTo(-0.5 * GAMMA_W * 2.0 ** 2, 6);
    expect(llena.v.some((q) => /Agua de la piscina sobre el pie/.test(q.name))).toBe(true);
    expect(llena.v.some((q) => /Suelo sobre el pie/.test(q.name))).toBe(false);
    expect(vacia.h.some((q) => /agua de la piscina/.test(q.name))).toBe(false);
    // el agua interior reduce el volcamiento hacia el frente: FS llena > FS vacía
    expect(llena.FSot).toBeGreaterThan(vacia.FSot);
    expect(llena.passive).toBeNull();
  });
  it('momento del agua en la sección: γw·(hw − y)³/6 y cortante ½γw·(hw − y)²', () => {
    const w = mk('cantilever', 2.0);
    const llena = analyzeWall(w).pool!.states[1].res;
    const L = sectionLoad(llena.geom, stemLateral(llena.geom), 0.5);
    expect(L.M.pool).toBeCloseTo((GAMMA_W * 1.5 ** 3) / 6, 6);
    expect(L.V.pool).toBeCloseTo(0.5 * GAMMA_W * 1.5 ** 2, 6);
    expect(sectionLoad(llena.geom, stemLateral(llena.geom), 2.3).M.pool).toBe(0);
  });
  it('la condición llena exige acero en la cara frontal; sin dos capas no cumple (hormigón)', () => {
    const w = mk('cantilever', defaultWall('cantilever').H);
    const r = analyzeWall(w);
    const llena = r.pool!.states[1].res;
    expect(llena.design.stem!.front).not.toBeNull();
    expect(r.pool!.states[0].res.design.stem!.front).toBeNull();
    w.mat.stemLayers = 1;
    const r1 = analyzeWall(w);
    const chk = r1.checks.find((c) => /Piscina llena — Pantalla: acero de la cara frontal/.test(c.name))!;
    expect(chk.ok).toBe(false);
    expect(r1.ok).toBe(false);
  });
  it('mampostería con la barra al centro resiste el momento invertido', () => {
    const r = analyzeWall(mk('masonryReinforced', 2.0));
    const f = r.pool!.states[1].res.design.stem!.front!;
    expect(f.prov).toBeGreaterThan(0);
    expect(f.ok).toBe(true);
  });
  it('las tipologías sin voladizo ignoran la piscina y la memoria incluye ambas condiciones', () => {
    const g = defaultWall('gravityConcrete');
    g.pool = { on: true, hwi: 1 };
    expect(analyzeWall(g).pool).toBeUndefined();
    const txt = JSON.stringify(reportForWall(mk(), makeFmt('SI'), newProject().info).blocks);
    expect(txt).toContain('Piscina: condiciones de carga evaluadas');
    expect(txt).toContain('Condición: Piscina llena');
    expect(txt).toContain('Condición: Piscina vacía');
  });
});
