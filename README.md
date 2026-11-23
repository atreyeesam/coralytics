# Coralytics

**Which coral reefs are worth restoring?**

Coralytics scores 18,445 reef locations worldwide on how often ocean heat bleaches them, whether heat-tolerant coral would hold there, and what else stops them recovering. It then ranks the best places to restore.

Coralytics won the Nucleate × ARIA hackathon (22 November 2026). I created and led the project there with my team.

- Live app from the hackathon: https://coralytics.pages.dev/
- This repository is a clean rebuild of the app made after the hackathon. It uses the same model outputs and gives the same results as the hackathon version.

## What it shows

- **A globe of every reef**, coloured by verdict:
  - 🟢 **Holds on its own**: heat bleached it in 2 or fewer of the last 10 years, so corals have time to recover.
  - 🟠 **Needs tougher coral**: it bleaches too often for today's coral, but coral bred to cope with slightly warmer water would hold.
  - 🔴 **Too hot to save**: even tougher coral would not hold.
- **A warming switch** that adds 0.5 °C, roughly the world around 2040.
- **"What if we restore with tougher coral?"**: how many reefs survive if restored coral tolerates +0.25 °C to +1.5 °C more heat.
- **Best places to restore**: reefs that need tougher coral, ranked by low local pressure (fishing, runoff, coastal development, tourism, industry) and good larvae supply from nearby reefs. You can also sort by the number of people living nearby, and download the full list as a CSV.
- **A page for each reef** with its yearly bleaching risk since 1988, the heat tolerance it needs, the main local pressure, the people living nearby, and the value of its tourism and flood protection.

## How the model works

- Gradient-boosted trees (LightGBM), trained on daily NOAA CoralTemp sea temperature since 1985 at 5 km resolution and on 17,332 diver surveys from the Global Coral Bleaching Database.
- It predicts the chance that at least 30% of a reef's corals bleach.
- **Tested on years it never saw:** the model was trained on surveys up to 2013 and scored on 2016–2020. It reaches 0.935 AUROC, against 0.906 for NOAA's standard heat alert (2,771 surveys).
- **Checked against new surveys:** it reaches 0.84 AUROC on 201 MERMAID bleaching surveys from 2021–2025 in 10 countries.
- **Bleaching year:** a year in which the model puts the reef past 50% risk in its hottest month.

## Run it locally

The site is plain HTML, CSS and JavaScript, so there is nothing to install. Any static web server will do:

```bash
python3 -m http.server 8000
# then open http://localhost:8000
```

To host it, upload the whole folder to Netlify, Cloudflare Pages or GitHub Pages.

## Project layout

```
index.html               page structure and the "How it works" text
style.css                design
app.js                   all app logic: scoring rules, map, panel, CSV export
data/reefs.json          model outputs for every reef (made by the script below)
scripts/prepare_data.py  turns raw model exports into data/reefs.json
vendor/                  MapLibre GL JS (BSD-3-Clause, licence included)
favicon.svg              logo
```

## Data

`data/reefs.json` holds, for every reef cell:

- its location, ecoregion and country;
- its yearly bleaching risk from 1988 to 2025;
- the number of bleaching years in the last decade (2016–2025), recorded under different warming shifts;
- local pressure percentiles, larvae supply, people living within 50 km, and the reef tourism value and flood protection within 25 km;
- known restoration projects.

Sources: NOAA Coral Reef Watch CoralTemp, the Global Coral Bleaching Database, MERMAID (WCS), and the open datasets that cover population, reef tourism, flood protection and local pressures. The basemap is © OpenStreetMap contributors © CARTO.

## Limits

This is a screening tool, not a site survey. Scores cover 5 km reef cells rather than individual reefs, and they cannot account for depth, the water quality on a given day, or how the reef is managed locally. Use it to choose where to look more closely.

## Credits

Built at the Nucleate × ARIA hackathon, November 2026, by Dr Atreyee Samanta (project lead) and team.
