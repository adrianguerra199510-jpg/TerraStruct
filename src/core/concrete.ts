// Diseño de concreto reforzado (ACI 318). Unidades: kN, m, MPa.

export const PHI_FLEX = 0.9;
export const PHI_SHEAR = 0.75;
export const PHI_BEARING = 0.65;
export const PHI_PLAIN = 0.6;

export type ShearCode = 'ACI318_14' | 'ACI318_19';

export function beta1(fc: number): number {
  if (fc <= 28) return 0.85;
  if (fc >= 55) return 0.65;
  return 0.85 - (0.05 * (fc - 28)) / 7;
}

/** Cuantía mínima de retracción y temperatura / flexión mínima en losas y zapatas. */
export function rhoMinSlab(fy: number): number {
  return Math.max((0.0018 * 420) / fy, 0.0014);
}

export interface FlexureResult {
  /** acero requerido por flexión [cm²] para el ancho dado */
  As: number;
  Rn: number; // MPa
  rho: number;
  a: number; // m
  cOverD: number;
  /** false si la sección es insuficiente (Rn excede el límite) */
  ok: boolean;
  tensionControlled: boolean;
}

/**
 * Acero requerido para Mu [kN·m] en sección rectangular b×d [m].
 * Devuelve As en cm² (para el ancho b).
 */
export function flexureAs(Mu: number, b: number, d: number, fc: number, fy: number, phi = PHI_FLEX): FlexureResult {
  const Rn = Mu / (phi * b * d * d) / 1000; // MPa
  const lim = 0.85 * fc;
  if (Mu <= 0 || b <= 0 || d <= 0) return { As: 0, Rn: 0, rho: 0, a: 0, cOverD: 0, ok: true, tensionControlled: true };
  const inner = 1 - (2 * Rn) / lim;
  if (inner <= 0) {
    return { As: Infinity, Rn, rho: Infinity, a: d, cOverD: 1, ok: false, tensionControlled: false };
  }
  const rho = (lim / fy) * (1 - Math.sqrt(inner));
  const As = rho * b * d * 1e4;
  const a = (As * 1e-4 * fy) / (lim * b);
  const cOverD = a / beta1(fc) / d;
  const tc = cOverD <= 0.375;
  return { As, Rn, rho, a, cOverD, ok: tc, tensionControlled: tc };
}

/** Resistencia de diseño φMn [kN·m] para As [cm²] en ancho b [m]. */
export function flexureCapacity(As: number, b: number, d: number, fc: number, fy: number, phi = PHI_FLEX): number {
  const a = (As * 1e-4 * fy) / (0.85 * fc * b);
  return phi * As * 1e-4 * fy * (d - a / 2) * 1000; // MPa·m² = MN → ×1000 kN
}

/** λs de ACI 318-19 (efecto de tamaño). d en metros. */
export function sizeEffect(d: number): number {
  return Math.min(1, Math.sqrt(2 / (1 + (d * 1000) / 250)));
}

export interface ShearCapacity {
  Vc: number; // kN
  formula: string;
}

/** Vc de cortante en una dirección para elementos sin estribos (zapatas, losas). */
export function oneWayVc(bw: number, d: number, fc: number, rhoW: number, code: ShearCode, lambda = 1): ShearCapacity {
  const base = 0.17 * lambda * Math.sqrt(fc);
  if (code === 'ACI318_14') {
    return { Vc: base * bw * d * 1000, formula: 'Vc = 0.17·λ·√f′c·bw·d' };
  }
  const ls = sizeEffect(d);
  const v = Math.min(0.66 * lambda * ls * Math.cbrt(Math.max(rhoW, 1e-4)) * Math.sqrt(fc), 0.42 * lambda * Math.sqrt(fc));
  return { Vc: v * bw * d * 1000, formula: 'Vc = 0.66·λs·λ·ρw^(1/3)·√f′c·bw·d ≤ 0.42·λ·√f′c·bw·d' };
}

export interface PunchingCapacity {
  vc: number; // MPa
  vcA: number;
  vcB: number;
  vcC: number;
}

/** Esfuerzo resistente nominal de punzonamiento [MPa]. */
export function punchingVc(beta: number, alphaS: number, bo: number, d: number, fc: number, code: ShearCode, lambda = 1): PunchingCapacity {
  const r = lambda * Math.sqrt(fc) * (code === 'ACI318_19' ? sizeEffect(d) : 1);
  const vcA = 0.33 * r;
  const vcB = 0.17 * (1 + 2 / Math.max(beta, 1)) * r;
  const vcC = 0.083 * ((alphaS * d) / bo + 2) * r;
  return { vc: Math.min(vcA, vcB, vcC), vcA, vcB, vcC };
}
