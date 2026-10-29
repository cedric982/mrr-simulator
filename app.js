import { DEFAULTS, MONTHS, validateInputs, simulate, summarize, fmtEur, fmtEur2, fmtInt, fmtPct } from './calc.js';

const KEYS = ['customers', 'arpu', 'newPerMonth', 'churnPct', 'indexPct'];
const PRESETS = {
  groei: { customers: 100, arpu: 50, newPerMonth: 10, churnPct: 2, indexPct: 3 },
  krimp: { customers: 500, arpu: 80, newPerMonth: 5, churnPct: 10, indexPct: 2 },
  index: { customers: 200, arpu: 100, newPerMonth: 0, churnPct: 1, indexPct: 5 },
};
const $ = (id) => document.getElementById(id);
let chart;
let lastRows = null;

function setValues(v) { for (const k of KEYS) $(k).value = v[k]; }
function readRaw() {
  const raw = {};
  for (const k of KEYS) {
    const el = $(k);
    // type=number geeft "" bij onleesbare invoer; badInput onderscheidt dit van een leeg veld
    raw[k] = el.validity && el.validity.badInput ? 'ongeldig' : el.value;
  }
  return raw;
}

function showErrors(errors) {
  for (const k of KEYS) {
    const msg = errors[k] || '';
    $(k + '-error').textContent = msg;
    $(k).classList.toggle('invalid', !!msg);
    $(k).setAttribute('aria-invalid', msg ? 'true' : 'false');
    const affix = $(k).closest('.affix');
    if (affix) affix.classList.toggle('invalid', !!msg);
  }
}

function initChart() {
  const labels = Array.from({ length: MONTHS + 1 }, (_, i) => (i === 0 ? 'Nu' : 'M' + i));
  chart = new Chart($('chart'), {
    type: 'line',
    data: {
      labels,
      datasets: [
        { label: 'MRR', data: [], yAxisID: 'y', borderColor: '#3b5bdb', backgroundColor: 'rgba(59,91,219,.12)', fill: true, tension: 0.25, pointRadius: 3, pointHoverRadius: 6 },
        { label: 'Klanten', data: [], yAxisID: 'y1', borderColor: '#f08c00', backgroundColor: '#f08c00', borderDash: [5, 4], tension: 0.25, pointRadius: 0, pointHoverRadius: 5 },
      ],
    },
    options: {
      responsive: true, maintainAspectRatio: false, animation: { duration: 250 },
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: { position: 'bottom' },
        tooltip: {
          callbacks: {
            title: (items) => (items[0].dataIndex === 0 ? 'Maand 0 (nu)' : 'Maand ' + items[0].dataIndex),
            label: (ctx) => ctx.dataset.yAxisID === 'y' ? ' MRR: ' + fmtEur(ctx.parsed.y) : ' Klanten: ' + fmtInt(ctx.parsed.y),
            afterBody: (items) => {
              const r = lastRows && lastRows[items[0].dataIndex];
              return r ? ['Prijs/klant: ' + fmtEur2(r.price), 'ARR: ' + fmtEur(r.mrr * 12)] : [];
            },
          },
        },
      },
      scales: {
        y: { beginAtZero: true, title: { display: true, text: 'MRR (€)' }, ticks: { callback: (v) => fmtEur(v) } },
        y1: { beginAtZero: true, position: 'right', grid: { drawOnChartArea: false }, title: { display: true, text: 'Klanten' }, ticks: { callback: (v) => fmtInt(v) } },
        x: { grid: { color: (c) => (c.index === 12 ? 'rgba(59,91,219,.5)' : 'rgba(0,0,0,.05)') } },
      },
    },
  });
}

function renderTable(rows) {
  const tb = document.querySelector('#table tbody');
  tb.innerHTML = rows.map((r, i) => {
    const delta = i === 0 ? null : r.mrr - rows[i - 1].mrr;
    const dCls = delta === null || Math.abs(delta) < 0.5 ? '' : delta > 0 ? 'pos' : 'neg';
    const dTxt = delta === null ? '–' : Math.abs(delta) < 0.5 ? fmtEur(0) : (delta > 0 ? '+' : '−') + fmtEur(Math.abs(delta));
    return `<tr class="${r.month === 12 || r.month === 24 ? 'year' : ''}"><td>${r.month === 0 ? '0 (nu)' : r.month}</td><td>${fmtInt(r.customers)}</td>` +
      `<td>${i === 0 ? '–' : fmtInt(r.churned)}</td><td>${i === 0 ? '–' : fmtInt(r.added)}</td><td>${fmtEur2(r.price)}</td>` +
      `<td><strong>${fmtEur(r.mrr)}</strong></td><td class="${dCls}">${dTxt}</td></tr>`;
  }).join('');
}

function update() {
  const { values, errors, valid } = validateInputs(readRaw());
  showErrors(errors);
  if (!valid) {
    $('status').textContent = 'Corrigeer de gemarkeerde velden; de grafiek toont de laatste geldige berekening.';
    return;
  }
  $('status').textContent = '';
  const rows = simulate(values);
  lastRows = rows;
  const s = summarize(rows);
  $('kpi-start').textContent = fmtEur(s.startMrr);
  $('kpi-12').textContent = fmtEur(s.mrr12);
  $('kpi-24').textContent = fmtEur(s.mrr24);
  const g = $('kpi-growth');
  g.textContent = fmtPct(s.growthPct);
  g.className = 'k-val' + (s.growthPct === null ? '' : s.growthPct >= 0 ? ' pos' : ' neg');
  $('kpi-cust').textContent = fmtInt(s.customers24);
  chart.data.datasets[0].data = rows.map((r) => r.mrr);
  chart.data.datasets[1].data = rows.map((r) => r.customers);
  chart.update();
  renderTable(rows);
  window.__mrr = { rows, summary: s }; // handig voor geautomatiseerde tests
}

function init() {
  initChart();
  // Optioneel: waarden via URL, bv. ?customers=100&arpu=50&newPerMonth=10&churnPct=2&indexPct=3 of ?preset=krimp
  const q = new URLSearchParams(location.search);
  const start = { ...(PRESETS[q.get('preset')] || DEFAULTS) };
  for (const k of KEYS) if (q.has(k)) start[k] = q.get(k);
  setValues(start);
  $('form').addEventListener('input', update);
  $('form').addEventListener('submit', (e) => e.preventDefault());
  $('reset').addEventListener('click', () => { setValues(DEFAULTS); update(); });
  document.querySelectorAll('[data-preset]').forEach((b) => b.addEventListener('click', () => { setValues(PRESETS[b.dataset.preset]); update(); }));
  update();
}
init();
