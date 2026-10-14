/**
 * GeoIO utilities: Export and Import for GeoJSON, GPX, KML, and CSV
 */

import { MapVector } from '@/components/MapComponent';
import { calculateGeographicBearing, interpolateGreatCircle } from './bearing';

/**
 * Exports vectors to a standard GeoJSON FeatureCollection
 */
export function exportToGeoJSON(vectors: MapVector[], includeGeodesic = true): string {
  const features = vectors.map((vec, idx) => {
    const coordinates = includeGeodesic
      ? interpolateGreatCircle(vec.from, vec.to, 24).map(([lat, lon]) => [
          Number(lon.toFixed(6)),
          Number(lat.toFixed(6)),
        ])
      : [
          [Number(vec.from[1].toFixed(6)), Number(vec.from[0].toFixed(6))],
          [Number(vec.to[1].toFixed(6)), Number(vec.to[0].toFixed(6))],
        ];

    return {
      type: 'Feature',
      id: vec.id,
      geometry: {
        type: 'LineString',
        coordinates,
      },
      properties: {
        index: idx + 1,
        label: vec.label || `Vector #${idx + 1}`,
        bearing: Number(vec.bearing.toFixed(2)),
        cardinal: vec.cardinal,
        distanceKm: Number(vec.distanceKm.toFixed(2)),
        distanceMiles: Number((vec.distanceKm * 0.621371).toFixed(2)),
        distanceNauticalMiles: Number((vec.distanceKm / 1.852).toFixed(2)),
        from: [vec.from[0], vec.from[1]],
        to: [vec.to[0], vec.to[1]],
      },
    };
  });

  return JSON.stringify(
    {
      type: 'FeatureCollection',
      generator: 'Coordy Compass Bearing Calculator',
      features,
    },
    null,
    2
  );
}

/**
 * Exports vectors to GPX 1.1 format
 */
export function exportToGPX(vectors: MapVector[]): string {
  let gpx = `<?xml version="1.0" encoding="UTF-8"?>\n`;
  gpx += `<gpx version="1.1" creator="Coordy" xmlns="http://www.topografix.com/GPX/1/1">\n`;
  gpx += `  <metadata>\n    <name>Coordy Vector Export</name>\n    <time>${new Date().toISOString()}</time>\n  </metadata>\n`;

  vectors.forEach((vec, idx) => {
    const label = vec.label || `Vector ${idx + 1}`;
    gpx += `  <rte>\n`;
    gpx += `    <name>${label} (${vec.bearing.toFixed(1)}° ${vec.cardinal})</name>\n`;
    gpx += `    <desc>Distance: ${vec.distanceKm.toFixed(1)} km, Bearing: ${vec.bearing.toFixed(1)}°</desc>\n`;
    gpx += `    <rtept lat="${vec.from[0].toFixed(6)}" lon="${vec.from[1].toFixed(6)}">\n`;
    gpx += `      <name>${label} - Start (A)</name>\n`;
    gpx += `    </rtept>\n`;
    gpx += `    <rtept lat="${vec.to[0].toFixed(6)}" lon="${vec.to[1].toFixed(6)}">\n`;
    gpx += `      <name>${label} - Target (B)</name>\n`;
    gpx += `    </rtept>\n`;
    gpx += `  </rte>\n`;
  });

  gpx += `</gpx>`;
  return gpx;
}

/**
 * Exports vectors to KML 2.2 format for Google Earth
 */
export function exportToKML(vectors: MapVector[], includeGeodesic = true): string {
  let kml = `<?xml version="1.0" encoding="UTF-8"?>\n`;
  kml += `<kml xmlns="http://www.opengis.net/kml/2.2">\n`;
  kml += `  <Document>\n    <name>Coordy Vectors</name>\n`;

  vectors.forEach((vec, idx) => {
    const label = vec.label || `Vector #${idx + 1}`;
    const pts = includeGeodesic
      ? interpolateGreatCircle(vec.from, vec.to, 24)
      : [vec.from, vec.to];
    const coordsStr = pts.map(([lat, lon]) => `${lon.toFixed(6)},${lat.toFixed(6)},0`).join(' ');

    kml += `    <Placemark>\n`;
    kml += `      <name>${label} (${vec.bearing.toFixed(1)}° ${vec.cardinal})</name>\n`;
    kml += `      <description>Bearing: ${vec.bearing.toFixed(2)}°, Distance: ${vec.distanceKm.toFixed(2)} km</description>\n`;
    kml += `      <LineString>\n`;
    kml += `        <tessellate>1</tessellate>\n`;
    kml += `        <coordinates>${coordsStr}</coordinates>\n`;
    kml += `      </LineString>\n`;
    kml += `    </Placemark>\n`;
  });

  kml += `  </Document>\n</kml>`;
  return kml;
}

/**
 * Exports vectors to CSV format
 */
export function exportToCSV(vectors: MapVector[]): string {
  const headers = [
    'Index',
    'Label',
    'From_Lat',
    'From_Lon',
    'To_Lat',
    'To_Lon',
    'Bearing_Deg',
    'Cardinal',
    'Distance_km',
    'Distance_mi',
    'Distance_nm',
  ];

  const rows = vectors.map((v, idx) => [
    idx + 1,
    `"${(v.label || `Vector #${idx + 1}`).replace(/"/g, '""')}"`,
    v.from[0].toFixed(6),
    v.from[1].toFixed(6),
    v.to[0].toFixed(6),
    v.to[1].toFixed(6),
    v.bearing.toFixed(2),
    v.cardinal,
    v.distanceKm.toFixed(2),
    (v.distanceKm * 0.621371).toFixed(2),
    (v.distanceKm / 1.852).toFixed(2),
  ]);

  return [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
}

/**
 * Imports vectors from GeoJSON string
 */
export function importFromGeoJSON(jsonStr: string): MapVector[] {
  const parsed = JSON.parse(jsonStr);
  const features = parsed.type === 'FeatureCollection' ? parsed.features : [parsed];
  const vectors: MapVector[] = [];

  features.forEach((feat: { geometry?: { type: string; coordinates: unknown[] }; properties?: { label?: string } }, i: number) => {
    if (!feat.geometry) return;
    const geom = feat.geometry;
    let from: [number, number] | null = null;
    let to: [number, number] | null = null;

    if (geom.type === 'LineString' && Array.isArray(geom.coordinates) && geom.coordinates.length >= 2) {
      const first = geom.coordinates[0] as [number, number];
      const last = geom.coordinates[geom.coordinates.length - 1] as [number, number];
      // GeoJSON is [lon, lat]
      from = [first[1], first[0]];
      to = [last[1], last[0]];
    }

    if (from && to && !isNaN(from[0]) && !isNaN(to[0])) {
      const calc = calculateGeographicBearing(
        { lat: from[0], lon: from[1] },
        { lat: to[0], lon: to[1] }
      );
      vectors.push({
        id: `import_geojson_${Date.now()}_${i}`,
        label: feat.properties?.label,
        from,
        to,
        bearing: calc.bearing,
        cardinal: calc.cardinal,
        distanceKm: calc.distanceKm || 0,
      });
    }
  });

  return vectors;
}

/**
 * Imports vectors from CSV string
 */
export function importFromCSV(csvStr: string): MapVector[] {
  const lines = csvStr.trim().split(/\r?\n/).filter(Boolean);
  if (lines.length < 2) return [];

  const headers = lines[0].toLowerCase().split(',').map((h) => h.trim().replace(/^"|"$/g, ''));
  const fromLatIdx = headers.findIndex((h) => h.includes('from_lat') || h === 'lat1');
  const fromLonIdx = headers.findIndex((h) => h.includes('from_lon') || h === 'lon1' || h === 'lng1');
  const toLatIdx = headers.findIndex((h) => h.includes('to_lat') || h === 'lat2');
  const toLonIdx = headers.findIndex((h) => h.includes('to_lon') || h === 'lon2' || h === 'lng2');
  const labelIdx = headers.findIndex((h) => h.includes('label') || h.includes('name'));

  const vectors: MapVector[] = [];

  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].split(',').map((c) => c.trim().replace(/^"|"$/g, ''));
    let fromLat = NaN, fromLon = NaN, toLat = NaN, toLon = NaN;

    if (fromLatIdx >= 0 && fromLonIdx >= 0 && toLatIdx >= 0 && toLonIdx >= 0) {
      fromLat = parseFloat(cols[fromLatIdx]);
      fromLon = parseFloat(cols[fromLonIdx]);
      toLat = parseFloat(cols[toLatIdx]);
      toLon = parseFloat(cols[toLonIdx]);
    } else if (cols.length >= 4) {
      // Fallback first 4 columns
      fromLat = parseFloat(cols[0]);
      fromLon = parseFloat(cols[1]);
      toLat = parseFloat(cols[2]);
      toLon = parseFloat(cols[3]);
    }

    if (!isNaN(fromLat) && !isNaN(fromLon) && !isNaN(toLat) && !isNaN(toLon)) {
      const calc = calculateGeographicBearing(
        { lat: fromLat, lon: fromLon },
        { lat: toLat, lon: toLon }
      );
      vectors.push({
        id: `import_csv_${Date.now()}_${i}`,
        label: labelIdx >= 0 ? cols[labelIdx] : undefined,
        from: [fromLat, fromLon],
        to: [toLat, toLon],
        bearing: calc.bearing,
        cardinal: calc.cardinal,
        distanceKm: calc.distanceKm || 0,
      });
    }
  }

  return vectors;
}

/**
 * Triggers a file download in the browser
 */
export function downloadFile(content: string, filename: string, mimeType: string) {
  if (typeof window === 'undefined') return;
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
