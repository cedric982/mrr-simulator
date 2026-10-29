import { test } from 'node:test';
import assert from 'node:assert/strict';
import { simulate, summarize, compareScenarios, relativeDiff, fmtEur, fmtSignedEur, fmtPct, DEFAULTS } from '../calc.js';

const close = (a, b, eps = 1e-6) => assert.ok(Math.abs(a - b) <= eps, `${a} ≠ ${b}`);

const GROEI = { customers: 100, arpu: 50, newPerMonth: 10, churnPct: 2, indexPct: 3 };
const KRIMP = { customers: 500, arpu: 80, newPerMonth: 5, churnPct: 10, indexPct: 2 };

test('relativeDiff – positief, negatief en nulbasis', () => {
  const up = relativeDiff(100, 150);
  close(up.diff, 50);
  close(up.pct, 50);
  const down = relativeDiff(100, 50);
  close(down.diff, -50);
  close(down.pct, -50);
  const zero = relativeDiff(0, 10);
  close(zero.diff, 10);
  assert.equal(zero.pct, null);
  const bothZero = relativeDiff(0, 0);
  close(bothZero.diff, 0);
  assert.equal(bothZero.pct, null);
});

test('compareScenarios – groei (A) vs krimp (B) op maand 12 en 24', () => {
  const rowsA = simulate(GROEI);
  const rowsB = simulate(KRIMP);
  const c = compareScenarios(rowsA, rowsB);
  const sumA = summarize(rowsA);
  const sumB = summarize(rowsB);

  close(c.mrr12.a, rowsA[12].mrr);
  close(c.mrr12.b, rowsB[12].mrr);
  close(c.mrr12.a, sumA.mrr12);
  close(c.mrr12.diff, rowsB[12].mrr - rowsA[12].mrr);
  close(c.mrr12.pct, (rowsB[12].mrr / rowsA[12].mrr - 1) * 100);

  close(c.mrr24.a, rowsA[24].mrr);
  close(c.mrr24.b, rowsB[24].mrr);
  close(c.mrr24.b, sumB.mrr24);
  close(c.mrr24.diff, rowsB[24].mrr - rowsA[24].mrr);
  close(c.mrr24.pct, (rowsB[24].mrr / rowsA[24].mrr - 1) * 100);

  // B start hoger maar eindigt lager: maand 12 nog positief voor B, maand 24 negatief
  assert.ok(c.mrr12.diff > 0);
  assert.ok(c.mrr24.diff < 0);
});

test('compareScenarios – gelijke invoer geeft verschil 0', () => {
  const rows = simulate(DEFAULTS);
  const before = rows[12].mrr;
  const c = compareScenarios(rows, rows);
  close(c.mrr12.diff, 0);
  close(c.mrr12.pct, 0);
  close(c.mrr24.diff, 0);
  close(c.mrr24.pct, 0);
  assert.equal(rows[12].mrr, before);
});

test('compareScenarios – percentage n.v.t. als MRR van A nul is', () => {
  const rowsA = simulate({ customers: 0, arpu: 0, newPerMonth: 0, churnPct: 0, indexPct: 0 });
  const rowsB = simulate({ customers: 10, arpu: 10, newPerMonth: 0, churnPct: 0, indexPct: 0 });
  const c = compareScenarios(rowsA, rowsB);
  assert.equal(c.mrr12.a, 0);
  close(c.mrr12.b, 100);
  close(c.mrr12.diff, 100);
  assert.equal(c.mrr12.pct, null);
  assert.equal(c.mrr24.pct, null);
  assert.equal(fmtPct(c.mrr24.pct), 'n.v.t.');
});

test('fmtSignedEur – teken en afronding op hele euro', () => {
  assert.equal(fmtSignedEur(12345), '+€ 12.345');
  assert.equal(fmtSignedEur(-12345), '−€ 12.345');
  assert.equal(fmtSignedEur(0), '€ 0');
  assert.equal(fmtSignedEur(0.4), '€ 0');
  assert.equal(fmtSignedEur(-0.4), '€ 0');
  assert.equal(fmtEur(12345), '€ 12.345');
});
