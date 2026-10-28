import { chromium } from 'playwright';
const out = process.argv[2], file = process.argv[3];
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1243/chrome-linux64/chrome' });
const page = await browser.newPage({ viewport: { width: 1500, height: 950 } });
page.on('pageerror', (e) => console.log('PAGEERROR', e.message));
await page.goto('file://' + file);
await page.waitForTimeout(400);
for (const ex of ['Cabezal de 4 pilotes de concreto', 'Cabezal con pilotes de tubo de acero', 'Cabezal con pilotes H de acero']) {
  await page.locator('.nav-btn', { hasText: 'Inicio' }).click();
  await page.getByText(ex).click();
  await page.getByRole('tab', { name: /Memoria/ }).click();
  await page.waitForTimeout(500);
  for (const [lab, ext] of [['Descargar PDF', 'pdf'], ['Descargar Word', 'docx']]) {
    const dl = page.waitForEvent('download', { timeout: 60000 });
    await page.getByText(lab).click();
    const d = await dl;
    const f = `${out}/${ex.slice(0, 18).replace(/\W+/g, '_')}.${ext}`;
    await d.saveAs(f);
    console.log(f);
  }
}
await page.screenshot({ path: out + '/pile-memoria.png' });
await browser.close();
