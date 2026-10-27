import { describe, it, expect } from 'vitest';
import { defaultWall, WALL_TYPES } from '../src/core/wallTypes';
import { buildWallGeom } from '../src/core/wallGeom';
import { designWall } from '../src/core/wallDesign';
import { evalCase, SERVICE_FACTORS } from '../src/core/wallStability';

describe('diseño de todos los tipos de muro corre sin errores', () => {
  for (const t of WALL_TYPES) {
    it(t.label, () => {
      const w = defaultWall(t.id);
      const g = buildWallGeom(w);
      const d = designWall(g);
      const c = evalCase(g, 's', SERVICE_FACTORS, false, { passive: true, surchargeV: true });
      expect(isFinite(c.FSot)).toBe(true);
      expect(isFinite(c.FSsl)).toBe(true);
      console.log(t.id, 'FSot', c.FSot.toFixed(2), 'FSsl', c.FSsl.toFixed(2), 'qmax', c.qmax.toFixed(0), 'B', g.B.toFixed(2), 'stem', d.stem?.base.text, d.stem?.sectionOk, 'cf', d.counterfort?.sectionOk, 'gravity', d.gravity?.map(s=>s.ok).join(','));
    });
  }
});

import { kaRankine } from '../src/core/earth';
import { analyzeWall } from '../src/core/wall';
describe('verificación manual de la pantalla en voladizo', () => {
  it('Mu en la base de la pantalla = 1.6·(Ka γ H³/6 + Ka q H²/2)', () => {
    const w = defaultWall('cantilever');
    const r = analyzeWall(w);
    const Ka = kaRankine(w.fill.phi);
    const H = w.H;
    const expected = 1.6 * ((Ka * w.fill.gamma * H ** 3) / 6 + (Ka * w.fill.q * H ** 2) / 2);
    expect(r.design.stem!.sections[0].Mu).toBeCloseTo(expected, 2);
    const Vexp = 1.6 * ((Ka * w.fill.gamma * H ** 2) / 2 + Ka * w.fill.q * H);
    // cortante a d de la base ≈ V en la base menos el empuje en d
    expect(r.design.stem!.critical.Vu).toBeLessThan(Vexp);
    expect(r.design.stem!.critical.Vu).toBeGreaterThan(0.8 * Vexp);
  });
  it('equilibrio de la presión en la base: integral de q = ΣV', () => {
    const r = analyzeWall(defaultWall('cantilever'));
    for (const u of r.design.uls) {
      let F = 0;
      const n = 4000;
      const B = r.geom.B;
      for (let i = 0; i < n; i++) F += (u.res.qAt(((i + 0.5) / n) * B) * B) / n;
      expect(F).toBeCloseTo(u.res.SumV, 0);
    }
  });
  it('talón con agua y talud: sigue calculando', () => {
    const w = defaultWall('cantilever');
    w.hw = 2; w.fill.beta = 15; w.seismic.on = true; w.key.enabled = true;
    const r = analyzeWall(w);
    expect(isFinite(r.staticCase.FSot)).toBe(true);
    expect(r.seismicCase).toBeTruthy();
    expect(r.design.key).toBeTruthy();
  });
});
