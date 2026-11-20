// PDF en Node con la versión de servidor de pdfmake (la versión de navegador usa Web Workers) y las fuentes Roboto incluidas.
// @ts-ignore: módulo CommonJS sin tipos propios
import pdfmakeServer from 'pdfmake/js/index.js';
import vfsMod from 'pdfmake/build/vfs_fonts';
import { ReportDoc } from '../src/report/model';
import { buildPdfDefinition } from '../src/report/pdf';

let ready = false;
function init(): any {
  const pm: any = (pdfmakeServer as any).default ?? pdfmakeServer;
  if (!ready) {
    const v: Record<string, string> = (vfsMod as any).vfs ?? (vfsMod as any);
    for (const [k, b64] of Object.entries(v)) pm.virtualfs.writeFileSync(k, Buffer.from(b64, 'base64'));
    pm.setFonts({ Roboto: { normal: 'Roboto-Regular.ttf', bold: 'Roboto-Medium.ttf', italics: 'Roboto-Italic.ttf', bolditalics: 'Roboto-MediumItalic.ttf' } });
    // la memoria no necesita leer archivos locales ni descargar recursos
    pm.setUrlAccessPolicy(() => false);
    pm.setLocalAccessPolicy(() => false);
    ready = true;
  }
  return pm;
}

export async function makePdfBytes(doc: ReportDoc): Promise<Uint8Array> {
  const pm = init();
  const def = await buildPdfDefinition(doc);
  const buf: Buffer = await pm.createPdf(def).getBuffer();
  return new Uint8Array(buf);
}
