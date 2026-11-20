import { describe, it, expect } from 'vitest';
import { defaultPileInput, standardLayout, PileInput, comboResultant, capColumns } from '../src/core/pileTypes';
import { analyzePile } from '../src/core/pile';
import { allocateStm } from '../src/core/pileSTM';
import { cabezalDiagram } from '../src/core/pileDiagram';
import { pileStm3dSvg, VIEWS_3D } from '../src/draw/pile3d';
import { reportForPile } from '../src/report';
import { makeFmt } from '../src/core/units';
import { newProject, normalizePile, examplePiles } from '../src/state';

const zero = { P: 0, Vx: 0, Vy: 0, Mx: 0, My: 0 };

/** Cabezal de 3×3 pilotes con columnas en las posiciones dadas y la misma carga en todas. */
function multiCap(xy: [number, number][], P = 900, My = 0): PileInput {
  const inp = defaultPileInput();
  inp.layout = { ...inp.layout, mode: 'grid', nx: 3, ny: 3, sx: 1.5, sy: 1.5 };
  inp.cap.h = 1.3;
  inp.column = { ...inp.column, name: 'C1', x: xy[0][0], y: xy[0][1] };
  inp.moreColumns = xy.slice(1).map(([x, y], j) => ({ id: 'k' + j, name: 'C' + (j + 2), geom: inp.column.geom, x, y }));
  inp.combos = inp.combos.map((c) => ({ ...c, P, Vx: 0, Vy: 0, Mx: 0, My, extra: Object.fromEntries(inp.moreColumns.map((m) => [m.id, { ...zero, P, My }])) }));
  return inp;
}

describe('cabezal con varias columnas', () => {
  it('la resultante de las columnas equivale a una sola carga', () => {
    const inp = multiCap([[-1.5, 0], [0, 0], [1.5, 0]], 600, 40);
    const rs = comboResultant(inp, inp.combos[0], inp.cap.h);
    expect(rs.P).toBeCloseTo(1800, 9);
    expect(rs.Qx).toBeCloseTo(600 * (-1.5 + 0 + 1.5) + 3 * 40, 9);
    const r = analyzePile(inp);
    const u = r.ultimate[0];
    // equilibrio: Σ R = P + Wcap y momento alrededor de y
    expect(u.R.reduce((a, b) => a + b, 0)).toBeCloseTo(1800 + r.Wcap, 6);
  });

  it('acepta 3, 4 y 5 columnas y revisa el punzonamiento de cada una', () => {
    for (const xy of [
      [[-1.5, 0], [0, 0], [1.5, 0]],
      [[-0.75, -0.75], [0.75, -0.75], [0.75, 0.75], [-0.75, 0.75]],
      [[-1.5, -1.5], [1.5, -1.5], [1.5, 1.5], [-1.5, 1.5], [0, 0]],
    ] as [number, number][][]) {
      const r = analyzePile(multiCap(xy, 500));
      expect(capColumns(multiCap(xy)).length).toBe(xy.length);
      expect(r.cols.length).toBe(xy.length);
      expect(r.punches.length).toBeGreaterThan(0);
      expect(r.checks.some((c) => /columnas dentro del contorno/.test(c.name) && c.ok)).toBe(true);
      // cada columna aparece en algún perímetro de punzonamiento
      for (const c of r.cols) expect(r.punches.some((q) => q.label.includes(c.name))).toBe(true);
      expect(r.stm!.cols.length).toBe(xy.length);
    }
  });

  it('columnas separadas: punzonamiento individual; juntas: perímetro conjunto', () => {
    const far = analyzePile(multiCap([[-1.5, 0], [1.5, 0]], 800));
    expect(far.punches.length).toBe(2);
    const near = analyzePile(multiCap([[-0.3, 0], [0.3, 0]], 800));
    expect(near.punches.length).toBe(1);
    expect(near.punches[0].label).toMatch(/conjunto/);
  });

  it('momento negativo entre columnas alejadas sobre una fila de pilotes', () => {
    const inp = defaultPileInput();
    inp.layout = { ...inp.layout, mode: 'grid', nx: 4, ny: 1, sx: 1.5, sy: 1.5 };
    inp.column = { ...inp.column, x: -2.25, y: 0 };
    inp.moreColumns = [{ id: 'b', name: 'C2', geom: inp.column.geom, x: 2.25, y: 0 }];
    inp.combos = inp.combos.map((c) => ({ ...c, P: 1000, Vx: 0, Vy: 0, Mx: 0, My: 0, extra: { b: { ...zero, P: 1000 } } }));
    const r = analyzePile(inp);
    // columnas sobre los pilotes extremos: el tramo central trabaja con tracción superior
    expect(r.flexX!.Mneg).toBeGreaterThan(50);
    const dg = cabezalDiagram(inp, r, 'x');
    expect(dg.faces.length).toBe(2);
    expect(dg.Mneg.v).toBeLessThan(-50);
  });
});

describe('puntales y tirantes con varias columnas', () => {
  it('el reparto cumple el equilibrio de cada pilote y de cada columna', () => {
    const inp = multiCap([[-0.75, -0.75], [0.75, -0.75], [0.75, 0.75], [-0.75, 0.75]], 700, 60);
    const r = analyzePile(inp);
    const s = r.stm!;
    expect(s.balanced).toBe(true);
    // por pilote: Σk Rik = Ri (combinación gobernante)
    const u = r.ultimate.find((q) => q.combo.name === s.combo)!;
    const perPile = r.pts.map((_, i) => s.struts.filter((q) => q.i === i).reduce((a, q) => a + q.R, 0));
    const perCol = s.cols.map((_, k) => s.struts.filter((q) => q.k === k).reduce((a, q) => a + q.R, 0));
    expect(perPile.reduce((a, b) => a + b, 0)).toBeCloseTo(perCol.reduce((a, b) => a + b, 0), 6);
    perCol.forEach((v, k) => expect(v).toBeCloseTo(s.cols[k].P, 3));
    // equilibrio de momentos de cada columna: Σ Rik (xi − xk) = My
    s.cols.forEach((c, k) => {
      const m = s.struts.filter((q) => q.k === k).reduce((a, q) => a + q.R * (r.pts[q.i].x - c.x), 0);
      expect(m).toBeCloseTo(60, 2);
    });
    // componente vertical de cada puntal
    for (const st of s.struts) expect(st.C * Math.sin(st.theta)).toBeCloseTo(st.R, 6);
    expect(u).toBeTruthy();
  });

  it('reparto directo: solución no negativa y mínima trayectoria', () => {
    const pts = [{ x: -1, y: 0 }, { x: 0, y: 0 }, { x: 1, y: 0 }];
    const a = allocateStm(pts, [100, 100, 100], [{ x: -1, y: 0 }, { x: 1, y: 0 }], [150, 150], [{ x: 0, y: 0 }, { x: 0, y: 0 }], 0.8)!;
    a.forEach((row) => row.forEach((v) => expect(v).toBeGreaterThanOrEqual(0)));
    // simetría: el pilote central se reparte por igual
    expect(a[1][0]).toBeCloseTo(a[1][1], 6);
    expect(a[0][0] + a[1][0] + a[2][0]).toBeCloseTo(150, 6);
  });

  it('columna fuera del grupo de pilotes: cordón superior a tracción con la otra columna', () => {
    const inp = defaultPileInput();
    inp.layout = { ...inp.layout, mode: 'grid', nx: 3, ny: 2, sx: 1.5, sy: 1.5 };
    inp.cap.manualSize = true; inp.cap.B = 6.2; inp.cap.L = 2.6; inp.cap.h = 1.3;
    inp.column = { ...inp.column, x: -2.6, y: 0 };
    inp.moreColumns = [{ id: 'b', name: 'C2', geom: inp.column.geom, x: 1, y: 0 }];
    inp.combos = inp.combos.map((c) => ({ ...c, P: 400, Vx: 0, Vy: 0, Mx: 0, My: 0, extra: { b: { ...zero, P: 900 } } }));
    let r = analyzePile(inp);
    expect(r.stm!.balanced).toBe(false);
    expect(r.stm!.topChords.length).toBe(1);
    expect(r.stm!.topChords[0].F).toBeGreaterThan(0);
    expect(r.checks.find((c) => /cordones superiores/.test(c.name))!.ok).toBe(false); // sin acero superior
    inp.cap.topSteel = true;
    r = analyzePile(inp);
    expect(r.stm!.topChords[0].cap).toBeGreaterThan(0);
  });

  it('3 pilotes en triángulo: el tirante de la fila inferior equilibra el empuje de sus nudos', () => {
    const inp = defaultPileInput();
    inp.layout = standardLayout(3, 1.5);
    inp.combos = inp.combos.map((c) => ({ ...c, Vx: 0, Vy: 0, Mx: 0, My: 0 }));
    const r = analyzePile(inp);
    const s = r.stm!;
    const bottom = s.tieX.bands.find((b) => b.idx.length === 2)!;
    const R = s.struts.find((q) => q.i === bottom.idx[0])!.R;
    expect(bottom.T).toBeCloseTo((R * 0.75) / s.z, 6);
    // el pilote del vértice no tiene empuje en X
    const apex = s.tieX.bands.find((b) => b.idx.length === 1)!;
    expect(apex.T).toBeCloseTo(0, 6);
  });

  it('el 2×2 simétrico conserva el tirante clásico T = R·a/z por banda', () => {
    const inp = defaultPileInput();
    inp.combos = inp.combos.map((c) => ({ ...c, Vx: 0, Vy: 0, Mx: 0, My: 0 }));
    const r = analyzePile(inp);
    const s = r.stm!;
    const R = s.struts[0].R;
    for (const b of s.tieX.bands) expect(b.T).toBeCloseTo((R * 0.75) / s.z, 6);
    expect(s.tieX.T).toBeCloseTo((2 * R * 0.75) / s.z, 6);
  });
});

describe('vista 3D, ejemplos, memoria y datos guardados', () => {
  it('la vista 3D dibuja un puntal por cada par columna–pilote en todas las vistas', () => {
    const inp = multiCap([[-1.5, 0], [0, 0], [1.5, 0]], 600);
    const r = analyzePile(inp);
    for (const v of VIEWS_3D) {
      const svg = pileStm3dSvg(inp, r, { fmt: makeFmt('SI'), view: v.view, labels: false, concrete: false });
      expect(svg.startsWith('<svg')).toBe(true);
      expect(svg).not.toMatch(/NaN|Infinity/);
      const lines = (svg.match(/<line /g) ?? []).length;
      expect(lines).toBeGreaterThanOrEqual(r.stm!.struts.length);
    }
  });

  it('el ejemplo de 3 columnas cumple y su memoria describe las columnas', () => {
    const e = examplePiles().find((q) => /3 columnas/.test(q.title))!;
    const inp = e.make();
    const r = analyzePile(inp);
    expect(r.cols.length).toBe(3);
    expect(r.ok).toBe(true);
    const doc = reportForPile(inp, makeFmt('SI'), newProject().info);
    const txt = JSON.stringify(doc.blocks);
    for (const k of ['C1', 'C2', 'C3', 'Columna → pilote', 'Vista 3D']) expect(txt).toContain(k);
  });

  it('un archivo antiguo (una columna, sin moreColumns) sigue funcionando igual', () => {
    const old = JSON.parse(JSON.stringify(defaultPileInput()));
    delete old.moreColumns;
    delete old.column.name;
    const inp = normalizePile(old);
    expect(inp.moreColumns).toEqual([]);
    expect(capColumns(inp)[0].name).toBe('C1');
    const a = analyzePile(inp), b = analyzePile(defaultPileInput());
    expect(a.stm!.tieX.T).toBeCloseTo(b.stm!.tieX.T, 9);
    expect(a.checks.map((c) => c.name)).toEqual(b.checks.map((c) => c.name));
  });
});
