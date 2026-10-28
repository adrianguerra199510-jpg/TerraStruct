// Pilotes y cabezales: tipos de datos, catálogo de perfiles y generación de la distribución.
import { Pt } from './geometry';
import { ColumnGeom, defaultColumnGeom } from './shapes';
import { BarSystem } from './materials';
import { LoadCase } from './footing';
import { ShearCode } from './concrete';

export type PileKind = 'concrete' | 'pipe' | 'hpile';
export const PILE_KINDS: { id: PileKind; label: string }[] = [
  { id: 'concrete', label: 'Pilote de concreto reforzado' },
  { id: 'pipe', label: 'Pilote de acero (tubo)' },
  { id: 'hpile', label: 'Pilote de acero (perfil H)' },
];

/** Perfiles HP (AISC). Dimensiones en pulgadas: d, bf, tw, tf. Las propiedades se calculan sin filetes. */
export const HP_SHAPES: { id: string; d: number; bf: number; tw: number; tf: number; w: number }[] = [
  { id: 'HP10x42', d: 9.7, bf: 10.1, tw: 0.415, tf: 0.42, w: 42 },
  { id: 'HP10x57', d: 9.99, bf: 10.2, tw: 0.565, tf: 0.565, w: 57 },
  { id: 'HP12x53', d: 11.8, bf: 12.0, tw: 0.435, tf: 0.435, w: 53 },
  { id: 'HP12x74', d: 12.1, bf: 12.2, tw: 0.605, tf: 0.61, w: 74 },
  { id: 'HP12x84', d: 12.3, bf: 12.3, tw: 0.685, tf: 0.685, w: 84 },
  { id: 'HP14x73', d: 13.6, bf: 14.6, tw: 0.505, tf: 0.505, w: 73 },
  { id: 'HP14x89', d: 13.8, bf: 14.7, tw: 0.615, tf: 0.615, w: 89 },
  { id: 'HP14x102', d: 14.0, bf: 14.8, tw: 0.705, tf: 0.705, w: 102 },
  { id: 'HP14x117', d: 14.2, bf: 14.9, tw: 0.805, tf: 0.805, w: 117 },
];

export interface PileDef {
  kind: PileKind;
  /** concreto */
  shape: 'circle' | 'square';
  /** diámetro o lado (concreto) / diámetro exterior (tubo), m */
  D: number;
  fc: number;
  fy: number;
  nBars: number;
  bar: string;
  tieBar: string;
  tieS: number;
  spiral: boolean;
  cover: number;
  /** tubo: espesor de pared, m */
  t: number;
  /** perfil H */
  hp: string;
  /** acero */
  Fy: number;
  /** pérdida por corrosión en cada cara expuesta, m */
  tc: number;
  /** eje de flexión del perfil H */
  axis: 'weak' | 'strong';
  /** método de instalación (asentamiento por punta) */
  install: 'driven' | 'bored';
  /** tapón de suelo en el extremo (tubo abierto o perfil H) */
  plug: boolean;
  /** longitud embebida bajo el cabezal, m */
  L: number;
  /** longitud libre sobre el terreno (para pandeo y flexión), m */
  Lu: number;
  /** factor de longitud efectiva */
  K: number;
  head: 'fixed' | 'free';
  /** módulo de reacción horizontal del suelo nh, kN/m³ */
  nh: number;
  /** deflexión lateral admisible, m */
  yAllow: number;
}

export interface SoilLayer {
  name: string;
  thk: number;
  kind: 'cohesive' | 'granular' | 'direct';
  /** cohesivo: resistencia no drenada, kPa; α = 0 ⇒ método API */
  su: number;
  alpha: number;
  /** peso unitario efectivo, kN/m³ */
  gamma: number;
  /** granular: φ (°), K (coef. de empuje lateral), Nq (0 = automático) */
  phi: number;
  K: number;
  Nq: number;
  /** fricción lateral límite, kPa */
  fsMax: number;
  /** directo: fricción lateral y resistencia de punta, kPa */
  fs: number;
  qb: number;
  /** deformabilidad: módulo de elasticidad (kPa) y, si Cc > 0, consolidación (Cc, e0) */
  Es: number;
  Cc: number;
  e0: number;
  /** estrato que se consolida o rellena y genera fricción negativa sobre el pilote */
  downdrag: boolean;
  /** licuación: (N1)60, finos (%) y si se evalúa el estrato */
  N160: number;
  FC: number;
  liq: boolean;
}

export interface PileGeo {
  mode: 'static' | 'user';
  /** modo usuario: capacidades admisibles por pilote, kN */
  QaC: number;
  QaT: number;
  FS: number;
  FSt: number;
  /** relación de fricción en tracción respecto a compresión */
  etaT: number;
  /** profundidad de la base del cabezal, m */
  Df: number;
  qbMax: number;
  layers: SoilLayer[];
  /** aplicar eficiencia de grupo (Converse–Labarre) a la compresión */
  groupEff: boolean;
  /** fricción negativa: profundidad del plano neutro como fracción de L */
  neutralFrac: number;
  /** asentamiento admisible del grupo, m */
  sAllow: number;
  /** licuación: nivel freático desde el terreno (m), aceleración máx. (g), magnitud, FS mínimo y fricción residual (fracción) */
  liqOn: boolean;
  gwt: number;
  amax: number;
  Mw: number;
  fsLiq: number;
  liqResid: number;
}

export interface PileLayout {
  mode: 'grid' | 'ring' | 'custom';
  nx: number;
  ny: number;
  sx: number;
  sy: number;
  nRing: number;
  R: number;
  center: boolean;
  pts: Pt[];
}

export interface PileCap {
  h: number;
  /** distancia del eje del pilote exterior al borde del cabezal, m */
  edge: number;
  manualSize: boolean;
  B: number;
  L: number;
  cover: number;
  /** penetración del pilote en el cabezal, m */
  embed: number;
  barSystem: BarSystem;
  barX: string;
  barY: string;
  lowerLayer: 'x' | 'y';
  topSteel: boolean;
  barTopX: string;
  barTopY: string;
  manual: { on: boolean; sBotX: number; sBotY: number; sTopX: number; sTopY: number };
  fc: number;
  fy: number;
  lambda: number;
  code: ShearCode;
  gammaC: number;
  /** armadura de control de fisuración en puntales (ΣAs·senγ/(b·s) ≥ 0.003): βs = 0.75 en vez de 0.60 */
  crackMesh: boolean;
}

export interface PileCombo extends LoadCase {
  id: string;
  /** combinación con sismo (se verifica la condición licuada) */
  eq?: boolean;
  name: string;
  kind: 'service' | 'ultimate';
  qaFactor: number;
}

export interface PileInput {
  name: string;
  pile: PileDef;
  layout: PileLayout;
  cap: PileCap;
  column: { geom: ColumnGeom; x: number; y: number };
  geo: PileGeo;
  combos: PileCombo[];
}

export function defaultPile(kind: PileKind = 'concrete'): PileDef {
  const base: PileDef = {
    kind,
    shape: 'circle',
    D: 0.5,
    fc: 28,
    fy: 420,
    nBars: 8,
    bar: '#6',
    tieBar: '#3',
    tieS: 0.1,
    spiral: true,
    cover: 0.075,
    t: 0.0095,
    hp: 'HP12x74',
    Fy: 250,
    tc: 0.0015,
    axis: 'weak',
    install: kind === 'concrete' ? 'bored' : 'driven',
    plug: false,
    L: 18,
    Lu: 0,
    K: 1,
    head: 'fixed',
    nh: 5000,
    yAllow: 0.0125,
  };
  if (kind === 'pipe') return { ...base, D: 0.356, t: 0.0095, Fy: 290 };
  return base;
}

export function defaultLayers(): SoilLayer[] {
  const l = (name: string, thk: number, kind: SoilLayer['kind'], p: Partial<SoilLayer>): SoilLayer => ({
    name, thk, kind, su: 50, alpha: 0, gamma: 9, phi: 32, K: 1, Nq: 0, fsMax: 100, fs: 30, qb: 2000, Es: 30000, Cc: 0, e0: 0.8, downdrag: false, N160: 20, FC: 10, liq: false, ...p,
  });
  return [
    l('Arcilla blanda a media', 6, 'cohesive', { su: 40, gamma: 8, Es: 8000, Cc: 0.3, e0: 1.0 }),
    l('Arena densa', 12, 'granular', { phi: 34, gamma: 10, K: 1, fsMax: 100, Es: 45000, N160: 12, FC: 8, liq: true }),
    l('Arcilla firme bajo la punta', 12, 'cohesive', { su: 120, gamma: 9, Es: 25000, Cc: 0.15, e0: 0.7 }),
  ];
}

export function defaultCombos(): PileCombo[] {
  const s = (id: string, name: string, P: number, Vx: number, Vy: number, Mx: number, My: number, qaFactor: number): PileCombo => ({ id, name, kind: 'service', P, Vx, Vy, Mx, My, qaFactor, eq: Vx !== 0 || Vy !== 0 });
  const u = (id: string, name: string, P: number, Vx: number, Vy: number, Mx: number, My: number): PileCombo => ({ id, name, kind: 'ultimate', P, Vx, Vy, Mx, My, qaFactor: 1 });
  return [
    s('S1', 'D + L', 1900, 0, 0, 0, 0, 1),
    s('S2', 'D + 0.7E', 1300, 90, 0, 0, 160, 1.33),
    u('U1', '1.2D + 1.6L', 2700, 0, 0, 0, 0),
    u('U2', '1.2D + L + E', 2200, 130, 0, 0, 230),
    u('U3', '0.9D + E', 900, 130, 0, 0, 230),
  ];
}

export function defaultPileInput(kind: PileKind = 'concrete'): PileInput {
  return {
    name: 'Cabezal CP-1',
    pile: defaultPile(kind),
    layout: { mode: 'grid', nx: 2, ny: 2, sx: 1.5, sy: 1.5, nRing: 6, R: 1.2, center: false, pts: [{ x: -0.75, y: -0.75 }, { x: 0.75, y: -0.75 }, { x: 0.75, y: 0.75 }, { x: -0.75, y: 0.75 }] },
    cap: {
      h: 1.1, edge: 0.5, manualSize: false, B: 2.5, L: 2.5, cover: 0.075, embed: 0.075, barSystem: 'astm', barX: '#8', barY: '#8', lowerLayer: 'x',
      topSteel: false, barTopX: '#5', barTopY: '#5', manual: { on: false, sBotX: 0.15, sBotY: 0.15, sTopX: 0.2, sTopY: 0.2 },
      fc: 28, fy: 420, lambda: 1, code: 'ACI318_14', gammaC: 24, crackMesh: true,
    },
    column: { geom: { ...defaultColumnGeom('rect'), b: 0.5, h: 0.5 }, x: 0, y: 0 },
    geo: { mode: 'static', QaC: 700, QaT: 150, FS: 2.5, FSt: 3, etaT: 0.75, Df: 1.5, qbMax: 5000, layers: defaultLayers(), groupEff: false, neutralFrac: 0.8, sAllow: 0.025, liqOn: false, gwt: 2, amax: 0.25, Mw: 7, fsLiq: 1.1, liqResid: 0 },
    combos: defaultCombos(),
  };
}

/** Coordenadas de los pilotes (m), respecto al origen del cabezal. */
export function pilePositions(l: PileLayout): Pt[] {
  if (l.mode === 'custom') return l.pts.map((p) => ({ ...p }));
  if (l.mode === 'ring') {
    const out: Pt[] = [];
    for (let i = 0; i < Math.max(l.nRing, 1); i++) {
      const a = (2 * Math.PI * i) / Math.max(l.nRing, 1) + Math.PI / 2;
      out.push({ x: l.R * Math.cos(a), y: l.R * Math.sin(a) });
    }
    if (l.center) out.push({ x: 0, y: 0 });
    return out;
  }
  const out: Pt[] = [];
  for (let i = 0; i < l.nx; i++) for (let j = 0; j < l.ny; j++) out.push({ x: (i - (l.nx - 1) / 2) * l.sx, y: (j - (l.ny - 1) / 2) * l.sy });
  return out;
}

/** Distribuciones usuales para n pilotes con separación s (m). */
export function standardLayout(n: number, s: number): PileLayout {
  const base: PileLayout = { mode: 'custom', nx: 1, ny: 1, sx: s, sy: s, nRing: 6, R: s, center: false, pts: [] };
  const h = (s * Math.sqrt(3)) / 2;
  const grid = (nx: number, ny: number): PileLayout => ({ ...base, mode: 'grid', nx, ny });
  switch (n) {
    case 1: return grid(1, 1);
    case 2: return grid(2, 1);
    case 3: return { ...base, pts: [{ x: -s / 2, y: -h / 3 }, { x: s / 2, y: -h / 3 }, { x: 0, y: (2 * h) / 3 }] };
    case 4: return grid(2, 2);
    case 5: return { ...base, pts: [{ x: -s / 2, y: -s / 2 }, { x: s / 2, y: -s / 2 }, { x: s / 2, y: s / 2 }, { x: -s / 2, y: s / 2 }, { x: 0, y: 0 }].map((p) => ({ x: p.x * Math.SQRT2, y: p.y * Math.SQRT2 })) };
    case 6: return grid(3, 2);
    case 7: return { ...base, mode: 'ring', nRing: 6, R: s, center: true };
    case 8: return { ...base, pts: [-1, 0, 1].flatMap((i) => [-1, 0, 1].map((j) => ({ x: i * s, y: j * s }))).filter((p) => !(p.x === 0 && p.y === 0)) };
    case 9: return grid(3, 3);
    case 10: return { ...base, pts: [0, 1].flatMap((j) => [0, 1, 2, 3, 4].map((i) => ({ x: (i - 2) * s, y: (j - 0.5) * s }))) };
    case 12: return grid(4, 3);
    default: {
      const nx = Math.ceil(Math.sqrt(n));
      const ny = Math.ceil(n / nx);
      const pts: Pt[] = [];
      for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) if (pts.length < n) pts.push({ x: (i - (nx - 1) / 2) * s, y: (j - (ny - 1) / 2) * s });
      return { ...base, pts };
    }
  }
}
