// Importación por paquete desde Excel: columnas + cargas de servicio (ES) y últimas (EU) por zapata.
import * as XLSX from 'xlsx';
import { FootingInput, LoadCase, LoadCombo, defaultFooting, defaultColumn, zeroLoad } from '../core/footing';
import { ColumnShape, defaultColumnGeom } from '../core/shapes';

export interface ImportOptions {
  /** unidades de las cargas */
  forceUnit: 'kN' | 'tonf';
  /** unidades de las dimensiones de la columna: 'auto' decide por magnitud (>3 ⇒ cm) */
  lenUnit: 'auto' | 'cm' | 'm';
}
export const defaultImportOptions = (): ImportOptions => ({ forceUnit: 'kN', lenUnit: 'auto' });

export interface ImportedFooting {
  name: string;
  shape: ColumnShape;
  b: number;
  h: number;
  D: number;
  qa?: number;
  Df?: number;
  service: { name: string; load: LoadCase; qaFactor: number }[];
  ultimate: { name: string; load: LoadCase }[];
  warnings: string[];
}
export interface ImportResult {
  items: ImportedFooting[];
  errors: string[];
}

const TONF = 9.80665;

const norm = (s: unknown) =>
  String(s ?? '')
    .replace(/\(.*?\)|\[.*?\]/g, ' ')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

const num = (v: unknown): number | undefined => {
  if (typeof v === 'number') return isFinite(v) ? v : undefined;
  if (typeof v === 'string') {
    const n = Number(v.replace(',', '.').trim());
    return v.trim() !== '' && isFinite(n) ? n : undefined;
  }
  return undefined;
};

type Field = 'name' | 'shape' | 'b' | 'h' | 'D' | 'qa' | 'Df' | 'tipo' | 'caso' | 'P' | 'Vx' | 'Vy' | 'Mx' | 'My' | 'qaf';
const ALIAS: Record<Field, string[]> = {
  name: ['zapata', 'nombre', 'id', 'mark', 'footing', 'eje', 'columna', 'col'],
  shape: ['forma', 'seccion', 'tipo columna', 'shape'],
  b: ['b', 'bx', 'ancho', 'b cm', 'b m', 'dim x', 'cx', 'c1'],
  h: ['h', 'hy', 'largo', 'h cm', 'h m', 'dim y', 'cy', 'c2'],
  D: ['d', 'diametro', 'diam', 'd cm', 'd m'],
  qa: ['qa', 'q adm', 'qadm', 'esfuerzo admisible', 'capacidad admisible'],
  Df: ['df', 'desplante', 'profundidad'],
  tipo: ['tipo', 'estado', 'es eu', 'servicio ultimo', 'nivel', 'tipo carga'],
  caso: ['caso', 'combinacion', 'combo', 'comb', 'carga', 'caso de carga', 'load case'],
  P: ['p', 'pu', 'ps', 'axial', 'fz', 'n', 'carga axial'],
  Vx: ['vx', 'fx', 'v2', 'v x'],
  Vy: ['vy', 'fy', 'v3', 'v y'],
  Mx: ['mx', 'm x'],
  My: ['my', 'm y'],
  qaf: ['qa x', 'factor qa', 'fqa', 'aumento qa', 'qa factor'],
};

function headerMap(row: unknown[]): Partial<Record<Field, number>> | null {
  const m: Partial<Record<Field, number>> = {};
  row.forEach((c, i) => {
    const t = norm(c);
    if (!t) return;
    (Object.keys(ALIAS) as Field[]).forEach((f) => {
      if (m[f] === undefined && ALIAS[f].includes(t)) m[f] = i;
    });
  });
  return m.name !== undefined && Object.keys(m).length >= 3 ? m : null;
}

function shapeOf(s: string): ColumnShape {
  const t = norm(s);
  if (/circ|redond/.test(t)) return 'circle';
  if (/^l$|en l/.test(t)) return 'L';
  if (/^t$|en t/.test(t)) return 'T';
  if (/^i$|^h$|en i|en h/.test(t)) return 'I';
  if (/cruz|cross/.test(t)) return 'cross';
  return 'rect';
}

function load(r: unknown[], m: Partial<Record<Field, number>>, k: number): LoadCase {
  const g = (f: Field) => (m[f] === undefined ? 0 : num(r[m[f]!]) ?? 0);
  return { P: g('P') * k, Vx: g('Vx') * k, Vy: g('Vy') * k, Mx: g('Mx') * k, My: g('My') * k };
}

export function parseWorkbook(wb: XLSX.WorkBook, opt: ImportOptions = defaultImportOptions()): ImportResult {
  const k = opt.forceUnit === 'tonf' ? TONF : 1;
  const map = new Map<string, ImportedFooting>();
  const order: string[] = [];
  const errors: string[] = [];
  const get = (name: string): ImportedFooting => {
    let it = map.get(name);
    if (!it) {
      it = { name, shape: 'rect', b: 0, h: 0, D: 0, service: [], ultimate: [], warnings: [] };
      map.set(name, it);
      order.push(name);
    }
    return it;
  };
  const rawLens: { it: ImportedFooting; b?: number; h?: number; D?: number }[] = [];

  for (const sn of wb.SheetNames) {
    const rows = XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[sn], { header: 1, blankrows: false, defval: '' });
    let hm: Partial<Record<Field, number>> | null = null;
    for (const r of rows) {
      const h = headerMap(r);
      if (h) {
        hm = h;
        continue;
      }
      if (!hm || hm.name === undefined) continue;
      const nm = String(r[hm.name] ?? '').trim();
      if (!nm) continue;
      const it = get(nm);
      const b = hm.b !== undefined ? num(r[hm.b]) : undefined;
      const hh = hm.h !== undefined ? num(r[hm.h]) : undefined;
      const D = hm.D !== undefined ? num(r[hm.D]) : undefined;
      if (hm.shape !== undefined && String(r[hm.shape]).trim()) it.shape = shapeOf(String(r[hm.shape]));
      if (b || hh || D) rawLens.push({ it, b, h: hh, D });
      const qa = hm.qa !== undefined ? num(r[hm.qa]) : undefined;
      if (qa) it.qa = qa * (opt.forceUnit === 'tonf' ? 9.80665 : 1); // tonf/m² → kPa
      const df = hm.Df !== undefined ? num(r[hm.Df]) : undefined;
      if (df) it.Df = df;
      const tipo = hm.tipo !== undefined ? norm(r[hm.tipo]) : '';
      const hasLoad = (['P', 'Vx', 'Vy', 'Mx', 'My'] as Field[]).some((f) => hm![f] !== undefined && num(r[hm![f]!]) !== undefined);
      if (hasLoad && tipo) {
        const isSvc = /^(es|s|serv|servicio|service|working)/.test(tipo);
        const isUlt = /^(eu|u|ult|ultimo|ultima|ultimate|factor)/.test(tipo);
        const caso = hm.caso !== undefined && String(r[hm.caso]).trim() ? String(r[hm.caso]).trim() : '';
        const ld = load(r, hm, k);
        if (isSvc) {
          const f = hm.qaf !== undefined ? num(r[hm.qaf]) : undefined;
          it.service.push({ name: caso || `ES${it.service.length + 1}`, load: ld, qaFactor: f && f > 0 ? f : 1 });
        } else if (isUlt) it.ultimate.push({ name: caso || `EU${it.ultimate.length + 1}`, load: ld });
        else errors.push(`${sn}: tipo «${r[hm.tipo!]}» no reconocido para ${nm} (use ES o EU)`);
      } else if (hasLoad && !tipo) errors.push(`${sn}: la fila de ${nm} tiene cargas pero no la columna «Tipo» (ES/EU)`);
    }
  }
  // dimensiones: cm o m
  const all = rawLens.flatMap((x) => [x.b, x.h, x.D]).filter((v): v is number => !!v);
  const useCm = opt.lenUnit === 'cm' || (opt.lenUnit === 'auto' && all.length > 0 && Math.max(...all) > 3);
  const f = useCm ? 0.01 : 1;
  for (const x of rawLens) {
    if (x.b) x.it.b = x.b * f;
    if (x.h) x.it.h = x.h * f;
    if (x.D) x.it.D = x.D * f;
  }
  const items = order.map((n) => map.get(n)!);
  for (const it of items) {
    if (it.shape === 'circle') {
      if (!it.D) it.D = it.b || it.h;
      if (!it.D) it.warnings.push('Falta el diámetro de la columna');
    } else {
      if (!it.b && it.h) it.b = it.h;
      if (!it.h && it.b) it.h = it.b;
      if (!it.b) it.warnings.push('Faltan las dimensiones de la columna');
    }
    if (!it.service.length) it.warnings.push('Sin cargas de servicio (ES)');
    if (!it.ultimate.length) it.warnings.push('Sin cargas últimas (EU)');
  }
  if (!items.length) errors.push('No se encontraron zapatas. Revise que existan los encabezados (Zapata, b, h, Tipo, P, …).');
  return { items, errors };
}

export function parseExcelBuffer(buf: ArrayBuffer, opt?: ImportOptions): ImportResult {
  return parseWorkbook(XLSX.read(buf, { type: 'array' }), opt);
}

/** Zapata base (envolvente) con datos importados; el dimensionamiento se hace después. */
export function footingFromImport(it: ImportedFooting, base: FootingInput): FootingInput {
  const col = defaultColumn('c1', 'C1', 0, 0, it.shape);
  col.geom = { ...defaultColumnGeom(it.shape), b: it.b || 0.4, h: it.h || 0.4, D: it.D || 0.45 };
  col.loads = { D: zeroLoad(), L: zeroLoad(), W: zeroLoad(), E: zeroLoad() };
  const combos: LoadCombo[] = [];
  const env: Record<string, LoadCase> = {};
  it.service.forEach((s, i) => {
    const id = `S${i + 1}`;
    combos.push({ id, name: s.name, kind: 'service', D: 0, L: 0, W: 0, E: 0, qaFactor: s.qaFactor });
    env[id] = { ...s.load };
  });
  it.ultimate.forEach((s, i) => {
    const id = `U${i + 1}`;
    combos.push({ id, name: s.name, kind: 'ultimate', D: 0, L: 0, W: 0, E: 0, qaFactor: 1 });
    env[id] = { ...s.load };
  });
  col.env = env;
  return { ...base, name: it.name, qa: it.qa ?? base.qa, Df: it.Df ?? base.Df, loadMode: 'envelope', columns: [col], combos };
}

/** Plantilla .xlsx descargable */
export function buildTemplate(): ArrayBuffer {
  const wb = XLSX.utils.book_new();
  const cols = [
    ['Zapata', 'Forma', 'b (cm)', 'h (cm)', 'D (cm)', 'qa (kPa)', 'Df (m)'],
    ['Z-1', 'Rectangular', 40, 40, '', 200, 1.5],
    ['Z-2', 'Rectangular', 50, 30, '', 200, 1.5],
    ['Z-3', 'Circular', '', '', 45, 180, 1.2],
  ];
  const cargas = [
    ['Zapata', 'Tipo', 'Caso', 'P (kN)', 'Vx (kN)', 'Vy (kN)', 'Mx (kN·m)', 'My (kN·m)', 'qa x'],
    ['Z-1', 'ES', 'D+L', 900, 0, 0, 0, 0, 1],
    ['Z-1', 'ES', 'D+0.7E', 640, 40, 0, 0, 35, 1.33],
    ['Z-1', 'EU', '1.2D+1.6L', 1250, 0, 0, 0, 0, ''],
    ['Z-1', 'EU', '1.2D+L+E', 1100, 60, 0, 0, 55, ''],
    ['Z-2', 'ES', 'D+L', 700, 0, 0, 10, 0, 1],
    ['Z-2', 'EU', '1.2D+1.6L', 980, 0, 0, 14, 0, ''],
    ['Z-3', 'ES', 'D+L', 500, 0, 0, 0, 0, 1],
    ['Z-3', 'EU', '1.2D+1.6L', 700, 0, 0, 0, 0, ''],
  ];
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(cols), 'Columnas');
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(cargas), 'Cargas');
  return XLSX.write(wb, { type: 'array', bookType: 'xlsx' });
}
