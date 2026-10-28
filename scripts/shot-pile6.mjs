import { chromium } from 'playwright';
const out = process.argv[2], file = process.argv[3];
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1243/chrome-linux64/chrome' });
const page = await browser.newPage({ viewport: { width: 1500, height: 1000 } });
page.on('pageerror', (e) => console.log('PAGEERROR', e.message));
await page.goto('file://' + file);
await page.waitForTimeout(400);
const items = [['Cabezal triangular de 3 pilotes', 'tri'], ['Cabezal circular de 7 pilotes', 'circ'], ['Cabezal en L de esquina', 'L']];
for (const [name, tag] of items) {
  await page.locator('.nav-btn', { hasText: 'Inicio' }).click();
  await page.getByText(name).click();
  await page.waitForTimeout(500);
  await page.screenshot({ path: `${out}/cap-${tag}-planta.png` });
  await page.getByRole('tab', { name: /Armado/ }).click();
  await page.waitForTimeout(400);
  await page.screenshot({ path: `${out}/cap-${tag}-armado.png` });
  await page.getByRole('tab', { name: /Resultados/ }).click();
  await page.waitForTimeout(400);
  await page.screenshot({ path: `${out}/cap-${tag}-res.png` });
}
await browser.close();
