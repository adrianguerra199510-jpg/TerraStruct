// Modelo intermedio de la memoria de cálculo: un solo contenido, dos salidas (PDF y Word).
import { ProjectInfo } from '../state';

export type Align = 'l' | 'c' | 'r';

export type Block =
  | { t: 'h1' | 'h2' | 'h3'; text: string }
  | { t: 'p'; text: string; bold?: boolean; italic?: boolean; align?: 'left' | 'center' | 'right' | 'justify'; small?: boolean }
  | { t: 'bullets'; items: string[] }
  | { t: 'kv'; rows: [string, string][]; cols?: 1 | 2 }
  | { t: 'table'; head: string[]; rows: string[][]; align?: Align[]; widths?: number[]; caption?: string; boldLast?: boolean; small?: boolean }
  | { t: 'eq'; lines: string[]; title?: string }
  | { t: 'img'; svg: string; widthRatio?: number; caption?: string }
  | { t: 'status'; rows: { name: string; detail: string; ratio: number; ok: boolean; advisory?: boolean }[] }
  | { t: 'pagebreak' };

export interface ReportDoc {
  title: string;
  subtitle: string;
  info: ProjectInfo;
  blocks: Block[];
  /** pie de página corto */
  footer: string;
}

/** Ayudante para escribir las secciones con numeración automática. */
export class DocBuilder {
  blocks: Block[] = [];
  private n1 = 0;
  private n2 = 0;
  private n3 = 0;
  constructor(private prefix = '') {}
  h1(text: string) {
    this.n1++;
    this.n2 = 0;
    this.n3 = 0;
    this.blocks.push({ t: 'h1', text: this.prefix ? `${this.prefix}${this.n1}  ${text}` : `${this.n1}. ${text}` });
  }
  h2(text: string) {
    this.n2++;
    this.n3 = 0;
    this.blocks.push({ t: 'h2', text: `${this.prefix}${this.n1}.${this.n2} ${text}` });
  }
  h3(text: string) {
    this.n3++;
    this.blocks.push({ t: 'h3', text: `${this.prefix}${this.n1}.${this.n2}.${this.n3} ${text}` });
  }
  p(text: string, o: Partial<Extract<Block, { t: 'p' }>> = {}) {
    this.blocks.push({ t: 'p', text, ...o });
  }
  bullets(items: string[]) {
    this.blocks.push({ t: 'bullets', items });
  }
  kv(rows: [string, string][], cols: 1 | 2 = 1) {
    this.blocks.push({ t: 'kv', rows, cols });
  }
  table(head: string[], rows: string[][], o: Partial<Extract<Block, { t: 'table' }>> = {}) {
    this.blocks.push({ t: 'table', head, rows, ...o });
  }
  eq(lines: string[], title?: string) {
    this.blocks.push({ t: 'eq', lines, title });
  }
  img(svg: string, caption?: string, widthRatio = 1) {
    this.blocks.push({ t: 'img', svg, caption, widthRatio });
  }
  status(rows: Extract<Block, { t: 'status' }>['rows']) {
    this.blocks.push({ t: 'status', rows });
  }
  pagebreak() {
    this.blocks.push({ t: 'pagebreak' });
  }
}

/** Texto seguro para la fuente Roboto del PDF (no incluye algunas flechas ni fracciones). */
export function pdfSafe(s: string): string {
  return s
    .replace(/→/g, '->')
    .replace(/←/g, '<-')
    .replace(/↑/g, '^')
    .replace(/⅔/g, '2/3')
    .replace(/⅓/g, '1/3')
    .replace(/̄/g, '')
    .replace(/✓/g, 'OK');
}
