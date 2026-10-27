// Conversión de SVG (texto) a PNG mediante canvas, para incrustar las figuras en PDF y Word.

export interface Png {
  dataUrl: string;
  bytes: Uint8Array;
  width: number;
  height: number;
}

export async function svgToPng(svg: string, scale = 2): Promise<Png> {
  const m = svg.match(/viewBox="0 0 ([\d.]+) ([\d.]+)"/);
  const w = m ? parseFloat(m[1]) : 800;
  const h = m ? parseFloat(m[2]) : 500;
  const img = new Image();
  img.decoding = 'sync';
  const url = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
  await new Promise<void>((res, rej) => {
    img.onload = () => res();
    img.onerror = () => rej(new Error('No se pudo rasterizar una figura'));
    img.src = url;
  });
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(w * scale);
  canvas.height = Math.round(h * scale);
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  const dataUrl = canvas.toDataURL('image/png');
  const bin = atob(dataUrl.split(',')[1]);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return { dataUrl, bytes, width: w, height: h };
}

export async function rasterizeAll(svgs: string[]): Promise<Map<string, Png>> {
  const out = new Map<string, Png>();
  for (const s of svgs) {
    if (!out.has(s)) out.set(s, await svgToPng(s));
  }
  return out;
}
