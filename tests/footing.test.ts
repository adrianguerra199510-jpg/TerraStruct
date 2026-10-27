import { describe, it, expect } from 'vitest';
import { analyzeFooting, defaultFooting, defaultColumn, FootingInput } from '../src/core/footing';
import { footingPresetPoly, defaultPresetParams } from '../src/core/shapes';

function simple(): FootingInput {
  const f = defaultFooting();
  f.combos = f.combos.filter((c) => ['S1', 'S2', 'U2'].includes(c.id));
  return f;
}

describe('zapata rectangular con columna centrada (verificación a mano)', () => {
  const f = simple();
  const r = analyzeFooting(f);
  it('presión de servicio D+L', () => {
    const s = r.service.find((x) => x.combo.id === 'S2')!;
    const P = 900 + 24 * 0.6 * 5.76 + 17 * 0.9 * (5.76 - 0.16) + 24 * 0.9 * 0.16;
    expect(s.Ptot).toBeCloseTo(P, 6);
    expect(s.sol.qmax).toBeCloseTo(P / 5.76, 6);
  });
  it('momento en la cara de la columna', () => {
    const qu = 1200 / 5.76;
    const M = (qu * 2.4 * 1.0 ** 2) / 2;
    expect(r.flexX!.Mu).toBeCloseTo(M, 3);
    expect(r.flexY!.Mu).toBeCloseTo(M, 3);
  });
  it('cortante a d de la cara', () => {
    const qu = 1200 / 5.76;
    const d = r.dx;
    const V = qu * 2.4 * (1.0 - d);
    expect(r.shearX!.Vu).toBeCloseTo(V, 2);
  });
  it('punzonamiento: perímetro a d/2 (esquinas redondeadas ≈ 4(c+d)... )', () => {
    const p = r.punching[0];
    const d = r.dAvg;
    // perímetro con esquinas circulares: 4c + 2π(d/2)
    expect(p.bo).toBeCloseTo(4 * 0.4 + Math.PI * d, 2);
    const qu = 1200 / 5.76;
    expect(p.Vu).toBeCloseTo(1200 - qu * (0.4 + d) ** 2 + qu * (4 - Math.PI) * (d / 2) ** 2, 1);
  });
});

describe('equilibrio de momentos seccionales', () => {
  it('izquierda y derecha dan el mismo momento (combinada con 2 columnas)', () => {
    const f = simple();
    f.vertices = footingPresetPoly('rect', { ...defaultPresetParams(), B: 5, L: 2 });
    f.columns = [defaultColumn('a', 'A', -1.2, 0.1), defaultColumn('b', 'B', 1.3, -0.1)];
    f.columns[1].loads.D.P = 900;
    const r = analyzeFooting(f);
    expect(r.flexX).toBeTruthy();
    expect(r.punching.length).toBe(2);
    expect(r.flexX!.diagram.M[0]).toBeCloseTo(0, 6);
  });
});

describe('formas arbitrarias', () => {
  it('zapata en L con columna en L y momentos biaxiales', () => {
    const f = simple();
    f.vertices = footingPresetPoly('L', { ...defaultPresetParams(), B: 3.2, L: 3.2, t1: 1.6, t2: 1.6 });
    f.columns[0].geom.shape = 'L';
    f.columns[0].geom.b = 0.5; f.columns[0].geom.h = 0.5; f.columns[0].geom.t = 0.2;
    f.columns[0].x = -0.8; f.columns[0].y = -0.8;
    f.columns[0].loads.D.Mx = 30; f.columns[0].loads.D.My = -20;
    const r = analyzeFooting(f);
    expect(r.service.every((s) => s.sol.ok)).toBe(true);
    expect(r.punching[0].applicable).toBe(true);
    expect(isFinite(r.flexX!.AsReq)).toBe(true);
  });
  it('zapata circular y columna circular', () => {
    const f = simple();
    f.vertices = footingPresetPoly('circle', { ...defaultPresetParams(), D: 2.8 });
    f.columns[0].geom.shape = 'circle';
    const r = analyzeFooting(f);
    expect(r.punching[0].beta).toBeCloseTo(1, 1);
    expect(r.area).toBeGreaterThan(6.0);
  });
});
