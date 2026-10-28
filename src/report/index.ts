import { Project } from '../state';
import { analyzeFooting, FootingInput } from '../core/footing';
import { analyzeWall } from '../core/wall';
import { WallInput } from '../core/wallTypes';
import { analyzePile } from '../core/pile';
import { PileInput } from '../core/pileTypes';
import { buildPileReport, pileBlocks } from './pileReport';
import { Fmt } from '../core/units';
import { DocBuilder, ReportDoc } from './model';
import { buildFootingReport, footingBlocks } from './footingReport';
import { buildWallReport, wallBlocks } from './wallReport';
import { makePdfBlob } from './pdf';
import { makeDocxBlob } from './docx';

export type Format = 'pdf' | 'docx';

export function reportForFooting(inp: FootingInput, fmt: Fmt, info: Project['info']): ReportDoc {
  return buildFootingReport(inp, analyzeFooting(inp), fmt, info);
}

export function reportForPile(inp: PileInput, fmt: Fmt, info: Project['info']): ReportDoc {
  return buildPileReport(inp, analyzePile(inp), fmt, info);
}

export function reportForWall(inp: WallInput, fmt: Fmt, info: Project['info']): ReportDoc {
  return buildWallReport(analyzeWall(inp), fmt, info);
}

export function reportForProject(p: Project, fmt: Fmt): ReportDoc {
  const d = new DocBuilder();
  // Resumen general
  const fRes = p.footings.map((f) => ({ f, r: analyzeFooting(f.data) }));
  const wRes = p.walls.map((w) => ({ w, r: analyzeWall(w.data) }));
  const pRes = p.piles.map((x) => ({ x, r: analyzePile(x.data) }));
  d.blocks.push({ t: 'h1', text: 'Resumen del proyecto' });
  d.p(`El proyecto «${p.info.name}» reúne ${fRes.length} fundación(es), ${pRes.length} cabezal(es) con pilotes y ${wRes.length} muro(s) de retención. Cada elemento se presenta a continuación con sus datos, procedimiento de cálculo, resultados y cuadro de armado.`, { align: 'justify' });
  d.table(
    ['Elemento', 'Tipo', 'Estado', 'Verificaciones fallidas'],
    [
      ...fRes.map(({ f, r }) => [f.data.name, 'Fundación', r.ok ? 'Cumple' : 'No cumple', String(r.checks.filter((c) => !c.ok).length)]),
      ...pRes.map(({ x, r }) => [x.data.name, 'Pilotes y cabezal', r.ok ? 'Cumple' : 'No cumple', String(r.checks.filter((c) => !c.ok && !c.advisory).length)]),
      ...wRes.map(({ w, r }) => [w.data.name, 'Muro de retención', r.ok ? 'Cumple' : 'No cumple', String(r.checks.filter((c) => !c.ok && !c.advisory).length)]),
    ],
    { align: ['l', 'l', 'c', 'r'], caption: 'Tabla. Estado de los elementos' },
  );
  fRes.forEach(({ f, r }, i) => {
    d.pagebreak();
    d.blocks.push({ t: 'h1', text: `Fundación ${f.data.name}` });
    const b = new DocBuilder(`F${i + 1}-`);
    footingBlocks(f.data, r, fmt, b);
    d.blocks.push(...b.blocks);
  });
  pRes.forEach(({ x, r }, i) => {
    d.pagebreak();
    d.blocks.push({ t: 'h1', text: `Pilotes y cabezal ${x.data.name}` });
    const b = new DocBuilder(`P${i + 1}-`);
    pileBlocks(x.data, r, fmt, b);
    d.blocks.push(...b.blocks);
  });
  wRes.forEach(({ w, r }, i) => {
    d.pagebreak();
    d.blocks.push({ t: 'h1', text: `Muro de retención ${w.data.name}` });
    const b = new DocBuilder(`M${i + 1}-`);
    wallBlocks(r, fmt, b);
    d.blocks.push(...b.blocks);
  });
  return { title: `Memoria de cálculo — ${p.info.name}`, subtitle: 'Fundaciones y muros de retención', info: p.info, blocks: d.blocks, footer: 'TerraStruct' };
}

export async function renderReport(doc: ReportDoc, format: Format): Promise<Blob> {
  return format === 'pdf' ? makePdfBlob(doc) : makeDocxBlob(doc);
}

export function downloadBlob(blob: Blob, filename: string) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
}

export function safeFile(s: string): string {
  return s.replace(/[^\w\-áéíóúñÁÉÍÓÚÑ]+/g, '_').replace(/^_+|_+$/g, '') || 'memoria';
}
