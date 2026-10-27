// Catálogo de barras de refuerzo y constantes de materiales.

export interface Bar {
  id: string;
  label: string;
  /** diámetro en mm */
  db: number;
  /** área en cm² */
  area: number;
}

export type BarSystem = 'astm' | 'metric';

export const BARS_ASTM: Bar[] = [
  { id: '#3', label: '#3 (Ø9.5)', db: 9.5, area: 0.71 },
  { id: '#4', label: '#4 (Ø12.7)', db: 12.7, area: 1.29 },
  { id: '#5', label: '#5 (Ø15.9)', db: 15.9, area: 1.99 },
  { id: '#6', label: '#6 (Ø19.1)', db: 19.1, area: 2.84 },
  { id: '#7', label: '#7 (Ø22.2)', db: 22.2, area: 3.87 },
  { id: '#8', label: '#8 (Ø25.4)', db: 25.4, area: 5.1 },
  { id: '#9', label: '#9 (Ø28.7)', db: 28.7, area: 6.45 },
  { id: '#10', label: '#10 (Ø32.3)', db: 32.3, area: 8.19 },
  { id: '#11', label: '#11 (Ø35.8)', db: 35.8, area: 10.06 },
];

const mm = (d: number): Bar => ({ id: 'Ø' + d, label: `Ø${d} mm`, db: d, area: (Math.PI * d * d) / 400 });
export const BARS_METRIC: Bar[] = [8, 10, 12, 14, 16, 20, 25, 32, 36].map(mm);

export function barList(sys: BarSystem): Bar[] {
  return sys === 'astm' ? BARS_ASTM : BARS_METRIC;
}

export function findBar(id: string): Bar {
  return [...BARS_ASTM, ...BARS_METRIC].find((b) => b.id === id) ?? BARS_ASTM[3];
}

export interface Detailing {
  /** "ø/espaciamiento" listo para mostrar, p. ej. "#5 @ 20 cm" */
  text: string;
  spacing: number; // m
  asProv: number; // cm²/m
  ok: boolean;
  note?: string;
}

/**
 * Elige el espaciamiento (múltiplo de 2.5 cm) para cubrir As requerido [cm²/m] con la barra indicada.
 * Espaciamiento máximo y mínimo en metros.
 */
export function chooseSpacing(asReq: number, bar: Bar, maxS = 0.45, minS = 0.075): Detailing {
  const raw = (bar.area / Math.max(asReq, 1e-9)) * 1; // m
  let s = Math.floor((raw + 1e-9) / 0.025) * 0.025;
  let note: string | undefined;
  let ok = true;
  if (s > maxS) s = Math.floor(maxS / 0.025) * 0.025;
  if (s < minS) {
    ok = false;
    note = 'Espaciamiento menor al mínimo: usar una barra de mayor diámetro.';
    s = minS;
  }
  const asProv = bar.area / s;
  return { text: `${bar.id.replace('Ø', 'Ø')} @ ${(s * 100).toFixed(1).replace(/\.0$/, '')} cm`, spacing: s, asProv, ok, note };
}

/** Longitud de desarrollo en tracción, barras rectas (ACI 318-14 25.4.2.2), en metros. */
export function developmentLength(db_mm: number, fy: number, fc: number, opts: { psiT?: number; psiE?: number; lambda?: number } = {}): number {
  const psiT = opts.psiT ?? 1;
  const psiE = opts.psiE ?? 1;
  const lam = opts.lambda ?? 1;
  const k = db_mm <= 19.1 ? 2.1 : 1.7;
  const ld = ((fy * psiT * psiE) / (k * lam * Math.sqrt(fc))) * db_mm; // mm
  return Math.max(ld, 300) / 1000;
}

/** Longitud de desarrollo de gancho estándar (ACI 25.4.3.1), en metros. */
export function hookDevelopment(db_mm: number, fy: number, fc: number, lambda = 1): number {
  const ldh = ((0.24 * fy) / (lambda * Math.sqrt(fc))) * db_mm;
  return Math.max(ldh, 8 * db_mm, 150) / 1000;
}

export const GAMMA_CONCRETE = 24; // kN/m³
export const GAMMA_WATER = 9.81;
