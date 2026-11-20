// Núcleo del servidor MCP de TerraStruct: resolución de entradas, análisis, resúmenes, dibujos, memorias y archivos de proyecto.
// No depende del navegador; la rasterización de figuras se inyecta con setRasterizer (ver raster-node.ts).
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

import { FootingInput, analyzeFooting, FootingResults } from '../src/core/footing';
import { autoSizeFooting } from '../src/core/footingAuto';
import { WallInput, WallType, WALL_TYPES, defaultWall } from '../src/core/wallTypes';
import { analyzeWall, WallResults } from '../src/core/wall';
import { PileInput, PileKind, defaultPileInput } from '../src/core/pileTypes';
import { analyzePile, autoSizePile, PileResults } from '../src/core/pile';
import { footingPresetPoly } from '../src/core/shapes';
import { makeFmt, UnitSystem, Fmt } from '../src/core/units';
import {
  Project, ProjectInfo, defaultInfo, deepMerge, normalizeFooting, normalizePile, normalizeProject, normalizeWall, newProject, uid,
  exampleFootings, exampleWalls, examplePiles,
} from '../src/state';
import { reportForFooting, reportForPile, reportForWall, reportForProject, Format } from '../src/report';
import { ReportDoc } from '../src/report/model';
import { makePdfBytes } from './pdf-node';
import { makeDocxBlob } from '../src/report/docx';
import { footingPlanSvg, footingSectionSvg, footingRebarPlanSvg, footingDiagramSvg } from '../src/draw/footingDraw';
import { wallSectionSvg, wallPlanSvg, wallElevationSvg, wallDiagramFigures } from '../src/draw/wallDraw';
import { pilePlanSvg, pileSectionSvg, pileRebarPlanSvg, pileStmPlanSvg, pileStmElevationSvg, pileProfileSvg } from '../src/draw/pileDraw';
import { pileStm3dSvg } from '../src/draw/pile3d';

export type Kind = 'footing' | 'wall' | 'pile';
export const KINDS: Kind[] = ['footing', 'wall', 'pile'];
export const KIND_LABEL: Record<Kind, string> = { footing: 'Fundación (zapata)', wall: 'Muro de retención', pile: 'Pilotes y cabezal' };

type AnyInput = FootingInput | WallInput | PileInput;

// ---------------------------------------------------------------------------
// Ejemplos y entradas
// ---------------------------------------------------------------------------
export interface ExampleRef {
  kind: Kind;
  index: number;
  title: string;
  desc: string;
}

export function listExamples(kind?: Kind): ExampleRef[] {
  const out: ExampleRef[] = [];
  if (!kind || kind === 'footing') exampleFootings().forEach((e, i) => out.push({ kind: 'footing', index: i, title: e.title, desc: e.desc }));
  if (!kind || kind === 'wall')
    exampleWalls().forEach((e, i) => {
      const t = WALL_TYPES.find((w) => w.id === e.type);
      out.push({ kind: 'wall', index: i, title: e.title ?? t?.label ?? e.type, desc: e.desc ?? t?.desc ?? '' });
    });
  if (!kind || kind === 'pile') examplePiles().forEach((e, i) => out.push({ kind: 'pile', index: i, title: e.title, desc: e.desc }));
  return out;
}

function findExample<T>(list: { title?: string; make: () => T }[], ex: number | string, kind: Kind): T {
  if (typeof ex === 'number' || /^\d+$/.test(String(ex))) {
    const e = list[Number(ex)];
    if (!e) throw new Error(`No existe el ejemplo ${ex} de ${kind}. Use list_examples.`);
    return e.make();
  }
  const q = String(ex).toLowerCase();
  const all = listExamples(kind);
  const i = all.findIndex((e) => e.title.toLowerCase() === q);
  const j = i >= 0 ? i : all.findIndex((e) => e.title.toLowerCase().includes(q));
  if (j < 0) throw new Error(`No se encontró el ejemplo «${ex}» de ${kind}. Use list_examples.`);
  return list[j].make();
}

export interface InputSpec {
  kind: Kind;
  /** índice o título de un ejemplo como base */
  example?: number | string;
  /** muros: tipología base cuando no se da ejemplo */
  wall_type?: WallType;
  /** pilotes: tipo de pilote base cuando no se da ejemplo */
  pile_kind?: PileKind;
  /** valores que se superponen a la base (objeto parcial; los arreglos se reemplazan completos) */
  input?: Record<string, any>;
}

/** Construye la entrada completa: base (ejemplo o por defecto) + cambios parciales, normalizada como al abrir un archivo. */
export function resolveInput(spec: InputSpec): AnyInput {
  const over = spec.input ?? {};
  if (spec.kind === 'footing') {
    const base = spec.example !== undefined ? findExample(exampleFootings(), spec.example, 'footing') : exampleFootings()[0].make();
    const merged: any = deepMerge(base, over);
    if (Array.isArray(over.columns)) merged.columns = over.columns;
    const f = normalizeFooting(merged);
    // si cambió la forma o sus parámetros y no se dieron vértices, se regeneran
    if (f.preset !== 'poly' && !Array.isArray(over.vertices) && (over.preset !== undefined || over.presetParams !== undefined)) {
      f.vertices = footingPresetPoly(f.preset, f.presetParams);
    }
    return f;
  }
  if (spec.kind === 'wall') {
    const t: WallType | undefined = over.type ?? spec.wall_type;
    const base = spec.example !== undefined ? findExample(exampleWalls(), spec.example, 'wall') : defaultWall(t ?? 'cantilever');
    if (t && base.type !== t) {
      // cambio de tipología: se parte de los valores por defecto de la nueva tipología
      return normalizeWall(deepMerge(defaultWall(t), { ...over, type: t }));
    }
    return normalizeWall(deepMerge(base, over));
  }
  const base = spec.example !== undefined ? findExample(examplePiles(), spec.example, 'pile') : defaultPileInput(over?.pile?.kind ?? spec.pile_kind ?? 'concrete');
  return normalizePile(deepMerge(base, over));
}

export function normalizeFor(kind: Kind, raw: any): AnyInput {
  return kind === 'footing' ? normalizeFooting(raw) : kind === 'wall' ? normalizeWall(raw) : normalizePile(raw);
}

// ---------------------------------------------------------------------------
// Análisis y resúmenes
// ---------------------------------------------------------------------------
export type AnyResults = FootingResults | WallResults | PileResults;

export function analyze(kind: Kind, inp: AnyInput): AnyResults {
  if (kind === 'footing') return analyzeFooting(inp as FootingInput);
  if (kind === 'wall') return analyzeWall(inp as WallInput);
  return analyzePile(inp as PileInput);
}

const r3 = (v: number) => (isFinite(v) ? Math.round(v * 1000) / 1000 : v > 0 ? 'inf' : v < 0 ? '-inf' : null);

export interface CheckRow {
  name: string;
  ratio: number | string | null;
  ok: boolean;
  advisory?: boolean;
  detail: string;
}

export interface Summary {
  kind: Kind;
  name: string;
  ok: boolean;
  units: UnitSystem;
  failing: string[];
  key: Record<string, string>;
  checks: CheckRow[];
  warnings: string[];
  rebar?: { head: string[]; rows: string[][] }[];
}

function rebarTables(doc: ReportDoc): Summary['rebar'] {
  const t = doc.blocks.filter((b): b is Extract<typeof b, { t: 'table' }> => b.t === 'table' && /armado|refuerzo|acero/i.test(b.caption ?? ''));
  return t.map((b) => ({ head: b.head, rows: b.rows }));
}

export function summarize(kind: Kind, inp: AnyInput, res: AnyResults, units: UnitSystem = 'SI', withRebar = true): Summary {
  const fmt = makeFmt(units);
  const checks: CheckRow[] = (res.checks as any[]).map((c) => ({ name: c.name, ratio: r3(c.ratio), ok: !!c.ok, ...(c.advisory ? { advisory: true } : {}), detail: c.detail }));
  const failing = checks.filter((c) => !c.ok && !c.advisory).map((c) => c.name);
  const key: Record<string, string> = {};
  let doc: ReportDoc | null = null;
  if (kind === 'footing') {
    const r = res as FootingResults;
    const f = inp as FootingInput;
    key['Área'] = `${fmt.d(r.area, 2)} m²`;
    key['Dimensiones (caja)'] = `${fmt.d(r.bbox.xmax - r.bbox.xmin, 2)} × ${fmt.d(r.bbox.ymax - r.bbox.ymin, 2)} m`;
    key['Espesor h'] = fmt.u('len', f.h, 2);
    key['Desplante Df'] = fmt.u('len', f.Df, 2);
    key['Columnas'] = String(f.columns.length);
    if (r.govPressure) key['Presión máxima'] = `${fmt.u('press', r.govPressure.sol.qmax)} (${r.govPressure.combo.name}; adm. ${fmt.u('press', r.govPressure.qaAllow)})`;
    key['Barras inferiores'] = `${f.barX} en X, ${f.barY} en Y`;
    key['Volumen de concreto'] = `${fmt.d(r.concreteVolume, 2)} m³`;
    key['Acero'] = `${fmt.d(r.steelKg, 0)} kg`;
    if (withRebar) doc = reportForFooting(f, fmt, defaultInfo());
  } else if (kind === 'wall') {
    const r = res as WallResults;
    const w = inp as WallInput;
    const t = WALL_TYPES.find((x) => x.id === w.type);
    key['Tipología'] = t?.label ?? w.type;
    key['Altura de pantalla H'] = fmt.u('len', w.H, 2);
    key['Base B'] = fmt.u('len', r.geom.B, 2);
    key['FS volcamiento (estático)'] = fmt.d(r.staticCase.FSot, 2);
    key['FS deslizamiento (estático)'] = fmt.d(r.staticCase.FSsl, 2);
    key['Presión máx. (estático)'] = `${fmt.u('press', r.staticCase.qmax)} (adm. ${fmt.u('press', r.staticCase.qaAllow)})`;
    if (r.seismicCase) {
      key['FS volcamiento (sismo)'] = fmt.d(r.seismicCase.FSot, 2);
      key['FS deslizamiento (sismo)'] = fmt.d(r.seismicCase.FSsl, 2);
    }
    key['Concreto'] = `${fmt.d(r.concreteVolume, 2)} m³/m`;
    key['Peso del muro'] = fmt.u('lforce', r.weightWall);
    if (withRebar) doc = reportForWall(w, fmt, defaultInfo());
  } else {
    const r = res as PileResults;
    const p = inp as PileInput;
    key['Pilotes'] = `${r.n} × ${p.pile.kind === 'concrete' ? `Ø${fmt.d(p.pile.D * 100, 0)} cm` : p.pile.kind === 'pipe' ? `tubo Ø${fmt.d(p.pile.D * 1000, 0)} mm` : p.pile.hp}, L = ${fmt.u('len', p.pile.L, 1)}`;
    key['Cabezal'] = `${fmt.d(r.capRect.B, 2)} × ${fmt.d(r.capRect.L, 2)} × ${fmt.d(p.cap.h, 2)} m`;
    key['Capacidad admisible por pilote (compresión)'] = fmt.u('force', r.QaCeff);
    const worst = [...r.service].sort((a, b) => b.Rmax - a.Rmax)[0];
    if (worst) key['Reacción máxima (servicio)'] = `${fmt.u('force', worst.Rmax)} (${worst.combo.name})`;
    key['Deflexión lateral'] = `${fmt.d(r.lateral.y * 1000, 1)} mm (${r.lateral.combo}; modelo ${r.lateral.model})`;
    key['Concreto del cabezal'] = `${fmt.d(r.concreteVolume, 2)} m³`;
    key['Longitud total de pilotes'] = `${fmt.d(r.pileLength, 1)} m`;
    if (withRebar) doc = reportForPile(p, fmt, defaultInfo());
  }
  return {
    kind, name: (inp as any).name, ok: !!res.ok, units, failing, key, checks, warnings: res.warnings,
    ...(doc ? { rebar: rebarTables(doc) } : {}),
  };
}

/** Resumen en texto legible (Markdown) para la respuesta de la herramienta. */
export function summaryText(s: Summary): string {
  const L: string[] = [];
  L.push(`## ${KIND_LABEL[s.kind]}: ${s.name}`);
  L.push(s.ok ? '**Estado: CUMPLE todas las verificaciones.**' : `**Estado: NO CUMPLE** (${s.failing.join('; ')}).`);
  L.push('');
  for (const [k, v] of Object.entries(s.key)) L.push(`- ${k}: ${v}`);
  L.push('', '### Verificaciones', '| Verificación | Relación D/C | Estado | Detalle |', '|---|---|---|---|');
  for (const c of s.checks) L.push(`| ${c.name} | ${c.ratio ?? '—'} | ${c.ok ? 'OK' : c.advisory ? 'Aviso' : 'NO CUMPLE'} | ${c.detail.replace(/\|/g, '/').replace(/\n/g, ' ')} |`);
  if (s.warnings.length) {
    L.push('', '### Advertencias');
    for (const w of s.warnings) L.push(`- ${w}`);
  }
  for (const t of s.rebar ?? []) {
    L.push('', '### Cuadro de armado', '| ' + t.head.join(' | ') + ' |', '|' + t.head.map(() => '---').join('|') + '|');
    for (const r of t.rows) L.push('| ' + r.join(' | ') + ' |');
  }
  return L.join('\n');
}

/** Serialización segura de resultados completos: sin funciones ni ciclos, arreglos largos recortados y números redondeados. */
export function safeJson(v: any, maxArray = 60, maxDepth = 7): any {
  const seen = new WeakSet();
  const walk = (x: any, d: number): any => {
    if (x === null || x === undefined) return x;
    if (typeof x === 'number') return r3(x);
    if (typeof x === 'string' || typeof x === 'boolean') return x;
    if (typeof x === 'function') return undefined;
    if (typeof x !== 'object') return String(x);
    if (seen.has(x)) return '[ref]';
    if (d > maxDepth) return '[…]';
    seen.add(x);
    if (Array.isArray(x)) {
      const a = x.slice(0, maxArray).map((e) => walk(e, d + 1));
      if (x.length > maxArray) a.push(`[… ${x.length - maxArray} más]`);
      return a;
    }
    const o: any = {};
    for (const k of Object.keys(x)) {
      if (k === 'inp') continue; // la entrada ya se conoce
      const w = walk(x[k], d + 1);
      if (w !== undefined) o[k] = w;
    }
    return o;
  };
  return walk(v, 0);
}

// ---------------------------------------------------------------------------
// Dimensionamiento automático
// ---------------------------------------------------------------------------
export function autoDesign(kind: Kind, inp: AnyInput): { input: AnyInput; ok: boolean; note: string } {
  if (kind === 'footing') return autoSizeFooting(inp as FootingInput);
  if (kind === 'pile') return autoSizePile(inp as PileInput);
  throw new Error('El dimensionamiento automático está disponible para zapatas (una columna) y pilotes/cabezales. Para muros, ajuste la geometría y vuelva a analizar.');
}

// ---------------------------------------------------------------------------
// Dibujos
// ---------------------------------------------------------------------------
export const VIEWS: Record<Kind, Record<string, string>> = {
  footing: {
    plan: 'Planta con columnas, presiones y perímetros críticos',
    section_x: 'Corte en X', section_y: 'Corte en Y',
    rebar_bottom: 'Armado inferior en planta', rebar_top: 'Armado superior en planta',
    moment_x: 'Diagrama de momento en X', moment_y: 'Diagrama de momento en Y', shear_x: 'Diagrama de cortante en X', shear_y: 'Diagrama de cortante en Y',
  },
  wall: {
    section: 'Sección con empujes, presiones y cotas', section_rebar: 'Sección con el armado',
    plan: 'Planta', elevation: 'Alzado', diagrams: 'Diagramas de momento y cortante (pantalla, pie, talón, contrafuerte)',
  },
  pile: {
    plan: 'Planta del cabezal con reacciones', section: 'Corte del cabezal y pilotes',
    rebar_bottom: 'Armado inferior del cabezal', rebar_top: 'Armado superior del cabezal',
    stm_plan: 'Puntales y tirantes en planta', stm_x: 'Puntales y tirantes en elevación X', stm_y: 'Puntales y tirantes en elevación Y', stm_3d: 'Modelo de puntales y tirantes en 3D',
    profile: 'Perfil del suelo y pilote',
  },
};

export function drawViews(kind: Kind, inp: AnyInput, res: AnyResults, view: string, units: UnitSystem = 'SI'): { title: string; svg: string }[] {
  const fmt: Fmt = makeFmt(units);
  const v = VIEWS[kind][view];
  if (!v) throw new Error(`Vista «${view}» no disponible para ${kind}. Opciones: ${Object.keys(VIEWS[kind]).join(', ')}`);
  const one = (svg: string) => [{ title: v, svg }];
  if (kind === 'footing') {
    const f = inp as FootingInput, r = res as FootingResults;
    switch (view) {
      case 'plan': return one(footingPlanSvg(f, r, { W: 820, H: 620, fmt, combo: r.govPressure, showCritical: true, showDims: true, showPressure: true }));
      case 'section_x': return one(footingSectionSvg(f, r, { fmt, dir: 'x' }));
      case 'section_y': return one(footingSectionSvg(f, r, { fmt, dir: 'y' }));
      case 'rebar_bottom': return one(footingRebarPlanSvg(f, r, { fmt, layer: 'bottom' }));
      case 'rebar_top': return one(footingRebarPlanSvg(f, r, { fmt, layer: 'top' }));
      default: {
        const [k, dir] = view.split('_') as ['moment' | 'shear', 'x' | 'y'];
        return one(footingDiagramSvg(f, r, { dir, kind: k === 'moment' ? 'M' : 'V', fmt }));
      }
    }
  }
  if (kind === 'wall') {
    const r = res as WallResults;
    switch (view) {
      case 'section': return one(wallSectionSvg(r, { fmt, showLoads: true, showPressure: true, showDims: true }));
      case 'section_rebar': return one(wallSectionSvg(r, { fmt, showRebar: true, showDims: true }));
      case 'plan': return one(wallPlanSvg(r, { fmt }));
      case 'elevation': return one(wallElevationSvg(r, { fmt }));
      default: {
        const figs = wallDiagramFigures(r, { fmt });
        if (!figs.length) throw new Error('Este muro no tiene diagramas de esfuerzos.');
        return figs.map((g) => ({ title: g.title, svg: g.svg }));
      }
    }
  }
  const p = inp as PileInput, r = res as PileResults;
  switch (view) {
    case 'plan': return one(pilePlanSvg(p, r, { fmt, combo: [...r.service].sort((a, b) => b.Rmax - a.Rmax)[0] ?? null, showDims: true }));
    case 'section': return one(pileSectionSvg(p, r, { fmt }));
    case 'rebar_bottom': return one(pileRebarPlanSvg(p, r, { fmt, layer: 'bottom' }));
    case 'rebar_top': return one(pileRebarPlanSvg(p, r, { fmt, layer: 'top' }));
    case 'stm_plan': return one(pileStmPlanSvg(p, r, { fmt }));
    case 'stm_x': return one(pileStmElevationSvg(p, r, { fmt, axis: 'x' }));
    case 'stm_y': return one(pileStmElevationSvg(p, r, { fmt, axis: 'y' }));
    case 'stm_3d': return one(pileStm3dSvg(p, r, { fmt, labels: true }));
    default: return one(pileProfileSvg(p, r, { fmt }));
  }
}

// ---------------------------------------------------------------------------
// Memorias de cálculo
// ---------------------------------------------------------------------------
export async function renderDoc(doc: ReportDoc, format: Format): Promise<Uint8Array> {
  if (format === 'pdf') return makePdfBytes(doc);
  return new Uint8Array(await (await makeDocxBlob(doc)).arrayBuffer());
}

export function elementReport(kind: Kind, inp: AnyInput, units: UnitSystem, info: ProjectInfo): ReportDoc {
  const fmt = makeFmt(units);
  if (kind === 'footing') return reportForFooting(inp as FootingInput, fmt, info);
  if (kind === 'wall') return reportForWall(inp as WallInput, fmt, info);
  return reportForPile(inp as PileInput, fmt, info);
}

export function projectReport(p: Project): ReportDoc {
  return reportForProject(p, makeFmt(p.units));
}

export async function writeOut(path: string, data: Uint8Array | string): Promise<string> {
  const abs = resolve(path);
  await mkdir(dirname(abs), { recursive: true });
  await writeFile(abs, data);
  return abs;
}

// ---------------------------------------------------------------------------
// Archivos de proyecto (.terrastruct.json, los mismos que abre y guarda la aplicación)
// ---------------------------------------------------------------------------
const listKey = (k: Kind) => (k === 'footing' ? 'footings' : k === 'wall' ? 'walls' : 'piles') as 'footings' | 'walls' | 'piles';

export async function loadProjectFile(path: string, createIfMissing = false): Promise<Project> {
  const abs = resolve(path);
  if (!existsSync(abs)) {
    if (!createIfMissing) throw new Error(`No existe el archivo de proyecto ${abs}`);
    const p = newProject();
    p.footings = [];
    p.walls = [];
    return p;
  }
  return normalizeProject(JSON.parse(await readFile(abs, 'utf8')));
}

export async function saveProjectFile(path: string, p: Project): Promise<string> {
  return writeOut(path, JSON.stringify(p, null, 2));
}

export function projectElements(p: Project): { kind: Kind; id: string; name: string; data: AnyInput }[] {
  return [
    ...p.footings.map((x) => ({ kind: 'footing' as Kind, id: x.id, name: x.data.name, data: x.data as AnyInput })),
    ...p.piles.map((x) => ({ kind: 'pile' as Kind, id: x.id, name: x.data.name, data: x.data as AnyInput })),
    ...p.walls.map((x) => ({ kind: 'wall' as Kind, id: x.id, name: x.data.name, data: x.data as AnyInput })),
  ];
}

export function findElement(p: Project, kind: Kind | undefined, name: string) {
  const all = projectElements(p).filter((e) => !kind || e.kind === kind);
  const q = name.toLowerCase();
  const hit = all.find((e) => e.id === name || e.name.toLowerCase() === q) ?? all.find((e) => e.name.toLowerCase().includes(q));
  if (!hit) throw new Error(`No se encontró el elemento «${name}». Elementos: ${all.map((e) => `${e.name} (${e.kind})`).join(', ') || 'ninguno'}`);
  return hit;
}

/** Inserta o reemplaza (por nombre) un elemento en el proyecto. */
export function upsertElement(p: Project, kind: Kind, data: AnyInput): 'added' | 'replaced' {
  const list = p[listKey(kind)] as { id: string; data: AnyInput }[];
  const i = list.findIndex((x) => x.data.name === data.name);
  if (i >= 0) {
    list[i] = { id: list[i].id, data };
    return 'replaced';
  }
  list.push({ id: uid(), data });
  return 'added';
}

export function removeElement(p: Project, kind: Kind | undefined, name: string): { kind: Kind; name: string } {
  const e = findElement(p, kind, name);
  const key = listKey(e.kind);
  (p as any)[key] = (p[key] as { id: string }[]).filter((x) => x.id !== e.id);
  return { kind: e.kind, name: e.name };
}

export function setInfo(p: Project, info: Partial<ProjectInfo>, units?: UnitSystem) {
  p.info = deepMerge(p.info, info);
  if (units) p.units = units;
}
