# MRR Simulator (lokaal prototype, fictieve data)

Start: `python3 -m http.server 8080` in deze map → http://localhost:8080
Unit tests: `npm test` (Node ≥ 20, geen dependencies)
Browser-tests: `npm install --no-save playwright-core` en daarna `node tests/e2e.mjs` (Chrome).

Bestanden: index.html (UI), styles.css, app.js (UI-logica), calc.js (rekenmodel, ES module),
vendor/chart.umd.min.js (Chart.js 4.4.1, lokaal → werkt offline), tests/calc.test.js, tests/compare.test.js.

Model: maand 0 = huidig. m=1..24: klanten = vorige × (1 − churn) + nieuw; prijs × (1 + index) in maand 13; MRR = klanten × prijs.
Het rekenmodel zelf verandert niet. `compareScenarios` zet twee simulaties naast elkaar (verschil = B − A).

Eén scenario is de standaardweergave: invoer, KPI's, grafiek (MRR + klanten), tabel, presets, reset en validatie.
Vergelijken: knop “Vergelijk A en B”. Twee invoersets, presets per scenario, knop “Kopieer A naar B”, één grafiek met twee MRR-lijnen en een verschiloverzicht voor maand 12 en 24.

URL (scenario A, achterwaarts compatibel): `?preset=groei|krimp|index` of `?customers=..&arpu=..&newPerMonth=..&churnPct=..&indexPct=..`
Optioneel voor B: `compare=1` (of `true`), `presetB=groei|krimp|index`, `customersB`, `arpuB`, `newPerMonthB`, `churnPctB`, `indexPctB`.
