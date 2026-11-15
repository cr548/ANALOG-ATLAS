"use strict";

/* ===================== CONFIGURATION ===================== */
const NASA_API_KEY = "PKGKbWcrCjLGdtN9qft6qMdKLhfh8zbWBdPhKgkq";
const OPEN_TOPOGRAPHY_KEY = "476f9fb7281b57a36b66c0f77ffe86ec";
const OPEN_WEATHER_KEY = "3cf1f9fc49ddadfc05fff410fa481f27";
const CACHE_MS = 3 * 60 * 60 * 1000; /* live results are reused for 3 h so repeated clicks never burn API quota */

/* ============ STATIC GEOSPATIAL TRANSLATION MATRIX ============
   Space-agency vocabulary is translated once, here, into normalized
   keys. Runtime code only ever reads these keys, never raw strings.
   Terrain-class priors and mineral templates below are used ONLY as a
   fallback when live data cannot be fetched. */
const MINERALS = Object.freeze(["Pyroxene/Basalt", "Olivine", "Iron oxides", "Sulfates/Salts", "Clays", "Plagioclase", "Ice/Volatiles"]);

const PLANETS = Object.freeze({
  MARS: Object.freeze({ label: "Mars", color: "#00F0FF", minerals: [38, 8, 16, 10, 12, 6, 10], rover: "curiosity" }),
  MOON: Object.freeze({ label: "Moon", color: "#C084FC", minerals: [30, 10, 3, 0, 0, 52, 5], rover: null })
});

const DEFAULT_TYPE = "GENERAL_LAND";
const DEFAULT_CLIMATE = Object.freeze({ temp: 15, hum: 50, press: 1013 });

const TYPES = Object.freeze({
  HYPERARID_DESERT: Object.freeze({ label: "Dryland / desert terrain", base: { MARS: 0.94, MOON: 0.60 },
    minerals: [30, 6, 24, 14, 16, 6, 4], climate: { temp: 14, hum: 8, press: 770 } }),
  VOLCANIC_LAVA_TUBE: Object.freeze({ label: "Volcanic lava-flow terrain", base: { MARS: 0.78, MOON: 0.88 },
    minerals: [45, 18, 8, 2, 6, 14, 7], climate: { temp: 17, hum: 70, press: 1010 } }),
  BASALTIC_PLAIN: Object.freeze({ label: "Basaltic volcanic plain", base: { MARS: 0.82, MOON: 0.84 },
    minerals: [48, 14, 10, 1, 8, 17, 2], climate: { temp: 9, hum: 75, press: 820 } }),
  IMPACT_CRATER: Object.freeze({ label: "Impact structure terrain", base: { MARS: 0.76, MOON: 0.88 },
    minerals: [28, 6, 6, 6, 10, 40, 4], climate: { temp: 14, hum: 35, press: 830 } }),
  POLAR_ICE: Object.freeze({ label: "Polar dry valley / ice terrain", base: { MARS: 0.88, MOON: 0.62 },
    minerals: [22, 4, 4, 8, 6, 16, 40], climate: { temp: -20, hum: 45, press: 990 } }),
  EVAPORITE_SULFATE: Object.freeze({ label: "Sulfate evaporite basin", base: { MARS: 0.90, MOON: 0.38 },
    minerals: [14, 2, 22, 40, 12, 5, 5], climate: { temp: 32, hum: 35, press: 1000 } }),
  /* Honest fallback: land with no dryland, polar, volcanic, evaporite or known-impact evidence is NOT called basaltic or cratered. */
  GENERAL_LAND: Object.freeze({ label: "General land (no specific analog terrain class)", base: { MARS: 0.30, MOON: 0.30 },
    minerals: [18, 4, 8, 6, 14, 45, 5], climate: { temp: 12, hum: 65, press: 1013 } })
});

/* Named, real planetary features used as comparison targets. The best one for a site is chosen purely from numbers
   (temperature, atmospheric pressure, slope), never from appearance. Slopes and elevations here are approximate. */
const REFERENCE_SITES = Object.freeze({
  MARS: [
    { name: "Gale Crater", types: ["IMPACT_CRATER", "HYPERARID_DESERT"], lat: -5.4, lon: 137.8, slope: 12, elev: -4400 },
    { name: "Jezero Crater", types: ["IMPACT_CRATER"], lat: 18.4, lon: 77.5, slope: 8, elev: -2600 },
    { name: "Holden Crater", types: ["IMPACT_CRATER", "HYPERARID_DESERT"], lat: -26.4, lon: -34.0, slope: 10, elev: -1000 },
    { name: "Gusev Crater", types: ["IMPACT_CRATER", "BASALTIC_PLAIN"], lat: -14.6, lon: 175.5, slope: 4, elev: -1900 },
    { name: "Noachis Terra", types: ["IMPACT_CRATER"], lat: -45.0, lon: 15.0, slope: 10, elev: 1500 },
    { name: "Argyre Planitia", types: ["HYPERARID_DESERT", "IMPACT_CRATER"], lat: -49.7, lon: -42.4, slope: 2, elev: -4500 },
    { name: "Hellas Planitia", types: ["HYPERARID_DESERT"], lat: -42.4, lon: 70.5, slope: 3, elev: -7000 },
    { name: "Nili Fossae", types: ["HYPERARID_DESERT", "EVAPORITE_SULFATE"], lat: 21.0, lon: 74.5, slope: 6, elev: 0 },
    { name: "Meridiani Planum", types: ["EVAPORITE_SULFATE", "HYPERARID_DESERT"], lat: -2.0, lon: -6.0, slope: 1, elev: -1400 },
    { name: "Valles Marineris", types: ["IMPACT_CRATER", "EVAPORITE_SULFATE"], lat: -13.9, lon: -59.2, slope: 20, elev: -4000 },
    { name: "Arsia Mons", types: ["VOLCANIC_LAVA_TUBE"], lat: -8.3, lon: -120.1, slope: 8, elev: 11700 },
    { name: "Olympus Mons", types: ["VOLCANIC_LAVA_TUBE", "BASALTIC_PLAIN"], lat: 18.7, lon: -133.8, slope: 5, elev: 21000 },
    { name: "Pavonis Mons", types: ["VOLCANIC_LAVA_TUBE"], lat: 0.8, lon: -113.4, slope: 6, elev: 14000 },
    { name: "Ascraeus Mons", types: ["VOLCANIC_LAVA_TUBE"], lat: 11.8, lon: -104.5, slope: 6, elev: 14900 },
    { name: "Noctis Labyrinthus", types: ["VOLCANIC_LAVA_TUBE", "IMPACT_CRATER"], lat: -7.0, lon: -101.0, slope: 15, elev: 5000 },
    { name: "Cerberus Fossae", types: ["VOLCANIC_LAVA_TUBE", "BASALTIC_PLAIN"], lat: 6.0, lon: 165.0, slope: 6, elev: -2600 },
    { name: "Elysium Planitia", types: ["BASALTIC_PLAIN"], lat: 3.0, lon: 154.7, slope: 2, elev: -2500 },
    { name: "Hesperia Planum", types: ["BASALTIC_PLAIN"], lat: -21.4, lon: 109.0, slope: 2, elev: 1200 },
    { name: "Syrtis Major Planum", types: ["BASALTIC_PLAIN"], lat: 8.4, lon: 69.5, slope: 3, elev: 1000 },
    { name: "Isidis Planitia", types: ["BASALTIC_PLAIN", "HYPERARID_DESERT"], lat: 13.0, lon: 87.0, slope: 1, elev: -3800 },
    { name: "Chryse Planitia", types: ["BASALTIC_PLAIN", "EVAPORITE_SULFATE"], lat: 28.4, lon: -40.0, slope: 1, elev: -3600 },
    { name: "Utopia Planitia", types: ["BASALTIC_PLAIN", "POLAR_ICE"], lat: 46.7, lon: 117.5, slope: 1, elev: -4000 },
    { name: "Vastitas Borealis", types: ["POLAR_ICE"], lat: 68.2, lon: -125.7, slope: 1, elev: -4100 },
    { name: "Planum Boreum", types: ["POLAR_ICE"], lat: 85.0, lon: 0.0, slope: 3, elev: -2000 },
    { name: "Planum Australe", types: ["POLAR_ICE"], lat: -87.0, lon: 0.0, slope: 3, elev: 2500 }
  ],
  MOON: [
    { name: "Tycho Crater", types: ["IMPACT_CRATER"], lat: -43.3, lon: -11.4, slope: 25, elev: -2000 },
    { name: "Copernicus Crater", types: ["IMPACT_CRATER"], lat: 9.6, lon: -20.1, slope: 22, elev: -2000 },
    { name: "Aristarchus Crater", types: ["IMPACT_CRATER", "VOLCANIC_LAVA_TUBE"], lat: 23.7, lon: -47.4, slope: 20, elev: -2500 },
    { name: "Orientale Basin", types: ["IMPACT_CRATER"], lat: -19.4, lon: -92.8, slope: 15, elev: -2000 },
    { name: "South Pole-Aitken Basin", types: ["IMPACT_CRATER", "HYPERARID_DESERT"], lat: -53.0, lon: -169.0, slope: 12, elev: -6000 },
    { name: "Descartes Highlands", types: ["HYPERARID_DESERT", "IMPACT_CRATER"], lat: -9.0, lon: 15.5, slope: 10, elev: 500 },
    { name: "Taurus-Littrow", types: ["HYPERARID_DESERT"], lat: 20.2, lon: 30.8, slope: 8, elev: -2000 },
    { name: "Reiner Gamma", types: ["HYPERARID_DESERT", "BASALTIC_PLAIN"], lat: 7.5, lon: -59.0, slope: 1, elev: -2500 },
    { name: "Marius Hills", types: ["VOLCANIC_LAVA_TUBE"], lat: 14.1, lon: -56.8, slope: 5, elev: -1500 },
    { name: "Hadley Rille", types: ["VOLCANIC_LAVA_TUBE", "BASALTIC_PLAIN"], lat: 26.0, lon: 3.6, slope: 6, elev: -2500 },
    { name: "Schroter's Valley", types: ["VOLCANIC_LAVA_TUBE"], lat: 26.2, lon: -50.8, slope: 6, elev: -2500 },
    { name: "Mons Rumker", types: ["VOLCANIC_LAVA_TUBE", "BASALTIC_PLAIN"], lat: 40.8, lon: -58.1, slope: 5, elev: -1000 },
    { name: "Gruithuisen Domes", types: ["VOLCANIC_LAVA_TUBE"], lat: 36.3, lon: -39.5, slope: 8, elev: -1500 },
    { name: "Compton-Belkovich", types: ["VOLCANIC_LAVA_TUBE"], lat: 61.0, lon: 99.5, slope: 5, elev: 0 },
    { name: "Mare Tranquillitatis", types: ["BASALTIC_PLAIN"], lat: 8.5, lon: 31.4, slope: 2, elev: -2000 },
    { name: "Oceanus Procellarum", types: ["BASALTIC_PLAIN"], lat: 18.4, lon: -57.4, slope: 2, elev: -2500 },
    { name: "Mare Imbrium", types: ["BASALTIC_PLAIN"], lat: 32.8, lon: -15.6, slope: 2, elev: -2500 },
    { name: "Mare Crisium", types: ["BASALTIC_PLAIN"], lat: 17.0, lon: 59.1, slope: 2, elev: -3000 },
    { name: "Mare Nubium", types: ["BASALTIC_PLAIN"], lat: -21.3, lon: -16.6, slope: 2, elev: -2000 },
    { name: "Mare Vaporum", types: ["BASALTIC_PLAIN"], lat: 13.3, lon: 3.6, slope: 2, elev: -1500 },
    { name: "Mare Serenitatis", types: ["BASALTIC_PLAIN"], lat: 28.0, lon: 17.5, slope: 1.5, elev: -3000 },
    { name: "Shackleton Crater", types: ["POLAR_ICE"], lat: -89.9, lon: 0, slope: 20, elev: 0 },
    { name: "Cabeus Crater", types: ["POLAR_ICE"], lat: -84.9, lon: -35.5, slope: 20, elev: 0 },
    { name: "Faustini Crater", types: ["POLAR_ICE"], lat: -87.3, lon: 77.0, slope: 20, elev: 0 },
    { name: "Peary Crater", types: ["POLAR_ICE"], lat: 88.6, lon: 33.0, slope: 18, elev: 0 }
  ]
});

const pct = (v) => Math.round(v * 100);
const SITES = Object.freeze([
  { id: "atacama", name: "Atacama Desert", country: "Chile", lat: -24.09, lon: -69.93, type: "HYPERARID_DESERT", elev: 2400, slope: 7 },
  { id: "dryvalleys", name: "McMurdo Dry Valleys", country: "Antarctica", lat: -77.52, lon: 161.5, type: "POLAR_ICE", elev: 700, slope: 12 },
  { id: "riotinto", name: "Rio Tinto", country: "Spain", lat: 37.72, lon: -6.55, type: "EVAPORITE_SULFATE", elev: 300, slope: 9 },
  { id: "danakil", name: "Danakil Depression", country: "Ethiopia", lat: 14.24, lon: 40.30, type: "EVAPORITE_SULFATE", elev: -120, slope: 2 },
  { id: "devon", name: "Haughton Crater, Devon Island", country: "Canada", lat: 75.38, lon: -89.7, type: "IMPACT_CRATER", elev: 200, slope: 11 },
  { id: "maunakea", name: "Mauna Kea", country: "USA (Hawaii)", lat: 19.82, lon: -155.47, type: "BASALTIC_PLAIN", elev: 3500, slope: 14 },
  { id: "askja", name: "Askja Caldera", country: "Iceland", lat: 65.03, lon: -16.75, type: "BASALTIC_PLAIN", elev: 1050, slope: 6 },
  { id: "barringer", name: "Barringer (Meteor) Crater", country: "USA (Arizona)", lat: 35.03, lon: -111.02, type: "IMPACT_CRATER", elev: 1740, slope: 18 },
  { id: "lanzarote", name: "Lanzarote Lava Tubes", country: "Spain", lat: 29.05, lon: -13.43, type: "VOLCANIC_LAVA_TUBE", elev: 200, slope: 8 },
  { id: "craters", name: "Craters of the Moon", country: "USA (Idaho)", lat: 43.46, lon: -113.56, type: "VOLCANIC_LAVA_TUBE", elev: 1800, slope: 6 },
  { id: "deathvalley", name: "Death Valley", country: "USA (California)", lat: 36.46, lon: -116.87, type: "HYPERARID_DESERT", elev: -80, slope: 6 },
  { id: "uyuni", name: "Salar de Uyuni", country: "Bolivia", lat: -20.13, lon: -67.49, type: "EVAPORITE_SULFATE", elev: 3656, slope: 0.2 },
  { id: "kilauea", name: "Kilauea Caldera", country: "USA (Hawaii)", lat: 19.41, lon: -155.28, type: "BASALTIC_PLAIN", elev: 1200, slope: 4 },
  { id: "svalbard", name: "Svalbard (Adventdalen)", country: "Norway", lat: 78.2, lon: 15.9, type: "POLAR_ICE", elev: 100, slope: 8 }
]);
/* Each site starts at its terrain-class baseline (marked with *) and is re-scored from live data (see warmUp, which now runs only on request). */
SITES.forEach((x) => { x.scores = { MARS: pct(TYPES[x.type].base.MARS), MOON: pct(TYPES[x.type].base.MOON) }; x.scored = false; });

/* ============================ STATE & HELPERS ============================ */
const state = { mode: "MARS", view: "EARTH", pt: null, ptTok: 0, pmap: null, site: null, map: null, markers: new Map(), custom: null, token: 0, refIdx: 0, planetView: null, planetMap: null };
const $ = (id) => document.getElementById(id);
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const wrapLon = (lon) => ((((lon + 180) % 360) + 360) % 360) - 180;
const fmt = (n, d = 0) => (Number.isFinite(n) ? n.toLocaleString("en-US", { maximumFractionDigits: d }) : "n/a");
const typeOf = (key) => {
  if (TYPES[key]) return TYPES[key];
  notify(`Unrecognized analog type "${esc(key)}". Using the ${TYPES[DEFAULT_TYPE].label} profile instead.`);
  return TYPES[DEFAULT_TYPE];
};

function notify(msg, level = "warn") {
  try {
    const box = $("alerts");
    const el = document.createElement("div");
    el.className = "alert " + (level === "warn" ? "" : level);
    el.innerHTML = `<span>${msg}</span><button aria-label="Dismiss">×</button>`;
    el.querySelector("button").onclick = () => el.remove();
    box.prepend(el);
    while (box.children.length > 4) box.lastChild.remove();
    setTimeout(() => el.remove(), 12000);
  } catch (e) { console.error("notify failed", e); }
}

async function request(url, kind = "json", ms = 9000) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), ms);
  try {
    const res = await fetch(url, { signal: ctrl.signal });
    if (!res.ok) throw new Error("HTTP " + res.status);
    return kind === "json" ? await res.json() : await res.text();
  } finally { clearTimeout(timer); }
}

function placeholder(title, sub, color) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="640" height="480"><defs><radialGradient id="g" cx="50%" cy="40%" r="80%"><stop offset="0" stop-color="${color}" stop-opacity=".35"/><stop offset="1" stop-color="#090A10"/></radialGradient></defs><rect width="640" height="480" fill="url(#g)"/><g fill="none" stroke="${color}" stroke-opacity=".5"><circle cx="320" cy="210" r="70"/><circle cx="320" cy="210" r="110" stroke-dasharray="6 8"/></g><text x="320" y="360" text-anchor="middle" fill="#E6E9F5" font-family="sans-serif" font-size="26">${esc(title)}</text><text x="320" y="395" text-anchor="middle" fill="#8A90A8" font-family="sans-serif" font-size="18">${esc(sub)}</text></svg>`;
  return "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svg);
}

function earthTerrainArt(name) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="640" height="480"><defs><linearGradient id="s" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#1B2A4A"/><stop offset="1" stop-color="#0B1020"/></linearGradient></defs><rect width="640" height="480" fill="url(#s)"/><circle cx="500" cy="110" r="36" fill="#7F8AA8" fill-opacity=".35"/><path d="M0 330 L110 240 L190 300 L300 190 L420 310 L520 250 L640 320 L640 480 L0 480Z" fill="#2B3555"/><path d="M0 390 L140 320 L250 380 L380 300 L520 380 L640 340 L640 480 L0 480Z" fill="#1A2240"/><text x="320" y="440" text-anchor="middle" fill="#E6E9F5" font-family="sans-serif" font-size="24">${esc(name)}</text><text x="320" y="466" text-anchor="middle" fill="#8A90A8" font-family="sans-serif" font-size="16">Loading satellite view...</text></svg>`;
  return "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svg);
}

/* ============================ DATA PIPELINES ============================ */
async function getWeather(site, quiet) {
  const fb = (TYPES[site.type] && TYPES[site.type].climate) || DEFAULT_CLIMATE;
  try {
    const d = await request(`https://api.openweathermap.org/data/2.5/weather?lat=${site.lat}&lon=${site.lon}&units=metric&appid=${OPEN_WEATHER_KEY}`);
    const temp = Number(d && d.main && d.main.temp), hum = Number(d && d.main && d.main.humidity), press = Number(d && d.main && d.main.pressure);
    if (![temp, hum, press].every(Number.isFinite)) throw new Error("Unexpected weather payload");
    return { temp, hum, press, grnd: Number(d.main.grnd_level), desc: (d.weather && d.weather[0] && d.weather[0].description) || "n/a", country: (d.sys && d.sys.country) || "", live: true };
  } catch (e) {
    console.warn("Weather fallback:", e);
    if (!quiet) notify("Live weather unavailable. Showing climatology from the local matrix.");
    return { ...fb, desc: "climatology estimate", live: false };
  }
}

async function getTerrain(site, quiet) {
  const d = 0.05;
  const url = `https://portal.opentopography.org/API/globaldem?demtype=SRTM15Plus&south=${Math.max(-89.99, site.lat - d)}&north=${Math.min(89.99, site.lat + d)}&west=${Math.max(-179.99, site.lon - d)}&east=${Math.min(179.99, site.lon + d)}&outputFormat=AAIGrid&API_Key=${OPEN_TOPOGRAPHY_KEY}`;
  try {
    const txt = await request(url, "text", 14000);
    const lines = txt.trim().split(/\r?\n/);
    const hdr = {};
    let i = 0;
    for (; i < lines.length; i++) {
      const p = lines[i].trim().split(/\s+/);
      if (p.length === 2 && /^[a-z_]+$/i.test(p[0])) hdr[p[0].toLowerCase()] = Number(p[1]); else break;
    }
    const nd = hdr.nodata_value;
    const grid = lines.slice(i).map((l) => l.trim().split(/\s+/).map(Number)).filter((r) => r.length > 1);
    const vals = grid.flat().filter((v) => Number.isFinite(v) && v !== nd);
    if (!vals.length || !Number.isFinite(hdr.cellsize)) throw new Error("Unexpected DEM format");
    let mn = Infinity, mx = -Infinity, tot = 0;
    vals.forEach((v) => { tot += v; if (v < mn) mn = v; if (v > mx) mx = v; });
    const cell = hdr.cellsize * 111320, cellX = Math.max(1, cell * Math.cos((site.lat * Math.PI) / 180));
    let sum = 0, n = 0;
    for (let r = 0; r < grid.length - 1; r++) for (let c = 0; c < grid[r].length - 1; c++) {
      const a = grid[r][c], dx = grid[r][c + 1] - a, dy = grid[r + 1][c] - a;
      if ([a, dx, dy].every(Number.isFinite) && a !== nd && grid[r][c + 1] !== nd && grid[r + 1][c] !== nd) {
        sum += Math.atan(Math.hypot(dx / cellX, dy / cell)) * 180 / Math.PI; n++;
      }
    }
    return { elev: tot / vals.length, min: mn, max: mx, slope: n ? sum / n : 0, live: true };
  } catch (e) {
    console.warn("Terrain fallback:", e);
    try {
      const dLat = 0.02, dLon = 0.02 / Math.max(0.2, Math.cos((site.lat * Math.PI) / 180));
      const offs = [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]];
      const lats = offs.map((o) => clamp(site.lat + o[0] * dLat, -89.9, 89.9).toFixed(5));
      const lons = offs.map((o) => wrapLon(site.lon + o[1] * dLon).toFixed(5));
      const m = await request(`https://api.open-meteo.com/v1/elevation?latitude=${lats.join(",")}&longitude=${lons.join(",")}`);
      const z = (m && m.elevation) || [];
      if (z.length !== 9 || !z.every(Number.isFinite)) throw new Error("Bad elevation payload");
      let sum = 0;
      for (let k = 1; k < 9; k++) {
        const dy = offs[k][0] * dLat * 111320, dx = offs[k][1] * dLon * 111320 * Math.cos((site.lat * Math.PI) / 180);
        sum += (Math.atan(Math.abs(z[k] - z[0]) / Math.hypot(dx, dy)) * 180) / Math.PI;
      }
      if (!quiet) notify("OpenTopography unavailable. Elevation and slope measured with the Open-Meteo DEM instead (about 2 km spacing).");
      /* measured but coarser: flagged partial so the UI never claims a full DEM measurement */
      return { elev: z[0], min: Math.min(...z), max: Math.max(...z), slope: sum / 8, live: false, partial: true };
    } catch (e2) { console.warn("Open-Meteo fallback failed:", e2); }
    if (!quiet) notify("Elevation services failed. Using reference elevation and slope from the matrix, so the ocean check could not run.");
    return { elev: Number.isFinite(site.elev) ? site.elev : 500, min: NaN, max: NaN, slope: Number.isFinite(site.slope) ? site.slope : 5, live: false, offline: true };
  }
}

/* Real mapped bedrock at the site (Macrostrat, keyless). Lithology words are converted to a mineral profile with standard petrology. */
const ROCK_CLASSES = Object.freeze([
  { id: "basalt", label: "basalt / mafic volcanic", re: /basalt|mafic|gabbro|diabase|dolerite|volcanic|lava|scoria|cinder/i, vec: [46, 14, 8, 1, 6, 22, 3] },
  { id: "felsic", label: "felsic volcanic", re: /andesite|rhyolite|dacite|trachyte|felsic|ignimbrite|tuff/i, vec: [14, 3, 6, 2, 10, 60, 5] },
  { id: "granitic", label: "granitic / metamorphic", re: /granit|granodiorite|gneiss|schist|metamorphic|plutonic|intrusive|quartzite|migmatite/i, vec: [10, 2, 5, 1, 7, 70, 5] },
  { id: "ultramafic", label: "ultramafic", re: /ultramafic|peridotite|dunite|serpentin|komatiite/i, vec: [30, 50, 10, 1, 5, 2, 2] },
  { id: "sandstone", label: "sandstone / sand", re: /sandstone|\bsand\b|dune|eolian|aeolian|siliciclastic|conglomerate|arkose|quartz/i, vec: [8, 1, 18, 6, 12, 50, 5] },
  { id: "carbonate", label: "carbonate", re: /limestone|dolomite|dolostone|carbonate|marl|chalk|travertine/i, vec: [4, 0, 6, 60, 14, 6, 10] },
  { id: "evaporite", label: "evaporite", re: /evaporite|gypsum|anhydrite|halite|salt flat|salar|sulfate|sulphate|playa/i, vec: [4, 0, 8, 70, 8, 4, 6] },
  { id: "mudstone", label: "mudstone / shale", re: /shale|mudstone|claystone|\bclay\b|siltstone|argillite|slate/i, vec: [6, 1, 14, 8, 45, 20, 6] },
  { id: "sediment", label: "unconsolidated sediment", re: /alluvi|colluvi|sediment|unconsolidated|gravel|silt|loess|fluvial|lacustrine|\btill\b|moraine|soil|clastic/i, vec: [15, 3, 12, 10, 14, 38, 8] },
  { id: "ice", label: "ice / glacial", re: /\bice\b|glacier|snow|permafrost/i, vec: [4, 0, 2, 2, 2, 10, 80] }
]);

async function getGeology(site, quiet) {
  try {
    const d = await request(`https://macrostrat.org/api/v2/geologic_units/map?lat=${clamp(site.lat, -89.9, 89.9)}&lng=${site.lon}&response=long`, "json", 10000);
    const data = d && d.success && d.success.data;
    const units = Array.isArray(data) ? data : (data && (data.mapData || data.map_data)) || [];
    if (!Array.isArray(units) || !units.length) throw new Error("No mapped geology here");
    const counts = {}, names = [];
    const PRIORITY = ["ice", "evaporite", "ultramafic", "felsic", "granitic", "basalt", "carbonate", "mudstone", "sandstone", "sediment"];
    /* Large-scale (detailed) map units count most; coarse "tiny" continental units count least. */
    const SW = { large: 1, medium: 0.6, small: 0.3, tiny: 0.15 };
    const classOf = (text) => PRIORITY.find((id) => ROCK_CLASSES.find((rc) => rc.id === id).re.test(text));
    const volAges = [];
    units.slice(0, 12).forEach((u) => {
      if (u.name && names.length < 2) names.push(String(u.name));
      const w = SW[u.scale] || 0.3;
      /* lithology list first: "Major:{sandstone}, Minor:{dolostone}" uses the major part; the first-listed rock counts fully, the rest 40% */
      let lt = String(u.lith || ""); const mj = /Major:\{([^}]*)\}/i.exec(lt); if (mj) lt = mj[1];
      const toks = lt.split(/[,;]/).map((x) => x.trim()).filter(Boolean);
      let any = false;
      toks.forEach((tk, k) => { const hit = classOf(tk); if (hit) { counts[hit] = (counts[hit] || 0) + w * (k === 0 ? 1 : 0.4); any = true; if ((hit === "basalt" || hit === "ultramafic") && Number.isFinite(u.t_age)) volAges.push(u.t_age); } });
      if (any) return;
      for (const fields of [[u.strat_name, u.name], [u.descrip, u.comments]]) {
        const hit = classOf(fields.filter(Boolean).join(" "));
        if (hit) { counts[hit] = (counts[hit] || 0) + w; if ((hit === "basalt" || hit === "ultramafic") && Number.isFinite(u.t_age)) volAges.push(u.t_age); break; }
      }
    });
    const total = Object.values(counts).reduce((a, b) => a + b, 0);
    if (!total) throw new Error("No recognizable lithology");
    const vec = MINERALS.map((_, i) => Math.round(ROCK_CLASSES.reduce((acc, rc) => acc + (counts[rc.id] || 0) * rc.vec[i], 0) / total));
    const labels = ROCK_CLASSES.filter((rc) => counts[rc.id]).sort((a, b) => counts[b.id] - counts[a.id]).map((rc) => rc.label).slice(0, 3);
    const gl = glimAt(site.lat, site.lon);
    const top = Object.keys(counts).sort((x, y) => counts[y] - counts[x])[0];
    const fam = (id) => ({ basalt: "mafic", ultramafic: "mafic", felsic: "felsic", granitic: "felsic", ice: "ice" }[id] || "sed");
    const agree = gl ? GLIM_CLASS[gl].ids.some((id) => fam(id) === fam(top)) : null;
    return { vec, counts, labels, names, live: true, mapped: true, src: "Macrostrat map", youngVolcMa: volAges.length ? Math.min(...volAges) : null, glim: gl ? { label: GLIM_CLASS[gl].label } : null, agree };
  } catch (e) {
    console.warn("Geology fallback:", e);
    const glg = glimGeology(site); if (glg) return glg; /* independent global lithology map (GLiM) when Macrostrat has nothing or is unreachable */
    /* three different outcomes: nothing mapped here (open water or no coverage), land with unreadable rock names, or a failed request */
    const msg = String((e && e.message) || e);
    const empty = /No mapped geology/.test(msg), land = /recognizable/.test(msg);
    if (!quiet && !empty) notify("Mapped geology unavailable here. Using the typical mineral template for this terrain type.");
    return { empty, land, failed: !empty && !land, reason: msg };
  }
}

/* Annual climate (previous full year, ERA5 via Open-Meteo, no key): today's weather says little about a place's climate. */
async function getClimate(site, quiet) {
  const y = new Date().getFullYear() - 1;
  const url = `https://archive-api.open-meteo.com/v1/archive?latitude=${clamp(site.lat, -89.9, 89.9)}&longitude=${site.lon}&start_date=${y}-01-01&end_date=${y}-12-31&daily=temperature_2m_mean,precipitation_sum,et0_fao_evapotranspiration&timezone=UTC`;
  try {
    const d = await request(url, "json", 15000);
    const D = d && d.daily;
    if (!D) throw new Error("No daily climate block");
    const ok = (a) => (a || []).filter((v) => Number.isFinite(v));
    const temps = ok(D.temperature_2m_mean), rain = ok(D.precipitation_sum), pet = ok(D.et0_fao_evapotranspiration);
    if (temps.length < 300 || rain.length < 300 || pet.length < 300) throw new Error("Incomplete climate series");
    const sum = (a) => a.reduce((x, v) => x + v, 0);
    const P = sum(rain), E = sum(pet);
    const mo = {};
    (D.time || []).forEach((day, i) => { const v = D.temperature_2m_mean[i]; if (Number.isFinite(v)) { const m = Number(String(day).slice(5, 7)); (mo[m] = mo[m] || []).push(v); } });
    const monthly = Object.values(mo).filter((a) => a.length >= 20).map((a) => sum(a) / a.length);
    const warm = monthly.length ? Math.max(...monthly) : NaN;
    return { temp: sum(temps) / temps.length, warm, precip: P, pet: E, ai: E > 0 ? P / E : 1, live: true, year: y };
  } catch (e) {
    console.warn("Climate fallback:", e);
    if (!quiet) notify("Annual climate data unavailable. Aridity is estimated from current humidity.");
    return null;
  }
}

/* Reverse geocoding (OpenStreetMap Nominatim, keyless). Gives a clicked point a real place name, and is also one of the independent
   water/land signals: over open water Nominatim answers "Unable to geocode" (water: true). A failed request returns null (unknown). */
const geoMemo = new Map();
function geocode(s) {
  const key = s.lat.toFixed(3) + "," + s.lon.toFixed(3);
  if (geoMemo.has(key)) return geoMemo.get(key);
  const p = (async () => {
    try {
      const d = await request(`https://nominatim.openstreetmap.org/reverse?format=jsonv2&zoom=8&accept-language=en&lat=${s.lat}&lon=${s.lon}`, "json", 6000);
      if (d && d.error) return { water: /unable to geocode/i.test(String(d.error)), place: null, country: null };
      const a = d && d.address;
      if (!a) return null;
      return { water: false, place: a.state || a.region || a.county || a.state_district || null, country: a.country || null };
    } catch (e) { console.warn("Geocode failed:", e); return null; }
  })();
  geoMemo.set(key, p);
  return p;
}

/* WATER OR LAND? Several independent signals vote, so one failing service cannot break the check.
   Water evidence (1 point each): elevation at or below sea level (SRTM15+ includes sea floor), OpenWeather returns no country code,
   no mapped bedrock anywhere (Macrostrat and GLiM both empty), the geocoder finds no land address.
   Land evidence (vetoes water): Macrostrat maps bedrock here, OpenWeather names a country, elevation clearly above sea level (over 20 m),
   or the geocoder names a place. Land below sea level (Danakil, Death Valley) always has land evidence, so it is never flagged.
   A spot counts as water only with at least 2 water points and no land evidence. */
function detectWater(d) {
  const why = [], land = [];
  const elev = d.t.elev, elevOk = Number.isFinite(elev) && !d.t.offline;
  const macro = Boolean(d.g && !/^GLiM/i.test(String(d.g.src || "")));
  if (macro) land.push("Macrostrat maps bedrock here");
  if (d.geoLand) land.push("land with mapped rock units");
  if (d.w.live && d.w.country) land.push("OpenWeather reports a country (" + d.w.country + ")");
  if (elevOk && elev > 20) land.push("elevation is above sea level (" + fmt(elev) + " m)");
  if (d.gc && !d.gc.water && (d.gc.place || d.gc.country)) land.push("geocoder names " + (d.gc.place || d.gc.country));
  if (elevOk && elev <= 0) why.push("elevation " + fmt(elev) + " m (at or below sea level)");
  if (d.w.live && !d.w.country) why.push("OpenWeather gives no country, as over open water");
  if (d.geoEmpty) why.push("no mapped bedrock in Macrostrat or GLiM");
  if (d.gc && d.gc.water) why.push("the geocoder finds no land address");
  const checks = (elevOk ? 1 : 0) + (d.w.live ? 1 : 0) + (d.geoEmpty || d.g || d.geoLand ? 1 : 0) + (d.gc ? 1 : 0);
  return { ocean: land.length === 0 && why.length >= 2, why, land, unverified: checks < 2 };
}

/* OpenWeather reports pressure at sea level; Mars/Moon comparisons need pressure at the surface where the site sits.
   Uses the station-level value when OpenWeather supplies it, otherwise the barometric formula (valid below sea level too). */
function surfacePressure(w, elev) {
  if (!w.live) return w.press;
  if (Number.isFinite(w.grnd) && w.grnd > 0) return w.grnd;
  const h = Number.isFinite(elev) ? clamp(elev, -500, 9000) : 0, T = w.temp + 273.15;
  return w.press * Math.pow(1 - (0.0065 * h) / (T + 0.0065 * h), 5.257);
}

/* Live results are cached per ~1 km cell so quota is not burned and repeat clicks are instant. Only fully live results are stored. */
function cacheGet(key) {
  try { const j = JSON.parse(localStorage.getItem(key) || "null"); if (j && Date.now() - j.at < CACHE_MS) return j.d; } catch (e) { /* storage unavailable */ }
  return null;
}
function cacheSet(key, d) {
  try { localStorage.setItem(key, JSON.stringify({ at: Date.now(), d })); } catch (e) { /* quota or private mode */ }
}

/* Optional bundled snapshot (sites_baseline.json, made with the "Save snapshot" button) so the 14 preset sites need no API calls at startup. */
const BASELINE = { at: null, sites: {} };
const cloneJSON = (o) => JSON.parse(JSON.stringify(o));
const goodRaw = (r) => Boolean(r && r[0] && r[0].live && r[1] && r[2] && r[2].live && r[3] && (r[3].mapped || r[3].empty));
async function loadBaseline() {
  try {
    const ctl = new AbortController(), timer = setTimeout(() => ctl.abort(), 2500);
    const res = await fetch("sites_baseline.json", { signal: ctl.signal, cache: "no-cache" });
    clearTimeout(timer);
    if (!res.ok) return 0;
    const j = await res.json();
    if (!j || typeof j.sites !== "object") return 0;
    BASELINE.at = j.generated || null;
    SITES.forEach((x) => { if (goodRaw(j.sites[x.id])) BASELINE.sites[x.id] = j.sites[x.id]; });
    return Object.keys(BASELINE.sites).length;
  } catch (e) { return 0; }   /* no snapshot file (or opened from disk): fine, sites load live when opened */
}

function analyze(s, quiet, force) {
  if (force) s._p = null;
  if (!s._p) s._p = (async () => {
    const ck = "analog:v3:" + s.lat.toFixed(2) + "," + s.lon.toFixed(2);
    const gcP = s.id === "custom" ? geocode(s) : null;           /* water/land probe + place name, runs alongside the other requests */
    let raw = force ? null : cacheGet(ck), fromSnap = false;
    if (!raw && !force && s.id !== "custom" && BASELINE.sites[s.id]) { raw = cloneJSON(BASELINE.sites[s.id]); fromSnap = true; }
    if (!raw) {
      raw = await Promise.all([getWeather(s, quiet), getClimate(s, quiet), getTerrain(s, quiet), getGeology(s, quiet)]);
      if (goodRaw(raw)) cacheSet(ck, raw);
    }
    s._raw = goodRaw(raw) ? cloneJSON(raw) : null;          /* untouched copy for "Save snapshot" (w.press is adjusted below) */
    const [w, c0, t, g0] = raw;
    const g = g0 && g0.mapped ? g0 : null;
    const c = c0 || { temp: w.temp, ai: clamp(w.hum / 100, 0, 1) * 0.65, live: false };
    w.seaPress = w.press;
    w.press = surfacePressure(w, t.elev);
    const gc = gcP ? await gcP : null;
    const data = { snapshot: fromSnap, gc, w, c, t, g, geoEmpty: Boolean(g0 && g0.empty), geoLand: Boolean(g0 && g0.land), geoFailed: Boolean(g0 && g0.failed) };
    s.data = data;
    if (s.id !== "custom") { s.scores = scoreCustom(s.type, c, w, t, g); s.scored = true; }
    return data;
  })().catch((e) => { s._p = null; throw e; });
  return s._p;
}

/* Known impact structures (name, lat, lon, rim radius km). A steep slope alone never makes a place an impact crater. */
const IMPACTS = Object.freeze([["Barringer", 35.03, -111.02, 1], ["Haughton", 75.38, -89.68, 12], ["Chicxulub", 21.4, -89.5, 90], ["Vredefort", -27.0, 27.5, 90], ["Sudbury", 46.6, -81.2, 30], ["Ries", 48.88, 10.57, 12], ["Manicouagan", 51.4, -68.7, 36], ["Gosses Bluff", -23.82, 132.3, 11], ["Wolfe Creek", -19.17, 127.79, 0.5], ["Lonar", 19.98, 76.51, 1], ["Pingualuit", 61.28, -73.68, 2], ["Bosumtwi", 6.5, -1.41, 5], ["Roter Kamm", -27.77, 16.3, 2], ["Aorounga", 19.1, 19.25, 6], ["Tenoumer", 22.92, -10.4, 1], ["Popigai", 71.65, 111.18, 50], ["Mistastin", 55.9, -63.3, 14], ["Henbury", -24.57, 133.15, 0.5]]);
const gc = (a, b, c, d, R) => { const r = Math.PI / 180, x = Math.sin(((c - a) * r) / 2) ** 2 + Math.cos(a * r) * Math.cos(c * r) * Math.sin(((d - b) * r) / 2) ** 2; return 2 * R * Math.asin(Math.min(1, Math.sqrt(x))); };
const nearImpact = (s) => IMPACTS.some((i) => gc(s.lat, s.lon, i[1], i[2], 6371) <= Math.max(2, i[3] * 1.2));

/* Terrain class from measured climate, mapped bedrock and known structures (UNEP aridity index: precipitation / evaporative demand).
   Every branch needs evidence; with none, the answer is GENERAL_LAND rather than a guessed basaltic or cratered label. */
function classify(site, c, t, g) {
  const polar = Number.isFinite(c.warm) ? c.warm < 10 : (Math.abs(site.lat) > 66 || c.temp < -5);
  if (polar) return "POLAR_ICE";
  if (nearImpact(site)) return "IMPACT_CRATER";
  const k = (g && g.counts) || {}, tot = Object.values(k).reduce((x, y) => x + y, 0) || 1, sh = (id) => (k[id] || 0) / tot;
  if (sh("evaporite") >= 0.3 || (c.ai < 0.5 && t.elev <= 0 && sh("sediment") + sh("mudstone") >= 0.3)) return "EVAPORITE_SULFATE";
  if (c.ai < 0.5) return "HYPERARID_DESERT"; /* UNEP: below 0.5 is dryland (hyper-arid, arid or semi-arid) */
  if (sh("basalt") + sh("ultramafic") >= 0.35) return t.slope > 10 ? "VOLCANIC_LAVA_TUBE" : "BASALTIC_PLAIN";
  return "GENERAL_LAND";
}

function cosine(a, b) {
  let d = 0, x = 0, y = 0;
  for (let i = 0; i < a.length; i++) { d += a[i] * b[i]; x += a[i] * a[i]; y += b[i] * b[i]; }
  return x && y ? d / Math.sqrt(x * y) : 0;
}

function scoreParts(type, c, w, t, k, g) {
  const T = typeOf(type), P = PLANETS[k], ref = pickReference(k, { temp: c.temp, press: w.press, slope: t.slope, type, vec: (g && g.vec) || T.minerals });
  const arid = 1 - clamp(c.ai / 0.5, 0, 1);
  const temp = 1 - clamp(Math.abs(c.temp - ref.tempC) / 100, 0, 1);
  const press = 1 - clamp(w.press / 1013, 0, 1);
  const slope = 1 - clamp(Math.abs(t.slope - ref.slope) / 25, 0, 1);
  const mineral = cosine((g && g.vec) || T.minerals, P.minerals);
  const prior = T.base[k];
  const live = 0.30 * arid + 0.15 * temp + 0.15 * press + 0.15 * slope + 0.25 * mineral;
  /* wet environments are poor analogs for dry worlds, so aridity also gates the whole score */
  const gate = 0.35 + 0.65 * arid;
  /* The hand-typed terrain prior only fills in when measurements are missing; fully measured sites are scored on data alone. */
  const measured = Boolean(c.live && w.live && (t.live || t.partial) && g);
  const raw = measured ? 100 * live : 40 * prior + 60 * live;
  return { arid, temp, press, slope, mineral, prior, live, gate, measured, total: clamp(Math.round(raw * gate), 10, 99) };
}

function scoreCustom(type, c, w, t, g) {
  return { MARS: scoreParts(type, c, w, t, "MARS", g).total, MOON: scoreParts(type, c, w, t, "MOON", g).total };
}

const siteHash = (s) => Math.abs(Math.round(s.lat * 1000) * 31 + Math.round(s.lon * 1000) * 17);
const BODY_RADIUS_KM = Object.freeze({ MARS: 3389.5, MOON: 1737.4 });

/* Physical facts about a reference feature, derived from its coordinates and elevation (simple models, two constants per world):
   Mars annual-mean temperature falls from ~215 K at the equator to ~150 K at the poles; the Moon follows radiative equilibrium (~220 K at the
   equator, falling with cos(lat)^0.25); Mars pressure follows an exponential atmosphere (6.1 hPa at the datum, 11.1 km scale height); the Moon has none. */
function featureFacts(mode, r) {
  const rad = (clamp(Math.abs(r.lat), 0, 89.9) * Math.PI) / 180;
  const K = mode === "MARS" ? 215 - 65 * Math.pow(Math.sin(rad), 2) : Math.max(40, 220 * Math.pow(Math.cos(rad), 0.25));
  return { tempC: K - 273.15, press: mode === "MARS" ? 6.1 * Math.exp(-r.elev / 11100) : 0 };
}

/* Earth land annual-mean temperatures span roughly -40..35 C, so every Earth site is warmer than every Moon or Mars feature and absolute
   temperatures cannot tell candidates apart (they all picked the same equatorial feature). Temperature is therefore compared by position
   inside each world's own range. */
const EARTH_TEMP_RANGE = Object.freeze([-40, 35]);
const tempRangeCache = {};
function featureTempRange(mode) {
  if (!tempRangeCache[mode]) { const t = REFERENCE_SITES[mode].map((r) => featureFacts(mode, r).tempC); tempRangeCache[mode] = [Math.min(...t), Math.max(...t)]; }
  return tempRangeCache[mode];
}

/* facts = { temp: annual mean deg C, press: surface hPa, slope: degrees, type: terrain class, vec: mineral profile } at the Earth site */
function rankReferences(mode, facts) {
  const W = mode === "MARS" ? { type: 0.25, min: 0.10, slope: 0.25, temp: 0.20, press: 0.20 } : { type: 0.30, min: 0.15, slope: 0.30, temp: 0.25, press: 0 };
  const [e0, e1] = EARTH_TEMP_RANGE, [m0, m1] = featureTempRange(mode);
  const tE = clamp((facts.temp - e0) / (e1 - e0), 0, 1);
  return REFERENCE_SITES[mode].map((r) => {
    const ff = featureFacts(mode, r);
    const tM = m1 > m0 ? (ff.tempC - m0) / (m1 - m0) : 0.5;
    const tS = 1 - Math.abs(tE - tM);
    const pS = W.press ? 1 - clamp(Math.abs(Math.log(Math.max(facts.press, 0.1)) - Math.log(Math.max(ff.press, 0.1))) / 8, 0, 1) : 0;
    const sS = 1 - clamp(Math.abs(facts.slope - r.slope) / 25, 0, 1);
    const yS = !facts.type ? 0.5 : r.types[0] === facts.type ? 1 : r.types.includes(facts.type) ? 0.6 : 0;
    const mS = facts.vec ? cosine(facts.vec, refVec(mode, r)) : 0.5;
    const sim = W.type * yS + W.min * mS + W.slope * sS + W.temp * tS + W.press * pS;
    return { ...r, ...ff, sim: Math.round(100 * sim) };
  }).sort((a, b) => b.sim - a.sim);
}
const pickReference = (mode, facts) => rankReferences(mode, facts)[0];

/* Ranked reference features for an analyzed Earth site, and plain-language labels for how far to trust them. */
function rankFor(s, mode) {
  const d = s.data, T = TYPES[s.type];
  const facts = d
    ? { temp: d.c.temp, press: d.w.press, slope: d.t.slope, type: s.type, vec: (d.g && d.g.vec) || (T ? T.minerals : null) }
    : { temp: DEFAULT_CLIMATE.temp, press: DEFAULT_CLIMATE.press, slope: Number.isFinite(s.slope) ? s.slope : 5, type: s.type, vec: T ? T.minerals : null };
  return rankReferences(mode, facts);
}
/* Feature fit only ranks the closest known feature. It counts as a strong match only when the site is also a good analog overall (score). */
const confidence = (sim, score = 100) => (sim >= 80 && score >= 55 ? { id: "strong", label: "Strong match" } : sim >= 65 && score >= 35 ? { id: "moderate", label: "Moderate match" } : { id: "weak", label: "Weak match" });
const verdict = (score) => (score >= 75 ? { id: "strong", label: "Strong analog" } : score >= 55 ? { id: "good", label: "Good analog" } : score >= 35 ? { id: "moderate", label: "Moderate analog" } : { id: "poor", label: "Poor analog" });

/* NASA Trek global mosaics (equirectangular tiles, no key). Zoom z has 2^(z+1) x 2^z tiles of 256 px, row counted from the top.
   Each layer lists fallbacks in order; a tile is probed before use so a wrong URL can never show a broken or unrelated picture. */
const TREK = "https://trek.nasa.gov/tiles";
const PLANET_TILES = Object.freeze({
  MARS: [
    { label: "Viking color mosaic", base: `${TREK}/Mars/EQ/Mars_Viking_MDIM21_ClrMosaic_global_232m/1.0.0/default/default028mm`, zooms: [6, 5, 4] },
    { label: "MOLA color-shaded relief", base: `${TREK}/Mars/EQ/Mars_MGS_MOLA_ClrShade_merge_global_463m/1.0.0/default/default028mm`, zooms: [5, 4, 3] }
  ],
  MOON: [
    { label: "LRO WAC mosaic", base: `${TREK}/Moon/EQ/LRO_WAC_Mosaic_Global_303ppd_v02/1.0.0/default/default028mm`, zooms: [6, 5, 4] },
    { label: "LOLA color-shaded relief", base: `${TREK}/Moon/EQ/LRO_LOLA_ClrShade_Global_128ppd_v04/1.0.0/default/default028mm`, zooms: [5, 4, 3] }
  ]
});

/* Flat (equirectangular) maps stretch east-west by 1/cos(latitude). The window is widened by that factor and squeezed back, so the
   shown area is a true 4:3 patch of ground. Above 75 degrees the stretch is too large to undo (see getPlanetTiles). */
function tileView(base, z, lat, lon, mode) {
  const n = Math.pow(2, z), W = 256 * 2 * n, H = 256 * n, la = clamp(lat, -89.9, 89.9);
  const c = Math.max(0.2, Math.cos((la * Math.PI) / 180));
  const px = ((lon + 180) / 360) * W, py = ((90 - la) / 180) * H;
  const halfW = 128 / c;
  const cFirst = Math.floor((px - halfW) / 256), cLast = Math.floor((px + halfW) / 256);
  const rFirst = Math.floor((py - 96) / 256), rLast = Math.floor((py + 96) / 256), tiles = [];
  for (let row = rFirst; row <= rLast; row++) for (let colRaw = cFirst; colRaw <= cLast; colRaw++) {
    if (row < 0 || row >= n) continue;
    const col = ((colRaw % (2 * n)) + 2 * n) % (2 * n);
    tiles.push({
      url: `${base}/${z}/${row}/${col}.jpg`,
      left: ((colRaw * 256 - (px - halfW)) / (2 * halfW)) * 100,
      top: ((row * 256 - (py - 96)) / 192) * 100,
      width: c * 100,
      center: colRaw === Math.floor(px / 256) && row === Math.floor(py / 256)
    });
  }
  return { tiles, widthKm: Math.max(1, Math.round((256 * 2 * Math.PI * BODY_RADIUS_KM[mode]) / W)) };
}

function probeTile(url, ms = 6000) {
  const attempt = (cors) => new Promise((resolve) => {
    const im = new Image();
    if (cors) im.crossOrigin = "anonymous";
    const timer = setTimeout(() => { im.onload = im.onerror = null; resolve("timeout"); }, ms);
    im.onload = () => {
      clearTimeout(timer);
      if (im.naturalWidth <= 8) return resolve("error");
      if (!cors) return resolve("ok");
      try { /* a nearly black tile means the mosaic has no data there: treat it as missing, never show it */
        const cv = document.createElement("canvas"); cv.width = cv.height = 24;
        const cx = cv.getContext("2d"); cx.drawImage(im, 0, 0, 24, 24);
        const d = cx.getImageData(0, 0, 24, 24).data; let sum = 0;
        for (let i = 0; i < d.length; i += 4) sum += 0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2];
        resolve(sum / (d.length / 4) < 10 ? "dark" : "ok");
      } catch (e) { resolve("ok"); }
    };
    im.onerror = () => { clearTimeout(timer); resolve("error"); };
    im.src = url;
  });
  return attempt(true).then((r) => (r === "error" ? attempt(false) : r));
}

/* The Mars/Moon mosaics are flat (equirectangular) maps: east-west distances are stretched by 1/cos(latitude), which becomes huge near the poles.
   Above 75 degrees the picture is therefore rebuilt: for every pixel of a true-shape view (azimuthal equidistant, centered on the target, north up)
   the matching spot in the flat mosaic is looked up. Only the few tiles that view needs are downloaded. */
function loadTileData(url, ms = 12000) {
  return new Promise((res) => {
    const im = new Image(); im.crossOrigin = "anonymous"; const t = setTimeout(() => res(null), ms);
    im.onload = () => { clearTimeout(t); try { const cv = document.createElement("canvas"); cv.width = cv.height = 256; const cx = cv.getContext("2d"); cx.drawImage(im, 0, 0, 256, 256); res(cx.getImageData(0, 0, 256, 256).data); } catch (e) { res(null); } };
    im.onerror = () => { clearTimeout(t); res(null); };
    im.src = url;
  });
}
async function getPolarView(mode, ref) {
  const R = BODY_RADIUS_KM[mode], D = Math.PI / 180, OW = 512, OH = 384, la0 = clamp(ref.lat, -90, 90) * D;
  for (const layer of PLANET_TILES[mode]) {
    for (const base of [layer.base, layer.base.replace("/1.0.0/default/", "/1.0.0//default/")]) {
      for (const z of layer.zooms) {
        const n = 2 ** z, W = 256 * 2 * n, H = 256 * n, kmPx = (2 * Math.PI * R) / W, hx = 128 * kmPx, hy = 96 * kmPx;
        const ll = (u, v) => {
          const dx = (u - 0.5) * 2 * hx, dy = (0.5 - v) * 2 * hy, d = Math.hypot(dx, dy);
          if (d < 1e-9) return [ref.lat, ref.lon];
          const c = d / R, sc = Math.sin(c), cc = Math.cos(c);
          const lat = Math.asin(clamp(cc * Math.sin(la0) + (dy * sc * Math.cos(la0)) / d, -1, 1));
          const lon = ref.lon * D + Math.atan2(dx * sc, d * Math.cos(la0) * cc - dy * Math.sin(la0) * sc);
          return [lat / D, lon / D];
        };
        const src = (lat, lon) => { const px = ((((lon + 180) % 360) + 360) % 360) / 360 * W, py = clamp((90 - lat) / 180 * H, 0, H - 0.001); return [px, py]; };
        const need = new Set();
        for (let j = 0; j <= 24; j++) for (let i = 0; i <= 32; i++) { const [px, py] = src(...ll(i / 32, j / 24)); need.add(`${Math.floor(py / 256)},${Math.floor(px / 256)}`); }
        if (need.size > 40) continue; /* too many tiles at this detail level: try a coarser one */
        const [cpx, cpy] = src(ref.lat, ref.lon), probe = await probeTile(`${base}/${z}/${Math.floor(cpy / 256)}/${Math.floor(cpx / 256)}.jpg`);
        if (probe === "timeout") break;
        if (probe !== "ok") continue;
        const keys = [...need], data = await Promise.all(keys.map((k) => { const [r, c] = k.split(",").map(Number); return loadTileData(`${base}/${z}/${r}/${c}.jpg`); }));
        const tiles = new Map(keys.map((k, i) => [k, data[i]]));
        const out = document.createElement("canvas"); out.width = OW; out.height = OH; const cx = out.getContext("2d"), od = cx.createImageData(OW, OH);
        let hit = 0;
        for (let y = 0; y < OH; y++) for (let x = 0; x < OW; x++) {
          const [px, py] = src(...ll((x + 0.5) / OW, (y + 0.5) / OH)), r = Math.floor(py / 256), c = Math.floor(px / 256), t = tiles.get(`${r},${c}`), o = (y * OW + x) * 4;
          if (!t) { od.data[o + 3] = 255; continue; }
          const i = ((Math.floor(py) - r * 256) * 256 + (Math.floor(px) - c * 256)) * 4;
          od.data[o] = t[i]; od.data[o + 1] = t[i + 1]; od.data[o + 2] = t[i + 2]; od.data[o + 3] = 255; hit++;
        }
        if (hit < OW * OH * 0.6) continue;
        cx.putImageData(od, 0, 0);
        return { ref, layer, z, base, tiles: [{ url: out.toDataURL("image/jpeg", 0.9), left: 0, top: 0, width: 100, center: true }], widthKm: Math.max(1, Math.round(256 * kmPx)), reprojected: true };
      }
    }
  }
  return null;
}

async function getPlanetTiles(mode, ref) {
  if (Math.abs(ref.lat) > 75) { const pv = await getPolarView(mode, ref).catch((e) => { console.warn("Polar view failed:", e); return null; }); return pv || { polar: true, ref }; }
  for (const layer of PLANET_TILES[mode]) {
    for (const base of [layer.base, layer.base.replace("/1.0.0/default/", "/1.0.0//default/")]) {
      let stalled = false;
      for (const z of layer.zooms) {
        const view = tileView(base, z, ref.lat, ref.lon, mode);
        const result = await probeTile(view.tiles.find((x) => x.center).url);
        if (result === "ok") return { ref, layer, z, base, ...view };
        if (result === "timeout") { stalled = true; break; }
      }
      if (stalled) break;
    }
  }
  return null;
}

const simBadge = (ref, conf, score) => `<div class="simbadge ${conf.id}"><small>Most similar to</small><b>${esc(ref.name)}</b><span>Feature fit ${ref.sim}%</span><span>Site score ${score}% &middot; ${verdict(score).label}</span></div>`;
const renderTileView = (v, conf, score) => v.tiles.map((t) => `<img src="${esc(t.url)}" alt="" style="left:${t.left}%;top:${t.top}%;width:${t.width}%">`).join("") +
  `<span class="brackets"></span>${simBadge(v.ref, conf, score)}`;

/* Last resorts only: a real Curiosity photo (Mars) or a plain placeholder. Never a keyword-search image. */
async function getPlanetImage(mode, site) {
  const P = PLANETS[mode], h = siteHash(site);
  if (P.rover) {
    try {
      const sol = 100 + (h % 3000);
      const d = await request(`https://api.nasa.gov/mars-photos/api/v1/rovers/${P.rover}/photos?sol=${sol}&api_key=${NASA_API_KEY}`);
      const list = (d && d.photos) || [];
      if (!list.length) throw new Error("No rover photos for sol " + sol);
      const ph = list[h % list.length];
      return { src: ph.img_src.replace(/^http:/, "https:"), cap: `Curiosity rover, ${esc(ph.camera ? ph.camera.full_name : "camera")}, sol ${esc(ph.sol)}<br><small>Generic Mars surface photo, not matched to this site.</small>` };
    } catch (e) { console.warn("Rover API fallback:", e); }
  }
  return { src: placeholder(P.label + " surface", "map tiles unavailable", P.color), cap: "Placeholder: NASA map tiles unavailable" };
}

/* Web Mercator (what flat web maps use) cannot show the poles: it stops near 85 degrees and is badly stretched well before that.
   Above 80 degrees the satellite image is therefore requested in a polar stereographic projection (EPSG:3413 Arctic, 3031 Antarctic), centered on the site. */
function polarStereo(lat, lon, south) {
  const a = 6378137, e = Math.sqrt(0.00669437999014), D = Math.PI / 180, ts = (south ? 71 : 70) * D, lon0 = (south ? 0 : -45) * D, phi = Math.abs(lat) * D;
  const tf = (p) => Math.tan(Math.PI / 4 - p / 2) / Math.pow((1 - e * Math.sin(p)) / (1 + e * Math.sin(p)), e / 2);
  const mc = Math.cos(ts) / Math.sqrt(1 - e * e * Math.sin(ts) ** 2), rho = (a * mc * tf(phi)) / tf(ts), dl = lon * D - lon0;
  return [rho * Math.sin(dl), south ? rho * Math.cos(dl) : -rho * Math.cos(dl)];
}
function earthImageUrl(s) {
  if (Math.abs(s.lat) > 80) {
    const south = s.lat < 0, sr = south ? 3031 : 3413, [x, y] = polarStereo(clamp(s.lat, -90, 90), s.lon, south), hw = 6000, hh = 4500;
    return `https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/export?bbox=${x - hw},${y - hh},${x + hw},${y + hh}&bboxSR=${sr}&imageSR=${sr}&size=640,480&format=jpg&f=image`;
  }
  const lat = clamp(s.lat, -84, 84), dLon = 0.06, dLat = 0.045 * Math.cos((lat * Math.PI) / 180);
  const w = Math.max(-180, s.lon - dLon), e = Math.min(180, s.lon + dLon);
  return `https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/export?bbox=${w},${lat - dLat},${e},${lat + dLat}&bboxSR=4326&imageSR=3857&size=640,480&format=jpg&f=image`;
}

/* ============================ PLANET MAP OVERLAY ============================ */
function onPlanetKey(e) { if (e.key === "Escape") closePlanetMap(); }

function closePlanetMap(silent) {
  if (state.planetMap) { state.planetMap.remove(); state.planetMap = null; }
  const ov = $("planetOverlay");
  if (ov) ov.remove();
  document.removeEventListener("keydown", onPlanetKey);
  if (!silent) { const pv = $("planetView"); if (pv && !pv.hidden) pv.focus(); }
}

/* Picks a feature by name from the current site's ranking and refreshes the panel */
function pickRef(name) {
  const s = state.site;
  if (!s) return;
  const i = rankFor(s, state.mode).findIndex((r) => r.name === name);
  closePlanetMap(true);
  if (i >= 0) { state.refIdx = i; renderDetail(); }
}

function openPlanetMap() {
  const v = state.planetView, s = state.site;
  if (!v || !v.layer || !s || v.site !== s || v.mode !== state.mode) return;
  const P = PLANETS[v.mode];
  closePlanetMap(true);

  const ov = document.createElement("div");
  ov.id = "planetOverlay";
  ov.className = "planet-overlay";
  ov.setAttribute("role", "dialog");
  ov.setAttribute("aria-modal", "true");
  ov.setAttribute("aria-label", `${P.label} map`);
  ov.innerHTML = `
    <div class="po-bar glass">
      <button type="button" class="po-back" id="poBack">&larr; Back to Earth</button>
      <select id="poTex" class="tex-sel" aria-label="Imagery layer"></select>
      <div class="po-title"><b>${esc(P.label)} globe</b><span>${esc(v.ref.name)} &middot; ${v.ref.lat}&deg;, ${v.ref.lon}&deg;</span></div>
    </div>
    <div id="poMap" class="po-map"></div>
    <div class="po-foot glass">
      <span>Earth site: <b>${esc(s.name)}</b> &rarr; ${P.label} feature: <b>${esc(v.ref.name)}</b></span>
      <span>NASA Trek ${esc(v.layer.label)} &middot; Feature fit ${v.ref.sim}% &middot; Site score ${s.scores[v.mode]}% &middot; Drag to rotate, scroll to zoom</span>
    </div>`;
  document.body.appendChild(ov);

  const map = new GlobeMap("poMap", { atmo: false, bump: 3.5, labelAlt: 1.6 });
  const pts = [{ lat: v.ref.lat, lng: v.ref.lon, color: P.color, r: 0.8, alt: 0.03, label: esc(v.ref.name), name: v.ref.name, onClick: null }];
  rankFor(s, v.mode).forEach((r, i) => {
    if (r.name === v.ref.name) return;
    pts.push({ lat: r.lat, lng: r.lon, color: "#E6E9F5", r: 0.45, alt: 0.012, label: `${i + 1}. ${esc(r.name)} (${r.sim}%)`, name: r.name, onClick: () => pickRef(r.name) });
  });
  map.setPoints(pts); map.setLabels(pts); map.setRings([pts[0]]); map.view(v.ref.lat, v.ref.lon, 1.2, 0);
  const poTex = $("poTex");
  poTex.innerHTML = PLANET_TILES[v.mode].map((l, i) => `<option value="${i}" ${l === v.layer ? "selected" : ""}>${esc(l.label)}</option>`).join("");
  poTex.onchange = () => setPlanetTexture(map, v.mode, Number(poTex.value));
  setPlanetTexture(map, v.mode, PLANET_TILES[v.mode].indexOf(v.layer));
  state.planetMap = map;
  $("poBack").onclick = () => closePlanetMap();
  document.addEventListener("keydown", onPlanetKey);
  $("poBack").focus();
  setTimeout(() => map.invalidateSize(), 0);
}

/* ============================== RENDERING ============================== */
function renderList() {
  const sites = [...SITES, ...(state.custom ? [state.custom] : [])].sort((a, b) => b.scores[state.mode] - a.scores[state.mode]);
  $("siteList").innerHTML = sites.map((s) => `
    <li data-id="${esc(s.id)}" class="${state.site && state.site.id === s.id ? "sel" : ""}" tabindex="0" role="button">
      <div>${esc(s.name)}<small>${esc(s.country)}</small></div>
      <div class="bar"><i style="width:${s.scores[state.mode]}%"></i></div>
      <div class="pct" title="${s.scored === false ? "Terrain-class baseline, live scoring in progress" : "Computed from live data"}">${s.scores[state.mode]}%${s.scored === false ? "*" : ""}</div>
    </li>`).join("");
  $("siteList").querySelectorAll("li").forEach((li) => {
    const go = () => { const s = sites.find((x) => x.id === li.dataset.id); if (s) selectSite(s, true); };
    li.onclick = go;
    li.onkeydown = (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); go(); } };
  });
}

function syncEarthPoints() {
  if (!state.map) return;
  state.map.setPoints([...state.markers.values()]);
  state.map.setLabels([...state.markers.values()]);
  const sel = state.site && state.markers.get(state.site.id);
  state.map.setRings(sel ? [sel] : []);
}
function refreshMarkers() {
  state.markers.forEach((m, id) => {
    const s = id === "custom" ? state.custom : SITES.find((x) => x.id === id);
    if (!s) return;
    const sel = state.site && state.site.id === id;
    m.color = PLANETS[state.mode].color;
    m.r = (sel ? 1.5 : 0.8) + s.scores[state.mode] / 100;
    m.alt = sel ? 0.035 : 0.012;
    m.label = `${esc(s.name)}: ${s.scores[state.mode]}% ${PLANETS[state.mode].label}`;
  });
  syncEarthPoints();
}

function addMarker(s) {
  /* a point click selects the site; the globe-click handler (which creates a custom site) only fires for clicks on bare globe */
  state.markers.set(s.id, { lat: s.lat, lng: s.lon, color: PLANETS[state.mode].color, r: 0.5, alt: 0.012, label: esc(s.name), name: s.name, onClick: () => selectSite(s, false) });
  syncEarthPoints();
}

/* Terrain class row of the Earth vs planet table: the Earth site's class, the matched feature's primary class, and whether they agree. */
function terrainRow(earthType, refTypes) {
  const list = Array.isArray(refTypes) ? refTypes : [];
  const pk = list[0];
  const eLabel = earthType && TYPES[earthType] ? TYPES[earthType].label : "n/a";
  const pLabel = pk && TYPES[pk] ? TYPES[pk].label : "n/a";
  const verdict = !earthType || !pk ? "n/a" : earthType === pk ? "Same class" : list.includes(earthType) ? "Partial match" : "Different";
  return `<tr class="trow-class"><td>Terrain class</td><td>${esc(eLabel)}</td><td>${esc(pLabel)}</td><td class="d">${verdict}</td></tr>`;
}
function row(label, a, b, unit, d = 0) {
  const diff = Number.isFinite(a) && Number.isFinite(b) ? a - b : NaN;
  return `<tr><td>${label}</td><td>${fmt(a, d)}${unit}</td><td>${fmt(b, d)}${unit}</td><td class="d">${Number.isFinite(diff) ? (diff > 0 ? "+" : "") + fmt(diff, d) + unit : "n/a"}</td></tr>`;
}

function terrainBadge(t) {
  if (t.live) return ["on", "DEM measured"];
  if (t.partial) return ["on", "coarse DEM measured"];
  return ["off", "matrix reference"];
}

function renderDetail() {
  const s = state.site; if (!s || !s.data) return;
  const P = PLANETS[state.mode], T = typeOf(s.type), { w, c, t, g } = s.data, ranked = rankFor(s, state.mode), ref = ranked[state.refIdx] || ranked[0], sp = scoreParts(s.type, c, w, t, state.mode, g);
  const EM = (g && g.vec) || T.minerals;
  const score = s.scores[state.mode], other = state.mode === "MARS" ? "MOON" : "MARS";
  const blocked = Boolean(s.ocean && !s.bypass);
  const vd = verdict(score), conf = confidence(ref.sim, score);
  const C = 2 * Math.PI * 52;
  const tb = terrainBadge(t);
  const mins = MINERALS.map((m, i) => `
    <div class="mrow"><span>${m}</span>
      <div class="pair"><div class="bar earth"><i style="width:${EM[i]}%"></i></div><div class="bar"><i style="width:${P.minerals[i]}%"></i></div></div>
      <span>${EM[i]}% / ${P.minerals[i]}%</span></div>`).join("");
  const tag = T.label;
  $("detail").innerHTML = `
    <div class="hero">
      <div class="ring"><svg width="120" height="120" viewBox="0 0 120 120"><circle class="track" cx="60" cy="60" r="52"/><circle class="val" cx="60" cy="60" r="52" stroke-dasharray="${C}" stroke-dashoffset="${C}" id="ringVal"/></svg><b><div>${score}%<span>${P.label} match</span></div></b></div>
      <div><h3 id="siteName">${esc(s.name)}</h3>
        <span class="tag" id="siteCountry">${esc(s.country)}</span><span class="tag">${esc(tag)}</span><span class="tag verdict ${vd.id}">${vd.label}</span>
        ${blocked
          ? `<p class="warn-box">Invalid Target: water body detected. Open liquid water cannot serve as an analog for hyper-arid Martian or Lunar surfaces.${s.oceanWhy && s.oceanWhy.length ? `<br><small>Why: ${s.oceanWhy.map(esc).join("; ")}.</small>` : ""}</p><button id="showAnyway" class="show-anyway" type="button">Show anyways</button>`
          : `<p class="alt">${esc(PLANETS[other].label)} match: ${s.scores[other]}% &middot; ${s.lat.toFixed(2)}&deg;, ${s.lon.toFixed(2)}&deg;</p>`}</div>
    </div>
    ${s.ocean && s.bypass ? `<p class="warn-box" style="margin:0 0 12px">Water location shown by your choice. These percentages are computed from sea-level weather and sea-floor depth, so they show how this spot would score on the formula, not a real land analog. Expect low values: water means no dryness, and sea-level pressure is far from Mars.</p>` : ""}
    <div class="sub"><span>Current conditions at site</span><span class="live ${w.live ? "on" : "off"}">${w.live ? "live" : "estimated"}</span></div>
    <div class="wx"><div><b>${fmt(w.temp, 1)}&deg;C</b><span>Temperature</span></div><div><b>${fmt(w.hum)}%</b><span>Humidity</span></div><div><b>${fmt(w.press)} hPa</b><span>Surface pressure</span></div></div>
    <div class="sub"><span>Earth vs ${P.label}: ${esc(ref.name)}</span><span class="live ${tb[0]}">${tb[1]}</span></div>
    <table><tr><th></th><th>Earth site</th><th>${P.label}</th><th>Delta</th></tr>
      ${terrainRow(s.type, ref.types)}
      ${row("Elevation", t.elev, ref.elev, " m")}
      ${row("Mean slope", t.slope, ref.slope, "&deg;", 1)}
      ${row("Mean temp (annual)", c.temp, ref.tempC, "&deg;C", 1)}
      ${row("Surface pressure", w.press, ref.press, " hPa", 1)}
    </table>
    <div class="refs-wrap">
      <label class="ref-label" for="refSelect">All ${ranked.length} ${P.label} features, ranked by fit</label>
      <select id="refSelect" class="ref-select">${ranked.map((r, i) => `<option value="${i}" ${i === state.refIdx ? "selected" : ""}>${i + 1}. ${esc(r.name)} (${r.sim}%)</option>`).join("")}</select>
      <div class="refs"><span>Top picks</span>${ranked.slice(0, 3).map((r, i) => `<button type="button" class="chip ${i === state.refIdx ? "on" : ""}" data-i="${i}">${esc(r.name)} <i>${r.sim}%</i></button>`).join("")}</div>
    </div>
    ${conf.id === "weak" ? `<p class="warn-box" style="margin:0 0 12px">${score < 35 ? `This spot is a poor ${P.label} analog overall (${score}%). The feature above is only the closest of the known ${P.label} features; a high feature fit does not make the site itself a good analog.` : `No close ${P.label} analog exists for this spot. The nearest feature is shown for reference only, so read the comparison with caution.`}</p>` : ""}
    <p class="alt tight">Aridity index ${fmt(c.ai, 2)} (precipitation / evaporative demand; below 0.2 is arid), ${c.live ? "measured over " + c.year : "estimated from current humidity"}. Dryland means index below 0.5. Pressure is corrected from sea level to the site&rsquo;s elevation.</p>
    <div class="sub"><span>Why this score (${P.label})</span><span>weight</span></div>
    ${[["Dryness", sp.arid, "30%"], ["Temperature", sp.temp, "15%"], ["Surface pressure", sp.press, "15%"], ["Slope fit", sp.slope, "15%"], ["Mineral similarity", sp.mineral, "25%"]].map((r) => `<div class="mrow"><span>${r[0]}</span><div class="bar"><i style="width:${Math.round(r[1] * 100)}%"></i></div><span>${Math.round(r[1] * 100)}% &middot; ${r[2]}</span></div>`).join("")}
    <p class="alt" style="margin:4px 0 14px">${sp.measured
      ? `Score = weighted fit above (all inputs measured, no hand-typed prior) &times; dryness gate ${sp.gate.toFixed(2)} = <b>${sp.total}%</b>.`
      : `Some inputs are estimated, so the score blends a 40% terrain-class prior (${Math.round(sp.prior * 100)}%) with the 60% weighted fit, &times; dryness gate ${sp.gate.toFixed(2)} = <b>${sp.total}%</b>.`}</p>
    <div class="sub"><span>${g ? "Mineral profile estimated from mapped rock type (" + esc(g.labels.join(", ")) + ")" : "Mineral profile (typical for terrain type)"}</span><span>Earth / ${P.label}</span></div>${mins}
    ${provenance(s, conf)}
    <div class="sub" style="margin-top:14px"><span>Site vs target imagery</span></div>
    <div class="visual">
      <figure><img id="earthImg" alt="Satellite view of ${esc(s.name)}"><figcaption>Earth: Esri World Imagery, about ${Math.abs(s.lat) > 80 ? 12 : Math.round(0.12 * 111.32 * Math.cos((clamp(s.lat, -84, 84) * Math.PI) / 180))} km across${Math.abs(s.lat) > 80 ? " (polar projection, grid north up)" : ""}</figcaption></figure>
      <figure><div class="skeleton" id="planetSkel"></div><div id="planetView" class="tileview" hidden></div><img id="planetImg" alt="${P.label} surface imagery" hidden><figcaption id="planetCap">Loading ${P.label} imagery...</figcaption></figure>
    </div>
    ${usesHTML(s, state.mode, score, { types: ref.types, vec: refVec(state.mode, ref), tempC: ref.tempC, slope: ref.slope, name: ref.name })}`;
  requestAnimationFrame(() => { const r = $("ringVal"); if (r) r.style.strokeDashoffset = C * (1 - score / 100); });
  $("detail").querySelectorAll(".chip").forEach((b) => { b.onclick = () => { state.refIdx = Number(b.dataset.i); renderDetail(); }; });
  const refSelect = $("refSelect");
  if (refSelect) refSelect.onchange = () => { state.refIdx = Number(refSelect.value); renderDetail(); };
  if (blocked) {
    Array.from($("detail").children).forEach((el) => { if (!el.classList.contains("hero")) el.remove(); });
    const btn = $("showAnyway");
    if (btn) btn.onclick = () => {
      s.bypass = true;
      s.scores = s.rawScores;
      $("hudText").textContent = `${s.name}: ${s.scores[state.mode]}% ${PLANETS[state.mode].label} analog (water restriction bypassed)`;
      refreshMarkers(); renderList(); renderDetail();
    };
    return;
  }
  loadImages(s);
}

async function loadImages(s) {
  const tok = ++state.token, mode = state.mode, P = PLANETS[mode];
  state.planetView = null;
  const eImg = $("earthImg");
  if (eImg) {
    eImg.src = earthTerrainArt(s.name);
    const probe = new Image();
    probe.onload = () => {
      if (tok !== state.token) return;
      if (probe.naturalWidth > 32 && probe.naturalHeight > 32) eImg.src = probe.src;
    };
    probe.onerror = () => { if (tok === state.token) notify("Satellite imagery did not respond. Showing a terrain illustration instead."); };
    probe.src = earthImageUrl(s);
  }
  let view = null;
  try { const ranked = rankFor(s, mode); view = await getPlanetTiles(mode, ranked[state.refIdx] || ranked[0]); } catch (e) { console.warn("Planet tiles failed:", e); }
  if (tok !== state.token) return;
  const pv = $("planetView");
  if (view && view.polar && pv) {
    pv.innerHTML = `<div class="polarnote"><b>Polar region</b><span>${fmt(Math.abs(view.ref.lat), 1)}&deg;${view.ref.lat < 0 ? "S" : "N"}: flat map mosaics cannot show this</span></div>${simBadge(view.ref, confidence(view.ref.sim, s.scores[mode]), s.scores[mode])}`;
    pv.hidden = false;
    const sk1 = $("planetSkel"); if (sk1) sk1.remove();
    $("planetCap").innerHTML = `${esc(P.label)}: <b>${esc(view.ref.name)}</b> (${view.ref.lat}&deg;, ${view.ref.lon}&deg;) sits in the polar zone, where flat NASA map mosaics are stretched beyond use. No image is shown rather than a misleading one; pick another close place above to see imagery.<br><small>Raw numbers: temperature ${fmt(s.data.c.temp, 1)}&deg;C vs ${fmt(view.ref.tempC, 0)}&deg;C, slope ${fmt(s.data.t.slope, 1)}&deg; vs ${fmt(view.ref.slope, 0)}&deg;. Feature fit ${view.ref.sim}%.</small>`;
    return;
  }
  if (view && pv) {
    pv.innerHTML = renderTileView(view, confidence(view.ref.sim, s.scores[mode]), s.scores[mode]); pv.hidden = false;
    state.planetView = { ...view, mode, site: s };
    pv.classList.add("zoomable");
    pv.tabIndex = 0;
    pv.setAttribute("role", "button");
    pv.title = `Click to open the full ${P.label} map`;
    pv.setAttribute("aria-label", `Open interactive ${P.label} map at ${view.ref.name}`);
    pv.onclick = openPlanetMap;
    pv.onkeydown = (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); openPlanetMap(); } };
    const sk0 = $("planetSkel"); if (sk0) sk0.remove();
    $("planetCap").innerHTML = `${esc(P.label)}: NASA ${esc(view.layer.label)} centered on <b>${esc(view.ref.name)}</b> (${view.ref.lat}&deg;, ${view.ref.lon}&deg;), about ${view.widthKm} km across${view.reprojected ? " (re-projected so the pole is not stretched)" : ""}. Click the image to open the full map.<br><small>Chosen by matching terrain class, minerals, slope and temperature, not appearance. Raw numbers: temperature ${fmt(s.data.c.temp, 1)}&deg;C vs ${fmt(view.ref.tempC, 0)}&deg;C${mode === "MARS" ? `, pressure ${fmt(s.data.w.press)} vs ${fmt(view.ref.press, 1)} hPa` : ""}, slope ${fmt(s.data.t.slope, 1)}&deg; vs ${fmt(view.ref.slope, 0)}&deg;. Feature fit ${view.ref.sim}% only ranks this against other known features; the site score decides how good an analog the spot is. Real surface at that feature, not at this Earth spot.</small>`;
    return;
  }
  notify(`NASA ${P.label} map tiles could not be loaded. Showing a fallback image instead.`);
  let img;
  try { img = await getPlanetImage(mode, s); }
  catch (e) { img = { src: placeholder(P.label + " target", "imagery offline", P.color), cap: "Placeholder" }; }
  if (tok !== state.token) return;
  const pi = $("planetImg"), sk = $("planetSkel");
  if (!pi) return;
  pi.onerror = () => { pi.onerror = null; pi.src = placeholder(P.label + " target", "image failed to load", P.color); };
  pi.onload = () => { pi.hidden = false; if (sk) sk.remove(); };
  pi.src = img.src;
  $("planetCap").innerHTML = img.cap;
}

async function selectSite(s, pan) {
  state.site = s;
  state.refIdx = 0;
  if (pan && state.map) state.map.flyTo([s.lat, s.lon], 6, { duration: 1.2 });
  $("hudText").textContent = `Analyzing ${s.name}...`;
  $("detail").innerHTML = '<div class="skeleton"></div>';
  refreshMarkers(); renderList();
  try {
    const data = await analyze(s, false);
    if (state.site !== s) return;
    if (s.id === "custom") {
      s.type = classify(s, data.c, data.t, data.g);
      s.rawScores = scoreCustom(s.type, data.c, data.w, data.t, data.g);
      /* Water check: see detectWater(). Several independent signals must agree and none may show land. */
      const wt = detectWater(data);
      s.ocean = wt.ocean; s.oceanWhy = wt.why; s.unverified = wt.unverified;
      s.bypass = false;
      s.scored = true;
      s.scores = s.ocean ? { MARS: 0, MOON: 0 } : s.rawScores;
      s.name = `New site (${s.lat.toFixed(2)}, ${s.lon.toFixed(2)})`;
      s.country = "User-selected";
    }
    const blocked = Boolean(s.ocean && !s.bypass);
    $("hudText").textContent = blocked ? `${s.name}: water, not a valid analog target` : `${s.name}: ${s.scores[state.mode]}% ${PLANETS[state.mode].label} analog`;
    refreshMarkers(); renderList(); renderDetail();
    if (s.id === "custom" && !s.ocean) {
      const snapshot = s;
      geocode(s).then((gc) => {
        if (!gc || state.custom !== snapshot) return;
        if (gc.place) snapshot.name = `${gc.place} (${snapshot.lat.toFixed(2)}, ${snapshot.lon.toFixed(2)})`;
        if (gc.country) snapshot.country = gc.country;
        if (state.site === snapshot) {
          const n = $("siteName"), cn = $("siteCountry");
          if (n) n.textContent = snapshot.name;
          if (cn) cn.textContent = snapshot.country;
          $("hudText").textContent = `${snapshot.name}: ${snapshot.scores[state.mode]}% ${PLANETS[state.mode].label} analog`;
        }
        refreshMarkers(); renderList();
      });
    }
  } catch (e) {
    console.error("selectSite failed", e);
    notify("Could not analyze this site. Try another location.", "err");
    $("detail").innerHTML = "";
  }
}

/* Re-score the reference sites from live data. Runs only when the person presses "Refresh live data" (never at startup), one site at a time
   with a short pause, so a demo with several viewers does not trip API rate limits. */
let warming = false;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
function setLiveMsg(t) { const el = $("liveMsg"); if (el) el.textContent = t; }
async function warmUp(force) {
  if (warming) return;
  warming = true;
  const btn = $("refreshLive"); if (btn) btn.disabled = true;
  try {
    let i = 0;
    for (const site of SITES) {
      i++; setLiveMsg(`Refreshing live data ${i}/${SITES.length}...`);
      try { await analyze(site, true, force); } catch (e) { console.warn("Refresh failed for", site.id, e); }
      refreshMarkers(); renderList();
      if (state.site === site && site.data) renderDetail();
      await sleep(400);
    }
    const full = SITES.filter((x) => x.data && !x.data.snapshot && scoreParts(x.type, x.data.c, x.data.w, x.data.t, "MARS", x.data.g).measured).length;
    setLiveMsg(`Live refresh done: ${full} of ${SITES.length} sites fully measured.`);
    notify(full === SITES.length ? "All reference sites were re-scored from live climate, terrain, pressure and geology data. Use Save snapshot to bundle them." : `${full} of ${SITES.length} reference sites were scored fully from live data; the rest used estimates for missing inputs.`, full === SITES.length ? "ok" : "warn");
  } finally { warming = false; if (btn) btn.disabled = false; }
}
function saveSnapshot() {
  const sites = {}; let n = 0;
  SITES.forEach((x) => { if (x._raw) { sites[x.id] = x._raw; n++; } });
  if (!n) { notify("Nothing to save yet. Press Refresh live data first (needs internet), then save."); return; }
  const blob = new Blob([JSON.stringify({ generated: new Date().toISOString(), sites })], { type: "application/json" });
  const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = "sites_baseline.json";
  document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  notify(`Saved ${n} site${n === 1 ? "" : "s"}. Put sites_baseline.json next to index.html to load them with zero API calls.`, "ok");
}

function syncUI() {
  const v = state.view, m = state.mode;
  document.body.className = "mode-" + m.toLowerCase() + " view-" + v.toLowerCase();
  [["btnEarth", v === "EARTH"], ["btnMars", v === "MARS"], ["btnMoon", v === "MOON"]].forEach(([id, on]) => { $(id).classList.toggle("active", on); $(id).setAttribute("aria-selected", String(on)); });
  $("cmpMars").classList.toggle("on", m === "MARS"); $("cmpMoon").classList.toggle("on", m === "MOON");
  $("modeName").textContent = PLANETS[m].label;
}

/* Earth view: which world the Earth sites are compared with */
function setTarget(m) {
  if (!PLANETS[m]) { notify("Unknown planetary mode, keeping the current one."); return; }
  state.mode = m; state.refIdx = 0; syncUI(); refreshMarkers(); renderList(); renderDetail();
  const s = state.site; if (s && s.data && !(s.ocean && !s.bypass)) $("hudText").textContent = `${s.name}: ${s.scores[m]}% ${PLANETS[m].label} analog`;
}

function setView(v) {
  state.view = v;
  const pl = v !== "EARTH";
  if (pl) state.mode = v;
  closePlanetMap(true);
  $("map").hidden = pl; $("pmap").hidden = !pl;
  ["earthCard", "detail"].forEach((id) => { $(id).hidden = pl; });
  $("planetCard").hidden = !pl;
  syncUI();
  if (pl) {
    initPlanetMap(); setPlanetLayers();
    if (state.pt && state.pt.p === v) { drawPlanetMarker(); renderPlanetPanel(); }
    else { state.pt = null; $("hudText").textContent = `${PLANETS[v].label} map: click any point to read its coordinates and find matching Earth sites.`; renderPlanetHint(); }
    setTimeout(() => state.pmap && state.pmap.invalidateSize(), 60);
  } else {
    if (state.map) setTimeout(() => state.map.invalidateSize(), 60);
    populateTexSel(); refreshMarkers(); renderList(); renderDetail();
    const s = state.site; if (s && s.data) $("hudText").textContent = `${s.name}: ${s.scores[state.mode]}% ${PLANETS[state.mode].label} analog`;
  }
}

/* ============================== HOME PAGE ============================== */
const HOME_QUOTES = Object.freeze([
  { text: "Earth is the cradle of humanity, but one cannot live in a cradle forever.", by: "Konstantin Tsiolkovsky" },
  { text: "We choose to go to the Moon in this decade and do the other things, not because they are easy, but because they are hard.", by: "John F. Kennedy" },
  { text: "That's one small step for man, one giant leap for mankind.", by: "Neil Armstrong" },
  { text: "The cosmos is within us. We are made of star-stuff.", by: "Carl Sagan" },
  { text: "Imagination will often carry us to worlds that never were. But without it we go nowhere.", by: "Carl Sagan" },
  { text: "Extraordinary claims require extraordinary evidence.", by: "Carl Sagan" },
  { text: "The only way of discovering the limits of the possible is to venture a little way past them into the impossible.", by: "Arthur C. Clarke" },
  { text: "The first principle is that you must not fool yourself, and you are the easiest person to fool.", by: "Richard Feynman" },
  { text: "It has often proved true that the dream of yesterday is the hope of today and the reality of tomorrow.", by: "Robert Goddard" },
  { text: "Magnificent desolation.", by: "Buzz Aldrin, on the Moon" },
  { text: "Every analog site is a rehearsal for a place no human has stood yet.", by: "Cyber Mindset" },
  { text: "Measure first. Conclude second.", by: "Cyber Mindset" }
]);
const QUOTE_MS = 5000;   /* a new quote every 5 seconds */
function initHome() {
  try {
    const refs = Object.values(REFERENCE_SITES).reduce((n, list) => n + list.length, 0);
    if ($("statSites")) $("statSites").textContent = SITES.length;
    if ($("statRefs")) $("statRefs").textContent = refs;
    const box = document.querySelector(".quote-box");
    if (!box) return;
    let i = 0;
    const show = () => { $("quoteText").textContent = HOME_QUOTES[i].text; $("quoteBy").textContent = HOME_QUOTES[i].by; };
    show();
    setInterval(() => {
      box.classList.add("fade");
      setTimeout(() => { i = (i + 1) % HOME_QUOTES.length; show(); box.classList.remove("fade"); }, 500);
    }, QUOTE_MS);
  } catch (e) { console.warn("Home page init failed:", e); }
}

/* ============== SPINNING EARTH (left) AND MOON (right) BEHIND THE HOME HERO (decorative) ==============
   Two real textured 3D globes that turn west to east. Each canvas is larger than its globe so the atmosphere glow is never sliced off.
   They are switched off while the dashboard is open, scrolled out of view or the tab is hidden. The Moon uses the dashboard's NASA Trek imagery. */
const heroGlobes = [];
const heroHome = { on: true };
function heroSync(h) {
  if (!h.g || h.still) return;
  const run = h.inView && heroHome.on && !document.hidden;
  if (run && !h.raf) { h.last = 0; try { h.g.resumeAnimation(); } catch (e) { /* ignore */ } h.raf = requestAnimationFrame(h.tick); }
  else if (!run && h.raf) { cancelAnimationFrame(h.raf); h.raf = 0; try { h.g.pauseAnimation(); } catch (e) { /* ignore */ } }
}
function heroSetHome(on) { heroHome.on = on; heroGlobes.forEach(heroSync); }

function makeHeroGlobe(id, o) {
  const el = $(id);
  if (!el) return null;
  if (typeof Globe === "undefined") { el.classList.add("fallback"); return null; }
  try {
    const g = Globe({ rendererConfig: { antialias: true, alpha: true } })(el)
      .backgroundColor("rgba(0,0,0,0)")
      .showAtmosphere(true).atmosphereColor(o.atmo).atmosphereAltitude(o.atmoAlt);
    if (o.img) g.globeImageUrl(o.img);
    if (o.bump) g.bumpImageUrl(o.bump);
    if (typeof g.enablePointerInteraction === "function") g.enablePointerInteraction(false);
    const h = { el, g, raf: 0, last: 0, lng: o.lng, lat: o.lat, alt: o.alt, speed: o.speed, inView: true,
      still: !!(window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches) };
    h.tick = (t) => {
      const dt = h.last ? Math.min((t - h.last) / 1000, 0.1) : 0;
      h.last = t;
      h.lng -= dt * h.speed;                 /* west to east, like the real Earth */
      if (h.lng < -180) h.lng += 360;
      try { g.pointOfView({ lat: h.lat, lng: h.lng, altitude: h.alt }, 0); } catch (err) { /* ignore */ }
      h.raf = requestAnimationFrame(h.tick);
    };
    try {
      g.renderer().setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
      const c = g.controls(); c.enableZoom = false; c.enableRotate = false; c.enablePan = false; c.autoRotate = false;
      g.globeMaterial().bumpScale = o.bumpScale || 4;
    } catch (err) { /* ignore */ }
    const fit = () => { const w = el.clientWidth, hh = el.clientHeight; if (w > 0 && hh > 0) g.width(w).height(hh); };
    fit();
    if (typeof ResizeObserver !== "undefined") new ResizeObserver(fit).observe(el);
    g.pointOfView({ lat: h.lat, lng: h.lng, altitude: h.alt }, 0);
    if (o.autoShow) {
      const show = () => el.classList.add("ready");
      if (typeof g.onGlobeReady === "function") g.onGlobeReady(show);
      setTimeout(show, 3500);
    }
    if (typeof IntersectionObserver !== "undefined") {
      new IntersectionObserver((es) => { h.inView = es[0].isIntersecting; heroSync(h); }).observe(el);
    }
    heroGlobes.push(h);
    heroSync(h);
    return h;
  } catch (err) { console.warn("Hero globe failed:", err); el.classList.add("fallback"); return null; }
}
/* Moon surface: NASA LRO WAC mosaic (level 2 for a quick first look, level 3 for sharpness) plus LOLA relief as the bump map.
   Uses the same tile loader and cache as the dashboard; if NASA's tiles cannot be loaded, a plain CSS moon is shown instead. */
async function loadHeroMoon(h) {
  const el = h.el;
  const giveUp = setTimeout(() => { if (!el.classList.contains("ready")) el.classList.add("fallback"); }, 20000);
  try {
    const layer = PLANET_TILES.MOON[0], base = await resolveBase(layer);
    if (!base) throw new Error("Moon tiles unavailable");
    let shown = false;
    for (const z of [2, 3]) {
      const url = await buildPlanetTexture(base, z, "MOON" + layer.label);
      if (!url) { if (!shown) throw new Error("Moon texture blocked"); break; }
      h.g.globeImageUrl(url);
      if (!shown) { shown = true; el.classList.remove("fallback"); el.classList.add("ready"); }
    }
    try {
      const rl = PLANET_TILES.MOON[1], rb = await resolveBase(rl);
      const bu = rb ? await buildPlanetTexture(rb, 3, "MOON" + rl.label) : null;
      if (bu) { h.g.globeMaterial().bumpScale = 3.5; h.g.bumpImageUrl(bu); }
    } catch (err) { /* relief is optional */ }
  } catch (err) {
    console.warn("Hero Moon:", err);
    if (!el.classList.contains("ready")) el.classList.add("fallback");
  } finally { clearTimeout(giveUp); }
}
function initHeroGlobes() {
  /* altitude 2.1 leaves headroom in the canvas so the atmosphere glow is never sliced off at its edge */
  makeHeroGlobe("heroEarth", { img: EARTH_IMG + "earth-blue-marble.jpg", bump: EARTH_IMG + "earth-topology.png", bumpScale: 4,
    atmo: "#4cc9ff", atmoAlt: 0.22, lng: 78, lat: 16, alt: 2.1, speed: 6, autoShow: true });
  const moon = makeHeroGlobe("heroMoon", { atmo: "#b79cff", atmoAlt: 0.12, lng: 20, lat: 8, alt: 2.1, speed: 3.5, autoShow: false });
  if (moon) setTimeout(() => loadHeroMoon(moon), 900);   /* let the Earth and the page settle first */
}

/* ============== HOME PANELS: the top buttons open How it works / Features / Data / FAQ as pop-ups ============== */
let hpLast = null;
function openHomePanel(id, trigger) {
  const modal = $("hpModal"), pane = $("pane-" + id);
  if (!modal || !pane) return;
  modal.querySelectorAll(".hp-pane").forEach((p) => { p.hidden = p !== pane; });
  const sheet = modal.querySelector(".hp-sheet");
  sheet.setAttribute("aria-label", pane.dataset.title || "Details");
  sheet.scrollTop = 0;
  hpLast = trigger || null;
  modal.hidden = false;
  const x = modal.querySelector(".hp-x"); if (x) x.focus();
}
function closeHomePanel(restoreFocus = true) {
  const modal = $("hpModal");
  if (!modal || modal.hidden) return;
  modal.hidden = true;
  if (restoreFocus && hpLast && typeof hpLast.focus === "function") { try { hpLast.focus(); } catch (e) { /* ignore */ } }
  hpLast = null;
}
function initHomePanels() {
  document.querySelectorAll("[data-panel]").forEach((a) => a.addEventListener("click", (e) => { e.preventDefault(); openHomePanel(a.dataset.panel, a); }));
  const modal = $("hpModal");
  if (!modal) return;
  modal.addEventListener("click", (e) => { if (e.target.closest("[data-close]")) closeHomePanel(); });
  document.addEventListener("keydown", (e) => {
    if (modal.hidden) return;
    if (e.key === "Escape") { e.preventDefault(); closeHomePanel(); return; }
    if (e.key !== "Tab") return;                       /* keep Tab inside the open panel */
    const f = [...modal.querySelectorAll("button, a[href], summary")].filter((el) => el.getClientRects().length > 0);
    if (!f.length) return;
    const first = f[0], last = f[f.length - 1], cur = document.activeElement;
    if (e.shiftKey && (cur === first || !modal.contains(cur))) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && (cur === last || !modal.contains(cur))) { e.preventDefault(); first.focus(); }
  });
}

/* ================================ BOOT ================================ */
function init() {
  try {
    if (typeof Globe === "undefined") throw new Error("globe.gl failed to load");
    state.map = new GlobeMap("map", { labelAlt: 1.3 });
    state.map.setTexture(EARTH_TEX[EARTH_DEFAULT], EARTH_BUMP);
    state.map.setFootprints(IMPACTS);
    state.map.view(25, 10, 2.4, 0);
    populateTexSel();
    const tf = $("texFile"), ti = $("texInput");
    if (tf && ti) { tf.onclick = () => ti.click(); ti.onchange = () => { if (ti.files[0]) loadCustomMap(ti.files[0]); ti.value = ""; }; }
    probeLocalMaps().then(() => { /* use a map from the maps/ folder automatically if one exists */
      const li = localIndex("EARTH"); state.texPick = state.texPick || {};
      if (li >= 0 && state.map && !state.map.dead) { state.texPick.EARTH = li; applyTexEntry("EARTH", texEntries("EARTH")[li]); }
      populateTexSel();
    });
    SITES.forEach(addMarker);
    state.map.onClick((lat, lng) => {
      $("hudText").textContent = `Selected ${lat.toFixed(2)}, ${lng.toFixed(2)}. Analyzing...`;
      if (state.custom && state.markers.has("custom")) state.markers.delete("custom");
      state.custom = { id: "custom", name: "New site", country: "User-selected", lat: clamp(lat, -89.9, 89.9), lon: wrapLon(lng), type: null, scores: { MARS: 0, MOON: 0 } };
      addMarker(state.custom);
      selectSite(state.custom, false);
    });
  } catch (e) {
    console.error(e);
    notify("The 3D globe failed to load (check your internet connection). The telemetry panel still works from the site list.", "err");
  }
  $("btnEarth").onclick = () => setView("EARTH");
  $("btnMars").onclick = () => setView("MARS");
  $("btnMoon").onclick = () => setView("MOON");
  $("cmpMars").onclick = () => setTarget("MARS");
  $("cmpMoon").onclick = () => setTarget("MOON");
  initSearch();
  syncUI();
  $("modeName").textContent = PLANETS[state.mode].label;
  refreshMarkers(); renderList();
  const rl = $("refreshLive"), ss = $("saveSnap");
  if (rl) rl.onclick = () => warmUp(true);
  if (ss) ss.onclick = saveSnapshot;
  /* 0 API calls at startup: use the bundled snapshot if there is one, otherwise each site loads live only when it is opened */
  loadBaseline().then((n) => {
    if (n) {
      SITES.forEach((x) => { if (BASELINE.sites[x.id]) analyze(x, true).catch(() => {}); });   /* local only: raw data is already in hand */
      setLiveMsg(`Using saved snapshot of ${n} sites${BASELINE.at ? " (" + BASELINE.at.slice(0, 10) + ")" : ""}. No live calls until you open a new place.`);
      setTimeout(() => { refreshMarkers(); renderList(); }, 50);
    } else setLiveMsg("Scores marked * are baselines. Each site loads live data when you open it.");
    if (!state.site) selectSite(SITES[0], false);
  });
}
window.addEventListener("unhandledrejection", (e) => { console.error(e.reason); notify("A background task failed. The dashboard is still running."); e.preventDefault(); });

/* The dashboard (map, API calls, scoring) starts only after the home screen's "Start exploring" button is pressed. */
let started = false;
let homeHideT = 0;
function startApp() {
  const home = $("home");
  if (home) {
    home.classList.add("leaving");
    home.setAttribute("inert", "");                                   /* nothing inside the home screen can take a click or focus any more */
    clearTimeout(homeHideT); homeHideT = setTimeout(() => { home.hidden = true; }, 700);   /* after the fade, take it out of the page completely */
  }
  heroSetHome(false); closeHomePanel(false);
  if (started) return;
  started = true;
  init();
  setTimeout(() => { if (state.map) state.map.invalidateSize(); }, 700);
}
function showHome() {
  const home = $("home");
  if (home) { clearTimeout(homeHideT); home.hidden = false; home.removeAttribute("inert"); void home.offsetWidth; home.classList.remove("leaving"); home.scrollTop = 0; }
  heroSetHome(true);
}
document.addEventListener("DOMContentLoaded", () => {
  initHome();
  initHeroGlobes();
  initHomePanels();
  const b = $("startBtn");
  if (!b) { started = true; init(); return; }
  b.onclick = startApp;
  document.querySelectorAll(".js-start").forEach((el) => { el.onclick = startApp; });
  b.focus();
  const h = document.querySelector(".hud-home");
  if (h) h.onclick = (e) => { e.preventDefault(); showHome(); };
});

/* ===================== PLANET-TO-EARTH MATCHING (Mars and Moon modes) =====================
   There is no free per-point terrain or mineral API for Mars/Moon that works from a browser here, so a clicked point is described from:
   (1) the clicked coordinates (exact), (2) the nearest catalogued features and, on the Moon, the mapped mare regions (approximate),
   (3) simple physical models for temperature and pressure. Every value is labelled "estimated" and the panel shows how far the nearest
   catalogued feature is, so coverage and confidence are stated separately and never presented as validated accuracy. */
const LITH = Object.freeze({
  MARE: [48, 10, 12, 0, 0, 28, 2], HIGHL: [8, 5, 1, 0, 0, 84, 2], LPOLAR: [10, 5, 1, 0, 0, 78, 6], LFELSIC: [5, 1, 3, 0, 0, 88, 0], LSPA: [38, 10, 3, 0, 0, 48, 1],
  MBAS: [45, 10, 10, 3, 8, 22, 2], MSED: [30, 6, 14, 14, 22, 12, 2], MCARB: [25, 28, 6, 10, 22, 6, 3], MCLAY: [28, 6, 10, 8, 38, 8, 2], MSULF: [18, 3, 24, 34, 14, 5, 2], MICE: [10, 2, 4, 6, 4, 14, 60]
});
const REF_LITH = Object.freeze({ "Gale Crater": "MSED", "Jezero Crater": "MCARB", "Nili Fossae": "MCARB", "Holden Crater": "MCLAY", "Noachis Terra": "MCLAY", "Meridiani Planum": "MSULF", "Valles Marineris": "MSULF",
  "Vastitas Borealis": "MICE", "Planum Boreum": "MICE", "Planum Australe": "MICE", "Gruithuisen Domes": "LFELSIC", "Compton-Belkovich": "LFELSIC", "South Pole-Aitken Basin": "LSPA",
  "Shackleton Crater": "LPOLAR", "Cabeus Crater": "LPOLAR", "Faustini Crater": "LPOLAR", "Peary Crater": "LPOLAR", "Tycho Crater": "HIGHL", "Copernicus Crater": "HIGHL", "Orientale Basin": "HIGHL", "Descartes Highlands": "HIGHL" });
function refVec(p, r) {
  const k = REF_LITH[r.name];
  if (k) return LITH[k];
  if (p === "MARS") return LITH.MBAS;
  return r.types.includes("BASALTIC_PLAIN") || r.types.includes("VOLCANIC_LAVA_TUBE") ? LITH.MARE : LITH.HIGHL;
}
/* Approximate lunar mare regions (name, lat, lon, radius km) from published basin sizes; outside them a point is treated as highlands. */
const MARE = Object.freeze([["Imbrium", 32.8, -15.6, 560], ["Serenitatis", 28, 17.5, 350], ["Tranquillitatis", 8.5, 31.4, 420], ["Crisium", 17, 59.1, 270], ["Fecunditatis", -7.8, 51.3, 400], ["Nectaris", -15.2, 34.6, 170],
  ["Nubium", -21.3, -16.6, 350], ["Humorum", -24.4, -38.6, 200], ["Procellarum", 18.4, -57.4, 1000], ["Cognitum/Insularum", -8, -27, 350], ["Vaporum/Medii", 8, 2.5, 170], ["Smythii", 1.3, 87.5, 190], ["Marginis", 13.3, 86.1, 120], ["Moscoviense", 27.3, 147.9, 140], ["Ingenii", -33.7, 163.5, 150]]);

function planetProfile(p, lat, lon) {
  const R = BODY_RADIUS_KM[p], refs = REFERENCE_SITES[p].map((r) => ({ ...r, d: gc(lat, lon, r.lat, r.lon, R) })).sort((a, b) => a.d - b.d), n = refs[0], near = refs.slice(0, 3);
  let types, vec, region;
  if (p === "MOON") {
    const mare = MARE.find((m) => gc(lat, lon, m[1], m[2], R) <= m[3]);
    if (Math.abs(lat) > 80) { types = ["POLAR_ICE", "IMPACT_CRATER"]; vec = LITH.LPOLAR; region = "Polar region (ice possible only in permanently shadowed ground, not measured here)"; }
    else if (mare) { types = ["BASALTIC_PLAIN"]; vec = LITH.MARE; region = `Mare basalt (${mare[0]} region)`; }
    else { types = ["IMPACT_CRATER", "HYPERARID_DESERT"]; vec = LITH.HIGHL; region = "Cratered anorthositic highlands"; }
  } else if (Math.abs(lat) >= 75) { types = ["POLAR_ICE"]; vec = LITH.MICE; region = "Polar cap / ice-rich terrain"; }
  else { types = n.types; vec = refVec(p, n); region = `Terrain inferred from nearest catalogued feature: ${n.name}`; }
  const w = near.map((r) => 1 / (r.d + 100)), ws = w.reduce((a, b) => a + b, 0);
  const slope = near.reduce((a, r, i) => a + r.slope * w[i], 0) / ws, elev = near.reduce((a, r, i) => a + r.elev * w[i], 0) / ws;
  const ff = featureFacts(p, { lat, elev });
  const lim = p === "MOON" ? [300, 800] : [500, 1200];
  const cov = n.d <= lim[0] ? "Moderate" : n.d <= lim[1] ? "Low" : "Very low";
  return { types, vec, region, slope, elev, tempC: ff.tempC, press: ff.press, nearest: n, dist: n.d, cov };
}

function earthInputs(s) {
  const d = s.data, T = TYPES[s.type] || TYPES.GENERAL_LAND;
  if (!d) return { temp: T.climate.temp, press: T.climate.press, slope: Number.isFinite(s.slope) ? s.slope : 5, elev: s.elev, vec: T.minerals, ai: T.climate.hum / 100 * 0.65, cov: 0 };
  return { temp: d.c.temp, press: d.w.press, slope: d.t.slope, elev: d.t.elev, vec: (d.g && d.g.vec) || T.minerals, ai: d.c.ai, cov: [d.w.live, d.c.live, d.t.live || d.t.partial, Boolean(d.g)].filter(Boolean).length };
}

function earthMatch(s, p, P) {
  const e = earthInputs(s), [e0, e1] = EARTH_TEMP_RANGE, [m0, m1] = featureTempRange(p);
  const tE = clamp((e.temp - e0) / (e1 - e0), 0, 1), tM = m1 > m0 ? clamp((P.tempC - m0) / (m1 - m0), 0, 1) : 0.5;
  const part = {
    type: P.types[0] === s.type ? 1 : P.types.includes(s.type) ? 0.6 : 0,
    geo: cosine(e.vec, P.vec),
    slope: 1 - clamp(Math.abs(e.slope - P.slope) / 25, 0, 1),
    temp: 1 - Math.abs(tE - tM),
    press: p === "MARS" ? 1 - clamp(Math.abs(Math.log(Math.max(e.press, 0.1)) - Math.log(Math.max(P.press, 0.1))) / 8, 0, 1) : null
  };
  const W = p === "MARS" ? { type: 0.25, geo: 0.15, slope: 0.20, temp: 0.20, press: 0.20 } : { type: 0.30, geo: 0.20, slope: 0.25, temp: 0.25, press: 0 };
  const gate = 0.35 + 0.65 * (1 - clamp(e.ai / 0.5, 0, 1));
  const sum = W.type * part.type + W.geo * part.geo + W.slope * part.slope + W.temp * part.temp + (part.press === null ? 0 : W.press * part.press);
  return { s, e, part, gate, W, score: clamp(Math.round(100 * sum * gate), 1, 99) };
}

const earthCandidates = () => [...SITES, ...(state.custom && state.custom.data && state.custom.type && !state.custom.ocean ? [state.custom] : [])];
const rankEarth = (p, P) => earthCandidates().map((s) => earthMatch(s, p, P)).sort((a, b) => b.score - a.score);
const fmtLat = (v) => `${Math.abs(v).toFixed(3)}&deg;${v < 0 ? "S" : "N"}`, fmtLon = (v) => `${Math.abs(v).toFixed(3)}&deg;${v < 0 ? "W" : "E"}`;

function renderPlanetHint() {
  const P = PLANETS[state.mode];
  $("planetCard").innerHTML = `<h2>${P.label} mode</h2><p class="alt">Click any point on the ${P.label} map. You will get its latitude and longitude (east-positive), an estimated terrain profile, and the Earth sites that match it best, ranked.</p>
    <p class="lim">Mars and Moon values come from catalogued features and simple physical models, not per-point instrument data. Each value is labelled, and coverage and confidence are shown separately.</p>`;
}

async function pickPlanetPoint(lat, lon) {
  const p = state.mode, tok = ++state.ptTok;
  lat = clamp(lat, -90, 90); lon = wrapLon(lon);
  state.pt = { p, lat, lon, prof: planetProfile(p, lat, lon) };
  drawPlanetMarker();
  $("hudText").innerHTML = `${PLANETS[p].label} point: ${fmtLat(lat)}, ${fmtLon(lon)}. Ranking Earth sites...`;
  $("planetCard").innerHTML = `<h2>${PLANETS[p].label} point</h2><div class="coord">${fmtLat(lat)}, ${fmtLon(lon)}</div><div class="skeleton"></div>`;
  await Promise.allSettled(earthCandidates().map((s) => analyze(s, true)));
  if (tok !== state.ptTok || state.view !== p) return;
  renderPlanetPanel();
}

/* Why an Earth site matches (and where it does not), written from the same numbers that produce the score. */
function whyMatch(r, P, p) {
  const e = r.e, pp = r.part, L2 = PLANETS[p].label, eT = esc(typeOf(r.s.type).label), pT = esc(typeOf(P.types[0]).label), pros = [], cons = [];
  if (pp.type === 1) pros.push(`Same terrain class: ${eT} (${L2} point: ${pT}).`);
  else if (pp.type > 0) pros.push(`Related terrain class: ${eT} on Earth, ${pT} here.`);
  else cons.push(`Different terrain class: ${eT} on Earth, ${pT} here.`);
  if (pp.geo >= 0.8) pros.push(`Similar rock and mineral makeup (profile similarity ${pct(pp.geo)}%).`);
  else if (pp.geo < 0.6) cons.push(`Rock and mineral makeup differs (profile similarity ${pct(pp.geo)}%).`);
  if (pp.slope >= 0.8) pros.push(`Similar slope: ${fmt(e.slope, 1)}&deg; here vs ${fmt(P.slope, 1)}&deg; on ${L2}.`);
  else if (pp.slope < 0.6) cons.push(`Slope differs: ${fmt(e.slope, 1)}&deg; vs ${fmt(P.slope, 1)}&deg;.`);
  if (pp.temp >= 0.7) pros.push("Sits at a similar place inside its own world's temperature range (compared by position, because every Earth site is warmer in absolute terms).");
  else if (pp.temp < 0.5) cons.push("Sits at a different place in the temperature range.");
  if (pp.press !== null) { if (pp.press >= 0.5) pros.push(`Relatively low pressure for Earth (${fmt(e.press)} hPa vs about ${fmt(P.press, 1)} hPa on Mars).`); else cons.push(`Far denser air: ${fmt(e.press)} hPa vs about ${fmt(P.press, 1)} hPa on Mars.`); }
  if (r.gate >= 0.75) pros.push(`Very dry (aridity index ${fmt(e.ai, 2)}), like the ${L2} surface.`);
  else cons.push(`Not very dry (aridity index ${fmt(e.ai, 2)}): liquid water, weathering and plants act here and not on ${L2}.`);
  const c3 = cons.slice(0, 3);
  c3.push(`Earth cannot reproduce ${L2} gravity (${p === "MARS" ? "0.38" : "0.17"} g), radiation, or ${p === "MARS" ? "the thin CO2 atmosphere" : "the vacuum"}.`);
  if (e.cov < 4) c3.push(`Only ${e.cov}/4 Earth inputs were measured live; the rest are estimated.`);
  return { pros: pros.slice(0, 4), cons: c3 };
}

function goEarth(s) { setView("EARTH"); selectSite(s, true); }

function renderPlanetPanel() {
  const pt = state.pt; if (!pt) return;
  const { p, lat, lon, prof: P } = pt, L2 = PLANETS[p].label, all = rankEarth(p, P), top = all.slice(0, 3), rest = all.slice(3, 8), best = all[0];
  const cc = (best && best.e.cov) || 0, C = 2 * Math.PI * 52;
  const conf = P.cov === "Very low" || cc < 2 ? "Very low" : P.cov === "Moderate" && cc === 4 ? "Medium" : "Low";
  const vd = best ? verdict(best.score) : { id: "weak", label: "No match" };
  $("hudText").innerHTML = best ? `${L2} ${fmtLat(lat)}, ${fmtLon(lon)}: best Earth analog ${esc(best.s.name)} (${best.score}%, ${conf.toLowerCase()} confidence)` : `${L2} ${fmtLat(lat)}, ${fmtLon(lon)}`;
  const est = '<span class="live off">estimated</span>', trow = (a, b, c) => `<tr><td>${a}</td><td>${b}</td><td class="d">${c}</td></tr>`;
  const bar = (n, v, w) => `<div class="mrow"><span>${n}</span><div class="bar"><i style="width:${Math.round(v * 100)}%"></i></div><span>${Math.round(v * 100)}% &middot; ${w}</span></div>`;
  const card = (r, i) => {
    const w = r.W, why = whyMatch(r, P, p), vv = verdict(r.score);
    const rows = [bar("Terrain class", r.part.type, pct(w.type) + "%"), bar("Geology", r.part.geo, pct(w.geo) + "%"), bar("Slope fit", r.part.slope, pct(w.slope) + "%"), bar("Temperature", r.part.temp, pct(w.temp) + "%")];
    if (r.part.press !== null) rows.push(bar("Surface pressure", r.part.press, pct(w.press) + "%"));
    return `<div class="analog" data-i="${i}"><div class="top"><div><b>${i + 1}. ${esc(r.s.name)}</b><small>${esc(r.s.country)} &middot; ${esc(typeOf(r.s.type).label)} &middot; ${vv.label}</small></div><div class="pct">${r.score}%</div></div>
      <div class="bar" style="margin-top:6px"><i style="width:${r.score}%"></i></div>
      <div class="visual" style="margin-top:8px">
        <figure><img class="eimg" data-i="${i}" alt="Satellite view of ${esc(r.s.name)}" title="Click to see the exact location on the Earth map"><figcaption>Earth: ${esc(r.s.name)}, Esri World Imagery. Click to open on the Earth map.</figcaption></figure>
        <figure><div class="skeleton pvskel"></div><div class="tileview pvbox" hidden></div><figcaption class="pcap">Loading ${L2} imagery...</figcaption></figure>
      </div>
      <div class="sub"><span>Why it matches</span></div><ul class="why">${why.pros.map((x) => `<li>${x}</li>`).join("") || "<li>Few strong similarities.</li>"}</ul>
      <div class="sub"><span>Where the analogy breaks down</span></div><ul class="why bad">${why.cons.map((x) => `<li>${x}</li>`).join("")}</ul>
      ${usesHTML(r.s, p, r.score, { types: P.types, vec: P.vec, tempC: P.tempC, slope: P.slope, name: "this " + L2 + " point" })}
      <details ${i === 0 ? "open" : ""}><summary>Score breakdown</summary>${rows.join("")}<p class="alt tight">Weighted fit &times; dryness gate ${r.gate.toFixed(2)} = <b>${r.score}%</b>. Earth elevation ${fmt(r.e.elev)} m vs ${fmt(P.elev)} m here is shown for context only (different height datums).</p></details>
      <button type="button" data-id="${esc(r.s.id)}">See exact location on Earth map</button></div>`;
  };
  $("planetCard").innerHTML = `<div class="hero"><div class="ring"><svg width="120" height="120" viewBox="0 0 120 120"><circle class="track" cx="60" cy="60" r="52"/><circle class="val pring" cx="60" cy="60" r="52" stroke-dasharray="${C}" stroke-dashoffset="${C}"/></svg><b><div>${best ? best.score : 0}%<span>best Earth match</span></div></b></div>
      <div><h3>${L2} point</h3><div class="coord">${fmtLat(lat)}, ${fmtLon(lon)}</div><span class="tag">${esc(P.region)}</span><span class="tag">${esc(typeOf(P.types[0]).label)}</span><span class="tag verdict ${vd.id}">${vd.label}</span>
      <p class="alt">${lat.toFixed(4)}, ${lon.toFixed(4)} (planetocentric, east-positive)</p></div></div>
    <div class="cov"><div>Planet-side data coverage<b>${P.cov}</b>nearest catalogued feature ${fmt(P.dist)} km away</div><div>Earth-side data coverage<b>${cc}/4 live</b>for the top match</div><div>Match confidence<b>${conf}</b>separate from coverage</div></div>
    <div class="sub"><span>Profile of this ${L2} point</span><span>source</span></div>
    <table>${trow("Terrain class", esc(typeOf(P.types[0]).label), est)}
      ${trow("Mean slope", fmt(P.slope, 1) + "&deg;", est)}${trow("Elevation", fmt(P.elev) + " m", est)}
      ${trow("Annual mean temp", fmt(P.tempC, 0) + "&deg;C", est)}${trow("Surface pressure", p === "MARS" ? fmt(P.press, 1) + " hPa" : "none (vacuum)", est)}</table>
    <div class="sub"><span>Top 3 Earth analogs for this ${L2} point</span><span>similarity index</span></div>
    ${top.map(card).join("")}
    ${rest.length ? `<details><summary>Next ${rest.length} matches</summary>${rest.map((r, k) => `<div class="mrow"><span>${k + 4}. ${esc(r.s.name)}</span><div class="bar"><i style="width:${r.score}%"></i></div><span>${r.score}%</span></div>`).join("")}</details>` : ""}
    <ul class="lim"><li>Slope, elevation and rock type are interpolated from ${REFERENCE_SITES[p].length} catalogued features${p === "MOON" ? " and approximate mare outlines" : ""}, not measured at this pixel. Temperature and pressure are physical models (latitude and elevation), because no free live per-point source was available.</li>
      <li>Earth values are live where marked (OpenWeather, ERA5, SRTM15+, Macrostrat, GLiM). Earth mineral profiles are estimated from rock type, not spectra.</li>
      <li>The percentage ranks Earth sites against each other. It is an estimated similarity index, not a validated accuracy.</li></ul>`;
  requestAnimationFrame(() => { const rg = $("planetCard").querySelector(".pring"); if (rg && best) rg.style.strokeDashoffset = C * (1 - best.score / 100); });
  $("planetCard").querySelectorAll(".analog button").forEach((b) => { b.onclick = () => { const s = earthCandidates().find((x) => x.id === b.dataset.id); if (s) goEarth(s); }; });
  loadPlanetImages(pt, top, state.ptTok);
}

async function loadPlanetImages(pt, top, tok) {
  const p = pt.p, L2 = PLANETS[p].label, root = $("planetCard");
  top.forEach((r, i) => {
    const im = root.querySelector(`.eimg[data-i="${i}"]`); if (!im) return;
    im.src = earthTerrainArt(r.s.name); im.style.cursor = "zoom-in"; im.onclick = () => goEarth(r.s);
    const pr = new Image(); pr.onload = () => { if (tok === state.ptTok && pr.naturalWidth > 32) im.src = pr.src; }; pr.src = earthImageUrl(r.s);
  });
  let view = null;
  try { view = await getPlanetTiles(p, { lat: pt.lat, lon: pt.lon }); } catch (e) { console.warn("Planet tiles failed:", e); }
  if (tok !== state.ptTok || state.view !== p) return;
  root.querySelectorAll(".analog").forEach((card) => {
    const box = card.querySelector(".pvbox"), cap = card.querySelector(".pcap"), sk = card.querySelector(".pvskel");
    if (sk) sk.remove();
    if (view && view.polar) { box.innerHTML = `<div class="polarnote"><b>Polar region</b><span>flat map mosaics cannot show ${fmt(Math.abs(pt.lat), 1)}&deg; latitude</span></div>`; box.hidden = false; cap.textContent = `${L2}: no image shown rather than a misleading one.`; }
    else if (view) {
      box.innerHTML = view.tiles.map((t) => `<img src="${esc(t.url)}" alt="" style="left:${t.left}%;top:${t.top}%;width:${t.width}%">`).join("") + '<span class="brackets"></span>';
      box.hidden = false; box.title = `Click to zoom the ${L2} map to this point`; box.style.cursor = "zoom-in";
      box.onclick = () => { if (state.pmap) { state.pmap.flyTo([pt.lat, pt.lon], 5, { duration: 1 }); window.scrollTo && window.scrollTo(0, 0); } };
      cap.innerHTML = `${L2}: NASA ${esc(view.layer.label)} at ${fmtLat(pt.lat)}, ${fmtLon(pt.lon)}, about ${view.widthKm} km across${view.reprojected ? " (re-projected so the pole is not stretched)" : ""}. Click to zoom the map here.`;
    } else { cap.textContent = `NASA ${L2} tiles did not load. Coordinates and matching still work.`; }
  });
}

/* Earth view: where every number in the panel came from, with coverage kept apart from confidence */
function provenance(s, conf) {
  const { w, c, t, g } = s.data, T = typeOf(s.type);
  const r = (a, b, ok) => `<tr><td>${a}</td><td>${b}</td><td class="d"><span class="live ${ok ? "on" : "off"}">${ok ? "measured" : "estimated"}</span></td></tr>`;
  const n = [w.live, c.live, t.live || t.partial, Boolean(g)].filter(Boolean).length;
  return `<div class="sub" style="margin-top:14px"><span>Data sources and limits</span><span>Coverage ${n}/4 &middot; Feature fit: ${conf.label}</span></div>
    <table>${r("Current weather", "OpenWeather", w.live)}${r("Annual climate", "ERA5 via Open-Meteo", c.live)}${r("Elevation, slope", t.live ? "SRTM15+ (OpenTopography)" : t.partial ? "Open-Meteo DEM (coarse)" : "reference matrix", t.live || t.partial)}${r("Bedrock", g ? esc(g.src || "Macrostrat map") : "class template", Boolean(g))}${g && g.glim ? r("GLiM check (0.5&deg; grid)", esc(g.glim.label) + (g.agree ? ": agrees" : ": differs, treat terrain class with caution"), true) : ""}${r("Terrain class", esc(T.label), Boolean(g) && c.live)}${r("Mineral profile", "from rock type, not spectra", false)}</table>
    <p class="alt tight">Coverage is how many inputs were measured; confidence is how well the match holds up. ${esc(PLANETS[state.mode].label)} values are catalogue approximations and physical models, not per-pixel measurements. The score is an estimated similarity index, not validated accuracy.</p>`;
}


/* ===================== GLiM GLOBAL LITHOLOGY (Hartmann and Moosdorf 2012), 0.5 degree grid, run-length encoded =====================
   Independent of Macrostrat. Coarse (about 55 km cells), so it is used as a fallback and a cross-check, never as site-scale truth.
   Small islands (for example Hawaii) fall inside no-data ocean cells and return null. */
const GLIM_CLASS = Object.freeze({
  a: { label: "unconsolidated sediments", ids: ["sediment"] }, b: { label: "basic volcanic", ids: ["basalt"] }, c: { label: "siliciclastic sedimentary", ids: ["sandstone"] },
  d: { label: "basic plutonic", ids: ["basalt"] }, e: { label: "mixed sedimentary", ids: ["sandstone", "mudstone", "carbonate"] }, f: { label: "carbonate sedimentary", ids: ["carbonate"] },
  g: { label: "acid volcanic", ids: ["felsic"] }, h: { label: "metamorphic", ids: ["granitic"] }, i: { label: "acid plutonic", ids: ["granitic"] }, j: { label: "intermediate volcanic", ids: ["felsic"] },
  l: { label: "pyroclastics", ids: ["felsic", "basalt"] }, m: { label: "intermediate plutonic", ids: ["granitic"] }, n: { label: "evaporites", ids: ["evaporite"] }, p: { label: "ice and glaciers", ids: ["ice"] }
});
const GLIM_RLE = "x9635exe2x2e2p2epe3ce2pece11x3ex606he6jde19x2e6x25ex3e2x11f2cp2c4p4cpc5p2cpc12p2c4a2x589e2dh2xdxe29c2e11x8e2c2x2cx4p2c2x4c5xf2p3f2pf3p3f24c3a2x583de54x4c4axc9xc2fpxp2f8pxp2fp17cpc4xc2pc2bcb4e3fxba3f2x9px3p2x143d2ax412e5x4e9xe7c4e2xe25x8fp6f7pf7p2fp41c2bcpkb4a3x2f3cfp9cp3x135adax76a2x338e8x5e3xe2cec4xe4x2e22x5cfp2f4p68c5pb2xf2p2c3pcpca2f4x122a2xaxa5x6a6xa2xa6p5x55ec2p5a2x332ece9c3excex2e3c3xece24x5f5pf10p67ce2f5c2fc2ecap3x71hxi2hexmeh4x15hx27ad2ax6a5xaxda3x67fp9e2x326c2x5c2e13c3xcec5e2xe16xe3x13p82f3c4xc2ap2x56h4e3xexh3fexbe2x4he7hx129exf2x2e4fe2p2ie2x309c5x21e8ce5cxce16xe2x18p87c3h3x60h3ehe5h2fe3x7e4x140p5e3px5aeax306e2c2e4x3ecex6c3ec3ece4xe25hx7efh5p91h2p2hxhx57exeh2e4xehehe5b3x10ex147ep3e2pepax300cx2cxe5x3c2e4x5c4xe4xce8ce8he5x5ehp101hx3hx64hex3e7x3c3ecx154ae5iex4dex277e9x8cx6ce2x10c6x10cec2xe4c2e9x15e2p2hp2cp85hp3h6x2px62ehx2e6x6c6ex158fx272e8x20e2x26cxex6e4c4e2xhexhx18ex2e3h4p82chp3ahph2xhx65h2fe4x10ex132c2x23ecife4x3ex263e10x2e3x8e2x15ce2x5e6cex5cec3e15h2e3x16e2pephp83hph3ph4xhxhx69fex98fp3f2x53ix2ix7c2efi2e4h2x2exexenx76cx175e8x6e4xex6e4x8c3xcexc2e4x4ex2exe8x16ehx22p4h2xphxpxhxp71h2ph2p3h4x3hx159e3f3p5f2c2x52ixi3x3excec7e4fhe4fe4c2xcx250ex4e2x2e11x5ec6x4c2xc3e5x6ex5e6x10h2e3hx43hp72hc3h3x156p3fp5f2pcx54h4i2e6ic4e6f2n2e5c12x43fx2fe4a2xa6x197e17c6x2c3x6ce4x3e6x2e12he11h2x42p72h2ix2axa2x150f3p5cx41ax12e2h2ie2ieiefe3c2ecefe3c13ec5ec2fc3x47f2e2fe9aex2a2e3xax192e8x31e3x3e12he4xe6x47p68h4cx153pfp2c4x49ixexe7dfefe4fef2ec2b2c7ec18x52f2ex18a2x172e10x2e2x122hp59hp2hc2p2hcphxbx149efp2fcfx56efe3nefn2f2efe3ce2c2ec24x3c3x54c2x190e16x21ex8e8x3e9fx6f5x8fx48h2p55h4c3xhc2hbc2x148ce2f2pfc2x53exc7dc2fcfeb2cbc28x2c2xc2x2cx21ax33e3x186e16x2e3x12exexe3x8e5x5ehe7x4f6x2e2fc2eh2xch2i2hi2x41h2p51hpc2h3c6xcx151f5cx27e3x18fec2dc7b4cbc4bc28x4c21x10a11x26e2ix183e13xe8xe5x2nex2e5x5e3xe9x2hex3e2x5f5ex2bhc2f2e3h2xcx3hx42hi3p54hxc2xc5x149c7x26e7x5cx7ax2cj3fc2jb2c75aea5ha4x211e12x3e12me4dexe6x8e9x3hex8f7x2h4ebc3xcfh9x39bi2hbp51hp2hcpcx2i2x149c6x26e9x4cx5c4x5c45b3c6dcdcbc28axcfa3x19a3ea4x185e8x3e5me9me6xe6x10e5x3e4x7f8xfehfefef3h5c2h5xhx35b3ah5p45hph3p2ihfcexcx147c2fc5x26e8x2c4xc11x2cxc12e2c25b2d2ef6efeh5f2c2ec9e3cbc5bc4ec2fax6ax13a11x70c3e2x41e2x65e3x10m2em2e20x16h2eh2e2x8f7h6f4h2eh4ih7ih3x34dxh3p44hp2hp3ix2c4ix148c2f4c2x22e10x3c5x4c9xc17a3ca4c13b2df5e3f2h3dhaf7be5ae2c4f8ecaec3fx5a30x4a5x55e2x40c6e5c4x69m3e25x15e3heh3x6f5h3f3h4eh2eh2i2h14ehxhx29bde2xh3p44hxipbpx3c3i2x88e3xiexexe2xe3x48f3efefx20ce8c2x2c48ac3b3de2f3e4f2h9ef5e4fcd4c2f5e2beca3ce3c3a6eca49x4ix72c12e3c13x36ex3e2x22e29x10e4he2h3x7fx2c3eih8f2xh18x2hex25bd2xe2hdhp42hkph3xbpbx87h2xexid2xe3xf2e9x55f2x15e11x3c17xc13b16cdedf2ef5ede2fh2dh9e2f4e4f6df2jfdbc4a4e2c2ece2a3ece5a6e2l2e4a10l5a3ia14x74c40e3x19e3xe7x2e2x3e3x9e29xe2x5e2x4e2he2hx14i2hcxhx3hf2x2fx2hchih14xhx24bpb2pbxixhp48bp3b2x83h3dehe2iecbh14e3x53f3cfcx9e10cx2ec21ec4bfb4fb13d2e2d3ef4e4fh6dh8e2f2e7fef5c2ec2ac2acecec3ecea2ece3cele2le6ce2ce3a6gl5i2ea4cia10x15a4xac2e6if2ix40c2ec3e8c17ef3e3pc3ebc2eceax5e35x6e2xe14xe9x7e5x3exehe2he2xex7i3h2f3x5fx2fx3hceie9h5x25hx5hcp37bp2bp7b3x83ih6i2ehbih2eh12ih3i5x25a4x21ef4c2h2x6e6c3x3ece8c15b2cbf3b17df3def4e2fh17ef2e12fe3c2ac3ece2c6e7c2e4ce4ce5faei2a5f2cfa23e3cecle2cec2ax5e12ijf3xe2x26ce11fc2e10c7e3f3e2f3egf2e2f2af2c3a3e4ce38x2e9x4e3x7ex6e6x2exe2h4x2e3x6h2i3f3x9ex3e6he5x34chp38cp3bpb4x82h4xh3gheh4ihbihb2h9dh8i6x22a2x7a2x5a5cx2c5fef4e2x4cae2c4x3e2c2x2e6c2e4c7b3fecb19cdf3ef8efef4ef9e15c2ac4e4c2ec2e14ce2c2f2dh2a10ja3ja5ba17caje4fec9a2ec4jgj3ije5i2eiax23fe3cf2cbfdf2cde2ce9fefe10fe5f2efa6c3e45x4ex5bexexh4x12f4x4he2h4eh2f2x3fxh4eh2ex11e3xhx2h2e7h2exex26hah3p36h2b3x87mh2x2ihi2eh2ibdi2ci2cihb2h16i3hi4dix10ece2x9a8xa12c8f2ce2cxe2cae3c2x3e3c2x2e12c5f5e2cb16db3c2ef2e2cf9df3df7efe8f2efec7ef2ececec2e10c2e2cieifh2ja11ja28c2jle2ice3c3l4a2ej7gje2je2ie5a2eax22f2cfbce5fe2fe15fie3fe3b3cfcei2aia4c3e34b3ede3dx5d2ghex3h3jh2jh4x2h4xh2x2f2xh15x2fih4eh2e2x8e5x5h7eh8x21hih6p31h3px95hih6i2bdhi5chb2e2deh11m3hih4i6x6e3fx6ef4a20ec6ec2hef3e2cae2c2x4e4xe12c6f4dfb23c4df29e3f5e2ac4ace2c3ece14cief2j3ac4a7jcgef2caja2ja7j2blej2lmea2c2dlie3i2ej15gj4ie2ije3deae3x22f6egec2e2ge5f2e10b2e3bc5e2b2a2ea2ea2c2e38gb2de6bheh2ebexh32bh7xh4eh4e2x9e2x7e2h7e9hx18h8p32d2x95fh7gi6hihbieihiebedhih14idh2dh2ihx6e2x6e4c4ea16c7fce2h3id2c2ecaex4e7c2e10c6f2ecb23dfdfef6df27efef2ec6ae4c5e12c2e2ijefa2cac5a5j3ec2a6c2ejg2jc3je2b2j2ej3e3bclc4j2cj11icj4cjcj2eij2ejgaxeh2ihx18c4ej7e3je6ce2ieb3c9e5acec5ec2ac5e30jh3e4h7e3xh28eh6ihi3h11x18e5h4e3h4e2he4x16h7p27h2ph2x95hfh6ei6hi3hi10eh8x2hih7dhih2x7e11c3ae3cea10ec7fehi2c5ece2aex3e3c2ece14c7fef3b22dbde4df2e2fdf21ef4e3c7e3cec5e9ie2ieci5fa2c9a12fhf2e4g2j2geb4e2c2ble2ljcic2j7bj3a2ji2j4a2bcj4gj2g2cjedh4e2x8c4x6j4ij2m3j2e6g2e2ic13ec2e2cfc5ece3c5e28j2m2jme4h3jhe2he4hjh23e2bh4ehi2h6x2hxhx18e7h4e2hx2hehe6x17hip2h3p24h3ph2x24b2x11b3x56h4fh3cgi8ebh3ebh5ie3hih6x6chdhd2x4fe2xa3e5ae4acaceca10e2c6edic4e5c2ae3ce2c6e2ce9c11he2f2dfb20e2de4bed3edfdfdf5jf13e3c2a2c6e2c3eice15c4i3e2j2c14a4fhahfchg2e6jl3jb5lflj12cj2a2clabjcbj4ax2g3j4cie2jeihix2ix2c2e2j2e2bfbebib4ej8e2gei3b6e4cb2ce6cefec3ece2aec5e27m2jmibie2fbh3e2h4je3h4eh8i3h12i5x2ih4xe2hx22e3h8x5he6x17h2ph3p24h5x25b4x2b12x54h3dh5i2g3igi4x4h11i3h6x12aef2e3a4e12ca6ea3c2fc2e2fe2d2c2e4aec2e6ce2cec8ece4cec12hfcdf2b24ebe3bed2ede2cfdcf2df12e2ca2c9e3ce2ce20ic3eiecej2c3ac6a3fhf3e2ge3f2ec3jcdfi2l2j5cj7c2j2a3c2babij2a3bax7ij6ix11ej2e2h2ieb2c3e4j2e4ie5ce2c3eh8ic3e4ae6cf2e3cefe25mejmjmh3bi3h3imih3ejeheh8c6h3i3eh5e2h3eh6x2e3hx13h3eh4e4h6eh2x4e3x22hihikp20hx34bgb16x51mh2mheh2di5g2ih2x8h9i2h7x11a2f3e4a5ea4ce2ac2a7cec3efe5ceac3ecae7c18e4ce3c10fdfd2fb3db16db12e3b2edfd2f9e2c3ac2a2c8e5c4ece20c6iecja2fe2ca5h3e4gige2bjecbcje3dl2c2ic3j5c2a2cjdaba7ibiax10j2ihxix11f3hejeiex2c4ec5bec2b2c8h2c2h6i3hihbefefe3fe3fe2fehe28m2jmhi6h2ihi4eh8e4cic8e2ih2ih9ih3x2fe2h4ex9h4ehxeh3e4h8ehx27h2ih2p17hx33bx2b7gb9x50ih7ce2i7gh2x6hih5eih3ih8x4a2xax2a4f2e5a3e3a2c2e3fa7caec2e3he2c2aecac3ec2e4c21e2ce3c9f2c2dfcd2b19db14dbedf5df5ea4c2ac2a5c5e9c3e21i2ec4ifae2fc2a2hchefe8jcg2c2icg2jelfecj4bjca4j3c2a5x2bcix15ix24c5e2b3e2je2ie4c10h2mhih8ame5c3ec5e28m2eih2i4h3ihih2mi2h2emhe5c2g2h2eieh2c2h8mh6x3fe3h6x8e2x7e2h4eh8x27hih3p16h2x37b13x52h3fgih4ei3hih5x6i3h4ihih2i6hih4x4a2e6f2e3a5e4ae5afa8cecfe3c2ec6ece6ca3cacac2ac12e5c9fad2f2df3b13dbdb13dbe2beb2ece2dfcdcfcac2ac17ec2ec2e3ce4c2ec4e10ie2ie2ac4f2je2jae2chece4jifc2g2cec2ecj2c2fjcjijicj2c2ae2c3jbja6x19mx21cjc4e3c2jce5c2ec2ec3pechihi2h2gh3b2ch2ae7c2e2c3ece25i18hmim2he2c6i2chgcg2c4hih5mhix6f2e4x3e5x15e2h5eh2eh5x26h4p15h2px40b6x52ixeh2ehehgheh2i3hi4h2x5hi2hihgh6ihi3hi5h2dh4a2e3f3e2a5e5a4e7c7e5ice2cec2e9c5a7c10e5c4ec7d2fdfd4b2eb22db9ebebde2d2cfc31e2c2e3c3ef2ec2e4ce5ge4c2ic2f4ejfh2e3cece3ceg2fhej3g2c2ji2c2a4jac2e2cjc4a7x22mcmx8cx3b2cmjc3e2c5e5c2emc7b2cp2e2h2ih2bh7jice4ie3ae2c2e25ci4h2ibi2hi3hihimh3e2c4i4cich4ih2ihbh6x10e2x12h2x11e3h4ex2eh3x28h2dp13hp2hx99h4eheheh5i2dh4x4hxh4i4bi2h5i2h2i3h2i3h6aef4ea6e19c2ec5iec2e4c2ecececa6e9ae2a2c5e3ce2c4e2c6d3c2d3eb2db3db15db4eb6dbeb3edfe2c7ac17e15c4f2c2ec5ece8c2eie2jeie6ce6ige2ceg2ecgj2c4a2c2acjec3elae2j3ec4x32c7j2gcgcec5e6fp3ic3bh2b7ei2ehahi3hibahiae3l2e8fe24i3hihihih3dhim2h3mhe2c2h2i2c2hcm2heme2mihih2x18e3x22hexh5x3hx29hp14h2x97h5eh3e2he2hei2h2ih2x6h2ihi7gh6i2hi4h4di5d2ef3e4a4e7ae6ae3f3e4fe4ce9c2a2e10a2e2ae3a3c3ec2e9c8ded2ededb3db22eb3deb4cfdedfc8e3c16e12cec5f2ec4ic2g2ece4c4e2c4ecae4gce6j2eciajhiea3bjac2a3cec2ebce2c3he2ca2c2x30c2bc5g2jcgc6e5cmc6ihmc7pj2mpe2a3hici3abihiebeia2ec5e26jhih7mh10ecmh2ch3e2hebhbim2gie2x19ex6e2x2h6xh3x9eh4x32h2p13hx70bx24h7e3he5i4hji2x8hi8hdhi3h5i4h2khki4ef5e5a4e5a3e6a2e2fe2fe3fe3dece4cece3cae6a7ea5c2ac5a5ec12ef5e2d2edbeb2db2eb13cb5c2d2c2dc7a2c3e6cec12ec2e13f3c2me2ig8e2c2ece4ce4iec2ece2ijicb3aci2ex2ceaedb2ac2ec2ec4bc2eacx36i2c6ec2jec7e4c3ic7i2e2b3c2bj2pj2a2e2ahjhi2eajbe4a3iaeie2iefe25h3m3he2h19emhebgbmbemb2x26ex3h3bdb2eb2hix12ox32hchp10i2x94e2hihihde6gcg2ci6x8i5hi2hih4i3h2i6ak3ie4f6e3a7e10a5e7cfe2fe2ce2c3e5c2a3eaea17c3a6c13df6df2dfed3be2cebeb14dc3d2c22ec23ec2f2efec6g2cigc3gie3c4e2ie8gj2ex4ixhc3lx2c2dbc5acb2c2e2c3x41c11jc2ece4c2imi2bc5ep6c4b2c2bfpce2ahi2aibc2bicbe3h2eai3aie28m4eh8eh6ih5e3gi4bimx33bj3h8x46hbp3imp3i2x95h4d3he6icbgb2gi3x9i3h2ih2ihi2dih3k4ia4h2k2fef5e4a6ea3e4aea5ea4e5cf2ede4c4e6c2a14c2aca2c4a6c2e4c7e2fe3f9dfb4eb6cb5cb2cbcfc2f5c2fc10ec10fe2fcf2cfc12f2efc7igcgijc5eg2ic2iecg2ie2jejijix6c3x5g3c2eca2j2bc6x44j2xc6jcbc10pmpc9x3c2p2cp3cpmip4a3hai3bcie2afeahae5c2ece2ce21m4h2mh9e2h2mbihmi2hi6bix34ih15x43i7phpx96h3d3e3h4gh2icgigigihx8hbibih2ihi7hak5a2e4fe2f3ea14e5ae3a4ea4e3f4efe13a17c5a6c2a3eae3ae2c6fe5f7dfd2b2ce2b4c5b2cbc2ec4f10efc3e2fc3f11e2c17ef2ci2ciegice2jecjci2g2a2eg2ecegei2eci2x9ix4jc3ejla2c2a2bc3x43b3x2bc6dc3ec8kimcx2c5pcbcx3cxcp2cp9cai2hgec3ihjeifa2eacefhe3c3e22memhm2h6mehmehbeihei2h2ei6hx34ih13jhx2ex6ix38hi2p2x83hx13h6gch2ihih3ig4i5x2i2x3i3ghgi2x6a4kakc2e2fe5f2ea13e8ac2a5ea3e5ce2fe9cecea28c2a3e2a2e3a2cac3fe4ie2hf6df2b2eb2ceb4cbcb2d3fc2f3cf5ef2efhce2f16e2c4ec7f2c3e3c2e3j2gcgjei2ci2jlj2li2cjbjgb2i2cx14jc3bjlaxax5acx55c2ec9b2km2cx2c4ix17pcxcpibfdi3hci2c2bi3f3cf4c23e2fnf2i3ehch2i3h8i2h4i9x34h16x8h2dx138ixhih2bgh2jh6ig3i7x18a2e2c2e11f3ea4e2a6eae11a2e2a5e4ce3ice9c3a9ea4e2a18c2a3e2a2c3ac2fe2iehe3fdf3dfbdbcb6c2bdcde2cfcf4ce3fh6ef22e2c9f4c2e2ce3cj2g2c2jgi3jc3bicx2i2bcb2c2x13jbc2lx69e2c10b3mx4ecx24c4mhmo2hc3bcijcbehfc4fc18e3c3f4i3c9h8i4h2i8x33h15j2hx6ih4x121cx15dxi2hchbhijih3gh2i4gi2h2x10a8he11f2e3f2a3e2a2e4ae15aece2a2eae5fe3ife8c4a7e2aea2eae3a26c3acefie6d4cdcecbceb2cb3cdce2f9e3h2ieh5ef3df2ef3e3fef6e4c4f4e2f2e2ceij2g5x13ix4iei2xex11cjcj2ix70exjx2cxc2xcb3c2px31cp2e2fophec4fc2ihf3c2ecfc21ef2nfic14h4i2h4i5di2fhf2x29h17xh2x4kh5cx137mihih3ix3ihch2i8x12a7e12f3e3a5e5ae2c3e7a2ea4eae2a5e4f2e3fecie5c4a5eae9aea8c3a2ca17ceie3he6f2e2fc3b4c2dcf11e3ibh9f3e4h2ce3heih2ehef3efhefe2fe3f2e2fij2gjg2cx35lcbjijx80c4j3x2c2x32e3boi2jejci2jcjie2fecf2c20efcef2c15hedi13f5x31h15jh11ih2x111hx2h3ix20h4x6ih2ifei5x10a2x3a6e10f2efe3afe7c7e7a5ea10e8fh2c2e3c6a4e7a2ea4e2a4ea2ec4a16c2eae6cd2becfc4bc2bedf2df9efh2i2h4ih2i2h4i2h3e3h4fh11e8fe3hcjcgc2x35l2cbjbcx81c4x3cic2x31cm2xexoi2e2je5heifece2fc7ec7ec4e3cfi2c12h2i15f6x31h6ih7eh11ih3bx108hx2c2hcx31h2i5gigx4fx11e3a3e10fef2e2a2e6c2ec5e7a4e2a10e6cfedhdhce3cec2a12ea8ea8c6a14c5hae2d4cec4ec5df11e2gie2hi5h2iei2hihieih2ei2hih10e2he6ie7j3ijx33c2alc2b3la2cx76c4x4c2ix34cexbxepidijc3ecejec2he2fec8ec5ec2e9c2h3ih2c2e2i4h2ih4i7f5x2efx28h2ih6ih3ej2h10i3x109bxbch3ih3x23a2x3hi7gx3fx6e3x3e14f3efe3f2a2ec2ec2e5ae6a7ea9e8f2ifi2e3ca2ea2c2a7ea5ea13c2a16c7hec2f5cf2c5df13eifih2i2eijih2i2eih3ih3c2hic4h6e2he8ih2iheiei2jx35alc3b3l3cx76c3x44ie2gedmebic2ec4jdcece3c6e4cece2ce4c3ec4h8i8bi9hi2f6e2f4x24hi2h7ih3ej2h10di2dx110h6cx21a5x4ih2i2gicfx8ef4e15f2e3fe3fefe4c2e3a2e3a5e2a8e2a2eae9fei2hce2c8e6a4e2a3ea19caea2cac4ac6hiec5edfdf4d2f11ege3hdigi5hdji3e3ihdh7ci2hic4heceh4e2chiheaei2x35cac3b4labc3x72c2jc2x46cexe4o2j2c4e2jic2ec2fc5ece2c2e12c5h8ibchch4i5h7f10e3x16e2x4eh2i2h6ih3e3h10i2x110ich2cbcfx21a6x4ihihihx10ae2af2e14f3ef2e5c5fceafa15eaeae3aeae10f3hfe3ceaeaece7aeaea2e5a19fac2ac6fc5ih2ec5e2f6df10eg2edfi2a3i4hahi3ah2dh4i2h4c3h5c5eh2ihicj3dijx36la2cb3lb3clxcx69c4x53fejxm4e4cjecilhe2c6e21c5h2ihbhih2ih3ih15f2e8f3x18h2ih2ihi3hi2h5ejbh6ihi3hx108cx2bfcecfx20a5xa3xfex14e5fe14f8e9c2af2a7e2a5e3ae16fehf2e2c3ea2caea2e2ae10ae3a14ce6c7fj2h3ecfcf2e2def19eihkihehei2jiai3hi3h2i3h9ihidi3hiah2ih2id3aijix38c2b2j2bab2c2x70c2x2cx54e3jem2ie3cejchfiljhc6e3cec2ec3e9cec8ihi2c2h8ihi6bi3e17x11ih3ih2i2hi3hih3i3edbh6d2ih3ix102i2hx4e2c3fcx20a8x4ax13fe18f3e5f3e6c3fc2ea2caece2a4eae3ae13fe2heiece2c2e4cea5e2ae4ae6a11ce6c2ec2ef3efe2jhe6h4f2df17ik2ifhi3ai15di7h3ih2i2hi2h9j2x40l2hcjba2bcjcx8lx58jpjx60e2x2bh2i3j5ecebifcfc3e3ce4c5e2c2e3c3ec6ecicigb2igbfihi6bib2i5e12fe4x5hihi3h2i7h3i2hihihecdh4ichdhihidi2x98ch3b2ex4fcfax20caexa3x11a2x3e2f6eae13f2e10c3e3cf2cea2eaec5eae3a2e9a2fe4hefec2e2c3aeae3ae2aeae14a10e2c7e2jif2efcifih2ih2i3h3c2f18kdi4afieihihi18h5i3aih4i4j2hx4eix35c3hcaclb2cbx9cxcx122lh2imj2lj2cj2cfcbcef2ec9e2c12ec6ec2f9hi19e9fe3x6i2h3i6hi2h2ih5i2h2c2ihdi2cgibi2h3dx96cef4c3x4jf2cefx19a2e2x2ce2x5a15ef2ef2ce9f3e3fe4ae4cec2e2c2ac2efcf3c2eaea3ea2eae9jif2iecae2ae3ae3aeaece2ce13a6ce7cec3iecieceihecih6ih2ihc6f11ek2iaidihi7gici4ci3ci3d3idi2hea5hie3je2ceace2x2cxcx5cx26c3hacjg2x65c2x66b2x3i2hihijgbcjgihbjcbc3e2c23e4cec3f9i3bi5bi7bi2eibibe5f2ex6i2h2i12h9c2i6dhi2hx2dhi2hx93cf5cfx6ca2fefx17aceakea3eaxa18f3efcfe7f2ef2e2fcfcecfec3e4c3f2c3e4fefe2a7e10jejf2c2e4ae5ce2icfi2c3e13a6e6fe2ac2ahie2fae2ji3h2i2hihehi2dc3f10eik2i5eb3i16h2ec2hi2hijah4ec4ecdecefecacxc3a2x31cahcj2bjx63cx70ijx3im2i2h2jmjiojbjl2bec3e2c26ece3c2ef8i2hi7di10bie8x6i2hih21idh2i2h3ih2cidihd2hi2x91i2f2e3ix3fefcef2ecfx10a3ca2eaeaea2e2ae2a19ef2ef2ife4f9ce3fc5e4cfef5e6a2ea2ea6e2ae6jhiece2ce3ae3ciedehfjejf3ace9a12e4cji2e2ije4j2h2e2i4c2i2mih2c4f3cfehk3i4fiji4gi3gidi6cac3g2cachijc2i2fi2dh2chf2c5j2acaeajbjxc3x25ac3lb2xjx135bx4i3h2ilbjbg2j2e2hc3he4c28ece2f7i4hi8hi7be6f3x6i2h10ihi3hi4h5dh3ih3idch4i3dx93c3ecicx4f2ce5cfex6a6ea7ea24ef2e2fe3ce3fcf2ef5c2ec3ace5fcf4e5fce7a6ecae5jhefhfa3e2a2e4hi3hie4ieaece10a9e3cjge5fhihe3fdejcjfi2cibi2h3ec5fehk3i2di3ci3cdgi9ei3ci3ljg2cia4cidiaiji2eihcic2ac4i2aj3xc3x26ab2gcx53jx85bx4ihi3emjb3j2e2jeh2c3e3c30ecf7i3hi2gi14e4f6x6ighb3i2h3ihf3i2h5dh4dhi5dhi6m3x90c8x4c2ece2fe2cfex6a6eaefe2fea23e6ce4cec2ec3e2f4efefcfe9f3e5fcae10a4e4de2jif2ica2e2ace8hfe2fie2fc2ac3e7a10e3ieiefehie6cifejchi2h3bhci2h2iec2ek2ehi4ci3c3gi5c2ei3ei2ai2g2jgali3a3ha4iji2hih2c5j2ca2cjabc3x27ab2cx45jx2j2x97imi2hij2b3eb2jih2c3f2e2c22ec7f7i8h6i2b2i3e3f4ef2e2x3ih2ih2ih2ihihbih7d2h5dh6i2dh5ix92c3ex7a2c3efef2c2x5a6eafeafce2fa24f3c2fe4cec3ec2efef7efce9f2efc2ecafe6c2e3aea3fec2ejeihecaeaec2e3l2h2ehe2i2e3fehejfe2c2e4a4ece7iece9c2ec4fi3h3ah2ia3h2k4eici4c2i2ci4cide2ic2iehiah2b2g3ile2hea7i3hicihlcic5aca2bxc4x26aj2x148imi2mi2jmbl2b2ic2ih2c3fe2c28e2f7i7gbi8hi2he2fe2f7efch5i5f2h3dh3jh9d2hbhbi3h2x3f2x104hxe2f3c2f2x3a8fh2ec2fece2ga3ea15faf4cefi3he4cec2e2f3ec2ecfce8f4ec3e10ce3ce3a2fdece2ieif2ae2cece6ae4fece2fefc2jac2e2a3eci2e3iefe3jeieie2ce4fe3iei3fh3ahkd2h4i2hdi4ci2chi2hcice4cici2ci2cib2g5ihia2ea5iai4ec2il2c5acjacx3c3x26bjx148fboi3hmieie2icbci2h2fc3fecec29f6i2ei5hi5ebeh2ghe2fef2c3fhbiebi3ghi2ghfh7dh7dhd2ih9x3fh2x103c2e2f4xfx2fe2a5cfah3cac2gfchehgjai2cha7fa6f5ei3diecec3e5c2e3cefe5fe2fe3cf2e6ce8c4eae2haeia5caeac2e6a2e9fjeiceficfcae2ceiefj3efe4feife5ai2c2ihi2chd2hfhbhdhe2hic2ijaic2ihi3di3e3ce2cic3ijgb4gb2ihigiciea6ifilcij3eliceac4bx3cac2x24cx151bi2bi5emi2j2cjh3ficf3c2e2c10ac16ef5i4hi13bi3ef4c2fh4i11h15dhx4hxh5x5h2x102ex2cx10f4ecfc2f2cf2ec2fech2ibc2f2afila12e2f3e2iemihe5cec2ece6fefe2f3e3cecef2e10c2e7c2ecedieaiac3ac4e5he3he2fefei3gebehc2heie2hfij2ifjeae6ifce2a2ka3i2hchch2aih2fh3d2iefh2a2ci2ce2i2ei3ececec4icicacgb2gb2gibieaigla4i4ac2galc3ec2aecaix3eaecx22b2x154jib3memieicjih3ihiceocfc2ece2c5ac17efef4i2ci3ebi6b3ibcb2h5ie2h3ibhbgibhib2dh6dh3dh2dx5fe2x10hdxhx113f5ef2acefc2haicfe2f2i2aci2h2feaca2c7a2c2e5ie2i2e6c4e6fe3fe2f2efe2fe12ce3c4e5c2e2ihfa3c6e2ahiefif2ejgigfcfeje3j2i2c2e2fe2ieijeje7jaea2efajdhad2hdh2ihai2fih3acihi3afcei4e3i2cjcebeacac3igbghigbgi2b2gibicl5i2ca3i2l2a4cbcelabx3ec3x180b2eboe2i2eicjmci2biceofecececec25ef3bi4bibihi3dbch6ehe3ih3i3dibi2bi4h3id3h6x4e2x4f3x6dfcb2hc3hx102ixafafcaef3ef5c3e3fe3feh3ih4fac2e2ifcec2e2cae2cfe8ie5c2ece2afefe8f3e5fe3fe2ce7ce2c3e4heaca2c7e2h2f2jcfigf2efei2hife2j2elelfjef2eifij2eieia2eaea2iajekafih2iah2aih2fah2cj3i3aie4ie3ih3bjiaihc3bac2gacgcgib5a2cic5elb2ai3ele2a4c2eab2x3ecx2cx20bx160mje2xcbhci5hciac2a2fc9ac4a3c2a14eih2mgi2gbei5bcbibiei6bib3igm2hbi3h6id3ih2x2he2hf3x12fdhbcbhc3x100bx3icifc2a2f4af3ecagce2fcae2ai2h4a2c2aeaeiea2be4c2efe7ieice4ice5afef2e6fe2ae8ce3ce5cec2e2ce3hce4cacace2ae2hfeifg2e4fhe2f4eifjfealifh2a2eieiefecia2feaei2jea2fhiadi2aidhd2hfbcbcjfae2iai4ei2bai2cbeib3icgac2gcg2eigci3bc2a2i2b3icjchaia3eaeabc3acix4ecx3cx181cx2ach3ji4a2ic2hcac2a2c4jc5ac5a14i3c2h4i5bek6ib3i2ei4cj2gbhbijh5i2h2ihkhxe2fe5cx11c3h2chbhc2x98c7i2f2cf3a2ef3echaiefea2eaeae3ihe3a3b2elaea3fe3cac2e2he5i2e3iece5fe16afe11ce2c2e9ac2e4cac3aehf2eg2f2ie2je3j4aihej2ecaiefhaka2efa2fc3afeae2a2ka2h3ajdidihi2biai2agcae3ie2iei2bchbicaje2ai2gbc3a2cg2bgiebga5c5ih4a2la3ca2c2iejajbx4ex186ac2acbhaiakb3c7af2c5ac5kc2ac2a14b2i2mib2c2dmbk11ihi2bhibicei4h12ihixe4c6x10hcbh4chcbxc2x98ic5f2afa2ef5e3ai2a7f8e2a4fa6c2gehfec3e11hehe10a3eae9ae8ce6c2e5ca2ec2e7a2efhe2aea2fecefi2fah2ifjijcac2hecica2eka6ifehcie2ia8idai2e4ji2a2eae2aea2e2aciacibhiaijibebe2caeagig2e2i2la8ilaci3a10ce2a2b2x5ex187ba3b4acaba2c6h3jc3ac12a14ici3cic3bk6ck7ei3hic4ih14ih2e2c3f2cjc2x19bx2cbx101hahcfaf7ifaf3ea2e3f2h8fhea2f2a7c2ec3ghec3e16h2e2aea2cae12ae8c2e14c2e9a2che3aea2cfaieciai2e2ceceia2gjcelfifaf2ea2ka2fehieiea2djacfa2i4eaebceiaehae4aihciaheb2eji2eice3aea2eabeg2i2eja10i4ja2eca4ijlhiej3x6eax186bc2b2jb2ca2ba4i3chfcfc2f2cfc10a14bihbcgc3dkck2gc3hk4ckbi6e2h9fh7e3c2bcfjhc3xcx6ix8bx5cx102h2cif6e2ca2feaeafgaf2h4f2h3e2a11c2fhc3ghec3e5fe10a2x3e6ae9a4e4k5e9a2ecacke8c2ec3aea2jce2c2jiakak2a3ca12eaciacaeiefei3e2ajhaedai2e2ihaie5ihcj2a2ebe4bcai2ehi3a2e3aei2ebj2c2ia8ca2i3c2aca3cdiajl2cabax7cxex185kb3jb2a3cabab2hi3fhaic2j2c8acaca15i2g2hkc2bcbi2bhch2cf6oi3e2hioi2h11kfebc6fic5x2c2x2eiex118af2ci2h2eifa2faf2hah2dhifhf4gfa2c2a2la5ch2f2c4gec3e5x3e7x5e18a4k8e13k4e8a2eacecefe2je2jfck2a7f2ea3ka3fa3fae3caeaeie4i2e2acejiaieie2ai3e2icic3aebi3bice3ji2e3aieiaiegbgjiec2a10i2ahahjia3cajlie2abx8cx187bcabjb2a4b5i5hcihaj2ac14kc3a4ka3g2h3ifebeib3ibicfk4fk4e2k2h5i3h3i2f2e2hc5ih2c6e4x2e2jx117af3h2ihieiehfef2h3a2f2kha4f4c13h4c2ecec3e4x6efe2x6e16a4k10e9aek5a3fea3eaea2e5afcfeijka7ica4ef2aefi2fca2eaea3eaoa3gieie4ja7c2e3a2ci2eiei3heceiae4b3i4egbgebcgjgica9ciai3aj2ga2hl3eca2x24bx172cdabjcb7jbi2gh4chach3aec17a7ic2i2f2efe2h2ibgbfk4fef2k6h3ih2ejef6ehchihihci2cihcx3e2ic3x120af2ech2bhi3e2f2da9x3f5ec10h5ecfec4mecx7ef2e4xe17a4k8e14k6e5a7e7cfgie2a8c2iac2fififea9cfie2fa2i4ai2gaea2jcia7e2ce2ice2heie2ae2be2abeiace6g3ega4ea5gjcg2ic2a2kai2ehea2lx8ja2x11lx175c2b2acbab2icb4i2g3facjkgajcacf2c9ac2ka8c4f2efe5i3fk4cece2k4ek2fhfijijhf2chikhfihihc2eidb2x2i3c3x122a2e3f2hi4aefhfhafaf2a5x5f4cdfec5fc12hcx9ef2x5f2ce5c3e3a5k8e14kak5e4a7ea4ea3c2afeca5cefif2jifcia13c2e2ae2a3oeigi2giaie3f2ae2cecehe2ae10i3b2e3ce5i2jga2ca11imi2hbeia2iec2a3x11ecx8ax177cab7cb2c2li4jf3b2cgjc5fc4e2ca2c2ac2a7c5fef2e7f2k2c6k4fe2f9h4ehfihic3b2x4ic3x125a3f4ghfhefe2fchgcx2f5ax5ef4cf2cf2c2fmc9kc2x21e3fc4e2a6k8e15k5e3a3e2a5ea5cac2a2ciceacacja6egecica15e2ae2a2e2a2iga2eiaieafe3be5i2jce7cgecb3e2ceimigaca10ecimi2cbmieiaeala4x11aecax3bx181c2b5cg2blcbc2i3cjfabgaiac2ac11ac4aca6hc3e2f4efe3f3k2ec4kcekf3e3f6cah3ch2i2c2hx7cix114ex12afae2a2hcbfe2a2f2ex6af4x5fefcf2cfdechf2c3kc4f2c2x22ecfcececa8k7e15a2k3a3e7a4e2a2e2ac4aia2ea12cae2iefcje3c3acfc2ma2ia2ce2i2e2aea2ba3egcae3ie5aeie6miebcbae4gaga11ji2mcjbmjmea3la2lax12ahlcalbx3bx177c2blbgbab2ab3c2b2igb4cbcecheac15ac3a5c5f4ecfe2f3k3cfc5ekf2e4c8h3chi2h2x123ehe5f3ef3eh2a2e5ax4fcx8faf2a3x6efef4gfcf2mfefcf4ex25ec2ihce6a2k8e4ae7aea3e2a2e9a5e3a2c5ahja3ijicf2efc2a2gif4lc2ac3fea2c2a2e2ia3i3a2ea2bcice2a2e2aieae4i2eie2hcaea5eiheka10imicmhbi2jcmc3ecaiex12bxaela5x180c3b2gba2gab2abg2bab2abgafcfa2ic3fce2c3acac10fac4fcf8ef2k4c4e3cf3k3c3eke2c7h2x124h2ice2ceaf2ecf2c2efecef2x14axfgfcf2x8f3cfcfhifcfhf4cf2x27fjc6e4k10e13a2e2ae10a7e2a2ie2a2eaiei2akfe2a2iflf2a2f2aifi2a5ce2a5fie2leoeaie2ioafce2ajiei2ac3e2ca2ce4a6cbc2aea3ba3emjm2ci2c2maeai2x3ix13b3leda2x183c2acbcbl2bcba2b2gb3ga4c3ae2c3aicic3a2c12ec6fef4ef4k3e2c3ef2ck4c13h4i2x124hi2ec2e4hfeacf2ef3c2hx10ihx4fgfcf2x9kefc2fhemec4ifmgx27e3fjefec3efk2a2k5e2ae10a2e7cfe7ac2a2eiecifei2e3k2aie2celfl2ac2f4a3iafec2ei2ecia2ca2mimeie3a3eoc2icjca2e2he8cemeieg4b2c4gfchjaiachbi2bcjbmi3x19ax4ecx185c2j3b3alga3baegieia3fc6a2c3amaca2c11fc2fec4f11kc4e2fk4c16hch2cix123i2hih2fe3a2e3fcf3afcix11i2x5ajf2cf3x7fdch2ec2hghehc2fhx9f3hefx12j5fce3ce3a4k4eke14a2e13aceie2jef2c3faf2ce2ajfcf2a3c2a5ia2eacaeciciec3ifheiae2i2a6e5c2e6himi4c2i2chga2ijiciajiceia3i2hic2ej2b2icx20a2x190hcmb4g3a2celae3a3ka2c10haic14fec2fcf2ecf4c4e2f2c5f3c17h4x128ihihkf2e5fc2f4c2x14ix8af5x6cec2hfh6mhc5jx4jefe2hdhe2ax8j3b3eje2cefe3a4k6e15fe4f2e7a3jiea2ecfc3a2e4fa4ca12ca3mfcic2ia4eimge2c2e2a6eieb2a2ema3i2emjh2ic2bagigicic3jfeae2a2ofiei2gh4bix22ax188ahcjeb5a2ba2bcbfafa3kfc2a2c5acihac3ac8fec3e2f2e2cfcfc2ecfefef8c15fhca2x129ihi2aei4e2f6ax14cbix10fefef3x3cekmfc2mhxhx2je2x4aeaea2fjndjceaej6hi2febjchjcje4f3aea2k3ak2eae16dfefe3ae2a2ejae4aja2eaefcf2jfca17ic2ac3icmfia5h2e2iea5i2e4iha5h3ecah2eihahf2jciefj2fix2ef3icjh2ih2bh2x21alax188c2hc2gbiab2gbg2ca2ea6kcac7icica3c2ac3fc3fecfcef3cfcf3ce2cf2c2ef7c5f2c10ax130ah3ici2caeafefe2fcx16bix11f3ax2fx2cefcf2xcxhx4jac3acfcefjc2n2jenah2dnefcf2jelb3jbe2f2a4ea2ck3ae27ae4a2cacefc2fecef3a2efa22ka13c4a10ieiea2cea7chbahf2afa2fhifijmx3i5h3ih2i2x23agaix188cacagjgaebac2ha3eaia3c3e3c4feih2a2ca3e2a5eacea3e2fcfcf3ec3f2cecf3ef2c10fch3a3x130ch2cic3ih2e2f3ecx5fcx10gfx13ax6ce2feh2x6i2hjhecd2cac3ecajcjc2n2e2dhabdj2efjbejije3a7k4e4a8e9afe2a2eafeaecfcedfebeca7kaca26hma2hca2ca3ceaia5cac2a2keae2c5f2a4f2ea7x4ei2acxh3ch2x25agcix188c3agicgiea2gagfeaf2a3cfc3ec5i4c2ac3a6e2acea3ea2f5ac2fc4fef5c11h2dxaxax130fc3hcicece4cecfax17a2x13fix7e3c2hx5gajfj2cefcac2ae2hj2fdc2dnejefbcfa2j2dfejfef2ba2ea3k4eae4a12e2aeaea2ie9ab2jf3a32h2af2eaeiaicahbea5ihaia5fceaea3c3a3bahifa7x5axcx5hfi2x25a3ex189chcac2ibakgaca2gafafa2fac3achc3ij2ia2ca2ca4eaeace3c2efcf6cf2c2fc2ece4c9fb2ia4x93jxjx35bcihcehc2e4f3efefx31fx9ef3x7j2fhc3a4fckcdejef2cejhd2bhbabkf3daf2j5a5k5e2fc2ea7e2a4e4a2e2ie2i2e2ijcf2e2f2ea24c4a3iae2a7ie2hiea3ca7ea2ea6cfaca2ihka5x15hchfh2ix22a4x191hga2bi2a2jaga5ga4lcac3ac2jajchea2kea5fa4e3feafc2fcecf2c7fafef2c9hcha2xa2x132achcfje2i2e2f4cx31hf2x10cxkcfhx4c2h3cacec3acaj2alcfabefhae4h2efcakf3j2ajk10e2c3f2e4ae2ae2a4e6aene3cie2f4i2e2ca20f3e2cac2ac4ahfaimakapajhea9fa10eahaf2ka7x14h2ihbi2x22ia2x193kcacbi2age2a3gaga2jfc9l2a2c3ececa8e3c2fecf2c3fc2fc3a2cf5c9hciha2xax99j2x32cjhe2dif2e3cfea2x26f4ex11fxcfcx7cah3ea2edcfa2jajfce3fe2b3efefef3ea2jbjf3k10e2faf6e2ae2a2e4ae5ane4geifh2f3afica18f2a3eiai2cac5ei2aci2c2ecfca2ca4e3c2a7eaica2fda9x3mx11hid2ix20acb2x193c3aci3ea2g2ag2ac2e2c4fac4alahcec4a4caca3ef2ecf8cafcfc4f3c7fchcgica2x135hehc2afaefeh3ax22cx7f2efx12fhex9acdca2df3daefe2ae2f5b2ef2be2fedgaeifajha3k7a3f3efaf2e4a4e4a2e2ae2naeh5aifie2iea17oaela2c3aieiac3a5ceiheciaehcjbcecaoa9caea2c2eha9x2ihei2x8di2f2dx14ax3acalix194ac2a2i2a5f3ecfcfc11hbac3a7cna2cac4f5cfc2a5f7c3ecfchch3i2a3x139eae4hex11c4xc2hcac3facx7fx20kx4aeae3x2f2e4xaxfje3ae9af2age4j2fjc2k4a2e2fa5jf4e2a13ea3ehmh2c2je3fhifi2mf3a6efoaefecfa2fa2ha2iajc2a2c5ia3kchafmac2a7c2a3cfc2ef2ca5cjca4oix9hi2hi2cx14a2ca4cax194mc2a3i2bacefacicfc2fc10aheae2a8c2ac2ecf5cf4a6f2efefc2f3ch4ih2iha3x140ex12c2a2c2fcf2c2fcfc2fc2x38ex5f3x4ae13ae2ahef4j2a2bjcfef2afajfa4dacafea3e4a6fea3bh2mfi2ejeoehie2iahc2a2f2ec4f3e3abc3afci3hiai4acaigahoe2hacaba2ea8caea3fea5cai3acax12cihdcgx7ax5ag2cba4x196c3a2i2a2gihabc3af2c9gbmac2a4ea4ca2c2e2cafc6a7cef3c2fc2h10a5x139cx10c5fea2c2fca3f3c2a2x50fe4aeae8aefhfjfaeafja3fcefjcfefjaje2adafae4a4ea5feaeihi2fio2i2oe2oce2mc2f3jc4ac3bc5bakac5e2ac4i2eha3cageia6ca7cfa2c2fa7ifi2jix13icic2ix11bxc2gi2ca4x196hc2a2gai2abaiahab4acac2eca3f2c4a5cac5ec2ac4ac2a7c2e2c2fch5ihcac2a2fax141cfhxjdx3jfcf2c5a4f4afa5x25cf2c3x13c2x4f2e3fe2ae6a2e3hfa2cac2ejfa6fa3fjafafaeae2a5eaf3ef2jiei2ehi2hoi2e2oice2ceace2pca2ec6ac2d3aohcaecaec6efae2a2e2cefe2ae2c2a2cac2a4cfa8i2a2ix14hidcigx6bi3dc2a2i2cbxa2x198c4aiaga3c2icbc2bfc3ab2caca2ca6c4aic3ac7ea6ca2fkf2c3h6iha5f2ax140cic4f2a2fc2fc2fcaf2aefa2c4aca4x42cix5fefefe4ae4a2eae2fhdama2j2a3ja3f3a3ha4e2aea2e3afef4e3hahmh5ih2ai3eiceaefcfcfe2f2bfec2f6ac2o2e2ac10fe4c4efcae2ha13cac2a6c2x14idgx8i2cigaiahx2a2ex203aci3haia2c3i2bic2bcacla2fafea8c2ac2ac9aea4cafa2c5fh4ihia2e2a3x142a2i3cafcfc4nacfafce4na4ca2x51f2e2fe11a3e2a2ndaicafmafa5fa9ja3e4jfeamhe3h2abmae2aihceabef2i3e2ieae4cah2af4cf6a3e2oe2c4ac4afhe2fefc2iaehi2a4if2aiea2c6a8x17ax3cbi2xaieac3x209ac2iaia4ia3c3g2calac3f2ea7c2kc3fcaca3ea7cafa2c4hih2ih2a3e2ax143cf2ajf4ac6fc2afae5a4n2cfa2x49f2eae11a6e4fnca2efa3f2a2fa3fjbjf2ae2a2hefe5h2f2maeae2a3ece4hf2eoae2fae2pe2c4acecf2af6acefce2c3acac5aea2c2ec2ae2i2e2i2ci2hikac4aca7cx18bxax3ehc2x2cx213ikakha3hihahc3g2cgceacf2a6eacac4f2a3cka13c2fh6ia4ea2x141a2dicf4af2c3a2c3e8a7f3ax48efb3e5f3e3a6feaeaefaf3cj2ahafa3f2b2afjfe2ge8hfefha2eafe4a2c2e2h2fehi3e5ame2c2fie2amc3fcafafofce4hc8iecac3e2cjiade2f4ihia2cac2a5k2a2cx18a2b2axc2x218ai2a3gaba4ic2gc2ga3f2aea5ea2ceceaea4ca12fa3h5a2c3a3x126jx15c2fcf3efcf2acf2ecae10a8feca6x14f4x24e2b4e3f5e4a5feaf2nfh2fa2ja2eaeaf2ajaeda2e2gae7famfaeaf2a4eaea2ce4f2i2e4iec3f12e2f2ei2afe2co2efc3ec3ec4eche3f2ecfe2hea5ca7ca4cx15bx2balcxcx220gia2caga6ca2ja4cefea8fca2f2ca2caca17fea2fc4a2x142cfifa2f7heaf2eae3aece4aea6f2aca3f4ax9f2c2f2ax23ef2b4e2f4e6a5ea2f2e2fafa2jhacahnf2jadfje2a3e4ae3faeae2fca3fa6c2ehef2cieae9ae3aeae2ae2a2e5fefeoecfc2ec4ic2e2fcec3lege2l2a3hicaca5fa5cx17eacx223jhla4ba3gca2gaea4f2cna3naf2cecfe3a2c4a19fc2a4x143cefacf6ca3cfe4a2eac2e6a4f2af5bf2a2x9f4c2f2a2x19af5be4af2e6a9f2enanf2a2fa3na2jajc2e2a8fmaje5fcakn2a7c2fhehc2ag2fifafiefe6kae7ie4afoe2ic2ec2eic2ie2ac6f4e4alacf2ica3ca8x16bacx224amax3a2gc6lc3a4fa7fa3ce2faca19eaef2a5x143cfachfcfhcfac4a2e2ae2a3ecefe2ca7f8e3a2x7f14ax5ka3nx3aef4eb2e2f4e6a10fe2f2afa4fa5fja3da2na4ea4e5fea2n2a7c2fh2efcecg3acg2eiefkgcfefeiaeae5c3de4dfic3ec2emac5e2c3fe2hc2ecafh2ihia5eka3x16cx227jhax3a3eijc2lc5aca3eaf6chf2aca21cfafa5x143c3h4cfcef2c2acae3a5e3aea9fef2e2f2e8ax3f18a10e2af3e2nebef4a2e5a2n2a4fe4nfhadfa3hfafa3ea8ea3e2a2eafea2n2a9cf2h3ba3ig4cg2fig2iaf3ke7ie2haieficfc3fef2a2c4eaec2fe3fea6hihc2ae2ca4x245cjlx3ia2c2bcjl2c2agac2a5f9ca13kax3ax3a3fafca2x144ah4acaf3c3a10e5a9f3e15a3f15nf3af2af2a2fafafa2f2ae2fef4e8a7f4efaea2jea4f2a2e2a5e3a2iaefef2aea2na12c2bhceh2adefg6ig3echic3i2pc2pieiececjfec2if2afc3ae3cefe2fefa6chicaefc2egaxaxex244ji2x3li2cigjb3l2jcafbaef10ca5ka2xa3kaka2x7ax3fa3kx142ah3cada2f2acacea8e4a9cf4e6f3e8a8f2nf5nafaf3af2efefcaf2c2ea5f4e7a5x4f5aka4ja2eafa2ejn3a4ia2eadae2f2ca16ch3eh4a2ceg2ig2eig3i3egic2ah3fhmejec2fc2ehcfaec3efefle4cfa3kac3ac2lcac2gabflix245jcl2x2a3c2jb2ac2a2cfcfcf2af3a2c2a6x7a3xax12fa3x141hc3ae2a5c2a3cha4ce5a7c2fcf2e8fafe6aea12fn3f5a2f2xf3hac3aca3ea3f3e2ae3aea2x4fa3ea5eafmaja4eaea3j3a3ef2aef3a19fih6ie15aei3h3i2phi2ejfic3efefce3c2f4efcec2a2ciecfckl3bcefgfcax247cl2xla3cjl3cl3a3lja2f3a11x26fa3x125bx13c4e2a2eca10ceae9a2c2f7cfefe3f2b2e3ae2afa11f2n2f6af3aeh2xha2c2ae3a8fe3a3ea2x5a2fe2aefnjhafaja4d2ea3ea2e3fea2f2ca22cheh3ic2ace2che4ae7h3i3ciejfcfie4cec4ef4efc3la2c2l2i2a2leclgal3x246jx2aix3a3jb2l2g2cal2a3f3a4ca4kx27fa3fx127bx10f2e2a4ca13c2e8feaf3c4f2ca3fc3bf2e2be4afa11cf7a2f2chxaheh2caca3ea7f2ae3a2e2nx5f4efaf3ah2ae2ja3ema7e2fea4ka23che2h6cheae2hpe5h2cefci2hehiecfdce4cfefcef4efc2fe2fc3iceaclcg4agcgx15cx231ca2cbx4licl5cacaba4c2aca2ca2kx28a5x135c3feca19ce4c4af2ca2c2acacafc2afc4ae2b3e2a15f6afaf3hcxax2hac5a5c3a2fe3a2e4x6f5ef5da2feae4a6e2f2a30c4h4ih6fh2eh4c2a2he2hi2gcbfe6f2e2f2ef2efce2f2c2iefec3hgh3fga2x249b2ac2x3a2cj2glc3bfafa4fa2ca4x30ca2fax133c4f2ca5c2a3ch3a7cec3afa3ea3ce6ca3c2ac2feb4ea15fafaf5af2chax4h2bc6h4a2ea2e9x6f2aea3fadea6e2fea2ea3e3a6e3a2fa5ea17c2h8fheh2ehca3e3dh2iecble2jfe2fe2fef2efe3if3eicfcecehici2hjibx253bl2x3a2jilbl2fca4f6eka3x31af3x133c2eaf3af2cfch7a7chc3af2aeaea2ea3e3aea5c3f2eb2a13ca4cfa2f8h2x4h3ac4bh2ah2caeafae8x7f2af2x2fef2d3e5a3e3de2a6e2ia9hea17c2hca3ha9c2feceh3c2fae5fefef5lf2e2fe2cefc2ac2h2eicjigx16cx238b2x4a2ljl3cfa3fnfac2fc3a2kx30af3x5fx125cecfaefh13ch2aca5cae2ae2f2ahce6c2a3c6a2f2b2a11c3a4f3a2faf4achx5h3ah2cbh5c2a2fea2e4aex10nx3f4efaf3e5ae2a2fa6c2ea4eh4eaca27ha2hc2ef2a2ch2ic2fc2ie3b2ef5ef2c2fcfece3i2c3i3hjgx16ex240bax3a3c2l2cla2fa4c2afc2a3x31af2x131e2a3fh9ch2ch5a6e5cefcah2c3efc2aefc2a4f5b2fa9cf2a7f4cf4a2h2x4aha2hb3h6cef3a2e5ax2ex9fx2a2fa2f2aea2e6ade2a6ea3eaih2eaec2i2a22h5ac2e2hehcedhicefecie3fe3f7c2fcfcefcecac5fjigx257acx5ajl6caf2a3f2ec3ax33fx8fx122ce2af2h15d2h2a7e2feca4b2ha2bc4f2ca5fcf2aca2f2a7f2a5cac2ac2af4c2h2cx4abhab3h7ca3f3ae3a2e2x7a2fx8a4k2x6aea11ih3ea2e2ci4a18ca2ehe2c4hc2hcah3fc2ec2fe4f2ef5ic2f3eife2icici2egjgix256hac2x5ac2l2cagcac4fce2fcax38f2x125e3a2h14c6a7cae2ca8h3c3fea6c2f2ca19c5ec2f4ac2h2x4ah3ahah5eha2ef2efa2e2a2e2x6a3fx21a11e2h2c3a2b2i4c2ec5a3ih3ba2ca5c3e2acbdadih2fic3e2aef2efe4f5ef3e2fe2chc2i3eix4cax6ax246ac2x5abjl3bc4aca2e3cax39fx124e5h14ca2ca2c2a9ca13hcf2a6cfc2a5cac3a6c2ac2a2cac3f4c3h3x4aeh2bh10aefa10ex2axa4fax21a6na3iefheb7cbe3ch2ch9a5ca2c4ecacbea4ifeice4f3ce3f7c2fcmfe4ic2i3x5c2x256acx5ajl4c2a5cf2e2ax39fx123e3aeh3ceheh5dc2ac4a3ca6ha15h2cfca3c6a3c2b2ca7cfcaceaca2caf5cfhah2x6ah2bh6ah3af4aea5nea6cf2a2x20aca8hf2b9e2cbc5hc2h2chca7c5fec2a2e2ie2jhiceheca2f3e2cefefac3i2ei3ac3gi2x5achx257cx6al6a5cf2efx164eh2fh4cfaeh3dc2acf2dfac4a14ba7c4facacf2chbc4bc4a6fea2caca5fcfhckch2chx6ahb2hbh8eaf2eaena4na7c2fcf2cx19ebca7h2b6cb2eab2cbc3hah5a9c4fecache5fcec3ehfe3fefefc2afaci3cachic2ia2x6acex265agl4ala2fcafeax28f3af4ax10fx115ch6chae3h3acac3f5c7a8b2a6c2hahcfc5fch4c5a8fhfaea8c3kc2h4ax6ab2abh8ef3eaea13c2f5ex20axbca4h2b6a2cb6c2h8a7ka2kcefecacie4f2j2ec2e2fhemf5ec4aijfi2a2ecx10acx267al4gla2fca2cex27fax3a2fbjfax8fx114ch3fh6a4c6acf2af3cfca2ea2f2a8ca5cahc2f3cafc2h6c2a9haec2a6c7h4afx5ahba2h2ah5afafe3a13ec5af2x18ab5a4ib4iahc2bh4e2hch4i2a9xac2efea4e4fc2iece3fe2f3e2c3i7e2ixlx12cx267al3clclag2cfcacx29fx5f4ax121ch5a2h2a10c2fc4fc2fcf2ef3ca9ca3ca4hf2af3c3hch2c2fa8fa2hea7c2a2c3h6ax4hbhaefbhahahafafea16nec4a2x20bfb3xab12h3je5ci2biha3x2ax5c2efe2achfe3fhfehec2ehe2fefe2c2eca2iei3x285bjlblcb2cgf2eacx15af5cx16fm2fax118c2h3ah2a2cfa8c4a3cfcf3eaf2ca9fc2a2ea5caf5c2b4ceca11fca7h4ah9x4ah2a2hbhah3af2aea14na2e4cax22fb3xa2b2a3b2a2b2h2i2e2i2eh2iaha2x10c3fec3ie5f3ce2c2ebf3a2e2x5bx186bx101alb4lg2acbefc3x13f7x17a4fx118ach3a2h2ca23f2ca10c2f3e2a5cf7c2b3efa14ca5h2a3fhahaha2h2x5ah3b2h4eaf2ea14nana3e2fx24ax4b13aije2ih5a4x11c2e2ac2ie3f2i3ce2c2e5a3x5abx187bx100ilblk2ab2agcajbclx13f6x20f5bfx115a2ha2h2ca22f3ca8ca3cfh3a6cf5cac3hbea11c2ea10h2a2h3a3h2x6ah6aeafa20e4cxfx27b13ehih2i3hih2a3x12caefac2ae2af2i2gc2ec2ehef2eax195bjx99aiaj2b4cjgjbgflbx12af5x15fx12efeafhx108a4hac2fafa19fc3a5c2aeaca2eh3a6fafc2a4c3b2a10c2a7eah2a5fa2h5ax6ah6eafa19e5x30b12e2h2ihi2h2aia3x15e3c2ae2f2eiegcec3fe2i2ax6b3ix186bx101filflb2g2fagl2alcax10a2fa2fax29aecb2a2hx105a4cha3fa18ca3hca5c5acach2ja6fa3c2a2c4e2ca7e3ca7ca3c2a2ha3hah3ax7ah5e2a18e7x31b10h2e2h2c3h5x17e3c2ahefhehe4c2ei3f2ax5ai3x291cfegljf2c3ef2c2ax8af6ax30e4bf3x105a8c2a18ca3ca4c6a2cechjha13c3e3c3a6c2a8ca3c3ah3a2h5x7ah5e2fa17e6x32b9h4c2h4ah3x18eafc3iefh2afgaec2eie3iax5i4x292ih2glfhf2clececa2bxa6faf2afx19aefex5e6xax2fx3iblx99aca3hac3a4ha16c3a3c4fcac2fch2cha6fa5c4e4c2aca4ea5ha7ca2haha3h3a3x6bh5a12na2neae6x33b9h5ceh6x21ea2caheh2ecae2ceae2afi2x7ix21ae3x272igc2feic2hc2a2c3acafaf4ax21ax24lx97ca3ca2fca22c3a2c3f2cfc5hjhfa12c8afc7a4h7ac3bachca2h3bh2x7h5a11nf4e2ae3x35b8abh4e2h5x22ea2caci2ahea2eafe4fcmfx28e3x274ihehec3h3if3c2f3af2afx145cacah3c2a23c2hc8fcfc2h2fa12c3acaca3cfec3ea9hac5a2ca2ha2h5ax7hicha7f4n2faf2e4hx35ab7ei2h5chax24ea5cai2a2e2ae6f2eax27ie3x275aih2ilal2fi3f9hx144a6h3ach3a4ca6ka5hac9a2f9a2ca18h4c2a7ca3ca4cac2aca4h5x5axaheh2a6f3nf5nex40b6ih5ch2a3x24a7ie2a2eae7ce2fax26e4x278aih2icaxai2kf3cef2ax53jex89ac5ah2caha4bahca3ca5hah2a2c7a3f7a3ca19h3c2a14c5a3ca4h4x8hgea5cf5nf2a2x42b3e2h3ihc2hia2x25ea3x3acfha3ge3ae3c2e2f2x25e3x282hix5ih2c2fa3ea4haha2x135a2c4ah2ahca6ha3ca6h4ac3a2c5af7a13ca9h4ca4ca2chahcha2c3a6ha5hbx6a2cea7f5cnfx43hbh4ihiech2ax34a2eha3beae3ae4jbeix23de2x291alhidhafhbeaheaha3x119b2x12c2ac5ah4b2ha3ha2ca3hkh9c8a31h3a2hcacab2aca2chac2aca8h4bhx6a2bah2a3f7cfx45h4kh3ehihx35ief3a2ba2e3a2eabe2d2ax22daex292agb2ghelblc2faha2fx132c10h4ba7ha4hba2ch6cac8a3ca26h2ah3ca6h2ghaca9bcah3bahnx5ahgih2iaf4ax49ih4ih2e2h2x36ifca3fe9beidihx24cx293a3g3l4hchegjfax132c9h3b3h7a4hc2h8cac7a7hfa5k2a13h7bhcha3ca2h2a10cba2h4bhacfx3aib2h4caeax51h5ih5x36e2fa4e3a4e2ch2ihix23ae3ix294j4gbi2hg2fax134c8h4b2h6a4hc3h8cac11a2haja6ka13h3ch3ba2ca3h2aha6ha4c2a2bch2f2cbfbxbab2ah2baex54h5ih5ax35aeha4fa4jaeaceba2iax23ixexgecx293aj2ag4f3x44bx88cac7h9bha5hc2h10c10a6ja6k4a8cah7bha4ca2hah2a4h2a4cba2b2chfabab2xagha2x58ahih2ihih2a2x36ie2x2e2fa7ce3aiax22eax3e2x297g6f2x133ac7h10ah20c7h5a10k2a9cacah8a6ha3h2a4ha5b6ca2b5xa3x60h7di2ax24ex11ieax2a2eja5ceibeba2x23ex303gkg3jfx23f2x109a2cfc3bh3bhbh24c6h7a17c2a2c2h2ch6aha4h4ah3a2h2a4b7ab7x63i2h3i2hi2x37ae2x5c2a3ba4g2ex24ex3e2xe2x296fk2g2jx22cex2ax6ex101f5ch3bh29c2h10a2c2a13h2c3a3h3ah2a7h7a2h3ah3b7a3b3x15a2x48ih2i4hax25ex10iaeax6c2iac2ba2ebex22ex9ex297ekg2x20hc3x3a2efx15cx88f6ch2bh30c2h10ihc5a9cihca6h4a8h7a2h4ah2b8abkb2ax10jaf3x50h4ihcax36ieix7ca7be2ax26e2xexe2x298lagax16a3hme2a2e5x11cx2hx92f4bh14bh18ch8ih3c3bh3aca5cac2a18ch5a4h3ah2b9nb3a2x3fa2fa2faf2ax50ih5cax36e2fx7c2a6bex30gx2ex298baj2cx16afcmajaxaeaca2hae2akx2e3ax2ex93cf2hbh34ch9c4h5ca5c4a9ha12h2a5hbh5cfb5na3caja3f2a2f3a2fx50h3i2hax37e2x11a5x24ex7e2xex299axfjfx15ca6x2efc2fh2ce6a5x96ch35c3h5ih2c3bch5ca4c2a7chaha2h2a17bh2bhcf2b4ab3foc2faf2a2faf5x51i3cax2ax36ex12a3x24dx7ex2ex303fmgex4bib2x4fa2ckia2x2ehea3cae3ac2a7x94ah23c2h10kc3h4i2hc7h2c3ac3aca5ch4ah5a14hb2hb3cb6f2hfc5f2a2f6x52i2ha2x2a2x23ex11ea2x10a2x24dx9gx4ex301bjig5x2egx2ca5gea2h2ca8e2ca8x95h23ckh11ca2ch4c4h5ch2c3ac2a4h2ch12a13hbh2b2abab4fhf4c5f2a4f3x52ah2x4ahx34e2aix10ax24cx14e2x304gj2x4cebc3a2maceac2a11eca3h3ia2cx93ah6bh13kc4kh12c2ac3kch2bh7c4a6c5h11a12hb3hb3ab2f8c4fa3f4x54h2x3ah2ix34aeiax45egege3x304gjex3bgfafcahlahecfa14hih3i3hc2x93h23c2kh12kc2a2ch6bh8a5h3c4h11a12h2b6ab3f7c7af3ax60h3x34faix44eageg2e3x305jx5ba2h2ilmach2a11iai2h2ihi3h4cx93ah21c2kh4ch7c5h6b2hbh15c4h10a11h2b10h3f4nfc5afa2ox61h3ix35a2x33ax9ex3a2gxix312fah2mhlce3a11ig2iai2bi2h6cx93kh22kh2ca3c2hc3ac4h9ch2ih14ch6ah6a9h2b2hb7f9nc3a5x62h4x36e2ax30eax13ea2xdx312hahlmhce4a8ci5hgc4i2h5c2x94h23ax6a5c3h3b2h37a10b6ab2f5nf3nf2c3a5x48fx13h3x36a2feax28ae2x13de2x314famlmce5a5c4i2gi3gcgc4b2h2c10x88h21ax8a4c2hc2hb2h9a2h29a7bhb2fbfbf6n2f2nf2c2a6x103h3ix27e5x13ex314hambflece2a6c2ai3a2i4g2c3hcbgc7hichihx86h9c4h5x12a4c2hb2h12a2h29a6ha3f2af3af3n2fn3f2ca5x93fja2x7hihfhx25e7axdx324fablmcae2a4c6i3ag2igeg2cbc3bhg2ch4ki2h4x87h4x24a7bh11a4h30ahaba7ba3f2af2nbnf2afca4x95aeje2x5aihfh2x22ace5x329fcbhmceha2c9i2ai5gcg2ji2j2g2ch2i2h3i4h2x121bah11a3h34ba2ba2ba5f4ndaf3aca4x96e4ax4ah2fihx21ae5cax17cx312hdme2fa2c7a3hghi2g2ic2ej2hc2ac2h3gh4i2hi3ax119bxah12a3h34a2bkabjahafaf2c3faf3ca3x98aeha2x4higcax9ax10ece5a2x329fhamcfeac6ah5m2i4gh4ihcach11dih2icx122h13a6h2a6h22ba2kbnj2aha2c2fcf5aca2x100fefj2x4ifcax5dx13e2cece3ax329ahehlafac3aca2h2ah2i3a2i3h5c2h8gh4i2h2i2x122h12a15h15ah7a3bjnj2a3cf2cf2c2fa3x98ex3aj3ax3h2fix5ix10a2e2c3e3jeax327afhbhbhecac3fa3h4i5gi3h4ih8ihi10ax121h13a16h14ah7ab2hj3a3fc2fc2fa3x104aij3ax3hfihx14a2c3becje3c2x19c2x305a2bcl2heacac4fch6ia2ei4h4ah3i3hi8hi4cax119fh12a18h12kh4khjh2bh2a7c2fc2a3x107ejha3x3aix11ax2ae4ceje5cx13ax5jx306almlmlaea2c4ac3i2a2i6ei4a4ihjgi6ji2h3i2hcax119h13a17h12kh3a2h2jh2jh3a6cac2a2x106ax3ja3eaex13heca2ce5iejc2e2fx5ax6jx5cex303c2jflme3ac4fac2fah2a2ih3i5ca5i2ji2ji5di2h2ihc2ax119fh10a20h9n2h4ah5aj2h2jha4c2a3x108ex2eh2e3aexe3x7j2e2ac2a2e5ce2cax4ahb2eibe2x6cx304clclha2ce2ac2afcacfhi2a2h3ai3ca7i8jijih3i2hca3x118fh10a6ka14ch19j3hj2ha4c3ax112afh2a2eaeax10ajec2ajajc4ea2cx20cxdx279b2x20bel2jec4e2ac3hc2aha6i2a2ia7hi2ji2j2ci5amic2a6x116cfh8a6ka17h6kh4k4jkj5h3a4cafx115jhe3a2x2ex8a2himc3ac3eca2cx9fx9ejx4f2hx274bxbxbx17cejl2ecacae2ac7aca5ia10h3c3ijiji5hc3a8c2x111c3fh7a25h5nh4k5jhj2aj2ha6cex116aihe2a2x11a3i3hc3e2c5x4bx3fx2dx7fjcx3fx2h2eifx3ex286e2aj2hc5eae2c2ac2a20iki2jic6ic4a9c4ax109c2fh7a24h3ch2bh3ahk4h2j5ha8x113lx3jce2he2ax11j3i2a2c4ec2x5eixed2xfx15ac3e2x290ec2ijhc5ea2eac2ac5a14c2hijic10a4ca5c8ax108ch8a8ka15h6kh4k4h5kjh3a6x115lx2aj2e2ae2x2ax8ai2j3cacacjax6i2ceax5cfx9fx3a2f2ax2fbfa3x281eac3hcac2e3ae2c2ecac3a14c6a2c2a3kacac13hic2ax108ch8a4ca19h2chb2h5k5h3ajha2ha5x117hx2j2eae2a2x10eic3a2c2a2c2x5ejiedax17ex3axax5af2c2dax279c2lc3ae14aca15cac2ac2a3c2ac2a3c5ac3a2c4a6x104ch7a4c2a18chc2h15jahj2ha2cx123j2e4a4x2i2x3a2ca2caca3cex4eijaxd2x20exacex3af3af3cfax18ax258j2hfce2a3e3a2eae2c2a25c3acacac2h3c4acac3kaia4ch3cax99h8a3ca3c2a3ca2ca7ch5ah7ah2c2a2j3hahcx123ej2e2aea2x12a2xa3cecx5j2axcedx7ehxhxh2fex4fc2e2xbcba6f2h2ax18fx254cicihfea6e2ae2a2ec3a21c2ac6ehih2ih3c9ac7h2ihix99ah6a5c14a3c2h5kh3aha2ha2khkhah3acfx124aje4aex17afxcx6aexfcex8hx7hx4cxf2cichc6dcha5x269ec2icicea7eae4a23kc6eicgh7iac2a5c7ec3ih3cx99ah6a3c16a3c3hahkh2a5h2ah2jh3ah2cx126j3e3ax27jex2cf2x24afc5hchc2ha7x13fxgx251e2achme2a8e2ac6a19kc2eig2ih4ih4ih2c3a5c4ae2c2hihihicx99ah5c2ac5ac10acac3hahkha4h3ah5c2h3x129j3eax27ebx2exex17dx9a6c2hede2da3fxbx10afx253cahcfce3a6ec9a18c2igi4chih9acaca3c6ec3h3ihae2ae2x95c2h5a6cac3hc10h3cak2h2ah12ah2xax128j3bx27jex4fx30a5cef2ef2efa2x10f2x254ea2iae2ae3a4eac3ac3a18c4hi2cich2ih2ih6cac2ecec5e2aci2h9ax94a2h5c2a3c2a2c4hc4hc3a2hch2kh3a2h4cah6cx133jx6jxax44fx3ex7a7fafb2e2f2x4bfg2f2x6bx248a3jehfce2a4e2ac2ac2aca18c3a2i3g2cihlch2bhi2h2ecbcbc2ece3c3h3eah4ihcx95cfh3c6a2c6h4ch3chah2ch7ah4ah2ah3a2x133jea3x51fcx7a8fbfbefhf3x4fax9fx249afjf3ce6c5a19cajc5i3cihihl3hmih3ceb3c3e3c6hmh2aihih3x95ch4c5a6h2ch2ch2cah3ah4k2h9ah3ahfa2x131aej5x4ja2x44cx8a8bf3ef3hax16bxbx247ie2ie4ae3ca2c3ac2a15hac6i5h2i2cljimidhcebcbeae4ae2c2iafech2i2hicx96h4c4aca5cah7ach8kh8ahah4ca2x134ej6fe2c2ax17fx34a9f2af3hx20bx246aiecjae2a2e2cac3ac7a9i2a3jc2e2ci4gh2l3cihihahe9ca2c2ihahch5i3x96h5c6a7h7ch11ah8ah2ca3x137fx2ajaj4a3x23gjx8fx13a13xaf2h2x18fx3ex244ejfh2ecea2ecac3ac6ac3a7c2i2ajc2ec3i3h2lhcihi2haheae7cac3ih9i3x97h4c2acaca7h5a2chnh7kh2a2h2a4ch2ac2ax143ajfja3j2xjx2jx10aj3x6fx18a3x2a7x5af2ex18f2x3fx242ejifhae3a2fac12ha8c3i2cec8h2lhl2hmh3iec2e6a3h3i2h3e2h2ihix97ch4chcaha8ha4chnchn2khkh7a5chc3hfx153ej2ajx3j5x5h2cax27a6x6f2dax24ex241ie2h2ce2a2ec13h3jma2h2ai7j3c4ih3ch2ch4c3e6chih3ih3fh6x97cafh4c3ha8ha5h4ankh6ah2bh2ach2c2h2fx169h3x33a2x8mhda2xax4fx13bx2bx240ajih2e2feae2c3ac9a4h4ai13jihc2hclhah2ic2ec5a3iakhih3ef2h2cx99c2h4c5aca5h4a2h2a3n2h6ah3kha2hc3h2nfx158efcx6jh2x45mfdefxhx17ebmx242ejfemefe6aec7e3h8i3hci3ci2aidjh2a2h3a2hi2cec5a4fe2fch2e2aha2x99fch3a4ca7hah2ahcaha2hnh11khahac2ah2ac2x159cx6hx36ax13af2x22fx240aefemefea2e2ae2c7e3cacbh4ih4ihc4aj3a5ha3h2c2ec4h3a3e2ch3echfx101ch2ahca13hah2akh2nhnh2ahah3ch2kcaha2cah2acax165hx37ax39ex240ajefi2e2ae3ae3c2ec2e3a2h2chch2c2h2i4ac3a8ca2h4ac4a4c2eca3hachax102h7a5ca6hahah8a3h3ch2kha2c2a2h3c2x181axex19a2x20hx259ijfi2ecaeae3ae2c3e5ac2h4c11a13ih4ec2fa2eahe3ah3chcx103h4a2ha12h2ah9a2h3c2h2k2ci3hihdicax5bx173a3x2a2x17a2x280djf2ic2e2c2a2e2ae9a4c7ac4a2ca7ca2h6ec6a3e2h4c2x103fh2a3caca10h13ah3c2h3khcih2ihih3ax6bx10ex163axa2c2a4xax9cacx281di2efc2mc2ea4e10i2a3hc4a2c6a6ca3h3ahifc5a2h3eh4a2x102fh4a2caca10hahah13ch4k2i2mhi3hi2ex17bx162a5c3a4x11c2hx280ajaj2fm2c4ea2e12i2a3hc2a2c4a7c2a2haiah3ec4ea2h3ciahax103fh5ahc3a12ha2h11ch6ki3h2ih5x15bxh2x160achchaca5x11ac2ax280aeijfi4ca2c3e10iei4eac2a2caca2c8a3hahi3ac4feah2ach4x103hjh3ahac3a15h3ah7ch6khmhi2h6x16hihx160ahai2a2cdaeacx10ec2ix281alj3e3fae2c2e11iei3eaia4cac9a3i2h2khcfc4eaemh7x103h5a3haca14hacha2h9i2h2kaih9x15cgihx152cbcx4a2ca2cicac2a2xax9ac2hkcx279icej2lj2ejafc2e11i6h2ca2ca2c8a3i2h2dh2afac2afe2iah2a2hmx103h4ahaha19ch5c2h2ih2ahih2kahmh2ioh3ax13ch4x150cbabc2x3c3eacaba4x12a2cia3x279idiaeaj4ae13ihi4a2hbha2chc2a2c4a3id2h3eac4feah2a2ch3x102ch3a3h2a18h9ahih3i3h2kh2ihihih2x13cehicihx149cba3ca3c2aca4baea2x11a2ehca3x42ex237ecljea2kak2fe10i6eahia2ch3ac5hachih5ecec2aeah3iah3cx102h4a23ha4h2nchck2cehdh6i2h3iax11ecbci2hxix148c3a2c3ecacaca5eaeca2x9a3ehacix43fxbx236elaejc2ak2e11h2i4a3ca2hahac5h2ch2ih4aeca2fafhahi2hic2x102ah4a24hah6c3eahc2ah4i5ax9aec3eich2ix147cxc4ac2bkbaec2ba12x7a3ehcicx45jx22gbx214haeajale13hi5e2a7c2ac6hihaih2a2cacf2h2ai2h3cx102h4a24h3ck2h8ahc2ah5ihax10checehahihx146axa2ibc5ab2cecafa7ecdca2x5a4e2c2ax45jx20jx219aia2cece14i3e2a7e2c4a2bhaih5ac2afah3ihch2cx102h5a22h4c3h10acahi3a2x11ache2h3i2hx145a6c2adcieaeca2ba10c2ea2x4a4echgicx285eaeajece21a6c6acb2h2ih2ec2ac3a2i2h2icax101h4fa2ca20b2hc4h11ca5x13bc2ih4ah2x145a6ehbdgicba16c2ja9eai2amx63fjx222lgjec2e17icea6c2a2c3ab3hih2ecekcec2ih2i2c2x103hefha3c3a6ba10b2c5h11a5x14aehi5ehax145a11eba10efa4cac2a3ea5ighbi2ax286ngj2e2ke6oe12a5c4abc4b2eheh2lea2ehi2h4cax104fhf2ha18na3ca2c3ah2bh5iafa3x15aech4ih2x145a7ea3ea12ea8fa8gegi2ciax45jx240bajgne20a7c3bcecbc5eh2lceae2ji5cax104h3jahfa2f2ab2a19h10a3x18bch3bih2x145a14ea18f2ca7c2ie2cgax286a2jejecjie7ce2c4ka5c16h3aeh5ihihcx106hbhihf2h2fa5ha7nan3a3h11a2x19e2h6ex143a16ca19ceca10b2ea2ix284a2ln3je4ce4ac6a3fa2cb3c8bcach2eai2hi2h3ihcx106hbh2fhf2hca11n6ch10ah2cax20ach6x18bx122a17ca22c2aeafe2acb2iai5gx282cagj2e4ce5a4c4a3fhab2c10jcac2ihei4h6x108ci2f2hic2ah2a5chan3anch11b2a4x18ac3i2h2gx136a7ca28c2a3fa3igea2ea3ea2cac2gemex31ex250icgcec2e2ce5a11fcab3c4ac6b3h2i3h6ax109ibi4c2h2a7ha3nkb2cah9b2a5x18aec2h4bx14bx119ab2cadicbica37hahac5ea3eca2ciex31fx249c3ljce9a10hc2b4c3acac8h8ih2ax110hahci2hf2ah4a12ch3b5c2a4fax16aec2hahihx134a4fefai2cb2a4fa3ca4ca14faf4aigaic2ac3a8camx32bdx246ac2a2j3ejaie2a12hc3b3c2ac5ecbc3hih2ih3ih2x112h2mih3fh3a14h3c2h3ca6fax15a2ec2hahmhx133a4h2afa2bada2ea17ca2ea6fa3fae2fac2a2c3a8cgx34dx245bcaigj4a2ea14fcjb2c3ac3b4ebc2aih2chihai2x113aih4ahecha13hah3b2c2bca7x16e2c2ahahbx131a3ceabca3ha2ia15fafa10fia3ca2feaece2ac4ea4jea5x277ma3nalejeaca14c2ec4a2c3b5c3ihci3x118i2h3ahec3a11bah4ch5aca5fx16e2c2h2ihax132a2eieaeda3ha6ea16ia4h3a7eafcac4ace2acaeajc2jc2x277ca2injla2cea16c9b3c7ih2ajx119a3i2ab2cbca14c4ihih2gca6x16e2ch5x132fa2i2aefaecaia2ca21c2hfaf2a9ea2c3a2c2a4eajc2ae2cx276mafc2i2jaha2ea14ece2b7c5h4x123a3ec2b2c2ba11h3ic2bicfihba7x16aehfhgihx132fac2ia2deceaea15cfca4c3aca2ca8eac6ac3aeaceaec3e3gx275mc3jnaeh3e2a15c3b6gc3i2h3x124a3ec7a6ca2h3fic5idfi2ea5x18ehahghx133a3eaiaifaea4ca4ca34c9ececj2a3bjeicxax272abilba3he3a11ca2c2ec2b8fcihi2x126aiaecec2bca10hchdic2gegefi2a3x22a3x136a2na8iacea8fa7ia3fafa11c3a3ca3c5ea2ceae2bmegixax272a2fjbnjbjea3ca5c2ac3aecbcb2ab4gbcaciax127a3hc5ea10hjfc3jc3eicmbax162anaca12ca24ca11ca4c3a3e9jececx273bgnj2gajheaea2c2a6c3ahe2cb9ac2gax127ahaec2bceca11bif3c5mi2bax160a2fa2na4i2a5fcnca7f2adia4h2a4e3a8cea3ca2caca4c5ea2bh2x272emgljbja2ha3c6a2c2a5cebcab4jb3c2hax127haiec2ec3a9jgbghjc2bc4iba2x161a4na2ia11ca10fa13ca7eacac2a2ca8ea6bjix272emigbjaha5nc10ak2a2cb12ch2x128facec4ea8feij2c4b2c2bc2eax162a3hai2a3ia7na10fa10ca2c2a5ea4c2a2ca2ca6ec2a3cehx272magcjcaia2hacac13a3bab9c3ix128a3ehabcea7f2cjkc3bc5bc3x163a3ia4ca3iaca25cae2ca4ca4ca3ca2ca9caeabc2hx271abca2heia2h2c13ac2acb5cb7i2x129afmebh2eah2a4f2jbc3bc6bc2ax164a2hibaia5ia31ca10c2a16cie2jx270m2cgeae2hahac5ac6ac2bc2ab7g5cax131acjgh2ah2ija2f2jbc7bc2bcicx165ha6iana29c3aca4ca24eigj2x270abgiaeaia5cniac8ab2c2j2cb2gbgb2g3ax133aha4ihihgec10b3cbc2x167a2cdna3n2a15ca5ea8caca4ca6ca15cegi2eax270mgigaec2a4nci2c7acab2cj3c4ac5bx134ah2a2b3ch3c9b3c3ix168a9n2a11ea17cac2a2caea16ea4ej3ieax270agija3ha4nahac7ac4jbj2bcac5ka2x134hi2c2ac3ac2bc2bc6bc5x168ca14na7f3af6a4ma2c2aca3eia8ca12jecjc2x271mij2ceaha2ca3iack2c3a2c3b4jc2ic3iak2x136ahac5bc10bcbcbc2x169a12na7f2af3af7a5ca2c3ahfea5hc3a11ec2i2chx271b2jgeca7ha3c5ac4b4ecaich2iakx138ic2bc5bc11bc2x171a4ia6nca6f13a7ga2ca9eaca3eca6cebce2cgcx271mgjca4ceia2iac6ac6b3aihc2h2akx139ac12bc7bcx172a2ha16f7ax6fea11ea4ha4cea10e4heax271b2ejca7h2a2cac3ac7b2caceh2kax141c2bc9b2c7x173ai2a5bana8f2afax12e2a2ga8eaha4eae2a6ece2ce2cx272bagjhca2na2haiac7ac4acbkech2ak2x141ac17bc2x174a2ia4ia10fx18e2a9ea3ea2ea4ea2ca2ehbc3ax273malea6ha5cac5a2ca2hac2h2ia3x141aec17x176a8na8x21ea5xe3a3eaeaea9ce3c3x273ema2bja14c5keach5agax144c14eax177a4ia13x22ea2hxa3fa3ea3ea5ca4gicec2x273lbglga11ca5c4axh3a2hihax145c4f2x186a5nhcax32amx2a2e2a6e2a9igiegcx274cacgeaia8ca7c5x3a2ehx148cx192aia3x34ax3axefa17ice2cjx273hl2gefa2ba7ca7c7x391ea16iac2eacx45ce2x226iagigb4a7c2a9c3x388a3x2e2a14icjcemx47b2x225heagbgbgba7c2a8c5ex393a14i3e2cex48jex224iaga2gb3aba4c2a5c2a2c6ex393ea5cac2ag2iheicjix49exex221aicgbaeaca2ba3c3ac7a3c4x394a6c4ec3eibeiex49bejx221h2a2g2ecb2a5c7a2c4ea2cx396eacbabcb2c2ic2e4x51a2lx2ecx216hilbg2eacac2a4c5aca2c7x398ab4exacbeax54cel3ce2x216hablaiea4fa6c4ac5ax404cx62e2kle3x218hcibjea2kfac2a4ca2cax471a2e2aeax219ahmhkb2a3cicfc4aca3x473e4ax219c2aijabhjcbja2cfc2a4x421ix53a3x219hc2lj2lh2jfj3igc2ac3acx413a2x53fx5e2cx219hc2ibcjlbajb5hcx419e2j2e2jix47i2xcheaex220c2xi3lib5abg2ax420eiad2a2x46ciaecex223cxei2e2ia2b4ag2acxcx417h2kjcd2x46afecex224cxikje2bfib3cagc2xcax418hkdjdx46ae2a2x224chxhifjaeb2c4gc2ax422hc2x45ahaea2x228i2le2a2c4g2c2x469che3a2bx225h2xi3ej2bc3f2gc2x467ch2eacax228h4i2becb2ca2c3gx466hchahcex229hlaiacecb2c3acx468hkbh4cx229hci2belcalbac2x468fhbeah3x229hi3l2bec4lc2x469abac2ax230a2ipklelegcac4x469bx235ip2h2ge2g2bc2bac2ex700lxi2h2ib4gb3g4x701i3h4e2l2bgb2cg3x702i2p2hblbl2g2c4x703i2hp2gcb2c7x704i3hpe3c3lca3x704bi2p2k2e2lalclx706bi2hpcb2c5x708i2hpkfec3lcx17c2x689ixhleae2cba2x17c3e2x686i3dfcba2c2xax17cx689bxilieca2cxc2x710idx2cxc2a2x710i2dhcx2a3c2x710i2dfexe2cec2x58e2x650i2fhkhege5xgx55dx652i2fbafx719bx7243c3x697h4x711jx715j5x710hxjxh2x714j2x5hxc2jc2ph3x703h6c3x707h3bh4c3b2c2x704h4c3jc2x707h5p2cj2x3cx704h5p3hj3x306px82hx317h5p2h2j4bx223ph8px88h3p8x10php6x22h2x7p7h2x2px52b2x257h6ph2j3x222px2h12phx63bx3p3h19p12h2x2h4p8x10h2x3p5h3x5p17h7x41b4x254h6phj3x223h4ph20x47p29h4ep26x3p11hp41h6x36b3x253h5ph2jx216h26p6h9p4x6px24p124h4ph3x34bx255h6x3cx207h6p8h10p6h6p6h2p14x17p137x244bx38h2x5h7c4x3px187p3x10h3p21hp35xpx14he2hp12h2p129xh6px263c4h2c2xh11c2px190p4x7h3p49h2p7hpx12h5p152h2p3xh2x250c2px6c2b2c2xh5ph6x156p2x33p7hi2h3p50h2p6hx7hi2h8p159h5px255c3bc3h5p4h3x127px5px6px2px7pxpx3px4p2x4px8p2x6p14h4p50h3ph6x4h4p172hip2xhx246p3x5pbc3xh5p3h3px111p2x4p2x13p15hp14x5p2x2p2x6p71h10c2x3h4p173i2p4e3phehph3x239p3c7h6p2h7x100p3x3p3x9px3p24d2p43h2p55h16p176ip2hjpe4h2e6x183h2px46pb4pxphc6xh8p5x99p15d2p2jp18h11p20h2ph3ihp16h2p61hjdh6p177i2p2hpihe14b2x173h7j2ph4x47ph2c4x2h8p4h2x97p14h4p3h19p3h9p13h13p77h9p185dihceh3e6hb2x170p2x5p2x7h5x3px4p2x19p2x20p2h5p2h2p3hx91px2p12hp3dhd2p4h3p60hp69h8p9h3p168i2hpj2pdp3e6heheb2x124b5x42p14xp10xphp5xp2x11p2xp2x3p3xpx2h2xpxp13h4xp2x88pj4c2p15d2p2h4p123h3i2h10i2hp181hcpj3p2bp2h2e3b5x126b3x4p2x36e2hp2xb4p33x3p8x2p24h5p2x79px9p21e2hp129h19p183cidpibpi2hix5b2x113b4x12p3xp5x11p3x3e3x13h3e2pb4p44h2p23jh5xpx79px10h3p7h2c2hp2h2p139h13p181ch2ci6x115ep5x12p27e2px2e4x18b5p47j2p3j2p16hp2x88p10h3j3p3j2p149h3p185ci6b2x109p2xpep2hp2bpb2p37e2p4b3p3x4p9x5p52ch2c7p9x90p359c2i5x100b2x2p3xp3xp14b2p5b3p4bp18b4p82c3p15x81p175h2p187j2c4i5x95p5xp4h2p13b8p40b3p85x81p373c5ei3x9b2x81p2xph2x4e3h2p33b2p16b2p81x9p3x80p378c6i3x78p6e3h2x2px4p2xph3e2h3p31b2p78c3p13h4p2x87p382c6i5x5b5x67p2h2e2h3p3h3pxp2e4h4e6p106e4c2p25x77p384c8e3hp2x2b8x67pex3p133e5c3p11x58p11x16p387c9ihi2b9x72p136e7p2x4p6x16p5x35p9x18p384c3d2c5h2i3b9x57p8x16p130e6p5x2p7x11p4x38p14x20p5c4p367c9i6x72p8x18p127e5c2e2p10x30p2x18p16x26p366c11i5x97p105ep28e6p9x19px10p3x12p19x27p368c8i8x97p150x24p6x11p10x2d10x15p11e3h17p350ie15x67p4x9p142h3p36x32d17x2p388c11e9x73p4x11p133e2p42x23d22p22c4p365c9e6h3i4x84p101e4p71x8p3x12d22p3h2p389c10e5h9x40px25p8x6p100h4p83x8p6d2c3d13p3e3p392h17i4h7x38px2p4x3p2x14p202h4c4p3d4c2d10p400h7e6ch18x49p209h4pch3c7p3d17p397h2c17h18x11hx38p145h3p36h11p5c3e3p430c7j7c7h24i21p3x15p86c9p90eh13p443c32h5i2c19i10e3i4x25p52i12p49h6p515c55ih13i7h18e6h32i2p70c3p35c7p472j18cp4cp32ch9i2c4h11i14p21i16c5p655h15i2h3i5p701c9i9p4246";
const GLIM_GRID = (() => { const g = new Uint8Array(720 * 360); let p = 0; GLIM_RLE.replace(/([a-px])(\d*)/g, (_, c, n) => { const k = n ? Number(n) : 1, v = c === "x" ? 0 : c.charCodeAt(0) - 96; g.fill(v, p, p + k); p += k; return ""; }); return g; })();
function glimAt(lat, lon) {
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  const r0 = clamp(Math.floor((90 - lat) / 0.5), 0, 359), c0 = ((Math.floor((lon + 180) / 0.5) % 720) + 720) % 720;
  for (let rad = 0; rad <= 2; rad++) {
    const votes = {};
    for (let dr = -rad; dr <= rad; dr++) for (let dc = -rad; dc <= rad; dc++) {
      if (Math.max(Math.abs(dr), Math.abs(dc)) !== rad) continue;
      const r = r0 + dr; if (r < 0 || r > 359) continue;
      const ch = String.fromCharCode(96 + GLIM_GRID[r * 720 + ((c0 + dc + 720) % 720)]);
      if (GLIM_CLASS[ch]) votes[ch] = (votes[ch] || 0) + 1;
    }
    const best = Object.keys(votes).sort((a, b) => votes[b] - votes[a])[0];
    if (best) return best;
  }
  return null;
}
function glimGeology(site) {
  const ch = glimAt(site.lat, site.lon); if (!ch) return null;
  const ids = GLIM_CLASS[ch].ids, counts = {}; ids.forEach((id) => { counts[id] = 1 / ids.length; });
  const vec = MINERALS.map((_, i) => Math.round(ids.reduce((a, id) => a + ROCK_CLASSES.find((rc) => rc.id === id).vec[i] / ids.length, 0)));
  return { vec, counts, labels: [GLIM_CLASS[ch].label], names: ["GLiM: " + GLIM_CLASS[ch].label], live: true, mapped: true, src: "GLiM global lithology (coarse 0.5°)", glim: null, agree: null };
}


/* ===================== 3D GLOBES (globe.gl) =====================
   Replaces the three flat Leaflet maps (Earth, Mars/Moon, and the zoom overlay) with draggable 3D globes. The data, scoring and panels are unchanged.
   A thin wrapper keeps the old method names (flyTo, invalidateSize, remove) so the rest of the app did not need to change. */
const EARTH_IMG = "https://unpkg.com/three-globe/example/img/";
const STAR_IMG = EARTH_IMG + "night-sky.png";
const ESRI = "https://services.arcgisonline.com/ArcGIS/rest/services/";
/* Tiled layers: globe.gl's tile engine fetches sharper tiles as you zoom in (needs a recent globe.gl 2.x; if missing, the Blue Marble image is used). */
const EARTH_TILES = Object.freeze({
  "tiles:esri-imagery": (x, y, l) => `${ESRI}World_Imagery/MapServer/tile/${l}/${y}/${x}`,
  "tiles:esri-topo": (x, y, l) => `${ESRI}World_Topo_Map/MapServer/tile/${l}/${y}/${x}`
});
const EARTH_DEFAULT = "Satellite (Esri, sharp when zoomed)";
const EARTH_TEX = Object.freeze({
  [EARTH_DEFAULT]: "tiles:esri-imagery",
  "Topographic map (Esri)": "tiles:esri-topo",
  "Satellite (Blue Marble)": EARTH_IMG + "earth-blue-marble.jpg",
  "Night lights": EARTH_IMG + "earth-night.jpg",
  "Dark": EARTH_IMG + "earth-dark.jpg",
  "Elevation relief (grayscale)": EARTH_IMG + "earth-topology.png"
});
const EARTH_BUMP = EARTH_IMG + "earth-topology.png";

function setBusy(on, text) { const el = $("gload"); if (!el) return; el.hidden = !on; if (on && text) el.textContent = text; }

class GlobeMap {
  constructor(id, opts = {}) {
    this.el = $(id); this.dead = false; this.clickCb = null; this.tok = 0; this.libClickAt = 0;
    this.sc = 1; this.scB = null; this.pts = []; this.labels = []; this.labelsOn = false; this.labelAlt = opts.labelAlt || 1.3;
    this.bump = opts.bump || 6; this.tuneTimers = [];
    this.g = Globe({ rendererConfig: { antialias: true, alpha: true, powerPreference: "high-performance" } })(this.el)
      .backgroundColor("#05060c").backgroundImageUrl(STAR_IMG)
      .showAtmosphere(opts.atmo !== false).atmosphereColor(opts.atmoColor || "#7aa8ff").atmosphereAltitude(0.15)
      .pointLat("lat").pointLng("lng").pointColor("color").pointAltitude("alt").pointRadius((d) => d.r * this.sc).pointLabel("label").pointResolution(20).pointsTransitionDuration(200)
      .onPointClick((p) => { this.libClickAt = Date.now(); if (p && p.onClick) p.onClick(); })
      .onGlobeClick((c) => { this.libClickAt = Date.now(); if (this.clickCb && c) this.clickCb(c.lat, c.lng); })
      .ringLat("lat").ringLng("lng").ringColor(() => (t) => `rgba(255,255,255,${1 - t})`).ringMaxRadius(1.2).ringPropagationSpeed(0.9).ringRepeatPeriod(1300)
      .labelLat("lat").labelLng("lng").labelText("name").labelSize(0.45).labelColor(() => "rgba(230,233,245,0.92)").labelIncludeDot(false).labelResolution(2).labelAltitude(0.014).labelsTransitionDuration(0)
      .polygonCapColor(() => "rgba(255,180,84,0.16)").polygonSideColor(() => "rgba(0,0,0,0)").polygonStrokeColor(() => "rgba(255,180,84,0.95)").polygonAltitude(0.003).polygonLabel((d) => d.label)
      .onPolygonClick((p, ev, c) => { this.libClickAt = Date.now(); if (this.clickCb && c) this.clickCb(c.lat, c.lng); });
    if (typeof this.g.onZoom === "function") this.g.onZoom((pov) => this.onAlt(pov.altitude));
    try {
      const r = this.g.renderer();
      r.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
      this.maxAniso = r.capabilities.getMaxAnisotropy(); this.maxTex = r.capabilities.maxTextureSize;
      const c = this.g.controls(); c.minDistance = 101; c.zoomSpeed = 0.9;
      this.g.globeMaterial().bumpScale = this.bump;
    } catch (e) { this.maxAniso = 1; this.maxTex = 4096; }
    /* Own click detector (does not depend on globe.gl's click event, which can be missed with tiles, trackpads, touch or newer builds).
       A press that moves less than 10 px and lasts under 1 s counts as a click; the point is worked out from the screen position. */
    let down = null;
    const upEl = this.el;
    upEl.addEventListener("pointerdown", (e) => { if (e.button > 0) { down = null; return; } down = { x: e.clientX, y: e.clientY, t: Date.now() }; }, true);
    upEl.addEventListener("pointerup", (e) => {
      const d = down; down = null;
      if (!d || !this.clickCb || this.dead) return;
      if (Math.hypot(e.clientX - d.x, e.clientY - d.y) > 10 || Date.now() - d.t > 1000) return;   /* a drag or a long press, not a click */
      const r = upEl.getBoundingClientRect(), x = e.clientX - r.left, y = e.clientY - r.top, t0 = Date.now() - 20;
      setTimeout(() => {
        if (this.dead || this.libClickAt >= t0) return;                                       /* globe.gl already reported this click */
        let c = null;
        try { c = typeof this.g.toGlobeCoords === "function" ? this.g.toGlobeCoords(x, y) : null; } catch (err) { c = null; }
        if (c && Number.isFinite(c.lat) && Number.isFinite(c.lng)) this.clickCb(c.lat, c.lng);
      }, 40);
    }, true);
    this.ro = typeof ResizeObserver !== "undefined" ? new ResizeObserver(() => this.fit()) : null;
    if (this.ro) this.ro.observe(this.el);
    this.fit();
  }
  fit() { const w = this.el.clientWidth, h = this.el.clientHeight; if (w > 0 && h > 0) this.g.width(w).height(h); }
  invalidateSize() { this.fit(); }
  onClick(fn) { this.clickCb = fn; }
  /* zoom-dependent detail: markers shrink when you zoom in, names appear below labelAlt, rotation slows near the surface */
  onAlt(alt) {
    if (!Number.isFinite(alt)) return;
    /* sizes are in degrees of arc, so they must shrink as the camera gets closer, or a marker would cover a whole state */
    const b = Math.round(clamp(alt / 2.4, 0.08, 1.2) * 20);
    if (b !== this.scB) {
      this.scB = b; this.sc = b / 20;
      const rr = clamp(alt * 0.5, 0.06, 1.5);
      this.g.pointRadius((d) => d.r * this.sc); this.g.pointsData(this.pts.slice());
      this.g.ringMaxRadius(rr).ringPropagationSpeed(rr / 1.2);
    }
    const lab = alt < this.labelAlt;
    if (lab !== this.labelsOn) { this.labelsOn = lab; this.g.labelsData(lab ? this.labels : []); }
    try { this.g.controls().rotateSpeed = clamp(alt * 0.5, 0.1, 1); } catch (e) { /* ignore */ }
  }
  setTexture(url, bump) {
    const g = this.g, tileFn = typeof url === "string" ? EARTH_TILES[url] : null, hasTiles = typeof g.globeTileEngineUrl === "function";
    if (tileFn) {
      g.globeImageUrl(EARTH_IMG + "earth-blue-marble.jpg"); /* shown at low zoom and whenever tiles are missing */
      if (hasTiles) { try { if (g.globeTileEngineClearCache) g.globeTileEngineClearCache(); g.globeTileEngineUrl(tileFn); } catch (e) { console.warn("Tile engine failed:", e); } }
      else console.warn("This globe.gl build has no tile engine; using the Blue Marble image.");
    } else {
      if (hasTiles) { try { g.globeTileEngineUrl(null); } catch (e) { /* ignore */ } }
      g.globeImageUrl(url);
    }
    if (bump !== undefined) g.bumpImageUrl(bump);
    this.tune();
  }
  setBump(v) { this.bump = v; try { this.g.globeMaterial().bumpScale = v; } catch (e) { /* ignore */ } }
  /* textures load asynchronously, so sharpen them (anisotropic filtering) shortly after each change */
  tune() {
    this.tuneTimers.forEach(clearTimeout);
    this.tuneTimers = [400, 1500, 4000, 10000].map((ms) => setTimeout(() => {
      if (this.dead) return;
      try { const m = this.g.globeMaterial(); m.bumpScale = this.bump; [m.map, m.bumpMap].forEach((t) => { if (t && t.anisotropy !== this.maxAniso) { t.anisotropy = this.maxAniso; t.needsUpdate = true; } }); } catch (e) { /* ignore */ }
    }, ms));
  }
  setAtmo(on, color, alt) { this.g.showAtmosphere(on); if (on) this.g.atmosphereColor(color || "#7aa8ff").atmosphereAltitude(alt || 0.15); }
  setPoints(list) { this.pts = list; this.g.pointsData(list); }
  setRings(list) { this.g.ringsData(list); }
  setLabels(list) { this.labels = list; this.g.labelsData(this.labelsOn ? list : []); }
  /* impact structures drawn as ground-level circles (list entries are [name, lat, lon, radiusKm]; tiny ones get a visible minimum) */
  setFootprints(impacts) {
    const R = 6371, D = Math.PI / 180;
    this.g.polygonsData(impacts.map(([name, lat, lon, km]) => {
      const ang = Math.max(km, 8) / R, la = lat * D, ring = [];
      for (let i = 0; i <= 48; i++) {
        const b = (i / 48) * 2 * Math.PI, la2 = Math.asin(Math.sin(la) * Math.cos(ang) + Math.cos(la) * Math.sin(ang) * Math.cos(b));
        const lo2 = lon * D + Math.atan2(Math.sin(b) * Math.sin(ang) * Math.cos(la), Math.cos(ang) - Math.sin(la) * Math.sin(la2));
        ring.push([lo2 / D, la2 / D]);
      }
      return { geometry: { type: "Polygon", coordinates: [ring] }, label: `<b>${esc(name)}</b><br>Known impact structure, about ${km} km radius` };
    }));
  }
  view(lat, lng, alt, ms = 0) { this.g.pointOfView({ lat, lng, altitude: alt }, ms); this.onAlt(alt); }
  /* same call shape as the old Leaflet flyTo([lat, lon], zoom, { duration }) */
  flyTo(ll, zoom = 4, o = {}) { this.view(ll[0], ll[1], clamp(2.5 / Math.max(1, zoom - 1), 0.25, 2.5), (o.duration || 1) * 1000); }
  remove() { this.dead = true; this.tuneTimers.forEach(clearTimeout); if (this.ro) this.ro.disconnect(); try { if (this.g._destructor) this.g._destructor(); } catch (e) { /* ignore */ } this.el.innerHTML = ""; }
}

/* ---- Mars / Moon texture: NASA Trek tiles stitched into one equirectangular image. WebGL needs CORS-enabled images, so this is checked and reported.
   Level 2 shows fast, 3 sharpens it, and 4 (8192 px wide) is used only on desktop GPUs that can hold it. The shaded-relief layer doubles as a bump map. ---- */
const texCache = {};
function placeholderTexture(p) {
  const cv = document.createElement("canvas"); cv.width = 1024; cv.height = 512; const cx = cv.getContext("2d"), col = PLANETS[p].color;
  cx.fillStyle = "#14161f"; cx.fillRect(0, 0, 1024, 512); cx.globalAlpha = 0.18; cx.fillStyle = col; cx.fillRect(0, 0, 1024, 512); cx.globalAlpha = 0.35; cx.strokeStyle = "#E6E9F5"; cx.lineWidth = 1;
  for (let x = 0; x <= 1024; x += 1024 / 12) { cx.beginPath(); cx.moveTo(x, 0); cx.lineTo(x, 512); cx.stroke(); }
  for (let y = 0; y <= 512; y += 512 / 6) { cx.beginPath(); cx.moveTo(0, y); cx.lineTo(1024, y); cx.stroke(); }
  return cv.toDataURL("image/png");
}
async function resolveBase(layer) {
  for (const base of [layer.base, layer.base.replace("/1.0.0/default/", "/1.0.0//default/")]) { if ((await probeTile(`${base}/2/1/3.jpg`)) === "ok") return base; }
  return null;
}
function planetMaxZoom(map) {
  const coarse = window.matchMedia && window.matchMedia("(pointer:coarse)").matches, mem = navigator.deviceMemory || 8;
  return (map && map.maxTex >= 8192 && !coarse && mem >= 4) ? 4 : 3;
}
async function buildPlanetTexture(base, z, key, onProgress) {
  const ck = key + z; if (texCache[ck]) return texCache[ck];
  const n = 2 ** z, cv = document.createElement("canvas"); cv.width = 256 * 2 * n; cv.height = 256 * n; const cx = cv.getContext("2d");
  const jobs = []; for (let r = 0; r < n; r++) for (let c = 0; c < 2 * n; c++) jobs.push([r, c]);
  let ok = 0, done = 0, next = 0;
  const load = ([r, c]) => new Promise((res) => {
    const im = new Image(); im.crossOrigin = "anonymous"; const t = setTimeout(res, 15000);
    im.onload = () => { clearTimeout(t); cx.drawImage(im, c * 256, r * 256); ok++; res(); };
    im.onerror = () => { clearTimeout(t); res(); };
    im.src = `${base}/${z}/${r}/${c}.jpg`;
  });
  /* a small pool keeps the browser and NASA's server from being flooded with hundreds of simultaneous requests */
  const worker = async () => { while (next < jobs.length) { const j = jobs[next++]; await load(j); done++; if (onProgress) onProgress(done / jobs.length); } };
  await Promise.all(Array.from({ length: Math.min(10, jobs.length) }, worker));
  if (ok < jobs.length * 0.6) return null;
  const blob = await new Promise((res) => { try { cv.toBlob(res, "image/jpeg", 0.9); } catch (e) { res(null); } });
  cv.width = cv.height = 0;
  return blob ? (texCache[ck] = URL.createObjectURL(blob)) : null;
}
async function applyPlanetRelief(map, p, tok) {
  try {
    const layer = PLANET_TILES[p][1] || PLANET_TILES[p][0], base = await resolveBase(layer);
    if (!base || map.dead || tok !== map.tok) return;
    const url = await buildPlanetTexture(base, 3, p + layer.label);
    if (!url || map.dead || tok !== map.tok) return;
    map.setBump(3.5); map.g.bumpImageUrl(url); map.tune();
  } catch (e) { console.warn("Relief layer failed:", e); }
}
async function setPlanetTexture(map, p, idx) {
  const layer = PLANET_TILES[p][idx] || PLANET_TILES[p][0], tok = ++map.tok, name = PLANETS[p].label;
  map.setTexture(placeholderTexture(p), null);
  map.setAtmo(p === "MARS", "#d9a07a", 0.05); /* Mars has a thin dusty haze; the Moon has none */
  setBusy(true, `Loading ${name} imagery...`);
  try {
    const base = await resolveBase(layer);
    if (map.dead || tok !== map.tok) return;
    if (!base) { notify(`NASA ${name} tiles did not respond, so the globe shows a plain surface. Coordinates and matching still work.`); return; }
    const zmax = Math.min(planetMaxZoom(map), Math.max(...layer.zooms));
    for (const z of [2, 3, 4].filter((q) => q <= zmax)) {
      const url = await buildPlanetTexture(base, z, p + layer.label, (f) => { if (tok === map.tok) setBusy(true, `Sharpening ${name} imagery (level ${z}) ${Math.round(f * 100)}%`); });
      if (map.dead || tok !== map.tok) return;
      if (!url) { if (z === 2) notify(`The browser blocked NASA ${name} tiles as a 3D texture (CORS) or they failed to load. The globe shows a plain surface; the panel images still work.`); return; }
      map.setTexture(url);
      if (z === 3) applyPlanetRelief(map, p, tok);
    }
  } finally { if (tok === map.tok) setBusy(false); }
}

/* Your own downloaded maps: drop equirectangular (2:1, whole-world) images into the maps/ folder with these names and they appear in the Imagery
   menu automatically (and are used first). The optional "bump" file is a grayscale height map in the same projection. Or use the "Load my map" button. */
const LOCAL_MAPS = Object.freeze({
  EARTH: [{ label: "My Earth map (maps/earth.jpg)", file: "maps/earth.jpg", bump: "maps/earth_height.jpg" }],
  MARS: [{ label: "My Mars map (maps/mars.jpg)", file: "maps/mars.jpg", bump: "maps/mars_height.jpg" }],
  MOON: [{ label: "My Moon map (maps/moon.jpg)", file: "maps/moon.jpg", bump: "maps/moon_height.jpg" }]
});
const localOk = {};
function probeImage(url, ms = 10000) {
  return new Promise((res) => { const im = new Image(), t = setTimeout(() => res(false), ms); im.onload = () => { clearTimeout(t); res(true); }; im.onerror = () => { clearTimeout(t); res(false); }; im.src = url; });
}
async function probeLocalMaps() {
  const files = []; Object.values(LOCAL_MAPS).forEach((l) => l.forEach((m) => { files.push(m.file); if (m.bump) files.push(m.bump); }));
  await Promise.all(files.map(async (f) => { localOk[f] = await probeImage(f); }));
}
function texEntries(v) {
  const list = v === "EARTH" ? Object.keys(EARTH_TEX).map((n) => ({ label: n, earth: n })) : PLANET_TILES[v].map((l, i) => ({ label: l.label, tile: i }));
  (LOCAL_MAPS[v] || []).forEach((m) => { if (localOk[m.file]) list.push({ label: m.label, local: m }); });
  const cu = state.customTex && state.customTex[v]; if (cu) list.push({ label: cu.label, custom: cu.url });
  return list;
}
const localIndex = (v) => texEntries(v).findIndex((e) => e.local);
function applyTexEntry(v, e) {
  const m = v === "EARTH" ? state.map : state.pmap; if (!m) return;
  if (e.earth) { m.setTexture(EARTH_TEX[e.earth]); return; }
  if (e.tile !== undefined) { setPlanetTexture(m, v, e.tile); return; }
  const url = e.custom || e.local.file, bump = e.local && e.local.bump && localOk[e.local.bump] ? e.local.bump : undefined;
  m.tok++; setBusy(false); /* cancels any NASA tile build still running for this globe */
  if (v === "EARTH") m.setTexture(url, bump);
  else { m.setTexture(url, bump === undefined ? null : bump); m.setAtmo(v === "MARS", "#d9a07a", 0.05); }
}
function populateTexSel() {
  const sel = $("texSel"), v = state.view; if (!sel) return;
  const list = texEntries(v); state.texPick = state.texPick || {};
  sel.innerHTML = list.map((e, i) => `<option value="${i}">${esc(e.label)}</option>`).join("");
  sel.value = String(Math.min(state.texPick[v] || 0, list.length - 1));
  sel.onchange = () => { const i = Number(sel.value); state.texPick[v] = i; applyTexEntry(v, list[i]); };
}
/* a picture from the user's computer: shrunk if the GPU cannot hold it, and checked for the 2:1 shape a globe needs */
async function loadCustomMap(file) {
  const v = state.view, m = v === "EARTH" ? state.map : state.pmap; if (!m || !file) return;
  setBusy(true, "Preparing your map...");
  try {
    const bmp = await createImageBitmap(file), ratio = bmp.width / bmp.height, maxW = Math.min(m.maxTex || 4096, 16384);
    if (Math.abs(ratio - 2) > 0.08) notify(`That image is ${bmp.width}x${bmp.height} (${ratio.toFixed(2)}:1). A globe needs an equirectangular map of the whole world, exactly 2:1 (for example 8192x4096). Other shapes will look stretched or misplaced.`);
    let url;
    if (bmp.width <= maxW) url = URL.createObjectURL(file);
    else {
      const cv = document.createElement("canvas"); cv.width = maxW; cv.height = Math.round(bmp.height * (maxW / bmp.width));
      cv.getContext("2d").drawImage(bmp, 0, 0, cv.width, cv.height);
      const blob = await new Promise((res) => cv.toBlob(res, "image/jpeg", 0.92)); cv.width = cv.height = 0;
      if (!blob) throw new Error("resize failed");
      url = URL.createObjectURL(blob);
    }
    if (bmp.close) bmp.close();
    state.customTex = state.customTex || {}; state.customTex[v] = { label: "My map: " + file.name.slice(0, 26), url };
    state.texPick = state.texPick || {}; state.texPick[v] = texEntries(v).length - 1;
    populateTexSel(); applyTexEntry(v, { custom: url });
  } catch (e) { console.warn("Custom map failed:", e); notify("Could not read that image. Use a JPG, PNG or WebP world map, 2:1 shape.", "err"); }
  finally { setBusy(false); }
}

function initPlanetMap() {
  if (state.pmap || typeof Globe === "undefined") return;
  state.pmap = new GlobeMap("pmap", { atmo: false, bump: 3.5, labelAlt: 1.3 });
  state.pmap.onClick((lat, lng) => pickPlanetPoint(lat, lng));
}

function setPlanetLayers() {
  const m = state.pmap, p = state.mode;
  if (!m) { notify("The 3D globe failed to load, so the planetary globe is unavailable.", "err"); return; }
  state.pMark = null;
  state.pRefs = REFERENCE_SITES[p].map((r) => ({ lat: r.lat, lng: r.lon, color: "#E6E9F5", r: 0.38, alt: 0.01, label: esc(r.name), name: r.name, onClick: () => pickPlanetPoint(r.lat, r.lon) }));
  const li = localIndex(p); state.texPick = state.texPick || {}; state.texPick[p] = li >= 0 ? li : 0;
  populateTexSel();
  m.setLabels(state.pRefs);
  if (li >= 0) applyTexEntry(p, texEntries(p)[li]); else setPlanetTexture(m, p, 0);
  m.view(0, 0, 2.4, 0);
  if (state.pt && state.pt.p === p) drawPlanetMarker(); else { m.setPoints(state.pRefs); m.setRings([]); }
}

function drawPlanetMarker() {
  const m = state.pmap, pt = state.pt; if (!m || !pt) return;
  state.pMark = { lat: pt.lat, lng: pt.lon, color: PLANETS[pt.p].color, r: 0.7, alt: 0.03, label: `${fmtLat(pt.lat)}, ${fmtLon(pt.lon)}`, onClick: null };
  m.setPoints([...(state.pRefs || []), state.pMark]); m.setRings([state.pMark]);
  m.view(pt.lat, pt.lon, Math.min(1.8, Math.max(0.9, (m.g.pointOfView().altitude || 1.8))), 900);
}


/* ===================== WHAT IS THIS SITE GOOD FOR? (computed, not a canned list) =====================
   Each purpose is defined once by REQUIREMENTS on data the app already collects: slope, elevation, temperature, aridity, mapped rock shares, age of the
   youngest mapped volcanic unit, distance to known impact structures, plus the target world's own terrain, rock profile, temperature and slope.
   A site's list is whatever the numbers support: each requirement is scored 0-1, the purpose fit is the weighted average of the requirements that have data,
   and only purposes with enough data and a fit of at least 55% are shown. Nothing is written per site. */
const ramp = (x, a, b) => clamp((x - a) / (b - a), 0, 1);                      /* 0 at a, 1 at b (works for a > b too) */
const band = (x, lo, hi, soft) => (x < lo ? 1 - clamp((lo - x) / soft, 0, 1) : x > hi ? 1 - clamp((x - hi) / soft, 0, 1) : 1);
const impactNear = (s) => { let best = null; IMPACTS.forEach((i) => { const d = gc(s.lat, s.lon, i[1], i[2], 6371); if (d <= Math.max(2, i[3] * 1.2) && (!best || d < best.d)) best = { name: i[0], d }; }); return best; };

function siteFeatures(s) {
  const d = s.data; if (!d) return null;
  const g = d.g, k = (g && g.counts) || {}, tot = Object.values(k).reduce((a, b) => a + b, 0);
  const sh = (...ids) => (tot ? ids.reduce((a, id) => a + (k[id] || 0), 0) / tot : null);
  return { slope: d.t.slope, elev: d.t.elev, temp: d.c.temp, ai: d.c.ai, lat: s.lat, type: s.type, impact: impactNear(s),
    vol: sh("basalt", "ultramafic"), fines: sh("sandstone", "sediment", "mudstone"), evap: sh("evaporite"), ice: sh("ice"), young: g && Number.isFinite(g.youngVolcMa) ? g.youngVolcMa : null,
    vec: (g && g.vec) || (TYPES[s.type] || TYPES.GENERAL_LAND).minerals, prov: { geo: Boolean(g), terrain: Boolean(d.t.live || d.t.partial), climate: Boolean(d.c.live) } };
}

/* one requirement: score null means "no data for this one" */
const C = (label, score, text, src) => ({ label, score, text, src });
const PURPOSES = [
  { id: "lava", name: "Lava-tube and cave exploration", what: "Testing robots, mapping and lighting inside lava caves.",
    crit: (f, t) => [
      [2, C("Volcanic bedrock (basalt or ultramafic)", f.vol == null ? null : ramp(f.vol, 0.2, 0.6), f.vol == null ? "no mapped bedrock" : `${pct(f.vol)}% of mapped rock`, "geo")],
      [1.5, C("Young lava (tubes survive in young flows)", f.young == null ? null : 1 - ramp(f.young, 2, 30), f.young == null ? "age not available" : `youngest mapped volcanic unit about ${f.young < 0.1 ? fmt(Math.round(f.young * 1e6)) + " years" : fmt(f.young, 1) + " million years"} old`, "geo")],
      [1, C("Target has volcanic terrain", t.types.some((x) => x === "BASALTIC_PLAIN" || x === "VOLCANIC_LAVA_TUBE") ? 1 : 0.25, `target terrain: ${typeOf(t.types[0]).label}`, "tgt")]] },
  { id: "isru", name: "Regolith excavation and resource tests", what: "Digging, sintering and building with crushed rock that resembles the target's.",
    crit: (f, t) => [
      [2, C("Rock similar to the target", cosine(f.vec, t.vec), `mineral-profile similarity ${pct(cosine(f.vec, t.vec))}%`, "geo")],
      [1.5, C("Basaltic rock (common simulant feedstock)", f.vol == null ? null : ramp(f.vol, 0.15, 0.5), f.vol == null ? "no mapped bedrock" : `${pct(f.vol)}% basalt/ultramafic`, "geo")],
      [0.5, C("Reachable ground", 1 - ramp(f.slope, 12, 25), `mean slope ${fmt(f.slope, 1)}°`, "terrain")]] },
  { id: "rover", name: "Rover mobility and traverse tests", what: "Driving, navigation and wheel-soil tests over varied ground.",
    crit: (f, t) => [
      [2, C("Moderate slopes (about 3-14°)", band(f.slope, 3, 14, 6), `mean slope ${fmt(f.slope, 1)}°`, "terrain")],
      [1.5, C("Open, sparsely vegetated ground", 1 - ramp(f.ai, 0.2, 0.65), `aridity index ${fmt(f.ai, 2)}`, "climate")],
      [1, C("Target terrain class matches", t.types[0] === f.type ? 1 : t.types.includes(f.type) ? 0.6 : 0, `Earth ${typeOf(f.type).label}, target ${typeOf(t.types[0]).label}`, "geo")]] },
  { id: "slope", name: "Slope-limit and climbing tests", what: "Finding a rover's stability and path-planning limits on steep ground.",
    crit: () => [] },
  { id: "dust", name: "Dust, sand and fines handling", what: "Testing seals, wheels, filters and sampling in loose fine material.",
    crit: (f) => [
      [2, C("Dry ground", 1 - ramp(f.ai, 0.1, 0.5), `aridity index ${fmt(f.ai, 2)}`, "climate")],
      [2, C("Loose sediment at the surface", f.fines == null ? null : ramp(f.fines, 0.2, 0.6), f.fines == null ? "no mapped bedrock" : `${pct(f.fines)}% sedimentary/unconsolidated`, "geo")]] },
  { id: "thermal", name: "Thermal and power system trials", what: "Rehearsing power, thermal control and operations in a comparable temperature regime.",
    crit: (f, t, ctx) => [
      [2, C("Temperature regime like the target", ctx.tempFit(f.temp, t.tempC), `${fmt(f.temp, 0)}°C annual mean vs ${fmt(t.tempC, 0)}°C target (compared by position in each world's range)`, "climate")],
      [1, C("Dry climate (fewer weather interruptions)", 1 - ramp(f.ai, 0.2, 0.65), `aridity index ${fmt(f.ai, 2)}`, "climate")]] },
  { id: "ice", name: "Ice and permafrost drilling", what: "Testing drills and sample handling in frozen ground.",
    crit: (f, t) => [
      [2, C("Cold ground", 1 - ramp(f.temp, -12, -2), `${fmt(f.temp, 0)}°C annual mean`, "climate")],
      [1.5, C("Mapped ice", f.ice == null ? null : ramp(f.ice, 0.1, 0.5), f.ice == null ? "no mapped bedrock" : `${pct(f.ice)}% ice/glacier`, "geo")],
      [1, C("Target has ice", ramp(t.vec[6], 2, 10), `target ice/volatile share about ${t.vec[6]}%`, "tgt")]] },
  { id: "cold", name: "Cold-soak hardware tests", what: "Checking batteries, lubricants and electronics in deep cold.",
    crit: (f) => [[3, C("Cold climate", 1 - ramp(f.temp, -15, 5), `${fmt(f.temp, 0)}°C annual mean`, "climate")]] },
  { id: "salts", name: "Salt and sulfate sampling", what: "Practising sample choice and chemistry on salt and sulfate deposits that record past water.",
    crit: (f, t) => [
      [2, C("Mapped evaporites", f.evap == null ? null : ramp(f.evap, 0.15, 0.5), f.evap == null ? "no mapped bedrock" : `${pct(f.evap)}% evaporite`, "geo")],
      [2, C("Target has salts or sulfates", ramp(t.vec[3], 5, 25), `target salt/sulfate share about ${t.vec[3]}%`, "tgt")]] },
  { id: "impact", name: "Impact geology training", what: "Learning to read shocked rock, breccia and crater structure.",
    crit: (f, t) => [
      [3, C("Inside a known impact structure", f.impact ? 1 : 0, f.impact ? `${fmt(f.impact.d, 1)} km from ${f.impact.name} (one of 18 listed structures)` : "not near a listed impact structure", "geo")],
      [1, C("Target is cratered", t.types.includes("IMPACT_CRATER") ? 1 : 0.4, `target terrain: ${typeOf(t.types[0]).label}`, "tgt")]] },
  { id: "landing", name: "Landing-area and navigation rehearsal", what: "Practising approach, hazard avoidance and navigation on landing-zone-like ground.",
    crit: (f, t) => [
      [2, C("Flat ground", 1 - ramp(f.slope, 2, 8), `mean slope ${fmt(f.slope, 1)}°`, "terrain")],
      [1, C("Open, dry ground", 1 - ramp(f.ai, 0.2, 0.6), `aridity index ${fmt(f.ai, 2)}`, "climate")],
      [1, C("Slope like the target", 1 - clamp(Math.abs(f.slope - t.slope) / 10, 0, 1), `${fmt(f.slope, 1)}° vs ${fmt(t.slope, 1)}° target`, "tgt")]] }
];
PURPOSES.find((p) => p.id === "slope").crit = (f) => [[3, C("Steep ground", ramp(f.slope, 8, 20), `mean slope ${fmt(f.slope, 1)}°`, "terrain")]];

function computePurposes(s, p, tgt) {
  const f = siteFeatures(s); if (!f) return null;
  const [e0, e1] = EARTH_TEMP_RANGE, [m0, m1] = featureTempRange(p);
  const ctx = { tempFit: (te, tm) => 1 - Math.abs(clamp((te - e0) / (e1 - e0), 0, 1) - (m1 > m0 ? clamp((tm - m0) / (m1 - m0), 0, 1) : 0.5)) };
  const out = PURPOSES.map((pu) => {
    const rows = pu.crit(f, tgt, ctx), have = rows.filter(([, c]) => c.score != null), W = rows.reduce((a, [w]) => a + w, 0), Wh = have.reduce((a, [w]) => a + w, 0);
    return { pu, rows, fit: Wh ? have.reduce((a, [w, c]) => a + w * c.score, 0) / Wh : 0, cov: W ? Wh / W : 0 };
  }).filter((x) => x.cov >= 0.5).sort((a, b) => b.fit - a.fit);
  return { f, good: out.filter((x) => x.fit >= 0.55).slice(0, 5), best: out.slice(0, 2) };
}

function usesHTML(s, p, score, tgt) {
  const r = computePurposes(s, p, tgt), L2 = PLANETS[p].label;
  if (!r) return `<div class="sub"><span>What this is good for</span></div><p class="alt tight">Waiting for this site's live data before purposes can be computed.</p>`;
  const list = r.good.length ? r.good : r.best, weak = !r.good.length;
  const mark = (c) => (c.score == null ? "?" : c.score >= 0.6 ? "&#10003;" : c.score >= 0.3 ? "~" : "&#10007;");
  const tag = (c) => (c.src === "tgt" ? "target" : r.f.prov[c.src] ? "measured" : "estimated");
  return `<div class="sub"><span>What this is good for</span><span>computed from this site's data</span></div>
    ${weak ? `<p class="warn-box" style="margin:0 0 8px">No purpose reaches the 55% fit threshold for ${esc(tgt.name)}. These are the closest, and weak.</p>` : ""}
    ${list.map((x, i) => `<div class="use"><div class="uh"><b>${esc(x.pu.name)}</b><span class="uf">${pct(x.fit)}% fit</span></div><div class="bar"><i style="width:${pct(x.fit)}%"></i></div>
      <p class="ud">${esc(x.pu.what)}</p>
      <details ${i === 0 ? "open" : ""}><summary>Evidence from this site's data</summary><ul class="ue">${x.rows.map(([w, c]) => `<li><span class="ck">${mark(c)}</span> ${esc(c.label)}: ${c.text} <span class="live ${tag(c) === "estimated" ? "off" : "on"}">${tag(c)}</span></li>`).join("")}</ul></details></div>`).join("")}
    <p class="alt tight">How this works: each purpose lists requirements on this site's slope, climate, mapped rock, volcanic age and impact location, compared with ${esc(tgt.name)} (${L2}). The fit is the weighted share of requirements met, using only the data available. It shows what the numbers support, not a validated suitability study. "estimated" means that input was not measured live.</p>`;
}


/* ===================== SEARCH: place name or coordinates =====================
   Coordinates (28.61, 77.20 / 28.61N 77.20E / 28°36'N 77°12'E) open instantly. Earth place names are looked up with OpenStreetMap Nominatim
   (Open-Meteo geocoding as a backup). In Mars/Moon mode the names of the catalogued features (Jezero Crater, Olympus Mons...) are searched. */
function parseCoords(q) {
  const t = String(q).trim().replace(/[,;]+/g, " ").replace(/\s+/g, " ");
  if (!t || !/^[\sNSEWnsew°º+\-.\d'′’"″]+$/.test(t)) return null; /* anything with other letters is a place name, not coordinates */
  let vals;
  const dms = [...t.matchAll(/(-?\d+(?:\.\d+)?)\s*[°º]\s*(?:(\d+(?:\.\d+)?)\s*['′’]\s*)?(?:(\d+(?:\.\d+)?)\s*(?:"|″|'')\s*)?([NSEWnsew])?/g)];
  if (dms.length === 2) {
    vals = dms.map((x) => { const neg = /^-/.test(x[1]); let v = Math.abs(parseFloat(x[1])) + (x[2] ? parseFloat(x[2]) / 60 : 0) + (x[3] ? parseFloat(x[3]) / 3600 : 0); if (neg) v = -v; return { v, h: (x[4] || "").toUpperCase() }; });
  } else {
    const dec = [...t.matchAll(/([NSEWnsew])?\s*([+-]?\d+(?:\.\d+)?)\s*°?\s*([NSEWnsew])?/g)];
    if (dec.length !== 2) return null;
    vals = dec.map((x) => ({ v: parseFloat(x[2]), h: (x[3] || x[1] || "").toUpperCase() }));
  }
  vals.forEach((o) => { if (o.h === "S" || o.h === "W") o.v = -Math.abs(o.v); });
  if (/^[EW]$/.test(vals[0].h) || /^[NS]$/.test(vals[1].h)) vals.reverse(); /* "77.2E 28.6N" means longitude first */
  const lat = vals[0].v, lon = vals[1].v;
  if (!Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 90 || lon < -180 || lon > 360) return null;
  return { lat, lon: Math.round(wrapLon(lon) * 1e6) / 1e6 };
}

async function geocodePlace(q) {
  const ctl = new AbortController(), timer = setTimeout(() => ctl.abort(), 9000);
  try {
    const r = await fetch(`https://nominatim.openstreetmap.org/search?format=jsonv2&limit=5&accept-language=en&q=${encodeURIComponent(q)}`, { signal: ctl.signal });
    if (!r.ok) throw new Error("HTTP " + r.status);
    const out = (await r.json()).map((x) => ({ name: String(x.name || String(x.display_name).split(",")[0]).trim(), country: String(x.display_name).split(",").pop().trim(), full: String(x.display_name), lat: Number(x.lat), lon: Number(x.lon) }))
      .filter((x) => Number.isFinite(x.lat) && Number.isFinite(x.lon));
    if (out.length) return out;
  } catch (e) { console.warn("Nominatim search failed, trying backup:", e); } finally { clearTimeout(timer); }
  const r2 = await fetch(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(q)}&count=5&language=en&format=json`);
  if (!r2.ok) throw new Error("HTTP " + r2.status);
  return ((await r2.json()).results || []).map((x) => ({ name: x.name, country: x.country || "", full: [x.name, x.admin1, x.country].filter(Boolean).join(", "), lat: x.latitude, lon: x.longitude }));
}

function initSearch() {
  const form = $("searchForm"), input = $("searchInput"), msg = $("searchMsg"), list = $("searchList"); if (!form || !input) return;
  let seq = 0;
  const say = (t, err) => { msg.textContent = (t || "").replace(/&deg;/g, "\u00b0"); msg.hidden = !t; msg.classList.toggle("err", Boolean(err)); };
  const clearList = () => { list.innerHTML = ""; list.hidden = true; };
  const showList = (items) => {
    if (!items.length) return clearList();
    list.innerHTML = items.map((it, i) => `<li><button type="button" data-i="${i}">${esc(it.label)}</button></li>`).join(""); list.hidden = false;
    list.querySelectorAll("button").forEach((b) => { b.onclick = () => { clearList(); items[Number(b.dataset.i)].run(); }; });
  };
  /* open a point: on Earth it becomes the selected site, on Mars/Moon it is the picked point */
  const goTo = (r) => {
    if (state.view !== "EARTH") { pickPlanetPoint(r.lat, r.lon); return; }
    if (state.custom && state.markers.has("custom")) state.markers.delete("custom");
    state.custom = { id: "custom", name: r.name || "New site", country: r.country || "User-selected", lat: clamp(r.lat, -89.9, 89.9), lon: wrapLon(r.lon), type: null, scores: { MARS: 0, MOON: 0 } };
    addMarker(state.custom); selectSite(state.custom, true);
  };
  input.addEventListener("keydown", (e) => { if (e.key === "Escape") { clearList(); say(""); } });
  form.onsubmit = async (e) => {
    e.preventDefault();
    const q = input.value.trim(), my = ++seq; if (!q) return;
    clearList(); say("");
    const c = parseCoords(q);
    if (c) { say(`Opening ${fmtLat(c.lat)}, ${fmtLon(c.lon)}`); goTo({ name: "New site", country: "User-selected", lat: c.lat, lon: c.lon }); return; }
    const ql = q.toLowerCase();
    if (state.view !== "EARTH") { /* Mars / Moon: catalogued features */
      const hits = REFERENCE_SITES[state.view].filter((r) => r.name.toLowerCase().includes(ql));
      if (!hits.length) { say(`No catalogued ${PLANETS[state.view].label} feature matches "${q}". Try a name like ${REFERENCE_SITES[state.view][0].name}, or type coordinates such as ${REFERENCE_SITES[state.view][0].lat}, ${REFERENCE_SITES[state.view][0].lon}.`, true); return; }
      say(`Opening ${hits[0].name}`); goTo({ name: hits[0].name, lat: hits[0].lat, lon: hits[0].lon });
      showList(hits.slice(1).map((r) => ({ label: `${r.name} (${fmtLat(r.lat)}, ${fmtLon(r.lon)})`, run: () => { say(`Opening ${r.name}`); goTo({ name: r.name, lat: r.lat, lon: r.lon }); } })));
      return;
    }
    const local = SITES.filter((s) => `${s.name} ${s.country}`.toLowerCase().includes(ql)); /* the built-in analog sites first */
    if (local.length) {
      say(`Opening ${local[0].name}`); selectSite(local[0], true);
      showList(local.slice(1).map((s) => ({ label: `${s.name}, ${s.country}`, run: () => { say(`Opening ${s.name}`); selectSite(s, true); } })));
      return;
    }
    say("Searching...");
    let res;
    try { res = await geocodePlace(q); } catch (err) { console.warn("Place search failed:", err); if (my === seq) say("The place search did not respond. Check your connection, or type coordinates like 28.61, 77.20.", true); return; }
    if (my !== seq) return;
    if (!res.length) { say(`No place found for "${q}". Try a different spelling, or type coordinates like 28.61, 77.20.`, true); return; }
    const open = (r) => { say(`Opened: ${r.full.length > 90 ? r.full.slice(0, 87) + "..." : r.full}`); goTo({ name: r.name, country: r.country, lat: r.lat, lon: r.lon }); };
    open(res[0]);
    showList(res.slice(1).map((r) => ({ label: r.full.length > 70 ? r.full.slice(0, 67) + "..." : r.full, run: () => open(r) })));
  };
}

/* ===================== "i" INFO BUTTONS: SUMMARY OF THE TAPPED SITE AND OF EVERY DATA BLOCK ===================== */
const DEFS = Object.freeze({
  "terrain class": "The category this place falls into (desert, polar ice, basalt plain, impact crater, lava tube or evaporite). It is worked out from measured climate, mapped bedrock and known impact structures, and it drives the terrain part of the match.",
  "elevation": "Height above sea level. Pressure and temperature fall with height, so a high site can mimic thin-air conditions better than a lowland one. Earth values come from the SRTM15+ elevation model.",
  "mean slope": "Average steepness of the ground around the site. Rovers and crews face very different terrain on a flat plain than on a rugged slope, so similar slopes make a better test bed.",
  "mean temp (annual)": "Average air temperature over a full year (ERA5 reanalysis via Open-Meteo). The comparison uses the annual mean so one hot or cold day does not distort the result.",
  "annual mean temp": "Modelled yearly average temperature at this point, from latitude and elevation. It is a physical estimate, not a measurement.",
  "surface pressure": "Air pressure at the surface, corrected from sea level to the site's elevation. Mars sits near 6 hPa and the Moon is a vacuum, so no Earth site matches exactly; higher and drier sites get closer.",
  "temperature": "Current air temperature at the site from OpenWeather. It is a live reading, so it can differ from the annual mean.",
  "humidity": "Current relative humidity from OpenWeather. Low humidity points to a dry environment, which is what Mars and Moon analogs need.",
  "dryness": "How arid the site is (precipitation divided by evaporative demand). Mars and the Moon are extremely dry, so this has the largest weight and also acts as a gate on the final score.",
  "slope fit": "How closely the site's ground steepness matches the target feature's.",
  "mineral similarity": "How closely the estimated rock and mineral mix matches the target. It is inferred from mapped rock type, not from spectra.",
  "current weather": "Source of the live conditions: OpenWeather. If the request fails the app falls back to a climate estimate and marks it as estimated.",
  "annual climate": "A full year of daily temperature, rainfall and evaporative demand from ERA5 via Open-Meteo. It feeds the aridity index.",
  "elevation, slope": "Terrain values from SRTM15+ (OpenTopography). A coarser Open-Meteo elevation or a reference matrix is used when it is unavailable, and labelled so.",
  "bedrock": "Mapped rock units from Macrostrat, cross-checked with the coarse GLiM global lithology grid. They drive the mineral profile."
});
const SECT = [
  [/^current conditions/i, "wx", "Current conditions"],
  [/^earth vs/i, "cmp", "Earth vs target comparison"],
  [/^why this score/i, "score", "How the score is built"],
  [/^mineral profile/i, "min", "Mineral profile"],
  [/^site vs target/i, "img", "Site vs target imagery"],
  [/^data sources/i, "src", "Data sources and limits"],
  [/^what this is good for/i, "good", "What this is good for"],
  [/^why it matches/i, "why", "Why it matches"],
  [/^where the analogy/i, "brk", "Where the analogy breaks down"],
  [/^profile of this/i, "pprofile", "Profile of this point"],
  [/^top 3 earth/i, "panalogs", "Top Earth analogs"]
];
const SECT_TEXT = {
  wx: "A live snapshot of the weather at the site right now. It shows today's conditions, not the long-term climate, which is covered by the annual figures below.",
  cmp: "Side-by-side numbers for this Earth site and its closest catalogued feature on the target world. The delta column shows how far apart they are, and the terrain class row shows whether both fall in the same category.",
  score: "The similarity score is a weighted blend of dryness, temperature, pressure, slope and mineral fit, multiplied by a dryness gate. It is a ranking index for comparing sites, not a validated accuracy.",
  min: "Estimated shares of common minerals for the Earth site (left bar) and the target world (right bar). Earth values are inferred from the mapped rock type, so treat them as typical rather than measured.",
  img: "Satellite imagery of the Earth site beside NASA Trek imagery of the matching feature on Mars or the Moon, so you can judge the visual resemblance yourself.",
  src: "Shows which inputs were measured and which were estimated, and how reliable the match is. Coverage counts live inputs out of four.",
  good: "Practical uses (for example rover testing, lava-tube study or simulant sourcing) rated against this site's own slope, climate, rock and age data.",
  why: "The measured similarities that raise this match.",
  brk: "The differences between the Earth site and the target that limit how far the analogy can be trusted.",
  pprofile: "Estimated conditions at the point you tapped on the planetary globe. They come from nearby catalogued features and physical models, not per-pixel measurements.",
  panalogs: "The Earth sites ranked by how closely they resemble the point you tapped. The percentage is a similarity index, not an accuracy figure."
};
const IA = ["Earth", "Mars", "Moon"];
function infoLi(a, b) { return `<li><b>${a}</b> ${b}</li>`; }
function ariLabel(ai) { return ai < 0.05 ? "hyper-arid" : ai < 0.2 ? "arid" : ai < 0.5 ? "semi-arid" : "not arid"; }

function siteSummary() {
  const s = state.site;
  if (!s || !s.data) return { title: "Site summary", html: "<p>Data for this site is still loading. Try again in a moment.</p>" };
  const m = state.mode, P = PLANETS[m], other = m === "MARS" ? "MOON" : "MARS";
  const { w, c, t, g } = s.data, T = typeOf(s.type), ranked = rankFor(s, m), ref = ranked[0];
  const score = s.scores[m], vd = verdict(score), conf = confidence(ref.sim, score);
  const n = [w.live, c.live, t.live || t.partial, Boolean(g)].filter(Boolean).length;
  const place = `${esc(s.name)}${s.country ? " (" + esc(s.country) + ")" : ""}`;
  if (s.ocean && !s.bypass) return { title: esc(s.name), html: `<p>${place} is at ${s.lat.toFixed(2)}&deg;, ${s.lon.toFixed(2)}&deg; and was detected as open ocean, so it cannot serve as a ${P.label} analog. Pick a land location, or use "Show anyways" to see the numbers.</p>` };
  const html = `<p class="info-now"><b>${place}</b> sits at ${s.lat.toFixed(2)}&deg;, ${s.lon.toFixed(2)}&deg; and is classed as <b>${esc(T.label)}</b>. As a ${P.label} analog it scores <b>${score}%</b> (${vd.label}); as a ${PLANETS[other].label} analog, ${s.scores[other]}%.</p>
    <ul>
      ${infoLi("Right now:", `${fmt(w.temp, 1)}&deg;C, ${fmt(w.hum)}% humidity, ${fmt(w.press)} hPa (${w.live ? "live from OpenWeather" : "estimated"}).`)}
      ${infoLi("Over a year:", `${fmt(c.temp, 1)}&deg;C average, aridity index ${fmt(c.ai, 2)} (${ariLabel(c.ai)}), ${c.live ? "measured over " + c.year : "estimated from humidity"}.`)}
      ${infoLi("Terrain:", `${fmt(t.elev)} m elevation, ${fmt(t.slope, 1)}&deg; mean slope${t.live ? " (measured)" : t.partial ? " (coarse measurement)" : " (reference value)"}.`)}
      ${infoLi("Bedrock:", g ? `${esc(g.labels.join(", "))} (${esc(g.src || "Macrostrat")}).` : "no mapped bedrock available, so a typical rock profile for this terrain type is used.")}
      ${infoLi("Closest " + P.label + " feature:", `${esc(ref.name)} at ${ref.sim}% fit (${conf.label.toLowerCase()}).`)}
      ${infoLi("Data quality:", `${n} of 4 inputs measured; the rest are estimated and labelled.`)}
    </ul>
    <p class="info-tip">Tip: tap the <i>i</i> beside any heading or value for what it means and this site's numbers.</p>`;
  return { title: esc(s.name), html };
}

function planetSummary() {
  const pt = state.pt;
  if (!pt || !pt.prof) return { title: "Planet point", html: "<p>Tap a point on the globe first, then press <i>i</i> for its summary.</p>" };
  const P = pt.prof, L = PLANETS[pt.p].label;
  return { title: `${L} point ${fmtLat(pt.lat)}, ${fmtLon(pt.lon)}`, html: `<p class="info-now">This ${L} point is classed as <b>${esc(typeOf(P.types[0]).label)}</b> (${esc(P.region)}). Everything below is estimated, because no free live per-point source exists for ${L}.</p>
    <ul>
      ${infoLi("Slope and elevation:", `${fmt(P.slope, 1)}&deg; and ${fmt(P.elev)} m, interpolated from the nearest catalogued features.`)}
      ${infoLi("Temperature:", `${fmt(P.tempC, 0)}&deg;C annual mean (physical model of latitude and elevation).`)}
      ${infoLi("Pressure:", pt.p === "MARS" ? `${fmt(P.press, 1)} hPa (model).` : "none, the Moon is a vacuum.")}
      ${infoLi("Nearest feature:", `${esc(P.nearest.name)}, ${fmt(P.dist)} km away.`)}
      ${infoLi("Data coverage:", `${P.cov}. The Earth analogs listed in the panel are ranked against these estimates.`)}
    </ul>
    <p class="info-tip">Tap the <i>i</i> beside any heading or value for more.</p>` };
}

function sectionInfo(key, heading, sectionEl) {
  const s = state.site, pl = state.view !== "EARTH";
  let extra = "";
  if (!pl && s && s.data) {
    const m = state.mode, P = PLANETS[m], { w, c, t, g } = s.data, ranked = rankFor(s, m), ref = ranked[state.refIdx] || ranked[0];
    if (key === "wx") extra = `At ${esc(s.name)}: ${fmt(w.temp, 1)}&deg;C, ${fmt(w.hum)}% humidity, ${fmt(w.press)} hPa, ${esc(String(w.desc || ""))} (${w.live ? "live" : "estimated"}).`;
    else if (key === "cmp") extra = `Compared with <b>${esc(ref.name)}</b> (${ref.sim}% fit): elevation ${fmt(t.elev)} m vs ${fmt(ref.elev)} m, slope ${fmt(t.slope, 1)}&deg; vs ${fmt(ref.slope, 1)}&deg;, annual temperature ${fmt(c.temp, 1)}&deg;C vs ${fmt(ref.tempC, 1)}&deg;C, pressure ${fmt(w.press, 1)} vs ${fmt(ref.press, 1)} hPa.`;
    else if (key === "score") { const sp = scoreParts(s.type, c, w, t, m, g); extra = `For ${esc(s.name)}: dryness ${Math.round(sp.arid * 100)}%, temperature ${Math.round(sp.temp * 100)}%, pressure ${Math.round(sp.press * 100)}%, slope ${Math.round(sp.slope * 100)}%, minerals ${Math.round(sp.mineral * 100)}%, giving <b>${sp.total}%</b> after the dryness gate (${sp.gate.toFixed(2)}).`; }
    else if (key === "min") { const EM = (g && g.vec) || typeOf(s.type).minerals; const top = MINERALS.map((nm, i) => [nm, EM[i]]).sort((a, b) => b[1] - a[1]).slice(0, 3); extra = `Main minerals at this site: ${top.map((x) => `${esc(x[0])} ${x[1]}%`).join(", ")}. ${g ? "Derived from " + esc(g.labels.join(", ")) + "." : "Typical profile for the terrain type."}`; }
    else if (key === "src") { const n = [w.live, c.live, t.live || t.partial, Boolean(g)].filter(Boolean).length; extra = `For this site ${n} of 4 inputs were measured.`; }
  }
  let text = SECT_TEXT[key] || "";
  if (!text && sectionEl) text = sectionEl.textContent.replace(/\s+/g, " ").trim().slice(0, 300);
  return { html: `<p>${text}</p>${extra ? `<p class="info-now">${extra}</p>` : ""}` };
}

function rowInfo(kind, label, el) {
  const def = DEFS[label.toLowerCase()];
  const vals = [];
  if (kind === "tr") {
    const tbl = el.closest("table"), heads = tbl ? [...tbl.querySelectorAll("th")].map((th) => th.textContent.trim()) : [];
    [...el.children].slice(1).forEach((td, i) => { const v = td.textContent.replace(/\s+/g, " ").trim(); if (v) vals.push((heads[i + 1] ? heads[i + 1] + " " : "") + v); });
  }
  else if (kind === "wx") { const b = el.querySelector("b"); if (b) vals.push(b.textContent.trim()); }
  else if (kind === "mrow") {
    const sp = el.querySelectorAll(":scope > span");
    if (sp.length) {
      const v = sp[sp.length - 1].textContent.replace(/\s+/g, " ").trim();
      if (el.querySelector(".pair")) { const m = v.split("/").map((x) => x.trim()); vals.push(m.length === 2 ? `Earth ${m[0]} \u00b7 target ${m[1]}` : v); }
      else { const m = v.split("\u00b7").map((x) => x.trim()); vals.push(m.length === 2 ? `fit ${m[0]} \u00b7 weight ${m[1]}` : v); }
    }
  }
  const isMin = kind === "mrow" && el.querySelector(".pair");
  let text = def || (isMin ? `Estimated share of ${esc(label)} in the surface rock. The left bar is the Earth site and the right bar is the target world. It is inferred from rock type, not from spectra.` : "");
  if (!text) return null;
  const at = state.site && state.view === "EARTH" ? esc(state.site.name) : "this point";
  return { html: `<p>${text}</p>${vals.length ? `<p class="info-now"><b>${esc(label)}</b> at ${at}: ${vals.map(esc).join(" &middot; ")}</p>` : ""}` };
}

function mkInfoBtn(kind, key, label) {
  const b = document.createElement("button");
  b.type = "button"; b.className = "info-btn"; b.textContent = "i";
  b.dataset.kind = kind; b.dataset.key = key || ""; b.dataset.label = label || "";
  b.setAttribute("aria-label", "About " + (label || "this data"));
  b.title = "About " + (label || "this data");
  return b;
}

function decorateInfo(root) {
  if (!root || !root.children.length) return;
  /* site / point title */
  const h3 = root.querySelector(".hero h3");
  if (h3 && !h3.parentElement.classList.contains("title-row")) {
    const row = document.createElement("div"); row.className = "title-row";
    h3.parentNode.insertBefore(row, h3); row.appendChild(h3); row.appendChild(mkInfoBtn("site", "site", "this site"));
  }
  /* section headings */
  root.querySelectorAll(".sub").forEach((sub) => {
    const first = sub.firstElementChild; if (!first || first.querySelector(".info-btn")) return;
    const txt = first.textContent.trim(), hit = SECT.find((r) => r[0].test(txt));
    if (hit) first.appendChild(mkInfoBtn("section", hit[1], hit[2]));
  });
  /* table rows */
  root.querySelectorAll("table tr").forEach((tr) => {
    const td = tr.children[0]; if (!td || td.tagName !== "TD" || td.querySelector(".info-btn")) return;
    const label = td.textContent.trim(); if (!DEFS[label.toLowerCase()]) return;
    td.appendChild(mkInfoBtn("tr", "", label));
  });
  /* current-condition tiles */
  root.querySelectorAll(".wx > div").forEach((d) => {
    const sp = d.querySelector("span"); if (!sp || d.querySelector(".info-btn")) return;
    const label = sp.textContent.trim(); if (DEFS[label.toLowerCase()]) sp.appendChild(mkInfoBtn("wx", "", label));
  });
  /* score and mineral bars */
  root.querySelectorAll(".mrow").forEach((r) => {
    const sp = r.querySelector(":scope > span"); if (!sp || sp.querySelector(".info-btn")) return;
    const label = sp.textContent.trim();
    if (DEFS[label.toLowerCase()] || r.querySelector(".pair")) sp.appendChild(mkInfoBtn("mrow", "", label));
  });
}

let infoLast = null;
function openInfo(btn) {
  const kind = btn.dataset.kind, label = btn.dataset.label, pop = $("infoPop");
  if (!pop) return;
  let d = null, eyebrow = "About";
  if (kind === "site") { d = state.view === "EARTH" ? siteSummary() : planetSummary(); eyebrow = "Summary"; }
  else if (kind === "section") { const sec = btn.closest(".sub"); d = sectionInfo(btn.dataset.key, label, sec); d.title = label; eyebrow = "About this data"; }
  else { const el = btn.closest(kind === "tr" ? "tr" : kind === "wx" ? ".wx > div" : ".mrow"); d = el ? rowInfo(kind, label, el) : null; if (d) { d.title = label; eyebrow = "About this value"; } }
  if (!d) return;
  $("infoEyebrow").textContent = eyebrow; $("infoTitle").innerHTML = d.title; $("infoBody").innerHTML = d.html;
  infoLast = btn; pop.hidden = false;
  const sheet = pop.querySelector(".info-sheet"); sheet.scrollTop = 0; try { sheet.focus(); } catch (e) { /* ignore */ }
}
function closeInfo() {
  const pop = $("infoPop"); if (!pop || pop.hidden) return;
  pop.hidden = true;
  if (infoLast && document.contains(infoLast)) { try { infoLast.focus(); } catch (e) { /* ignore */ } }
  infoLast = null;
}
function initInfo() {
  ["detail", "planetCard"].forEach((id) => {
    const el = $(id); if (!el) return;
    el.addEventListener("click", (e) => { const b = e.target.closest(".info-btn"); if (b) { e.preventDefault(); e.stopPropagation(); openInfo(b); } }, true);
    if (typeof MutationObserver !== "undefined") new MutationObserver(() => decorateInfo(el)).observe(el, { childList: true, subtree: true });
    decorateInfo(el);
  });
  const pop = $("infoPop");
  if (pop) pop.addEventListener("click", (e) => { if (e.target.closest("[data-close]")) closeInfo(); });
  document.addEventListener("keydown", (e) => { if (e.key === "Escape") closeInfo(); });
}
document.addEventListener("DOMContentLoaded", initInfo);
