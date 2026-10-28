import { FootingInput, defaultFooting, defaultColumn } from './core/footing';
import { WallInput, WallType, defaultWall } from './core/wallTypes';
import { findCapDesign, analyzePile } from './core/pile';
import { PileInput, PileKind, defaultPileInput, defaultLayers, standardLayout } from './core/pileTypes';
import { UnitSystem } from './core/units';
import { footingPresetPoly, defaultPresetParams } from './core/shapes';

export interface ProjectInfo {
  name: string;
  client: string;
  location: string;
  engineer: string;
  license: string;
  date: string;
  revision: string;
  notes: string;
}

export interface Item<T> {
  id: string;
  data: T;
}

export interface Project {
  version: 1;
  info: ProjectInfo;
  footings: Item<FootingInput>[];
  walls: Item<WallInput>[];
  piles: Item<PileInput>[];
  units: UnitSystem;
  theme: 'light' | 'dark';
}

export const uid = () => Math.random().toString(36).slice(2, 9);

export function today(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function defaultInfo(): ProjectInfo {
  return { name: 'Proyecto sin título', client: '', location: '', engineer: '', license: '', date: today(), revision: 'A', notes: '' };
}

export function newProject(): Project {
  return {
    version: 1,
    info: defaultInfo(),
    footings: [{ id: uid(), data: defaultFooting() }],
    walls: [{ id: uid(), data: defaultWall('cantilever') }],
    piles: [],
    units: 'SI',
    theme: 'light',
  };
}

/** Mezcla recursiva: los valores guardados sobrescriben los por defecto (así los proyectos viejos no se rompen). */
export function deepMerge<T>(base: T, over: any): T {
  if (over === undefined || over === null) return base;
  if (Array.isArray(base)) return (Array.isArray(over) ? over : base) as any;
  if (typeof base === 'object' && base !== null) {
    const out: any = { ...(base as any) };
    for (const k of Object.keys(over)) out[k] = k in (base as any) ? deepMerge((base as any)[k], over[k]) : over[k];
    return out;
  }
  return (typeof over === typeof base ? over : base) as T;
}

export function normalizeProject(raw: any): Project {
  const base = newProject();
  const p: Project = { ...base, units: raw?.units === 'TEC' ? 'TEC' : 'SI', theme: raw?.theme === 'dark' ? 'dark' : 'light' };
  p.info = deepMerge(base.info, raw?.info);
  p.footings = Array.isArray(raw?.footings)
    ? raw.footings.map((it: any) => ({ id: it.id ?? uid(), data: normalizeFooting(it.data) }))
    : base.footings;
  p.walls = Array.isArray(raw?.walls)
    ? raw.walls.map((it: any) => ({ id: it.id ?? uid(), data: normalizeWall(it.data) }))
    : base.walls;
  p.piles = Array.isArray(raw?.piles) ? raw.piles.map((it: any) => ({ id: it.id ?? uid(), data: normalizePile(it.data) })) : [];
  return p;
}

export function normalizeFooting(raw: any): FootingInput {
  const base = defaultFooting();
  const f = deepMerge(base, raw);
  if (Array.isArray(raw?.columns)) {
    f.columns = raw.columns.map((c: any, i: number) => deepMerge(defaultColumn(c.id ?? 'c' + (i + 1), c.name ?? 'C' + (i + 1)), c));
  }
  if (Array.isArray(raw?.vertices)) f.vertices = raw.vertices;
  if (Array.isArray(raw?.combos)) f.combos = raw.combos;
  return f;
}

export function normalizePile(raw: any): PileInput {
  const k: PileKind = raw?.pile?.kind ?? 'concrete';
  return deepMerge(defaultPileInput(k), raw);
}

/** Ajusta espesor y barra del cabezal para que el ejemplo cumpla. */
function fitCap(i: PileInput): PileInput {
  try {
    if (analyzePile(i).ok) return i;
    const d = findCapDesign(i, true);
    if (d) return { ...i, cap: { ...i.cap, h: d.h, barX: d.bar, barY: d.bar, barTopX: d.bar, barTopY: d.bar } };
  } catch {
    /* se deja el ejemplo tal cual */
  }
  return i;
}

export function examplePiles(): { title: string; desc: string; make: () => PileInput }[] {
  const raw = [
    { title: 'Cabezal de 4 pilotes de concreto', desc: 'Pilotes preexcavados Ø50 cm de 18 m, columna 50×50 cm con momento sísmico.', make: () => defaultPileInput('concrete') },
    {
      title: 'Cabezal con pilotes preexcavados en roca (socket)',
      desc: 'Pilotes Ø80 cm con 4 m de empotramiento en roca de qu = 25 MPa.',
      make: () => {
        const i = defaultPileInput('concrete');
        i.name = 'Cabezal CP-R';
        i.pile.D = 0.8;
        i.pile.nBars = 12;
        i.pile.L = 10;
        i.layout = { ...i.layout, sx: 2.4, sy: 2.4 };
        i.cap.edge = 0.7;
        i.cap.barX = '#6';
        i.cap.barY = '#6';
        i.geo.layers = [
          { ...defaultLayers()[0], name: 'Arcilla blanda', thk: 6, su: 35, gamma: 8 },
          { ...defaultLayers()[0], name: 'Roca sana (socket)', kind: 'rock', thk: 12, qu: 25, rqd: 80, rough: true, jointS: 0.4, aperture: 1, Es: 2000000, fsMax: 3000, gamma: 14, Cc: 0 },
        ];
        return i;
      },
    },
    {
      title: 'Cabezal triangular de 3 pilotes',
      desc: 'Contorno envolvente con esquinas vivas para 3 pilotes en triángulo.',
      make: () => {
        const i = defaultPileInput('concrete');
        i.name = 'Cabezal CP-3';
        i.layout = standardLayout(3, 1.5);
        i.cap.shape = 'miter';
        i.cap.cornerR = 0.4;
        i.cap.edge = 0.6;
        i.combos = i.combos.map((c) => ({ ...c, P: c.P * 0.6, My: c.My * 0.6, Vx: c.Vx * 0.6 }));
        return i;
      },
    },
    {
      title: 'Cabezal circular de 7 pilotes',
      desc: 'Anillo de 6 pilotes más uno central en un cabezal circular.',
      make: () => {
        const i = defaultPileInput('concrete');
        i.name = 'Cabezal CP-C7';
        i.layout = standardLayout(7, 1.5);
        i.cap.shape = 'circle';
        i.cap.edge = 0.6;
        i.cap.h = 1.2;
        i.combos = i.combos.map((c) => ({ ...c, P: c.P * 1.2, My: c.My * 1.0, Vx: c.Vx * 1.0 }));
        return i;
      },
    },
    {
      title: 'Cabezal en L de esquina',
      desc: 'Cabezal en forma de L con 5 pilotes junto a un lindero.',
      make: () => {
        const i = defaultPileInput('concrete');
        i.name = 'Cabezal CP-L';
        i.layout = { ...i.layout, mode: 'custom', pts: [{ x: -1.5, y: -1.5 }, { x: 0, y: -1.5 }, { x: 1.5, y: -1.5 }, { x: -1.5, y: 0 }, { x: -1.5, y: 1.5 }] };
        i.cap.edge = 0.6;
        i.cap.shape = 'L';
        i.cap.preset = { ...i.cap.preset, B: 4, L: 4, t1: 1.6, t2: 1.6 };
        i.column = { ...i.column, x: -0.9, y: -0.9 };
        i.combos = i.combos.map((c) => ({ ...c, P: c.P * 0.45, My: c.My * 0.3, Vx: c.Vx * 0.3 }));
        return i;
      },
    },
    {
      title: 'Cabezal con pilotes de tubo de acero',
      desc: 'Tubo Ø356 mm (e = 9.5 mm), 10 pilotes hincados.',
      make: () => {
        const i = defaultPileInput('pipe');
        i.name = 'Cabezal CP-T';
        i.layout = { ...i.layout, mode: 'custom', pts: [0, 1].flatMap((j) => [0, 1, 2, 3, 4].map((k) => ({ x: (k - 2) * 1.1, y: (j - 0.5) * 1.1 }))) };
        i.cap.h = 0.9;
        i.cap.edge = 0.5;
        i.combos = i.combos.map((c) => ({ ...c, P: c.P * 0.85, My: c.My * 0.85, Vx: c.Vx * 0.85 }));
        return i;
      },
    },
    {
      title: 'Cabezal con pilotes H de acero',
      desc: 'Perfiles HP12x74 hincados a rechazo, grupo de 6.',
      make: () => {
        const i = defaultPileInput('hpile');
        i.name = 'Cabezal CP-H';
        i.layout = { ...i.layout, mode: 'grid', nx: 3, ny: 2, sx: 1.1, sy: 1.1 };
        i.cap.h = 0.9;
        i.cap.edge = 0.5;
        i.geo.mode = 'user';
        i.geo.QaC = 600;
        i.geo.QaT = 150;
        return i;
      },
    },
  ];
  return raw.map((e) => ({ ...e, make: () => fitCap(e.make()) }));
}

export function normalizeWall(raw: any): WallInput {
  const t: WallType = raw?.type ?? 'cantilever';
  return deepMerge(defaultWall(t), raw);
}

const KEY = 'terrastruct.project.v1';

export function loadProject(): Project {
  try {
    const s = localStorage.getItem(KEY);
    if (s) return normalizeProject(JSON.parse(s));
  } catch {
    /* almacenamiento no disponible */
  }
  return newProject();
}

export function saveProject(p: Project) {
  try {
    localStorage.setItem(KEY, JSON.stringify(p));
  } catch {
    /* sin espacio o bloqueado */
  }
}

// ---------------------------------------------------------------------------
// Ejemplos
// ---------------------------------------------------------------------------
export function exampleFootings(): { title: string; desc: string; make: () => FootingInput }[] {
  return [
    {
      title: 'Zapata aislada rectangular',
      desc: 'Columna 40×40 cm con carga axial y momento sísmico.',
      make: () => defaultFooting(),
    },
    {
      title: 'Zapata combinada (2 columnas)',
      desc: 'Dos columnas de distinta carga sobre una zapata rectangular.',
      make: () => {
        const f = defaultFooting();
        f.name = 'Zapata combinada ZC-1';
        const pp = { ...defaultPresetParams(), B: 5.2, L: 2.4 };
        f.preset = 'rect';
        f.presetParams = pp;
        f.vertices = footingPresetPoly('rect', pp);
        f.h = 0.8;
        const a = defaultColumn('c1', 'C1', -1.4, 0);
        const b = defaultColumn('c2', 'C2', 1.4, 0);
        b.loads.D.P = 900;
        b.loads.L.P = 450;
        b.geom.b = 0.5;
        b.geom.h = 0.5;
        f.columns = [a, b];
        f.qa = 220;
        return f;
      },
    },
    {
      title: 'Zapata en L con columna en L',
      desc: 'Zapata de esquina con columna en forma de L y flexión biaxial.',
      make: () => {
        const f = defaultFooting();
        f.name = 'Zapata esquinera ZL-1';
        const pp = { ...defaultPresetParams(), B: 3.4, L: 3.4, t1: 1.7, t2: 1.7 };
        f.preset = 'L';
        f.presetParams = pp;
        f.vertices = footingPresetPoly('L', pp);
        f.h = 0.7;
        const c = defaultColumn('c1', 'C1', -0.85, -0.85, 'L');
        c.geom.b = 0.55;
        c.geom.h = 0.55;
        c.geom.t = 0.2;
        c.loads.D.Mx = 25;
        c.loads.D.My = -18;
        f.columns = [c];
        return f;
      },
    },
    {
      title: 'Zapata circular con columna circular',
      desc: 'Fundación circular de 2.8 m de diámetro.',
      make: () => {
        const f = defaultFooting();
        f.name = 'Zapata circular ZC-2';
        const pp = { ...defaultPresetParams(), D: 2.8 };
        f.preset = 'circle';
        f.presetParams = pp;
        f.vertices = footingPresetPoly('circle', pp);
        const c = defaultColumn('c1', 'C1', 0, 0, 'circle');
        c.geom.D = 0.5;
        f.columns = [c];
        return f;
      },
    },
    {
      title: 'Zapata trapezoidal con columna en T',
      desc: 'Zapata de colindancia con columna excéntrica en forma de T.',
      make: () => {
        const f = defaultFooting();
        f.name = 'Zapata de medianería ZM-1';
        const pp = { ...defaultPresetParams(), B: 2.2, L: 3.2, b2: 1.4 };
        f.preset = 'trapezoid';
        f.presetParams = pp;
        f.vertices = footingPresetPoly('trapezoid', pp);
        f.h = 0.7;
        const c = defaultColumn('c1', 'C1', 0, -0.7, 'T');
        c.geom.b = 0.6;
        c.geom.h = 0.5;
        c.geom.t = 0.2;
        c.geom.tw = 0.2;
        f.columns = [c];
        return f;
      },
    },
  ];
}

export function exampleWalls(): { type: WallType; make: () => WallInput }[] {
  return (['cantilever', 'counterfortInt', 'counterfortExt', 'gravityConcrete', 'gravityMasonry', 'masonryReinforced', 'masonryCfInt', 'masonryCfExt', 'gabion'] as WallType[]).map((t) => ({ type: t, make: () => defaultWall(t) }));
}
