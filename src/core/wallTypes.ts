import { BarSystem } from './materials';
import { ShearCode } from './concrete';

export type WallType =
  | 'cantilever'
  | 'gravityConcrete'
  | 'gravityMasonry'
  | 'masonryReinforced'
  | 'counterfortInt'
  | 'counterfortExt'
  | 'masonryCfInt'
  | 'masonryCfExt'
  | 'gabion';

export const WALL_TYPES: { id: WallType; label: string; short: string; desc: string }[] = [
  { id: 'cantilever', label: 'Voladizo de concreto armado', short: 'Voladizo', desc: 'Muro en T invertida o en L con pantalla, pie y talón.' },
  { id: 'counterfortInt', label: 'Con contrafuertes internos', short: 'Contrafuerte int.', desc: 'Contrafuertes dentro del relleno; la pantalla y el talón trabajan como losas entre contrafuertes.' },
  { id: 'counterfortExt', label: 'Con contrafuertes externos', short: 'Contrafuerte ext.', desc: 'Contrafuertes en la cara visible (estribos); la pantalla y el pie trabajan como losas.' },
  { id: 'gravityConcrete', label: 'Gravedad de concreto simple / ciclópeo', short: 'Gravedad concreto', desc: 'Muro macizo que resiste por peso propio; verificación de concreto simple.' },
  { id: 'gravityMasonry', label: 'Gravedad de mampostería', short: 'Gravedad mampostería', desc: 'Piedra, ladrillo o bloque sin refuerzo; esfuerzos admisibles y fricción en juntas.' },
  { id: 'masonryReinforced', label: 'Mampostería reforzada en voladizo', short: 'Mamp. reforzada', desc: 'Pantalla de bloque con celdas inyectadas sobre zapata de concreto.' },
  { id: 'masonryCfInt', label: 'Mampostería reforzada con contrafuertes internos', short: 'Mamp. contrafuerte int.', desc: 'Pantalla de bloque con celdas inyectadas que trabaja como losa horizontal entre contrafuertes de bloque dentro del relleno.' },
  { id: 'masonryCfExt', label: 'Mampostería reforzada con contrafuertes externos', short: 'Mamp. contrafuerte ext.', desc: 'Pantalla de bloque reforzada apoyada en contrafuertes (pilastras) de bloque inyectado en la cara visible.' },
  { id: 'gabion', label: 'Muro de gaviones', short: 'Gaviones', desc: 'Cuerpos de canastas de malla rellenas de piedra, apilados en escalones.' },
];

/** Armado del contrafuerte y de las losas que apoyan en él, definido por el usuario */
export interface CounterfortRebar {
  mainBar: string;
  nMain: number;
  stirBar: string;
  stirS: number;
  tieStemBar: string;
  tieStemS: number;
  tieSlabBar: string;
  tieSlabS: number;
  stemHBar: string;
  stemHS: number;
  stemVBar: string;
  stemVS: number;
}

/** Malla de la zapata corrida (definida por el usuario) */
export interface FootMesh {
  botBar: string;
  botS: number;
  topOn: boolean;
  topBar: string;
  topS: number;
  longOn: boolean;
  longBar: string;
  longS: number;
}

export type BlockType = '6' | '8' | '12';
export const BLOCKS: { id: BlockType; label: string; t: number }[] = [
  { id: '6', label: 'Bloque de 6″ (15 cm)', t: 0.15 },
  { id: '8', label: 'Bloque de 8″ (20 cm)', t: 0.2 },
  { id: '12', label: 'Bloque de 12″ (30 cm)', t: 0.3 },
];
export const blockThickness = (b: BlockType) => BLOCKS.find((x) => x.id === b)?.t ?? 0.2;

export interface GabionInput {
  /** número de cuerpos (hiladas) y altura de cada uno */
  n: number;
  hc: number;
  /** ancho del cuerpo inferior y reducción de ancho por cuerpo */
  b0: number;
  step: number;
  /** lado donde se escalona: frente, dorso o ambos (simétrico) */
  side: 'front' | 'back' | 'both';
  /** peso unitario de la piedra y porosidad de la canasta */
  gammaStone: number;
  porosity: number;
  /** esfuerzo admisible de compresión de la sección (kPa) */
  sigmaAllow: number;
  /** fricción entre cuerpos (tan δ) y cohesión (kPa) */
  muG: number;
  cG: number;
  fsSlide: number;
  /** excentricidad admisible como fracción del ancho del cuerpo */
  eFrac: number;
}

export function gabionGamma(g: GabionInput): number {
  return g.gammaStone * (1 - g.porosity);
}

/** Viga corona (de amarre) de concreto rectangular entre contrafuertes, a una altura dada de la pantalla */
export interface CrownBeam {
  /** altura de la cara superior de la viga sobre la cara superior de la zapata, m */
  y: number;
  /** dimensión en el sentido del espesor del muro (b) y en el vertical (h), m */
  b: number;
  h: number;
  /** acero de la cara del relleno (apoyos, sobre los contrafuertes) y de la cara frontal (centro de la luz) */
  nBack: number;
  barBack: string;
  nFront: number;
  barFront: string;
  /** estribos de 2 ramas */
  stirBar: string;
  stirS: number;
}

export function defaultCrownBeam(y: number, t: number): CrownBeam {
  return { y, b: Math.max(t, 0.2), h: 0.2, nBack: 2, barBack: '#4', nFront: 2, barFront: '#4', stirBar: '#3', stirS: 0.2 };
}

export interface WallInput {
  name: string;
  type: WallType;
  // --- geometría (m) ---
  /** altura de la pantalla (de la cara superior de la zapata a la corona) */
  H: number;
  tTop: number;
  tBot: number;
  /** cara de la pantalla que se mantiene vertical; 'free' usa fb */
  stemFace: 'front' | 'back' | 'free';
  /** desplazamiento horizontal de la cara frontal entre base y corona (+ hacia el relleno) cuando stemFace = 'free' */
  fb: number;
  /** longitud del pie y del talón */
  Lt: number;
  Lh: number;
  /** espesor de la zapata en la pantalla y en la punta del pie */
  hb: number;
  hbTip: number;
  key: { enabled: boolean; x: number; b: number; d: number };
  cf: { s: number; t: number; proj: number; projTop: number; rb: CounterfortRebar };
  /** vigas corona entre contrafuertes (solo muros con contrafuertes) */
  beams: CrownBeam[];
  gab: GabionInput;
  /** bloque de mampostería reforzada: 6", 8" o 12" */
  block: BlockType;
  /** altura del terreno al frente sobre la cara inferior de la zapata */
  Df: number;
  // --- suelos ---
  fill: { gamma: number; gammaSat: number; phi: number; beta: number; q: number };
  /** nivel freático sobre la cara inferior de la zapata en el relleno (0 = sin agua) */
  hw: number;
  found: { gamma: number; phi: number; c: number; qa: number; mu: number; ca: number; bearingMode: 'qa' | 'calc'; fsBearing: number; useSoilFriction: boolean };
  passive: { use: boolean; factor: number; ignoreTop: number };
  theory: 'rankine' | 'coulomb';
  /** fricción muro–suelo para Coulomb / Mononobe–Okabe (grados) */
  delta: number;
  seismic: { on: boolean; kh: number; kv: number };
  includeToeSoil: boolean;
  /** piscina: agua en el lado interior (frente) del muro; se evalúan las condiciones vacía y llena */
  pool: { on: boolean; hwi: number; /** recinto cerrado (paredes en ambos lados): el empuje del agua es interno y lo equilibra la otra pared a través del fondo; por defecto true */ closed?: boolean };
  /** (interno) profundidad del agua de la piscina en la condición evaluada, m; 0 = vacía */
  poolDepth: number;
  /** (interno) acero mínimo de la cara frontal exigido por la condición más severa de la piscina, cm²/m */
  poolFrontMin: number;
  /** (interno) condición de piscina llena sin relleno detrás del muro */
  poolNoFill: boolean;
  /** si es true, el peso de la sobrecarga sobre el talón no se cuenta en volcamiento ni deslizamiento */
  ignoreSurchargeWeight: boolean;
  // --- materiales ---
  mat: {
    fc: number;
    fy: number;
    lambda: number;
    gammaC: number;
    cover: number;
    coverFound: number;
    barSystem: BarSystem;
    barStem: string;
    barStemH: string;
    barHeel: string;
    barToe: string;
    barKey: string;
    /** barras longitudinales de la zapata (paralelas al muro) */
    /** pantalla: capas de acero vertical (1 o 2 caras), separación vertical (0 = automática), barras horizontales y su separación (0 = automática) */
    mesh: FootMesh;
    stemLayers: 1 | 2;
    /** segunda capa de la pantalla (cara frontal): barra ('' = automática) y separación (0 = automática) */
    barStemF?: string;
    stemFrontS?: number;
    stemVertS: number;
    horizOn: boolean;
    horizS: number;
    footLong: boolean;
    barLong: string;
    /** acero transversal también en la cara opuesta de pie y talón */
    footOpp: boolean;
    code: ShearCode;
    // mampostería
    fm: number; // MPa
    gammaM: number; // kN/m³
    fcAllowRatio: number; // esfuerzo de compresión admisible / f'm
    ftAllow: number; // tracción admisible en juntas, MPa
    cJ: number; // cohesión de juntas, MPa
    muJ: number;
    fsJoint: number;
    unitThickness: number; // espesor del bloque (m) para recubrimiento de refuerzo
  };
  factors: {
    fsOT: number;
    fsSL: number;
    fsOTe: number;
    fsSLe: number;
    qaIncE: number;
    dead: number;
    deadMin: number;
    live: number;
    lateral: number;
    eq: number;
  };
}

export function defaultWall(type: WallType = 'cantilever'): WallInput {
  const base: WallInput = {
    name: 'Muro M-1',
    type,
    H: 4.0,
    tTop: 0.3,
    tBot: 0.45,
    stemFace: 'front',
    fb: 0,
    Lt: 0.9,
    Lh: 2.0,
    hb: 0.5,
    hbTip: 0.5,
    key: { enabled: false, x: 1.2, b: 0.4, d: 0.5 },
    beams: [],
    cf: { s: 3.0, t: 0.3, proj: 2.0, projTop: 0, rb: { mainBar: '#8', nMain: 8, stirBar: '#4', stirS: 0.2, tieStemBar: '#4', tieStemS: 0.2, tieSlabBar: '#4', tieSlabS: 0.2, stemHBar: '#5', stemHS: 0.2, stemVBar: '#5', stemVS: 0.25 } },
    gab: { n: 4, hc: 1.0, b0: 2.5, step: 0.5, side: 'front', gammaStone: 26, porosity: 0.3, sigmaAllow: 300, muG: 0.6, cG: 0, fsSlide: 1.5, eFrac: 1 / 3 },
    block: '8',
    Df: 1.0,
    fill: { gamma: 18, gammaSat: 20, phi: 32, beta: 0, q: 10 },
    hw: 0,
    found: { gamma: 18, phi: 30, c: 0, qa: 200, mu: 0.5, ca: 0, bearingMode: 'qa', fsBearing: 3, useSoilFriction: true },
    passive: { use: true, factor: 0.5, ignoreTop: 0.3 },
    theory: 'rankine',
    delta: 20,
    seismic: { on: false, kh: 0.15, kv: 0 },
    includeToeSoil: true,
    pool: { on: false, hwi: 2.0, closed: true },
    poolDepth: 0,
    poolFrontMin: 0,
    poolNoFill: false,
    ignoreSurchargeWeight: true,
    mat: {
      fc: 28,
      fy: 420,
      lambda: 1,
      gammaC: 24,
      cover: 0.05,
      coverFound: 0.075,
      barSystem: 'astm',
      barStem: '#5',
      barStemH: '#4',
      barHeel: '#5',
      barToe: '#5',
      barKey: '#5',
      mesh: { botBar: '#5', botS: 0.2, topOn: true, topBar: '#5', topS: 0.2, longOn: true, longBar: '#4', longS: 0.25 },
      stemLayers: 2,
      stemVertS: 0,
      horizOn: true,
      horizS: 0,
      footLong: true,
      barLong: '#4',
      footOpp: false,
      code: 'ACI318_14',
      fm: 10,
      gammaM: 20,
      fcAllowRatio: 0.25,
      ftAllow: 0,
      cJ: 0.1,
      muJ: 0.6,
      fsJoint: 2,
      unitThickness: 0.2,
    },
    factors: { fsOT: 2.0, fsSL: 1.5, fsOTe: 1.5, fsSLe: 1.1, qaIncE: 1.33, dead: 1.2, deadMin: 0.9, live: 1.6, lateral: 1.6, eq: 1.0 },
  };
  switch (type) {
    case 'counterfortInt':
      Object.assign(base, { H: 7.0, tTop: 0.3, tBot: 0.3, Lt: 1.2, Lh: 3.2, hb: 0.6, hbTip: 0.6, cf: { s: 3.5, t: 0.3, proj: 3.2, projTop: 0, rb: { mainBar: '#8', nMain: 10, stirBar: '#4', stirS: 0.2, tieStemBar: '#4', tieStemS: 0.2, tieSlabBar: '#4', tieSlabS: 0.2, stemHBar: '#5', stemHS: 0.2, stemVBar: '#4', stemVS: 0.3 } } });
      base.mat.mesh = { botBar: '#6', botS: 0.15, topOn: true, topBar: '#6', topS: 0.15, longOn: true, longBar: '#5', longS: 0.15 };
      base.cf.rb.tieStemS = 0.15;
      base.cf.rb.tieSlabBar = '#5';
      base.cf.rb.tieSlabS = 0.1;
      break;
    case 'counterfortExt':
      Object.assign(base, { H: 7.0, tTop: 0.3, tBot: 0.3, Lt: 2.8, Lh: 3.4, hb: 0.7, hbTip: 0.7, cf: { s: 3.5, t: 0.3, proj: 2.6, projTop: 0, rb: { mainBar: '#8', nMain: 10, stirBar: '#4', stirS: 0.2, tieStemBar: '#4', tieStemS: 0.2, tieSlabBar: '#4', tieSlabS: 0.2, stemHBar: '#5', stemHS: 0.2, stemVBar: '#5', stemVS: 0.25 } }, Df: 1.0 });
      base.mat.mesh = { botBar: '#6', botS: 0.15, topOn: true, topBar: '#6', topS: 0.15, longOn: true, longBar: '#5', longS: 0.15 };
      base.cf.rb.tieStemS = 0.15;
      base.cf.rb.tieSlabBar = '#5';
      base.cf.rb.tieSlabS = 0.1;
      break;
    case 'masonryCfInt':
    case 'masonryCfExt': {
      const ext = type === 'masonryCfExt';
      Object.assign(base, {
        H: 4.0, tTop: 0.2, tBot: 0.2, Lt: ext ? 1.8 : 0.8, Lh: ext ? 2.4 : 2.6, hb: 0.5, hbTip: 0.5, block: '8', Df: ext ? 0.8 : 1.0,
        cf: { s: 2.4, t: 0.2, proj: ext ? 1.6 : 2.2, projTop: 0, rb: { mainBar: '#7', nMain: 4, stirBar: '#4', stirS: 0.4, tieStemBar: '#4', tieStemS: 0.4, tieSlabBar: '#4', tieSlabS: 0.2, stemHBar: '#5', stemHS: 0.2, stemVBar: '#4', stemVS: 0.2 } },
      });
      base.mat.mesh = { botBar: '#5', botS: 0.2, topOn: true, topBar: '#5', topS: 0.2, longOn: true, longBar: '#5', longS: 0.1 };
      base.mat.stemLayers = 1;
      base.mat.horizS = 0.4;
      base.mat.barStem = '#5';
      base.beams = [defaultCrownBeam(4.0, 0.2)];
      base.cf.rb.tieSlabBar = '#5';
      base.cf.rb.tieSlabS = 0.15;
      break;
    }
    case 'gravityConcrete':
      Object.assign(base, { H: 3.0, tTop: 0.6, tBot: 1.9, stemFace: 'front', Lt: 0.4, Lh: 0, hb: 0.5, hbTip: 0.5, theory: 'coulomb', Df: 0.8 });
      base.mat.fc = 21;
      break;
    case 'gravityMasonry':
      Object.assign(base, { H: 2.2, tTop: 0.6, tBot: 1.7, stemFace: 'front', Lt: 0, Lh: 0, hb: 0, hbTip: 0, theory: 'coulomb', Df: 0.6 });
      base.mat.gammaM = 22;
      break;
    case 'gabion':
      Object.assign(base, { theory: 'coulomb', Df: 0.5, Lt: 0, Lh: 0, hb: 0, hbTip: 0 });
      break;
    case 'masonryReinforced':
      Object.assign(base, { H: 2.4, tTop: 0.2, tBot: 0.2, Lt: 0.6, Lh: 1.5, hb: 0.4, hbTip: 0.4, block: '8' });
      base.mat.stemLayers = 2;
      base.mat.horizS = 0.4;
      base.mat.barStem = '#5';
      break;
    default:
      break;
  }
  return base;
}

export const hasHeelSlab = (t: WallType) => t === 'cantilever' || t === 'counterfortInt' || t === 'counterfortExt' || t === 'masonryReinforced' || t === 'masonryCfInt' || t === 'masonryCfExt';
export const isCounterfort = (t: WallType) => t === 'counterfortInt' || t === 'counterfortExt' || t === 'masonryCfInt' || t === 'masonryCfExt';
/** contrafuertes dentro del relleno / en la cara visible (concreto o mampostería) */
export const cfInternal = (t: WallType) => t === 'counterfortInt' || t === 'masonryCfInt';
export const cfExternal = (t: WallType) => t === 'counterfortExt' || t === 'masonryCfExt';
/** pantalla de bloque reforzado (en voladizo o entre contrafuertes) */
export const isMasonryStem = (t: WallType) => t === 'masonryReinforced' || t === 'masonryCfInt' || t === 'masonryCfExt';
export const isGravity = (t: WallType) => t === 'gravityConcrete' || t === 'gravityMasonry' || t === 'gabion';
export const isGabion = (t: WallType) => t === 'gabion';

/** Para gaviones, deriva la geometría general (altura, anchos, sin zapata) a partir de los cuerpos. */
/** Piscina como recinto cerrado: el empuje horizontal del agua no es una fuerza externa */
export const poolClosed = (w: { pool: { closed?: boolean } }) => w.pool.closed !== false;

export function normalizeWall(w: WallInput): WallInput {
  if (isMasonryStem(w.type)) {
    const t = blockThickness(w.block);
    // con bloque de 6″ solo cabe una barra al centro de la celda
    return { ...w, tTop: t, tBot: t, stemFace: 'front', fb: 0, mat: { ...w.mat, stemLayers: w.block === '6' ? 1 : w.mat.stemLayers } };
  }
  if (w.type !== 'gabion') return w;
  const g = w.gab;
  const n = Math.max(1, Math.round(g.n));
  const bTop = Math.max(g.b0 - (n - 1) * g.step, 0.5);
  return {
    ...w,
    H: n * g.hc,
    tBot: g.b0,
    tTop: bTop,
    stemFace: g.side === 'front' ? 'back' : g.side === 'back' ? 'front' : 'free',
    fb: (g.b0 - bTop) / 2,
    Lt: 0,
    Lh: 0,
    hb: 0,
    hbTip: 0,
    key: { ...w.key, enabled: false },
    theory: w.theory,
  };
}

/** Ancho de cada cuerpo (de abajo hacia arriba). */
export function gabionWidths(g: GabionInput): number[] {
  const n = Math.max(1, Math.round(g.n));
  return Array.from({ length: n }, (_, k) => Math.max(g.b0 - k * g.step, 0.5));
}
/** tipologías en las que se puede activar la piscina (pantalla en voladizo) */
export const canPool = (t: WallType) => t === 'cantilever' || t === 'masonryReinforced';
export const isMasonry = (t: WallType) => t === 'gravityMasonry' || isMasonryStem(t);
