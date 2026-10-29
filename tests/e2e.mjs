import { chromium } from 'playwright-core';
const out = '/workspace/mrr-simulator/screenshots/';
const browser = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox'] });
const page = await browser.newPage({ viewport: { width: 1400, height: 1000 }, locale: 'nl-BE' });
const errors = [];
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
page.on('pageerror', (e) => errors.push(String(e)));
page.on('requestfailed', (r) => errors.push('FAILED ' + r.url()));
await page.goto('http://localhost:8080/', { waitUntil: 'networkidle' });
const kpis = async () => page.evaluate(() => ['kpi-start','kpi-12','kpi-24','kpi-growth','kpi-cust'].map(id => document.getElementById(id).textContent).join(' | '));
console.log('Default:', await kpis(), 'rows:', await page.locator('#table tbody tr').count());

const scen = { groei: [100,50,10,2,3], krimp: [500,80,5,10,2], index: [200,100,0,1,5] };
const keys = ['customers','arpu','newPerMonth','churnPct','indexPct'];
let i = 1;
for (const [name, vals] of Object.entries(scen)) {
  // typ waarden in de velden (test live update via input events)
  for (let k = 0; k < 5; k++) await page.fill('#' + keys[k], String(vals[k]));
  await page.waitForTimeout(400);
  const res = await page.evaluate(() => ({ m12: window.__mrr.rows[12].mrr, m24: window.__mrr.rows[24].mrr }));
  console.log(name, await kpis(), JSON.stringify(res));
  // hover tooltip op maand 13
  const box = await page.locator('#chart').boundingBox();
  await page.mouse.move(box.x + box.width * 0.55, box.y + box.height * 0.5);
  await page.waitForTimeout(400);
  await page.screenshot({ path: `${out}${i++}-${name}.png`, fullPage: false });
}
// validatie
await page.fill('#customers', '-5'); await page.fill('#churnPct', '150'); await page.fill('#arpu', '');
await page.waitForTimeout(200);
console.log('Errors shown:', await page.evaluate(() => [...document.querySelectorAll('.error')].map(e => e.textContent).filter(Boolean)));
console.log('Status:', await page.textContent('#status'));
await page.screenshot({ path: out + '4-validatie.png' });
await page.click('#reset'); await page.waitForTimeout(300);
console.log('After reset:', await kpis(), 'errors left:', await page.locator('input.invalid').count());
// preset knop
await page.click('[data-preset="krimp"]'); await page.waitForTimeout(300);
console.log('Preset krimp:', await kpis());
console.log('Console errors:', errors);
await browser.close();
