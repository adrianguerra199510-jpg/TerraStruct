// Servidor MCP de TerraStruct (stdio): permite a Claude u otro cliente MCP analizar y diseñar zapatas, muros y pilotes,
// obtener dibujos, generar memorias de cálculo PDF/Word y editar proyectos .terrastruct.json que abre la aplicación.
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import wasmB64 from 'virtual:resvg-wasm';
import { initNodeRaster, svgToPngNode } from './raster-node';
import {
  Kind, KINDS, KIND_LABEL, VIEWS, listExamples, resolveInput, analyze, summarize, summaryText, safeJson, autoDesign, drawViews,
  renderDoc, elementReport, projectReport, writeOut, loadProjectFile, saveProjectFile, projectElements, findElement, upsertElement,
  removeElement, setInfo, normalizeFor,
} from './engine';
import { WALL_TYPES } from '../src/core/wallTypes';
import { defaultInfo, deepMerge } from '../src/state';

declare const __TS_VERSION__: string;
const VERSION = typeof __TS_VERSION__ === 'string' ? __TS_VERSION__ : '1.0.0';

const INSTRUCTIONS = `TerraStruct analiza y diseña fundaciones (zapatas de cualquier forma, ACI 318), pilotes con cabezal y muros de retención, y genera memorias de cálculo en PDF y Word.

Convenciones (todas las entradas en SI): longitudes en m, fuerzas en kN, momentos en kN·m, presiones en kPa, f'c y fy en MPa, pesos unitarios en kN/m³, ángulos en grados. P positiva = compresión. Mx aumenta la presión hacia +y y My hacia +x. Los muros se calculan por metro lineal.
El parámetro "units" (SI o TEC = tonf, kgf/cm²) solo cambia cómo se muestran los resultados.

Flujo recomendado:
1. list_examples / get_input para ver todos los campos de la entrada de un tipo de elemento (footing, wall, pile).
2. analyze con "example" (o los valores por defecto) como base y "input" con solo los campos que cambian. Los objetos se mezclan; los arreglos (columns, combos, layers, vertices…) se reemplazan completos.
3. auto_design para que el programa dimensione una zapata de una columna o el grupo de pilotes y su cabezal.
4. draw para ver figuras (planta, cortes, armado, diagramas) y report para la memoria PDF/Word.
5. Las herramientas project_* leen y escriben archivos .terrastruct.json, los mismos que la aplicación abre con «Abrir».
Los resultados son una ayuda de cálculo y deben ser revisados por un ingeniero responsable.`;

const FIELD_GUIDE: Record<Kind, string> = {
  footing: `Campos principales: name; preset (rect, circle, ngon, L, T, trapezoid, triangle, poly) y presetParams (B, L, D…, m) o vertices [{x,y}] para poly; h (espesor), Df (desplante), cover; fc, fy; barX, barY ('#4'…'#11' en ASTM); topSteel; qa (kPa admisible), mu, adhesion, gammaS, surcharge; fsSliding, fsOverturning; loadMode ('cases' o 'envelope'); columns[]: {id, name, x, y, geom: {shape: rect|circle|ngon|L|T|I|cross|poly, b, h, D, t, tw, rot…}, loads: {D,L,W,E: {P,Vx,Vy,Mx,My}}}; combos[]: {id, name, kind: service|ultimate, D, L, W, E, qaFactor}.`,
  wall: `Campos principales: name; type (${WALL_TYPES.map((t) => t.id).join(', ')}); H (altura de pantalla), tTop, tBot, Lt (pie), Lh (talón), hb, hbTip, Df; key {enabled, x, b, d}; fill {gamma, gammaSat, phi, beta (talud), q (sobrecarga kPa)}; hw (nivel freático); found {gamma, phi, c, qa, mu, ca, bearingMode: qa|calc}; passive {use, factor, ignoreTop}; theory (rankine|coulomb), delta; seismic {on, kh, kv}; pool {on, hwi, closed}; brace {on, levels[m], base: fixed|pinned, k0, floor} (muros de sótano); mat {fc, fy, cover, barStem, barHeel, barToe…}; factors {fsOT, fsSL, fsOTe, fsSLe…}; cf {s, t…} contrafuertes; gab (gaviones).`,
  pile: `Campos principales: name; pile {kind: concrete|pipe|hpile, shape, D, fc, fy, nBars, bar, L (embebida), Lu, head: fixed|free, nh, yAllow, install: driven|bored, hp (perfil H), t (tubo)}; layout {mode: grid|ring|custom, nx, ny, sx, sy, …}; cap {shape, h, edge, barX, barY, topSteel, fc, fy…}; column {geom, x, y}; moreColumns[] (columnas adicionales con id, name, geom, x, y); geo {mode: static|user, QaC, QaT, FS, Df, layers[]: {name, thk, kind: cohesive|granular|direct|rock, su, phi, gamma, qu, rqd…}, groupEff, liqOn…}; combos[]: {id, name, kind: service|ultimate, qaFactor, P, Vx, Vy, Mx, My, extra?: {idColumna: {P,Vx,Vy,Mx,My}}, eq?}.`,
};

// ---------------------------------------------------------------------------
const kindZ = z.enum(['footing', 'wall', 'pile']).describe('Tipo de elemento: footing (zapata), wall (muro de retención), pile (pilotes y cabezal)');
const unitsZ = z.enum(['SI', 'TEC']).optional().describe('Unidades para mostrar los resultados (SI por defecto)');
const baseShape = {
  kind: kindZ,
  example: z.union([z.number().int(), z.string()]).optional().describe('Índice o título de un ejemplo (list_examples) que sirve de base'),
  wall_type: z.enum(WALL_TYPES.map((t) => t.id) as [string, ...string[]]).optional().describe('Muros: tipología base si no se usa un ejemplo'),
  pile_kind: z.enum(['concrete', 'pipe', 'hpile']).optional().describe('Pilotes: tipo de pilote base si no se usa un ejemplo'),
  input: z.record(z.string(), z.any()).optional().describe('Cambios sobre la base (objeto parcial con la misma estructura que get_input; arreglos completos)'),
};
const specOf = (a: any) => ({ kind: a.kind as Kind, example: a.example, wall_type: a.wall_type, pile_kind: a.pile_kind, input: a.input });

const text = (t: string) => ({ type: 'text' as const, text: t });
const json = (v: any) => text('```json\n' + JSON.stringify(v, null, 2) + '\n```');
const fail = (e: unknown) => ({ isError: true, content: [text(`Error: ${e instanceof Error ? e.message : String(e)}`)] });

async function guard<T>(fn: () => Promise<T>): Promise<T | ReturnType<typeof fail>> {
  try {
    return await fn();
  } catch (e) {
    return fail(e);
  }
}

export function createServer(): McpServer {
  const server = new McpServer({ name: 'terrastruct', version: VERSION }, { instructions: INSTRUCTIONS });

  server.registerTool(
    'list_examples',
    {
      title: 'Listar ejemplos',
      description: 'Lista los ejemplos incluidos (zapatas, muros, pilotes) con su índice, título y descripción. Sirven de base para analyze, draw, report y project_save_element.',
      inputSchema: { kind: kindZ.optional() },
      annotations: { readOnlyHint: true },
    },
    async ({ kind }) => {
      const ex = listExamples(kind as Kind | undefined);
      const lines = KINDS.filter((k) => !kind || k === kind).flatMap((k) => [`### ${KIND_LABEL[k]} (kind = ${k})`, ...ex.filter((e) => e.kind === k).map((e) => `- [${e.index}] ${e.title}: ${e.desc}`), '']);
      return { content: [text(lines.join('\n'))] };
    },
  );

  server.registerTool(
    'get_input',
    {
      title: 'Ver entrada completa',
      description: 'Devuelve la entrada completa (JSON, unidades SI) de un ejemplo o de los valores por defecto, con una guía de los campos. Úsela para conocer la estructura antes de modificar valores.',
      inputSchema: baseShape,
      annotations: { readOnlyHint: true },
    },
    async (a) => guard(async () => {
      const inp = resolveInput(specOf(a));
      return { content: [text(FIELD_GUIDE[a.kind as Kind]), json(inp)] };
    }),
  );

  server.registerTool(
    'analyze',
    {
      title: 'Analizar y diseñar',
      description: 'Analiza y diseña un elemento (zapata, muro o pilotes/cabezal): estabilidad, presiones, capacidad, flexión, cortante, punzonamiento, armado. Devuelve estado, verificaciones con relación demanda/capacidad, advertencias y cuadro de armado.',
      inputSchema: {
        ...baseShape,
        units: unitsZ,
        detail: z.boolean().optional().describe('true: incluye además los resultados completos en JSON (extenso)'),
        return_input: z.boolean().optional().describe('true: incluye la entrada completa resuelta'),
      },
      annotations: { readOnlyHint: true },
    },
    async (a) => guard(async () => {
      const kind = a.kind as Kind;
      const inp = resolveInput(specOf(a));
      const res = analyze(kind, inp);
      const s = summarize(kind, inp, res, a.units ?? 'SI');
      const content = [text(summaryText(s))];
      if (a.return_input) content.push(text('### Entrada resuelta'), json(inp));
      if (a.detail) content.push(text('### Resultados completos (SI)'), json(safeJson(res)));
      return { content };
    }),
  );

  server.registerTool(
    'auto_design',
    {
      title: 'Dimensionar automáticamente',
      description: 'Dimensiona automáticamente una zapata aislada de una columna (planta, espesor y barras) o un grupo de pilotes con su cabezal (número de pilotes, espesor y acero). Devuelve el resumen y la entrada dimensionada.',
      inputSchema: { ...baseShape, kind: z.enum(['footing', 'pile']).describe('footing (una columna) o pile'), units: unitsZ },
    },
    async (a) => guard(async () => {
      const kind = a.kind as Kind;
      const r = autoDesign(kind, resolveInput(specOf(a)));
      const s = summarize(kind, r.input, analyze(kind, r.input), a.units ?? 'SI');
      return { content: [text(`**Dimensionamiento automático:** ${r.note}`), text(summaryText(s)), text('### Entrada dimensionada (úsela como "input" o guárdela con project_save_element)'), json(r.input)] };
    }),
  );

  server.registerTool(
    'draw',
    {
      title: 'Dibujar',
      description: `Genera figuras del elemento y las devuelve como imagen PNG. Vistas — footing: ${Object.keys(VIEWS.footing).join(', ')}; wall: ${Object.keys(VIEWS.wall).join(', ')}; pile: ${Object.keys(VIEWS.pile).join(', ')}. Opcionalmente las guarda en disco (.png o .svg).`,
      inputSchema: {
        ...baseShape,
        view: z.string().describe('Vista a dibujar (ver descripción)'),
        units: unitsZ,
        save_to: z.string().optional().describe('Ruta de archivo .png o .svg donde guardar la figura (si hay varias se numeran)'),
      },
      annotations: { readOnlyHint: false },
    },
    async (a) => guard(async () => {
      const kind = a.kind as Kind;
      const inp = resolveInput(specOf(a));
      const figs = drawViews(kind, inp, analyze(kind, inp), a.view, a.units ?? 'SI');
      const content: any[] = [];
      for (let i = 0; i < figs.length; i++) {
        const f = figs[i];
        const png = svgToPngNode(f.svg, 1.5);
        content.push(text(f.title), { type: 'image', data: Buffer.from(png.bytes).toString('base64'), mimeType: 'image/png' });
        if (a.save_to) {
          const p = figs.length > 1 ? a.save_to.replace(/(\.\w+)?$/, (m: string) => `-${i + 1}${m || '.png'}`) : a.save_to;
          const saved = await writeOut(p, /\.svg$/i.test(p) ? f.svg : svgToPngNode(f.svg, 2).bytes);
          content.push(text(`Guardado en ${saved}`));
        }
      }
      return { content };
    }),
  );

  const infoZ = z
    .object({
      name: z.string().optional(), client: z.string().optional(), location: z.string().optional(), engineer: z.string().optional(),
      license: z.string().optional(), date: z.string().optional(), revision: z.string().optional(), notes: z.string().optional(), disclaimer: z.string().optional(),
    })
    .optional()
    .describe('Datos de la carátula: proyecto, cliente, ubicación, ingeniero, matrícula, fecha, revisión, notas');

  server.registerTool(
    'report',
    {
      title: 'Memoria de cálculo de un elemento',
      description: 'Genera la memoria de cálculo de un elemento (carátula, hipótesis, fórmulas con valores, tablas, figuras y cuadro de armado) y la guarda como PDF o Word (.docx).',
      inputSchema: {
        ...baseShape,
        format: z.enum(['pdf', 'docx']),
        output_path: z.string().describe('Ruta del archivo a escribir, p. ej. C:/Proyectos/Z-1.pdf'),
        units: unitsZ,
        project_info: infoZ,
      },
    },
    async (a) => guard(async () => {
      const kind = a.kind as Kind;
      const inp = resolveInput(specOf(a));
      const doc = elementReport(kind, inp, a.units ?? 'SI', deepMerge(defaultInfo(), a.project_info ?? {}));
      const path = await writeOut(a.output_path, await renderDoc(doc, a.format));
      const s = summarize(kind, inp, analyze(kind, inp), a.units ?? 'SI', false);
      return { content: [text(`Memoria guardada en ${path} (${s.ok ? 'el elemento cumple' : 'el elemento NO cumple: ' + s.failing.join('; ')}).`)] };
    }),
  );

  // ------------------------------------------------------------- proyectos
  const pathZ = z.string().describe('Ruta del archivo de proyecto .terrastruct.json');

  server.registerTool(
    'project_open',
    {
      title: 'Abrir proyecto',
      description: 'Lee un proyecto .terrastruct.json (el que guarda la aplicación) y resume sus datos y el estado de cada elemento.',
      inputSchema: { path: pathZ },
      annotations: { readOnlyHint: true },
    },
    async (a) => guard(async () => {
      const p = await loadProjectFile(a.path);
      const els = projectElements(p);
      const rows = els.map((e) => {
        const r = analyze(e.kind, e.data);
        const failing = (r.checks as any[]).filter((c) => !c.ok && !c.advisory).map((c) => c.name);
        return `| ${e.name} | ${KIND_LABEL[e.kind]} (${e.kind}) | ${r.ok ? 'Cumple' : 'NO cumple'} | ${failing.join('; ') || '—'} |`;
      });
      const info = Object.entries(p.info).filter(([, v]) => v).map(([k, v]) => `- ${k}: ${v}`);
      return { content: [text([`## Proyecto: ${p.info.name}`, `Unidades: ${p.units}`, ...info, '', '| Elemento | Tipo | Estado | Verificaciones fallidas |', '|---|---|---|---|', ...rows].join('\n'))] };
    }),
  );

  server.registerTool(
    'project_get_element',
    {
      title: 'Ver elemento del proyecto',
      description: 'Devuelve el resumen de análisis y la entrada completa (JSON, SI) de un elemento del proyecto, buscado por nombre.',
      inputSchema: { path: pathZ, name: z.string(), kind: kindZ.optional(), units: unitsZ },
      annotations: { readOnlyHint: true },
    },
    async (a) => guard(async () => {
      const p = await loadProjectFile(a.path);
      const e = findElement(p, a.kind as Kind | undefined, a.name);
      const s = summarize(e.kind, e.data, analyze(e.kind, e.data), a.units ?? p.units);
      return { content: [text(summaryText(s)), text(`### Entrada (kind = ${e.kind})`), json(e.data)] };
    }),
  );

  server.registerTool(
    'project_save_element',
    {
      title: 'Agregar o modificar elemento',
      description: 'Agrega un elemento al proyecto o modifica uno existente y guarda el archivo (lo crea si no existe). Si "name" coincide con un elemento, "input" se aplica sobre él; si no, sobre el ejemplo o los valores por defecto. Devuelve el análisis del elemento guardado.',
      inputSchema: {
        path: pathZ,
        ...baseShape,
        name: z.string().optional().describe('Nombre del elemento a modificar (o del nuevo elemento)'),
        units: unitsZ,
      },
    },
    async (a) => guard(async () => {
      const kind = a.kind as Kind;
      const p = await loadProjectFile(a.path, true);
      const target = a.name ?? a.input?.name;
      const existing = target ? projectElements(p).find((e) => e.kind === kind && e.name === target) : undefined;
      let inp;
      if (existing && a.example === undefined) {
        inp = normalizeFor(kind, deepMerge(existing.data, a.input ?? {}));
        if (a.input) for (const k of Object.keys(a.input)) if (Array.isArray(a.input[k])) (inp as any)[k] = a.input[k];
      } else {
        inp = resolveInput({ ...specOf(a), input: { ...(a.input ?? {}), ...(a.name ? { name: a.input?.name ?? a.name } : {}) } });
      }
      if (existing && (inp as any).name !== existing.name) {
        removeElement(p, kind, existing.name);
      }
      const how = upsertElement(p, kind, inp);
      const path = await saveProjectFile(a.path, p);
      const s = summarize(kind, inp, analyze(kind, inp), a.units ?? p.units);
      return { content: [text(`Elemento «${(inp as any).name}» ${how === 'added' ? 'agregado' : 'actualizado'} en ${path}.`), text(summaryText(s))] };
    }),
  );

  server.registerTool(
    'project_remove_element',
    {
      title: 'Eliminar elemento',
      description: 'Elimina un elemento del proyecto por nombre y guarda el archivo.',
      inputSchema: { path: pathZ, name: z.string(), kind: kindZ.optional() },
      annotations: { destructiveHint: true },
    },
    async (a) => guard(async () => {
      const p = await loadProjectFile(a.path);
      const r = removeElement(p, a.kind as Kind | undefined, a.name);
      await saveProjectFile(a.path, p);
      return { content: [text(`Eliminado «${r.name}» (${r.kind}).`)] };
    }),
  );

  server.registerTool(
    'project_set_info',
    {
      title: 'Datos del proyecto',
      description: 'Cambia los datos de la carátula del proyecto (nombre, cliente, ubicación, ingeniero, etc.) y las unidades de la memoria; crea el archivo si no existe.',
      inputSchema: { path: pathZ, info: infoZ, units: unitsZ },
    },
    async (a) => guard(async () => {
      const p = await loadProjectFile(a.path, true);
      setInfo(p, a.info ?? {}, a.units);
      const path = await saveProjectFile(a.path, p);
      return { content: [text(`Datos guardados en ${path}.`), json({ info: p.info, units: p.units })] };
    }),
  );

  server.registerTool(
    'project_report',
    {
      title: 'Memoria del proyecto',
      description: 'Genera la memoria de cálculo completa del proyecto (resumen y todos los elementos) en PDF o Word.',
      inputSchema: { path: pathZ, format: z.enum(['pdf', 'docx']), output_path: z.string().describe('Ruta del archivo a escribir') },
    },
    async (a) => guard(async () => {
      const p = await loadProjectFile(a.path);
      const out = await writeOut(a.output_path, await renderDoc(projectReport(p), a.format));
      return { content: [text(`Memoria del proyecto guardada en ${out}.`)] };
    }),
  );

  return server;
}

export async function main() {
  await initNodeRaster(Buffer.from(wasmB64, 'base64'));
  const server = createServer();
  await server.connect(new StdioServerTransport());
  // stdout es el canal del protocolo: los mensajes de diagnóstico van a stderr
  console.error(`TerraStruct MCP ${VERSION} listo (stdio).`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
