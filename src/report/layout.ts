import { Block } from './model';

/** Pesos relativos de columnas de una tabla según el contenido (para repartir el ancho). */
export function colWeights(b: Extract<Block, { t: 'table' }>): number[] {
  if (b.widths) return b.widths;
  const n = b.head.length;
  const w: number[] = [];
  for (let c = 0; c < n; c++) {
    let m = (b.head[c] ?? '').length * 0.8;
    for (const r of b.rows) m = Math.max(m, Math.min((r[c] ?? '').length, 38));
    w.push(Math.max(m, 4) + 1.5);
  }
  return w;
}
