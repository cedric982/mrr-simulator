# MRR Simulator (lokaal prototype, fictieve data)

Start: `cd /workspace/mrr-simulator && python3 -m http.server 8080` → http://localhost:8080
Unit tests: `npm test` (Node ≥ 20, geen dependencies)
Browser-tests (optioneel): `tests/e2e.mjs` gebruikt playwright-core uit /workspace/mrr-e2e + /usr/bin/google-chrome.

Bestanden: index.html (UI), styles.css, app.js (UI-logica), calc.js (rekenmodel, ES module),
vendor/chart.umd.min.js (Chart.js 4.4.1, lokaal → werkt offline), tests/calc.test.js, screenshots/.

Model: maand 0 = huidig. m=1..24: klanten = vorige × (1 − churn) + nieuw; prijs × (1 + index) in maand 13; MRR = klanten × prijs.
URL-parameters: ?preset=groei|krimp|index of ?customers=..&arpu=..&newPerMonth=..&churnPct=..&indexPct=..
