# Coordy 🧭

**Coordy** is an advanced compass bearing calculator, spherical geodesic navigator, and vector mapping application built with Next.js, Leaflet, and TypeScript.

It calculates initial, final, and true reverse compass bearings, geodesic distances, and magnetic declination between coordinates on Earth or in 2D Cartesian space.

---

## Key Features

### 1. Multi-Mode Geodesic & Navigational Mathematics
- **Great-Circle (Orthodrome / Geographic)**:
  - Calculates true initial bearing, arrival final bearing, and true reverse bearing ($B \to A$) across the spherical Earth.
  - Slerp spherical linear interpolation for rendering true curved geodesic paths on Web Mercator projections without distortion.
- **Rhumb Line (Loxodrome)**:
  - Constant compass heading paths across meridians.
- **Planar 2D Cartesian**:
  - 2D planar bearing and Euclidean magnitude (compatible with `compass.py`).
- **World Magnetic Model (WMM) Declination**:
  - Embedded geomagnetic spherical harmonic engine that computes local magnetic variation (+E / -W) and converts between True and Magnetic headings.
- **Forward Destination Projection**:
  - Project a destination (Point B) given a starting coordinate (Point A), heading angle ($0^\circ\text{–}360^\circ$), and distance (`km`, `mi`, `nm`, `m`, `ft`).

### 2. Universal Coordinate Support
Coordy parses a wide variety of formats automatically:
- **Decimal Degrees (DD)**: `30.2672, -97.7431` or `30.2672° N, 97.7431° W`
- **Degrees, Minutes, Seconds (DMS)**: `30° 16' 1.9" N, 97° 44' 35.2" W` or `30d 16m 1.9s N 97d 44m 35.2s W`
- **Degrees, Decimal Minutes (DM)**: `30° 16.032' N, 97° 44.586' W`
- **Open Location Code (Plus Codes)**: `86247784+Vp` (built-in zero-dependency decoder)
- **what3words**: `///filled.count.soap` (with API key integration)
- **Browser Geolocation**: One-click GPS location detection

### 3. Interactive Vector Map
- **Live Rubber-Band Drawing**: Live dashed geodesic preview with real-time bearing and distance badges while moving the cursor between Point A and Point B.
- **Interactive Endpoints**: Drag or click endpoints (Point A or Point B) on the map at any time to adjust vectors dynamically.
- **Base Map Switcher**:
  - **Carto Dark Matter** (default dark slate theme)
  - **OpenStreetMap Standard**
  - **OpenTopoMap** (topographical elevation contours for hiking)
  - **Esri World Imagery** (satellite photography)
- **Nominatim Search**: Integrated place and address search to find cities, landmarks, and coordinates instantly.

### 4. Vector Route Management & Chaining
- **Chaining**: Start a new vector leg directly from the end of an existing vector with one click.
- **Reversal**: Instant direction swap ($A \leftrightarrow B$) with updated bearings.
- **Cumulative Metrics**: Real-time total route distance across all active vectors.
- **Smart Units**: Automatic metric and imperial switching (`m` / `km`, `ft` / `mi`, `nm`).
- **Responsive Drawer**: Collapsible vector drawer designed for mobile and desktop screens.

### 5. Sharing & Import / Export
- **Lossless URL Hash Sharing**: Share your exact vectors, zoom level, pan position, selected basemap, and calculation mode in a compact `#v=...` base64url link.
- **Export Formats**:
  - **GeoJSON**: LineStrings with bearing, reverse bearing, cardinal, and distance properties.
  - **GPX**: GPS route files with `<rtept>` waypoints.
  - **KML**: Google Earth compatible paths with tessellated arcs.
  - **CSV**: Tabular spreadsheet with start/end coordinates and compass metrics.
- **Import**: Drag-and-drop or upload `.geojson`, `.json`, or `.csv` files directly into Coordy.

---

## Getting Started

Coordy requires **Node.js >= 20.0.0** and **pnpm >= 9.0.0**.

### Installation

```bash
pnpm install
```

### Development Server

```bash
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

### Run Tests

Coordy includes a comprehensive test suite verifying bearing math, coordinate parsers, magnetic declination, URL hash codec round-trips, and file import/export:

```bash
pnpm test
```

### Static Build & GitHub Pages Deployment

Coordy builds into a standalone, fully static export in `./dist`:

```bash
pnpm build
```

Deployment to GitHub Pages is automated via the GitHub Actions workflow in [`.github/workflows/deploy.yml`](.github/workflows/deploy.yml) upon push to `main`.

---

## License

MIT
