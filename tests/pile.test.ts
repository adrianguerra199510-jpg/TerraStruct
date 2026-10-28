import { describe, it, expect } from 'vitest';
import { defaultPileInput } from '../src/core/pileTypes';
import { analyzePile, solveReactions, autoSizePile } from '../src/core/pile';
import { concretePhiMn, concreteCurve, pileProps, steelCapacity, lateralPile } from '../src/core/pileStruct';

describe('reacciones de pilotes', () => {
  it('equilibrio y método elástico', () => {
    const pts = [{ x: -1, y: -1 }, { x: 1, y: -1 }, { x: 1, y: 1 }, { x: -1, y: 1 }];
    const r = solveReactions(pts, 400, 0, 0).R;
    r.forEach((v) => expect(v).toBeCloseTo(100, 9));
    const m = solveReactions(pts, 400, 200, 0).R; // My = 200 → ΔR = M·x/Σx² = 200/4 = 50
    expect(m[1]).toBeCloseTo(150, 9);
    expect(m[0]).toBeCloseTo(50, 9);
    expect(m.reduce((a, b) => a + b, 0)).toBeCloseTo(400, 9);
  });
  it('grupo alineado marca momento no resistido', () => {
    const r = solveReactions([{ x: -1, y: 0 }, { x: 1, y: 0 }], 100, 0, 50);
    expect(r.unresolved).toBe(true);
  });
});

describe('pilote de concreto', () => {
  it('capacidad axial máxima y curva P-M', () => {
    const inp = defaultPileInput();
    const c = concretePhiMn(inp.pile, 0);
    // φPn,max = 0.75·0.85·[0.85 f′c (Ag − Ast) + fy Ast]
    const Ag = Math.PI * 0.25 * 0.25, Ast = 8 * 2.84e-4;
    expect(c.phiPnMax).toBeCloseTo(0.75 * 0.85 * (0.85 * 28 * (Ag - Ast) + 420 * Ast) * 1000, 0);
    expect(c.phiMn).toBeGreaterThan(100);
    const mid = concretePhiMn(inp.pile, 1500);
    expect(mid.phiMn).toBeGreaterThan(c.phiMn * 0.9); // el momento crece con la compresión moderada
    expect(concretePhiMn(inp.pile, 5000).phiMn).toBe(0);
    const cv = concreteCurve(inp.pile);
    expect(cv.pts.every((q) => isFinite(q.Pn) && isFinite(q.Mn))).toBe(true);
  });
  it('flexión pura de una sección circular ≈ fórmula simple', () => {
    const inp = defaultPileInput();
    const c = concretePhiMn(inp.pile, 0);
    // Mn ≈ As·fy·0.8·D_bar aprox. (brazo ≈ 0.4 m, barras repartidas): orden de magnitud
    expect(c.phiMn).toBeGreaterThan(100);
    expect(c.phiMn).toBeLessThan(400);
  });
});

describe('pilote de acero', () => {
  it('tubo y perfil H', () => {
    const inp = defaultPileInput('pipe');
    const pr = pileProps(inp.pile);
    const s = steelCapacity(inp.pile, pr, 1);
    expect(s.phiPt).toBeCloseTo(0.9 * 290 * pr.A * 1000, 3);
    expect(s.phiPn).toBeLessThanOrEqual(s.phiPt + 1e-6);
    const h = defaultPileInput('hpile');
    const ph = pileProps({ ...h.pile, tc: 0 });
    expect(ph.A * 1e4).toBeGreaterThan(130); // HP12x74 ≈ 21.8 in² = 140 cm²
    expect(ph.A * 1e4).toBeLessThan(150);
  });
  it('lateral Matlock-Reese', () => {
    const inp = defaultPileInput();
    const pr = pileProps(inp.pile);
    const l = lateralPile(inp.pile, pr.EI, 50);
    expect(l.T).toBeCloseTo(Math.pow(pr.EI / 5000, 0.2), 9);
    expect(l.y).toBeCloseTo((0.93 * 50 * l.T ** 3) / pr.EI, 9);
  });
});

describe('grupo y cabezal', () => {
  it('ejemplo por defecto se analiza', () => {
    const r = analyzePile(defaultPileInput());
    expect(r.n).toBe(4);
    expect(r.geo.QaC).toBeGreaterThan(300);
    console.log(r.checks.map((c) => `${c.name}: ${c.ratio.toFixed(2)} ${c.ok ? 'ok' : 'NO'} | ${c.detail}`).join('\n'));
    console.log('Qa', r.geo.QaC, r.geo.Qs, r.geo.Qb);
  });
  it('dimensionamiento automático', () => {
    for (const k of ['concrete', 'pipe', 'hpile'] as const) {
      const out = autoSizePile(defaultPileInput(k));
      console.log(k, out.note, analyzePile(out.input).n, out.input.cap.h, out.input.cap.barX);
      expect(out.ok).toBe(true);
    }
  });
});

import { reportForPile, reportForProject } from '../src/report';
import { makeFmt } from '../src/core/units';
import { newProject, normalizeProject } from '../src/state';
describe('memoria de pilotes', () => {
  it('se genera para los tres tipos y el proyecto la incluye', () => {
    const info = newProject().info;
    for (const k of ['concrete', 'pipe', 'hpile'] as const) {
      const doc = reportForPile(defaultPileInput(k), makeFmt('SI'), info);
      expect(doc.blocks.length).toBeGreaterThan(40);
    }
    const p = newProject();
    p.piles = [{ id: 'a', data: defaultPileInput() }];
    const q = normalizeProject(JSON.parse(JSON.stringify(p)));
    expect(q.piles.length).toBe(1);
    expect(reportForProject(q, makeFmt('TEC')).blocks.some((b) => b.t === 'h1' && /Pilotes y cabezal/.test((b as any).text))).toBe(true);
  });
});
