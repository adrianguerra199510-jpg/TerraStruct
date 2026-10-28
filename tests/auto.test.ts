import { describe, it, expect } from 'vitest';
import { defaultFooting, analyzeFooting, casesToEnvelope } from '../src/core/footing';
import { autoSizeFooting } from '../src/core/footingAuto';

describe('modo envolvente', () => {
  it('la envolvente equivalente da los mismos resultados que los casos', () => {
    const f = defaultFooting();
    f.columns[0].loads.D.Mx = 20; f.columns[0].loads.E.My = 35;
    const a = analyzeFooting(f);
    const b = analyzeFooting(casesToEnvelope(f));
    expect(b.govPressure!.sol.qmax).toBeCloseTo(a.govPressure!.sol.qmax, 6);
    expect(b.flexX!.Mu).toBeCloseTo(a.flexX!.Mu, 6);
    expect(b.punching[0].vuMax).toBeCloseTo(a.punching[0].vuMax, 6);
  });
});

describe('acero manual', () => {
  it('se valida el acero definido', () => {
    const f = defaultFooting();
    const auto = analyzeFooting(f);
    const m = { ...f, manual: { on: true, sBotX: 0.45, sBotY: 0.45, sTopX: 0.2, sTopY: 0.2 } };
    const r = analyzeFooting(m);
    expect(r.flexX!.det.spacing).toBeCloseTo(0.45, 9);
    expect(r.flexX!.det.asProv).toBeLessThan(auto.flexX!.det.asProv);
    expect(r.flexX!.sectionOk).toBe(false); // menor que el mínimo
  });
});

describe('dimensionamiento automático', () => {
  it('encuentra dimensiones y espesor que cumplen', () => {
    const f = defaultFooting();
    f.columns[0].loads.D.P = 1500; f.columns[0].loads.L.P = 700;
    const r = autoSizeFooting(f);
    console.log(r.input.presetParams.B, r.input.presetParams.L, r.input.h, r.input.barX, r.note);
    expect(r.ok).toBe(true);
    expect(r.input.presetParams.B).toBeGreaterThan(2.4);
  });
  it('columna rectangular alargada con momentos', () => {
    const f = defaultFooting();
    f.columns[0].geom.b = 0.6; f.columns[0].geom.h = 0.3;
    f.columns[0].loads.D.Mx = 60; f.columns[0].loads.E.My = 120;
    const r = autoSizeFooting(f);
    expect(r.ok).toBe(true);
    expect(r.input.presetParams.B).toBeGreaterThanOrEqual(r.input.presetParams.L);
  });
});

import * as XLSX from 'xlsx';
import { parseWorkbook, buildTemplate, footingFromImport } from '../src/import/excel';

describe('importación Excel', () => {
  it('lee la plantilla y dimensiona todas', () => {
    const wb = XLSX.read(buildTemplate(), { type: 'array' });
    const r = parseWorkbook(wb);
    expect(r.errors).toEqual([]);
    expect(r.items.map((i) => i.name)).toEqual(['Z-1', 'Z-2', 'Z-3']);
    expect(r.items[0].b).toBeCloseTo(0.4, 9);
    expect(r.items[2].shape).toBe('circle');
    expect(r.items[0].service.length).toBe(2);
    expect(r.items[0].service[1].qaFactor).toBeCloseTo(1.33, 9);
    for (const it of r.items) {
      const out = autoSizeFooting(footingFromImport(it, defaultFooting()));
      expect(out.ok).toBe(true);
    }
  });
  it('tonf', () => {
    const wb = XLSX.read(buildTemplate(), { type: 'array' });
    const r = parseWorkbook(wb, { forceUnit: 'tonf', lenUnit: 'auto' });
    expect(r.items[0].service[0].load.P).toBeCloseTo(900 * 9.80665, 6);
  });
});
