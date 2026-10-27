// Genera los PNG/ICO de la aplicación a partir de public/icon.svg
import sharp from 'sharp';
import pngToIco from 'png-to-ico';
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const svg = fs.readFileSync(path.join(root, 'public/icon.svg'));
const out = path.join(root, 'public/icons');
fs.mkdirSync(out, { recursive: true });

const sizes = [16, 32, 48, 64, 128, 180, 192, 256, 512];
for (const s of sizes) {
  await sharp(svg, { density: 384 }).resize(s, s).png().toFile(path.join(out, `icon-${s}.png`));
}
// Icono "maskable": el dibujo ocupa el 70 % central sobre el color de fondo
const inner = await sharp(svg, { density: 384 }).resize(360, 360).png().toBuffer();
await sharp({ create: { width: 512, height: 512, channels: 4, background: '#0f3a66' } })
  .composite([{ input: inner, gravity: 'center' }])
  .png()
  .toFile(path.join(out, 'maskable-512.png'));

const ico = await pngToIco(['16', '32', '48', '256'].map((s) => path.join(out, `icon-${s}.png`)));
fs.writeFileSync(path.join(root, 'public/favicon.ico'), ico);
fs.copyFileSync(path.join(out, 'icon-512.png'), path.join(root, 'public/icon-512.png'));
console.log('Iconos generados en', out);

// Icono incrustado (base64) para la carátula de las memorias
const b64 = fs.readFileSync(path.join(out, 'icon-128.png')).toString('base64');
fs.mkdirSync(path.join(root, 'src/report'), { recursive: true });
fs.writeFileSync(path.join(root, 'src/report/iconData.ts'), `// Generado por scripts/make-icons.mjs\nexport const ICON_PNG = 'data:image/png;base64,${b64}';\n`);
