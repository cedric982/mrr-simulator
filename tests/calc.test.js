// Unit tests voor calc.js. Verwachte waarden zijn onafhankelijk berekend met de
// gesloten formule c_m = c0*q^m + n*(1-q^m)/(1-q), q = 1 - churn (Python Decimal, 40 digits)
// en voor de eenvoudige gevallen met de hand.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { simulate, summarize, validateInputs, parseNumber, fmtEur, fmtPct, DEFAULTS } from '../calc.js';

const close = (a, b, eps = 1e-6) => assert.ok(Math.abs(a - b) <= eps, `${a} ≠ ${b}`);

test('Scenario 1 – groeiend SaaS-bedrijf (100 klanten, €50, +10/mnd, 2% churn, 3% index)', () => {
  const r = simulate({ customers: 100, arpu: 50, newPerMonth: 10, churnPct: 2, indexPct: 3 });
  assert.equal(r.length, 25);
  close(r[0].mrr, 5000);
  close(r[1].customers, 108);                 // 100*0,98 + 10
  close(r[1].mrr, 5400);
  close(r[12].customers, 186.113311, 1e-6);
  close(r[12].mrr, 9305.6655, 1e-4);
  close(r[12].price, 50);                     // nog geen indexatie in jaar 1
  close(r[13].price, 51.5);                   // indexatie in maand 13
  close(r[13].mrr, 9908.1388, 1e-4);
  close(r[24].mrr, 13064.9251, 1e-4);
  const s = summarize(r);
  close(s.growthPct, (13064.9251 / 5000 - 1) * 100, 1e-3); // ≈ +161,3 %
  close(s.customers24, 253.687865, 1e-6);
});

test('Scenario 2 – hoge churn, krimpend (500 klanten, €80, +5/mnd, 10% churn, 2% index)', () => {
  const r = simulate({ customers: 500, arpu: 80, newPerMonth: 5, churnPct: 10, indexPct: 2 });
  close(r[0].mrr, 40000);
  close(r[1].customers, 455);                 // 500*0,9 + 5
  close(r[12].mrr, 14167.4633, 1e-4);
  close(r[24].mrr, 7009.0238, 1e-4);
  close(r[24].customers, 85.894899, 1e-6);
  assert.ok(summarize(r).growthPct < -80);
});

test('Scenario 3 – nul nieuwe klanten met indexatie (200 klanten, €100, 0/mnd, 1% churn, 5% index)', () => {
  const r = simulate({ customers: 200, arpu: 100, newPerMonth: 0, churnPct: 1, indexPct: 5 });
  close(r[12].mrr, 17727.6974, 1e-4);
  close(r[13].price, 105);
  close(r[24].mrr, 16499.2410, 1e-4);
  // indexatie zorgt voor een sprong omhoog in maand 13 ondanks churn
  assert.ok(r[13].mrr > r[12].mrr);
});

test('Edge – 0% churn: lineaire groei (100, €10, +5, 0%, 10%)', () => {
  const r = simulate({ customers: 100, arpu: 10, newPerMonth: 5, churnPct: 0, indexPct: 10 });
  close(r[12].customers, 160); close(r[12].mrr, 1600);
  close(r[13].mrr, 165 * 11);
  close(r[24].customers, 220); close(r[24].mrr, 2420);
});

test('Edge – 100% churn: enkel nieuwe klanten blijven (1000, €20, +20, 100%, 0%)', () => {
  const r = simulate({ customers: 1000, arpu: 20, newPerMonth: 20, churnPct: 100, indexPct: 0 });
  for (let m = 1; m <= 24; m++) close(r[m].mrr, 400);
  close(r[1].churned, 1000);
});

test('Edge – 0 klanten, 0 nieuw: alles 0, groei n.v.t.', () => {
  const r = simulate({ customers: 0, arpu: 50, newPerMonth: 0, churnPct: 5, indexPct: 3 });
  assert.ok(r.every((x) => x.mrr === 0));
  const s = summarize(r);
  assert.equal(s.growthPct, null);
  assert.equal(fmtPct(s.growthPct), 'n.v.t.');
});

test('Edge – 0 klanten met nieuwe klanten groeit vanaf 0', () => {
  const r = simulate({ customers: 0, arpu: 10, newPerMonth: 10, churnPct: 0, indexPct: 0 });
  close(r[24].mrr, 2400);
  assert.equal(summarize(r).growthPct, null);
});

test('Voorbeelddata (standaardwaarden) geeft verwachte uitkomst', () => {
  const r = simulate(DEFAULTS);
  close(r[12].mrr, 12042.2789, 1e-4);
  close(r[24].mrr, 17087.7315, 1e-4);
});

test('Validatie – geldige invoer', () => {
  const v = validateInputs({ customers: '100', arpu: '49,5', newPerMonth: '10', churnPct: '2', indexPct: '0' });
  assert.equal(v.valid, true);
  assert.equal(v.values.arpu, 49.5);
});

test('Validatie – negatief, leeg, ongeldig, churn > 100', () => {
  const v = validateInputs({ customers: '-1', arpu: '', newPerMonth: 'abc', churnPct: '101', indexPct: '-2' });
  assert.equal(v.valid, false);
  assert.match(v.errors.customers, /niet negatief/);
  assert.match(v.errors.arpu, /verplicht/);
  assert.match(v.errors.newPerMonth, /geldig getal/);
  assert.match(v.errors.churnPct, /tussen 0 en 100/);
  assert.match(v.errors.indexPct, /niet negatief/);
  assert.equal(validateInputs({ ...DEFAULTS, churnPct: '100' }).valid, true);
  assert.equal(validateInputs({ ...DEFAULTS, churnPct: '0' }).valid, true);
});

test('parseNumber en formattering nl-BE', () => {
  assert.equal(parseNumber('1.234,5'), 1234.5);
  assert.equal(parseNumber('2,5'), 2.5);
  assert.equal(parseNumber('2.5'), 2.5);
  assert.ok(Number.isNaN(parseNumber('1e')));
  assert.equal(fmtEur(12345), '€ 12.345');
  assert.equal(fmtPct(161.3), '+161,3 %');
});
