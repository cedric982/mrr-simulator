import { chromium } from 'playwright-core';
const b = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox'] });
const p = await b.newPage({ viewport: { width: 1400, height: 1000 } });
await p.goto('http://localhost:8080/?preset=krimp', { waitUntil: 'networkidle' }); await p.waitForTimeout(500);
await p.screenshot({ path: '/workspace/mrr-simulator/screenshots/5-volledige-pagina-hoge-churn.png', fullPage: true });
await b.close();
