# NASA SPACE APPS CHALLENGE • OFFICIAL PROJECT SUBMISSION FIELDS

# ANALOG//ATLAS
**Terrestrial Analog Site Finder for Mars and the Moon**

**Team Name:** Cyber Mindset | **Team Head:** Devashish Jakhwal | **Team Member:** Dikshit Kumar

---

## 1. High-Level Summary

Before space agencies send rovers or astronauts to Mars or the Moon, they test their equipment on Earth in places with similar rocks, terrain, and weather—called Planetary Analog Sites. Old lists only cover a few famous locations. ANALOG//ATLAS turns the whole Earth into a live testing map. Anyone can explore 10 famous analog sites or click any spot on Earth to check how closely it matches 50 real Mars and Moon locations (25 on Mars and 25 on the Moon) in real time. By showing live Earth data side-by-side with real NASA orbital maps, our tool helps scientists and students find the best testing grounds on Earth.

---

## 2. Project Details

### Project Goals

- Replace static analog lists with live, real-time data for any spot on Earth.
- Show clear, easy-to-understand match scores alongside real Earth satellite and NASA planetary maps.
- Keep the app fast and reliable with automatic backup APIs and a 3-hour local cache.

### How Our Project Works (4 Simple Stages)

1. **Stage 1 — The User Interface (index.html & styles.css):** The left side shows a live interactive world map; the right side shows match score rings, weather cards, rock bars, and satellite photos. Clicking Earth, Mars, or Moon instantly changes the screen colors (Green, Cyan, or Purple) and updates the planetary match scores.

2. **Stage 2 — The Live Data Collector (app.js):** When you click any spot on Earth, our code calls four live APIs at the exact same time and saves the result for 3 hours so repeat clicks load instantly:
   - **Live Weather (OpenWeatherMap):** Gets current temperature, humidity, air pressure, and country name.
   - **1-Year Climate History (Open-Meteo ERA5):** Checks 365 days of past weather to measure true annual dryness.
   - **3D Height & Slope (OpenTopography):** Downloads elevation grids to calculate how flat or steep the ground is.
   - **Underground Rocks (Macrostrat):** Checks real geological maps to identify local rocks and minerals (basalt, iron oxides, sulfates, clays, and ice).

3. **Stage 3 — The Score Calculator (app.js):** Using the live data, the code calculates an honest Analog Match Score from 10% to 99% with zero pre-typed guesses. It adjusts sea-level weather pressure to match mountain or valley height, blocks clicks in the ocean (water) as an Invalid Target while still allowing dry below-sea-level deserts, and lowers the score if the area is wet or lush green.

4. **Stage 4 — Planetary Matcher & NASA Orbital Map (app.js):** Compares your Earth spot against 25 Mars sites (like Jezero Crater and Olympus Mons) and 25 Moon sites (like Shackleton Crater and Mare Tranquillitatis), then opens a full-screen interactive Mars or Moon map side-by-side with Earth satellite imagery.

### Simple 5-Factor Score Formula (10%–99%)

- 30% Dryness + 25% Rocks & Minerals + 15% Temperature + 15% Air Pressure + 15% Ground Slope (reduced automatically if the area is wet or lush green).

### How to Use the App (Earth, Mars and Moon Modes)

Press **Start exploring** on the home page. At the top of the right-hand panel there are three buttons: **Earth**, **Mars** and **Moon**. Each one answers a different question.

| Mode | Question it answers | You click on | You get |
| --- | --- | --- | --- |
| **Earth** | Which Earth places match Mars or the Moon? | The Earth globe | A match score for that spot and its closest Mars or Moon landmark |
| **Mars** | Which Earth sites match this place on Mars? | The Mars globe | An estimated profile of that point and its top Earth matches |
| **Moon** | Which Earth sites match this place on the Moon? | The Moon globe | An estimated profile of that point and its top Earth matches |

#### Earth Mode

1. **Choose the target world** with the *Compare with: Mars / Moon* buttons. The preset analog sites are ranked by match score for that world.
2. **Choose a place** in any of these ways:
   - click a site in the list, or its marker on the globe;
   - click anywhere on the globe to check a brand-new spot;
   - search a place name or coordinates (for example `Atacama` or `28.61, 77.20`).
3. **Read the results:** the match score ring, live weather, the Earth-vs-planet comparison table, the score breakdown, the rock and mineral bars, and the Earth satellite photo beside the NASA planet map.
4. **Change the landmark it is compared with** using the dropdown or the top-pick buttons. Click the planet picture to open the full-screen map; press **Back to Earth** (or `Esc`) to return.
5. **If you click water,** the panel shows *Invalid Target*. Press **Show anyways** to see the numbers regardless.

#### Mars Mode

1. Press **Mars**. The globe shows real NASA Mars maps. Use the **Imagery** menu to switch between the Viking color mosaic and MOLA shaded relief.
2. **Pick a point:** click anywhere on Mars, click one of the 25 white landmark dots (such as Jezero Crater or Olympus Mons), or search a landmark name or coordinates.
3. **Read the results:** the point's coordinates, an estimated profile (terrain type, slope, elevation, temperature, air pressure), the **top 3 Earth matches** with satellite photos, and short notes on *why it matches* and *where the match breaks down*.
4. Press **See exact location on Earth map** to jump to Earth mode with that site selected.

#### Moon Mode

Works the same way as Mars mode, with these differences:

- The Imagery layers are the LRO WAC mosaic and LOLA shaded relief.
- The Moon has no air, so air pressure is not scored.
- It uses the 25 Moon landmarks (such as Shackleton Crater or Mare Tranquillitatis).

#### Good to Know

- A new place takes a few seconds the first time because several live services are queried at once. Repeat clicks load instantly thanks to the 3-hour cache.
- Press the small **i** beside any heading or value to see what it means and that site's numbers.
- **↑ Home**, at the bottom-left of the map, returns to the home page.
- Mars and Moon values are estimates and are labelled that way.

### Tools & Technologies Used

Built with HTML5, CSS3, JavaScript, and Leaflet.js for interactive maps, using a 3-hour local browser cache and automatic backup APIs so the demo stays fast and never crashes on slow Wi-Fi.

---

## 3. Use of NASA Data

ANALOG//ATLAS uses official NASA Solar System Treks and NASA Open API services to display real Mars and Moon surfaces:

1. **NASA Solar System Treks (trek.nasa.gov/tiles):**
   - **Mars Maps:** Loads real orbital mosaics (Viking Color Mosaic and MOLA Color-Shaded Relief) centered on the matched Mars site.
   - **Moon Maps:** Loads real orbital mosaics (LRO WAC Mosaic and LOLA Color-Shaded Relief) centered on the matched Moon site.
   - **Interactive Planet Explorer:** Fixes polar map stretching, hides blank dark orbital strips, and lets users zoom, pan, and click all 50 Mars and Moon landmarks in a full-screen planetary map.
2. **NASA Mars Rover Photos API (api.nasa.gov/mars-photos/api/v1/rovers):** Works as an automatic backup that shows real Curiosity rover ground photos if map tiles fail to load.

---

## 4. References & External Resources

| # | API / Tool | What It Does in Our Project |
| --- | --- | --- |
| 1 | NASA Solar System Treks | Loads real Mars (Viking/MOLA) and Moon (LRO/LOLA) orbital map tiles (https://trek.nasa.gov/tiles). |
| 2 | NASA Mars Rover Photos API | Backup imagery service showing real Curiosity rover surface photos (https://api.nasa.gov/mars-photos/api/v1/rovers). |
| 3 | OpenWeatherMap API | Gets live temperature, humidity, air pressure, and country code (https://api.openweathermap.org/data/2.5/weather). |
| 4 | Open-Meteo ERA5 Archive | Gets 365 days of weather data to calculate true annual dryness (https://archive-api.open-meteo.com/v1/archive). |
| 5 | OpenTopography DEM API | Downloads elevation grids to measure height and ground slope (https://portal.opentopography.org/API/globaldem). |
| 6 | Open-Meteo Elevation API | Automatic backup elevation service if OpenTopography is slow (https://api.open-meteo.com/v1/elevation). |
| 7 | Macrostrat Geology API | Checks underground rocks to build the 7-mineral profile and detect oceans (https://macrostrat.org/api/v2/mobile/map_query). |
| 8 | OSM Nominatim API | Converts clicked map coordinates into readable region and country names (https://nominatim.openstreetmap.org/reverse). |
| 9 | Esri ArcGIS Imagery | Provides the dark Earth map, satellite layer, and Earth preview photos (https://server.arcgisonline.com/ArcGIS/rest/services). |
| 10 | OpenTopoMap Tiles | Adds mountain elevation contour lines onto the Earth map (https://tile.opentopomap.org). |
| 11 | Leaflet.js & Google Fonts | Open-source interactive map engine and Chakra Petch / Inter fonts (https://leafletjs.com). |

---

**Project deployed link:** https://github.com/cr548/ANALOG-ATLAS/actions/runs/43711673424/job/132804488370
