import {
  calculateGeographicBearing,
  calculateRhumbBearing,
  calculatePlanarBearing,
  calculateDestinationPoint,
  interpolateGreatCircle,
  formatDistance,
} from './src/lib/bearing';
import {
  parseCoordinateString,
  validateGeographicBounds,
  decodePlusCode,
} from './src/lib/coordinates';
import {
  calculateMagneticDeclination,
  trueToMagnetic,
  magneticToTrue,
} from './src/lib/magnetic';
import {
  encodeMapStateToHash,
  decodeMapStateFromHash,
} from './src/lib/codec';
import {
  exportToGeoJSON,
  exportToGPX,
  exportToKML,
  exportToCSV,
  importFromGeoJSON,
  importFromCSV,
} from './src/lib/geoio';
import type { MapVector } from './src/components/MapComponent';

function assertApprox(val: number, expected: number, eps = 0.5, msg = '') {
  if (Math.abs(val - expected) > eps) {
    throw new Error(`FAIL: ${msg} - expected ${expected}, got ${val}`);
  }
  console.log(`✓ ${msg}: ${val.toFixed(2)} (expected ~${expected})`);
}

function assertEqual<T>(actual: T, expected: T, msg = '') {
  if (actual !== expected) {
    throw new Error(`FAIL: ${msg} - expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
  console.log(`✓ ${msg}`);
}

console.log('--- 1. PLANAR 2D BEARINGS (compass.py) ---');
const nPlanar = calculatePlanarBearing({ lat: 0, lon: 0 }, { lat: 10, lon: 0 });
assertApprox(nPlanar.bearing, 0, 0.01, 'Due North Planar');
assertEqual(nPlanar.cardinal, 'N', 'Due North Cardinal');

const ePlanar = calculatePlanarBearing({ lat: 0, lon: 0 }, { lat: 0, lon: 10 });
assertApprox(ePlanar.bearing, 90, 0.01, 'Due East Planar');

const sPlanar = calculatePlanarBearing({ lat: 0, lon: 0 }, { lat: -10, lon: 0 });
assertApprox(sPlanar.bearing, 180, 0.01, 'Due South Planar');

const wPlanar = calculatePlanarBearing({ lat: 0, lon: 0 }, { lat: 0, lon: -10 });
assertApprox(wPlanar.bearing, 270, 0.01, 'Due West Planar');

console.log('\n--- 2. GREAT-CIRCLE (GEOGRAPHIC) BEARINGS & DISTANCE ---');
// Austin (30.2672, -97.7431) to Dallas (32.7767, -96.7970)
const austin = { lat: 30.2672, lon: -97.7431 };
const dallas = { lat: 32.7767, lon: -96.7970 };
const geo = calculateGeographicBearing(austin, dallas);
assertApprox(geo.bearing, 17.57, 0.2, 'Austin to Dallas Initial Bearing');
assertApprox(geo.backBearing, 198.07, 0.2, 'Austin to Dallas True Reverse Bearing');
assertApprox(geo.finalBearing || 0, 18.07, 0.2, 'Austin to Dallas Arrival Final Bearing');
assertApprox(geo.distanceKm || 0, 293.1, 1.0, 'Austin to Dallas Great-Circle Distance (km)');
assertEqual(geo.cardinal, 'NNE', 'Austin to Dallas Cardinal');

console.log('\n--- 3. RHUMB LINE (LOXODROME) ---');
const rhumb = calculateRhumbBearing(austin, dallas);
assertApprox(rhumb.bearing, 17.81, 0.2, 'Austin to Dallas Rhumb Bearing');
assertApprox(rhumb.backBearing, 197.81, 0.2, 'Austin to Dallas Rhumb Back Bearing');
assertEqual(rhumb.bearing, rhumb.finalBearing, 'Rhumb Line Final Bearing equals Initial');

console.log('\n--- 4. FORWARD DESTINATION POINT PROJECTION ---');
const dest = calculateDestinationPoint(austin, geo.bearing, geo.distanceKm || 0, 'geographic');
assertApprox(dest.lat, dallas.lat, 0.01, 'Forward Projected Dallas Lat');
assertApprox(dest.lon, dallas.lon, 0.01, 'Forward Projected Dallas Lon');

console.log('\n--- 5. SLERP GREAT-CIRCLE INTERPOLATION ---');
const arc = interpolateGreatCircle([austin.lat, austin.lon], [dallas.lat, dallas.lon], 16);
assertEqual(arc.length, 17, 'Interpolated 16 segments yield 17 points');
assertApprox(arc[0][0], austin.lat, 0.001, 'Arc start lat');
assertApprox(arc[16][0], dallas.lat, 0.001, 'Arc end lat');

console.log('\n--- 6. COORDINATE PARSER & VALIDATOR ---');
const dmsParsed = parseCoordinateString('30° 16\' 1.9" N, 97° 44\' 35.2" W');
assertApprox(dmsParsed?.lat || 0, 30.2672, 0.001, 'Parsed DMS Latitude');
assertApprox(dmsParsed?.lon || 0, -97.7431, 0.001, 'Parsed DMS Longitude');
assertEqual(dmsParsed?.format, 'DMS', 'DMS Format detection');

const dmParsed = parseCoordinateString('30° 16.032\' N, 97° 44.586\' W');
assertApprox(dmParsed?.lat || 0, 30.2672, 0.001, 'Parsed DM Latitude');
assertApprox(dmParsed?.lon || 0, -97.7431, 0.001, 'Parsed DM Longitude');

const plusCodeDecoded = decodePlusCode('86247784+Vp');
assertApprox(plusCodeDecoded?.lat || 0, 30.2671, 0.01, 'Decoded Plus Code Lat');
assertApprox(plusCodeDecoded?.lon || 0, -97.7432, 0.01, 'Decoded Plus Code Lon');

const validBounds = validateGeographicBounds(30.2672, -97.7431);
assertEqual(validBounds.valid, true, 'Valid bounds check');

const invalidLat = validateGeographicBounds(95.0, 10.0);
assertEqual(invalidLat.valid, false, 'Invalid latitude > 90 bounds check');

const invalidLon = validateGeographicBounds(10.0, 195.0);
assertEqual(invalidLon.valid, false, 'Invalid longitude > 180 bounds check');

console.log('\n--- 7. MAGNETIC DECLINATION (WMM) ---');
const austinDec = calculateMagneticDeclination(30.2672, -97.7431);
assertApprox(austinDec, 4.3, 1.0, 'Austin Magnetic Declination (~ +4.3° E)');

const magBearing = trueToMagnetic(geo.bearing, austinDec);
const backTrue = magneticToTrue(magBearing, austinDec);
assertApprox(backTrue, geo.bearing, 0.001, 'True -> Magnetic -> True round-trip');

console.log('\n--- 8. DISTANCE FORMATTING ---');
assertEqual(formatDistance(450), '450 m', 'Format < 1km auto');
assertEqual(formatDistance(15200), '15.2 km', 'Format > 1km auto');
assertEqual(formatDistance(1852, 'nautical'), '1.00 nm', 'Format nautical miles');

console.log('\n--- 9. URL HASH CODEC ROUND-TRIP ---');
const testVectors: MapVector[] = [
  {
    id: 'v1',
    label: 'Test Leg 1',
    from: [30.2672, -97.7431],
    to: [32.7767, -96.7970],
    bearing: 17.57,
    cardinal: 'NNE',
    distanceKm: 293.1,
  },
];
const viewState = { center: [31.5, -97.2] as [number, number], zoom: 7.5 };
const hash = encodeMapStateToHash(testVectors, viewState, 'geographic', 'dark');
const decoded = decodeMapStateFromHash(hash);
assertEqual(decoded.vectors.length, 1, 'Decoded 1 vector');
assertApprox(decoded.vectors[0].from[0], 30.2672, 0.001, 'Decoded vector from lat');
assertApprox(decoded.vectors[0].to[0], 32.7767, 0.001, 'Decoded vector to lat');
assertEqual(decoded.vectors[0].label, 'Test Leg 1', 'Decoded vector label');
assertApprox(decoded.viewState?.zoom || 0, 7.5, 0.1, 'Decoded zoom');
assertEqual(decoded.basemap, 'dark', 'Decoded basemap');

console.log('\n--- 10. GEOJSON & CSV EXPORT / IMPORT ROUND-TRIP ---');
const geoJsonStr = exportToGeoJSON(testVectors);
const importedGeoJson = importFromGeoJSON(geoJsonStr);
assertEqual(importedGeoJson.length, 1, 'GeoJSON import vector count');
assertApprox(importedGeoJson[0].bearing, 17.57, 0.5, 'GeoJSON imported bearing');

const csvStr = exportToCSV(testVectors);
const importedCsv = importFromCSV(csvStr);
assertEqual(importedCsv.length, 1, 'CSV import vector count');
assertApprox(importedCsv[0].from[0], 30.2672, 0.001, 'CSV imported from lat');

const gpxStr = exportToGPX(testVectors);
assertEqual(gpxStr.includes('<rtept lat="30.267200"'), true, 'GPX contains route points');

const kmlStr = exportToKML(testVectors);
assertEqual(kmlStr.includes('<Placemark>'), true, 'KML contains placemarks');

console.log('\n🎉 ALL 10 TEST SUITES PASSED SUCCESSFULLY!');
