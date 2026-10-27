import { describe, it, expect } from 'vitest';
import { exampleFootings, exampleWalls, defaultInfo } from '../src/state';
import { reportForFooting, reportForWall } from '../src/report';
import { makeFmt } from '../src/core/units';

describe('las memorias se construyen para todos los ejemplos', () => {
  for (const sys of ['SI', 'TEC'] as const) {
    const fmt = makeFmt(sys);
    for (const e of exampleFootings()) {
      it(`${sys} · ${e.title}`, () => {
        const d = reportForFooting(e.make(), fmt, defaultInfo());
        expect(d.blocks.length).toBeGreaterThan(30);
        const txt = JSON.stringify(d.blocks);
        expect(txt).not.toContain('NaN');
        expect(txt).not.toContain('undefined');
      });
    }
    for (const e of exampleWalls()) {
      it(`${sys} · muro ${e.type}`, () => {
        const w = e.make();
        w.seismic.on = true;
        w.hw = 1;
        w.key.enabled = true;
        const d = reportForWall(w, fmt, defaultInfo());
        const txt = JSON.stringify(d.blocks);
        expect(txt).not.toContain('NaN');
        expect(txt).not.toContain('undefined');
      });
    }
  }
});
