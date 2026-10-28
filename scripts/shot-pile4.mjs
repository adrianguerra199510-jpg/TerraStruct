import { chromium } from 'playwright';
const out = process.argv[2], file = process.argv[3];
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1243/chrome-linux64/chrome' });
const page = await browser.newPage({ viewport: { width: 1500, height: 1000 } });
page.on('pageerror', (e) => console.log('PAGEERROR', e.message));
await page.goto('file://' + file);
await page.waitForTimeout(400);
await page.getByText('Cabezal de 4 pilotes de concreto').click();
await page.waitForTimeout(500);

// aumentar My de la combinación última U3 (0.9D + E) y de la de servicio S2
const rows = page.locator('details:has(summary:has-text("Cargas (envolvente")) table tbody tr');
const n = await rows.count();
for (const idx of [1, 4]) {
  const cells = rows.nth(idx).locator('input[inputmode=decimal], input:not([type=checkbox])');
  const c = await cells.count();
  // última celda numérica antes de Qa/Sismo es My (índice 5 de los inputs: nombre, P, Vx, Vy, Mx, My)
  await cells.nth(5).fill(idx === 1 ? '1200' : '1700');
  await cells.nth(5).blur();
}
await page.getByRole('tab', { name: /Resultados/ }).click();
await page.waitForTimeout(600);
await page.locator('.right').evaluate((e) => e.scrollTo(0, 700));
await page.waitForTimeout(300);
await page.screenshot({ path: out + '/tens.png' });
await browser.close();
