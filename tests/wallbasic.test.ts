import { describe, it, expect } from 'vitest';
import { defaultWall } from '../src/core/wallTypes';
import { buildWallGeom } from '../src/core/wallGeom';
import { evalCase, SERVICE_FACTORS } from '../src/core/wallStability';
import { kaRankine } from '../src/core/earth';

describe('estabilidad muro en voladizo (verificación a mano)', () => {
  const w = defaultWall('cantilever');
  w.fill.q = 0;
  w.passive.use = false;
  w.includeToeSoil = false;
  const g = buildWallGeom(w);
  const c = evalCase(g, 'servicio', SERVICE_FACTORS, false, { passive: false, surchargeV: false });
  it('geometría', () => {
    expect(g.B).toBeCloseTo(0.9 + 0.45 + 2.0, 9);
    expect(g.yPlane).toBeCloseTo(4.5, 9);
  });
  it('empuje activo Rankine sobre el plano vertical', () => {
    const Ka = kaRankine(32);
    const Pa = 0.5 * Ka * 18 * 4.5 ** 2;
    const f = c.h.find((x) => x.name === 'Empuje activo del suelo')!;
    expect(f.H).toBeCloseTo(Pa, 6);
    expect(f.y).toBeCloseTo(1.5, 6);
    expect(c.Mot).toBeCloseTo(Pa * 1.5, 6);
  });
  it('pesos y momentos', () => {
    const B = g.B;
    const stem = 24 * 4.0 * (0.3 + 0.45) / 2;
    const base = 24 * 0.5 * B;
    const soil = 18 * 2.0 * 4.0 + 18 * ((0.45 - 0.3) * 4.0) / 2;
    const Wsum = c.v.filter((x) => !x.name.includes('vertical')).reduce((s, a) => s + a.V, 0);
    expect(Wsum).toBeCloseTo(stem + base + soil, 3);
    expect(c.SumV).toBeCloseTo(stem + base + soil, 3);
    expect(c.FSot).toBeCloseTo(c.Mres / c.Mot, 9);
    expect(c.xbar).toBeCloseTo((c.Mres - c.Mot) / c.SumV, 9);
  });
  it('presión en la base consistente con ΣV y xbar', () => {
    // la integral de q(x) en la base debe igualar ΣV y su momento Mres-Mot
    let F = 0, M = 0;
    const n = 4000;
    for (let i = 0; i < n; i++) {
      const x = ((i + 0.5) / n) * g.B;
      const q = c.qAt(x);
      F += (q * g.B) / n;
      M += (q * x * g.B) / n;
    }
    expect(F).toBeCloseTo(c.SumV, 1);
    expect(M).toBeCloseTo(c.SumV * c.xbar, 0);
  });
});
