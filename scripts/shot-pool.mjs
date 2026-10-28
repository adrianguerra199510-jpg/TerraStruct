import { chromium } from 'playwright';
const out = process.argv[2], file = process.argv[3];
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1243/chrome-linux64/chrome' });
const page = await browser.newPage({ viewport: { width: 1500, height: 1000 } });
page.on('pageerror', (e) => console.log('PAGEERROR', e.message));
page.on('console', (m) => { if (m.type() === 'error') console.log('CONSOLE', m.text()); });
await page.goto('file://' + file);
await page.waitForTimeout(400);
await page.getByText('Muro de piscina de concreto').click();
await page.waitForTimeout(700);
await page.screenshot({ path: out + '/pool1.png' });
await page.getByRole('button', { name: /Piscina vacía/ }).click();
await page.waitForTimeout(400);
await page.screenshot({ path: out + '/pool2.png' });
await page.getByRole('tab', { name: /Diagramas/ }).click();
await page.getByRole('button', { name: /Piscina llena/ }).click();
await page.waitForTimeout(500);
await page.screenshot({ path: out + '/pool3.png' });
await page.getByRole('tab', { name: /Memoria/ }).click();
await page.waitForTimeout(500);
for (const [lab, ext] of [['Descargar PDF', 'pdf']]) {
  const dl = page.waitForEvent('download', { timeout: 60000 });
  await page.getByText(lab).click();
  const d = await dl;
  await d.saveAs(`${out}/pool.${ext}`);
}
await browser.close();
