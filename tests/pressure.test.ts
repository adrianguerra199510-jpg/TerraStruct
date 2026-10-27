import { describe, it, expect } from 'vitest';
import { solvePressure } from '../src/core/pressure';
import { footingPresetPoly, defaultPresetParams } from '../src/core/shapes';
import { polyProps, integratePlane, clipHalfPlane } from '../src/core/geometry';

const rect = (B: number, L: number) => footingPresetPoly('rect', { ...defaultPresetParams(), B, L });

describe('presión de contacto', () => {
  it('carga centrada: presión uniforme P/A', () => {
    const r = solvePressure(rect(2, 3), 600, 0, 0);
    expect(r.ok).toBe(true);
    expect(r.qmax).toBeCloseTo(100, 6);
    expect(r.qmin).toBeCloseTo(100, 6);
    expect(r.uplift).toBe(false);
  });

  it('excentricidad dentro del núcleo: q = P/A (1 ± 6e/B)', () => {
    const B = 3, L = 2, P = 900, e = 0.3;
    const r = solvePressure(rect(B, L), P, P * e, 0);
    expect(r.qmax).toBeCloseTo((P / (B * L)) * (1 + (6 * e) / B), 6);
    expect(r.qmin).toBeCloseTo((P / (B * L)) * (1 - (6 * e) / B), 6);
  });

  it('excentricidad fuera del núcleo: qmax = 2P / (3 L (B/2 - e))', () => {
    const B = 3, L = 2, P = 900, e = 0.9; // B/6 = 0.5
    const r = solvePressure(rect(B, L), P, P * e, 0);
    expect(r.uplift).toBe(true);
    expect(r.qmax).toBeCloseTo((2 * P) / (3 * L * (B / 2 - e)), 5);
    expect(r.contactArea).toBeCloseTo(3 * (B / 2 - e) * L, 6);
  });

  it('flexión biaxial: equilibrio de fuerza y momentos', () => {
    const poly = footingPresetPoly('L', { ...defaultPresetParams(), B: 3, L: 3, t1: 1, t2: 1 });
    const P = 500, Qx = 120, Qy = -80;
    const r = solvePressure(poly, P, Qx, Qy);
    expect(r.ok).toBe(true);
    const I = integratePlane(clipHalfPlane(poly, r.plane.a, r.plane.b, r.plane.q0), r.plane.q0, r.plane.a, r.plane.b);
    expect(I.F).toBeCloseTo(P, 6);
    expect(I.Qx).toBeCloseTo(Qx, 6);
    expect(I.Qy).toBeCloseTo(Qy, 6);
  });

  it('zapata circular con carga excéntrica en equilibrio', () => {
    const poly = footingPresetPoly('circle', { ...defaultPresetParams(), D: 2.4 });
    const P = 800;
    const r = solvePressure(poly, P, P * 0.45, 0);
    const reg = clipHalfPlane(poly, r.plane.a, r.plane.b, r.plane.q0);
    const I = integratePlane(reg, r.plane.q0, r.plane.a, r.plane.b);
    expect(I.F).toBeCloseTo(P, 5);
    expect(I.Qx / I.F).toBeCloseTo(0.45, 6);
  });

  it('resultante fuera de la zapata: no hay equilibrio', () => {
    const r = solvePressure(rect(2, 2), 100, 150, 0);
    expect(r.ok).toBe(false);
    expect(r.reason).toBe('fuera');
  });

  it('propiedades de área del rectángulo', () => {
    const p = polyProps(rect(2, 3));
    expect(p.A).toBeCloseTo(6, 9);
    expect(p.Iy).toBeCloseTo((3 * 2 ** 3) / 12, 9);
    expect(p.Ix).toBeCloseTo((2 * 3 ** 3) / 12, 9);
    expect(p.Ixy).toBeCloseTo(0, 9);
  });
});
