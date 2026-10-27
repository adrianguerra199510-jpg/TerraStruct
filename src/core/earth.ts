// Empuje de tierras: Rankine, Coulomb, Mononobe–Okabe y perfiles de presión.
// Ángulos en grados en la interfaz pública; fórmulas internas en radianes.

export const rad = (d: number) => (d * Math.PI) / 180;
export const deg = (r: number) => (r * 180) / Math.PI;
export const GAMMA_W = 9.81;

/** Ka de Rankine para talud β (grados); presión paralela al talud. */
export function kaRankine(phiDeg: number, betaDeg = 0): number {
  const phi = rad(phiDeg);
  const beta = rad(Math.min(betaDeg, phiDeg * 0.999));
  const cb = Math.cos(beta);
  const root = Math.sqrt(Math.max(cb * cb - Math.cos(phi) ** 2, 0));
  return (cb * (cb - root)) / (cb + root);
}

export function kpRankine(phiDeg: number): number {
  return Math.tan(rad(45 + phiDeg / 2)) ** 2;
}

/**
 * Ka de Coulomb para una cara que forma el ángulo α con la horizontal (α = 90° cara vertical;
 * α < 90° cara que se inclina alejándose del relleno, como en un muro de gravedad con base más ancha).
 * Pa = ½·Ka·γ·H² con H la altura VERTICAL de la cara (verificado contra el método de cuña de prueba).
 */
export function kaCoulomb(phiDeg: number, deltaDeg: number, alphaDeg: number, betaDeg: number): number {
  return kaeMononobe(phiDeg, deltaDeg, alphaDeg, betaDeg, 0, 0);
}

/** Kae de Mononobe–Okabe (Ka cuando kh = kv = 0). */
export function kaeMononobe(phiDeg: number, deltaDeg: number, alphaDeg: number, betaDeg: number, kh: number, kv: number): number {
  const phi = rad(phiDeg);
  const d = rad(deltaDeg);
  const a = rad(alphaDeg);
  const b = rad(betaDeg);
  const psi = Math.atan2(kh, 1 - kv);
  const num = Math.sin(a + phi - psi) ** 2;
  const s1 = Math.sin(phi + d) * Math.sin(Math.max(phi - psi - b, 0));
  const s2 = Math.sin(a - d - psi) * Math.sin(a + b);
  const root = s2 > 1e-12 ? Math.sqrt(Math.max(s1 / s2, 0)) : 0;
  const den = Math.cos(psi) * Math.sin(a) ** 2 * Math.sin(a - d - psi) * (1 + root) ** 2;
  if (den <= 1e-12) return NaN;
  return num / den;
}

export interface FaceThrustInput {
  Ka: number;
  /** ángulo δ de fricción muro–suelo (grados) para descomponer el empuje */
  deltaDeg: number;
  /** inclinación de la cara respecto a la vertical (grados, + = la cara sube alejándose del relleno) */
  psiDeg: number;
  /** altura vertical de la cara, m */
  Hv: number;
  q: number;
  gamma: number;
  gammaSat: number;
  /** profundidad vertical del nivel freático medida desde el borde superior de la cara; Infinity = sin agua */
  zw: number;
  /** Kae − aplicar sismo */
  kae?: number;
  kh?: number;
  kv?: number;
  /** factor sin(α)/sin(α+β) para sobrecarga con Coulomb */
  surchargeFactor?: number;
}

export interface Thrust {
  /** fuerza normal total y su altura sobre la base de la cara */
  Fn: number;
  y: number;
  Ph: number;
  Pv: number;
}

export interface FaceThrust {
  soil: Thrust;
  surcharge: Thrust;
  water: Thrust;
  /** incremento sísmico ΔPae (actúa a 0.6·H) */
  seismic: Thrust;
  /** presión horizontal total de servicio a la altura y sobre la base de la cara */
  total: Thrust;
}

function simpson(f: (z: number) => number, a: number, b: number, n = 200): number {
  if (b <= a) return 0;
  const h = (b - a) / n;
  let s = f(a) + f(b);
  for (let i = 1; i < n; i++) s += f(a + i * h) * (i % 2 ? 4 : 2);
  return (s * h) / 3;
}

/** Tensión vertical efectiva debida al peso del suelo a la profundidad z. */
export function sigmaV(z: number, gamma: number, gammaSat: number, zw: number, gammaW = GAMMA_W): number {
  if (z <= zw) return gamma * z;
  return gamma * Math.max(zw, 0) + (gammaSat - gammaW) * (z - Math.max(zw, 0));
}

export function faceThrust(inp: FaceThrustInput): FaceThrust {
  const { Ka, Hv, q, gamma, gammaSat, zw } = inp;
  const psi = rad(inp.psiDeg);
  const theta = rad(inp.deltaDeg) + psi; // ángulo del empuje respecto a la horizontal
  const k = Ka;
  const sv = (z: number) => sigmaV(z, gamma, gammaSat, zw);

  const Is = simpson(sv, 0, Hv); // ∫σ dz
  const Iz = simpson((z) => sv(z) * z, 0, Hv);
  const soilFn = k * Is;
  const soilDepth = Is > 1e-12 ? Iz / Is : Hv / 3;
  const soil: Thrust = { Fn: soilFn, y: Hv - soilDepth, Ph: soilFn * Math.cos(theta), Pv: soilFn * Math.sin(theta) };

  const surFn = k * q * Hv * (inp.surchargeFactor ?? 1);
  const surcharge: Thrust = { Fn: surFn, y: Hv / 2, Ph: surFn * Math.cos(theta), Pv: surFn * Math.sin(theta) };

  const u = (z: number) => (isFinite(zw) && z > zw ? GAMMA_W * (z - zw) : 0);
  const Iu = simpson(u, 0, Hv);
  const Iuz = simpson((z) => u(z) * z, 0, Hv);
  const wPh = Iu;
  const water: Thrust = { Fn: Iu / Math.cos(psi), y: Iu > 1e-12 ? Hv - Iuz / Iu : 0, Ph: wPh, Pv: wPh * Math.tan(psi) };

  let seismic: Thrust = { Fn: 0, y: 0.6 * Hv, Ph: 0, Pv: 0 };
  if (inp.kae !== undefined && isFinite(inp.kae)) {
    const kv = inp.kv ?? 0;
    const gammaE = Hv > 0 ? (2 * Is) / (Hv * Hv) : gamma;
    const Fae = 0.5 * gammaE * (1 - kv) * inp.kae * Hv * Hv;
    const dF = Math.max(Fae - soilFn, 0);
    seismic = { Fn: dF, y: 0.6 * Hv, Ph: dF * Math.cos(theta), Pv: dF * Math.sin(theta) };
  }
  const Ph = soil.Ph + surcharge.Ph + water.Ph;
  const Pv = soil.Pv + surcharge.Pv + water.Pv;
  const yBar = Ph > 1e-12 ? (soil.Ph * soil.y + surcharge.Ph * surcharge.y + water.Ph * water.y) / Ph : 0;
  return { soil, surcharge, water, seismic, total: { Fn: soil.Fn + surcharge.Fn + water.Fn, y: yBar, Ph, Pv } };
}

/** Empuje pasivo (Rankine) acumulado entre las profundidades z1 y z2 (m) → fuerza y altura sobre z2. */
export function passiveForce(Kp: number, gamma: number, c: number, z1: number, z2: number): { F: number; zBar: number } {
  if (z2 <= z1) return { F: 0, zBar: z2 };
  const p = (z: number) => Kp * gamma * z + 2 * c * Math.sqrt(Kp);
  const F = simpson(p, z1, z2);
  const M = simpson((z) => p(z) * z, z1, z2);
  return { F, zBar: F > 1e-12 ? M / F : z2 };
}
