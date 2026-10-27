import { describe, it, expect } from 'vitest';
import { kaRankine, kpRankine, kaCoulomb, kaeMononobe, faceThrust, rad } from '../src/core/earth';

/** Empuje activo de Coulomb por cuña de prueba (cara inclinada ψ desde la vertical, hacia adelante). */
function coulombTrial(phiDeg: number, deltaDeg: number, psiDeg: number, betaDeg: number, H: number, gamma = 1) {
  const phi = rad(phiDeg), d = rad(deltaDeg), psi = rad(psiDeg), beta = rad(betaDeg);
  const topX = -H * Math.tan(psi); // cara de (0,0) a (topX,H); el suelo está hacia +x
  const ang = psi + d; // dirección de la fuerza del muro sobre la cuña
  let best = 0;
  for (let i = 1; i < 20000; i++) {
    const rho = rad(0.01 + (i / 20000) * 89.9);
    const den = Math.tan(rho) - Math.tan(beta);
    if (den <= 1e-9) continue;
    const x = (H - topX * Math.tan(beta)) / den;
    const y = x * Math.tan(rho);
    const W = (gamma * Math.abs(x * H - topX * y)) / 2;
    const R = rho + Math.PI / 2 - phi; // dirección de la reacción del suelo estable
    const Pm = (W * Math.cos(R)) / Math.sin(ang - R);
    if (Pm > best) best = Pm;
  }
  return best;
}

/** Pseudo-estático (Mononobe–Okabe) por cuña de prueba. */
function moTrial(phiDeg: number, deltaDeg: number, psiDeg: number, betaDeg: number, H: number, kh: number, kv: number) {
  const phi = rad(phiDeg), d = rad(deltaDeg), psi = rad(psiDeg), beta = rad(betaDeg);
  const topX = -H * Math.tan(psi);
  const ang = psi + d;
  let best = 0;
  for (let i = 1; i < 20000; i++) {
    const rho = rad(0.01 + (i / 20000) * 89.9);
    const den = Math.tan(rho) - Math.tan(beta);
    if (den <= 1e-9) continue;
    const x = (H - topX * Math.tan(beta)) / den;
    const y = x * Math.tan(rho);
    const W = Math.abs(x * H - topX * y) / 2;
    const R = rho + Math.PI / 2 - phi;
    const det = Math.sin(R - ang);
    if (Math.abs(det) < 1e-12) continue;
    const Pm = (kh * W * Math.sin(R) - (1 - kv) * W * Math.cos(R)) / det;
    if (Pm > best) best = Pm;
  }
  return best;
}

describe('coeficientes de empuje', () => {
  it('Rankine vertical: (1 − sinφ)/(1 + sinφ)', () => {
    const phi = 30;
    expect(kaRankine(phi)).toBeCloseTo((1 - Math.sin(rad(phi))) / (1 + Math.sin(rad(phi))), 8);
    expect(kpRankine(phi)).toBeCloseTo(3, 8);
  });
  it('Rankine con talud β=10°, φ=30°: 0.3495', () => {
    expect(kaRankine(30, 10)).toBeCloseTo(0.3495, 3);
  });
  it('Coulomb con cara vertical, δ = 0 y β = 0 coincide con Rankine', () => {
    expect(kaCoulomb(33, 0, 90, 0)).toBeCloseTo(kaRankine(33), 8);
  });
  it('Mononobe–Okabe sin sismo = Coulomb; crece con kh', () => {
    expect(kaeMononobe(33, 20, 85, 5, 0, 0)).toBeCloseTo(kaCoulomb(33, 20, 85, 5), 10);
    expect(kaeMononobe(33, 20, 85, 5, 0.15, 0)).toBeGreaterThan(kaCoulomb(33, 20, 85, 5));
  });
  it('Coulomb frente a cuña de prueba (cara inclinada, δ y talud)', () => {
    const cases: [number, number, number, number][] = [
      [30, 0, 0, 0],
      [32, 20, 10, 0],
      [35, 15, 0, 10],
      [28, 14, 15, 5],
      [33, 22, 25, 12],
    ];
    for (const [phi, delta, psi, beta] of cases) {
      const H = 5;
      const ka = kaCoulomb(phi, delta, 90 - psi, beta);
      const Pa = 0.5 * ka * H * H;
      const trial = coulombTrial(phi, delta, psi, beta, H);
      expect(Pa).toBeCloseTo(trial, 1);
    }
  });
  it('Mononobe–Okabe frente a cuña pseudo-estática', () => {
    const cases: [number, number, number, number, number, number][] = [
      [33, 0, 0, 0, 0.15, 0],
      [33, 16, 0, 5, 0.2, 0],
      [30, 15, 10, 0, 0.12, 0.05],
    ];
    for (const [phi, delta, psi, beta, kh, kv] of cases) {
      const H = 5;
      const kae = kaeMononobe(phi, delta, 90 - psi, beta, kh, kv);
      const Pae = 0.5 * (1 - kv) * kae * H * H;
      expect(Pae).toBeCloseTo(moTrial(phi, delta, psi, beta, H, kh, kv), 1);
    }
  });
  it('empuje sobre cara vertical: ½·Ka·γ·H² a H/3', () => {
    const ka = kaRankine(30);
    const t = faceThrust({ Ka: ka, deltaDeg: 0, psiDeg: 0, Hv: 4, q: 0, gamma: 18, gammaSat: 20, zw: Infinity });
    expect(t.soil.Ph).toBeCloseTo(0.5 * ka * 18 * 16, 6);
    expect(t.soil.y).toBeCloseTo(4 / 3, 6);
  });
  it('sobrecarga: Ka·q·H a H/2; agua: ½γw·h²', () => {
    const ka = kaRankine(30);
    const t = faceThrust({ Ka: ka, deltaDeg: 0, psiDeg: 0, Hv: 4, q: 10, gamma: 18, gammaSat: 20, zw: 0 });
    expect(t.surcharge.Ph).toBeCloseTo(ka * 10 * 4, 6);
    expect(t.water.Ph).toBeCloseTo(0.5 * 9.81 * 16, 6);
  });
});
