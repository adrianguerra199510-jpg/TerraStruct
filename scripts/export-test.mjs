// Prueba extremo a extremo: descarga las memorias (PDF y Word) desde la interfaz.
import { chromium } from 'playwright';
import fs from 'node:fs';
const out = process.argv[2];
const base = process.argv[3] || 'http://localhost:4173/';
fs.mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1243/chrome-linux64/chrome' });
const ctx = await browser.newContext({ viewport: { width: 1500, height: 950 }, acceptDownloads: true });
const page = await ctx.newPage();
page.on('pageerror', (e) => console.log('PAGEERROR', e.message));
page.on('console', (m) => { if (m.type() === 'error') console.log('CONSOLE', m.text()); });
await page.goto(base);
await page.waitForTimeout(400);

async function grab(label, file) {
  const [dl] = await Promise.all([page.waitForEvent('download', { timeout: 120000 }), page.getByRole('button', { name: label }).click()]);
  await dl.saveAs(`${out}/${file}`);
  console.log('guardado', file, fs.statSync(`${out}/${file}`).size, 'bytes');
}

await page.getByText('Diseñar una fundación').click();
await page.getByRole('tab', { name: /Memoria/ }).click();
await grab(/Descargar PDF/, 'footing.pdf');
await grab(/Descargar Word/, 'footing.docx');

await page.locator('.nav-btn', { hasText: 'Muro M-1' }).click();
await page.getByRole('tab', { name: /Memoria/ }).click();
await grab(/Descargar PDF/, 'wall.pdf');
await grab(/Descargar Word/, 'wall.docx');

await page.locator('.nav-btn', { hasText: 'Proyecto y memoria' }).click();
await grab(/Descargar PDF/, 'project.pdf');
await grab(/Descargar Word/, 'project.docx');
await browser.close();
