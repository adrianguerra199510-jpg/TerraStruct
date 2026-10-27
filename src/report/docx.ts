import {
  AlignmentType, BorderStyle, Document, Footer, Header, HeadingLevel, ImageRun, Packer, PageNumber, Paragraph, ShadingType, Table, TableCell, TableLayoutType, TableRow,
  TextRun, VerticalAlign, WidthType, LevelFormat,
} from 'docx';
import { Block, ReportDoc } from './model';
import { Png, rasterizeAll } from './raster';
import { colWeights } from './layout';
import { ICON_PNG } from './iconData';

const NAVY = '0B2545';
const BLUE = '1D63C7';
const GRID = 'C9D4E4';
const HEAD = 'E8EEF8';
const ZEBRA = 'F6F8FC';
const EQ = 'F1F5FB';
const OK = '138A48';
const BAD = 'C62A2F';
const WARN = 'B86E00';
const MUTED = '5A6B85';

// Hoja A4 con márgenes de 2 cm: ancho útil 17 cm = 9638 twips ≈ 643 px a 96 dpi
const CONTENT_TW = 9638;
const CONTENT_PX = 640;

const FONT = 'Calibri';

function dataUrlToBytes(u: string): Uint8Array {
  const bin = atob(u.split(',')[1]);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

const thin = (color = GRID) => ({ style: BorderStyle.SINGLE, size: 4, color });
const cellBorders = { top: thin(), bottom: thin(), left: thin(), right: thin() };

function run(text: string, o: { size?: number; bold?: boolean; italics?: boolean; color?: string; font?: string } = {}) {
  return new TextRun({ text, size: o.size ?? 19, bold: o.bold, italics: o.italics, color: o.color, font: o.font ?? FONT });
}

function cell(text: string, o: { fill?: string; align?: 'l' | 'c' | 'r'; bold?: boolean; size?: number; color?: string; width?: number } = {}) {
  return new TableCell({
    width: o.width ? { size: o.width, type: WidthType.DXA } : undefined,
    borders: cellBorders,
    shading: o.fill ? { type: ShadingType.CLEAR, color: 'auto', fill: o.fill } : undefined,
    verticalAlign: VerticalAlign.CENTER,
    margins: { top: 40, bottom: 40, left: 70, right: 70 },
    children: [
      new Paragraph({
        alignment: o.align === 'r' ? AlignmentType.RIGHT : o.align === 'c' ? AlignmentType.CENTER : AlignmentType.LEFT,
        spacing: { before: 0, after: 0 },
        children: [run(text, { size: o.size ?? 16, bold: o.bold, color: o.color })],
      }),
    ],
  });
}

function makeTable(head: string[], rows: string[][], widths: number[], align: ('l' | 'c' | 'r')[] | undefined, o: { boldLast?: boolean; size?: number } = {}) {
  const sum = widths.reduce((a, c) => a + c, 0);
  const tw = widths.map((w) => Math.round((w / sum) * CONTENT_TW));
  const size = o.size ?? (head.length > 9 ? 13 : head.length > 6 ? 15 : 17);
  const hrow = new TableRow({
    tableHeader: true,
    cantSplit: true,
    children: head.map((h, i) => cell(h, { fill: HEAD, bold: true, color: NAVY, align: align?.[i], size, width: tw[i] })),
  });
  const body = rows.map(
    (r, ri) =>
      new TableRow({
        cantSplit: true,
        children: r.map((c, i) => cell(c, { fill: ri % 2 === 1 ? ZEBRA : undefined, align: align?.[i], bold: o.boldLast && ri === rows.length - 1, size, width: tw[i] })),
      }),
  );
  return new Table({ width: { size: CONTENT_TW, type: WidthType.DXA }, columnWidths: tw, layout: TableLayoutType.FIXED, rows: [hrow, ...body] });
}

function spacer(after = 120) {
  return new Paragraph({ spacing: { before: 0, after }, children: [] });
}

function blockToDocx(b: Block, imgs: Map<string, Png>): (Paragraph | Table)[] {
  switch (b.t) {
    case 'h1':
      return [
        new Paragraph({
          heading: HeadingLevel.HEADING_1,
          spacing: { before: 360, after: 120 },
          keepNext: true,
          border: { bottom: { style: BorderStyle.SINGLE, size: 8, color: BLUE, space: 2 } },
          children: [run(b.text, { size: 30, bold: true, color: NAVY })],
        }),
      ];
    case 'h2':
      return [new Paragraph({ heading: HeadingLevel.HEADING_2, spacing: { before: 240, after: 80 }, keepNext: true, children: [run(b.text, { size: 24, bold: true, color: BLUE })] })];
    case 'h3':
      return [new Paragraph({ heading: HeadingLevel.HEADING_3, spacing: { before: 160, after: 60 }, keepNext: true, children: [run(b.text, { size: 21, bold: true, color: NAVY })] })];
    case 'p':
      return [
        new Paragraph({
          alignment: b.align === 'center' ? AlignmentType.CENTER : b.align === 'right' ? AlignmentType.RIGHT : b.align === 'justify' ? AlignmentType.JUSTIFIED : AlignmentType.LEFT,
          spacing: { before: 0, after: 100 },
          children: [run(b.text, { size: b.small ? 16 : 19, bold: b.bold, italics: b.italic, color: b.small ? MUTED : undefined })],
        }),
      ];
    case 'bullets':
      return b.items.map((t) => new Paragraph({ numbering: { reference: 'bul', level: 0 }, spacing: { before: 0, after: 50 }, children: [run(t)] }));
    case 'kv': {
      const cols = b.cols ?? 1;
      const rows: TableRow[] = [];
      const kvCell = (t: string, key: boolean, w: number) => cell(t, { bold: key, color: key ? NAVY : undefined, size: 17, width: w });
      if (cols === 1) {
        const w = [Math.round(CONTENT_TW * 0.38), Math.round(CONTENT_TW * 0.62)];
        for (const [k, v] of b.rows) rows.push(new TableRow({ cantSplit: true, children: [kvCell(k, true, w[0]), kvCell(v, false, w[1])] }));
        return [new Table({ width: { size: CONTENT_TW, type: WidthType.DXA }, columnWidths: w, layout: TableLayoutType.FIXED, rows }), spacer()];
      }
      const w = [0.27, 0.23, 0.27, 0.23].map((x) => Math.round(CONTENT_TW * x));
      for (let i = 0; i < b.rows.length; i += 2) {
        const a = b.rows[i];
        const c = b.rows[i + 1];
        rows.push(new TableRow({ cantSplit: true, children: [kvCell(a[0], true, w[0]), kvCell(a[1], false, w[1]), kvCell(c ? c[0] : '', true, w[2]), kvCell(c ? c[1] : '', false, w[3])] }));
      }
      return [new Table({ width: { size: CONTENT_TW, type: WidthType.DXA }, columnWidths: w, layout: TableLayoutType.FIXED, rows }), spacer()];
    }
    case 'table': {
      const out: (Paragraph | Table)[] = [];
      if (b.caption) out.push(new Paragraph({ spacing: { before: 40, after: 50 }, keepNext: true, children: [run(b.caption, { size: 16, italics: true, color: MUTED })] }));
      out.push(makeTable(b.head, b.rows, colWeights(b), b.align, { boldLast: b.boldLast, size: b.small ? 13 : undefined }));
      out.push(spacer());
      return out;
    }
    case 'eq': {
      const kids: Paragraph[] = [];
      if (b.title) kids.push(new Paragraph({ spacing: { before: 0, after: 20 }, children: [run(b.title, { size: 17, bold: true, color: BLUE })] }));
      for (const l of b.lines) kids.push(new Paragraph({ spacing: { before: 0, after: 20 }, children: [run(l, { size: 19, italics: true, font: 'Cambria Math' })] }));
      return [
        new Table({
          width: { size: CONTENT_TW, type: WidthType.DXA },
          columnWidths: [CONTENT_TW],
          layout: TableLayoutType.FIXED,
          rows: [
            new TableRow({
              cantSplit: true,
              children: [
                new TableCell({
                  width: { size: CONTENT_TW, type: WidthType.DXA },
                  shading: { type: ShadingType.CLEAR, color: 'auto', fill: EQ },
                  borders: { top: { style: BorderStyle.NONE, size: 0, color: 'auto' }, bottom: { style: BorderStyle.NONE, size: 0, color: 'auto' }, right: { style: BorderStyle.NONE, size: 0, color: 'auto' }, left: { style: BorderStyle.SINGLE, size: 18, color: BLUE } },
                  margins: { top: 70, bottom: 70, left: 140, right: 100 },
                  children: kids,
                }),
              ],
            }),
          ],
        }),
        spacer(),
      ];
    }
    case 'img': {
      const png = imgs.get(b.svg)!;
      const w = Math.round(CONTENT_PX * (b.widthRatio ?? 1));
      const h = Math.round((w * png.height) / png.width);
      const out: Paragraph[] = [
        new Paragraph({ alignment: AlignmentType.CENTER, spacing: { before: 60, after: 40 }, keepNext: !!b.caption, children: [new ImageRun({ type: 'png', data: png.bytes, transformation: { width: w, height: h }, altText: { title: b.caption ?? 'Figura', description: b.caption ?? 'Figura', name: 'figura' } })] }),
      ];
      if (b.caption) out.push(new Paragraph({ alignment: AlignmentType.CENTER, spacing: { before: 0, after: 140 }, children: [run(b.caption, { size: 16, italics: true, color: MUTED })] }));
      return out;
    }
    case 'status': {
      const widths = [0.28, 0.46, 0.1, 0.16].map((x) => Math.round(CONTENT_TW * x));
      const hrow = new TableRow({ tableHeader: true, children: ['Verificación', 'Detalle', 'Relación', 'Resultado'].map((h, i) => cell(h, { fill: HEAD, bold: true, color: NAVY, size: 17, width: widths[i], align: i >= 2 ? 'c' : 'l' })) });
      const body = b.rows.map(
        (r, ri) =>
          new TableRow({
            cantSplit: true,
            children: [
              cell(r.name, { bold: true, size: 17, width: widths[0], fill: ri % 2 ? ZEBRA : undefined }),
              cell(r.detail, { size: 16, width: widths[1], fill: ri % 2 ? ZEBRA : undefined }),
              cell(isFinite(r.ratio) ? r.ratio.toFixed(2) : '>9.99', { size: 17, width: widths[2], align: 'r', fill: ri % 2 ? ZEBRA : undefined }),
              cell(r.ok ? 'CUMPLE' : r.advisory ? 'REVISAR' : 'NO CUMPLE', { size: 17, bold: true, color: r.ok ? OK : r.advisory ? WARN : BAD, align: 'c', width: widths[3], fill: ri % 2 ? ZEBRA : undefined }),
            ],
          }),
      );
      return [new Table({ width: { size: CONTENT_TW, type: WidthType.DXA }, columnWidths: widths, layout: TableLayoutType.FIXED, rows: [hrow, ...body] }), spacer()];
    }
    case 'pagebreak':
      return [new Paragraph({ pageBreakBefore: true, children: [] })];
  }
}

export async function makeDocxBlob(doc: ReportDoc): Promise<Blob> {
  const svgs = doc.blocks.filter((b) => b.t === 'img').map((b) => (b as any).svg as string);
  const imgs = await rasterizeAll(svgs);
  const info = doc.info;
  const iconBytes = dataUrlToBytes(ICON_PNG);

  const cover: (Paragraph | Table)[] = [
    new Paragraph({
      shading: { type: ShadingType.CLEAR, color: 'auto', fill: NAVY },
      spacing: { before: 0, after: 0 },
      children: [new ImageRun({ type: 'png', data: iconBytes, transformation: { width: 64, height: 64 }, altText: { title: 'TerraStruct', description: 'Logotipo', name: 'logo' } }), run('   TerraStruct', { size: 30, bold: true, color: 'FFFFFF' })],
    }),
    new Paragraph({ shading: { type: ShadingType.CLEAR, color: 'auto', fill: NAVY }, spacing: { before: 0, after: 0 }, children: [run('   Fundaciones y muros de retención', { size: 19, color: '9FB6D6' })] }),
    new Paragraph({ shading: { type: ShadingType.CLEAR, color: 'auto', fill: NAVY }, spacing: { before: 700, after: 0 }, children: [run('   MEMORIA DE CÁLCULO', { size: 60, bold: true, color: 'FFFFFF' })] }),
    new Paragraph({ shading: { type: ShadingType.CLEAR, color: 'auto', fill: NAVY }, spacing: { before: 120, after: 500 }, children: [run('   ' + doc.subtitle, { size: 26, color: 'CFE0F6' })] }),
    new Paragraph({ spacing: { before: 360, after: 200 }, children: [run(doc.title, { size: 34, bold: true, color: NAVY })] }),
    makeKvTable([
      ['Proyecto', info.name],
      ['Cliente', info.client || '—'],
      ['Ubicación', info.location || '—'],
      ['Ingeniero responsable', info.engineer || '—'],
      ['Matrícula / registro', info.license || '—'],
      ['Fecha', info.date],
      ['Revisión', info.revision || '—'],
    ]),
    ...(info.notes ? [new Paragraph({ spacing: { before: 240, after: 0 }, children: [run(info.notes, { size: 19, italics: true, color: MUTED })] })] : []),
    new Paragraph({ spacing: { before: 700, after: 0 }, children: [run('Este documento es una ayuda de cálculo generada automáticamente. Los resultados deben ser revisados, verificados y avalados por un ingeniero responsable antes de su uso en obra.', { size: 16, color: MUTED })] }),
    new Paragraph({ pageBreakBefore: true, children: [run('CONTENIDO', { size: 30, bold: true, color: NAVY })], spacing: { after: 160 } }),
  ];
  for (const b of doc.blocks) {
    if (b.t === 'h1') cover.push(new Paragraph({ spacing: { before: 100, after: 20 }, children: [run(b.text, { size: 20, bold: true })] }));
    if (b.t === 'h2') cover.push(new Paragraph({ spacing: { before: 0, after: 0 }, indent: { left: 360 }, children: [run(b.text, { size: 18, color: MUTED })] }));
  }
  cover.push(new Paragraph({ pageBreakBefore: true, children: [] }));

  const children: (Paragraph | Table)[] = [...cover];
  for (const b of doc.blocks) children.push(...blockToDocx(b, imgs));

  const d = new Document({
    creator: info.engineer || 'TerraStruct',
    title: doc.title,
    description: doc.subtitle,
    styles: { default: { document: { run: { font: FONT, size: 19 } } } },
    numbering: {
      config: [{ reference: 'bul', levels: [{ level: 0, format: LevelFormat.BULLET, text: '•', alignment: AlignmentType.LEFT, style: { paragraph: { indent: { left: 460, hanging: 260 } } } }] }],
    },
    sections: [
      {
        properties: { titlePage: true, page: { size: { width: 11906, height: 16838 }, margin: { top: 1134, bottom: 1134, left: 1134, right: 1134, header: 560, footer: 560 } } },
        headers: {
          default: new Header({ children: [new Paragraph({ border: { bottom: { style: BorderStyle.SINGLE, size: 4, color: GRID, space: 2 } }, children: [run(`${info.name}   |   ${doc.title}`, { size: 15, color: MUTED })] })] }),
          first: new Header({ children: [new Paragraph({ children: [] })] }),
        },
        footers: {
          default: new Footer({
            children: [
              new Paragraph({
                alignment: AlignmentType.RIGHT,
                children: [run(`${doc.footer}     Página `, { size: 15, color: MUTED }), new TextRun({ children: [PageNumber.CURRENT], size: 15, color: MUTED, font: FONT }), run(' de ', { size: 15, color: MUTED }), new TextRun({ children: [PageNumber.TOTAL_PAGES], size: 15, color: MUTED, font: FONT })],
              }),
            ],
          }),
          first: new Footer({ children: [new Paragraph({ children: [] })] }),
        },
        children,
      },
    ],
  });
  return Packer.toBlob(d);
}

function makeKvTable(rows: [string, string][]): Table {
  const w = [Math.round(CONTENT_TW * 0.32), Math.round(CONTENT_TW * 0.68)];
  return new Table({
    width: { size: CONTENT_TW, type: WidthType.DXA },
    columnWidths: w,
    layout: TableLayoutType.FIXED,
    rows: rows.map(([k, v]) => new TableRow({ children: [cell(k, { bold: true, color: NAVY, size: 20, width: w[0] }), cell(v, { size: 20, width: w[1] })] })),
  });
}
