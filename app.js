// Coralytics: which coral reefs are worth restoring.
// Plain JavaScript, no build step. Data comes from data/reefs.json
// (see scripts/prepare_data.py for how it is made).
"use strict";

// ---------- Rules ----------

// A reef "holds" if heat bleaches it in no more than this many of the last 10 years.
const MAX_BLEACHING_YEARS = 2;
// Extra warming applied by the "about 2040" switch, in °C.
const WARMING_2040 = 0.5;
// Heat tolerance options for restored coral, in °C (the bars in the side panel).
const GAINS = [0, 0.25, 0.5, 0.75, 1, 1.25, 1.5];

const COLORS = { holds: "#1e8e4a", savable: "#c27a00", beyond: "#d93636" };
const LABELS = {
  holds: { title: "Holds on its own", short: "Holds on its own" },
  savable: { title: "Restore with heat-tolerant coral", short: "Needs tougher coral" },
  beyond: { title: "Too hot for today's restoration", short: "Too hot to save" },
};
const PRESSURES = [
  ["fishing", "Fishing"], ["nitrogen", "Nitrogen runoff"], ["sediment", "Sediment runoff"],
  ["coastal", "Coastal population"], ["tourism", "Tourism"], ["industry", "Ports and industry"],
];
// Well-known reefs, with friendlier names than the model's ecoregions.
const EXAMPLES = [
  { i: 6426, name: "Spermonde Islands", place: "South Sulawesi, Indonesia" },
  { i: 16175, name: "Looe Key", place: "Florida Keys, United States" },
  { i: 442, name: "Heron Island", place: "Great Barrier Reef, Australia" },
  { i: 3005, name: "Moorea", place: "French Polynesia" },
  { i: 17268, name: "Okinawa", place: "Japan" },
];

// ---------- State ----------

const state = {
  data: null,     // decoded data/reefs.json
  warm: false,    // +0.5 °C switch
  gain: 0.5,      // heat tolerance of restored coral
  query: "",      // search text
  sort: "odds",   // "odds" or "people"
  selected: null, // reef index shown in detail view
};

// ---------- Data helpers ----------

const fromBase64 = (text) => Uint8Array.from(atob(text), (c) => c.charCodeAt(0));

async function loadData() {
  const response = await fetch("data/reefs.json");
  if (!response.ok) throw new Error(`Could not load reef data (${response.status})`);
  const d = await response.json();
  d.ann = fromBase64(d.ann);
  d.counts = fromBase64(d.counts);
  d.ecoName = (i) => d.names[d.eco[i]];
  d.countryName = (i) => d.names[d.country[i]];
  return d;
}

/** Bleaching years in the last 10 if the water were `shift` °C warmer than recorded. */
function bleachingYears(d, i, shift) {
  const step = Math.round((shift - d.shifts[0]) / 0.25);
  const k = Math.max(0, Math.min(d.shifts.length - 1, step));
  return d.counts[k * d.n + i];
}

function verdict(d, i, warming, gain) {
  if (bleachingYears(d, i, warming) <= MAX_BLEACHING_YEARS) return "holds";
  if (bleachingYears(d, i, warming - gain) <= MAX_BLEACHING_YEARS) return "savable";
  return "beyond";
}

/** Smallest coral heat tolerance (°C) that would let the reef hold, or null if none modelled. */
function toleranceNeeded(d, i, warming) {
  for (let g = 0; warming - g >= d.shifts[0] - 1e-9; g += 0.25) {
    if (bleachingYears(d, i, warming - g) <= MAX_BLEACHING_YEARS) return g;
  }
  return null;
}

/** Higher is better: low local pressure plus good larvae supply from nearby reefs. */
function restoreScore(d, i) {
  const p = d.pressure;
  return 100 - p.pressure[i] + (p.connect[i] < 0 ? 50 : p.connect[i]);
}

function mainPressure(d, i) {
  let best = PRESSURES[0];
  for (const item of PRESSURES) if (d.pressure[item[0]][i] > d.pressure[best[0]][i]) best = item;
  return best[1];
}

const tier = (value) => (value < 34 ? "Low" : value < 67 ? "Mid" : "High");
const pct = (x) => `${Math.round(x * 100)}%`;
const compact = (x) => (x >= 1e6 ? `${(x / 1e6).toFixed(1)}M` : x >= 1e3 ? `${Math.round(x / 1e3)}k` : String(x));
const longNumber = (x) => (x >= 1e6 ? `${(x / 1e6).toFixed(1)} million` : x.toLocaleString("en-GB"));
const money = (x) => (x >= 1e9 ? `$${(x / 1e9).toFixed(1)} billion` : x >= 1e6 ? `$${(x / 1e6).toFixed(x >= 1e7 ? 0 : 1)} million` : x > 0 ? `$${Math.round(x / 1e3).toLocaleString("en-GB")},000` : "None recorded");
const degrees = (x) => `+${x} °C`;
const coords = (lat, lon) => `${Math.abs(lat).toFixed(2)}° ${lat >= 0 ? "N" : "S"}, ${Math.abs(lon).toFixed(2)}° ${lon >= 0 ? "E" : "W"}`;

function reefName(d, i) {
  const known = EXAMPLES.find((e) => e.i === i);
  if (known) return { name: known.name, place: known.place };
  const eco = d.ecoName(i);
  const country = d.countryName(i);
  return {
    name: eco || country || "Reef",
    place: country && eco && country !== eco ? country : coords(d.lat[i], d.lon[i]),
  };
}

// ---------- Derived views of the data ----------

const warming = () => (state.warm ? WARMING_2040 : 0);

function computeVerdicts() {
  const d = state.data;
  const out = new Array(d.n);
  for (let i = 0; i < d.n; i++) out[i] = verdict(d, i, warming(), state.gain);
  return out;
}

/** Reef indices matching the search box, or null when the box is empty. */
function searchMatches() {
  const q = state.query.trim().toLowerCase();
  if (!q) return null;
  const d = state.data;
  const hits = new Set();
  for (let i = 0; i < d.n; i++) {
    const text = `${d.ecoName(i)} ${d.countryName(i)} ${d.names[d.realm[i]]}`.toLowerCase();
    if (text.includes(q)) hits.add(i);
  }
  EXAMPLES.forEach((e) => { if (e.name.toLowerCase().includes(q) || e.place.toLowerCase().includes(q)) hits.add(e.i); });
  return hits;
}

function summary(verdicts, matches) {
  const totals = { holds: 0, savable: 0, beyond: 0 };
  let n = 0;
  verdicts.forEach((v, i) => { if (!matches || matches.has(i)) { totals[v]++; n++; } });
  return { n, holds: totals.holds / (n || 1), savable: totals.savable / (n || 1), beyond: totals.beyond / (n || 1) };
}

/** Share of reefs that would hold for each coral heat tolerance in GAINS. */
function toleranceCurve(matches) {
  const d = state.data;
  const held = GAINS.map(() => 0);
  let n = 0;
  for (let i = 0; i < d.n; i++) {
    if (matches && !matches.has(i)) continue;
    n++;
    GAINS.forEach((g, k) => { if (bleachingYears(d, i, warming() - g) <= MAX_BLEACHING_YEARS) held[k]++; });
  }
  return held.map((h) => h / Math.max(n, 1));
}

/** Reefs worth restoring with tougher coral, best first. */
function restorationList(verdicts, matches) {
  const d = state.data;
  let order = [];
  for (let i = 0; i < d.n; i++) {
    if (verdicts[i] === "savable" && d.pressure.pressure[i] >= 0) order.push(i);
  }
  order.sort((a, b) => restoreScore(d, b) - restoreScore(d, a));
  if (matches) order = order.filter((i) => matches.has(i));
  if (state.sort === "people") order = [...order].sort((a, b) => d.people_50km[b] - d.people_50km[a]);
  return order;
}

/** Top six for display: one per country (or region) unless the user searched. */
function topSix(order, matches) {
  if (matches) return order.slice(0, 6);
  const d = state.data;
  const seen = new Set();
  const picked = [];
  for (const i of order) {
    const key = d.countryName(i) || d.ecoName(i);
    if (seen.has(key)) continue;
    seen.add(key);
    picked.push(i);
    if (picked.length === 6) break;
  }
  return picked;
}

// ---------- Map ----------

let map = null;
let mapReady = false;
const FALLBACK_STYLE = {
  version: 8,
  sources: {},
  layers: [{ id: "ocean", type: "background", paint: { "background-color": "#c9dceb" } }],
};

function initMap() {
  map = new maplibregl.Map({
    container: "map",
    style: "https://basemaps.cartocdn.com/gl/positron-gl-style/style.json",
    center: [150, -5],
    zoom: window.innerWidth < 900 ? 1.1 : 2.1,
    minZoom: 0.6,
    dragRotate: false,
    attributionControl: { compact: true },
  });
  // If the basemap cannot be reached, fall back to a plain ocean so the reefs still show.
  map.once("error", (e) => {
    if (!mapReady && String(e.error?.message || "").includes("style")) map.setStyle(FALLBACK_STYLE);
  });
  map.on("style.load", () => {
    try { map.setProjection({ type: "globe" }); } catch (e) { /* older browsers: flat map */ }
  });
  map.on("load", () => {
    map.addSource("reefs", { type: "geojson", data: emptyCollection() });
    map.addSource("projects", { type: "geojson", data: emptyCollection() });
    map.addLayer({
      id: "reefs",
      type: "circle",
      source: "reefs",
      paint: {
        "circle-radius": ["interpolate", ["linear"], ["zoom"], 1, 2.6, 5, 3.4, 9, 6],
        "circle-color": ["match", ["get", "v"], "holds", COLORS.holds, "savable", COLORS.savable, COLORS.beyond],
        "circle-opacity": ["case", ["==", ["get", "m"], 1], 0.9, 0.12],
        "circle-stroke-width": ["case", ["==", ["get", "s"], 1], 2.5, 0],
        "circle-stroke-color": "#16202b",
      },
    });
    map.addLayer({
      id: "projects",
      type: "circle",
      source: "projects",
      paint: {
        "circle-radius": ["interpolate", ["linear"], ["zoom"], 1, 5, 6, 8],
        "circle-color": "rgba(0,0,0,0)",
        "circle-stroke-width": 1.6,
        "circle-stroke-color": "#16202b",
      },
    });
    const popup = new maplibregl.Popup({ closeButton: false, closeOnClick: false, offset: 8 });
    map.on("mousemove", "reefs", (e) => {
      const i = e.features[0].properties.i;
      const name = reefName(state.data, i);
      map.getCanvas().style.cursor = "pointer";
      popup.setLngLat(e.lngLat)
        .setHTML(`<b>${escapeHtml(name.name)}</b>${escapeHtml(LABELS[e.features[0].properties.v].short)}`)
        .addTo(map);
    });
    map.on("mouseleave", "reefs", () => { map.getCanvas().style.cursor = ""; popup.remove(); });
    map.on("click", "reefs", (e) => selectReef(e.features[0].properties.i));
    mapReady = true;
    if (state.data) refreshMap();
  });
}

const emptyCollection = () => ({ type: "FeatureCollection", features: [] });

function refreshMap(verdicts = computeVerdicts(), matches = searchMatches()) {
  if (!mapReady || !state.data) return;
  const d = state.data;
  const features = new Array(d.n);
  for (let i = 0; i < d.n; i++) {
    features[i] = {
      type: "Feature",
      geometry: { type: "Point", coordinates: [d.lon[i], d.lat[i]] },
      properties: { i, v: verdicts[i], m: !matches || matches.has(i) ? 1 : 0, s: i === state.selected ? 1 : 0 },
    };
  }
  map.getSource("reefs").setData({ type: "FeatureCollection", features });
  const seen = new Set();
  map.getSource("projects").setData({
    type: "FeatureCollection",
    features: d.projects
      .filter(([lat, lon]) => { const k = `${lat},${lon}`; if (seen.has(k)) return false; seen.add(k); return true; })
      .map(([lat, lon, , name]) => ({ type: "Feature", geometry: { type: "Point", coordinates: [lon, lat] }, properties: { name } })),
  });
  document.getElementById("map-status").hidden = true;
}

function flyToReefs(indices) {
  if (!mapReady || !indices.length) return;
  const d = state.data;
  let [w, s, e, n] = [180, 90, -180, -90];
  for (const i of indices) {
    w = Math.min(w, d.lon[i]); e = Math.max(e, d.lon[i]);
    s = Math.min(s, d.lat[i]); n = Math.max(n, d.lat[i]);
  }
  if (e - w > 180) return; // spans the date line or the whole world: leave the view alone
  map.fitBounds([[w, s], [e, n]], { padding: 60, maxZoom: 7, duration: 900 });
}

// ---------- Side panel ----------

const panel = document.getElementById("panel");

function render() {
  if (!state.data) return;
  if (state.selected === null) renderOverview();
  else renderDetail(state.selected);
}

function renderOverview() {
  const d = state.data;
  const verdicts = computeVerdicts();
  const matches = searchMatches();
  const totals = summary(verdicts, matches);
  const curve = toleranceCurve(matches);
  const order = restorationList(verdicts, matches);
  const top = topSix(order, matches);
  const q = state.query.trim();

  // Build the panel once, then only update its parts, so the search box keeps focus.
  if (!panel.querySelector("[data-triage]")) {
    panel.replaceChildren(document.getElementById("tpl-overview").content.cloneNode(true));
    wireOverview();
  }
  panel.querySelector("[data-search]").value = state.query;
  panel.querySelector("[data-warm]").checked = state.warm;

  panel.querySelector("[data-triage]").innerHTML = `
    <div class="triage-bar" role="img" aria-label="${totals.n} reefs: ${pct(totals.holds)} hold, ${pct(totals.savable)} need tougher coral, ${pct(totals.beyond)} too hot">
      ${["holds", "savable", "beyond"].map((v) => `<span style="flex-grow:${totals[v]};background:${COLORS[v]}"></span>`).join("")}
    </div>
    <ul>
      ${["holds", "savable", "beyond"].map((v) => `
        <li><span class="big num">${pct(totals[v])}</span>
        <span class="lab"><span class="dot" style="background:${COLORS[v]}"></span>${LABELS[v].short}</span></li>`).join("")}
    </ul>
    <p class="fine">${totals.n.toLocaleString("en-GB")} reefs${q ? ` matching "${escapeHtml(q)}"` : " worldwide"}${state.warm ? ", with 0.5 °C more warming" : ""}.</p>`;

  const at = (g) => pct(curve[GAINS.indexOf(g)]);
  panel.querySelector("[data-tol-lede]").innerHTML =
    `With today's coral, <b>${at(0)}</b> of these reefs survive the heat. With coral bred to cope with water ${state.gain} °C warmer, <b>${at(state.gain)}</b> do.`;
  panel.querySelector("[data-tol-bars]").innerHTML = GAINS.map((g, k) => `
    <button class="tol" type="button" data-gain="${g}" aria-pressed="${g === state.gain}" ${g === 0 ? "disabled" : ""}
      aria-label="${g === 0 ? "Today's coral" : `Coral that copes with water ${g} °C warmer`}: ${pct(curve[k])} of reefs survive">
      <span class="num">${pct(curve[k])}</span>
      <span class="tol-bar"><span style="height:${curve[k] * 100}%"></span></span>
      <span class="num">${g === 0 ? "Today" : degrees(g)}</span>
    </button>`).join("");

  panel.querySelector("[data-list-title]").textContent = `Best places to restore${q ? ` in "${q}"` : ""}`;
  const csv = panel.querySelector("[data-csv]");
  csv.hidden = order.length === 0;
  csv.textContent = `Download ${order.length.toLocaleString("en-GB")} as CSV`;
  panel.querySelectorAll("[data-sort]").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.sort === state.sort)));

  panel.querySelector("[data-list]").innerHTML = top.map((i, k) => {
    const name = reefName(d, i);
    const second = state.sort === "people" ? compact(d.people_50km[i]) : tier(d.pressure.pressure[i]);
    return `<li><button type="button" data-reef="${i}">
      <span class="rank num">${k + 1}</span>
      <span><span class="item-name">${escapeHtml(name.name)}</span><span class="item-place">${escapeHtml(name.place)}</span></span>
      <span class="cols num"><span>${bleachingYears(d, i, warming())}/10</span><span>${second}</span></span>
    </button></li>`;
  }).join("");

  panel.querySelector("[data-list-note]").textContent = top.length
    ? `Reefs that bleach too often today but would hold with coral bred ${degrees(state.gain)} tougher, ${state.sort === "people" ? "ranked by people living within 50 km" : "ranked by local pressure and larvae from nearby reefs"}. Columns: bleaching years in the last 10, ${state.sort === "people" ? "people nearby" : "local pressure"}.`
    : `No reef here needs heat-tolerant coral${state.warm ? "" : " today"}. Try turning on warming, or another search.`;

  panel.querySelector("[data-examples]").innerHTML = EXAMPLES
    .map((e) => `<button class="ghost small" type="button" data-reef="${e.i}">${e.name}</button>`).join("");

  refreshMap(verdicts, matches);
  state._order = order;
}

function wireOverview() {
  let timer = null;
  panel.querySelector("[data-search]").addEventListener("input", (e) => {
    state.query = e.target.value;
    clearTimeout(timer);
    timer = setTimeout(() => {
      renderOverview();
      const matches = searchMatches();
      if (matches) flyToReefs([...matches]);
    }, 200);
  });
  panel.querySelector("[data-warm]").addEventListener("change", (e) => { state.warm = e.target.checked; renderOverview(); });
}

// One click handler for the whole panel, set up once.
panel.addEventListener("click", (e) => {
  if (state.selected !== null) return;
  const gain = e.target.closest("[data-gain]");
  if (gain && !gain.disabled) { state.gain = Number(gain.dataset.gain); renderOverview(); return; }
  const sort = e.target.closest("[data-sort]");
  if (sort) { state.sort = sort.dataset.sort; renderOverview(); return; }
  const reef = e.target.closest("[data-reef]");
  if (reef) { selectReef(Number(reef.dataset.reef)); return; }
  if (e.target.closest("[data-csv]")) downloadCsv(state._order);
});

function renderDetail(i) {
  const d = state.data;
  const w = warming();
  const v = verdict(d, i, w, state.gain);
  const name = reefName(d, i);
  const needed = toleranceNeeded(d, i, w);
  const text = v === "holds"
    ? "Bleaching-level heat hit it 2 or fewer years in 10. Corals here have time to recover."
    : v === "savable"
      ? `It bleaches too often for today's coral, but coral bred ${needed ?? state.gain} °C tougher would hold.`
      : needed !== null
        ? `It needs coral bred ${needed} °C tougher, more than the +${state.gain} °C breeding target. Money planted here is likely lost.`
        : "No coral we model would hold here. Money planted here is likely lost.";
  const p = d.pressure.pressure[i];
  const projects = d.projects.filter((x) => x[2] === i).map((x) => x[3]);

  panel.innerHTML = `
    <button class="back" type="button" data-back>
      <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true"><path d="M10 3 5 8l5 5" stroke="currentColor" stroke-width="1.6" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>
      All reefs
    </button>
    <h1>${escapeHtml(name.name)}</h1>
    <p class="place">${escapeHtml(name.place)}</p>
    <div class="verdict ${v}"><b>${LABELS[v].title}</b><p>${text}</p></div>
    <dl class="stats">
      <div><dt>Bleaching years, last 10</dt><dd class="num">${bleachingYears(d, i, w)}/10</dd></div>
      <div><dt>With 0.5 °C more warming</dt><dd class="num">${bleachingYears(d, i, w + WARMING_2040)}/10</dd></div>
      <div><dt>Coral heat tolerance needed</dt><dd class="num">${needed === null ? "Beyond +2 °C" : needed === 0 ? "None" : degrees(needed)}</dd></div>
      <div><dt>Local pressure</dt><dd>${p < 0 ? "No data" : `${tier(p)}`}</dd></div>
      <div><dt>Biggest local pressure</dt><dd style="font-size:16px">${p < 0 ? "No data" : mainPressure(d, i)}</dd></div>
      <div><dt>People within 50 km</dt><dd class="num">${longNumber(d.people_50km[i])}</dd></div>
      <div><dt>Reef tourism within 25 km</dt><dd class="num" style="font-size:16px">${money(d.tourism_usd_25km[i])}${d.tourism_usd_25km[i] ? " a year" : ""}</dd></div>
      <div><dt>People the reef shields from floods</dt><dd class="num">${longNumber(d.flood_people_25km[i])}</dd></div>
    </dl>
    <h2>Bleaching risk at the hottest time of each year</h2>
    ${riskChart(d, i)}
    <p class="fine">Bars above the line are bleaching years: the model put the reef past 50% risk. ${coords(d.lat[i], d.lon[i])}.</p>
    ${projects.length ? `<p class="fine"><b>Restoration projects here:</b> ${projects.map(escapeHtml).join(", ")}.</p>` : ""}`;
  panel.querySelector("[data-back]").addEventListener("click", () => selectReef(null));
  panel.scrollTop = 0;
  refreshMap();
}

function riskChart(d, i) {
  const W = 380, H = 120, years = d.years, bw = W / years.length;
  const bars = years.map((year, k) => {
    const risk = d.ann[k * d.n + i] / d.scale;
    const h = Math.max(1, risk * (H - 10));
    const color = risk >= 0.5 ? COLORS.beyond : "#c9d6e2";
    return `<rect x="${(k * bw + 1).toFixed(1)}" y="${(H - h).toFixed(1)}" width="${(bw - 2).toFixed(1)}" height="${h.toFixed(1)}" rx="1.5" fill="${color}"><title>${year}: ${pct(risk)} risk</title></rect>`;
  }).join("");
  const line = H - 0.5 * (H - 10);
  return `<svg class="chart" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" role="img" aria-label="Yearly bleaching risk ${years[0]} to ${years[years.length - 1]}">
      ${bars}<line x1="0" x2="${W}" y1="${line}" y2="${line}" stroke="#16202b" stroke-dasharray="3 3" stroke-width="1"/>
    </svg>
    <div class="chart-caption"><span>${years[0]}</span><span>50% risk</span><span>${years[years.length - 1]}</span></div>`;
}

function selectReef(i) {
  state.selected = i;
  render();
  if (i !== null && mapReady) {
    map.flyTo({ center: [state.data.lon[i], state.data.lat[i]], zoom: Math.max(map.getZoom(), 5), duration: 900 });
  }
}

function downloadCsv(order) {
  const d = state.data;
  const w = warming();
  const header = ["rank", "reef", "country", "lat", "lon", "bleaching_years_last_10", "bleaching_years_plus_0_5C",
    "heat_tolerance_needed_C", "people_within_50km", "reef_tourism_usd_per_year_25km",
    "people_protected_from_flooding_25km", "local_pressure_percentile", "main_pressure", "larvae_supply_percentile"];
  const rows = order.map((i, k) => [k + 1, reefName(d, i).name, d.countryName(i), d.lat[i], d.lon[i],
    bleachingYears(d, i, w), bleachingYears(d, i, w + WARMING_2040), toleranceNeeded(d, i, w) ?? "",
    d.people_50km[i], d.tourism_usd_25km[i], d.flood_people_25km[i], d.pressure.pressure[i],
    mainPressure(d, i), d.pressure.connect[i]]);
  const csv = [header, ...rows].map((r) => r.map((x) => `"${String(x).replaceAll('"', '""')}"`).join(",")).join("\n");
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
  a.download = "coralytics-restoration-sites.csv";
  a.click();
  URL.revokeObjectURL(a.href);
}

function escapeHtml(text) {
  return String(text).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

// ---------- Start ----------

document.getElementById("how-open").addEventListener("click", () => document.getElementById("how").showModal());

if (typeof maplibregl !== "undefined") initMap();

loadData()
  .then((data) => {
    state.data = data;
    document.getElementById("map-status").textContent = `Loading ${data.n.toLocaleString("en-GB")} reefs`;
    render();
  })
  .catch((err) => {
    document.getElementById("map-status").textContent = err.message;
    panel.innerHTML = `<p class="fine">${escapeHtml(err.message)}</p>`;
  });

// Exposed for tests.
window.coralytics = { state, bleachingYears, verdict, toleranceNeeded, restorationList, topSix, computeVerdicts, searchMatches };
