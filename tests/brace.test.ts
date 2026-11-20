import { describe, it, expect } from 'vitest';
import { braceReactions } from '../src/core/wallBrace';
import { defaultWall, isBraced } from '../src/core/wallTypes';
import { buildWallGeom } from '../src/core/wallGeom';
import { evalCase, SERVICE_FACTORS } from '../src/core/wallStability';
import { sectionLoad, stemLateral } from '../src/core/wallDesign';
import { k0Coef } from '../src/core/earth';
import { analyzeWall } from '../src/core/wall';

const t = () => 0.3;

describe('viga continua de la pantalla (soluciones analíticas)', () => {
  const L = 4, w0 = 30;
  // carga triangular: máxima en la base (y = 0), nula en la corona
  const tri = (y: number) => w0 * (1 - y / L);
  it('empotrada en la base y apoyada arriba: R = w0·L/10', () => {
    const [r] = braceReactions(L, t, { levels: [L], base: 'fixed' }, [tri]);
    expect(r.R[0]).toBeCloseTo((w0 * L) / 10, 3);
    expect(r.V0).toBeCloseTo((2 * w0 * L) / 5, 3);
  });
  it('articulada en la base y apoyada arriba: R = w0·L/6', () => {
    const [r] = braceReactions(L, t, { levels: [L], base: 'pinned' }, [tri]);
    expect(r.R[0]).toBeCloseTo((w0 * L) / 6, 3);
    expect(r.V0).toBeCloseTo((w0 * L) / 3, 3);
  });
  it('carga uniforme, dos vanos iguales articulados: apoyo central = 5/4·w·l', () => {
    const w = 10, l = 3;
    const [r] = braceReactions(2 * l, t, { levels: [l, 2 * l], base: 'pinned' }, [() => w]);
    expect(r.R[0]).toBeCloseTo((5 / 4) * w * l, 3);
    expect(r.R[1]).toBeCloseTo((3 / 8) * w * l, 3);
  });
  it('equilibrio con voladizo superior (losa bajo la corona)', () => {
    const w = 12;
    const [r] = braceReactions(5, t, { levels: [2.5, 4.2], base: 'fixed' }, [() => w]);
    expect(r.R[0] + r.R[1] + r.V0).toBeCloseTo(w * 5, 6);
  });
});

describe('muro de sótano arriostrado', () => {
  const mk = () => {
    const w = defaultWall('cantilever');
    w.H = 6; w.tTop = 0.3; w.tBot = 0.3; w.fill.q = 0; w.fill.beta = 0; w.passive.use = false;
    w.brace = { on: true, levels: [6], base: 'pinned', k0: true, floor: false };
    return w;
  };
  it('activa el arriostre solo con niveles válidos', () => {
    const w = mk();
    expect(isBraced(w)).toBe(true);
    expect(isBraced({ ...w, brace: { ...w.brace, levels: [0, 9] } })).toBe(false);
    expect(isBraced({ ...w, type: 'counterfortInt' })).toBe(false);
  });
  it('pantalla articulada con losa en la corona: reacción = K0·γ·H²/6 y momento nulo en ambos apoyos', () => {
    const w = mk();
    const g = buildWallGeom(w);
    const lat = stemLateral(g);
    const K0 = k0Coef(32, 0);
    expect(lat.Ka).toBeCloseTo(K0, 9);
    expect(lat.brace!.R.soil[0]).toBeCloseTo((K0 * 18 * 36) / 6, 2);
    const base = sectionLoad(g, lat, 0);
    expect(base.M.soil).toBeCloseTo(0, 2);
    // momento máximo de la viga simplemente apoyada con carga triangular: w0·L²/(9√3) a L/√3 de la base
    const wb = K0 * 18 * 6;
    const yMax = 6 - 6 / Math.sqrt(3);
    expect(-sectionLoad(g, lat, yMax).M.soil).toBeCloseTo((wb * 36) / (9 * Math.sqrt(3)), 1);
  });
  it('la reacción de la losa entra en la estabilidad y reduce el empuje que llega a la base', () => {
    const w = mk();
    const g = buildWallGeom(w);
    const c = evalCase(g, 'servicio', SERVICE_FACTORS, false, { passive: false, surchargeV: false });
    const slab = c.h.find((h) => h.name.startsWith('Reacción del apoyo A1'))!;
    expect(slab.H).toBeLessThan(0);
    expect(slab.y).toBeCloseTo(g.hb + 6, 9);
    const K0 = k0Coef(32, 0);
    expect(-slab.H).toBeCloseTo((K0 * 18 * 36) / 6, 2);
    const thrust = c.h.filter((h) => h !== slab).reduce((a, h) => a + h.H, 0);
    expect(c.SumH).toBeCloseTo(thrust + slab.H, 9);
    const unbraced = evalCase(buildWallGeom({ ...w, brace: { ...w.brace, on: false } }), 's', SERVICE_FACTORS, false, { passive: false, surchargeV: false });
    expect(c.FSot).toBeGreaterThan(unbraced.FSot);
  });
  it('diseño: momentos de ambos signos y acero en la cara interior', () => {
    const w = mk();
    w.H = 6; w.brace.levels = [3, 6]; w.brace.base = 'fixed';
    const r = analyzeWall(w);
    const st = r.design.stem!;
    expect(Math.max(...st.sections.map((s) => s.Mu))).toBeGreaterThan(0);
    expect(Math.max(...st.sections.map((s) => s.MuFront))).toBeGreaterThan(0);
    expect(st.yCut).toBeNull();
    expect(r.design.brace!.Ru.length).toBe(2);
    expect(r.design.brace!.Ru.every((x) => x > 0)).toBe(true);
  });
});
