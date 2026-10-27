// Sistemas de unidades. Internamente todo es SI: kN, m, kPa, MPa, kN/m³, kN·m.

export type UnitSystem = 'SI' | 'TEC';

export type Quantity =
  | 'len' // m
  | 'lencm' // se muestra en cm
  | 'force' // kN | tonf
  | 'lforce' // fuerza por metro: kN/m | tonf/m
  | 'moment' // kN·m | tonf·m
  | 'lmoment' // momento por metro: kN·m/m | tonf·m/m
  | 'press' // kPa | tonf/m²
  | 'stress' // MPa | kgf/cm²
  | 'uw' // kN/m³ | tonf/m³
  | 'area_cm2' // cm² (siempre)
  | 'area_cm2m' // cm²/m (siempre)
  | 'angle'
  | 'none';

const G = 9.80665;

interface UnitDef {
  label: string;
  /** valor_mostrado = valor_SI * factor */
  factor: number;
  decimals: number;
}

const TABLE: Record<UnitSystem, Record<Quantity, UnitDef>> = {
  SI: {
    len: { label: 'm', factor: 1, decimals: 3 },
    lencm: { label: 'cm', factor: 100, decimals: 1 },
    force: { label: 'kN', factor: 1, decimals: 1 },
    lforce: { label: 'kN/m', factor: 1, decimals: 1 },
    moment: { label: 'kN·m', factor: 1, decimals: 1 },
    lmoment: { label: 'kN·m/m', factor: 1, decimals: 1 },
    press: { label: 'kPa', factor: 1, decimals: 1 },
    stress: { label: 'MPa', factor: 1, decimals: 1 },
    uw: { label: 'kN/m³', factor: 1, decimals: 1 },
    area_cm2: { label: 'cm²', factor: 1, decimals: 2 },
    area_cm2m: { label: 'cm²/m', factor: 1, decimals: 2 },
    angle: { label: '°', factor: 1, decimals: 1 },
    none: { label: '', factor: 1, decimals: 3 },
  },
  TEC: {
    len: { label: 'm', factor: 1, decimals: 3 },
    lencm: { label: 'cm', factor: 100, decimals: 1 },
    force: { label: 'tonf', factor: 1 / G, decimals: 2 },
    lforce: { label: 'tonf/m', factor: 1 / G, decimals: 2 },
    moment: { label: 'tonf·m', factor: 1 / G, decimals: 2 },
    lmoment: { label: 'tonf·m/m', factor: 1 / G, decimals: 2 },
    press: { label: 'tonf/m²', factor: 1 / G, decimals: 2 },
    stress: { label: 'kgf/cm²', factor: 10.19716, decimals: 0 },
    uw: { label: 'tonf/m³', factor: 1 / G, decimals: 2 },
    area_cm2: { label: 'cm²', factor: 1, decimals: 2 },
    area_cm2m: { label: 'cm²/m', factor: 1, decimals: 2 },
    angle: { label: '°', factor: 1, decimals: 1 },
    none: { label: '', factor: 1, decimals: 3 },
  },
};

export function unitLabel(sys: UnitSystem, q: Quantity): string {
  return TABLE[sys][q].label;
}
export function toDisplay(sys: UnitSystem, q: Quantity, v: number): number {
  return v * TABLE[sys][q].factor;
}
export function fromDisplay(sys: UnitSystem, q: Quantity, v: number): number {
  return v / TABLE[sys][q].factor;
}
export function defaultDecimals(sys: UnitSystem, q: Quantity): number {
  return TABLE[sys][q].decimals;
}

/** Redondea un valor mostrado para eliminar ruido de punto flotante en los campos de entrada. */
export function cleanNumber(v: number, digits = 6): number {
  if (!isFinite(v)) return v;
  return Number(v.toPrecision(digits));
}

/** Formateador para reportes y tablas. */
export interface Fmt {
  sys: UnitSystem;
  /** Valor SI → texto con unidad */
  u: (q: Quantity, v: number, decimals?: number) => string;
  /** Valor SI → texto sin unidad */
  n: (q: Quantity, v: number, decimals?: number) => string;
  /** Texto de la unidad */
  l: (q: Quantity) => string;
  /** Número genérico con decimales */
  d: (v: number, decimals?: number) => string;
}

export function makeFmt(sys: UnitSystem): Fmt {
  const num = (v: number, dec: number) => {
    if (!isFinite(v)) return v > 0 ? '∞' : v < 0 ? '−∞' : '—';
    const s = v.toFixed(dec);
    return s === '-0' || /^-0\.?0*$/.test(s) ? s.slice(1) : s;
  };
  return {
    sys,
    n: (q, v, dec) => num(toDisplay(sys, q, v), dec ?? TABLE[sys][q].decimals),
    u: (q, v, dec) => {
      const lab = TABLE[sys][q].label;
      return num(toDisplay(sys, q, v), dec ?? TABLE[sys][q].decimals) + (lab ? ' ' + lab : '');
    },
    l: (q) => TABLE[sys][q].label,
    d: (v, dec = 2) => num(v, dec),
  };
}
