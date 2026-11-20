import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync, mkdtempSync, existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  listExamples, resolveInput, analyze, summarize, summaryText, autoDesign, drawViews, VIEWS, renderDoc, elementReport,
  loadProjectFile, saveProjectFile, upsertElement, findElement, removeElement, projectElements, projectReport, safeJson, Kind,
} from '../mcp/engine';
import { initNodeRaster } from '../mcp/raster-node';
import { defaultInfo } from '../src/state';
import { FootingInput } from '../src/core/footing';
import { WallInput } from '../src/core/wallTypes';

const require = createRequire(import.meta.url);

beforeAll(async () => {
  await initNodeRaster(readFileSync(require.resolve('@resvg/resvg-wasm/index_bg.wasm')));
});

describe('servidor MCP: entradas', () => {
  it('lista ejemplos de los tres tipos', () => {
    const ex = listExamples();
    for (const k of ['footing', 'wall', 'pile'] as Kind[]) expect(ex.some((e) => e.kind === k)).toBe(true);
  });

  it('busca ejemplos por índice y por título parcial', () => {
    expect((resolveInput({ kind: 'wall', example: 'sótano' }) as WallInput).brace.on).toBe(true);
    expect(() => resolveInput({ kind: 'pile', example: 99 })).toThrow(/No existe/);
  });

  it('los cambios parciales se mezclan sobre la base y los arreglos se reemplazan', () => {
    const f = resolveInput({ kind: 'footing', input: { h: 0.9, columns: [{ id: 'c1', name: 'C1', x: 0, y: 0, loads: { D: { P: 800 } } }] } }) as FootingInput;
    expect(f.h).toBe(0.9);
    expect(f.qa).toBe(200);
    expect(f.columns).toHaveLength(1);
    expect(f.columns[0].loads.D.P).toBe(800);
    expect(f.columns[0].loads.L.P).toBe(300); // completado con los valores por defecto
  });

  it('regenera los vértices al cambiar las dimensiones de la forma', () => {
    const f = resolveInput({ kind: 'footing', input: { presetParams: { B: 3, L: 2 } } }) as FootingInput;
    const xs = f.vertices.map((v) => v.x), ys = f.vertices.map((v) => v.y);
    expect(Math.max(...xs) - Math.min(...xs)).toBeCloseTo(3, 6);
    expect(Math.max(...ys) - Math.min(...ys)).toBeCloseTo(2, 6);
  });

  it('cambia de tipología de muro partiendo de sus valores por defecto', () => {
    const w = resolveInput({ kind: 'wall', wall_type: 'gabion', input: { H: 3 } }) as WallInput;
    expect(w.type).toBe('gabion');
    expect(w.H).toBe(3);
  });
});

describe('servidor MCP: análisis, dibujos y memorias', () => {
  it('resume todos los ejemplos sin valores inválidos', () => {
    for (const e of listExamples()) {
      const inp = resolveInput({ kind: e.kind, example: e.index });
      const s = summarize(e.kind, inp, analyze(e.kind, inp), 'SI');
      const t = summaryText(s);
      expect(t).not.toContain('NaN');
      expect(t).not.toContain('undefined');
      expect(s.checks.length).toBeGreaterThan(0);
    }
  });

  it('detecta un elemento que no cumple', () => {
    const inp = resolveInput({ kind: 'footing', input: { qa: 60 } });
    const s = summarize('footing', inp, analyze('footing', inp));
    expect(s.ok).toBe(false);
    expect(s.failing.join()).toMatch(/Presión/);
  });

  it('dimensiona automáticamente una zapata y un cabezal', () => {
    const f = autoDesign('footing', resolveInput({ kind: 'footing', input: { qa: 150 } }));
    expect(f.ok).toBe(true);
    const p = autoDesign('pile', resolveInput({ kind: 'pile' }));
    expect(p.ok).toBe(true);
    expect(() => autoDesign('wall', resolveInput({ kind: 'wall' }))).toThrow();
  });

  it('dibuja todas las vistas', () => {
    for (const kind of ['footing', 'wall', 'pile'] as Kind[]) {
      const inp = resolveInput({ kind });
      const res = analyze(kind, inp);
      for (const v of Object.keys(VIEWS[kind])) {
        const figs = drawViews(kind, inp, res, v);
        expect(figs.length).toBeGreaterThan(0);
        for (const f of figs) expect(f.svg).toMatch(/^<svg/);
      }
    }
  });

  it('genera memorias PDF y Word', async () => {
    const doc = elementReport('wall', resolveInput({ kind: 'wall' }), 'SI', defaultInfo());
    const pdf = await renderDoc(doc, 'pdf');
    expect(new TextDecoder().decode(pdf.slice(0, 5))).toBe('%PDF-');
    const docx = await renderDoc(doc, 'docx');
    expect(docx[0]).toBe(0x50); // ZIP «PK»
    expect(docx[1]).toBe(0x4b);
  }, 60000);

  it('serializa resultados sin funciones ni ciclos', () => {
    const inp = resolveInput({ kind: 'wall' });
    const j = safeJson(analyze('wall', inp));
    expect(() => JSON.stringify(j)).not.toThrow();
  });
});

describe('servidor MCP: proyectos', () => {
  it('crea, modifica, lee y elimina elementos de un .terrastruct.json', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'ts-mcp-'));
    const path = join(dir, 'p.terrastruct.json');
    const p = await loadProjectFile(path, true);
    expect(projectElements(p)).toHaveLength(0);
    expect(upsertElement(p, 'footing', resolveInput({ kind: 'footing', input: { name: 'Z-9' } }))).toBe('added');
    expect(upsertElement(p, 'footing', resolveInput({ kind: 'footing', input: { name: 'Z-9', h: 0.8 } }))).toBe('replaced');
    upsertElement(p, 'pile', resolveInput({ kind: 'pile', example: 1 }));
    await saveProjectFile(path, p);
    expect(existsSync(path)).toBe(true);
    const q = await loadProjectFile(path);
    expect((findElement(q, 'footing', 'z-9').data as FootingInput).h).toBe(0.8);
    expect(projectElements(q)).toHaveLength(2);
    const pdf = await renderDoc(projectReport(q), 'pdf');
    expect(pdf.length).toBeGreaterThan(10000);
    removeElement(q, undefined, 'Z-9');
    expect(projectElements(q)).toHaveLength(1);
  }, 60000);
});
