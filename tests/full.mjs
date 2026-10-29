// Optionele volledige-pagina-screenshot. De eigenlijke browsercheck is tests/e2e.mjs.
import { mkdirSync } from 'node:fs';
import { chromium } from 'playwright-core';
mkdirSync(new URL('../screenshots/', import.meta.url), { recursive: true });
const b = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox'] });
const p = await b.newPage({ viewport: { width: 1400, height: 1000 } });
await p.goto('http://localhost:8080/?compare=1&preset=groei&presetB=krimp', { waitUntil: 'networkidle' });
await p.waitForTimeout(500);
await p.screenshot({ path: new URL('../screenshots/vergelijking.png', import.meta.url).pathname, fullPage: true });
await b.close();
