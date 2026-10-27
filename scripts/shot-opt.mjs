import { chromium } from 'playwright';
const out = process.argv[2];
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1243/chrome-linux64/chrome' });
const page = await b.newPage({ viewport: { width: 1500, height: 950 } });
page.on('pageerror', (e) => console.log('PAGEERROR', e.message));
await page.goto('http://localhost:4173/');
// zapata combinada con acero superior
await page.getByText('Zapata combinada (2 columnas)').click();
await page.locator('label.check', { hasText: 'Con acero superior' }).click();
await page.getByRole('tab', { name: /Armado/ }).click(); await page.waitForTimeout(500);
await page.locator('.split > .right').evaluate((e) => (e.scrollTop = 560));
await page.waitForTimeout(200);
await page.screenshot({ path: `${out}/opt-zapata-top.png` });
// muro de mampostería reforzada con bloque 12
await page.locator('.nav-btn', { hasText: 'Inicio' }).click();
await page.getByText('Mampostería reforzada en voladizo').click();
await page.locator('.field', { has: page.locator('label:text-is("Tipo de bloque")') }).locator('select').selectOption('12');
await page.waitForTimeout(400);
await page.screenshot({ path: `${out}/opt-mamp.png` });
// muro cantilever con cara opuesta
await page.locator('.nav-btn', { hasText: 'Inicio' }).click();
await page.getByText('Voladizo de concreto armado').click();
await page.locator('summary', { hasText: 'Materiales y armado' }).click(); await page.locator('label.check', { hasText: 'cara opuesta' }).click();
await page.getByRole('tab', { name: /Armado/ }).click(); await page.waitForTimeout(500);
await page.screenshot({ path: `${out}/opt-muro-opp.png` });
await b.close();
