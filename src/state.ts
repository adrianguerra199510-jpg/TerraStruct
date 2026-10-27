import { FootingInput, defaultFooting, defaultColumn } from './core/footing';
import { WallInput, WallType, defaultWall } from './core/wallTypes';
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
  return (['cantilever', 'counterfortInt', 'counterfortExt', 'gravityConcrete', 'gravityMasonry', 'masonryReinforced', 'gabion'] as WallType[]).map((t) => ({ type: t, make: () => defaultWall(t) }));
}
