// Headless browsercheck: presets, validatie, vergelijkmodus en URL-parameters.
// Start zelf een statische server. Vereist playwright-core en Chrome.
import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import assert from 'node:assert/strict';
import { chromium } from 'playwright-core';
import { simulate, summarize, compareScenarios, DEFAULTS } from '../calc.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const port = 8091;
const base = `http://127.0.0.1:${port}`;
const shots = '/tmp/mrr-e2e';
mkdirSync(shots, { recursive: true });
const KEYS = ['customers', 'arpu', 'newPerMonth', 'churnPct', 'indexPct'];
const PRESETS = {
  groei: { customers: 100, arpu: 50, newPerMonth: 10, churnPct: 2, indexPct: 3 },
  krimp: { customers: 500, arpu: 80, newPerMonth: 5, churnPct: 10, indexPct: 2 },
  index: { customers: 200, arpu: 100, newPerMonth: 0, churnPct: 1, indexPct: 5 },
};

const server = spawn('python3', ['-m', 'http.server', String(port), '--bind', '127.0.0.1'], {
  cwd: root,
  stdio: 'ignore',
});

function close(a, b, eps = 1e-6) {
  assert.ok(Math.abs(a - b) <= eps, `${a} ≠ ${b}`);
}

async function waitForServer() {
  for (let i = 0; i < 50; i++) {
    try {
      const res = await fetch(base + '/');
      if (res.ok) return;
    } catch { /* nog niet open */ }
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error('http.server startte niet');
}

function rowsClose(actual, expected) {
  assert.equal(actual.length, expected.length);
  for (let i = 0; i < expected.length; i++) {
    close(actual[i].mrr, expected[i].mrr, 1e-6);
    close(actual[i].customers, expected[i].customers, 1e-6);
  }
}

async function readInputs(page, prefix = '') {
  return page.evaluate(({ keys, prefix }) => {
    const out = {};
    for (const k of keys) out[k] = document.getElementById(prefix + k).value;
    return out;
  }, { keys: KEYS, prefix });
}

async function chartInfo(page) {
  return page.evaluate(() => {
    const chart = Chart.getChart(document.getElementById('chart'));
    const cb = chart.options.plugins.tooltip.callbacks;
    const label = (datasetIndex) => cb.label({
      dataset: chart.data.datasets[datasetIndex],
      parsed: { y: chart.data.datasets[datasetIndex].data[12] },
      dataIndex: 12,
    });
    return {
      labels: chart.data.datasets.map((d) => d.label),
      colors: chart.data.datasets.map((d) => d.borderColor),
      data: chart.data.datasets.map((d) => d.data),
      y1: !!chart.options.scales.y1,
      tip0: label(0),
      tip1: chart.data.datasets[1] ? label(1) : null,
      after: cb.afterBody([{ dataIndex: 12 }]),
      aria: document.getElementById('chart').getAttribute('aria-label'),
    };
  });
}

const browser = await chromium.launch({
  executablePath: '/usr/bin/google-chrome',
  args: ['--no-sandbox', '--disable-dev-shm-usage'],
});
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 }, locale: 'nl-BE' });
const errors = [];
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
page.on('pageerror', (e) => errors.push(String(e)));
page.on('requestfailed', (r) => errors.push('FAILED ' + r.url()));

try {
  await waitForServer();

  // --- standaard: één scenario, voorbeelddata ---
  await page.goto(base + '/', { waitUntil: 'networkidle' });
  await page.waitForFunction(() => window.__mrr && window.__mrr.rows);
  const defaults = simulate(DEFAULTS);
  const defSummary = summarize(defaults);
  let state = await page.evaluate(() => window.__mrr);
  rowsClose(state.rows, defaults);
  close(state.summary.mrr12, defSummary.mrr12);
  close(state.summary.mrr24, defSummary.mrr24);
  assert.equal(state.compare, false);
  assert.equal(await page.locator('#table tbody tr').count(), 25);
  assert.equal(await page.locator('#panel-b').isHidden(), true);
  assert.equal(await page.locator('#compare-summary').isHidden(), true);
  assert.equal(await page.locator('#inputs-title-text').textContent(), 'Invoer');
  const defInputs = await readInputs(page);
  for (const k of KEYS) assert.equal(Number(defInputs[k]), DEFAULTS[k]);
  let chart = await chartInfo(page);
  assert.deepEqual(chart.labels, ['MRR', 'Klanten']);
  assert.equal(chart.y1, true);
  assert.equal(chart.data[0].length, 25);
  assert.match(chart.tip0, /MRR:/);
  assert.match(chart.tip1, /Klanten:/);
  assert.ok(chart.after.some((line) => line.startsWith('Prijs/klant:')));
  const how = await page.locator('.how').innerText();
  assert.match(how, /Maand 0/);
  assert.match(how, /Prijsindexatie/);
  assert.match(how, /vergelijking/);
  const panelBox = await page.locator('#panel-a').boundingBox();
  const chartBox = await page.locator('#chart').boundingBox();
  assert.ok(panelBox.x + panelBox.width <= chartBox.x + 2, 'invoerpaneel staat links van de grafiek');

  // --- presets via knoppen + live invoer ---
  for (const [name, values] of Object.entries(PRESETS)) {
    await page.click(`[data-preset="${name}"]`);
    await page.waitForFunction((n) => window.__mrr && window.__mrr.rows[0].customers === n, values.customers);
    const got = await readInputs(page);
    for (const k of KEYS) assert.equal(Number(got[k]), values[k], name + ' ' + k);
    const expected = simulate(values);
    state = await page.evaluate(() => window.__mrr);
    rowsClose(state.rows, expected);
    const kpis = await page.evaluate(() => ({
      start: document.getElementById('kpi-start').textContent,
      m12: document.getElementById('kpi-12').textContent,
      m24: document.getElementById('kpi-24').textContent,
      growth: document.getElementById('kpi-growth').textContent,
      cust: document.getElementById('kpi-cust').textContent,
    }));
    assert.notEqual(kpis.start, '–');
    assert.match(kpis.start, /€/);
    assert.match(kpis.m12, /€/);
    assert.match(kpis.m24, /€/);
    assert.match(kpis.growth, /%|n\.v\.t\./);
    assert.ok(kpis.cust.length > 0);
  }

  // live update door te typen (niet via presetknop)
  await page.fill('#customers', '80');
  await page.fill('#arpu', '25');
  await page.fill('#newPerMonth', '4');
  await page.fill('#churnPct', '1');
  await page.fill('#indexPct', '2');
  await page.waitForFunction(() => window.__mrr.rows[0].customers === 80 && window.__mrr.rows[0].price === 25);
  state = await page.evaluate(() => window.__mrr);
  rowsClose(state.rows, simulate({ customers: 80, arpu: 25, newPerMonth: 4, churnPct: 1, indexPct: 2 }));

  // --- validatie houdt laatste geldige grafiek ---
  const beforeInvalid = state.rows[24].mrr;
  await page.fill('#customers', '-5');
  await page.fill('#churnPct', '150');
  await page.fill('#arpu', '');
  await page.waitForFunction(() => document.getElementById('status').textContent.length > 0);
  const messages = await page.evaluate(() => [...document.querySelectorAll('#form .error')].map((e) => e.textContent).filter(Boolean));
  assert.ok(messages.some((m) => /niet negatief/.test(m)), messages.join(' | '));
  assert.ok(messages.some((m) => /verplicht/.test(m)), messages.join(' | '));
  assert.ok(messages.some((m) => /tussen 0 en 100/.test(m)), messages.join(' | '));
  assert.equal(await page.locator('#customers.invalid').count(), 1);
  assert.equal(await page.locator('#arpu.invalid').count(), 1);
  assert.equal(await page.locator('#churnPct.invalid').count(), 1);
  assert.match(await page.textContent('#status'), /Corrigeer de gemarkeerde velden/);
  state = await page.evaluate(() => window.__mrr);
  close(state.rows[24].mrr, beforeInvalid);
  chart = await chartInfo(page);
  close(chart.data[0][24], beforeInvalid);

  await page.click('#reset');
  await page.waitForFunction(() => window.__mrr.rows[0].customers === 120 && document.getElementById('status').textContent === '');
  assert.equal(await page.locator('input.invalid').count(), 0);
  assert.equal(await page.locator('.error').evaluateAll((els) => els.every((e) => e.textContent === '')), true);
  state = await page.evaluate(() => window.__mrr);
  rowsClose(state.rows, defaults);

  // --- URL achterwaarts compatibel ---
  await page.goto(base + '/?preset=krimp', { waitUntil: 'networkidle' });
  await page.waitForFunction(() => window.__mrr && window.__mrr.rows[0].customers === 500);
  state = await page.evaluate(() => window.__mrr);
  rowsClose(state.rows, simulate(PRESETS.krimp));
  assert.equal(state.compare, false);
  assert.equal(await page.locator('#panel-b').isHidden(), true);

  await page.goto(base + '/?preset=krimp&customers=42', { waitUntil: 'networkidle' });
  await page.waitForFunction(() => window.__mrr && window.__mrr.rows[0].customers === 42);
  const mixed = await readInputs(page);
  assert.equal(Number(mixed.customers), 42);
  assert.equal(Number(mixed.arpu), PRESETS.krimp.arpu);
  assert.equal(Number(mixed.churnPct), PRESETS.krimp.churnPct);

  await page.goto(base + '/?customers=10&arpu=10&newPerMonth=1&churnPct=1&indexPct=1', { waitUntil: 'networkidle' });
  await page.waitForFunction(() => window.__mrr && window.__mrr.rows[0].customers === 10 && window.__mrr.rows[0].price === 10);
  state = await page.evaluate(() => window.__mrr);
  rowsClose(state.rows, simulate({ customers: 10, arpu: 10, newPerMonth: 1, churnPct: 1, indexPct: 1 }));
  assert.equal(await page.locator('#panel-b').isHidden(), true);

  await page.goto(base + '/?preset=bestaatniet', { waitUntil: 'networkidle' });
  await page.waitForFunction(() => window.__mrr && window.__mrr.rows[0].customers === 120);

  // --- vergelijkmodus via de knop ---
  await page.goto(base + '/', { waitUntil: 'networkidle' });
  await page.waitForFunction(() => window.__mrr);
  await page.click('#mode-compare');
  await page.waitForFunction(() => document.body.classList.contains('compare') && window.__mrr.compare === true);
  assert.equal(await page.locator('#panel-b').isVisible(), true);
  assert.equal(await page.locator('#compare-summary').isVisible(), true);
  assert.equal(await page.locator('#inputs-title-text').textContent(), 'Scenario A');
  assert.equal(await page.getAttribute('#mode-compare', 'aria-pressed'), 'true');
  assert.equal(await page.getAttribute('#mode-single', 'aria-pressed'), 'false');
  // beide starten op voorbeelddata → gelijk
  state = await page.evaluate(() => window.__mrr);
  rowsClose(state.rows, defaults);
  rowsClose(state.rowsB, defaults);
  close(state.comparison.mrr12.diff, 0);
  close(state.comparison.mrr24.diff, 0);
  assert.match(await page.textContent('#cmp-hint'), /dezelfde MRR/);
  chart = await chartInfo(page);
  assert.deepEqual(chart.labels, ['Scenario A', 'Scenario B']);
  assert.notEqual(chart.colors[0], chart.colors[1]);
  assert.equal(chart.y1, false);
  assert.match(chart.tip0, /Scenario A:/);
  assert.match(chart.tip1, /Scenario B:/);
  assert.ok(chart.after.some((line) => /Verschil B−A:/.test(line)));
  assert.match(chart.aria, /scenario A en scenario B/);
  const aBox = await page.locator('#panel-a').boundingBox();
  const bBox = await page.locator('#panel-b').boundingBox();
  const summaryBox = await page.locator('#compare-summary').boundingBox();
  assert.ok(bBox.x >= aBox.x + aBox.width - 2, 'scenario B staat rechts van A');
  assert.ok(summaryBox.y >= aBox.y + aBox.height - 2, 'vergelijking staat onder de invoer');

  // preset per scenario: A = groei, B = krimp
  await page.click('[data-preset="groei"]');
  await page.click('[data-preset-b="krimp"]');
  await page.waitForFunction(() => window.__mrr.rows[0].customers === 100 && window.__mrr.rowsB[0].customers === 500);
  const rowsA = simulate(PRESETS.groei);
  const rowsB = simulate(PRESETS.krimp);
  const cmp = compareScenarios(rowsA, rowsB);
  state = await page.evaluate(() => window.__mrr);
  rowsClose(state.rows, rowsA);
  rowsClose(state.rowsB, rowsB);
  close(state.comparison.mrr12.diff, cmp.mrr12.diff);
  close(state.comparison.mrr24.diff, cmp.mrr24.diff);
  close(state.comparison.mrr12.pct, cmp.mrr12.pct);
  close(state.comparison.mrr24.pct, cmp.mrr24.pct);
  const cmpText = await page.evaluate(() => ({
    a12: document.getElementById('cmp-12-a').textContent,
    b12: document.getElementById('cmp-12-b').textContent,
    d12: document.getElementById('cmp-12-d').textContent,
    a24: document.getElementById('cmp-24-a').textContent,
    b24: document.getElementById('cmp-24-b').textContent,
    d24: document.getElementById('cmp-24-d').textContent,
  }));
  assert.match(cmpText.a12, /€/);
  assert.match(cmpText.b12, /€/);
  assert.match(cmpText.a24, /€/);
  assert.match(cmpText.b24, /€/);
  assert.match(cmpText.d12, /%|n\.v\.t\./);
  assert.match(cmpText.d24, /%|n\.v\.t\./);
  assert.notEqual(cmpText.a24, cmpText.b24);
  // tabel toont beide MRR-kolommen
  const header = await page.locator('#table thead').innerText();
  assert.match(header, /MRR A/);
  assert.match(header, /MRR B/);
  assert.match(header, /Δ B − A/);
  const row12 = await page.locator('#table tbody tr').nth(12).innerText();
  assert.match(row12, /12/);

  chart = await chartInfo(page);
  for (let i = 0; i < 25; i++) {
    close(chart.data[0][i], rowsA[i].mrr, 1e-4);
    close(chart.data[1][i], rowsB[i].mrr, 1e-4);
  }
  assert.match(chart.tip0, /€/);
  assert.match(chart.tip1, /€/);
  assert.notEqual(chart.tip0, chart.tip1);

  // tooltip zichtbaar op het canvas (maand 12)
  await page.locator('#chart').scrollIntoViewIfNeeded();
  const point = await page.evaluate(() => {
    const c = Chart.getChart(document.getElementById('chart'));
    const pt = c.getDatasetMeta(0).data[12].getProps(['x', 'y'], true);
    const rect = c.canvas.getBoundingClientRect();
    return { x: rect.x + pt.x, y: rect.y + pt.y };
  });
  await page.mouse.move(point.x, point.y);
  await page.waitForTimeout(400);
  await page.screenshot({ path: path.join(shots, 'compare_chart_tooltip.png') });

  await page.screenshot({ path: path.join(shots, 'compare_groei_vs_krimp.png'), fullPage: true });

  // Kopieer A naar B maakt het verschil 0, zonder A te wijzigen
  await page.click('#copy-a-to-b');
  await page.waitForFunction(() => window.__mrr.rowsB[0].customers === 100 && window.__mrr.comparison.mrr24.diff === 0);
  const copiedA = await readInputs(page);
  const copiedB = await readInputs(page, 'b-');
  for (const k of KEYS) assert.equal(copiedA[k], copiedB[k]);
  assert.equal(Number(copiedA.customers), PRESETS.groei.customers);
  state = await page.evaluate(() => window.__mrr);
  close(state.comparison.mrr12.diff, 0);
  close(state.comparison.mrr24.pct, 0);

  // reset herstelt alleen A; vergelijkmodus blijft aan
  await page.click('#reset');
  await page.waitForFunction(() => window.__mrr.rows[0].customers === 120);
  assert.equal(await page.evaluate(() => document.body.classList.contains('compare')), true);
  const afterResetB = await readInputs(page, 'b-');
  assert.equal(Number(afterResetB.customers), PRESETS.groei.customers);

  // ongeldige B laat A en de laatste B-lijn staan
  const bBefore = (await page.evaluate(() => window.__mrr.rowsB[24].mrr));
  const aBefore = (await page.evaluate(() => window.__mrr.rows[24].mrr));
  await page.fill('#b-churnPct', '150');
  await page.waitForFunction(() => document.getElementById('b-churnPct-error').textContent.length > 0);
  assert.match(await page.textContent('#b-churnPct-error'), /tussen 0 en 100/);
  assert.match(await page.textContent('#status'), /Corrigeer de gemarkeerde velden/);
  assert.equal(await page.locator('#customers-error').textContent(), '');
  state = await page.evaluate(() => window.__mrr);
  close(state.rows[24].mrr, aBefore);
  close(state.rowsB[24].mrr, bBefore);

  // terug naar één scenario: klantenlijn en verborgen B
  await page.click('#mode-single');
  await page.waitForFunction(() => window.__mrr.compare === false);
  assert.equal(await page.locator('#panel-b').isHidden(), true);
  assert.equal(await page.locator('#compare-summary').isHidden(), true);
  assert.equal(await page.locator('#inputs-title-text').textContent(), 'Invoer');
  chart = await chartInfo(page);
  assert.deepEqual(chart.labels, ['MRR', 'Klanten']);
  assert.equal(chart.y1, true);
  assert.equal(chart.data[0].length, 25);
  assert.equal(chart.data[1].length, 25);
  state = await page.evaluate(() => window.__mrr);
  rowsClose(state.rows, simulate(DEFAULTS));
  assert.equal(state.rowsB, null);

  // --- URL compare + presetB en losse B-parameters ---
  await page.goto(base + '/?compare=1&preset=groei&presetB=index', { waitUntil: 'networkidle' });
  await page.waitForFunction(() => window.__mrr && window.__mrr.compare && window.__mrr.rowsB);
  state = await page.evaluate(() => window.__mrr);
  rowsClose(state.rows, simulate(PRESETS.groei));
  rowsClose(state.rowsB, simulate(PRESETS.index));
  const urlCmp = compareScenarios(simulate(PRESETS.groei), simulate(PRESETS.index));
  close(state.comparison.mrr24.diff, urlCmp.mrr24.diff);
  assert.equal(await page.locator('#panel-b').isVisible(), true);
  assert.match(await page.textContent('#cmp-24-d'), /%|n\.v\.t\./);

  await page.goto(base + '/?compare=true&customers=10&arpu=20&newPerMonth=1&churnPct=0&indexPct=0&customersB=10&arpuB=40&newPerMonthB=1&churnPctB=0&indexPctB=0', { waitUntil: 'networkidle' });
  await page.waitForFunction(() => window.__mrr && window.__mrr.comparison);
  state = await page.evaluate(() => window.__mrr);
  const expA = simulate({ customers: 10, arpu: 20, newPerMonth: 1, churnPct: 0, indexPct: 0 });
  const expB = simulate({ customers: 10, arpu: 40, newPerMonth: 1, churnPct: 0, indexPct: 0 });
  rowsClose(state.rows, expA);
  rowsClose(state.rowsB, expB);
  close(state.rowsB[24].mrr, state.rows[24].mrr * 2, 1e-6);
  assert.equal(await page.locator('#b-arpu').inputValue(), '40');

  // B-parameters zonder compare=1 wijzigen de zichtbare weergave niet
  await page.goto(base + '/?preset=index&presetB=krimp&customersB=7', { waitUntil: 'networkidle' });
  await page.waitForFunction(() => window.__mrr && window.__mrr.rows[0].customers === 200);
  assert.equal(await page.evaluate(() => window.__mrr.compare), false);
  assert.equal(await page.locator('#panel-b').isHidden(), true);
  await page.click('#mode-compare');
  await page.waitForFunction(() => window.__mrr.compare && window.__mrr.rowsB && window.__mrr.rowsB[0].customers === 7);
  const bInputs = await readInputs(page, 'b-');
  assert.equal(Number(bInputs.customers), 7);
  assert.equal(Number(bInputs.arpu), PRESETS.krimp.arpu);

  // smal scherm: geen horizontale overflow, panelen onder elkaar
  await page.setViewportSize({ width: 390, height: 800 });
  await page.waitForTimeout(200);
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1);
  assert.equal(overflow, false);
  const narrowA = await page.locator('#panel-a').boundingBox();
  const narrowB = await page.locator('#panel-b').boundingBox();
  assert.ok(narrowB.y >= narrowA.y + narrowA.height - 2);

  assert.deepEqual(errors, [], 'console/netwerkfouten: ' + errors.join('\n'));
  console.log('e2e ok');
} finally {
  await browser.close();
  server.kill();
}
