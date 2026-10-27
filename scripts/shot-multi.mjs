import { chromium } from 'playwright';
const out = process.argv[2];
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1243/chrome-linux64/chrome' });
const page = await b.newPage({ viewport: { width: 1500, height: 1000 } });
page.on('pageerror', (e) => console.log('PAGEERROR', e.message));
await page.goto('http://localhost:4173/');
await page.getByText('Diseñar una fundación').click();
const setField = async (label, v, nth = 0) => { const f = page.locator('.field', { has: page.locator(`label:text-is("${label}")`) }).nth(nth).locator('input'); await f.fill(String(v)); };
await setField('Ancho B (x)', 6.4); await setField('Largo L (y)', 5.2); await setField('Espesor h', 0.9);
const pos = [[-2.2, -1.6], [2.2, -1.6], [-2.2, 1.6], [2.2, 1.6]];
for (let i = 0; i < 4; i++) {
  if (i > 0) await page.getByRole('button', { name: /Columna/ }).last().click();
  await setField('Posición x', pos[i][0]); await setField('Posición y', pos[i][1]);
}
// una quinta columna circular central
await page.getByRole('button', { name: /Columna/ }).last().click();
await page.locator('.field', { has: page.locator('label:text-is("Forma de la columna")') }).locator('select').selectOption('circle');
await setField('Posición x', 0); await setField('Posición y', 0);
await page.waitForTimeout(500);
await page.screenshot({ path: `${out}/multi-planta.png` });
await page.getByRole('tab', { name: /Resultados/ }).click(); await page.waitForTimeout(400);
await page.screenshot({ path: `${out}/multi-resultados.png` });
await page.getByRole('tab', { name: /Armado/ }).click(); await page.waitForTimeout(400);
await page.screenshot({ path: `${out}/multi-armado.png` });
await b.close();
