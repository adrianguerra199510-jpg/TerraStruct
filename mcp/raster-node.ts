// Rasterización SVG → PNG fuera del navegador con resvg (WebAssembly, sin dependencias nativas).
// Las fuentes son las Roboto que ya incluye pdfmake, así el servidor funciona igual en Windows, macOS y Linux.
import { initWasm, Resvg } from '@resvg/resvg-wasm';
import vfsMod from 'pdfmake/build/vfs_fonts';
import { setRasterizer, Png } from '../src/report/raster';

let fonts: Uint8Array[] | null = null;
let ready: Promise<void> | null = null;

function b64(s: string): Uint8Array {
  return new Uint8Array(Buffer.from(s, 'base64'));
}

function loadFonts(): Uint8Array[] {
  if (!fonts) {
    const v: Record<string, string> = (vfsMod as any).vfs ?? (vfsMod as any);
    fonts = Object.keys(v).filter((k) => k.endsWith('.ttf')).map((k) => b64(v[k]));
  }
  return fonts;
}

/** Inicializa resvg con los bytes del .wasm (una sola vez) y lo registra como rasterizador de las memorias. */
export function initNodeRaster(wasm: Uint8Array | ArrayBuffer): Promise<void> {
  if (!ready) {
    ready = initWasm(wasm).then(() => {
      setRasterizer(async (svg, scale) => svgToPngNode(svg, scale));
    });
  }
  return ready;
}

/** El SVG usa «Segoe UI, Arial…»; se sustituye por Roboto, que es la fuente disponible. */
function withFont(svg: string): string {
  return svg.replace(/font-family="[^"]*"/g, 'font-family="Roboto"').replace(/font-family:[^;"]*/g, 'font-family:Roboto');
}

export function svgToPngNode(svg: string, scale = 2): Png {
  const m = svg.match(/viewBox="0 0 ([\d.]+) ([\d.]+)"/);
  const w = m ? parseFloat(m[1]) : 800;
  const h = m ? parseFloat(m[2]) : 500;
  const r = new Resvg(withFont(svg), {
    fitTo: { mode: 'zoom', value: scale },
    background: '#ffffff',
    font: { fontBuffers: loadFonts(), defaultFontFamily: 'Roboto', sansSerifFamily: 'Roboto' },
  });
  const bytes = r.render().asPng();
  return { bytes, width: w, height: h, dataUrl: 'data:image/png;base64,' + Buffer.from(bytes).toString('base64') };
}
