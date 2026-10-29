import pdfMake from 'pdfmake/build/pdfmake';
import vfs from 'pdfmake/build/vfs_fonts';
import { Block, ReportDoc, pdfSafe } from './model';
import { Png, rasterizeAll } from './raster';
import { colWeights } from './layout';
import { ICON_PNG } from './iconData';

let ready = false;
function init() {
  if (ready) return;
  const v: any = (vfs as any).vfs ?? vfs;
  if (typeof pdfMake.addVirtualFileSystem === 'function') pdfMake.addVirtualFileSystem(v);
  else pdfMake.vfs = v;
  ready = true;
}

const PAGE_W = 595.28;
const MARGIN_X = 48;
const CONTENT_W = PAGE_W - 2 * MARGIN_X;
const C = { navy: '#0b2545', blue: '#1d63c7', grid: '#c9d4e4', head: '#e8eef8', zebra: '#f6f8fc', ok: '#138a48', bad: '#c62a2f', warn: '#b86e00', eq: '#f1f5fb', muted: '#5a6b85' };

function tableLayout(headFill = C.head) {
  return {
    hLineWidth: () => 0.5,
    vLineWidth: () => 0.5,
    hLineColor: () => C.grid,
    vLineColor: () => C.grid,
    paddingLeft: () => 4,
    paddingRight: () => 4,
    paddingTop: () => 2.6,
    paddingBottom: () => 2.6,
    fillColor: (row: number) => (row === 0 ? headFill : row % 2 === 0 ? C.zebra : null),
  };
}

function alignOf(a: string | undefined): 'left' | 'center' | 'right' {
  return a === 'r' ? 'right' : a === 'c' ? 'center' : 'left';
}

function blockToPdf(b: Block, imgs: Map<string, Png>): any[] {
  const S = pdfSafe;
  switch (b.t) {
    case 'h1':
      return [
        { text: S(b.text), style: 'h1', tocItem: true, tocStyle: { bold: true, fontSize: 10.5 }, tocMargin: [0, 5, 0, 0], pageBreak: undefined },
        { canvas: [{ type: 'line', x1: 0, y1: 0, x2: CONTENT_W, y2: 0, lineWidth: 1.2, lineColor: C.blue }], margin: [0, 0, 0, 7] },
      ];
    case 'h2':
      return [{ text: S(b.text), style: 'h2', tocItem: true, tocStyle: { fontSize: 9.5 }, tocMargin: [14, 1, 0, 0] }];
    case 'h3':
      return [{ text: S(b.text), style: 'h3' }];
    case 'p':
      return [{ text: S(b.text), style: b.small ? 'small' : 'p', bold: b.bold, italics: b.italic, alignment: b.align ?? 'left' }];
    case 'bullets':
      return [{ ul: b.items.map((t) => ({ text: S(t), style: 'p' })), margin: [6, 0, 0, 6] }];
    case 'kv': {
      const cols = b.cols ?? 1;
      const rows: any[][] = [];
      if (cols === 1) for (const [k, v] of b.rows) rows.push([{ text: S(k), style: 'kvk' }, { text: S(v), style: 'kvv' }]);
      else
        for (let i = 0; i < b.rows.length; i += 2) {
          const a = b.rows[i];
          const c = b.rows[i + 1];
          rows.push([{ text: S(a[0]), style: 'kvk' }, { text: S(a[1]), style: 'kvv' }, { text: c ? S(c[0]) : '', style: 'kvk' }, { text: c ? S(c[1]) : '', style: 'kvv' }]);
        }
      return [
        {
          table: { widths: cols === 1 ? ['38%', '*'] : ['27%', '23%', '27%', '*'], body: rows, dontBreakRows: true },
          layout: { ...tableLayout(), fillColor: () => null },
          margin: [0, 0, 0, 8],
        },
      ];
    }
    case 'table': {
      const w = colWeights(b);
      const sum = w.reduce((a, c) => a + c, 0);
      const avail = CONTENT_W - 8 * w.length - 2;
      const widths = w.map((x) => +((x / sum) * avail).toFixed(1));
      const fs = b.small || b.head.length > 9 ? 7 : b.head.length > 6 ? 8 : 8.6;
      const head = b.head.map((h, i) => ({ text: S(h), bold: true, fontSize: fs, alignment: alignOf(b.align?.[i]), color: C.navy }));
      const body = b.rows.map((r, ri) =>
        r.map((c, i) => ({ text: S(c), fontSize: fs, alignment: alignOf(b.align?.[i]), bold: b.boldLast && ri === b.rows.length - 1 })),
      );
      const out: any[] = [];
      if (b.caption) out.push({ text: S(b.caption), style: 'caption', margin: [0, 2, 0, 3], keepWithNext: true });
      out.push({ table: { headerRows: 1, widths, body: [head, ...body], dontBreakRows: true }, layout: tableLayout(), margin: [0, 0, 0, 9] });
      return out;
    }
    case 'eq':
      return [
        {
          table: {
            widths: ['*'],
            body: [[{ stack: [...(b.title ? [{ text: S(b.title), bold: true, fontSize: 8.6, color: C.blue, margin: [0, 0, 0, 2] }] : []), ...b.lines.map((l) => ({ text: S(l), fontSize: 9.2, italics: true, lineHeight: 1.25 }))] }]],
            dontBreakRows: true,
          },
          layout: {
            hLineWidth: () => 0,
            vLineWidth: (i: number) => (i === 0 ? 2.4 : 0),
            vLineColor: () => C.blue,
            paddingLeft: () => 8,
            paddingRight: () => 6,
            paddingTop: () => 4,
            paddingBottom: () => 4,
            fillColor: () => C.eq,
          },
          margin: [0, 2, 0, 8],
        },
      ];
    case 'img': {
      const png = imgs.get(b.svg)!;
      const w = Math.min(CONTENT_W * (b.widthRatio ?? 1), CONTENT_W);
      const out: any[] = [{ image: png.dataUrl, width: w, alignment: 'center', margin: [0, 4, 0, b.caption ? 2 : 8] }];
      if (b.caption) out.push({ text: S(b.caption), style: 'caption', alignment: 'center', margin: [0, 0, 0, 8] });
      return out;
    }
    case 'status': {
      const head = ['Verificación', 'Detalle', 'Relación', 'Resultado'].map((h) => ({ text: h, bold: true, fontSize: 8.6, color: C.navy }));
      const body = b.rows.map((r) => [
        { text: S(r.name), fontSize: 8.6, bold: true },
        { text: S(r.detail), fontSize: 8.2 },
        { text: isFinite(r.ratio) ? r.ratio.toFixed(2) : '>9.99', fontSize: 8.6, alignment: 'right' },
        { text: r.ok ? 'CUMPLE' : r.advisory ? 'REVISAR' : 'NO CUMPLE', fontSize: 8.6, bold: true, alignment: 'center', color: r.ok ? C.ok : r.advisory ? C.warn : C.bad },
      ]);
      return [{ table: { headerRows: 1, widths: ['30%', '*', 46, 62], body: [head, ...body], dontBreakRows: true }, layout: tableLayout(), margin: [0, 0, 0, 9] }];
    }
    case 'pagebreak':
      return [{ text: '', pageBreak: 'after' }];
  }
}

export async function buildPdfDefinition(doc: ReportDoc): Promise<any> {
  const svgs = doc.blocks.filter((b) => b.t === 'img').map((b) => (b as any).svg as string);
  const imgs = await rasterizeAll(svgs);
  const S = pdfSafe;
  const info = doc.info;
  const cover: any[] = [
    { canvas: [{ type: 'rect', x: 0, y: 0, w: PAGE_W, h: 235, color: C.navy }, { type: 'rect', x: 0, y: 235, w: PAGE_W, h: 5, color: '#d9822b' }], absolutePosition: { x: 0, y: 0 } },
    { image: ICON_PNG, width: 64, absolutePosition: { x: MARGIN_X, y: 54 } },
    { text: 'TerraStruct', color: '#ffffff', fontSize: 13, bold: true, absolutePosition: { x: MARGIN_X + 76, y: 62 } },
    { text: 'Fundaciones y muros de retención', color: '#9fb6d6', fontSize: 9.5, absolutePosition: { x: MARGIN_X + 76, y: 80 } },
    { text: 'MEMORIA DE CÁLCULO', color: '#ffffff', fontSize: 28, bold: true, absolutePosition: { x: MARGIN_X, y: 130 } },
    { text: S(doc.subtitle), color: '#cfe0f6', fontSize: 13, absolutePosition: { x: MARGIN_X, y: 172 }, width: CONTENT_W },
    { text: '', margin: [0, 215, 0, 0] },
    { text: S(doc.title), fontSize: 17, bold: true, color: C.navy, margin: [0, 0, 0, 14] },
    {
      table: {
        widths: ['32%', '*'],
        body: [
          ['Proyecto', info.name],
          ['Cliente', info.client || '—'],
          ['Ubicación', info.location || '—'],
          ['Ingeniero responsable', info.engineer || '—'],
          ['Matrícula / registro', info.license || '—'],
          ['Fecha', info.date],
          ['Revisión', info.revision || '—'],
        ].map(([k, v]) => [{ text: S(k), bold: true, color: C.navy, fontSize: 10 }, { text: S(v), fontSize: 10 }]),
      },
      layout: { ...tableLayout(), fillColor: () => null, paddingTop: () => 5, paddingBottom: () => 5 },
    },
    ...(info.notes ? [{ text: S(info.notes), fontSize: 9.5, italics: true, color: C.muted, margin: [0, 14, 0, 0] }] : []),
    ...(info.disclaimer?.trim() ? [{ text: S(info.disclaimer), fontSize: 8.5, color: C.muted, margin: [0, 40, 0, 0] }] : []),
    { text: '', pageBreak: 'after' },
    { toc: { title: { text: 'CONTENIDO', style: 'h1' } }, margin: [0, 0, 0, 10] },
    { text: '', pageBreak: 'after' },
  ];
  const content: any[] = [...cover];
  for (const b of doc.blocks) content.push(...blockToPdf(b, imgs));
  return {
    pageSize: 'A4',
    pageMargins: [MARGIN_X, 58, MARGIN_X, 50],
    defaultStyle: { font: 'Roboto', fontSize: 9.5, lineHeight: 1.15 },
    info: { title: S(doc.title), author: info.engineer || 'TerraStruct', subject: S(doc.subtitle), creator: 'TerraStruct' },
    header: (page: number) =>
      page === 1
        ? null
        : { columns: [{ text: S(info.name), color: C.muted, fontSize: 8 }, { text: S(doc.title), color: C.muted, fontSize: 8, alignment: 'right' }], margin: [MARGIN_X, 26, MARGIN_X, 0] },
    footer: (page: number, pages: number) =>
      page === 1
        ? null
        : { columns: [{ text: S(doc.footer), color: C.muted, fontSize: 8 }, { text: `Página ${page} de ${pages}`, color: C.muted, fontSize: 8, alignment: 'right' }], margin: [MARGIN_X, 0, MARGIN_X, 22] },
    styles: {
      h1: { fontSize: 14.5, bold: true, color: C.navy, margin: [0, 14, 0, 2] },
      h2: { fontSize: 11.5, bold: true, color: C.blue, margin: [0, 10, 0, 4] },
      h3: { fontSize: 10, bold: true, color: C.navy, margin: [0, 6, 0, 3] },
      p: { fontSize: 9.5, margin: [0, 0, 0, 5], alignment: 'left' },
      small: { fontSize: 8, color: C.muted, margin: [0, 0, 0, 4] },
      caption: { fontSize: 8, italics: true, color: C.muted },
      kvk: { fontSize: 8.8, bold: true, color: C.navy },
      kvv: { fontSize: 8.8 },
    },
    content,
  };
}

export async function makePdfBlob(doc: ReportDoc): Promise<Blob> {
  init();
  const def = await buildPdfDefinition(doc);
  const pdf = pdfMake.createPdf(def);
  const r = pdf.getBlob();
  return r && typeof r.then === 'function' ? await r : await new Promise<Blob>((res) => pdf.getBlob((b: Blob) => res(b)));
}
