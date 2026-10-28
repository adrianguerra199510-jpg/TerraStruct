import { chromium } from 'playwright';
const out = process.argv[2], file = process.argv[3];
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1243/chrome-linux64/chrome' });
const page = await browser.newPage({ viewport: { width: 1500, height: 950 } });
page.on('pageerror', (e) => console.log('PAGEERROR', e.message));
await page.goto('file://' + file);
await page.waitForTimeout(400);
await page.getByText('Mampostería reforzada con contrafuertes externos').first().click();
await page.waitForTimeout(500);
await page.getByRole('tab', { name: /Memoria/ }).click();
await page.waitForTimeout(600);
for (const [lab, ext] of [['Descargar PDF', 'pdf'], ['Descargar Word', 'docx']]) {
  const dl = page.waitForEvent('download', { timeout: 60000 });
  await page.getByText(lab).click();
  const d = await dl;
  await d.saveAs(`${out}/muro-mcf.${ext}`);
}
await browser.close();
