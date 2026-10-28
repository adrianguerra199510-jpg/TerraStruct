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

import { pMultiplier, groupLateral, liquefaction, settlement } from '../src/core/pileExtra';
import { defaultLayers } from '../src/core/pileTypes';
describe('efectos adicionales', () => {
  it('multiplicadores p (AASHTO)', () => {
    expect(pMultiplier(0, 3)).toBeCloseTo(0.8, 9);
    expect(pMultiplier(1, 3)).toBeCloseTo(0.4, 9);
    expect(pMultiplier(2, 5)).toBeCloseTo(0.7, 9);
    expect(pMultiplier(1, 8)).toBe(1);
    const gl = groupLateral([{ x: -0.75, y: 0 }, { x: 0.75, y: 0 }], 0.5, 100, 0);
    expect(gl.pm[1]).toBeCloseTo(0.8, 9); // delantero en +x
    expect(gl.pm[0]).toBeCloseTo(0.4, 9);
  });
  it('el efecto de grupo aumenta el momento del pilote delantero respecto a no considerarlo', () => {
    const inp = defaultPileInput();
    const r = analyzePile(inp);
    const u = r.ultimate.find((x) => x.Hpile > 0)!;
    expect(Math.max(...u.Hi)).toBeGreaterThanOrEqual(u.H / r.n - 1e-9);
    expect(u.Hi.reduce((a, b) => a + b, 0)).toBeCloseTo(u.H, 6);
  });
  it('licuación: arena suelta con sismo fuerte licúa y densa no', () => {
    const inp = defaultPileInput();
    inp.geo.liqOn = true;
    inp.geo.amax = 0.35;
    inp.geo.layers = [
      { ...defaultLayers()[1], name: 'arena suelta', thk: 8, N160: 8, FC: 5, liq: true },
      { ...defaultLayers()[1], name: 'arena densa', thk: 10, N160: 35, FC: 5, liq: true },
    ];
    const l = liquefaction(inp);
    expect(l.liquefied[0]).toBe(true);
    expect(l.liquefied[1]).toBe(false);
    expect(l.settlement).toBeGreaterThan(0.02);
    expect(l.Lliq).toBe(8);
    inp.geo.liqOn = false;
    expect(liquefaction(inp).enabled).toBe(false);
  });
  it('fricción negativa reduce la capacidad útil', () => {
    const inp = defaultPileInput();
    inp.geo.layers[0].downdrag = true;
    const r = analyzePile(inp);
    expect(r.geo.Qneg).toBeGreaterThan(50);
    expect(r.geo.QaDD).toBeLessThan(r.geo.QaC);
    expect(r.checks.some((c) => /fricción negativa/.test(c.name))).toBe(true);
  });
  it('asentamiento crece con la carga', () => {
    const inp = defaultPileInput();
    const base = { Qs: 800, Qult: 1300, qb: 2000, Ap: 0.196, Ep: 25e6, D: 0.5, Bg: 2, Lg: 2, tipKind: 'granular' as const };
    const a = settlement(inp, { ...base, Qpile: 300, Qgroup: 1200 });
    const b = settlement(inp, { ...base, Qpile: 600, Qgroup: 2400 });
    expect(b.group.total).toBeGreaterThan(a.group.total);
    expect(b.pile.total).toBeGreaterThan(a.pile.total);
  });
});

describe('puntales y tirantes', () => {
  it('equilibrio vertical y tirante simétrico', () => {
    const r = analyzePile(defaultPileInput());
    const s = r.stm!;
    for (const st of s.struts) expect(st.C * Math.sin(st.theta)).toBeCloseTo(st.R, 6);
    const R = s.struts[0].R;
    // 2×2 con moments nulos en el combo gobernante: Tx = 2·R·0.75/z
    expect(s.tieX.T).toBeGreaterThan(0);
    expect(s.tieX.T).toBeLessThanOrEqual((2 * Math.max(...s.struts.map((q) => q.R)) * 0.75) / s.z + 1e-6);
    expect(R).toBeGreaterThan(0);
    expect(r.deep).toBe(true);
  });
  it('un cabezal esbelto no es profundo', () => {
    const inp = defaultPileInput();
    inp.cap.h = 0.5;
    inp.layout = { ...inp.layout, mode: 'grid', nx: 2, ny: 1, sx: 3 };
    inp.combos = inp.combos.map((c) => ({ ...c, P: c.P / 4, Mx: 0, My: 0, Vx: 0, Vy: 0 }));
    inp.cap.edge = 0.5;
    const r = analyzePile(inp);
    expect(r.deep).toBe(false);
  });
});

describe('memoria con todos los efectos', () => {
  it('genera la memoria con licuación, arrastre y asentamiento', () => {
    const inp = defaultPileInput('hpile');
    inp.geo.liqOn = true;
    inp.geo.layers[0].downdrag = true;
    const doc = reportForPile(inp, makeFmt('TEC'), newProject().info);
    const txt = JSON.stringify(doc.blocks);
    for (const k of ['puntales y tirantes', 'Licuación', 'Asentamiento', 'Fricción negativa', 'p-múltiples']) expect(txt.toLowerCase()).toContain(k.toLowerCase());
  });
});

describe('revisión a tracción', () => {
  it('sin tracción no agrega verificaciones', () => {
    const r = analyzePile(defaultPileInput());
    expect(r.tension.any).toBe(false);
    expect(r.checks.some((c) => /tracción pura/.test(c.name))).toBe(false);
  });
  it('con momento grande hay pilotes en tracción y se revisan resistencia, anclaje y extracción', () => {
    const inp = defaultPileInput();
    inp.combos = [
      { id: 'S1', name: 'D+L', kind: 'service', P: 1500, Vx: 0, Vy: 0, Mx: 0, My: 0, qaFactor: 1 },
      { id: 'S2', name: 'D+E', kind: 'service', P: 700, Vx: 100, Vy: 0, Mx: 0, My: 1200, qaFactor: 1.33, eq: true },
      { id: 'U1', name: '0.9D+E', kind: 'ultimate', P: 600, Vx: 140, Vy: 0, Mx: 0, My: 1700, qaFactor: 1, eq: true },
    ];
    const r = analyzePile(inp);
    expect(r.tension.any).toBe(true);
    expect(r.tension.Tu).toBeGreaterThan(100);
    for (const k of [/tracción pura/, /anclaje de las barras/, /extracción/]) expect(r.checks.some((c) => k.test(c.name))).toBe(true);
    // My,base = 1700 + 140·1.1 = 1854;  ΔR = 1854·0.75/(4·0.75²) = 618;  Tu = 618 − 600/4 − 0.9·Wcab/4
    expect(r.tension.Tu).toBeCloseTo(618 - 150 - (0.9 * r.Wcap) / 4, 6);
  });
  it('carga neta de tracción activa el levantamiento del grupo y los pilotes de acero piden pernos', () => {
    const inp = defaultPileInput('hpile');
    inp.combos = [
      { id: 'S1', name: 'Levantamiento', kind: 'service', P: -900, Vx: 0, Vy: 0, Mx: 0, My: 0, qaFactor: 1 },
      { id: 'U1', name: 'U', kind: 'ultimate', P: -800, Vx: 0, Vy: 0, Mx: 0, My: 0, qaFactor: 1 },
    ];
    const r = analyzePile(inp);
    expect(r.tension.block?.applicable).toBe(true);
    expect(r.tension.anchor.kind).toBe('studs');
    inp.pile.studs = 0;
    expect(analyzePile(inp).tension.anchor.ok).toBe(false);
  });
});

describe('socket en roca', () => {
  const rockInp = () => {
    const i = defaultPileInput();
    i.pile.D = 0.8; i.pile.L = 10; i.pile.nBars = 12;
    i.geo.layers = [
      { ...defaultLayers()[0], name: 'Arcilla', thk: 6, su: 35 },
      { ...defaultLayers()[0], name: 'Roca', kind: 'rock', thk: 12, qu: 25, rqd: 80, jointS: 0.4, aperture: 1, Es: 2e6, fsMax: 3000, Cc: 0 },
    ];
    return i;
  };
  it('fricción y punta en roca siguen las expresiones de referencia', () => {
    const r = analyzePile(rockInp());
    const rk = r.geo.rock!;
    expect(rk.Ls).toBeCloseTo(4, 6);
    // fs = 0.65·pa·√(qu/pa)·ηm  (qu = 25 MPa, ηm = 0.85)
    expect(rk.fs).toBeCloseTo(0.65 * 101.3 * Math.sqrt(25000 / 101.3) * 0.85, 0);
    const Ksp = (3 + 0.4 / 0.8) / (10 * Math.sqrt(1 + (300 * 0.001) / 0.4));
    expect(rk.Ksp).toBeCloseTo(Ksp, 9);
    expect(rk.dFac).toBeCloseTo(1 + (0.4 * 4) / 0.8, 9);
    expect(rk.qbRock).toBeGreaterThan(0);
    expect(r.geo.qb).toBeCloseTo(Math.min(rk.qbRock, rk.qbLimit), 6);
    expect(r.geo.QaC).toBeCloseTo((r.geo.Qs + 0.5 * r.geo.Qb) / 2.5, 6);
  });
  it('mayor qu o socket más largo aumenta la capacidad; el límite del concreto controla la punta', () => {
    const a = analyzePile(rockInp());
    const i2 = rockInp();
    i2.pile.L = 12;
    expect(analyzePile(i2).geo.QaC).toBeGreaterThan(a.geo.QaC);
    const i3 = rockInp();
    i3.geo.layers[1].qu = 120;
    const r3 = analyzePile(i3);
    expect(r3.geo.qb).toBeCloseTo(0.33 * 28 * 1000, 6);
  });
  it('asentamiento en roca y verificaciones', () => {
    const r = analyzePile(rockInp());
    expect(r.settle!.pile.total).toBeGreaterThan(0);
    expect(r.checks.some((c) => /socket/.test(c.name))).toBe(true);
    const doc = reportForPile(rockInp(), makeFmt('SI'), newProject().info);
    expect(JSON.stringify(doc.blocks)).toContain('Socket en roca');
  });
});

import { capGeometry } from '../src/core/pileCap';
import { examplePiles } from '../src/state';
import { pilePositions, standardLayout } from '../src/core/pileTypes';
describe('geometría del cabezal', () => {
  it('rect igual que antes: área = B·L', () => {
    const i = defaultPileInput();
    const g = capGeometry(i, pilePositions(i.layout));
    expect(g.area).toBeCloseTo(2.5 * 2.5, 9);
    expect(analyzePile(i).concreteVolume).toBeCloseTo(2.5 * 2.5 * 1.1, 9);
  });
  it('todas las formas producen contornos válidos que contienen los pilotes', () => {
    for (const shape of ['rect', 'hull', 'miter', 'circle', 'ngon'] as const) {
      const i = defaultPileInput();
      i.layout = standardLayout(3, 1.5);
      i.cap.shape = shape;
      i.cap.edge = 0.6;
      const r = analyzePile(i);
      expect(r.capArea).toBeGreaterThan(2);
      const edge = r.checks.find((c) => /distancia al borde/.test(c.name))!;
      expect(edge.ok).toBe(true);
    }
  });
  it('la forma envolvente con esquinas vivas tiene menos área que el rectángulo para 3 pilotes', () => {
    const i = defaultPileInput();
    i.layout = standardLayout(3, 1.5);
    i.cap.edge = 0.6;
    const rect = capGeometry(i, pilePositions(i.layout)).area;
    i.cap.shape = 'miter';
    const mit = capGeometry(i, pilePositions(i.layout)).area;
    i.cap.shape = 'hull';
    const hul = capGeometry(i, pilePositions(i.layout)).area;
    expect(mit).toBeLessThan(rect);
    expect(hul).toBeLessThan(mit + 1);
  });
  it('hexágono regular: área exacta', () => {
    const i = defaultPileInput();
    i.layout = standardLayout(7, 1.5);
    i.cap.shape = 'ngon';
    i.cap.nSides = 6;
    i.cap.edge = 0.5;
    const R = (1.5 + 0.5) / Math.cos(Math.PI / 6);
    expect(capGeometry(i, pilePositions(i.layout)).area).toBeCloseTo((3 * Math.sqrt(3) / 2) * R * R, 6);
  });
  it('L y forma libre; pilotes fuera del contorno se detectan', () => {
    const i = examplePiles().find((e) => /en L/.test(e.title))!.make();
    const r = analyzePile(i);
    const A = 4 * 4 - (4 - 1.6) * (4 - 1.6);
    expect(r.capArea).toBeCloseTo(A, 6);
    i.cap.dx = 3; // se desplaza el contorno y los pilotes quedan fuera
    const r2 = analyzePile(i);
    expect(r2.checks.find((c) => /distancia al borde/.test(c.name))!.ok).toBe(false);
    const j = defaultPileInput();
    j.cap.shape = 'poly';
    j.cap.vertices = [{ x: -1.6, y: -1.6 }, { x: 1.6, y: -1.6 }, { x: 1.6, y: 1.6 }, { x: 0, y: 2.2 }, { x: -1.6, y: 1.6 }];
    expect(analyzePile(j).capPoly.length).toBe(5);
  });
  it('todos los ejemplos con formas especiales se analizan y generan memoria', () => {
    for (const e of examplePiles()) {
      const r = analyzePile(e.make());
      expect(isFinite(r.Wcap)).toBe(true);
      expect(reportForPile(e.make(), makeFmt('SI'), newProject().info).blocks.length).toBeGreaterThan(40);
    }
  });
});

describe('ejemplos de pilotes', () => {
  it('todos los ejemplos cumplen las verificaciones', () => {
    for (const e of examplePiles()) expect(analyzePile(e.make()).ok, e.title).toBe(true);
  });
});

import { roundCorners } from '../src/core/pileCap';
import { polyProps } from '../src/core/geometry';
describe('redondeo de esquinas del cabezal', () => {
  it('cuadrado: área = L² − (4 − π)·r²', () => {
    const sq = [{ x: 0, y: 0 }, { x: 2, y: 0 }, { x: 2, y: 2 }, { x: 0, y: 2 }];
    const r = 0.4;
    const A = polyProps(roundCorners(sq, r)).A;
    expect(A).toBeCloseTo(4 - (4 - Math.PI) * r * r, 2);
  });
  it('triángulo equilátero: se quita r²·(cot(θ/2) − (π−θ)/2) por esquina', () => {
    const i = defaultPileInput();
    i.layout = standardLayout(3, 1.5);
    i.cap.shape = 'miter';
    i.cap.edge = 0.6;
    const a0 = capGeometry(i, pilePositions(i.layout)).area;
    i.cap.cornerR = 0.5;
    const a1 = capGeometry(i, pilePositions(i.layout)).area;
    const th = Math.PI / 3;
    const removed = 3 * (0.25 / Math.tan(th / 2) - 0.125 * (Math.PI - th));
    expect(a0 - a1).toBeCloseTo(removed, 2);
  });
  it('el radio se limita a la mitad de los lados y radio 0 no cambia el contorno', () => {
    const sq = [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 1 }, { x: 0, y: 1 }];
    const big = polyProps(roundCorners(sq, 10)).A; // se limita: círculo inscrito
    expect(big).toBeCloseTo(Math.PI * 0.25, 1);
    expect(roundCorners(sq, 0)).toEqual(sq);
  });
  it('un cabezal redondeado se analiza y mantiene los pilotes dentro', () => {
    const i = defaultPileInput();
    i.cap.shape = 'rect';
    i.cap.cornerR = 0.3;
    const r = analyzePile(i);
    expect(r.capArea).toBeLessThan(2.5 * 2.5);
    expect(r.checks.find((c) => /distancia al borde/.test(c.name))!.ok).toBe(true);
    expect(r.capPoly.length).toBeGreaterThan(8);
  });
});
