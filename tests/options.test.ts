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
