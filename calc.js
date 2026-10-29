// MRR Simulator – rekenmodule (ES module, bruikbaar in browser én Node)
export const MONTHS = 24;

export const DEFAULTS = Object.freeze({
  customers: 120,     // fictief voorbeeld: "Voorbeeld BV"
  arpu: 49,
  newPerMonth: 15,
  churnPct: 2.5,
  indexPct: 3,
});

const FIELDS = {
  customers:   { label: 'Aantal bestaande klanten', min: 0, max: 10_000_000 },
  arpu:        { label: 'Gemiddelde maandelijkse omzet per klant', min: 0, max: 10_000_000 },
  newPerMonth: { label: 'Nieuwe klanten per maand', min: 0, max: 10_000_000 },
  churnPct:    { label: 'Maandelijks churnpercentage', min: 0, max: 100 },
  indexPct:    { label: 'Jaarlijkse prijsindexatie', min: 0, max: 100 },
};

/** Zet ruwe invoer (string, ook met komma als decimaalteken) om naar getal of NaN. */
export function parseNumber(raw) {
  if (typeof raw === 'number') return raw;
  if (raw === null || raw === undefined) return NaN;
  let s = String(raw).trim().replace(/\s|€|%/g, '');
  if (s === '') return NaN;
  // nl-BE: "1.234,5" -> 1234.5 ; "2,5" -> 2.5
  if (s.includes(',')) s = s.replace(/\./g, '').replace(',', '.');
  if (!/^[-+]?\d*\.?\d+$/.test(s)) return NaN;
  return Number(s);
}

/** Valideert invoer. Retourneert { values, errors } – errors is een object veld -> foutmelding. */
export function validateInputs(raw) {
  const values = {};
  const errors = {};
  for (const [key, f] of Object.entries(FIELDS)) {
    const v = parseNumber(raw[key]);
    if (raw[key] === '' || raw[key] === undefined || raw[key] === null) {
      errors[key] = `${f.label} is verplicht.`;
    } else if (!Number.isFinite(v)) {
      errors[key] = `${f.label} moet een geldig getal zijn.`;
    } else if (v < f.min) {
      errors[key] = `${f.label} mag niet negatief zijn.`;
    } else if (v > f.max) {
      errors[key] = key === 'churnPct'
        ? 'Churn moet tussen 0 en 100 % liggen.'
        : `${f.label} mag maximaal ${f.max.toLocaleString('nl-BE')} zijn.`;
    }
    values[key] = v;
  }
  return { values, errors, valid: Object.keys(errors).length === 0 };
}

/**
 * Simuleert MRR over `months` maanden.
 * Maand 0 = huidige situatie. Voor m = 1..N:
 *   klanten_m = klanten_{m-1} * (1 - churn) + nieuw
 *   prijs indexeert aan het begin van elk nieuw jaar (maand 13, 25, ...): prijs *= (1 + index)
 *   MRR_m = klanten_m * prijs_m
 */
export function simulate({ customers, arpu, newPerMonth, churnPct, indexPct }, months = MONTHS) {
  const churn = churnPct / 100;
  const index = indexPct / 100;
  let c = customers;
  let price = arpu;
  const rows = [{ month: 0, customers: c, price, mrr: c * price, churned: 0, added: 0 }];
  for (let m = 1; m <= months; m++) {
    if (m > 1 && (m - 1) % 12 === 0) price = price * (1 + index); // maand 13, 25, ...
    const churned = c * churn;
    c = c - churned + newPerMonth;
    rows.push({ month: m, customers: c, price, mrr: c * price, churned, added: newPerMonth });
  }
  return rows;
}

/** KPI's op basis van simulatieresultaat. */
export function summarize(rows) {
  const start = rows[0].mrr;
  const at = (m) => rows[Math.min(m, rows.length - 1)];
  const end = rows[rows.length - 1];
  return {
    startMrr: start,
    mrr12: at(12).mrr,
    mrr24: end.mrr,
    growthPct: start > 0 ? (end.mrr / start - 1) * 100 : null, // null = niet berekenbaar (start = 0)
    customers24: end.customers,
    arr24: end.mrr * 12,
  };
}

// Formattering (nl-BE)
const eur0 = new Intl.NumberFormat('nl-BE', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0, minimumFractionDigits: 0 });
const eur2 = new Intl.NumberFormat('nl-BE', { style: 'currency', currency: 'EUR', minimumFractionDigits: 2, maximumFractionDigits: 2 });
const int0 = new Intl.NumberFormat('nl-BE', { maximumFractionDigits: 0 });
const pct1 = new Intl.NumberFormat('nl-BE', { minimumFractionDigits: 1, maximumFractionDigits: 1, signDisplay: 'exceptZero' });
const nbsp = (s) => s.replace(/\u00a0|\u202f/g, ' ');
export const fmtEur = (v) => nbsp(eur0.format(v));
export const fmtEur2 = (v) => nbsp(eur2.format(v));
export const fmtInt = (v) => nbsp(int0.format(Math.round(v) + 0));
export const fmtPct = (v) => (v === null ? 'n.v.t.' : nbsp(pct1.format(v)) + ' %');
