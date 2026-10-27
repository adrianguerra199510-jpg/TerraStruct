import { describe, it, expect } from 'vitest';
import { defaultWall } from '../src/core/wallTypes';
import { analyzeWall } from '../src/core/wall';

describe('muro de gaviones', () => {
  const r = analyzeWall(defaultWall('gabion'));
  it('geometría escalonada y peso', () => {
    expect(r.geom.B).toBeCloseTo(2.5, 9);
    const stem = r.geom.parts.find((p) => p.id === 'stem')!;
    expect(stem.area).toBeCloseTo(2.5 + 2.0 + 1.5 + 1.0, 9);
    expect(stem.W).toBeCloseTo(7 * 26 * 0.7, 6);
  });
  it('una verificación por cuerpo y resultados finitos', () => {
    expect(r.design.gravity!.length).toBe(4);
    for (const s of r.design.gravity!) expect(isFinite(s.N)).toBe(true);
    console.log(r.ok, r.checks.filter((c) => !c.ok || c.ratio > 0.85).map((c) => `${c.name} ${c.ratio.toFixed(2)}`), r.design.gravity!.map((s) => [s.ratioC, s.ratioT, s.ratioV].map((v) => v.toFixed(2)).join('/')));
  });
});
