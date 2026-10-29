import { DEFAULTS, MONTHS, validateInputs, simulate, summarize, compareScenarios, relativeDiff, fmtEur, fmtEur2, fmtInt, fmtPct, fmtSignedEur } from './calc.js';

const KEYS = ['customers', 'arpu', 'newPerMonth', 'churnPct', 'indexPct'];
const PRESETS = {
  groei: { customers: 100, arpu: 50, newPerMonth: 10, churnPct: 2, indexPct: 3 },
  krimp: { customers: 500, arpu: 80, newPerMonth: 5, churnPct: 10, indexPct: 2 },
  index: { customers: 200, arpu: 100, newPerMonth: 0, churnPct: 1, indexPct: 5 },
};
const $ = (id) => document.getElementById(id);
const STATUS_INVALID = 'Corrigeer de gemarkeerde velden; de grafiek toont de laatste geldige berekening.';

let chart;
let compareMode = false;
let lastRowsA = null;
let lastRowsB = null;

function fieldId(prefix, key) { return prefix + key; }

function setValues(v, prefix) {
  for (const k of KEYS) $(fieldId(prefix, k)).value = v[k];
}
function readRaw(prefix) {
  const raw = {};
  for (const k of KEYS) {
    const el = $(fieldId(prefix, k));
    // type=number geeft "" bij onleesbare invoer; badInput onderscheidt dit van een leeg veld
    raw[k] = el.validity && el.validity.badInput ? 'ongeldig' : el.value;
  }
  return raw;
}

function showErrors(errors, prefix) {
  for (const k of KEYS) {
    const msg = errors[k] || '';
    const el = $(fieldId(prefix, k));
    $(fieldId(prefix, k) + '-error').textContent = msg;
    el.classList.toggle('invalid', !!msg);
    el.setAttribute('aria-invalid', msg ? 'true' : 'false');
    const affix = el.closest('.affix');
    if (affix) affix.classList.toggle('invalid', !!msg);
  }
}

function fmtDelta(delta) {
  if (delta === null) return '–';
  if (Math.abs(delta) < 0.5) return fmtEur(0);
  return (delta > 0 ? '+' : '−') + fmtEur(Math.abs(delta));
}

function fmtCompareDiff(diff, pct) {
  return fmtSignedEur(diff) + ' (' + fmtPct(pct) + ')';
}

function yScale() {
  return { beginAtZero: true, title: { display: true, text: 'MRR (€)' }, ticks: { callback: (v) => fmtEur(v) } };
}
function xScale() {
  return { grid: { color: (c) => (c.index === 12 ? 'rgba(59,91,219,.5)' : 'rgba(0,0,0,.05)') } };
}

function tooltipTitle(items) {
  return items[0].dataIndex === 0 ? 'Maand 0 (nu)' : 'Maand ' + items[0].dataIndex;
}

function initChart() {
  if (chart) chart.destroy();
  const labels = Array.from({ length: MONTHS + 1 }, (_, i) => (i === 0 ? 'Nu' : 'M' + i));
  const datasets = compareMode
    ? [
        {
          label: 'Scenario A', data: [], yAxisID: 'y',
          borderColor: '#3b5bdb', backgroundColor: '#3b5bdb', pointBackgroundColor: '#3b5bdb',
          fill: false, tension: 0.25, borderWidth: 2.5, pointRadius: 3, pointHoverRadius: 6, pointStyle: 'circle',
        },
        {
          label: 'Scenario B', data: [], yAxisID: 'y',
          borderColor: '#0ca678', backgroundColor: '#0ca678', pointBackgroundColor: '#0ca678',
          borderDash: [6, 4], fill: false, tension: 0.25, borderWidth: 2.5,
          pointRadius: 4, pointHoverRadius: 6, pointStyle: 'triangle',
        },
      ]
    : [
        { label: 'MRR', data: [], yAxisID: 'y', borderColor: '#3b5bdb', backgroundColor: 'rgba(59,91,219,.12)', fill: true, tension: 0.25, pointRadius: 3, pointHoverRadius: 6 },
        { label: 'Klanten', data: [], yAxisID: 'y1', borderColor: '#f08c00', backgroundColor: '#f08c00', borderDash: [5, 4], tension: 0.25, pointRadius: 0, pointHoverRadius: 5 },
      ];
  const scales = { y: yScale(), x: xScale() };
  if (!compareMode) {
    scales.y1 = {
      beginAtZero: true, position: 'right', grid: { drawOnChartArea: false },
      title: { display: true, text: 'Klanten' }, ticks: { callback: (v) => fmtInt(v) },
    };
  }
  chart = new Chart($('chart'), {
    type: 'line',
    data: { labels, datasets },
    options: {
      responsive: true, maintainAspectRatio: false, animation: { duration: 250 },
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: compareMode
          ? { position: 'bottom', labels: { usePointStyle: true } }
          : { position: 'bottom' },
        tooltip: {
          callbacks: {
            title: tooltipTitle,
            label: (ctx) => compareMode
              ? ' ' + ctx.dataset.label + ': ' + fmtEur(ctx.parsed.y)
              : (ctx.dataset.yAxisID === 'y' ? ' MRR: ' + fmtEur(ctx.parsed.y) : ' Klanten: ' + fmtInt(ctx.parsed.y)),
            afterBody: (items) => {
              const i = items[0].dataIndex;
              if (compareMode) {
                if (!lastRowsA || !lastRowsB || !lastRowsA[i] || !lastRowsB[i]) return [];
                const { diff, pct } = relativeDiff(lastRowsA[i].mrr, lastRowsB[i].mrr);
                return ['Verschil B−A: ' + fmtCompareDiff(diff, pct)];
              }
              const r = lastRowsA && lastRowsA[i];
              return r ? ['Prijs/klant: ' + fmtEur2(r.price), 'ARR: ' + fmtEur(r.mrr * 12)] : [];
            },
          },
        },
      },
      scales,
    },
  });
}

function renderTable(rows, rowsB) {
  const tb = document.querySelector('#table tbody');
  tb.innerHTML = rows.map((r, i) => {
    const delta = i === 0 ? null : r.mrr - rows[i - 1].mrr;
    const dCls = delta === null || Math.abs(delta) < 0.5 ? '' : delta > 0 ? 'pos' : 'neg';
    const bMrr = rowsB ? rowsB[i].mrr : null;
    const bDiff = bMrr === null ? null : bMrr - r.mrr;
    const bCls = bDiff === null || Math.abs(bDiff) < 0.5 ? '' : bDiff > 0 ? 'pos' : 'neg';
    return `<tr class="${r.month === 12 || r.month === 24 ? 'year' : ''}"><td>${r.month === 0 ? '0 (nu)' : r.month}</td><td>${fmtInt(r.customers)}</td>` +
      `<td>${i === 0 ? '–' : fmtInt(r.churned)}</td><td>${i === 0 ? '–' : fmtInt(r.added)}</td><td>${fmtEur2(r.price)}</td>` +
      `<td><strong>${fmtEur(r.mrr)}</strong></td><td class="${dCls}">${fmtDelta(delta)}</td>` +
      `<td class="only-compare"><strong>${bMrr === null ? '–' : fmtEur(bMrr)}</strong></td>` +
      `<td class="only-compare ${bCls}">${fmtDelta(bDiff)}</td></tr>`;
  }).join('');
}

function applyKpis(s) {
  $('kpi-start').textContent = fmtEur(s.startMrr);
  $('kpi-12').textContent = fmtEur(s.mrr12);
  $('kpi-24').textContent = fmtEur(s.mrr24);
  const g = $('kpi-growth');
  g.textContent = fmtPct(s.growthPct);
  g.className = 'k-val' + (s.growthPct === null ? '' : s.growthPct >= 0 ? ' pos' : ' neg');
  $('kpi-cust').textContent = fmtInt(s.customers24);
}

function setDiffCell(id, diff, pct) {
  const el = $(id);
  el.textContent = fmtCompareDiff(diff, pct);
  el.className = Math.abs(diff) < 0.5 ? '' : diff > 0 ? 'pos' : 'neg';
}

function renderComparison() {
  const blank = () => {
    for (const id of ['cmp-12-a', 'cmp-12-b', 'cmp-12-d', 'cmp-24-a', 'cmp-24-b', 'cmp-24-d']) $(id).textContent = '–';
    $('cmp-12-d').className = '';
    $('cmp-24-d').className = '';
    $('cmp-hint').textContent = '';
  };
  if (!compareMode || !lastRowsA || !lastRowsB) {
    blank();
    return null;
  }
  const c = compareScenarios(lastRowsA, lastRowsB);
  $('cmp-12-a').textContent = fmtEur(c.mrr12.a);
  $('cmp-12-b').textContent = fmtEur(c.mrr12.b);
  $('cmp-24-a').textContent = fmtEur(c.mrr24.a);
  $('cmp-24-b').textContent = fmtEur(c.mrr24.b);
  setDiffCell('cmp-12-d', c.mrr12.diff, c.mrr12.pct);
  setDiffCell('cmp-24-d', c.mrr24.diff, c.mrr24.pct);
  const same = Math.abs(c.mrr12.diff) < 0.5 && Math.abs(c.mrr24.diff) < 0.5;
  $('cmp-hint').textContent = same
    ? 'Scenario A en B geven dezelfde MRR. Pas Scenario B aan of kies een ander preset.'
    : '';
  return c;
}

function applyChart() {
  if (!chart) return;
  if (compareMode) {
    chart.data.datasets[0].data = lastRowsA ? lastRowsA.map((r) => r.mrr) : [];
    chart.data.datasets[1].data = lastRowsB ? lastRowsB.map((r) => r.mrr) : [];
  } else if (lastRowsA) {
    chart.data.datasets[0].data = lastRowsA.map((r) => r.mrr);
    chart.data.datasets[1].data = lastRowsA.map((r) => r.customers);
  }
  chart.update();
}

function update() {
  const a = validateInputs(readRaw(''));
  showErrors(a.errors, '');
  if (a.valid) lastRowsA = simulate(a.values);

  let bValid = true;
  if (compareMode) {
    const b = validateInputs(readRaw('b-'));
    showErrors(b.errors, 'b-');
    bValid = b.valid;
    if (b.valid) lastRowsB = simulate(b.values);
  }

  if (a.valid && lastRowsA) {
    applyKpis(summarize(lastRowsA));
    renderTable(lastRowsA, compareMode ? lastRowsB : null);
  }
  const comparison = compareMode ? renderComparison() : null;

  const invalid = !a.valid || (compareMode && !bValid);
  $('status').textContent = invalid ? STATUS_INVALID : '';
  applyChart();

  if (lastRowsA) {
    window.__mrr = {
      rows: lastRowsA,
      summary: summarize(lastRowsA),
      rowsB: compareMode ? lastRowsB : null,
      summaryB: compareMode && lastRowsB ? summarize(lastRowsB) : null,
      comparison,
      compare: compareMode,
    };
  }
}

function applyCompareChrome() {
  document.body.classList.toggle('compare', compareMode);
  $('panel-b').hidden = !compareMode;
  $('compare-summary').hidden = !compareMode;
  $('inputs-title-text').textContent = compareMode ? 'Scenario A' : 'Invoer';
  $('mode-single').classList.toggle('active', !compareMode);
  $('mode-single').setAttribute('aria-pressed', compareMode ? 'false' : 'true');
  $('mode-compare').classList.toggle('active', compareMode);
  $('mode-compare').setAttribute('aria-pressed', compareMode ? 'true' : 'false');
  $('chart').setAttribute('aria-label', compareMode
    ? 'Grafiek van de MRR per maand voor scenario A en scenario B'
    : 'Grafiek van de MRR per maand');
}

function setCompareMode(on) {
  if (on === compareMode) return;
  compareMode = on;
  applyCompareChrome();
  initChart();
  update();
}

function readScenario(q, presetKey, suffix) {
  const start = { ...(PRESETS[q.get(presetKey)] || DEFAULTS) };
  for (const k of KEYS) {
    const name = suffix ? k + suffix : k;
    if (q.has(name)) start[k] = q.get(name);
  }
  return start;
}

function init() {
  const q = new URLSearchParams(location.search);
  compareMode = q.get('compare') === '1' || q.get('compare') === 'true';
  applyCompareChrome();
  initChart();
  setValues(readScenario(q, 'preset', ''), '');
  setValues(readScenario(q, 'presetB', 'B'), 'b-');

  $('form').addEventListener('input', update);
  $('form-b').addEventListener('input', update);
  $('form').addEventListener('submit', (e) => e.preventDefault());
  $('form-b').addEventListener('submit', (e) => e.preventDefault());
  $('reset').addEventListener('click', () => { setValues(DEFAULTS, ''); update(); });
  $('copy-a-to-b').addEventListener('click', () => {
    for (const k of KEYS) $(fieldId('b-', k)).value = $(k).value;
    update();
  });
  $('mode-single').addEventListener('click', () => setCompareMode(false));
  $('mode-compare').addEventListener('click', () => setCompareMode(true));
  document.querySelectorAll('[data-preset]').forEach((b) => b.addEventListener('click', () => {
    setValues(PRESETS[b.dataset.preset], '');
    update();
  }));
  document.querySelectorAll('[data-preset-b]').forEach((b) => b.addEventListener('click', () => {
    setValues(PRESETS[b.dataset.presetB], 'b-');
    update();
  }));
  update();
}
init();
