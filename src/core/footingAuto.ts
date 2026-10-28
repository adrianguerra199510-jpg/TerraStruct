// Dimensionamiento automático de zapatas aisladas (una columna): área por presión, espesor y armado.
import { FootingInput, analyzeFooting, findMinThickness } from './footing';
import { bbox } from './geometry';
import { barList } from './materials';
import { columnPoly, footingPresetPoly, defaultPresetParams } from './shapes';

export interface AutoSizeResult {
  input: FootingInput;
  ok: boolean;
  note: string;
}

const up = (v: number, step = 0.05) => Math.ceil(v / step - 1e-9) * step;

function stabilityOk(inp: FootingInput): boolean {
  const r = analyzeFooting(inp);
  const c = r.checks.filter((k) => /Presión|Desliz|Volc/.test(k.name));
  return c.length > 0 && c.every((k) => k.ok);
}

/**
 * Dimensiona la zapata: rectángulo con la proporción de la columna que cumple presión, deslizamiento y volcamiento;
 * espesor mínimo que cumple cortante, punzonamiento y flexión; y barra con separación factible.
 * La columna se coloca en el centroide; luego el usuario puede ajustar espesor, dimensiones y acero.
 */
export function autoSizeFooting(inp0: FootingInput): AutoSizeResult {
  let inp: FootingInput = { ...inp0, manual: { ...inp0.manual, on: false }, topSteel: inp0.topSteel };
  if (!inp.columns.length) return { input: inp, ok: false, note: 'No hay columnas.' };
  if (inp.columns.length > 1) return { input: inp, ok: false, note: 'El dimensionamiento automático aplica a zapatas de una sola columna.' };
  const col = inp.columns[0];
  const bb = bbox(columnPoly(col.geom, 0, 0));
  const cw = bb.xmax - bb.xmin;
  const ch = bb.ymax - bb.ymin;
  const aspect = Math.min(Math.max(Math.max(cw, ch) / Math.max(Math.min(cw, ch), 1e-6), 1), 2);
  const longX = cw >= ch;
  // carga de servicio máxima para la estimación inicial
  const r0 = analyzeFooting({ ...inp, vertices: footingPresetPoly('rect', { ...defaultPresetParams(), B: 3, L: 3 }), columns: [{ ...col, x: 0, y: 0 }] });
  const Pmax = Math.max(...r0.service.map((s) => s.Pcol / Math.max(s.combo.qaFactor, 1)), 1);
  const A0 = (1.15 * Pmax) / Math.max(inp.qa, 20);
  const make = (A: number, hh: number): FootingInput => {
    const a = Math.sqrt(A * aspect);
    const b2 = A / a;
    const L1 = Math.max(up(a), up(cw + 0.3));
    const L2 = Math.max(up(b2), up(ch + 0.3), 0.6);
    const B = longX ? L1 : L2;
    const L = longX ? L2 : L1;
    const pp = { ...defaultPresetParams(), B, L };
    return { ...inp, preset: 'rect', presetParams: pp, vertices: footingPresetPoly('rect', pp), columns: [{ ...col, x: 0, y: 0 }], h: hh };
  };
  let A = A0;
  let h = Math.max(inp.h, 0.45);
  let cur = make(A, h);
  for (let pass = 0; pass < 3; pass++) {
    let it = 0;
    cur = make(A, h);
    while (!stabilityOk(cur) && it < 80) {
      A *= 1.05;
      cur = make(A, h);
      it++;
    }
    const hMin = findMinThickness(cur, 3) ?? h;
    const hNew = Math.max(hMin, 0.4);
    if (Math.abs(hNew - h) < 1e-6 && pass > 0) break;
    h = hNew;
  }
  cur = { ...make(A, h), h };
  // barra: la menor con separación factible en ambas direcciones
  const bars = barList(cur.barSystem);
  const order = cur.barSystem === 'astm' ? ['#5', '#6', '#7', '#8', '#9'] : ['12', '16', '20', '25', '32'].map((d) => `Ø${d}`);
  for (const id of order) {
    if (!bars.some((b) => b.id === id)) continue;
    const t = { ...cur, barX: id, barY: id, barTopX: id, barTopY: id };
    const r = analyzeFooting(t);
    if ((r.flexX?.det.ok ?? true) && (r.flexY?.det.ok ?? true) && (!t.topSteel || ((r.flexTopX?.det.ok ?? true) && (r.flexTopY?.det.ok ?? true)))) {
      cur = t;
      break;
    }
    cur = t;
  }
  const fin = analyzeFooting(cur);
  return { input: cur, ok: fin.ok, note: fin.ok ? 'Cumple todas las verificaciones.' : `No cumple: ${fin.checks.filter((c) => !c.ok).map((c) => c.name).join(', ') || 'revisar'}` };
}
