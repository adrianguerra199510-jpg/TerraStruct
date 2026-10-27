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

describe('zapatas de muros: acero opcional', () => {
  it('cara opuesta y sin acero longitudinal', () => {
    const w = defaultWall('cantilever');
    w.mat.footOpp = true;
    w.mat.footLong = false;
    const r = analyzeWall(w);
    expect(r.design.toe!.opp).toBeTruthy();
    expect(r.design.toe!.shrinkDet.text).toBe('No se coloca');
    const w2 = defaultWall('cantilever');
    expect(analyzeWall(w2).design.toe!.opp).toBeUndefined();
  });
});

describe('mampostería reforzada según el bloque', () => {
  it('el espesor es el del bloque', () => {
    for (const b of ['6', '8', '12'] as const) {
      const w = defaultWall('masonryReinforced');
      w.block = b;
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
